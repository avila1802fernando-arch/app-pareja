/* Recreo · juegos en familia — la app
   Arranque, entrada (tocar tu nombre y poner tu contraseña), personaje, pestañas, «Yo» y el modo prueba.
   Los datos van por datos.js (RecreoDatos), los juegos por juegos/sala.js (RecreoJuegos) y el ranking por ranking.js.
   Modo prueba: #prueba (se entra por la pantalla de nombres), #prueba=maritza (directo como ella),
   #prueba=eli-nuevo (para ver «Elige tu personaje»). En modo prueba no se crea el cliente de Supabase. */
(function () {
  "use strict";
  const C = window.RECREO_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const D = window.RecreoDatos;
  const PRUEBA = /^#prueba/.test(location.hash);
  const pruebaQuien = (location.hash.match(/^#prueba=([a-z]+)/) || [])[1] || null;
  const pruebaNuevo = /-nuevo$/.test(location.hash);

  // Colores de cada persona (para pintar en los juegos) y los personajes para elegir
  const COLORES = { azul: "#3B82F6", coral: "#E8603F", menta: "#0E9C82", uva: "#7A5AF0", sol: "#E8A400", hoja: "#3A9A3F" };
  const PERSONAJES = ["🦋", "🌺", "🦊", "🐧", "🐢", "🦜", "🦙", "🐼", "🐱", "🐶", "🦉", "🐝", "🐸", "🐬", "🦁", "🐨", "🐙", "🦄", "🌵", "🍍", "🌈", "⚽", "🎸", "🚀"];

  const leer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const anotar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const pocoMovimiento = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = (n) => Number(n || 0).toLocaleString("es");

  // ---------- letra grande (por teléfono) ----------
  const letraGrande = () => leer("recreo-letra") === "1";
  function ponerLetra(si) {
    anotar("recreo-letra", si ? "1" : "0");
    document.documentElement.style.setProperty("--escala", si ? "1.15" : "1");
    ["pj-letra", "aj-letra"].forEach((id) => $(id) && $(id).setAttribute("aria-checked", String(si)));
  }
  ponerLetra(letraGrande());

  // ---------- fechas en la zona del teléfono (copiadas de la otra app) ----------
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const pad = (n) => String(n).padStart(2, "0");
  function offsetMin(zona, date) {
    const p = {};
    new Intl.DateTimeFormat("en-US", { timeZone: zona, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(date).forEach((x) => (p[x.type] = x.value));
    const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((comoUtc - date.getTime()) / 60000);
  }
  function partes(iso, zona) {
    const p = {};
    new Intl.DateTimeFormat("en-US", { timeZone: zona, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })
      .formatToParts(new Date(iso)).forEach((x) => (p[x.type] = x.value));
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
  }
  const aWall = (iso, zona) => { const p = partes(iso, zona); return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`; };
  const claveDia = (iso, zona) => aWall(iso, zona).slice(0, 10);
  function aIso(wall, zona) {
    const [y, m, d, h, mi] = wall.split(/[-T:]/).map(Number);
    const comoUtc = Date.UTC(y, m - 1, d, h, mi);
    let utc = comoUtc - offsetMin(zona, new Date(comoUtc)) * 60000;
    utc = comoUtc - offsetMin(zona, new Date(utc)) * 60000; // segunda pasada por si cae en cambio de hora
    return new Date(utc).toISOString();
  }
  const diaHoy = () => claveDia(new Date().toISOString(), tz);
  function ago(iso) {
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60) return "hace un momento";
    if (d < 3600) return `hace ${Math.floor(d / 60)} min`;
    if (d < 86400) return `hace ${Math.floor(d / 3600)} h`;
    if (d < 172800) return "ayer";
    return `el ${new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", timeZone: tz })}`;
  }

  // ---------- avisos, lluvia de emojis y vibración ----------
  let toastTimer = null;
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 4000);
  }
  function lluvia(emoji, n = 16) {
    if (pocoMovimiento()) return;
    for (let i = 0; i < n; i++) {
      const s = document.createElement("span"); s.className = "lluvia"; s.textContent = emoji;
      s.style.left = Math.random() * 92 + "vw";
      s.style.fontSize = 20 + Math.random() * 24 + "px";
      s.style.animationDelay = Math.random() * 0.7 + "s";
      s.style.setProperty("--x", Math.round(Math.random() * 90 - 45) + "px");
      s.style.setProperty("--r", Math.round(Math.random() * 50 - 25) + "deg");
      document.body.append(s); setTimeout(() => s.remove(), 3500);
    }
  }
  const puedeVibrar = () => leer("recreo-vibrar") !== "0";
  const vibrar = (p) => { if (!puedeVibrar()) return; try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };
  const mudo = () => leer("recreo-mudo") === "1";
  function ponerMudo(si) {
    anotar("recreo-mudo", si ? "1" : "0");
    window.dispatchEvent(new Event("recreo:sonido"));
    pintarSonido();
  }
  function pintarSonido() {
    const b = $("btn-sonido");
    b.innerHTML = `<svg class="ico"><use href="#i-${mudo() ? "mudo" : "sonido"}"/></svg>`;
    b.setAttribute("aria-label", mudo() ? "Activar el sonido" : "Silenciar el sonido");
    b.setAttribute("aria-pressed", String(mudo()));
    $("aj-sonido").setAttribute("aria-checked", String(!mudo()));
  }
  $("btn-sonido").addEventListener("click", () => ponerMudo(!mudo()));
  window.addEventListener("recreo:sonido", pintarSonido);

  // ---------- pantallas ----------
  const PANTALLAS = ["entrada", "clave", "personaje", "aviso", "app"];
  function mostrar(nombre) {
    PANTALLAS.forEach((p) => ($("s-" + p).hidden = p !== nombre));
    $("tabs").hidden = nombre !== "app";
    document.body.classList.toggle("con-barra", nombre === "app");
    window.scrollTo(0, 0);
    quitarCarga();
  }
  // La carga se va con un fundido, pero no antes de que las fichas alcancen a armarse
  function quitarCarga() {
    const c = $("carga");
    if (!c || c.classList.contains("fuera")) return;
    setTimeout(() => { c.classList.add("fuera"); setTimeout(() => c.remove(), 500); }, Math.max(0, 1200 - performance.now()));
  }
  // El aviso lleva abajo el detalle técnico (errores anotados desde index.html y el navegador del teléfono):
  // así una captura de pantalla alcanza para saber qué pasó
  function aviso(msg, error) {
    $("aviso-msg").textContent = msg;
    const errores = (window.__errores || []).slice(-3);
    if (error) errores.push(String((error && error.message) || error));
    const det = $("aviso-detalle");
    det.hidden = !errores.length;
    det.textContent = errores.length ? `Detalle para Fernando: ${errores.join(" · ")} · ${navigator.userAgent}` : "";
    mostrar("aviso");
  }
  const SIN_CONEXION = "Revisa tu conexión a internet e intenta de nuevo.";
  // Si a los 10 s no apareció ninguna pantalla, se ofrece reintentar en vez de dejar la carga pegada
  setTimeout(() => {
    if (PANTALLAS.some((p) => !$("s-" + p).hidden)) return;
    aviso(SIN_CONEXION);
    $("aviso-reintentar").onclick = () => location.reload();
  }, 10000);

  // ---------- conexión ----------
  const sb = PRUEBA || !window.supabase ? null : window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "recreo-sesion" },
  });
  if ("serviceWorker" in navigator && !PRUEBA) navigator.serviceWorker.register("/sw.js").catch(() => {});
  let user = null;
  const YA_TIENEN = (C.YA_TIENEN_CUENTA || []).map((u) => u.toLowerCase());
  const correoDe = (u) => `${u}@${YA_TIENEN.includes(u) ? "nosotros.invalid" : "familia.invalid"}`;
  const esDeLaFamilia = () => PRUEBA ? !YA_TIENEN.includes(pruebaQuien || clave.usuario || "") : !!(user && /@familia\.invalid$/.test(user.email || ""));

  // ---------- ¿quién va a jugar? ----------
  function tarjetaPersona(p) {
    const b = document.createElement("button");
    b.type = "button"; b.className = `quien tarjeta c-${p.color}`;
    b.innerHTML = '<span class="av g" aria-hidden="true"></span><span><strong></strong><small>Toca para entrar</small></span><svg class="ico" aria-hidden="true"><use href="#i-flecha"/></svg>';
    b.querySelector(".av").textContent = p.avatar;
    b.querySelector("strong").textContent = p.nombre;
    b.addEventListener("click", () => elegirPersona(p, b));
    return b;
  }
  (C.FAMILIA || []).forEach((p) => $("personas").append(tarjetaPersona(p)));
  $("btn-otra-cuenta").addEventListener("click", otraCuenta);

  // ---------- contraseña ----------
  const clave = { usuario: "", nombre: "", modo: "entrar", otra: false };
  function ponerModo(modo) {
    clave.modo = modo;
    const crear = modo === "crear", elegir = modo === "elegir";
    $("clave-elegir").hidden = !elegir;
    $("f-clave").hidden = elegir;
    $("clave2-caja").hidden = !crear;
    $("clave").autocomplete = crear ? "new-password" : "current-password";
    $("btn-clave").textContent = crear ? "Crear y entrar" : "Entrar";
    $("clave-titulo").textContent = clave.otra ? "Entra con tu usuario" : crear || elegir ? `Hola, ${clave.nombre} 👋` : `¡Qué bueno verte, ${clave.nombre}!`;
    $("clave-texto").textContent = clave.otra ? "El mismo usuario y contraseña de siempre."
      : crear ? "Elige una contraseña (mínimo 8 letras o números). Anótala: te la pedimos una sola vez en este teléfono."
      : elegir ? "¿Es tu primera vez en el Recreo?" : "Escribe tu contraseña.";
    $("clave-olvido").hidden = crear || elegir;
    $("clave-error").textContent = "";
    if (!elegir) setTimeout(() => (clave.otra ? $("clave-usuario") : $("clave")).focus({ preventScroll: true }), 50);
  }
  function abrirClave(p) {
    clave.usuario = p ? p.usuario : ""; clave.nombre = p ? p.nombre : ""; clave.otra = !p;
    const av = $("clave-av");
    av.className = `av xg c-${p ? p.color : "azul"}`; av.textContent = p ? p.avatar : "👋";
    $("clave-usuario-caja").hidden = !!p;
    $("clave-usuario-oculto").hidden = !p;
    $("clave-usuario-oculto").value = clave.usuario;
    $("clave").value = $("clave2").value = "";
    mostrar("clave");
  }
  // ¿Ya tiene cuenta? Lo pregunta la función familia-cuenta, así Maritza no tiene que saberlo
  async function elegirPersona(p, boton) {
    boton.classList.add("cargando"); boton.disabled = true;
    let existe = null;
    if (PRUEBA) existe = p.usuario !== "maritza";
    else {
      try {
        const espera = new Promise((_, no) => setTimeout(() => no(new Error("tarde")), 8000));
        const { data, error } = await Promise.race([sb.functions.invoke("familia-cuenta", { body: { accion: "estado", usuario: p.usuario } }), espera]);
        if (!error && data && typeof data.existe === "boolean") existe = data.existe;
      } catch (e) {}
    }
    boton.classList.remove("cargando"); boton.disabled = false;
    abrirClave(p);
    ponerModo(existe == null ? "elegir" : existe ? "entrar" : "crear");
  }
  function otraCuenta() { abrirClave(null); ponerModo("entrar"); }
  $("clave-volver").addEventListener("click", () => mostrar("entrada"));
  document.querySelectorAll("#clave-elegir [data-modo]").forEach((b) => b.addEventListener("click", () => ponerModo(b.dataset.modo)));

  // Botón de ojo: ver u ocultar la contraseña mientras se escribe
  const OJO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const OJO_TACHADO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/></svg>';
  document.querySelectorAll(".ver-clave").forEach((b) => {
    const campo = b.previousElementSibling;
    b.innerHTML = OJO;
    b.addEventListener("click", () => {
      const ver = campo.type === "password";
      campo.type = ver ? "text" : "password";
      b.innerHTML = ver ? OJO_TACHADO : OJO;
      b.setAttribute("aria-pressed", String(ver));
      b.setAttribute("aria-label", ver ? "Ocultar contraseña" : "Mostrar contraseña");
      campo.focus();
    });
  });
  async function errorDeFuncion(error, data) {
    try { const j = await error.context.json(); if (j && j.error) return j.error; } catch (e) {}
    return (data && data.error) || "No se pudo crear la cuenta. Revisa tu conexión e intenta de nuevo.";
  }
  $("f-clave").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("clave-error"), btn = $("btn-clave");
    const usuario = clave.otra ? $("clave-usuario").value.trim().toLowerCase() : clave.usuario;
    const pass = $("clave").value;
    if (!/^[a-z0-9._-]{3,24}$/.test(usuario)) { err.textContent = "Escribe tu usuario, en minúsculas y sin espacios."; return; }
    if (pass.length < 8) { err.textContent = "La contraseña tiene al menos 8 letras o números."; return; }
    if (clave.modo === "crear" && pass !== $("clave2").value) { err.textContent = "Las dos contraseñas no son iguales."; return; }
    err.textContent = ""; btn.disabled = true;
    if (PRUEBA) { btn.disabled = false; entrarComoPrueba(usuario, clave.modo === "crear"); return; }
    if (clave.modo === "crear") {
      btn.textContent = "Creando tu cuenta…";
      const { data, error } = await sb.functions.invoke("familia-cuenta", { body: { accion: "crear", usuario, clave: pass } });
      if (error || !data || !data.ok) { err.textContent = await errorDeFuncion(error, data); btn.disabled = false; ponerModo("crear"); return; }
    }
    btn.textContent = "Entrando…";
    const { error } = await sb.auth.signInWithPassword({ email: correoDe(usuario), password: pass });
    btn.disabled = false; btn.textContent = clave.modo === "crear" ? "Crear y entrar" : "Entrar";
    // solo un 400 de Supabase es "contraseña incorrecta"; lo demás (sin red, demasiados intentos) no
    const malos = error && (error.status === 400 || /invalid login credentials/i.test(error.message || ""));
    if (error) err.textContent = malos ? "Esa no es la contraseña. Prueba otra vez." : SIN_CONEXION;
  });

  // ---------- entrar ----------
  let cargadoPara = null;
  function escucharSesion() {
    if (!sb) return;
    sb.auth.onAuthStateChange((ev, session) => {
      user = session ? session.user : null;
      if (!user) { cargadoPara = null; mostrar("entrada"); return; }
      if (cargadoPara === user.id) return;
      cargadoPara = user.id;
      cargarSesion();
    });
  }
  async function cargarSesion() {
    let fila;
    try { fila = await D.entrar({ sb, user }); } catch (e) { aviso(SIN_CONEXION, e); return; }
    if (!fila) { aviso("Esta cuenta no es del Recreo. Cierra sesión y entra tocando tu nombre."); return; }
    try {
      prepararCompartido();
      await D.iniciar();
      if (fila.actualizado_en === fila.creado_en) abrirPersonaje(); else entrarApp();
    } catch (e) { aviso("Algo falló al abrir los juegos. Intenta de nuevo.", e); }
  }
  function entrarComoPrueba(quien, nuevo) {
    clave.usuario = quien;
    prepararCompartido(); // antes de los datos de prueba: con esto saben qué día es hoy
    D.entrar({ prueba: true, quien, nuevo }).then(() => {
      user = { id: D.usuarioId(), email: `${quien}@prueba` };
      D.iniciar();
      const yo = D.yo();
      if (yo.actualizado_en === yo.creado_en) abrirPersonaje(); else entrarApp();
    });
  }
  $("aviso-reintentar").addEventListener("click", () => (user ? cargarSesion() : location.reload()));
  $("aviso-salir").addEventListener("click", cerrarSesion);

  // Lo que la sala, los juegos y el ranking necesitan de aquí
  function prepararCompartido() {
    window.recreo = {
      sb, toast, lluvia, vibrar, pocoMovimiento, ago, diaHoy, aIso, claveDia, tz, fmt, prueba: PRUEBA, COLORES,
      irA, mudo,
      get yo() {
        const m = D.yo() || {};
        return { id: m.usuario_id, nombre: m.nombre || "Tú", avatar: m.avatar || "🙂", color: m.color || "azul", colorHex: COLORES[m.color] || COLORES.azul };
      },
    };
  }

  // ---------- elegir personaje y color ----------
  function selector(contPj, contCol, estado, alCambiar) {
    contPj.innerHTML = ""; contCol.innerHTML = "";
    contPj.className = `personajes c-${estado.color}`;
    PERSONAJES.forEach((e) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = e; b.setAttribute("aria-label", `Personaje ${e}`);
      b.setAttribute("aria-pressed", String(e === estado.avatar));
      b.addEventListener("click", () => { estado.avatar = e; alCambiar("avatar"); });
      contPj.append(b);
    });
    Object.keys(COLORES).forEach((c) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = `c-${c}`; b.setAttribute("aria-label", `Color ${c}`);
      b.setAttribute("aria-pressed", String(c === estado.color));
      b.addEventListener("click", () => { estado.color = c; alCambiar("color"); });
      contCol.append(b);
    });
  }
  function abrirPersonaje() {
    const yo = D.yo(), dato = (C.FAMILIA || []).find((p) => p.nombre === yo.nombre) || {};
    const estado = { avatar: dato.avatar || yo.avatar || "🙂", color: dato.color || yo.color || "azul", nombre: yo.nombre };
    $("pj-nombre").value = estado.nombre;
    const pintar = () => {
      const v = $("pj-vista"); v.className = `av xg c-${estado.color}`; v.textContent = estado.avatar;
      $("pj-vista-nombre").textContent = $("pj-nombre").value.trim() || estado.nombre;
      selector($("pj-personajes"), $("pj-colores"), estado, pintar);
    };
    $("pj-nombre").oninput = () => ($("pj-vista-nombre").textContent = $("pj-nombre").value.trim() || estado.nombre);
    $("pj-listo").onclick = async () => {
      const nombre = $("pj-nombre").value.trim();
      if (!nombre) { $("pj-error").textContent = "Escribe tu nombre (como quieres salir en el ranking)."; return; }
      $("pj-listo").disabled = true;
      const fila = await D.editarMiembro({ nombre, avatar: estado.avatar, color: estado.color });
      $("pj-listo").disabled = false;
      if (!fila) { $("pj-error").textContent = SIN_CONEXION + (D.ultimoError() ? ` (${D.ultimoError()})` : ""); return; }
      entrarApp(); lluvia("🎉", 18);
    };
    pintar();
    mostrar("personaje");
  }
  $("pj-letra").addEventListener("click", () => ponerLetra(!letraGrande()));

  // ---------- la app ----------
  const TABS = ["juegos", "ranking", "yo"];
  function irA(tab) {
    if (!TABS.includes(tab)) tab = "juegos";
    TABS.forEach((t) => ($("tab-" + t).hidden = t !== tab));
    document.querySelectorAll("#tabs button").forEach((b) => {
      b.classList.toggle("on", b.dataset.tab === tab);
      if (b.dataset.tab === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
    if (tab === "yo") pintarYo();
    window.dispatchEvent(new CustomEvent("recreo:tab", { detail: tab }));
  }
  document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => irA(b.dataset.tab)));

  let dentro = false;
  function entrarApp() {
    mostrar("app");
    pintarHola(); pintarSonido();
    irA("juegos");
    if (!dentro) { dentro = true; window.dispatchEvent(new Event("recreo:dentro")); }
    else window.dispatchEvent(new Event("recreo:datos"));
  }
  function pintarHola() {
    const yo = window.recreo.yo, av = $("hola-av");
    av.className = `av g c-${yo.color}`; av.textContent = yo.avatar;
    $("hola-titulo").textContent = `¡Hola, ${yo.nombre}!`;
    $("sin-red").hidden = !D.sinRed();
  }
  window.addEventListener("recreo:datos", () => { if (dentro) { pintarHola(); if (!$("tab-yo").hidden) pintarYo(); } });

  // ---------- Yo ----------
  function pintarYo() {
    const yo = window.recreo.yo;
    $("yo-cab").className = `yo-cab tarjeta c-${yo.color}`;
    $("yo-nombre").textContent = yo.nombre;
    const av = $("yo-av"); av.className = `av xg c-${yo.color}`; av.textContent = yo.avatar;
    if (document.activeElement !== $("yo-nombre-input")) $("yo-nombre-input").value = yo.nombre;
    const estado = { avatar: yo.avatar, color: yo.color };
    selector($("yo-personajes"), $("yo-colores"), estado, async (que) => {
      const fila = await D.editarMiembro(que === "avatar" ? { avatar: estado.avatar } : { color: estado.color });
      if (!fila) { toast("No se pudo guardar. " + SIN_CONEXION); return; }
      pintarYo(); pintarHola();
    });
    ponerLetra(letraGrande()); pintarSonido();
    $("aj-vibrar").setAttribute("aria-checked", String(puedeVibrar()));
    $("f-nueva-clave").hidden = !esDeLaFamilia();
    $("yo-usuario").textContent = PRUEBA ? "Modo prueba" : user ? `Tu usuario: ${(user.email || "").split("@")[0]}` : "";
    renderInstalar();
  }
  $("f-nombre").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = $("yo-nombre-input").value.trim();
    if (!nombre) { toast("Escribe tu nombre"); return; }
    const fila = await D.editarMiembro({ nombre });
    if (!fila) { toast("No se pudo guardar. " + SIN_CONEXION); return; }
    $("yo-nombre-input").blur(); pintarYo(); pintarHola(); toast("Nombre guardado ✓");
  });
  $("aj-letra").addEventListener("click", () => ponerLetra(!letraGrande()));
  $("aj-sonido").addEventListener("click", () => ponerMudo(!mudo()));
  $("aj-vibrar").addEventListener("click", () => {
    anotar("recreo-vibrar", puedeVibrar() ? "0" : "1");
    $("aj-vibrar").setAttribute("aria-checked", String(puedeVibrar()));
    vibrar(40);
  });
  $("f-nueva-clave").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nueva = $("nueva-clave").value;
    if (nueva.length < 8) { toast("La contraseña necesita al menos 8 letras o números"); return; }
    if (PRUEBA) { toast("(prueba) Contraseña cambiada"); $("nueva-clave").value = ""; return; }
    const { error } = await sb.auth.updateUser({ password: nueva });
    if (error) { toast("No se pudo cambiar. " + SIN_CONEXION); return; }
    $("nueva-clave").value = ""; toast("Contraseña cambiada 🔐");
  });
  // Cerrar sesión solo en este teléfono: con el alcance por defecto se cerraría en todos (y Fernando
  // también usan su cuenta en la otra app)
  async function cerrarSesion() {
    if (PRUEBA) { location.replace(location.pathname); return; }
    const { error } = await sb.auth.signOut({ scope: "local" });
    if (error) { toast("No se pudo cerrar la sesión. " + SIN_CONEXION); return; }
    try { sessionStorage.clear(); } catch (e) {}
    location.reload();
  }
  $("btn-salir").addEventListener("click", cerrarSesion);

  // ---------- instalar ----------
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const instalada = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  let promptInstalar = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); promptInstalar = e; renderInstalar(); });
  window.addEventListener("appinstalled", () => { promptInstalar = null; toast("¡Listo! El Recreo ya está en tu pantalla 🎉"); renderInstalar(); });
  function renderInstalar() {
    $("btn-instalar").hidden = !promptInstalar;
    $("btn-instalar-entrada").hidden = !promptInstalar;
    $("instalar-estado").textContent = instalada ? "Ya lo estás usando desde tu pantalla de inicio ✓"
      : promptInstalar ? "Así lo abres con su propio ícono, como una app."
      : isIOS ? "En Safari, toca Compartir y luego «Agregar a pantalla de inicio»."
      : "En el menú del navegador (⋮), elige «Instalar app» o «Agregar a pantalla de inicio».";
  }
  const instalar = async () => { if (!promptInstalar) return; promptInstalar.prompt(); await promptInstalar.userChoice; promptInstalar = null; renderInstalar(); };
  $("btn-instalar").addEventListener("click", instalar);
  $("btn-instalar-entrada").addEventListener("click", instalar);
  renderInstalar();

  // ---------- al volver a la app ----------
  let ocultaDesde = 0;
  async function ponerseAlDia() {
    if (!dentro) return;
    await D.alDia();
    window.dispatchEvent(new Event("recreo:aldia"));
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { ocultaDesde = Date.now(); return; }
    if (ocultaDesde && Date.now() - ocultaDesde > 30000) ponerseAlDia();
  });
  window.addEventListener("online", ponerseAlDia);

  // ---------- arranque ----------
  // Se espera a que corran todos los scripts (la sala, los juegos y el ranking escuchan "recreo:dentro")
  function arrancar() {
    // si un archivo no cargó (navegador muy viejo o sin red), se dice claro en vez de quedarse a medias
    if (!window.RecreoDatos || !window.RecreoJuegos || (!PRUEBA && !window.supabase)) {
      aviso("Este navegador no pudo abrir el Recreo. Prueba abrirlo en Google Chrome, o revisa tu conexión.");
      return;
    }
    if (PRUEBA) {
      $("franja-prueba").hidden = false;
      $("salir-prueba").addEventListener("click", () => location.replace(location.pathname));
      if (pruebaQuien) entrarComoPrueba(pruebaQuien, pruebaNuevo); else mostrar("entrada");
    } else if (!sb) aviso(SIN_CONEXION);
    else escucharSesion();
  }
  // (mientras corren los scripts con defer el documento ya está "interactive": DOMContentLoaded llega después de todos)
  if (document.readyState === "complete") arrancar(); else document.addEventListener("DOMContentLoaded", arrancar);
})();
