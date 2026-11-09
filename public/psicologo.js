// Tu espacio 🌿
// Un psicólogo personal con Claude, en sesiones individuales. Solo aparece en la cuenta que lo tiene
// (psico_permitidos en supabase/psicologo.sql; hoy, Fernando): en cualquier otra cuenta este archivo no arma nada.
// Lo que se escribe aquí lo lee solo esa persona (y Claude): la base no deja que nadie más lo lea, no hay avisos ni
// notificaciones, y el moderador de las sesiones de pareja no lo lee. Al terminar, Claude deja un resumen y pone al
// día lo que entiende de ti (psico_perfil), que vuelve a leer en la sesión siguiente.
// Lo de Claude lo escribe la función de Supabase `psicologo`, que guarda la llave de Anthropic: nunca llega al
// teléfono. La conversación usa las piezas de las sesiones de pareja (sesion.css) con su propia tinta (psicologo.css).
// app.js deja lo que hace falta en window.nosotros y avisa con "nosotros:dentro".
(() => {
  "use strict";
  const PEDIR_TRAS = 40000;     // si Claude no contestó en este rato (y no está escribiendo), aparece "Pedirle que responda"
  const PENSANDO_MAX = 120000;  // igual que psico_tomar_turno: un "pensando" más viejo quedó colgado
  const REVISAR_CADA = 4000;    // mientras Claude escribe, se revisa si ya llegó lo suyo
  // Lo que puede contestar la función `psicologo` cuando algo sale mal
  const MOTIVOS = {
    falta_llave: "Falta conectar a Claude: hay que poner la llave de Anthropic en Supabase.",
    llave_invalida: "La llave de Claude no funciona. Revísala en Supabase.",
    sin_saldo: "Se acabó el saldo de Claude. Recárgalo en console.anthropic.com",
    tope: "Ya conversaron mucho por hoy. Sigue mañana 🌿",
    ocupado: "Claude está con mucha gente en este momento. Intenta en un ratito.",
    rechazo: "Claude prefirió no responder a eso. Prueba decirlo de otra forma.",
    vacia: "Todavía no escribiste nada en esta sesión.",
    sin_permiso: "Esta cuenta no tiene su espacio.",
  };
  const ICONOS = {
    atras: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    enviar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5 3.5 10.2l6.7 2.6 2.6 6.7 7.7-16Z"/><path d="m10.2 12.8 4.7-4.7"/></svg>',
    // una hoja: algo que crece, tranquilo
    hoja: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c3-4 6-6.5 9-8"/></svg>',
    pluma: '<svg class="ico" aria-hidden="true"><use href="#i-lapiz"/></svg>',
    candado: '<svg class="ico" aria-hidden="true"><use href="#i-candado"/></svg>',
    mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>',
    parlante: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    parar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
  };
  // Escuchar: la voz del teléfono lee en voz alta lo que dice Claude (speechSynthesis: gratis, el texto no sale del
  // teléfono hacia otra empresa). Si el navegador no la tiene, no aparecen los botones.
  const Voz = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window ? window.speechSynthesis : null;
  // Lo que Claude va entendiendo de ti (las mismas claves que ESQUEMA_CIERRE en la función)
  const FORMULACION = [
    ["quien_eres", "Tu vida hoy"], ["lo_que_te_trae", "Lo que te trae"], ["objetivos", "Lo que quieres lograr"],
    ["historia", "Tu historia"], ["patrones", "Lo que se te repite"], ["disparadores", "Lo que te activa"],
    ["fortalezas", "Tus fortalezas"], ["lo_que_ayuda", "Lo que te ayuda"], ["como_se_conecta", "Cómo se conecta todo"],
    ["avances", "Tus avances"], ["a_cuidar", "Lo que conviene cuidar"],
  ];
  // Dictado: el reconocimiento de voz del navegador (lo mismo que el micrófono del teclado). Si no está, no aparece el botón.
  const Reconocimiento = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const IDIOMA_POR_ZONA = {
    "America/Guayaquil": "es-EC", "America/Santiago": "es-CL", "America/Bogota": "es-CO", "America/Lima": "es-PE",
    "America/Mexico_City": "es-MX", "America/Argentina/Buenos_Aires": "es-AR", "America/Caracas": "es-VE", "Europe/Madrid": "es-ES",
  };

  let X = null, el = null, iniciado = false;
  let sesiones = [];          // las mías, de la más nueva a la más vieja
  let perfil = null;          // lo que Claude entiende de mí: { formulacion, actualizado_en }
  let mirando = null;         // la sesión que está abierta en pantalla
  let mensajes = [];          // los de esa sesión
  let verCharla = false;      // en una sesión cerrada: mostrar también lo que hablamos
  let pendientes = 0;         // llamadas a Claude que siguen en camino
  let fallo = false;          // la última llamada falló: se puede pedir otra vez sin esperar
  let enviando = false, volverA = null, pegadoAbajo = true, revisarTimer = null, pedirTimer = null;
  let dictado = null, micRoto = false;
  let hablando = null;        // la respuesta que se está leyendo en voz alta: { id, boton }
  let vozAuto = false;        // leer solas las respuestas nuevas (se recuerda en este teléfono)
  try { vozAuto = localStorage.getItem("psico-voz") === "1"; } catch (e) {}

  // ---------- utilidades ----------
  const nodo = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const boton = (txt, cls) => { const b = nodo("button", cls, txt); b.type = "button"; return b; };
  const poner = (e, txt) => { if (e.textContent !== txt) e.textContent = txt; };
  const ms = (iso) => (iso ? new Date(iso).getTime() : 0);
  const pareja = () => (X.otro && X.otro.nombre) || "Tu pareja";
  const abierta = () => sesiones.find((s) => s.estado !== "cerrada") || null;
  const cerradas = () => sesiones.filter((s) => s.estado === "cerrada");
  const pensandoAhora = (s) => !!s && !!s.pensando_desde && Date.now() - ms(s.pensando_desde) < PENSANDO_MAX;
  const fecha = (iso) => X.fechaCorta(iso, X.miTz());
  const dia = (m) => fecha(m.creado_en);
  const escribiYo = () => mensajes.some((m) => !m.de_claude);
  // **negrita** de Claude, sin innerHTML: el texto nunca se interpreta como HTML
  function conFormato(destino, texto) {
    texto.split(/\*\*(.+?)\*\*/s).forEach((parte, i) => { if (parte) destino.append(i % 2 ? nodo("b", null, parte) : parte); });
  }

  // ---------- armar la tarjeta, la conversación y las ventanas ----------
  function montar() {
    if (el) return;
    el = {};
    const card = nodo("section", "psico psico-card"); card.id = "psico-card"; card.setAttribute("aria-labelledby", "psico-titulo");
    card.innerHTML = `
      <div class="pc-cab">
        <span class="pc-ico" aria-hidden="true">${ICONOS.hoja}</span>
        <div><p class="eyebrow">${ICONOS.candado}Tu espacio · solo tú lo ves</p><h2 class="pc-titulo" id="psico-titulo"></h2></div>
      </div>
      <p class="small-note pc-sub"></p>
      <div class="pc-tarea" hidden><p class="pt-titulo">Tu tarea de esta semana</p><p class="pt-texto"></p></div>
      <div class="pc-botones">
        <button type="button" class="pc-empezar"></button>
        <div class="pc-links"><button type="button" class="link pc-anteriores"></button><button type="button" class="link pc-entiende">Lo que Claude entiende de ti</button></div>
      </div>`;
    const q = (s) => card.querySelector(s);
    Object.assign(el, {
      card, cTitulo: q(".pc-titulo"), cSub: q(".pc-sub"), tarea: q(".pc-tarea"), tTexto: q(".pt-texto"),
      empezar: q(".pc-empezar"), anteriores: q(".pc-anteriores"), entiende: q(".pc-entiende"),
    });
    el.empezar.addEventListener("click", () => { const a = abierta(); if (a) abrirVista(a.id); else empezar(el.empezar); });
    el.anteriores.addEventListener("click", abrirHistorial);
    el.entiende.addEventListener("click", abrirPerfil);
    // en el Inicio, después de los botones de siempre y antes de "Últimas señales"
    const log = document.querySelector("#tab-inicio .log");
    if (log) log.before(card); else document.getElementById("tab-inicio").append(card);

    montarVista();
    montarDialogos();
  }

  function montarVista() {
    const v = nodo("div", "sv psico"); v.id = "psico-vista"; v.hidden = true;
    v.setAttribute("role", "dialog"); v.setAttribute("aria-modal", "true"); v.setAttribute("aria-labelledby", "pv-titulo");
    v.innerHTML = `
      <header class="sv-cab">
        <button type="button" class="sv-atras" aria-label="Volver">${ICONOS.atras}</button>
        <div class="sv-titulos"><h2 class="sv-titulo" id="pv-titulo"></h2><p class="sv-estado"></p></div>
        <button type="button" class="pv-voz" aria-pressed="false" aria-label="Leer en voz alta las respuestas de Claude" hidden>${ICONOS.parlante}</button>
        <button type="button" class="ghost sv-terminar">Terminar</button>
      </header>
      <ol class="sv-lista" role="log" aria-live="polite" aria-label="Conversación"></ol>
      <footer class="sv-pie">
        <button type="button" class="ghost sv-pedir" hidden>Pedirle a Claude que responda</button>
        <p class="sv-resumiendo" hidden><span class="sv-puntos" aria-hidden="true"><i></i><i></i><i></i></span>Claude está escribiendo tu resumen…</p>
        <p class="sv-escucha" hidden><span class="sv-ondas" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>Te escucho… toca el micrófono para terminar</p>
        <form class="sv-escribir">
          <label class="sr" for="pv-texto">Tu mensaje</label>
          <textarea id="pv-texto" rows="1" maxlength="6000" placeholder="Cuéntame…" autocomplete="off"></textarea>
          <button type="button" class="sv-mic" aria-label="Dictar con la voz" aria-pressed="false" hidden>${ICONOS.mic}</button>
          <button type="submit" class="sv-enviar" aria-label="Enviar" disabled>${ICONOS.enviar}</button>
        </form>
      </footer>
      <p class="sr sv-anuncio" aria-live="assertive"></p>`;
    document.body.append(v);
    const q = (s) => v.querySelector(s);
    Object.assign(el, {
      v, atras: q(".sv-atras"), titulo: q(".sv-titulo"), estado: q(".sv-estado"), terminar: q(".sv-terminar"),
      lista: q(".sv-lista"), pie: q(".sv-pie"), pedir: q(".sv-pedir"), resumiendo: q(".sv-resumiendo"),
      form: q(".sv-escribir"), texto: q("#pv-texto"), enviar: q(".sv-enviar"), anuncio: q(".sv-anuncio"),
      mic: q(".sv-mic"), escucha: q(".sv-escucha"), voz: q(".pv-voz"),
    });
    el.mic.hidden = !Reconocimiento();
    el.voz.addEventListener("click", cambiarVozAuto);
    pintarVozAuto();
    // "Claude está escribiendo…": siempre al final de la conversación
    const li = nodo("li", "sv-m claude sv-escribe"); li.hidden = true;
    const n = nodo("p", "sv-quien"); n.innerHTML = ICONOS.pluma; n.append("Claude");
    const b = nodo("div", "sv-burbuja"); b.innerHTML = '<span class="sv-puntos" aria-hidden="true"><i></i><i></i><i></i></span>';
    b.append(nodo("span", "sr", "Claude está escribiendo"));
    li.append(n, b); el.escribeClaude = li;

    el.atras.addEventListener("click", cerrarVista);
    el.terminar.addEventListener("click", abrirFin);
    el.pedir.addEventListener("click", pedirAClaude);
    el.form.addEventListener("submit", enviar);
    el.mic.addEventListener("click", () => { if (dictado) pararDictado(); else empezarDictado(); });
    el.texto.addEventListener("input", () => {
      if (dictado) cortarDictado(); // si escribes con el teclado mientras dictas, gana lo que escribes
      ajustarAlto(); el.enviar.disabled = enviando || !el.texto.value.trim();
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
    const dlg = (id, html) => {
      const d = nodo("dialog", `dlg psico ${id}`); d.id = id; d.setAttribute("aria-labelledby", `${id}-t`);
      d.innerHTML = `<div class="stack">${html}</div>`; document.body.append(d); return d;
    };
    const fin = dlg("dlg-psico-fin", `
      <h2 id="dlg-psico-fin-t"></h2>
      <p class="small-note pf-texto"></p>
      <button type="button" class="pf-ok"></button>
      <button type="button" class="link pf-no">Seguir hablando</button>`);
    Object.assign(el, { fin, fTitulo: fin.querySelector("h2"), fTexto: fin.querySelector(".pf-texto"), fOk: fin.querySelector(".pf-ok") });
    fin.querySelector(".pf-no").addEventListener("click", () => fin.close());
    el.fOk.addEventListener("click", terminar);

    const hist = dlg("dlg-psico-sesiones", `
      <h2 id="dlg-psico-sesiones-t">Tus sesiones</h2>
      <p class="small-note">Cada una con su resumen. Las lees solo tú.</p>
      <ul class="sv-hist"></ul>
      <button type="button" class="link ph-cerrar">Cerrar</button>`);
    el.hist = hist; el.histLista = hist.querySelector(".sv-hist");
    hist.querySelector(".ph-cerrar").addEventListener("click", () => hist.close());

    const pf = dlg("dlg-psico-perfil", `
      <h2 id="dlg-psico-perfil-t">Lo que Claude entiende de ti</h2>
      <p class="small-note">Es lo que Claude va entendiendo de ti, sesión a sesión, para no empezar de cero. Lo lees solo tú. Si algo no es así, díselo en tu próxima sesión y lo corrige.</p>
      <p class="small-note pf-fecha"></p>
      <div class="pf-lista"></div>
      <button type="button" class="link pf-cerrar">Cerrar</button>
      <button type="button" class="link pf-borrar">Borrar todo mi espacio</button>`);
    Object.assign(el, { pf, pfLista: pf.querySelector(".pf-lista"), pfFecha: pf.querySelector(".pf-fecha") });
    pf.querySelector(".pf-cerrar").addEventListener("click", () => pf.close());
    pf.querySelector(".pf-borrar").addEventListener("click", () => { pf.close(); el.borrar.showModal(); });

    const borrar = dlg("dlg-psico-borrar", `
      <h2 id="dlg-psico-borrar-t">¿Borrar todo tu espacio?</h2>
      <p class="small-note">Se borran todas tus sesiones, todo lo que hablaste y lo que Claude entiende de ti. No se puede deshacer.</p>
      <button type="button" class="pb-ok">Sí, borrar todo</button>
      <button type="button" class="link pb-no">Cancelar</button>`);
    el.borrar = borrar;
    borrar.querySelector(".pb-no").addEventListener("click", () => borrar.close());
    borrar.querySelector(".pb-ok").addEventListener("click", borrarTodo);
  }

  // ---------- pintar ----------
  function pintarCard() {
    if (!el) return;
    const a = abierta(), c = cerradas(), ult = c[0] || null;
    let titulo, sub, accion;
    if (a && a.estado === "resumiendo") {
      titulo = "Claude está escribiendo tu resumen…"; sub = `Sesión ${a.numero}`; accion = "Ver";
    } else if (a) {
      titulo = "Tu sesión sigue abierta"; sub = `La empezaste ${X.ago(a.creado_en)}`; accion = "Volver a tu sesión";
    } else if (ult) {
      titulo = "Un rato para ti";
      sub = `La última fue el ${fecha(ult.cerrada_en || ult.creado_en)}${ult.tema ? `: ${ult.tema}` : ""}.`;
      accion = "Hablar con tu psicólogo";
    } else {
      titulo = "Un rato para ti";
      sub = `Un psicólogo solo para ti, con Claude. Lo que hablen aquí lo ves solo tú: ${pareja()} no ve nada de esto, ni siquiera esta tarjeta.`;
      accion = "Empezar mi primera sesión";
    }
    poner(el.cTitulo, titulo); poner(el.cSub, sub); poner(el.empezar, accion);
    const tarea = !a && ult && ult.tarea;
    el.tarea.hidden = !tarea;
    if (tarea) poner(el.tTexto, ult.tarea);
    el.anteriores.hidden = !c.length;
    poner(el.anteriores, c.length === 1 ? "Tu sesión anterior" : `Tus sesiones (${c.length})`);
    el.entiende.hidden = !perfil;
  }

  function pintarVista() {
    if (!el || el.v.hidden || !mirando) return;
    const s = mirando;
    poner(el.titulo, `Tu sesión ${s.numero}`);
    poner(el.estado, s.estado === "cerrada" ? `Cerrada el ${fecha(s.cerrada_en || s.creado_en)}`
      : s.estado === "resumiendo" ? "Claude está escribiendo el resumen…" : "solo tú y Claude");
    el.terminar.hidden = s.estado !== "abierta";
    el.voz.hidden = !Voz || s.estado !== "abierta";
    el.pie.hidden = s.estado === "cerrada";
    el.form.hidden = s.estado !== "abierta";
    if (s.estado !== "abierta" && dictado) pararDictado();
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
      const b = boton(verCharla ? "Ocultar lo que hablamos" : `Ver lo que hablamos (${mensajes.length} mensajes)`, "ghost");
      b.addEventListener("click", () => { verCharla = !verCharla; pintarLista(); });
      if (mensajes.length) { li.append(b); l.append(li); }
    } else {
      const li = nodo("li", "sv-intro");
      li.innerHTML = ICONOS.candado;
      li.append(nodo("span", null, `Esto es solo tuyo: ${pareja()} no lo ve, y el moderador de sus sesiones de pareja tampoco. Claude es una IA: acompaña como un buen psicólogo, pero no reemplaza a uno en persona.`));
      l.append(li);
    }
    if (s.estado !== "cerrada" || verCharla) {
      let previo = null;
      for (const m of mensajes) {
        if (!previo || dia(previo) !== dia(m)) l.append(nodo("li", "sv-dia", dia(m)));
        l.append(liMensaje(m, previo)); previo = m;
      }
    }
    l.append(el.escribeClaude);
    pintarEscribiendo();
  }

  function liMensaje(m, previo) {
    const tipo = m.de_claude ? "claude" : "mio";
    const li = nodo("li", `sv-m ${tipo}`); li.dataset.id = m.id;
    const seguido = previo && previo.de_claude === m.de_claude && ms(m.creado_en) - ms(previo.creado_en) < 5 * 60e3 && dia(previo) === dia(m);
    if (seguido) li.classList.add("seguido");
    else if (tipo === "claude") {
      const n = nodo("p", "sv-quien"); n.setAttribute("aria-hidden", "true"); n.innerHTML = ICONOS.pluma; n.append("Claude"); li.append(n);
    }
    const b = nodo("div", "sv-burbuja");
    b.append(nodo("span", "sr", `${tipo === "claude" ? "Claude" : "Tú"}: `));
    conFormato(b, m.texto);
    const t = nodo("time", null, X.hora(m.creado_en, X.miTz())); t.dateTime = m.creado_en;
    if (tipo === "claude" && Voz) {
      // abajo de la burbuja: «Escuchar» a la izquierda y la hora a la derecha
      const pie = nodo("div", "pv-pie-burbuja"), e = boton(null, "pv-escuchar");
      pintarEscuchar(e, hablando && hablando.id === m.id);
      e.addEventListener("click", () => leer(m, e));
      pie.append(e, t); b.append(pie);
    } else b.append(t);
    li.append(b);
    return li;
  }

  // El resumen: una hoja con lo de hoy, la tarea en un recuadro y unas palabras de Claude al final
  function liCarta(s) {
    const r = s.resumen || {}, li = nodo("li", "sv-carta-li"), c = nodo("article", "sv-carta");
    c.setAttribute("aria-labelledby", `pv-c-${s.numero}`);
    const h = nodo("h3", null, r.tema || s.tema || "Tu sesión"); h.id = `pv-c-${s.numero}`;
    c.append(nodo("p", "eyebrow", `Sesión ${s.numero} · ${fecha(s.cerrada_en || s.creado_en)}`), h);
    const seccion = (titulo, texto) => {
      if (!texto || !texto.trim()) return;
      const d = nodo("section", "sv-c-sec"); d.append(nodo("p", "sv-c-et", titulo), nodo("p", null, texto.trim())); c.append(d);
    };
    seccion("Cómo llegaste", r.llegada);
    seccion("Lo que trabajamos", r.trabajamos);
    seccion("De lo que te diste cuenta", r.descubriste);
    seccion("La herramienta", r.herramienta);
    const tarea = s.tarea || r.tarea;
    if (tarea) {
      const d = nodo("section", "sv-c-sec pv-tarea"); d.append(nodo("p", "sv-c-et", "Para esta semana"), nodo("p", null, tarea)); c.append(d);
    }
    if (r.proxima && r.proxima.trim()) c.append(nodo("p", "sv-c-pendiente", `Para la próxima: ${r.proxima.trim()}`));
    if (r.mensaje && r.mensaje.trim()) c.append(nodo("p", "pv-mensaje", r.mensaje.trim()));
    const firma = nodo("p", "sv-c-firma"); firma.innerHTML = ICONOS.pluma; firma.append("Claude"); c.append(firma);
    li.append(c);
    return li;
  }

  function pintarEscribiendo() {
    if (!el || !mirando) return;
    const ver = mirando.estado === "abierta" && (pendientes > 0 || pensandoAhora(mirando));
    if (el.escribeClaude.hidden === !ver) return;
    el.escribeClaude.hidden = !ver;
    if (ver && pegadoAbajo) bajar();
  }
  // "Pedirle a Claude": si lo último lo escribí yo y Claude no contestó (falló, o se demoró demasiado)
  function actualizarPedir() {
    clearTimeout(pedirTimer);
    if (!el || !mirando) return;
    const ult = mensajes[mensajes.length - 1];
    let ver = false;
    if (mirando.estado === "abierta" && ult && !ult.de_claude && !pendientes && !pensandoAhora(mirando)) {
      const falta = PEDIR_TRAS - (Date.now() - ms(ult.creado_en));
      if (fallo || falta <= 0) ver = true; else pedirTimer = setTimeout(actualizarPedir, falta + 100);
    }
    if (el.pedir.hidden === !ver) return;
    el.pedir.hidden = !ver;
    if (ver && pegadoAbajo) bajar();
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
    if (!mirando || mirando.id !== id) { mensajes = []; verCharla = false; fallo = false; }
    mirando = s;
    if (el.v.hidden) {
      volverA = document.activeElement;
      el.v.hidden = false; el.v.classList.remove("sale");
      document.body.classList.add("con-psico");
      // "atrás" (botón o gesto de Android) cierra la conversación en vez de salir de la app
      if (!(history.state && history.state.psico)) history.pushState({ ...(history.state || {}), psico: true }, "");
      ajustarVentana();
      el.atras.focus();
    }
    pintarLista(); pintarVista(); pintarCard();
    await cargarMensajes(id);
  }
  function cerrarVista() {
    if (history.state && history.state.psico) history.back(); // → popstate → ocultarVista
    else ocultarVista();
  }
  function ocultarVista() {
    if (!el || el.v.hidden || el.v.classList.contains("sale")) return;
    cortarDictado(); callar();
    const fin = () => { el.v.hidden = true; el.v.classList.remove("sale", "vv"); };
    document.body.classList.remove("con-psico");
    if (X.pocoMovimiento()) fin(); else { el.v.classList.add("sale"); setTimeout(fin, 260); }
    mirando = null; mensajes = [];
    clearTimeout(pedirTimer); clearTimeout(revisarTimer);
    pintarCard();
    if (volverA && volverA.focus) volverA.focus();
  }

  // ---------- acciones ----------
  // La función `psicologo` le pregunta a Claude. Si algo sale mal, contesta un código que aquí se explica.
  async function llamar(accion, id) {
    let codigo = null;
    pendientes++; fallo = false; pintarEscribiendo(); actualizarPedir();
    try {
      const { data, error } = await X.sb.functions.invoke("psicologo", { body: { sesion_id: id, accion } });
      if (error) {
        codigo = "claude";
        try { const j = await error.context.json(); codigo = j.error || codigo; } catch (e) {}
      } else if (data && data.error) codigo = data.error;
    } catch (e) { codigo = "claude"; }
    pendientes = Math.max(0, pendientes - 1);
    if (codigo) {
      fallo = true;
      X.toast(MOTIVOS[codigo] || "Claude no pudo responder. Intenta de nuevo en un momento.");
    }
    await refrescar(id);
    return !codigo;
  }

  async function empezar(b) {
    if (b) b.disabled = true;
    const { data, error } = await X.sb.rpc("psico_abrir");
    if (b) b.disabled = false;
    if (error || !data || !data.id) { X.toast("No se pudo abrir la sesión, intenta otra vez"); return; }
    aplicarSesion(data);
    await abrirVista(data.id);
    // Claude saluda (si ya lo hizo, no repite)
    if (data.estado === "abierta" && !mensajes.length) llamar("responder", data.id);
  }

  async function enviar(e) {
    e.preventDefault();
    cortarDictado(); // se manda lo que está escrito ahora; lo que el dictado entienda después ya no se mete
    const t = el.texto.value.trim();
    if (!t || enviando || !mirando || mirando.estado !== "abierta") return;
    callar(); desbloquearVoz(); // (dentro del toque: así la respuesta se puede leer sola también en iPhone)
    const id = mirando.id;
    enviando = true; el.enviar.disabled = true;
    const { data, error } = await X.sb.rpc("psico_escribir", { p_sesion: id, p_texto: t });
    enviando = false;
    if (error || !data || !data.id) {
      el.enviar.disabled = !el.texto.value.trim();
      X.toast(mirando && mirando.estado !== "abierta" ? "La sesión ya se está cerrando" : "No se pudo enviar. Revisa tu conexión.");
      return;
    }
    el.texto.value = ""; ajustarAlto(); el.enviar.disabled = true;
    agregarMensaje(data);
    llamar("responder", id);
  }

  function pedirAClaude() {
    if (!mirando) return;
    el.pedir.hidden = true;
    llamar("responder", mirando.id);
  }

  function abrirFin() {
    if (!mirando || mirando.estado !== "abierta") return;
    const algo = escribiYo();
    poner(el.fTitulo, algo ? "¿Terminamos por hoy?" : "¿Descartamos esta sesión?");
    poner(el.fTexto, algo
      ? "Claude va a escribir el resumen de lo que hablaron y a poner al día lo que entiende de ti, para la próxima vez. Queda guardado solo para ti."
      : "Todavía no escribiste nada. Si la abriste sin querer, la descartamos y no queda nada.");
    poner(el.fOk, algo ? "Terminar y escribir el resumen" : "Descartar la sesión");
    el.fin.showModal();
  }
  async function terminar() {
    el.fin.close();
    if (!mirando) return;
    const s = mirando;
    if (!escribiYo()) {
      const { data } = await X.sb.rpc("psico_descartar", { p_sesion: s.id });
      if (!data) { X.toast("No se pudo descartar, intenta otra vez"); return; }
      sesiones = sesiones.filter((x) => x.id !== s.id);
      cerrarVista(); pintarCard();
      return;
    }
    aplicarSesion({ ...s, estado: "resumiendo" }); // se ve al tiro; lo de verdad llega al recargar
    await llamar("cerrar", s.id);
    cargarPerfil();
  }

  function abrirHistorial() {
    const l = el.histLista; l.textContent = "";
    cerradas().forEach((s) => {
      const li = nodo("li"), b = boton(null);
      const num = nodo("span", "sh-num"); num.append(nodo("small", null, "N°"), String(s.numero));
      const txt = nodo("span", "sh-txt");
      txt.append(nodo("strong", null, s.tema || `Sesión ${s.numero}`),
        nodo("small", null, fecha(s.cerrada_en || s.creado_en) + (s.tarea ? ` · Tarea: ${s.tarea}` : "")));
      b.append(num, txt);
      b.addEventListener("click", () => { el.hist.close(); abrirVista(s.id); });
      li.append(b); l.append(li);
    });
    el.hist.showModal();
  }

  function abrirPerfil() {
    const f = (perfil && perfil.formulacion) || {};
    el.pfLista.textContent = "";
    let hay = false;
    for (const [k, titulo] of FORMULACION) {
      const t = typeof f[k] === "string" ? f[k].trim() : "";
      if (!t) continue;
      hay = true;
      const d = nodo("section"); d.append(nodo("p", "sv-c-et", titulo), nodo("p", null, t)); el.pfLista.append(d);
    }
    if (!hay) el.pfLista.append(nodo("p", "pf-vacio", "Todavía no hay nada: se escribe al terminar tu primera sesión."));
    poner(el.pfFecha, perfil && perfil.actualizado_en ? `Al día desde el ${fecha(perfil.actualizado_en)}.` : "");
    el.pf.showModal();
  }

  async function borrarTodo() {
    const b = el.borrar.querySelector(".pb-ok");
    b.disabled = true;
    const { error } = await X.sb.rpc("psico_borrar_todo");
    b.disabled = false;
    el.borrar.close();
    if (error) { X.toast("No se pudo borrar. Revisa tu conexión e intenta otra vez."); return; }
    callar();
    if (el && !el.v.hidden) ocultarVista();
    sesiones = []; perfil = null; mensajes = [];
    pintarCard();
    X.toast("Listo: tu espacio quedó vacío 🌿");
  }

  // ---------- escuchar: la voz del teléfono lee lo que dice Claude ----------
  // Una voz en español, de preferencia la de tu país (la misma tabla que el dictado) y la que viene en el teléfono.
  function elegirVoz() {
    const norm = (l) => (l || "").replace("_", "-").toLowerCase();
    const voces = Voz.getVoices().filter((v) => /^es(-|$)/.test(norm(v.lang)));
    if (!voces.length) return null;
    const quiero = norm(IDIOMA_POR_ZONA[X.miTz()] || "es-419");
    return voces.find((v) => norm(v.lang) === quiero && v.localService) || voces.find((v) => norm(v.lang) === quiero)
      || voces.find((v) => /^es-(419|us|mx|co|cl|ar|pe|ec)$/.test(norm(v.lang))) || voces[0];
  }
  // El texto como se dice: sin **, sin emojis (la voz diría su nombre) y cada línea como una frase
  function paraDecir(texto) {
    return texto.replace(/\*\*(.+?)\*\*/gs, "$1")
      .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
      .split(/\n+/).map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "").trim()).filter(Boolean)
      .map((l) => (/[.!?…:;]$/.test(l) ? l : `${l}.`)).join(" ");
  }
  // En pedazos cortos: Chrome corta una lectura larga a los ~15 segundos
  function trozos(texto) {
    const out = [];
    let actual = "";
    // (frase = hasta su punto; sin «lookbehind», que los iPhone viejos no entienden)
    for (const frase of (texto.match(/[^.!?…:;]+[.!?…:;]*/g) || []).map((f) => f.trim()).filter(Boolean)) {
      if (actual && (actual + " " + frase).length > 220) { out.push(actual); actual = frase; }
      else actual = actual ? `${actual} ${frase}` : frase;
    }
    if (actual) out.push(actual);
    // una frase muy larga, sin puntos: se corta entre palabras (de preferencia después de una coma)
    return out.flatMap((p) => {
      const r = [];
      while (p.length > 260) {
        let corte = p.lastIndexOf(", ", 220);
        if (corte < 80) corte = p.lastIndexOf(" ", 220);
        if (corte < 1) corte = 220;
        r.push(p.slice(0, corte + 1).trim()); p = p.slice(corte + 1).trim();
      }
      if (p) r.push(p);
      return r;
    });
  }
  function pintarEscuchar(b, on) {
    b.innerHTML = on ? ICONOS.parar : ICONOS.parlante;
    b.append(on ? "Detener" : "Escuchar");
    b.classList.toggle("on", on);
    b.setAttribute("aria-label", on ? "Dejar de escuchar" : "Escuchar esta respuesta en voz alta");
  }
  function leer(m, b) {
    if (!Voz) return;
    const mismo = hablando && hablando.id === m.id;
    callar();
    if (mismo) return; // tocar otra vez = detener
    cortarDictado();   // el micrófono no debe escuchar a la voz del teléfono
    const partes = trozos(paraDecir(m.texto));
    if (!partes.length) return;
    const voz = elegirVoz(), yo = hablando = { id: m.id, boton: b };
    pintarEscuchar(b, true);
    const fin = () => { if (hablando === yo) { hablando = null; pintarEscuchar(b, false); } };
    try { Voz.resume(); } catch (e) {} // (en algunos Android la voz queda en pausa)
    partes.forEach((t, i) => {
      const u = new SpeechSynthesisUtterance(t);
      if (voz) { u.voice = voz; u.lang = voz.lang; } else u.lang = IDIOMA_POR_ZONA[X.miTz()] || "es-419";
      u.rate = 0.95; // un poco más pausado: es una conversación tranquila
      if (i === partes.length - 1) u.onend = fin;
      u.onerror = (e) => { if (e.error !== "interrupted" && e.error !== "canceled") fin(); };
      Voz.speak(u);
    });
  }
  function callar() {
    if (!Voz) return;
    const h = hablando;
    hablando = null;
    if (h) pintarEscuchar(h.boton, false);
    try { Voz.cancel(); } catch (e) {}
  }
  // El iPhone solo deja hablar a la página después de un toque: una frase muda dentro del toque la deja lista
  function desbloquearVoz() {
    if (!Voz || !vozAuto) return;
    try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; Voz.speak(u); } catch (e) {}
  }
  function pintarVozAuto() {
    if (!el) return;
    el.voz.classList.toggle("on", vozAuto);
    el.voz.setAttribute("aria-pressed", String(vozAuto));
    el.voz.title = vozAuto ? "Las respuestas se leen solas" : "Leer solas las respuestas";
  }
  function cambiarVozAuto() {
    vozAuto = !vozAuto;
    try { localStorage.setItem("psico-voz", vozAuto ? "1" : "0"); } catch (e) {}
    pintarVozAuto();
    if (vozAuto) { desbloquearVoz(); X.toast("Las respuestas de Claude se van a leer en voz alta 🔊"); }
    else { callar(); X.toast("Las respuestas ya no se leen solas. Puedes tocar «Escuchar» en cada una"); }
  }

  // ---------- dictar con la voz (igual que en las sesiones de pareja) ----------
  const ERRORES_DICTADO = {
    "not-allowed": matchMedia("(pointer: coarse)").matches
      ? "Para dictar, permite el micrófono para la app en los ajustes del teléfono. Mientras, usa el micrófono del teclado 🎤"
      : "Este navegador no deja usar el micrófono. Para dictar, usa el dictado de Windows (Windows + H) o permite el micrófono en el candado de la barra de direcciones 🎤",
    "service-not-allowed": "Este teléfono no deja dictar desde la app: usa el micrófono del teclado 🎤",
    "language-not-supported": "Aquí no se puede dictar en español: usa el micrófono del teclado 🎤",
    "audio-capture": "No encontramos el micrófono del teléfono",
    network: "Para dictar hace falta internet",
  };
  const juntar = (a, b) => { const x = a.replace(/\s+$/, ""), y = b.trim(); return !x ? y : !y ? x : `${x} ${y}`; };
  // Une lo que el teléfono va entendiendo sin repetir (Chrome en Android manda la frase acumulada una y otra vez)
  function unirDictado(a, b) {
    const A = a.trim() ? a.trim().split(/\s+/) : [], B = b.trim() ? b.trim().split(/\s+/) : [];
    if (!A.length) return B.join(" ");
    if (!B.length) return A.join(" ");
    const igual = (x, y) => x.toLowerCase().replace(/[.,;:!?¡¿…"«»]/g, "") === y.toLowerCase().replace(/[.,;:!?¡¿…"«»]/g, "");
    const empiezaCon = (L, P) => P.length <= L.length && P.every((w, i) => igual(w, L[i]));
    if (empiezaCon(B, A)) return B.join(" ");
    if (B.length <= A.length && B.every((w, i) => igual(w, A[A.length - B.length + i]))) return A.join(" ");
    for (let k = Math.min(A.length, B.length) - 1; k > 0; k--) {
      if (empiezaCon(B, A.slice(-k))) return A.concat(B.slice(k)).join(" ");
    }
    return `${A.join(" ")} ${B.join(" ")}`;
  }
  function empezarDictado() {
    const R = Reconocimiento();
    if (!R || dictado || micRoto || !mirando || mirando.estado !== "abierta") return;
    callar(); // que el micrófono no escuche a la voz del teléfono
    let rec;
    try { rec = new R(); } catch (e) { return; }
    const nav = navigator.language || "";
    rec.lang = IDIOMA_POR_ZONA[X.miTz()] || (nav.toLowerCase().startsWith("es") ? nav : "es-419");
    rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    const d = dictado = { rec, base: el.texto.value, sigue: true, callado: 0 };
    rec.onresult = (e) => {
      if (dictado !== d) return;
      let dicho = "";
      for (let i = 0; i < e.results.length; i++) dicho = unirDictado(dicho, e.results[i][0].transcript);
      d.callado = 0;
      el.texto.value = juntar(d.base, dicho);
      ajustarAlto(); el.texto.scrollTop = el.texto.scrollHeight;
      el.enviar.disabled = enviando || !el.texto.value.trim();
    };
    rec.onerror = (e) => {
      if (dictado !== d) return;
      if (e.error === "no-speech") { d.callado++; return; }
      if (e.error === "aborted") return;
      d.sigue = false;
      if (e.error === "service-not-allowed" || e.error === "language-not-supported") { micRoto = true; el.mic.hidden = true; }
      X.toast(ERRORES_DICTADO[e.error] || "No se pudo dictar. Prueba con el micrófono del teclado 🎤");
    };
    rec.onend = () => {
      if (dictado !== d) return;
      // el teléfono deja de escuchar solo después de una pausa: si no lo detuviste, sigue
      if (d.sigue && d.callado < 2) {
        d.base = el.texto.value;
        try { rec.start(); return; } catch (x) {}
      }
      dictado = null; pintarMic();
    };
    try { rec.start(); } catch (e) { dictado = null; return; }
    pintarMic(); X.vibrar([20]);
  }
  function pararDictado() {
    if (!dictado || !dictado.sigue) return;
    dictado.sigue = false; pintarMic();
    try { dictado.rec.stop(); } catch (e) { dictado = null; pintarMic(); }
  }
  function cortarDictado() {
    if (!dictado) return;
    const d = dictado; dictado = null;
    try { d.rec.abort(); } catch (e) {}
    pintarMic();
  }
  function pintarMic() {
    if (!el) return;
    const on = !!dictado && dictado.sigue;
    el.mic.classList.toggle("escuchando", on);
    el.mic.setAttribute("aria-pressed", String(on));
    el.mic.setAttribute("aria-label", on ? "Dejar de dictar" : "Dictar con la voz");
    el.escucha.hidden = !on;
    el.texto.placeholder = on ? "Te escucho…" : "Cuéntame…";
  }

  // ---------- datos ----------
  function aplicarSesion(n) {
    if (!n || !n.id) return;
    const i = sesiones.findIndex((s) => s.id === n.id);
    if (i >= 0) sesiones[i] = n; else sesiones.unshift(n);
    sesiones.sort((a, b) => b.numero - a.numero);
    if (mirando && mirando.id === n.id) cambioLaQueMiro(n);
    pintarCard();
  }
  function cambioLaQueMiro(n) {
    const antes = mirando;
    mirando = n;
    if (antes.estado !== "cerrada" && n.estado === "cerrada") llegoElResumen();
    else if (antes.estado !== n.estado) pintarLista();
    pintarVista();
  }
  function agregarMensaje(m) {
    if (!mirando || m.sesion_id !== mirando.id || mensajes.some((x) => x.id === m.id)) return;
    const previo = mensajes[mensajes.length - 1];
    mensajes.push(m);
    if (previo && m.id < previo.id) { mensajes.sort((a, b) => a.id - b.id); pintarLista(); return; }
    if (m.de_claude) fallo = false;
    if (mirando.estado !== "cerrada") {
      const cerca = pegadoAbajo || abajo();
      if (!previo || dia(previo) !== dia(m)) el.lista.insertBefore(nodo("li", "sv-dia", dia(m)), el.escribeClaude);
      const li = liMensaje(m, previo);
      if (!X.pocoMovimiento()) li.classList.add("nuevo");
      el.lista.insertBefore(li, el.escribeClaude);
      if (cerca || !m.de_claude) bajar();
      if (m.de_claude) poner(el.anuncio, "Claude respondió");
      // con «leer solas» encendido, la respuesta nueva se escucha (no si estás dictando o la app está atrás)
      const e = li.querySelector(".pv-escuchar");
      if (m.de_claude && vozAuto && e && !dictado && !document.hidden && !el.v.hidden) leer(m, e);
    }
    pintarEscribiendo(); actualizarPedir();
  }
  function llegoElResumen() {
    verCharla = false; pintarLista();
    el.lista.scrollTo({ top: 0 });
    const carta = el.lista.querySelector(".sv-carta");
    if (carta && !X.pocoMovimiento()) carta.classList.add("llega");
    poner(el.anuncio, "Llegó el resumen de tu sesión");
    X.vibrar([60, 60, 120]);
  }

  async function cargar() {
    const { data, error } = await X.sb.from("psico_sesiones").select("*").eq("usuario_id", X.user.id)
      .order("numero", { ascending: false }).limit(60);
    if (error) return; // sin red se queda lo que ya se veía
    sesiones = data || [];
    if (mirando) {
      const n = sesiones.find((s) => s.id === mirando.id);
      if (!n) { ocultarVista(); X.toast("Esa sesión ya no está"); }
      else cambioLaQueMiro(n);
    }
    pintarCard();
  }
  async function cargarPerfil() {
    const { data, error } = await X.sb.from("psico_perfil").select("formulacion, actualizado_en").eq("usuario_id", X.user.id).maybeSingle();
    if (error) return;
    perfil = data || null;
    pintarCard();
  }
  async function cargarMensajes(id) {
    const { data, error } = await X.sb.from("psico_mensajes").select("id, sesion_id, de_claude, texto, creado_en")
      .eq("sesion_id", id).order("id").limit(1000);
    if (error || !mirando || mirando.id !== id) return;
    mensajes = data || [];
    pintarLista(); pintarVista();
    if (mirando.estado === "cerrada") el.lista.scrollTop = 0; else bajar(false);
  }
  // Lo nuevo de la sesión en pantalla (después de cada llamada, al volver a la app y mientras Claude escribe)
  async function refrescar(id) {
    clearTimeout(revisarTimer);
    const ult = mensajes.length ? mensajes[mensajes.length - 1].id : 0;
    const [{ data: s }, { data: nuevos }] = await Promise.all([
      X.sb.from("psico_sesiones").select("*").eq("id", id).maybeSingle(),
      X.sb.from("psico_mensajes").select("id, sesion_id, de_claude, texto, creado_en").eq("sesion_id", id).gt("id", ult).order("id").limit(1000),
    ]);
    if (s) aplicarSesion(s);
    if (mirando && mirando.id === id) (nuevos || []).forEach(agregarMensaje);
    // si otra llamada sigue escribiendo (o se está resumiendo), se vuelve a mirar en un rato
    if (mirando && mirando.id === id && !pendientes && (pensandoAhora(mirando) || mirando.estado === "resumiendo")) {
      revisarTimer = setTimeout(() => refrescar(id), REVISAR_CADA);
    }
    pintarEscribiendo(); actualizarPedir();
  }

  async function iniciar() {
    if (iniciado) return;
    X = window.nosotros;
    if (!X || !X.user) return;
    iniciado = true;
    // ¿Esta cuenta tiene su espacio? Si no (o no hay red), no se arma nada y no queda rastro en la pantalla.
    const { data, error } = await X.sb.rpc("psico_puedo");
    if (error || data !== true) { iniciado = false; return; }
    montar();
    if (!el) return;
    if (Voz) try { Voz.getVoices(); } catch (e) {} // (Chrome carga las voces de a poco: que vayan llegando)
    await Promise.all([cargar(), cargarPerfil()]);
  }

  // al volver a la app se trae lo último (una respuesta pudo llegar con el teléfono bloqueado)
  document.addEventListener("visibilitychange", () => {
    if (!X || !el) return;
    if (document.hidden) { cortarDictado(); return; }
    cargar();
    if (mirando) refrescar(mirando.id);
  });
  window.addEventListener("popstate", () => {
    if (el && !el.v.hidden && !(history.state && history.state.psico)) ocultarVista();
  });
  if (window.visualViewport) {
    visualViewport.addEventListener("resize", ajustarVentana);
    visualViewport.addEventListener("scroll", ajustarVentana);
  }

  window.addEventListener("nosotros:dentro", iniciar);
  if (window.nosotros) iniciar();
})();
