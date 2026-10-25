// Sesiones de pareja 💬
// Un rato para hablar de nosotros con Claude como moderador: cada uno escribe desde su teléfono y Claude contesta en
// la misma conversación. Al terminar, Claude deja un resumen (con el acuerdo y el ejercicio de la semana) que queda
// guardado para los dos y que vuelve a leer en la sesión siguiente.
// Las sesiones viven en las tablas sesiones y sesion_mensajes (funciones sesion_* de schema.sql). Lo de Claude lo
// escribe la función de Supabase `sesion`, que guarda la llave de Anthropic: nunca llega al teléfono.
// app.js deja lo que hace falta en window.nosotros y avisa con "nosotros:dentro".
(() => {
  "use strict";
  const PEDIR_TRAS = 15000;     // si Claude no contestó en este rato, aparece "Pedirle a Claude que responda"
  const ESPERA_VISUAL = 9000;   // "Claude está escribiendo…" mientras la función toma el turno (espera 2,5 s antes)
  const PENSANDO_MAX = 120000;  // igual que sesion_tomar_turno: un "pensando" más viejo quedó colgado
  const pedidaAlAbrir = location.hash === "#sesion"; // tocaron la notificación con la app cerrada
  // Lo que puede contestar la función `sesion` cuando algo sale mal
  const MOTIVOS = {
    falta_llave: "Falta conectar a Claude: hay que poner la llave de Anthropic en Supabase (mira el README).",
    llave_invalida: "La llave de Claude no funciona. Revísala en Supabase.",
    sin_saldo: "Se acabó el saldo de Claude. Recárgalo en console.anthropic.com 💛",
    tope: "Claude ya conversó mucho por hoy. Sigan mañana 💛",
    ocupado: "Claude está con mucha gente en este momento. Intenten en un ratito.",
    rechazo: "Claude prefirió no responder a eso. Prueben decirlo de otra forma.",
    vacia: "Todavía ninguno de los dos escribió en esta sesión.",
  };
  const ICONOS = {
    atras: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    enviar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5 3.5 10.2l6.7 2.6 2.6 6.7 7.7-16Z"/><path d="m10.2 12.8 4.7-4.7"/></svg>',
    charla: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 4.5h10a2 2 0 0 1 2 2V12a2 2 0 0 1-2 2H9l-3.5 3v-3h-1a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z"/><path d="M16.5 8.5h3a2 2 0 0 1 2 2V16a2 2 0 0 1-2 2h-1v3L15 18h-4a2 2 0 0 1-1.9-1.4"/><path d="M9.5 11.4c-1.3-.9-2.1-1.7-2.1-2.6a1 1 0 0 1 2.1-.4 1 1 0 0 1 2.1.4c0 .9-.8 1.7-2.1 2.6Z"/></svg>',
    pluma: '<svg class="ico" aria-hidden="true"><use href="#i-lapiz"/></svg>',
    candado: '<svg class="ico" aria-hidden="true"><use href="#i-candado"/></svg>',
  };

  let X = null, el = null, canal = null, vivo = null, desfase = 0, yaLlevo = false;
  let sesiones = [];          // las últimas, de la más nueva a la más vieja
  let mirando = null;         // la sesión que está abierta en pantalla
  let mensajes = [];          // los de esa sesión
  let verCharla = false;      // en una sesión cerrada: mostrar también lo que hablaron
  let suyo = { sesion: null, escribe: false }; // mi pareja: en qué sesión está mirando y si está escribiendo
  let yoEscribo = false, escribeTimer = null, pedirTimer = null, esperaTimer = null;
  let esperandoDesde = 0, enviando = false, volverA = null, pegadoAbajo = true;

  // ---------- utilidades ----------
  const nodo = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const boton = (txt, cls) => { const b = nodo("button", cls, txt); b.type = "button"; return b; };
  const poner = (e, txt) => { if (e.textContent !== txt) e.textContent = txt; };
  const ms = (iso) => (iso ? new Date(iso).getTime() : 0);
  const ahora = () => Date.now() + desfase;
  const yo = () => X.user.id;
  const nom = () => (X.otro && X.otro.nombre) || "tu pareja";
  const quien = (id) => (id === null ? "Claude" : id === yo() ? "Tú" : nom());
  const abierta = () => sesiones.find((s) => s.estado !== "cerrada") || null;
  const cerradas = () => sesiones.filter((s) => s.estado === "cerrada");
  const proximoNumero = () => sesiones.reduce((n, s) => Math.max(n, s.numero), 0) + 1;
  const pensandoAhora = (s) => !!s && !!s.pensando_desde && ahora() - ms(s.pensando_desde) < PENSANDO_MAX;
  const fecha = (iso) => X.fechaCorta(iso, X.miTz());
  const dia = (m) => fecha(m.creado_en);
  // Las sesiones en las que ya entré (para decir "Martina abrió una sesión" solo la primera vez)
  function leerVistas() { try { return JSON.parse(localStorage.getItem("sesiones-vistas")) || []; } catch (e) { return []; } }
  function anotarVista(id) {
    const v = leerVistas(); if (v.includes(id)) return;
    try { localStorage.setItem("sesiones-vistas", JSON.stringify([id, ...v].slice(0, 30))); } catch (e) {}
  }
  const yaEntre = (s) => s.creado_por === yo() || leerVistas().includes(s.id);
  // **negrita** de Claude, sin innerHTML: el texto nunca se interpreta como HTML
  function conFormato(destino, texto) {
    texto.split(/\*\*(.+?)\*\*/s).forEach((parte, i) => { if (parte) destino.append(i % 2 ? nodo("b", null, parte) : parte); });
  }

  // ---------- armar la tarjeta, el aviso del Inicio, la conversación y las ventanas ----------
  function montar() {
    if (el) return;
    el = {};
    // tarjeta de Juntos: un sobre de correo aéreo con su estampilla
    const card = document.getElementById("sesion-card");
    if (!card) return void (el = null);
    card.innerHTML = `
      <div class="sc-sobre">
        <div class="sc-estampilla" aria-hidden="true">${ICONOS.charla}<b class="sc-num"></b></div>
        <p class="eyebrow">Hablar de nosotros</p>
        <h2 id="sesion-titulo" class="sc-titulo"></h2>
        <p class="small-note sc-sub"></p>
        <p class="sc-presencia" hidden></p>
        <div class="sc-nota" hidden><p class="sn-titulo">Para esta semana</p><p class="sn-ejercicio"></p><p class="sn-acuerdo"><b>Acordamos:</b> <span></span></p></div>
        <div class="sc-botones"><button type="button" class="sc-empezar"></button><button type="button" class="link sc-anteriores"></button></div>
      </div>`;
    const q = (s) => card.querySelector(s);
    Object.assign(el, {
      card, num: q(".sc-num"), cTitulo: q(".sc-titulo"), cSub: q(".sc-sub"), cAqui: q(".sc-presencia"),
      nota: q(".sc-nota"), nEjercicio: q(".sn-ejercicio"), nAcuerdo: q(".sn-acuerdo"), empezar: q(".sc-empezar"), anteriores: q(".sc-anteriores"),
    });
    el.empezar.addEventListener("click", () => { const a = abierta(); if (a) abrirVista(a.id); else empezar(el.empezar); });
    el.anteriores.addEventListener("click", abrirHistorial);

    // aviso del Inicio, solo mientras hay una sesión abierta
    const av = nodo("section", "sesion-aviso"); av.id = "sesion-aviso"; av.hidden = true; av.setAttribute("aria-labelledby", "sa-titulo");
    av.innerHTML = `<span class="sa-ico" aria-hidden="true">${ICONOS.charla}</span><p><b id="sa-titulo"></b><small></small></p><button type="button"></button>`;
    el.aviso = av; el.aTitulo = av.querySelector("b"); el.aSub = av.querySelector("small"); el.aBoton = av.querySelector("button");
    el.aBoton.addEventListener("click", () => { const a = abierta(); if (a) { X.irA("juntos"); abrirVista(a.id); } });
    const ancla = document.getElementById("foco-card") || document.getElementById("noche-card") || document.getElementById("libre-status");
    if (ancla) ancla.after(av); else document.getElementById("tab-inicio").append(av);

    montarVista();
    montarDialogos();
  }

  function montarVista() {
    const v = nodo("div", "sv"); v.id = "sesion-vista"; v.hidden = true;
    v.setAttribute("role", "dialog"); v.setAttribute("aria-modal", "true"); v.setAttribute("aria-labelledby", "sv-titulo");
    v.innerHTML = `
      <header class="sv-cab">
        <button type="button" class="sv-atras" aria-label="Volver">${ICONOS.atras}</button>
        <div class="sv-titulos"><h2 class="sv-titulo" id="sv-titulo"></h2><p class="sv-estado"></p></div>
        <button type="button" class="ghost sv-terminar">Terminar</button>
      </header>
      <ol class="sv-lista" role="log" aria-live="polite" aria-label="Conversación"></ol>
      <footer class="sv-pie">
        <button type="button" class="ghost sv-pedir" hidden>Pedirle a Claude que responda</button>
        <p class="sv-resumiendo" hidden><span class="sv-puntos" aria-hidden="true"><i></i><i></i><i></i></span>Claude está escribiendo su resumen…</p>
        <form class="sv-escribir">
          <label class="sr" for="sv-texto">Tu mensaje</label>
          <textarea id="sv-texto" rows="1" maxlength="4000" placeholder="Escribe lo que sientes…" autocomplete="off"></textarea>
          <button type="submit" class="sv-enviar" aria-label="Enviar" disabled>${ICONOS.enviar}</button>
        </form>
      </footer>
      <p class="sr sv-anuncio" aria-live="assertive"></p>`;
    document.body.append(v);
    const q = (s) => v.querySelector(s);
    Object.assign(el, {
      v, atras: q(".sv-atras"), titulo: q(".sv-titulo"), estado: q(".sv-estado"), terminar: q(".sv-terminar"),
      lista: q(".sv-lista"), pie: q(".sv-pie"), pedir: q(".sv-pedir"), resumiendo: q(".sv-resumiendo"),
      form: q(".sv-escribir"), texto: q("#sv-texto"), enviar: q(".sv-enviar"), anuncio: q(".sv-anuncio"),
    });
    // "escribiendo…" de Claude y de mi pareja: siempre al final de la conversación
    const escribe = (cls, nombre) => {
      const li = nodo("li", `sv-m ${cls} sv-escribe`); li.hidden = true;
      const n = nodo("p", "sv-quien"); if (cls === "claude") n.innerHTML = ICONOS.pluma; n.append(nombre);
      const b = nodo("div", "sv-burbuja"); b.innerHTML = '<span class="sv-puntos" aria-hidden="true"><i></i><i></i><i></i></span>';
      b.append(nodo("span", "sr", `${nombre} está escribiendo`));
      li.append(n, b); return li;
    };
    el.escribeClaude = escribe("claude", "Claude");
    el.escribeSuyo = escribe("suyo", "");

    el.atras.addEventListener("click", cerrarVista);
    el.terminar.addEventListener("click", abrirFin);
    el.pedir.addEventListener("click", pedirAClaude);
    el.form.addEventListener("submit", enviar);
    el.texto.addEventListener("input", () => {
      ajustarAlto(); el.enviar.disabled = enviando || !el.texto.value.trim();
      if (el.texto.value.trim()) escribiendo(); else dejarDeEscribir();
    });
    // en el computador, Enter envía (Shift+Enter, otra línea); en el teléfono Enter es otra línea
    el.texto.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(hover: hover) and (pointer: fine)").matches) {
        e.preventDefault(); el.form.requestSubmit();
      }
    });
    el.lista.addEventListener("scroll", () => { pegadoAbajo = abajo(); }, { passive: true });
    v.addEventListener("keydown", (e) => { if (e.key === "Escape" && !document.querySelector("dialog[open]")) cerrarVista(); });
  }

  function montarDialogos() {
    const d = nodo("dialog", "dlg dlg-sesion-fin"); d.id = "dlg-sesion-fin"; d.setAttribute("aria-labelledby", "sf-titulo");
    d.innerHTML = `
      <div class="stack">
        <h2 id="sf-titulo"></h2>
        <p class="small-note sf-texto"></p>
        <p class="mano sf-recuerdo">Antes de cerrar: ¿ya se dijeron algo que valoraron del otro hoy? 💛</p>
        <button type="button" class="sf-ok"></button>
        <button type="button" class="link sf-no">Seguir hablando</button>
      </div>`;
    document.body.append(d);
    Object.assign(el, { fin: d, fTitulo: d.querySelector("#sf-titulo"), fTexto: d.querySelector(".sf-texto"), fRecuerdo: d.querySelector(".sf-recuerdo"), fOk: d.querySelector(".sf-ok") });
    d.querySelector(".sf-no").addEventListener("click", () => d.close());
    el.fOk.addEventListener("click", terminar);

    const h = nodo("dialog", "dlg dlg-sesiones"); h.id = "dlg-sesiones"; h.setAttribute("aria-labelledby", "sh-titulo");
    h.innerHTML = `
      <div class="stack">
        <h2 id="sh-titulo">Nuestras sesiones</h2>
        <p class="small-note">Cada una con su resumen y lo que acordaron. Lo que se dijo aquí es para entendernos, no para ganar una discusión 💛</p>
        <ul class="sv-hist"></ul>
        <button type="button" class="link sh-cerrar">Cerrar</button>
      </div>`;
    document.body.append(h);
    el.hist = h; el.histLista = h.querySelector(".sv-hist");
    h.querySelector(".sh-cerrar").addEventListener("click", () => h.close());
  }

  // ---------- pintar ----------
  function pintarCard() {
    if (!el) return;
    const a = abierta(), c = cerradas(), ult = c[0] || null, q = nom();
    el.card.hidden = false;
    poner(el.num, `N° ${a ? a.numero : proximoNumero()}`);
    let titulo, sub, accion;
    if (!a) {
      titulo = "Un rato para escucharnos";
      sub = ult ? `La última fue el ${fecha(ult.cerrada_en || ult.creado_en)}${ult.tema ? `: ${ult.tema}` : ""}.`
        : "Claude los acompaña como moderador: cada uno escribe desde su teléfono y al final queda un resumen para los dos.";
      accion = c.length ? "Empezar una sesión" : "Empezar nuestra primera sesión";
    } else if (a.estado === "resumiendo") {
      titulo = "Claude está escribiendo su resumen…"; sub = `Sesión ${a.numero}`; accion = "Ver";
    } else if (!yaEntre(a)) {
      titulo = `${q} abrió una sesión para hablar`; sub = `${X.ago(a.creado_en)} · Claude los acompaña`; accion = "Entrar";
    } else {
      titulo = `Sesión ${a.numero} en curso`;
      sub = `${a.creado_por === yo() ? "La abriste" : `La abrió ${q}`} ${X.ago(a.creado_en)}`; accion = "Volver a la sesión";
    }
    poner(el.cTitulo, titulo); poner(el.cSub, sub); poner(el.empezar, accion);
    el.cAqui.hidden = !(a && suyo.sesion === a.id);
    poner(el.cAqui, `${q} está adentro ahora`);
    // la notita de la semana: lo que quedó de la última sesión
    const hay = !a && ult && (ult.ejercicio || ult.acuerdo);
    el.nota.hidden = !hay;
    if (hay) {
      poner(el.nEjercicio, ult.ejercicio || ""); el.nEjercicio.hidden = !ult.ejercicio;
      poner(el.nAcuerdo.querySelector("span"), ult.acuerdo || ""); el.nAcuerdo.hidden = !ult.acuerdo;
    }
    el.anteriores.hidden = !c.length;
    poner(el.anteriores, c.length === 1 ? "Ver la sesión anterior" : `Sesiones anteriores (${c.length})`);
  }

  function pintarAviso() {
    if (!el) return;
    const a = abierta();
    el.aviso.hidden = !a;
    if (!a) return;
    const q = nom(), nueva = !yaEntre(a);
    poner(el.aTitulo, a.estado === "resumiendo" ? "Claude está escribiendo su resumen" : nueva ? `${q} abrió una sesión para hablar` : `Su sesión ${a.numero} sigue abierta`);
    poner(el.aSub, suyo.sesion === a.id ? `${q} está adentro ahora` : "Claude los acompaña");
    poner(el.aBoton, nueva ? "Entrar" : "Volver");
    el.aviso.classList.toggle("nueva", nueva);
  }

  function pintarVista() {
    if (!el || el.v.hidden || !mirando) return;
    const s = mirando, aqui = s.estado === "abierta" && suyo.sesion === s.id;
    poner(el.titulo, `Sesión ${s.numero}`);
    poner(el.estado, s.estado === "cerrada" ? `Cerrada el ${fecha(s.cerrada_en || s.creado_en)}`
      : s.estado === "resumiendo" ? "Claude está escribiendo el resumen…"
      : aqui ? `${nom()} está aquí` : "con Claude de moderador");
    el.estado.classList.toggle("aqui", aqui);
    el.terminar.hidden = s.estado !== "abierta";
    el.pie.hidden = s.estado === "cerrada";
    el.form.hidden = s.estado !== "abierta";
    el.resumiendo.hidden = s.estado !== "resumiendo";
    el.v.classList.toggle("cerrada", s.estado === "cerrada");
    pintarEscribiendo(); actualizarPedir();
  }

  // La conversación completa (al abrir, o si cambia algo que no es un mensaje nuevo)
  function pintarLista() {
    const l = el.lista, s = mirando;
    l.textContent = "";
    if (s.estado === "cerrada") {
      if (s.resumen) l.append(liCarta(s));
      const li = nodo("li", "sv-centro");
      const b = boton(verCharla ? "Ocultar lo que hablaron" : `Ver lo que hablaron (${mensajes.length} mensajes)`, "ghost");
      b.addEventListener("click", () => { verCharla = !verCharla; pintarLista(); });
      if (mensajes.length) { li.append(b); l.append(li); }
    } else {
      const li = nodo("li", "sv-intro");
      li.innerHTML = ICONOS.candado;
      li.append(nodo("span", null, "Lo que escriben aquí lo leen solo ustedes dos y Claude. Al terminar, queda un resumen para los dos."));
      l.append(li);
    }
    if (s.estado !== "cerrada" || verCharla) {
      let previo = null;
      for (const m of mensajes) {
        if (!previo || dia(previo) !== dia(m)) l.append(nodo("li", "sv-dia", dia(m)));
        l.append(liMensaje(m, previo)); previo = m;
      }
    }
    poner(el.escribeSuyo.querySelector(".sv-quien"), nom());
    poner(el.escribeSuyo.querySelector(".sr"), `${nom()} está escribiendo`);
    l.append(el.escribeSuyo, el.escribeClaude);
    pintarEscribiendo();
  }

  function liMensaje(m, previo) {
    const tipo = m.autor === null ? "claude" : m.autor === yo() ? "mio" : "suyo";
    const li = nodo("li", `sv-m ${tipo}`); li.dataset.id = m.id;
    const seguido = previo && previo.autor === m.autor && ms(m.creado_en) - ms(previo.creado_en) < 5 * 60e3 && dia(previo) === dia(m);
    if (seguido) li.classList.add("seguido");
    else if (tipo !== "mio") {
      const n = nodo("p", "sv-quien"); n.setAttribute("aria-hidden", "true");
      if (tipo === "claude") n.innerHTML = ICONOS.pluma;
      n.append(quien(m.autor)); li.append(n);
    }
    const b = nodo("div", "sv-burbuja");
    b.append(nodo("span", "sr", `${quien(m.autor)}: `));
    conFormato(b, m.texto);
    const t = nodo("time", null, X.hora(m.creado_en, X.miTz())); t.dateTime = m.creado_en;
    b.append(t); li.append(b);
    return li;
  }

  // El resumen llega como carta: su acuerdo con borde de sello y el ejercicio en una notita
  function liCarta(s) {
    const r = s.resumen || {}, li = nodo("li", "sv-carta-li"), c = nodo("article", "sv-carta");
    c.setAttribute("aria-labelledby", `sv-c-${s.numero}`);
    const h = nodo("h3", null, r.tema || s.tema || "Nuestra sesión"); h.id = `sv-c-${s.numero}`;
    c.append(nodo("p", "eyebrow", `Sesión ${s.numero} · ${fecha(s.cerrada_en || s.creado_en)}`), h);
    const seccion = (titulo, texto) => {
      if (!texto || !texto.trim()) return;
      const d = nodo("section", "sv-c-sec"); d.append(nodo("p", "sv-c-et", titulo), nodo("p", null, texto.trim())); c.append(d);
    };
    seccion("Cómo llegamos", r.llegada);
    const personas = (r.personas || []).filter((p) => p && p.siente_y_necesita);
    if (personas.length) {
      const d = nodo("section", "sv-c-sec"), g = nodo("div", "sv-c-personas");
      const mio = ((X.perfil && X.perfil.nombre) || "").trim().toLowerCase();
      personas.forEach((p) => {
        const caja = nodo("div", "sv-c-persona" + ((p.nombre || "").trim().toLowerCase() === mio ? " mia" : ""));
        caja.append(nodo("b", null, p.nombre || ""), nodo("p", null, p.siente_y_necesita));
        g.append(caja);
      });
      d.append(nodo("p", "sv-c-et", "Lo que sentimos y necesitamos"), g); c.append(d);
    }
    seccion("Lo que entendimos el uno del otro", r.entendimos);
    seccion("Lo que nos valoramos hoy", r.valoramos);
    const acuerdo = s.acuerdo || r.acuerdo, ejercicio = s.ejercicio || r.ejercicio;
    if (acuerdo) {
      const d = nodo("section", "sv-c-acuerdo"); d.append(nodo("p", "sv-c-et", "Nuestro acuerdo"), nodo("p", null, acuerdo)); c.append(d);
    }
    if (ejercicio) {
      const d = nodo("section", "sc-nota sv-c-ejercicio"); d.append(nodo("p", "sn-titulo", "Para esta semana"), nodo("p", null, ejercicio)); c.append(d);
    }
    if (r.pendiente && r.pendiente.trim()) c.append(nodo("p", "sv-c-pendiente", `Queda para la próxima: ${r.pendiente.trim()}`));
    const firma = nodo("p", "sv-c-firma"); firma.innerHTML = ICONOS.pluma; firma.append("Claude"); c.append(firma);
    li.append(c);
    return li;
  }

  function pintarEscribiendo() {
    if (!el || !mirando) return;
    const viva = mirando.estado === "abierta";
    const claude = viva && (pensandoAhora(mirando) || (!!esperandoDesde && Date.now() - esperandoDesde < ESPERA_VISUAL));
    const otroEscribe = viva && suyo.sesion === mirando.id && suyo.escribe;
    const cambia = el.escribeClaude.hidden === claude || el.escribeSuyo.hidden === otroEscribe;
    el.escribeClaude.hidden = !claude; el.escribeSuyo.hidden = !otroEscribe;
    if (cambia && (claude || otroEscribe) && pegadoAbajo) bajar();
  }
  // "Pedirle a Claude": si lo último lo escribió uno de los dos y Claude no contestó en un rato (se quedó callado o falló)
  function actualizarPedir() {
    clearTimeout(pedirTimer);
    if (!el || !mirando) return;
    const ult = mensajes[mensajes.length - 1];
    let ver = false;
    if (mirando.estado === "abierta" && ult && ult.autor !== null && !pensandoAhora(mirando)) {
      const falta = PEDIR_TRAS - (ahora() - ms(ult.creado_en));
      if (falta <= 0) ver = true; else pedirTimer = setTimeout(actualizarPedir, falta + 100);
    }
    if (el.pedir.hidden === !ver) return;
    el.pedir.hidden = !ver;
    if (ver && pegadoAbajo) bajar(); // el botón achica la conversación: que no tape lo último
  }

  const abajo = () => el.lista.scrollHeight - el.lista.scrollTop - el.lista.clientHeight < 140;
  function bajar(suave = true) {
    requestAnimationFrame(() => {
      el.lista.scrollTo({ top: el.lista.scrollHeight, behavior: suave && !X.pocoMovimiento() ? "smooth" : "auto" });
      pegadoAbajo = true;
    });
  }
  function ajustarAlto() {
    const t = el.texto; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight + 2, 148) + "px";
  }
  // El teclado del iPhone tapa la parte de abajo: la conversación se achica a lo que queda a la vista
  function ajustarVentana() {
    const vv = window.visualViewport;
    if (!vv || !el || el.v.hidden) return;
    el.v.classList.add("vv");
    el.v.style.setProperty("--sv-alto", `${vv.height}px`);
    el.v.style.setProperty("--sv-arriba", `${vv.offsetTop}px`);
    if (pegadoAbajo) bajar(false);
  }

  // ---------- abrir y cerrar la conversación ----------
  async function abrirVista(id) {
    const s = sesiones.find((x) => x.id === id);
    if (!s || !el) return;
    const otra = !mirando || mirando.id !== id;
    mirando = s; anotarVista(s.id);
    if (otra) { mensajes = []; verCharla = false; }
    if (el.v.hidden) {
      volverA = document.activeElement;
      el.v.hidden = false; el.v.classList.remove("sale");
      document.body.classList.add("con-sesion");
      // "atrás" (botón o gesto de Android) cierra la conversación en vez de salir de la app
      if (!(history.state && history.state.sesion)) history.pushState({ ...(history.state || {}), sesion: true }, "");
      ajustarVentana();
      el.atras.focus();
    }
    pintarLista(); pintarVista(); pintarCard(); pintarAviso(); marcarPresencia();
    await cargarMensajes(id);
  }
  function cerrarVista() {
    if (history.state && history.state.sesion) history.back(); // → popstate → ocultarVista
    else ocultarVista();
  }
  function ocultarVista() {
    if (!el || el.v.hidden || el.v.classList.contains("sale")) return;
    dejarDeEscribir();
    const fin = () => { el.v.hidden = true; el.v.classList.remove("sale", "vv"); };
    document.body.classList.remove("con-sesion");
    if (X.pocoMovimiento()) fin(); else { el.v.classList.add("sale"); setTimeout(fin, 260); }
    mirando = null; mensajes = []; esperandoDesde = 0;
    clearTimeout(pedirTimer); clearTimeout(esperaTimer);
    marcarPresencia(); pintarCard(); pintarAviso();
    if (volverA && volverA.focus) volverA.focus();
  }
  function irASesion() {
    if (!X || !el) return;
    const s = abierta() || cerradas()[0];
    X.irA("juntos");
    if (s) abrirVista(s.id);
  }

  // ---------- acciones ----------
  // La función `sesion` le pregunta a Claude. Si algo sale mal, contesta un código que aquí se explica.
  async function llamar(accion, id) {
    let codigo = null;
    try {
      const { data, error } = await X.sb.functions.invoke("sesion", { body: { sesion_id: id, accion } });
      if (error) {
        codigo = "claude";
        try { const j = await error.context.json(); codigo = j.error || codigo; } catch (e) {}
      } else if (data && data.error) codigo = data.error;
    } catch (e) { codigo = "claude"; }
    if (codigo) {
      esperandoDesde = 0; if (mirando) { pintarEscribiendo(); actualizarPedir(); }
      X.toast(MOTIVOS[codigo] || "Claude no pudo responder. Intenten de nuevo en un momento.");
    }
    return !codigo;
  }
  function esperarAClaude() {
    esperandoDesde = Date.now(); pintarEscribiendo();
    clearTimeout(esperaTimer); esperaTimer = setTimeout(pintarEscribiendo, ESPERA_VISUAL + 50);
  }

  async function empezar(b) {
    if (b) b.disabled = true;
    const { data, error } = await X.sb.rpc("sesion_abrir");
    if (b) b.disabled = false;
    if (error || !data || !data.id) { X.toast("No se pudo abrir la sesión, intenta otra vez"); return; }
    aplicarSesion(data);
    await abrirVista(data.id);
    // Claude saluda (si mi pareja la abrió antes, ya lo hizo)
    if (data.estado === "abierta" && !mensajes.some((m) => m.autor === null)) {
      esperarAClaude(); llamar("responder", data.id);
    }
    if (data.creado_por === yo() && ahoraRecien(data)) X.toast(`Le avisamos a ${nom()} 💌`);
  }
  const ahoraRecien = (s) => ahora() - ms(s.creado_en) < 30000;

  async function enviar(e) {
    e.preventDefault();
    const t = el.texto.value.trim();
    if (!t || enviando || !mirando || mirando.estado !== "abierta") return;
    const id = mirando.id;
    enviando = true; el.enviar.disabled = true;
    const { data, error } = await X.sb.rpc("sesion_escribir", { p_sesion: id, p_texto: t });
    enviando = false;
    if (error || !data || !data.id) {
      el.enviar.disabled = !el.texto.value.trim();
      X.toast(mirando && mirando.estado !== "abierta" ? "La sesión ya se está cerrando" : "No se pudo enviar. Revisa tu conexión.");
      return;
    }
    el.texto.value = ""; ajustarAlto(); dejarDeEscribir(); el.enviar.disabled = true;
    agregarMensaje(data);
    esperarAClaude();
    llamar("responder", id);
  }

  async function pedirAClaude() {
    if (!mirando) return;
    el.pedir.hidden = true; esperarAClaude();
    await llamar("pedir", mirando.id);
  }

  function abrirFin() {
    if (!mirando || mirando.estado !== "abierta") return;
    const alguien = mensajes.some((m) => m.autor !== null);
    poner(el.fTitulo, alguien ? "¿Terminamos por hoy?" : "¿Descartamos esta sesión?");
    poner(el.fTexto, alguien
      ? "Claude va a escribir el resumen con lo que hablaron, su acuerdo y un ejercicio para la semana. Les queda guardado a los dos."
      : "Todavía ninguno de los dos escribió. Si la abriste sin querer, la descartamos y no queda nada.");
    el.fRecuerdo.hidden = !alguien;
    poner(el.fOk, alguien ? "Terminar y escribir el resumen" : "Descartar la sesión");
    el.fin.showModal();
  }
  async function terminar() {
    el.fin.close();
    if (!mirando) return;
    const s = mirando;
    if (!mensajes.some((m) => m.autor !== null)) {
      const { data } = await X.sb.rpc("sesion_descartar", { p_sesion: s.id });
      if (!data) { X.toast("No se pudo descartar, intenta otra vez"); return; }
      sesiones = sesiones.filter((x) => x.id !== s.id);
      cerrarVista(); pintarCard(); pintarAviso();
      return;
    }
    aplicarSesion({ ...s, estado: "resumiendo" }); // se ve al tiro; lo de verdad llega por tiempo real
    const ok = await llamar("cerrar", s.id);
    await cargar();
    if (!ok && mirando && mirando.id === s.id) pintarLista();
  }

  function abrirHistorial() {
    const l = el.histLista; l.textContent = "";
    cerradas().forEach((s) => {
      const li = nodo("li"), b = boton(null);
      const num = nodo("span", "sh-num"); num.append(nodo("small", null, "N°"), String(s.numero));
      const txt = nodo("span", "sh-txt");
      txt.append(nodo("strong", null, s.tema || `Sesión ${s.numero}`),
        nodo("small", null, fecha(s.cerrada_en || s.creado_en) + (s.acuerdo ? ` · Acordaron: ${s.acuerdo}` : "")));
      b.append(num, txt);
      b.addEventListener("click", () => { el.hist.close(); abrirVista(s.id); });
      li.append(b); l.append(li);
    });
    el.hist.showModal();
  }

  // ---------- escribiendo… (presencia) ----------
  function escribiendo() {
    clearTimeout(escribeTimer); escribeTimer = setTimeout(dejarDeEscribir, 4000);
    if (!yoEscribo) { yoEscribo = true; marcarPresencia(); }
  }
  function dejarDeEscribir() {
    clearTimeout(escribeTimer);
    if (yoEscribo) { yoEscribo = false; marcarPresencia(); }
  }
  function marcarPresencia() {
    if (!vivo) return;
    const viendo = el && !el.v.hidden && mirando && !document.hidden ? mirando.id : null;
    try { Promise.resolve(vivo.track({ sesion: viendo, escribe: !!viendo && yoEscribo })).catch(() => {}); } catch (e) {}
  }

  // ---------- datos ----------
  function aplicarSesion(n) {
    if (!n || !n.id) return;
    const i = sesiones.findIndex((s) => s.id === n.id);
    if (i >= 0) sesiones[i] = n; else sesiones.unshift(n);
    sesiones.sort((a, b) => b.numero - a.numero);
    if (mirando && mirando.id === n.id) cambioLaQueMiro(n);
    pintarCard(); pintarAviso();
  }
  // Lo que cambió en la sesión que está en pantalla (llegue por tiempo real o al recargar)
  function cambioLaQueMiro(n) {
    const antes = mirando;
    mirando = n;
    if (antes.pensando_desde && !n.pensando_desde) esperandoDesde = 0; // Claude terminó (o se quedó callado)
    if (antes.estado !== "cerrada" && n.estado === "cerrada") llegoElResumen();
    else if (antes.estado !== n.estado) pintarLista();
    pintarVista();
  }
  function agregarMensaje(m) {
    if (!mirando || m.sesion_id !== mirando.id || mensajes.some((x) => x.id === m.id)) return;
    const previo = mensajes[mensajes.length - 1];
    mensajes.push(m);
    if (previo && m.id < previo.id) { mensajes.sort((a, b) => a.id - b.id); pintarLista(); return; } // llegó desordenado
    if (m.autor === null) esperandoDesde = 0;
    if (mirando.estado !== "cerrada") {
      const cerca = pegadoAbajo || abajo();
      if (!previo || dia(previo) !== dia(m)) el.lista.insertBefore(nodo("li", "sv-dia", dia(m)), el.escribeSuyo);
      const li = liMensaje(m, previo);
      if (!X.pocoMovimiento()) li.classList.add("nuevo");
      el.lista.insertBefore(li, el.escribeSuyo);
      if (cerca || m.autor === yo()) bajar();
    }
    pintarEscribiendo(); actualizarPedir();
  }
  function llegoElResumen() {
    verCharla = false; pintarLista();
    el.lista.scrollTo({ top: 0 });
    const carta = el.lista.querySelector(".sv-carta");
    if (carta && !X.pocoMovimiento()) carta.classList.add("llega");
    poner(el.anuncio, "Llegó el resumen de la sesión");
    X.lluvia("💌", 10); X.vibrar([60, 60, 120]);
  }

  async function cargar() {
    const { data, error } = await X.sb.from("sesiones").select("*").eq("pareja_id", X.pareja.id)
      .order("numero", { ascending: false }).limit(40);
    if (error) return; // sin red se queda lo que ya se veía
    sesiones = data || [];
    if (mirando) {
      const n = sesiones.find((s) => s.id === mirando.id);
      if (!n) { ocultarVista(); X.toast("Esa sesión se descartó"); }
      else cambioLaQueMiro(n);
    }
    pintarCard(); pintarAviso();
  }
  async function cargarMensajes(id) {
    const { data, error } = await X.sb.from("sesion_mensajes").select("id, sesion_id, autor, texto, creado_en")
      .eq("sesion_id", id).order("id").limit(1000);
    if (error || !mirando || mirando.id !== id) return;
    mensajes = data || [];
    pintarLista(); pintarVista();
    if (mirando.estado === "cerrada") el.lista.scrollTop = 0; else bajar(false);
  }
  async function sincronizarHora() {
    const t0 = Date.now(), { data, error } = await X.sb.rpc("ahora"), t1 = Date.now();
    if (!error && data) desfase = ms(data) + (t1 - t0) / 2 - t1;
  }

  function suscribir() {
    if (canal) X.sb.removeChannel(canal);
    const p = X.pareja.id;
    canal = X.sb.channel(`sesiones-${p}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sesiones", filter: `pareja_id=eq.${p}` },
        (x) => { if (x.eventType === "DELETE") cargar(); else aplicarSesion(x.new); })
      // (los borrados no se pueden filtrar: si se descarta una sesión vacía, se recarga la lista)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "sesiones" }, () => cargar())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sesion_mensajes", filter: `pareja_id=eq.${p}` },
        (x) => { if (x.new && x.new.id) agregarMensaje(x.new); })
      .subscribe();
    if (vivo) X.sb.removeChannel(vivo);
    vivo = X.sb.channel(`sesion-vivo-${p}`, { config: { presence: { key: X.user.id } } })
      .on("presence", { event: "sync" }, () => {
        const st = (X.otro && vivo.presenceState()[X.otro.id]) || [];
        const ahi = st.find((x) => x.sesion) || null;
        suyo = { sesion: ahi ? ahi.sesion : null, escribe: !!(ahi && ahi.escribe) };
        pintarCard(); pintarAviso(); pintarVista();
      })
      .subscribe((estado) => { if (estado === "SUBSCRIBED") marcarPresencia(); });
  }
  const caido = (c) => !c || c.state === "closed" || c.state === "errored";

  function iniciar() {
    X = window.nosotros;
    if (!X || !X.pareja || !X.pareja.usuario_b) return; // sin pareja completa no hay con quién hablar
    montar();
    if (!el) return;
    sincronizarHora();
    suscribir();
    cargar().then(() => { if (pedidaAlAbrir && !yaLlevo) { yaLlevo = true; irASesion(); } });
  }

  // al volver a la app se trae lo último (el tiempo real se duerme con el teléfono)
  document.addEventListener("visibilitychange", () => {
    if (!X || !el) return;
    marcarPresencia();
    if (document.hidden) { dejarDeEscribir(); return; }
    cargar();
    if (mirando) cargarMensajes(mirando.id);
  });
  window.addEventListener("nosotros:aldia", () => {
    if (!X || !el) return;
    if (caido(canal) || caido(vivo)) suscribir();
  });
  window.addEventListener("popstate", () => {
    if (el && !el.v.hidden && !(history.state && history.state.sesion)) ocultarVista();
  });
  if (window.visualViewport) {
    visualViewport.addEventListener("resize", ajustarVentana);
    visualViewport.addEventListener("scroll", ajustarVentana);
  }
  // al tocar una notificación de la sesión con la app ya abierta (app.js lleva a la pestaña; aquí se abre la sesión)
  if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data && typeof e.data.url === "string" && e.data.url.includes("#sesion")) setTimeout(irASesion, 0);
  });

  window.addEventListener("nosotros:dentro", iniciar);
  if (window.nosotros) iniciar();
})();
