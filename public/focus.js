// Concentrarnos juntos ⏳
// Un rato de estudio o trabajo a la par, cada uno en su teléfono. Uno propone (cuántos minutos, rondas, descanso y en
// qué va a trabajar), el otro dice "¡Vamos!" y arranca el mismo reloj en los dos: dos velitas (una de cada uno) que se
// van consumiendo, pausa y "+5 min" para los dos, descanso entre rondas y una celebración al terminar.
// La sesión vive en la tabla focos (funciones foco_* de schema.sql) y el reloj usa la hora del servidor, así que sigue
// bien aunque se cierre la app. app.js deja lo que hace falta en window.nosotros y avisa con "nosotros:dentro".
(() => {
  "use strict";
  const ACTIVAS = ["preparando", "foco", "descanso", "pausa"];
  const CORRIENDO = ["cuenta", "foco", "descanso", "pausa"];
  const PROPUESTA_MAX = 2 * 3600e3; // una propuesta sin respuesta caduca (igual que en la base)
  const DURACIONES = [25, 45, 60, 90], DESCANSOS = [0, 5, 10, 15];
  const IDEAS = ["Estudiar", "Trabajar", "Leer", "Tareas"];
  const ALTO_CERA = 96; // px de una velita entera (igual que en focus.css)

  let X = null, foco = null, semana = 0, canal = null, vivo = null, el = null, tic = null, sel = null;
  let desfase = 0, avanzando = "", otroAqui = false, wake = null, audio = null, volverA = null, ultimo = null;
  let conf = leer("foco-conf", { minutos: 45, descanso: 10, rondas: 1, tarea: "" });
  let sonido = leer("foco-sonido", true);

  // ---------- utilidades ----------
  function leer(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
  function anotar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  const ahora = () => Date.now() + desfase;
  const ms = (iso) => (iso ? new Date(iso).getTime() : 0);
  const nodo = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const boton = (txt, cls) => { const b = nodo("button", cls, txt); b.type = "button"; return b; };
  const poner = (e, txt) => { if (e.textContent !== txt) e.textContent = txt; };
  const nom = () => (X.otro && X.otro.nombre) || "tu pareja";
  const yo = () => X.user.id;
  const activa = (f) => !!f && ACTIVAS.includes(f.fase) && !(f.fase === "preparando" && ahora() - ms(f.actualizado_en) > PROPUESTA_MAX);
  const tareaDe = (f, uid) => (f && f.tareas && f.tareas[uid]) || "";
  function reloj(t) { // 1:05:00 · 45:00 · 0:09
    const s = Math.max(0, Math.ceil(t / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  }
  const durTxt = (min) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}` : `${min} min`);
  function plan(f) {
    let t = `${f.minutos} min`;
    if (f.rondas > 1) t += ` × ${f.rondas} rondas` + (f.descanso ? ` con ${f.descanso} min de descanso` : "");
    return t;
  }

  // ¿En qué va? nada · espero (ya dije ¡vamos!) · me-esperan · cuenta (3, 2, 1) · foco · descanso · pausa
  function estado() {
    if (!activa(foco)) return "nada";
    if (foco.fase === "preparando") return foco.listos.includes(yo()) ? "espero" : "me-esperan";
    if (foco.fase === "foco" && ahora() < ms(foco.fase_inicio)) return "cuenta";
    return foco.fase;
  }
  function restante() {
    if (foco.fase === "pausa") return foco.restante_ms || 0;
    return Math.max(0, Math.min(foco.fase_total_ms, ms(foco.fase_fin) - ahora()));
  }

  // Campanitas suaves al empezar y al terminar (el audio se habilita con el primer toque)
  function despertarAudio() {
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === "suspended") audio.resume(); } catch (e) {}
  }
  function tono(notas) {
    if (!sonido || !audio) return;
    try {
      notas.forEach((f, i) => {
        const t = audio.currentTime + i * 0.16, o = audio.createOscillator(), g = audio.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 1);
      });
    } catch (e) {}
  }
  // Pantalla encendida mientras el reloj está a la vista y corriendo
  async function pantallaEncendida(si) {
    try {
      if (si && !wake && "wakeLock" in navigator && !document.hidden) {
        wake = await navigator.wakeLock.request("screen");
        wake.addEventListener("release", () => { wake = null; });
      } else if (!si && wake) { const w = wake; wake = null; await w.release(); }
    } catch (e) { wake = null; }
  }
  function ideas(input) {
    const caja = nodo("div", "fd-ideas");
    IDEAS.forEach((t) => { const b = boton(t); b.addEventListener("click", () => { input.value = t; input.focus(); }); caja.append(b); });
    return caja;
  }

  // ---------- tarjeta del Inicio, configuración y reloj a pantalla completa ----------
  function montar() {
    if (el) return;
    el = {};
    const card = nodo("section", "foco-card"); card.id = "foco-card"; card.setAttribute("aria-labelledby", "foco-titulo");
    el.velitas = nodo("div", "foco-velitas"); el.velitas.setAttribute("aria-hidden", "true");
    el.velitas.append(nodo("i", "mia"), nodo("i", "suya"));
    el.titulo = nodo("p", "foco-titulo"); el.titulo.id = "foco-titulo";
    el.sub = nodo("p", "small-note foco-sub");
    el.tareaCaja = nodo("div", "foco-tarea");
    const lab = nodo("label", null, "¿En qué vas a trabajar tú?"); lab.htmlFor = "foco-tarea-in";
    el.tareaIn = nodo("input"); el.tareaIn.id = "foco-tarea-in"; el.tareaIn.maxLength = 60;
    el.tareaIn.placeholder = "Estudiar, un informe, leer…"; el.tareaIn.autocomplete = "off";
    el.tareaCaja.append(lab, el.tareaIn, ideas(el.tareaIn));
    el.proponer = boton("Proponer un rato de foco");
    el.vamos = boton("¡Vamos!");
    el.ver = boton("Volver al reloj");
    el.cambiar = boton("Cambiar", "ghost");
    el.cancelar = boton("Ahora no", "link");
    const botones = nodo("div", "foco-botones");
    botones.append(el.proponer, el.vamos, el.ver, el.cambiar, el.cancelar);
    el.semana = nodo("p", "foco-semana");
    card.append(el.velitas, nodo("p", "eyebrow", "Concentrarnos juntos"), el.titulo, el.sub, el.tareaCaja, botones, el.semana);
    // después de "Dormir juntos" (o de "Estoy libre", si esa tarjeta todavía no está)
    const ancla = document.getElementById("noche-card") || document.getElementById("libre-status");
    if (ancla) ancla.after(card); else document.getElementById("tab-inicio").append(card);
    el.card = card;

    el.proponer.addEventListener("click", () => abrirDialogo());
    el.cambiar.addEventListener("click", () => abrirDialogo());
    el.vamos.addEventListener("click", vamos);
    el.ver.addEventListener("click", abrirVista);
    el.cancelar.addEventListener("click", () => accion("foco_terminar", {}, el.cancelar));

    montarDialogo();
    montarVista();
  }

  function montarDialogo() {
    const d = nodo("dialog", "dlg dlg-foco"); d.id = "dlg-foco"; d.setAttribute("aria-labelledby", "fd-titulo");
    d.innerHTML = `
      <form class="stack" method="dialog">
        <h2 id="fd-titulo">Un rato de foco juntos</h2>
        <p class="small-note">Cada uno en su teléfono y en lo suyo, con el mismo reloj. Después se puede pausar y sumar minutos.</p>
        <div class="fd-tiempo">
          <button type="button" class="fd-paso" data-paso="-5" aria-label="Cinco minutos menos">−</button>
          <p class="fd-min"><b></b><span>minutos</span></p>
          <button type="button" class="fd-paso" data-paso="5" aria-label="Cinco minutos más">+</button>
        </div>
        <div class="fd-chips" data-campo="minutos" role="group" aria-label="Duraciones rápidas">
          ${DURACIONES.map((m) => `<button type="button" data-v="${m}">${m} min</button>`).join("")}</div>
        <p class="fd-label">Rondas</p>
        <div class="fd-rondas">
          <button type="button" class="fd-paso" data-rondas="-1" aria-label="Una ronda menos">−</button>
          <b aria-live="polite"></b>
          <button type="button" class="fd-paso" data-rondas="1" aria-label="Una ronda más">+</button>
        </div>
        <div class="fd-descanso">
          <p class="fd-label">Descanso entre rondas</p>
          <div class="fd-chips" data-campo="descanso" role="group" aria-label="Descanso entre rondas">
            ${DESCANSOS.map((m) => `<button type="button" data-v="${m}">${m ? `${m} min` : "Sin descanso"}</button>`).join("")}</div>
        </div>
        <p class="fd-resumen"></p>
        <label for="fd-tarea">¿En qué vas a trabajar?</label>
        <input id="fd-tarea" maxlength="60" placeholder="Estudiar, un informe, leer…" autocomplete="off">
        <button type="submit" class="fd-ok"></button>
        <button type="button" class="link fd-cerrar">Cancelar</button>
      </form>`;
    document.body.append(d);
    el.dlg = d;
    el.dMin = d.querySelector(".fd-min b");
    el.dRondas = d.querySelector(".fd-rondas b");
    el.dDescanso = d.querySelector(".fd-descanso");
    el.dResumen = d.querySelector(".fd-resumen");
    el.dTarea = d.querySelector("#fd-tarea");
    el.dOk = d.querySelector(".fd-ok");
    el.dTarea.after(ideas(el.dTarea));
    d.querySelectorAll("[data-paso]").forEach((b) => b.addEventListener("click", () => {
      sel.minutos = Math.min(180, Math.max(5, sel.minutos + Number(b.dataset.paso))); pintarDialogo();
    }));
    d.querySelectorAll("[data-rondas]").forEach((b) => b.addEventListener("click", () => {
      sel.rondas = Math.min(6, Math.max(1, sel.rondas + Number(b.dataset.rondas))); pintarDialogo();
    }));
    d.querySelectorAll(".fd-chips[data-campo] button").forEach((b) => b.addEventListener("click", () => {
      sel[b.parentNode.dataset.campo] = Number(b.dataset.v); pintarDialogo();
    }));
    d.querySelector(".fd-cerrar").addEventListener("click", () => d.close());
    d.querySelector("form").addEventListener("submit", proponer);
  }

  function montarVista() {
    const v = nodo("div", "fv"); v.id = "foco-vista"; v.hidden = true;
    v.setAttribute("role", "dialog"); v.setAttribute("aria-modal", "true"); v.setAttribute("aria-labelledby", "fv-fase");
    const vela = (quien) => `
      <figure class="fv-vela ${quien} apagada">
        <div class="fv-velita"><span class="fv-llama"></span><span class="fv-humo"></span><span class="fv-cera"></span></div>
        <figcaption><b></b><span class="fv-tarea"></span><small></small></figcaption>
      </figure>`;
    v.innerHTML = `
      <div class="fv-luz" aria-hidden="true"></div>
      <button type="button" class="fv-boton fv-cerrar" aria-label="Minimizar el reloj"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
      <button type="button" class="fv-boton fv-sonido" aria-label="Sonido"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path class="fv-ondas" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/><path class="fv-mudo" d="M16 9.5l5 5M21 9.5l-5 5"/></svg></button>
      <div class="fv-cuerpo">
        <p class="fv-fase" id="fv-fase"></p>
        <div class="fv-reloj">
          <svg class="fv-anillo" viewBox="0 0 220 220" aria-hidden="true"><circle class="fv-pista" cx="110" cy="110" r="100"/><circle class="fv-progreso" cx="110" cy="110" r="100" pathLength="1"/></svg>
          <div class="fv-centro"><p class="fv-tiempo"></p><p class="fv-para"></p></div>
        </div>
        <div class="fv-velas">${vela("mia")}${vela("suya")}</div>
        <div class="fv-acciones">
          <button type="button" class="ghost fv-pausa">Pausar</button>
          <button type="button" class="ghost fv-mas">+5 min</button>
        </div>
        <button type="button" class="link fv-terminar">Terminar el rato</button>
        <div class="fv-fin" hidden>
          <p class="fv-fin-titulo"></p>
          <p class="fv-fin-texto"></p>
          <p class="small-note fv-fin-semana"></p>
          <div class="fv-fin-botones"><button type="button" class="fv-otro">Otro rato</button><button type="button" class="ghost fv-listo">Cerrar</button></div>
        </div>
      </div>
      <p class="sr" aria-live="polite"></p>`;
    document.body.append(v);
    const q = (s) => v.querySelector(s);
    Object.assign(el, {
      v, fase: q(".fv-fase"), tiempo: q(".fv-tiempo"), para: q(".fv-para"), anillo: q(".fv-progreso"),
      mia: q(".fv-vela.mia"), suya: q(".fv-vela.suya"), pausa: q(".fv-pausa"), mas: q(".fv-mas"), terminar: q(".fv-terminar"),
      fin: q(".fv-fin"), finTitulo: q(".fv-fin-titulo"), finTexto: q(".fv-fin-texto"), finSemana: q(".fv-fin-semana"),
      cerrar: q(".fv-cerrar"), sonido: q(".fv-sonido"), anuncio: v.querySelector(".sr"),
    });
    el.mia.querySelector("b").textContent = "Tú";
    el.cerrar.addEventListener("click", cerrarVista);
    el.sonido.addEventListener("click", () => { sonido = !sonido; anotar("foco-sonido", sonido); despertarAudio(); pintarSonido(); });
    el.pausa.addEventListener("click", () => accion(foco.fase === "pausa" ? "foco_seguir" : "foco_pausar", {}, el.pausa));
    el.mas.addEventListener("click", () => accion("foco_sumar", { p_minutos: 5 }, el.mas));
    el.terminar.addEventListener("click", () => {
      if (estado() !== "espero" && !confirm("¿Terminar el rato de foco para los dos?")) return;
      accion("foco_terminar", {}, el.terminar);
    });
    q(".fv-otro").addEventListener("click", () => { cerrarVista(); abrirDialogo(); });
    q(".fv-listo").addEventListener("click", cerrarVista);
    v.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarVista(); });
    pintarSonido();
  }
  function pintarSonido() {
    el.sonido.setAttribute("aria-pressed", String(sonido));
    el.sonido.setAttribute("aria-label", sonido ? "Silenciar las campanitas" : "Activar las campanitas");
  }

  function pintarCard() {
    if (!el) return;
    const e = estado(), f = foco, q = nom();
    let titulo, sub;
    if (e === "nada") {
      titulo = "Estudiar o trabajar a la par";
      sub = "Uno propone, los dos dicen «¡vamos!» y corre el mismo reloj en los dos teléfonos.";
    } else if (e === "espero") {
      titulo = `Esperando a que ${q} diga «¡vamos!»`;
      sub = plan(f) + (tareaDe(f, yo()) ? ` · tú: ${tareaDe(f, yo())}` : "");
    } else if (e === "me-esperan") {
      titulo = `${q} quiere concentrarse contigo`;
      const t = tareaDe(f, f.creado_por);
      sub = plan(f) + (t ? ` · ${q}: ${t}` : "");
    } else {
      titulo = e === "descanso" ? "En el descanso" : e === "pausa" ? "En pausa" : "Concentrándose juntos";
      sub = (e === "cuenta" ? "empieza en unos segundos" : `quedan ${reloj(restante())}`) + (f.rondas > 1 ? ` · ronda ${f.ronda} de ${f.rondas}` : "");
    }
    poner(el.titulo, titulo); poner(el.sub, sub);
    if (e === "me-esperan" && el.tareaCaja.hidden && !el.tareaIn.value) el.tareaIn.value = conf.tarea || "";
    el.tareaCaja.hidden = e !== "me-esperan";
    el.proponer.hidden = e !== "nada";
    el.vamos.hidden = e !== "me-esperan";
    el.ver.hidden = !(e === "espero" || CORRIENDO.includes(e));
    el.cambiar.hidden = e !== "espero";
    el.cancelar.hidden = !(e === "espero" || e === "me-esperan");
    poner(el.cancelar, e === "espero" ? "Cancelar" : "Ahora no");
    poner(el.ver, e === "espero" ? "Ver" : "Volver al reloj");
    el.ver.classList.toggle("ghost", e === "espero");
    poner(el.semana, semana ? `Esta semana: ${durTxt(semana)} de foco juntos` : "");
    // las velitas chiquitas: encendida la de quien ya dijo ¡vamos!, las dos mientras corre
    const corre = ["cuenta", "foco", "pausa"].includes(e);
    el.velitas.classList.toggle("mia-on", corre || e === "espero");
    el.velitas.classList.toggle("suya-on", corre || e === "me-esperan");
    el.card.classList.toggle("activa", e !== "nada");
  }

  function abrirDialogo() {
    const f = estado() === "espero" ? foco : null; // "Cambiar" lo que ya propuse
    sel = { minutos: f ? f.minutos : conf.minutos, descanso: f ? f.descanso : conf.descanso, rondas: f ? f.rondas : conf.rondas };
    el.dTarea.value = f ? tareaDe(f, yo()) : conf.tarea || "";
    poner(el.dOk, f ? "Guardar el cambio" : `Proponer y esperar a ${nom()}`);
    pintarDialogo();
    el.dlg.showModal();
  }
  function pintarDialogo() {
    poner(el.dMin, String(sel.minutos));
    el.dlg.querySelectorAll(".fd-chips[data-campo] button").forEach((b) =>
      b.setAttribute("aria-pressed", String(Number(b.dataset.v) === sel[b.parentNode.dataset.campo])));
    poner(el.dRondas, sel.rondas === 1 ? "1 ronda" : `${sel.rondas} rondas`);
    el.dDescanso.hidden = sel.rondas === 1;
    const total = sel.rondas * sel.minutos + (sel.rondas - 1) * (sel.rondas > 1 ? sel.descanso : 0);
    const fin = new Date(ahora() + total * 60000 + 4000).toISOString();
    poner(el.dResumen, `${durTxt(total)} en total · terminan a las ${X.hora(fin, X.miTz())} tú · ${X.hora(fin, X.suTz())} ${nom()}`);
  }

  // ---------- el reloj a pantalla completa ----------
  function abrirVista() {
    if (!el.v.hidden) { pintarVista(); return; }
    volverA = document.activeElement;
    el.fin.hidden = true;
    el.v.classList.remove("sale", "terminado");
    el.v.hidden = false;
    document.body.classList.add("con-foco");
    pintarVista(); marcarPresencia();
    el.cerrar.focus();
    if (CORRIENDO.includes(estado())) pantallaEncendida(true);
  }
  function cerrarVista() {
    if (el.v.hidden || el.v.classList.contains("sale")) return;
    const fin = () => { el.v.hidden = true; el.v.classList.remove("sale"); marcarPresencia(); };
    document.body.classList.remove("con-foco");
    pantallaEncendida(false);
    if (X.pocoMovimiento()) fin(); else { el.v.classList.add("sale"); setTimeout(fin, 260); }
    if (volverA && volverA.focus) volverA.focus();
  }
  function prender(vela, si) {
    const antes = !vela.classList.contains("apagada");
    vela.classList.toggle("apagada", !si);
    if (si && !antes && !el.v.hidden) { vela.classList.add("prende"); setTimeout(() => vela.classList.remove("prende"), 700); }
  }
  function pintarVista() {
    if (!el || el.v.hidden || !el.fin.hidden) return;
    const e = estado(), f = foco;
    if (e === "nada" || e === "me-esperan") { cerrarVista(); return; }
    const q = nom(), corre = CORRIENDO.includes(e);
    el.v.classList.toggle("descanso", e === "descanso");
    el.v.classList.toggle("pausa", e === "pausa");
    // arriba: en qué van
    const ronda = f.rondas > 1 ? `Ronda ${f.ronda} de ${f.rondas} · ` : "";
    poner(el.fase, e === "espero" ? `Esperando a ${q}…` : e === "cuenta" ? "Preparados, listos…"
      : e === "pausa" ? "En pausa" : e === "descanso" ? `${ronda}descanso` : `${ronda}a concentrarse`);
    // el reloj
    let tiempo, para, resto = 1;
    if (e === "espero") { tiempo = reloj(f.minutos * 60000); para = `cuando ${q} diga «¡vamos!»`; }
    else if (e === "cuenta") {
      const n = Math.max(1, Math.ceil((ms(f.fase_inicio) - ahora()) / 1000));
      tiempo = String(Math.min(3, n)); para = "¡a concentrarse!";
    } else {
      const r = restante();
      resto = f.fase_total_ms ? r / f.fase_total_ms : 0;
      tiempo = reloj(r);
      const ultima = f.ronda >= f.rondas;
      para = e === "pausa" ? "cuando sigan, sigue el reloj"
        : e === "descanso" ? "estírense, tomen agüita 💧"
        : ultima ? "para terminar" : f.descanso ? "para el descanso" : "para la siguiente ronda";
    }
    if (el.tiempo.textContent !== tiempo) {
      const cambio = e === "cuenta";
      el.tiempo.textContent = tiempo;
      if (cambio) { el.tiempo.classList.remove("pop"); void el.tiempo.offsetWidth; el.tiempo.classList.add("pop"); }
    }
    el.tiempo.classList.toggle("cuenta", e === "cuenta");
    el.tiempo.classList.toggle("largo", tiempo.length > 5);
    poner(el.para, para);
    el.anillo.style.strokeDashoffset = String(1 - Math.max(0, Math.min(1, resto)));
    // las velitas: se consumen con la ronda; en el descanso se apagan (y humean)
    const cera = e === "descanso" ? 0.12 : e === "foco" || e === "pausa" ? Math.max(0.06, resto) : 1;
    [el.mia, el.suya].forEach((vela) => {
      const v = vela.querySelector(".fv-velita");
      v.style.setProperty("--resto", cera.toFixed(4));
      v.style.setProperty("--baja", `${((1 - cera) * ALTO_CERA).toFixed(1)}px`);
      vela.classList.toggle("humea", e === "descanso");
    });
    prender(el.mia, e !== "descanso");
    prender(el.suya, e === "cuenta" || e === "foco" || e === "pausa" || (e === "espero" && f.listos.length > 1));
    // quién es quién y en qué está
    poner(el.mia.querySelector(".fv-tarea"), tareaDe(f, yo()));
    poner(el.suya.querySelector("b"), q);
    poner(el.suya.querySelector(".fv-tarea"), tareaDe(f, X.otro && X.otro.id));
    poner(el.suya.querySelector("small"), e === "espero" ? "todavía no se suma"
      : corre ? (otroAqui ? "con el reloj a la vista" : "con el teléfono guardado 💪") : "");
    // botones
    el.pausa.hidden = el.mas.hidden = !(e === "foco" || e === "descanso" || e === "pausa");
    poner(el.pausa, e === "pausa" ? "Seguir" : "Pausar");
    poner(el.terminar, e === "espero" ? "Cancelar la propuesta" : "Terminar el rato");
  }

  function mostrarFin(n, natural, suyo) {
    const min = n.minutos_hechos || 0;
    el.v.classList.add("terminado");
    el.v.classList.remove("descanso", "pausa");
    [el.mia, el.suya].forEach((vela) => vela.classList.add("apagada", "humea"));
    poner(el.finTitulo, natural ? "¡Lo lograron!" : "Rato terminado");
    poner(el.finTexto, natural ? `Se concentraron ${durTxt(min)} juntos, cada uno en lo suyo 💪`
      : min ? `${suyo ? `${nom()} lo terminó. ` : ""}Alcanzaron ${durTxt(min)} de foco juntos.` : "Esta vez fue cortito. ¡El próximo sale!");
    poner(el.finSemana, semana ? `Esta semana: ${durTxt(semana)} de foco juntos` : "");
    el.fin.hidden = false;
    el.fin.querySelector(".fv-otro").focus();
  }

  // ---------- el pulso: un vistazo 4 veces por segundo mientras haya algo andando ----------
  function anunciar(t) { poner(el.anuncio, t); }
  function latir() {
    const e = estado();
    if (ultimo !== null && e !== ultimo) cambio(ultimo, e);
    ultimo = e;
    pintarCard(); pintarVista();
    if ((e === "foco" || e === "descanso") && restante() <= 0) avanzar();
    if (e === "nada" && tic) { clearInterval(tic); tic = null; }
  }
  function arrancar() { if (!tic && estado() !== "nada") tic = setInterval(latir, 250); latir(); }
  function cambio(antes, ahoraE) {
    const vista = !el.v.hidden;
    if (ahoraE === "cuenta") { anunciar("Empiezan en tres segundos"); if (vista) pantallaEncendida(true); }
    if (ahoraE === "foco" && (antes === "cuenta" || antes === "descanso")) {
      tono([523, 659, 784]); X.vibrar([40, 60, 40]); anunciar("A concentrarse");
    }
    if (ahoraE === "descanso" && antes === "foco") {
      tono([784, 659, 523]); X.vibrar([60, 60, 60]); anunciar("Descanso");
      if (!vista) X.toast(`¡Ronda lista! Descanso de ${foco.descanso} min 💧`);
    }
    if (ahoraE === "cuenta" && antes === "descanso" && !vista) X.toast("¡Otra ronda! A concentrarse 📚");
    if (ahoraE === "pausa") anunciar("En pausa");
  }

  // ---------- datos ----------
  // Cada cambio que llega (de mi teléfono o del suyo) pasa por aquí
  function aplicar(n) {
    if (!n || !n.id) return;
    if (foco && foco.id === n.id && ms(n.actualizado_en) < ms(foco.actualizado_en)) return; // llegó uno viejo
    const a = foco && foco.id === n.id ? foco : null;
    foco = n;
    if (a) transicion(a, n);
    arrancar();
  }
  function transicion(a, n) {
    const suyo = !!n.cambiado_por && n.cambiado_por !== yo(), q = nom();
    if (n.fase === "terminado" && a.fase !== "terminado") {
      const quedaba = a.fase === "pausa" ? a.restante_ms : ms(a.fase_fin) - ahora();
      terminar(n, a.fase === "foco" && quedaba < 3000, suyo);
    } else if (n.fase === "cancelado" && a.fase === "preparando") {
      cerrarVista();
      if (suyo) X.toast(a.listos.includes(yo()) ? `${q} no puede ahora 💛 Otro ratito será` : `${q} canceló la propuesta`);
    } else if (!suyo) {
      // lo hice yo: ya lo estoy viendo
    } else if (n.fase === "pausa" && a.fase !== "pausa") X.toast(`${q} puso pausa ⏸`);
    else if (a.fase === "pausa" && (n.fase === "foco" || n.fase === "descanso")) X.toast(`${q} siguió el reloj ▶`);
    else if (n.fase === a.fase && n.fase_total_ms > a.fase_total_ms) X.toast(`${q} sumó ${Math.round((n.fase_total_ms - a.fase_total_ms) / 60000)} min ⏳`);
    else if (n.fase === "preparando" && a.fase === "preparando" && (n.minutos !== a.minutos || n.rondas !== a.rondas)) X.toast(`${q} cambió la propuesta: ${plan(n)}`);
  }
  function terminar(n, natural, suyo) {
    pantallaEncendida(false);
    if (natural) {
      tono([784, 988, 1175, 1568]); X.vibrar([80, 60, 80, 60, 240]);
      X.lluvia("📚", 12); setTimeout(() => X.lluvia("💗", 16), 450);
    }
    // el final se muestra ya (si no, el reloj se cerraría al no quedar sesión activa); el total de la semana llega después
    const vista = !el.v.hidden;
    if (vista) mostrarFin(n, natural, suyo);
    else X.toast(natural ? `¡Terminaron su rato de foco! ${durTxt(n.minutos_hechos || 0)} juntos 🎉`
      : suyo ? `${nom()} terminó el rato de foco` : "Terminaste el rato de foco");
    cargarSemana().then(() => { if (vista) poner(el.finSemana, semana ? `Esta semana: ${durTxt(semana)} de foco juntos` : ""); });
  }
  async function avanzar() {
    const clave = foco.id + foco.fase + foco.fase_fin;
    if (avanzando === clave) return;
    avanzando = clave;
    const { data } = await X.sb.rpc("foco_avanzar", { p_id: foco.id, p_fase: foco.fase });
    if (data && data.id) aplicar(data);
  }
  async function accion(fn, args, b) {
    if (!foco) return;
    despertarAudio();
    if (b) b.disabled = true;
    const { data, error } = await X.sb.rpc(fn, { p_id: foco.id, ...args });
    if (b) b.disabled = false;
    if (error || !data || !data.id) { X.toast("No se pudo, intenta otra vez"); return; }
    aplicar(data);
  }
  async function proponer(e) {
    e.preventDefault();
    despertarAudio();
    const tarea = el.dTarea.value.trim();
    conf = { ...sel, tarea }; anotar("foco-conf", conf);
    el.dOk.disabled = true;
    const { data, error } = await X.sb.rpc("foco_proponer", {
      p_minutos: sel.minutos, p_descanso: sel.descanso, p_rondas: sel.rondas, p_tarea: tarea || null,
    });
    el.dOk.disabled = false;
    if (error || !data || !data.id) { X.toast("No se pudo proponer, intenta otra vez"); return; }
    el.dlg.close();
    const yaEmpieza = data.fase !== "preparando";
    aplicar(data);
    abrirVista();
    X.toast(yaEmpieza ? `${nom()} ya había propuesto: ¡empiezan! ⏳` : `Le avisamos a ${nom()} 📚`);
  }
  async function vamos() {
    despertarAudio();
    const tarea = el.tareaIn.value.trim();
    if (tarea) { conf.tarea = tarea; anotar("foco-conf", conf); }
    el.vamos.disabled = true;
    const { data, error } = await X.sb.rpc("foco_vamos", { p_id: foco.id, p_tarea: tarea || null });
    el.vamos.disabled = false;
    if (error || !data || !data.id) { X.toast("No se pudo, intenta otra vez"); return; }
    aplicar(data);
    abrirVista();
  }

  async function sincronizarHora() {
    const t0 = Date.now(), { data, error } = await X.sb.rpc("ahora"), t1 = Date.now();
    if (!error && data) desfase = ms(data) + (t1 - t0) / 2 - t1;
  }
  async function cargarSemana() {
    const desde = new Date(Date.now() - 7 * 86400e3).toISOString();
    const { data } = await X.sb.from("focos").select("minutos_hechos").eq("pareja_id", X.pareja.id).gte("creado_en", desde).limit(500);
    semana = (data || []).reduce((s, f) => s + (f.minutos_hechos || 0), 0);
    pintarCard();
  }
  async function cargar() {
    const [{ data }] = await Promise.all([
      X.sb.from("focos").select("*").eq("pareja_id", X.pareja.id).order("creado_en", { ascending: false }).limit(1).maybeSingle(),
      sincronizarHora(), cargarSemana(),
    ]);
    if (data) aplicar(data); else arrancar();
  }
  // ¿Mi pareja tiene el reloj abierto? (presencia propia de esta función)
  function marcarPresencia() {
    if (!vivo) return;
    const viendo = !!el && !el.v.hidden && !document.hidden;
    try { vivo.track({ viendo }); } catch (e) {}
  }

  function iniciar() {
    X = window.nosotros;
    if (!X || !X.pareja) return;
    montar();
    cargar();
    if (canal) X.sb.removeChannel(canal);
    canal = X.sb.channel(`focos-${X.pareja.id}`).on("postgres_changes",
      { event: "*", schema: "public", table: "focos", filter: `pareja_id=eq.${X.pareja.id}` },
      (p) => { if (p.new && p.new.id) aplicar(p.new); }).subscribe();
    if (vivo) X.sb.removeChannel(vivo);
    vivo = X.sb.channel(`foco-vivo-${X.pareja.id}`, { config: { presence: { key: X.user.id } } })
      .on("presence", { event: "sync" }, () => {
        const st = (X.otro && vivo.presenceState()[X.otro.id]) || [];
        otroAqui = st.some((x) => x.viendo);
        pintarVista();
      })
      .subscribe((s) => { if (s === "SUBSCRIBED") marcarPresencia(); });
  }
  // al volver a la app se trae lo último (el tiempo real se duerme con el teléfono) y vuelve la pantalla encendida
  document.addEventListener("visibilitychange", () => {
    if (!X || !el) return;
    marcarPresencia();
    if (document.hidden) return;
    cargar();
    if (!el.v.hidden && CORRIENDO.includes(estado())) pantallaEncendida(true);
  });

  window.addEventListener("nosotros:dentro", iniciar);
  if (window.nosotros) iniciar();
})();
