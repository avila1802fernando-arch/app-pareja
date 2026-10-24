// Dormir juntos 🌙
// Se duermen juntos cada noche, aunque sea a la distancia: "Me voy a dormir" y, al despertar, "Buenos días".
// Si los dos están acostados a la vez se ve su nochecita (estrellas, luna, los dos tapaditos y cuánto llevan),
// se cuentan las noches que han dormido juntos y la racha, y al despertar se puede contar qué se soñó.
// app.js deja lo que hace falta en window.nosotros y avisa con el evento "nosotros:dentro".
(() => {
  "use strict";
  const H = 3600e3;
  const ABIERTA_H = 14;  // una noche sin "buenos días" de hace más de esto ya terminó…
  const OLVIDO_H = 8;    // …y se cuenta como si hubieran dormido esto
  const JUNTOS_MIN = 15; // minutos acostados a la vez para que cuente como noche juntos
  const FRASES = [
    "Mismo cielo, misma noche y la misma almohada imaginaria.",
    "Que sueñes bonito, aquí estoy.",
    "Los kilómetros no saben que esta noche dormimos juntos.",
    "Cierro los ojos y te tengo al lado.",
    "Una noche menos para dormir abrazados de verdad.",
    "Tu respiración es mi canción de cuna.",
    "Te cuido los sueños desde aquí.",
    "Buenas noches, mi lugar favorito.",
    "Hasta en sueños te busco.",
  ];

  let X = null, noches = [], canal = null, timer = null, el = null, foco = null;

  const ms = (iso) => new Date(iso).getTime();
  const nodo = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const abierta = (n) => !n.fin && Date.now() - ms(n.inicio) < ABIERTA_H * H;
  const finDe = (n) => (n.fin ? ms(n.fin) : abierta(n) ? Date.now() : ms(n.inicio) + OLVIDO_H * H);
  // La noche "del lunes" va de la tarde del lunes a la mañana del martes (en la zona de quien vive más al oeste)
  const claveNoche = (t) => X.claveDia(new Date(t - 12 * H).toISOString(), X.tzPareja());
  const diaAntes = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10); };
  function duracion(t) {
    t = Math.max(0, t); // si el reloj del teléfono va un poco atrasado, nunca "-1 min"
    const h = Math.floor(t / H), m = Math.floor((t % H) / 60e3);
    return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
  }

  function estado() {
    const yo = X.user.id;
    return {
      mia: noches.find((n) => n.usuario_id === yo && abierta(n)) || null,
      suya: noches.find((n) => n.usuario_id !== yo && abierta(n)) || null,
    };
  }
  // noche → tiempo que estuvieron acostados a la vez
  function nochesJuntos() {
    const yo = X.user.id, mapa = new Map();
    const mias = noches.filter((n) => n.usuario_id === yo), suyas = noches.filter((n) => n.usuario_id !== yo);
    for (const a of mias) for (const b of suyas) {
      const ini = Math.max(ms(a.inicio), ms(b.inicio)), fin = Math.min(finDe(a), finDe(b));
      if (fin - ini < JUNTOS_MIN * 60e3) continue;
      const k = claveNoche(ini);
      mapa.set(k, (mapa.get(k) || 0) + fin - ini);
    }
    return mapa;
  }
  function racha(mapa) {
    let k = claveNoche(Date.now()), n = 0;
    if (!mapa.has(k)) k = diaAntes(k); // esta noche todavía puede llegar
    while (mapa.has(k)) { n++; k = diaAntes(k); }
    return n;
  }

  // ---------- tarjeta del Inicio y vista de noche ----------
  function montar() {
    if (el) return;
    el = {};
    const card = nodo("section", "noche-card"); card.id = "noche-card"; card.setAttribute("aria-labelledby", "noche-titulo");
    const cielo = nodo("div", "noche-cielo"); cielo.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 14; i++) {
      // arriba a la derecha, lejos de los botones
      const s = nodo("i"); s.style.left = 45 + Math.random() * 53 + "%"; s.style.top = 4 + Math.random() * 30 + "%";
      s.style.animationDelay = (Math.random() * 3).toFixed(2) + "s"; cielo.append(s);
    }
    cielo.append(nodo("span", "noche-luna"));
    el.titulo = nodo("p", "noche-titulo"); el.titulo.id = "noche-titulo";
    el.sub = nodo("p", "small-note");
    el.sueno = nodo("p", "noche-sueno");
    el.acostarme = nodo("button", null, "Me voy a dormir 🌙"); el.acostarme.type = "button";
    el.ver = nodo("button", "ghost", "Ver nuestra noche"); el.ver.type = "button";
    el.despertar = nodo("button", "ghost", "Buenos días ☀️"); el.despertar.type = "button";
    const botones = nodo("div", "noche-botones"); el.noDormir = nodo("button", "link", "No me voy a dormir todavía"); el.noDormir.type = "button";
    botones.append(el.acostarme, el.ver, el.despertar, el.noDormir);
    el.cuenta = nodo("p", "noche-cuenta");
    card.append(cielo, nodo("p", "eyebrow", "🌙 Dormir juntos"), el.titulo, el.sub, el.sueno, botones, el.cuenta);
    el.card = card;
    const ancla = document.getElementById("libre-status");
    if (ancla) ancla.after(card); else document.getElementById("tab-inicio").append(card);

    // la nochecita a pantalla completa
    const v = nodo("div", "noche-vista"); v.hidden = true;
    v.setAttribute("role", "dialog"); v.setAttribute("aria-modal", "true"); v.setAttribute("aria-labelledby", "nv-titulo");
    const estrellas = nodo("div", "nv-estrellas"); estrellas.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 40; i++) {
      const s = nodo("i"), t = 1 + Math.random() * 2;
      s.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 75}%;width:${t}px;height:${t}px;` +
        `animation-duration:${(2.5 + Math.random() * 3).toFixed(2)}s;animation-delay:${(Math.random() * 3).toFixed(2)}s`;
      estrellas.append(s);
    }
    const luna = nodo("span", "nv-luna"); luna.setAttribute("aria-hidden", "true");
    el.cerrar = nodo("button", "nv-cerrar", "✕"); el.cerrar.type = "button"; el.cerrar.setAttribute("aria-label", "Cerrar la noche");
    const cama = nodo("div", "nv-cama"); cama.setAttribute("aria-hidden", "true");
    el.avSuyo = nodo("span", "avatar"); el.avSuyo.dataset.av = "suyo";
    el.avMio = nodo("span", "avatar"); el.avMio.dataset.av = "mio";
    cama.append(el.avSuyo, el.avMio, nodo("span", "nv-manta"), nodo("span", "nv-z z1", "z"), nodo("span", "nv-z z2", "z"), nodo("span", "nv-z z3", "Z"));
    el.vTitulo = nodo("h2", "nv-titulo mano"); el.vTitulo.id = "nv-titulo";
    el.vTiempo = nodo("p", "nv-tiempo");
    el.vHoras = nodo("p", "nv-horas");
    el.vFrase = nodo("p", "nv-frase");
    el.vBoton = nodo("button", null, "Buenos días ☀️"); el.vBoton.type = "button";
    const cont = nodo("div", "nv-cont"); el.vNoDormir = nodo("button", "link nv-no-dormir", "No me voy a dormir todavía"); el.vNoDormir.type = "button";
    cont.append(cama, el.vTitulo, el.vTiempo, el.vHoras, el.vFrase, el.vBoton, el.vNoDormir);
    v.append(estrellas, luna, el.cerrar, cont);
    document.body.append(v);
    el.vista = v;

    // "Buenos días": se puede contar qué soñó
    const d = nodo("dialog", "dlg"); d.id = "dlg-despertar";
    d.innerHTML = `<form method="dialog" class="stack">
      <h2>☀️ ¡Buenos días!</h2>
      <p class="small-note" id="despertar-ayuda"></p>
      <label for="sueno-in" class="sr">Lo que soñaste</label>
      <textarea id="sueno-in" maxlength="280" rows="3" placeholder="Soñé que por fin…"></textarea>
      <button type="submit">Mandar los buenos días ☀️</button>
      <button type="button" class="link" id="despertar-cancelar">Cancelar</button>
    </form>`;
    document.body.append(d);
    el.dlg = d;

    el.acostarme.addEventListener("click", acostarme);
    el.ver.addEventListener("click", () => abrirVista());
    el.despertar.addEventListener("click", pedirDespertar);
    el.vBoton.addEventListener("click", () => (estado().mia ? pedirDespertar() : acostarme()));
    el.cerrar.addEventListener("click", cerrarVista);
    el.noDormir.addEventListener("click", noDormir);
    el.vNoDormir.addEventListener("click", noDormir);
    v.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarVista(); });
    d.querySelector("#despertar-cancelar").addEventListener("click", () => d.close());
    d.querySelector("form").addEventListener("submit", despertar);
  }

  function pintar() {
    if (!X || !el) return;
    const nom = (X.otro && X.otro.nombre) || "tu pareja", tz = X.miTz();
    const { mia, suya } = estado();
    const mapa = nochesJuntos(), total = mapa.size, r = racha(mapa);
    const h = X.partes(new Date().toISOString(), tz).h;
    el.card.classList.toggle("activa", !!(mia || suya) || h >= 20 || h < 5);

    if (mia && suya) {
      const desde = Math.max(ms(mia.inicio), ms(suya.inicio));
      el.titulo.textContent = "Durmiendo juntos 💞";
      el.sub.textContent = `Desde las ${X.hora(new Date(desde).toISOString(), tz)} · llevan ${duracion(Date.now() - desde)}`;
    } else if (mia) {
      el.titulo.textContent = "Ya estás en la camita 💤";
      el.sub.textContent = `Ya le avisamos a ${nom} 💌 Cuando se acueste empieza su noche juntos.`;
    } else if (suya) {
      el.titulo.textContent = `${nom} ya está en la camita 💤`;
      el.sub.textContent = `Se acostó a las ${X.hora(suya.inicio, tz)} (tu hora) y te espera.`;
    } else {
      // de mañana, la noche que acaba de terminar es la de "ayer"; de tarde o de noche, "anoche" fue la anterior
      const k = claveNoche(Date.now()), hoyK = X.claveDia(new Date().toISOString(), X.tzPareja());
      const anoche = mapa.get(k === hoyK ? diaAntes(k) : k);
      el.titulo.textContent = h >= 20 || h < 5 ? "¿Ya es hora de dormir?" : "Esta noche, a dormir juntos";
      el.sub.textContent = anoche ? `Anoche durmieron juntos ${duracion(anoche)} 💞`
        : "Cuando se vayan a dormir, toquen los dos «Me voy a dormir» 🌙";
    }

    // cómo despertó (con lo que soñó), si fue en las últimas horas y yo no estoy acostado
    const ultima = noches.find((n) => n.usuario_id !== X.user.id && n.fin);
    const reciente = ultima && Date.now() - ms(ultima.fin) < 14 * H && !suya;
    el.sueno.hidden = !reciente || !!mia;
    if (reciente) el.sueno.textContent = ultima.sueno
      ? `☀️ ${nom} soñó: “${ultima.sueno}”`
      : `☀️ ${nom} despertó a las ${X.hora(ultima.fin, tz)} y te dio los buenos días`;

    el.acostarme.hidden = !!mia;
    el.acostarme.textContent = suya ? `Acostarme con ${nom} 🌙` : "Me voy a dormir 🌙";
    el.ver.hidden = !(mia || suya);
    el.despertar.hidden = !mia;
    el.noDormir.hidden = !mia;
    el.cuenta.textContent = total
      ? `💤 ${total.toLocaleString("es")} ${total === 1 ? "noche" : "noches"} durmiendo juntos` + (r >= 2 ? ` · 🔥 ${r} seguidas` : "")
      : "";
    if (!el.vista.hidden) pintarVista();
  }

  function pintarVista() {
    const nom = (X.otro && X.otro.nombre) || "tu pareja", tz = X.miTz();
    const { mia, suya } = estado();
    if (!mia && !suya) { cerrarVista(); return; }
    const juntos = !!(mia && suya);
    el.vista.classList.toggle("ambos", juntos);
    el.avMio.classList.toggle("vacio", !mia);
    el.avSuyo.classList.toggle("vacio", !suya);
    if (juntos) {
      const desde = Math.max(ms(mia.inicio), ms(suya.inicio));
      el.vTitulo.textContent = "Durmiendo juntos";
      el.vTiempo.textContent = `${duracion(Date.now() - desde)} · desde las ${X.hora(new Date(desde).toISOString(), tz)}`;
    } else if (mia) {
      el.vTitulo.textContent = `Esperando a ${nom}…`;
      el.vTiempo.textContent = `Te acostaste a las ${X.hora(mia.inicio, tz)} · ${nom} ya lo sabe 💌`;
    } else {
      el.vTitulo.textContent = `${nom} ya está en la camita`;
      el.vTiempo.textContent = `Desde las ${X.hora(suya.inicio, tz)} (tu hora) · te está esperando`;
    }
    const ahora = new Date().toISOString();
    el.vHoras.textContent = `Tú ${X.hora(ahora, tz)} · ${nom} ${X.hora(ahora, X.suTz())}`;
    const k = claveNoche(Date.now());
    el.vFrase.textContent = FRASES[[...k].reduce((a, c) => a + c.charCodeAt(0), 0) % FRASES.length];
    el.vBoton.textContent = mia ? "Buenos días ☀️" : `Acostarme con ${nom} 🌙`;
    el.vNoDormir.hidden = !mia;
  }

  function abrirVista() {
    if (!el.vista.hidden) return;
    foco = document.activeElement;
    X.renderAvatares();
    el.vista.classList.remove("sale");
    el.vista.hidden = false;
    document.body.classList.add("con-noche");
    pintarVista();
    el.cerrar.focus();
  }
  function cerrarVista() {
    if (el.vista.hidden || el.vista.classList.contains("sale")) return;
    const fin = () => { el.vista.hidden = true; el.vista.classList.remove("sale"); };
    document.body.classList.remove("con-noche");
    if (X.pocoMovimiento()) fin();
    else { el.vista.classList.add("sale"); setTimeout(fin, 260); }
    if (foco && foco.focus) foco.focus();
  }

  // ---------- acciones ----------
  // Me equivoqué (o era una siesta que no fue): se borra mi noche abierta y todo vuelve como antes
  async function noDormir() {
    el.noDormir.disabled = el.vNoDormir.disabled = true;
    const { data, error } = await X.sb.rpc("cancelar_noche");
    el.noDormir.disabled = el.vNoDormir.disabled = false;
    if (error) { X.toast("No se pudo, intenta otra vez"); return; }
    if (data) quitar(data);
    cerrarVista();
    X.toast("Listo, deshicimos el «me voy a dormir» 💛");
  }
  async function acostarme() {
    const nom = (X.otro && X.otro.nombre) || "tu pareja";
    const { suya } = estado();
    el.acostarme.disabled = true; el.vBoton.disabled = true;
    const { data, error } = await X.sb.rpc("acostarme");
    el.acostarme.disabled = false; el.vBoton.disabled = false;
    if (error || !data || !data.id) { X.toast("No se pudo guardar, intenta otra vez"); return; }
    guardar(data);
    X.toast(suya ? "A dormir juntos 💞 Que sueñen bonito" : `Le avisamos a ${nom} que ya te acostaste 🌙`);
    abrirVista();
    if (suya) { el.avMio.classList.add("llega"); setTimeout(() => el.avMio.classList.remove("llega"), 500); }
  }
  function pedirDespertar() {
    const nom = (X.otro && X.otro.nombre) || "tu pareja";
    el.dlg.querySelector("#despertar-ayuda").textContent = `¿Soñaste algo? Cuéntaselo a ${nom} (si quieres).`;
    el.dlg.querySelector("#sueno-in").value = "";
    el.dlg.showModal();
  }
  async function despertar(e) {
    e.preventDefault();
    const nom = (X.otro && X.otro.nombre) || "tu pareja";
    const btn = el.dlg.querySelector("button[type=submit]");
    btn.disabled = true;
    const { data, error } = await X.sb.rpc("despertar", { p_sueno: el.dlg.querySelector("#sueno-in").value.trim() || null });
    btn.disabled = false;
    if (error || !data || !data.id) { X.toast("No se pudo guardar, intenta otra vez"); return; }
    el.dlg.close();
    guardar(data);
    cerrarVista();
    X.toast(`Buenos días ☀️ ${nom} ya lo sabe`);
    X.estallido(el.card, "☀️", 8);
  }

  // ---------- datos ----------
  let cambiadas = null; // mientras hay una recarga en camino: las noches guardadas aquí, que no se pisan
  // una noche borrada ("No me voy a dormir todavía") no vuelve aunque llegue una recarga vieja
  const borradas = new Set();
  function quitar(id) {
    borradas.add(id);
    if (cambiadas) cambiadas.delete(id);
    noches = noches.filter((n) => n.id !== id);
    pintar();
  }
  function guardar(n) {
    if (cambiadas) cambiadas.set(n.id, n);
    const i = noches.findIndex((x) => x.id === n.id);
    if (i >= 0) noches[i] = n; else noches.push(n);
    noches.sort((a, b) => ms(b.inicio) - ms(a.inicio));
    pintar();
  }
  async function cargar() {
    const mias = (cambiadas = cambiadas || new Map());
    const { data, error } = await X.sb.from("noches").select("id, usuario_id, inicio, fin, sueno")
      .eq("pareja_id", X.pareja.id).order("inicio", { ascending: false }).limit(1000);
    if (cambiadas === mias) cambiadas = null;
    if (error) return; // sin red se queda lo que ya había en pantalla
    // lo guardado mientras tanto ("Buenos días", "Me voy a dormir", tiempo real) manda sobre lo cargado
    const nuevas = (data || []).filter((n) => !borradas.has(n.id)).map((n) => mias.get(n.id) || n);
    mias.forEach((n, id) => { if (!nuevas.some((x) => x.id === id)) nuevas.push(n); });
    nuevas.sort((a, b) => ms(b.inicio) - ms(a.inicio));
    noches = nuevas;
    pintar();
  }

  function suscribir() {
    if (canal) X.sb.removeChannel(canal);
    canal = X.sb.channel(`noches-${X.pareja.id}`).on("postgres_changes",
      { event: "*", schema: "public", table: "noches", filter: `pareja_id=eq.${X.pareja.id}` },
      (p) => {
        if (p.eventType === "DELETE") { if (p.old && p.old.id) quitar(p.old.id); return; }
        if (!p.new || !p.new.id) return;
        const llega = p.eventType === "INSERT" && p.new.usuario_id !== X.user.id;
        guardar(p.new);
        if (llega && !el.vista.hidden) { el.avSuyo.classList.add("llega"); setTimeout(() => el.avSuyo.classList.remove("llega"), 500); }
      }).subscribe();
  }
  function iniciar() {
    X = window.nosotros;
    if (!X || !X.pareja) return;
    montar();
    cargar();
    suscribir();
    clearInterval(timer);
    timer = setInterval(pintar, 30000);
  }
  // al volver a la app (p. ej. en la mañana) se trae lo último por si el tiempo real se durmió
  document.addEventListener("visibilitychange", () => { if (!document.hidden && X && el) cargar(); });
  // app.js avisa cuando se pone al día tras un rato en segundo plano: si el canal se cayó, se vuelve a abrir
  window.addEventListener("nosotros:aldia", () => {
    if (X && el && (!canal || canal.state === "closed" || canal.state === "errored")) suscribir();
  });

  window.addEventListener("nosotros:dentro", iniciar);
  if (window.nosotros) iniciar();
})();
