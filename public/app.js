/* Nosotros — app principal */
(function () {
  const C = window.NOSOTROS_CONFIG;
  // Por si algo falla al conectar: la pantalla de carga nunca se queda pegada y, si a los 10 s no apareció
  // ninguna pantalla (una petición colgada, o no cargó supabase-js), se ofrece reintentar en vez de una
  // tarjeta vacía. Solo con getElementById: también corre si la app no alcanzó a arrancar.
  setTimeout(() => {
    quitarCarga();
    const id = (x) => document.getElementById(x);
    if (!["s-login", "s-aviso", "s-home"].every((x) => id(x) && id(x).hidden)) return;
    id("aviso-msg").textContent = "Revisa tu conexión a internet e intenta de nuevo.";
    id("s-aviso").hidden = false;
    id("aviso-reintentar").onclick = () => location.reload();
  }, 10000);
  // La sesión queda guardada en el teléfono y se renueva sola: no hay que volver a entrar
  // hasta tocar "Cerrar sesión".
  const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  // Las funciones de Supabase que devuelven una fila, cuando no encuentran nada devuelven una fila vacía (id null)
  const filaValida = (d) => !!(d && d.id);
  const $ = (id) => document.getElementById(id);
  // Un ícono del sprite de index.html (mismo trazo que la barra; reemplaza a los emojis en listas y botones)
  const iconoSvg = (id) => `<svg class="ico" aria-hidden="true"><use href="#i-${id}"/></svg>`;

  const HORAS_LIBRE = 2; // "Estoy libre para hablar" se apaga solo después de estas horas
  // Teléfonos con poca memoria o con "ahorro de datos" activado: el fondo queda más simple (.ligera en styles.css)
  try {
    const red = navigator.connection;
    if ((red && red.saveData) || (navigator.deviceMemory && navigator.deviceMemory <= 2)) document.documentElement.classList.add("ligera");
  } catch (e) {}

  const S = { login: $("s-login"), aviso: $("s-aviso"), home: $("s-home") };
  let user = null, perfil = null, pareja = null, otro = null, canal = null, toastTimer = null;

  // ---------- utilidades ----------
  function show(name) {
    Object.keys(S).forEach((k) => (S[k].hidden = k !== name));
    $("tabs").hidden = $("campana").hidden = name !== "home";
    document.body.classList.toggle("con-tabs", name === "home");
    // el Inicio quita la carga cuando ya tiene todo (ver entrar)
    if (name !== "home") quitarCarga();
  }
  // Pantalla de carga: se va con un fundido, pero no antes de que los corazoncitos alcancen a juntarse.
  // Sin $ ni variables de afuera: también se llama si la app no alcanzó a arrancar.
  function quitarCarga() {
    const c = document.getElementById("carga");
    if (!c || c.classList.contains("fuera")) return Promise.resolve();
    return new Promise((ok) => setTimeout(() => {
      if (!c.classList.contains("fuera")) { c.classList.add("fuera"); setTimeout(() => c.remove(), 600); }
      ok();
    }, Math.max(0, 1400 - performance.now())));
  }
  // Zonas horarias: la mía viene de perfiles.tz (o del teléfono), la de mi pareja de su perfil
  const tzNavegador = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const miTz = () => (perfil && perfil.tz) || tzNavegador;
  const suTz = () => (otro && otro.tz) || miTz();
  function hora(iso, tz) {
    const opts = { hour: "2-digit", minute: "2-digit" };
    try { return new Date(iso).toLocaleTimeString("es", { ...opts, timeZone: tz }); }
    catch (e) { return new Date(iso).toLocaleTimeString("es", opts); }
  }
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 4000);
  }
  function ago(iso) {
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60) return "hace un momento";
    if (d < 3600) return `hace ${Math.floor(d / 60)} min`;
    if (d < 86400) return `hace ${Math.floor(d / 3600)} h`;
    // en la zona del perfil, como el resto de la app (no la del teléfono, que cambia si viajas)
    const dt = new Date(iso), f = (tz) => `el ${dt.toLocaleDateString("es", { day: "numeric", month: "short", timeZone: tz })} a las ${dt.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", timeZone: tz })}`;
    try { return f(miTz()); } catch (e) { return f(undefined); }
  }
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

  // ---------- service worker ----------
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

  // ---------- login con usuario y contraseña ----------
  // Supabase pide un correo: se usa uno interno que no recibe mensajes (el dominio .invalid no existe).
  // La cuenta la crea la función `cuenta`, ya confirmada (mismo dominio que allá).
  const DOMINIO_CUENTAS = "nosotros.invalid";
  const limpiarUsuario = (u) => u.trim().toLowerCase();
  const correoDe = (u) => `${limpiarUsuario(u)}@${DOMINIO_CUENTAS}`;
  const usuarioDe = (email) => (email || "").split("@")[0];
  const nombreDe = (usuario) => usuario.replace(/^./, (c) => c.toUpperCase()); // "martina" → "Martina"
  let modoLogin = "entrar";
  function ponerModo(m) {
    modoLogin = m;
    const crear = m === "crear";
    $("clave2-caja").hidden = $("clave2-lab").hidden = !crear;
    $("clave2").required = crear;
    $("clave").autocomplete = crear ? "new-password" : "current-password";
    $("btn-login").textContent = crear ? "Crear cuenta" : "Entrar";
    $("btn-modo").textContent = crear ? "Ya tengo cuenta" : "Crear una cuenta nueva";
    $("login-msg").textContent = crear ? "Sin correo: solo un usuario y una contraseña de al menos 8 caracteres. Guárdala bien 💗" : "";
  }
  $("btn-modo").addEventListener("click", () => ponerModo(modoLogin === "crear" ? "entrar" : "crear"));
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
  // El cuerpo del error de una Edge Function viene en la respuesta HTTP
  async function errorDeFuncion(error, data) {
    try { const j = await error.context.json(); if (j && j.error) return j.error; } catch (e) {}
    return (data && data.error) || "No se pudo crear la cuenta. Revisa tu conexión e intenta de nuevo.";
  }
  $("f-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const usuario = limpiarUsuario($("usuario").value), clave = $("clave").value;
    const msg = $("login-msg"), btn = $("btn-login");
    if (!/^[a-z0-9._-]{3,24}$/.test(usuario)) {
      msg.textContent = "El usuario lleva de 3 a 24 letras o números (también punto o guion), sin espacios ni tildes."; return;
    }
    btn.disabled = true;
    if (modoLogin === "crear") {
      if (clave !== $("clave2").value) { msg.textContent = "Las contraseñas no coinciden."; btn.disabled = false; return; }
      msg.textContent = "Creando tu cuenta…";
      const { data, error } = await sb.functions.invoke("cuenta", { body: { usuario, clave } });
      if (error || !data || !data.ok) { msg.textContent = await errorDeFuncion(error, data); btn.disabled = false; return; }
    }
    msg.textContent = "Entrando…";
    const { error } = await sb.auth.signInWithPassword({ email: correoDe(usuario), password: clave });
    btn.disabled = false;
    // solo un 400 de Supabase es "datos incorrectos"; lo demás (sin red, demasiados intentos) no es culpa de la contraseña
    const datosMalos = error && (error.status === 400 || /invalid login credentials/i.test(error.message || ""));
    msg.textContent = !error ? "" : datosMalos ? "Usuario o contraseña incorrectos." : "No se pudo entrar. Revisa tu conexión a internet e intenta de nuevo.";
  });
  // Cerrar sesión solo en este aparato (sin el scope "local", Supabase la cierra en todos los teléfonos de la cuenta)
  // y sin dejar las notificaciones de esta cuenta llegando aquí.
  async function cerrarSesion() {
    try {
      const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
      const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
      if (sub && user) await sb.from("push_subs").delete().eq("endpoint", sub.endpoint);
    } catch (e) {}
    const { error } = await sb.auth.signOut({ scope: "local" });
    if (error) { toast("No se pudo cerrar la sesión. Revisa tu conexión e intenta de nuevo."); return; }
    // lo que este teléfono guarda de esta cuenta no queda para la próxima (p. ej. un borrador de carta sorpresa)
    try { ["borrador-carta", "ultimo-beso", "ultimo-latido"].forEach((k) => localStorage.removeItem(k)); sessionStorage.clear(); } catch (e) {}
    location.reload();
  }
  $("btn-logout").addEventListener("click", cerrarSesion);

  // Solo se carga todo al entrar o si cambia la persona: al renovarse la sesión (cada hora)
  // o al volver a la app no se recarga ni salta al inicio de la página.
  let cargadoPara = null;
  sb.auth.onAuthStateChange((ev, session) => {
    user = session ? session.user : null;
    if (!user) { cargadoPara = null; show("login"); return; }
    if (cargadoPara === user.id) return;
    cargadoPara = user.id;
    cargar();
  });

  // ---------- carga de perfil y pareja ----------
  // Sin pantallas antes del Inicio: el perfil nace con el nombre del usuario (se cambia en Ajustes)
  // y la pareja se arma sola en la base (entrar_pareja): el primero la crea y el segundo queda unido.
  const SIN_CONEXION = "Revisa tu conexión a internet e intenta de nuevo.";
  async function cargar() {
    // perfil y pareja a la vez: es la espera más larga al abrir la app
    const [{ data: p, error: errPerfil }, { data: pj, error: errPareja }] = await Promise.all([
      sb.from("perfiles").select("*").eq("id", user.id).maybeSingle(),
      sb.from("parejas").select("*").or(`usuario_a.eq.${user.id},usuario_b.eq.${user.id}`).maybeSingle(),
    ]);
    // un corte de red no es "no tengo pareja" (PGRST116 = más de una fila: ahí decide entrar_pareja)
    if (errPerfil || (errPareja && errPareja.code !== "PGRST116")) { aviso(SIN_CONEXION); return; }
    perfil = p;
    if (!perfil) {
      const nuevo = { id: user.id, nombre: nombreDe(usuarioDe(user.email)).slice(0, 24), tz: tzNavegador };
      const { error } = await sb.from("perfiles").upsert(nuevo);
      if (error) { aviso(SIN_CONEXION); return; }
      perfil = nuevo;
    } else if (!perfil.tz) {
      // Perfiles creados antes de tener zona horaria: guardar la del teléfono
      await sb.from("perfiles").update({ tz: tzNavegador }).eq("id", user.id);
      perfil.tz = tzNavegador;
    }
    pareja = filaValida(pj) ? pj : null;
    if (!pareja) {
      // Las fechas de config.js quedan guardadas desde el principio
      const F = C.FECHAS || {};
      const { data, error } = await sb.rpc("entrar_pareja", { p_desde: F.novios || null, p_conocidos: F.conocidos || null });
      if (error) { aviso(SIN_CONEXION); return; }
      // solo las dos cuentas de usuario y contraseña tienen pareja
      if (!filaValida(data)) { aviso("Esta cuenta no es una de las dos de Nosotros. Cierra sesión y entra con tu usuario."); return; }
      pareja = data;
      if (pareja.usuario_a === user.id) await agendarEncuentro(); // la acabo de crear yo
    }
    await entrar();
  }
  function aviso(msg) { $("aviso-msg").textContent = msg; show("aviso"); }
  $("aviso-reintentar").addEventListener("click", () => cargar());
  $("aviso-salir").addEventListener("click", cerrarSesion);

  // Al crear la pareja, el primer encuentro queda en el calendario como viaje (el corazón del Inicio cuenta los días)
  async function agendarEncuentro() {
    const F = C.FECHAS || {};
    if (!F.encuentro || F.encuentro < claveDia(new Date().toISOString(), miTz())) return;
    // solo en una pareja recién creada: entrar_pareja también devuelve la que ya existía
    const { count, error } = await sb.from("eventos_cal").select("id", { count: "exact", head: true }).eq("pareja_id", pareja.id);
    if (error || count) return;
    await sb.from("eventos_cal").insert({
      pareja_id: pareja.id, creado_por: user.id, tipo: "viaje",
      titulo: F.lugar ? `Nos vemos por primera vez en ${F.lugar} 💞` : "Nos vemos por primera vez 💞",
      inicio: aIso(F.encuentro + "T09:00", miTz()), nota: "Cambien la hora cuando tengan el vuelo ✈️",
    });
  }

  // Mientras mi pareja no crea su cuenta se entra igual. Su id es el UUID nulo: las consultas siguen
  // siendo válidas y simplemente no encuentran nada suyo. Su nombre sale del usuario de config.js.
  const SIN_CUENTA = "00000000-0000-0000-0000-000000000000";
  const usuarioPareja = () => (C.USUARIOS || []).find((u) => u !== usuarioDe(user.email)) || null;
  function renderPendiente() {
    const falta = !pareja.usuario_b, u = usuarioPareja();
    $("pendiente").hidden = !falta;
    if (!falta) return;
    $("pendiente-titulo").textContent = `💌 ${otro.nombre} todavía no tiene su cuenta`;
    $("pendiente-texto").textContent = (u
      ? `Cuando entre a la app y cree su cuenta con el usuario «${u}», quedarán unidos solitos, sin códigos.`
      : "Cuando tu pareja cree su cuenta en esta app, quedarán unidos solitos, sin códigos.")
      + " Mientras tanto puedes dejarle cartas, notitas y sorpresas: las encontrará al entrar 💗";
  }
  // ¡Llegó! Se vuelve a cargar todo, ya con su perfil de verdad
  function llegoMiPareja() {
    lluvia("💞", 24); toast(`¡${otro.nombre} llegó! Ya están unidos 💞`);
    setTimeout(() => location.reload(), 2800);
  }
  // Si llegó mientras la app estaba en segundo plano, se nota al volver
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden || !pareja || pareja.usuario_b) return;
    const { data } = await sb.from("parejas").select("usuario_b").eq("id", pareja.id).maybeSingle();
    if (data && data.usuario_b) { pareja.usuario_b = data.usuario_b; llegoMiPareja(); }
  });

  // ---------- campanita: las notificaciones que me llegaron quedan guardadas ----------
  // Las guarda enviarPush (funciones notificar y recordatorios) en la tabla notificaciones.
  let notis = [], canalCampana = null;
  async function cargarCampana() {
    if (!user) return;
    const { data, error } = await sb.from("notificaciones").select("id, titulo, cuerpo, url, creado_en, leida_en")
      .eq("usuario_id", user.id).order("creado_en", { ascending: false }).limit(60);
    if (!error) notis = data || []; // sin red se quedan las que había
    renderCampana();
  }
  // En su propio canal: si la tabla todavía no está en tiempo real, no se cae el resto. Si se cae, se vuelve a abrir
  // solo (vivo-canal.js) y, al volver, trae las que llegaron mientras tanto.
  function suscribirCampana() {
    if (canalCampana) canalCampana.apagar();
    canalCampana = window.VivoCanal(sb, "campana", {}, (c) => c.on("postgres_changes",
      { event: "INSERT", schema: "public", table: "notificaciones", filter: `usuario_id=eq.${user.id}` },
      (payload) => {
        notis = [payload.new, ...notis].slice(0, 60);
        renderCampana(); animar($("campana"), "suena");
        if ($("dlg-campana").open) pintarCampana();
      }), null, cargarCampana);
    canalCampana.abrir();
  }
  function renderCampana() {
    const n = notis.filter((x) => !x.leida_en).length, num = $("campana-n");
    num.hidden = !n; num.textContent = n > 9 ? "9+" : String(n);
    $("campana").setAttribute("aria-label", n ? `Notificaciones: ${n} sin ver` : "Notificaciones");
  }
  // La lista, agrupada por día (con la hora de cada una en mi zona)
  function pintarCampana() {
    const caja = $("campana-lista"); caja.innerHTML = "";
    if (!notis.length) {
      const p = document.createElement("p"); p.className = "small-note vacia";
      p.textContent = "Todavía no te llega ninguna. Cuando te llegue una, también queda guardada aquí 💌";
      caja.append(p); return;
    }
    const hoy = diaHoy(), ayer = claveDia(new Date(Date.now() - 86400000).toISOString(), miTz());
    let dia = null, ul = null;
    notis.forEach((x) => {
      const k = claveDia(x.creado_en, miTz());
      if (k !== dia) {
        dia = k; ul = document.createElement("ul");
        const t = document.createElement("p"); t.className = "campana-dia";
        t.textContent = k === hoy ? "Hoy" : k === ayer ? "Ayer" : fechaCorta(x.creado_en, miTz());
        caja.append(t, ul);
      }
      const li = document.createElement("li"), b = document.createElement("button");
      const ti = document.createElement("b"), cu = document.createElement("span"), h = document.createElement("time");
      li.classList.toggle("nueva", !x.leida_en); b.type = "button";
      ti.textContent = x.titulo; cu.textContent = x.cuerpo || "";
      h.dateTime = x.creado_en; h.textContent = hora(x.creado_en, miTz());
      b.append(ti, h, cu);
      b.addEventListener("click", () => { $("dlg-campana").close(); irA(tabDeUrl(x.url || "/")); });
      li.append(b); ul.append(li);
    });
  }
  $("campana").addEventListener("click", async () => {
    pintarCampana(); $("dlg-campana").showModal();
    // al abrirla quedan vistas (siguen resaltadas mientras está abierta)
    if (!notis.some((x) => !x.leida_en)) return;
    const { error } = await sb.rpc("leer_notificaciones");
    if (error) return;
    const ahora = new Date().toISOString();
    notis.forEach((x) => { if (!x.leida_en) x.leida_en = ahora; });
    renderCampana();
  });
  $("campana-cerrar").addEventListener("click", () => $("dlg-campana").close());

  // ---------- pantalla principal ----------
  async function entrar() {
    if (!filaValida(pareja)) { aviso(SIN_CONEXION); return; }
    show("home");
    const otroId = pareja.usuario_a === user.id ? pareja.usuario_b : pareja.usuario_a, u = usuarioPareja();
    const [{ data: o, error: errOtro }] = await Promise.all([
      otroId ? sb.from("perfiles").select("*").eq("id", otroId).maybeSingle() : { data: null },
      // Registrar mi entrada (una vez por apertura), a la par con lo anterior
      sessionStorage.getItem("entrada") ? null
        : sb.from("eventos").insert({ pareja_id: pareja.id, de_usuario: user.id, tipo: "entrada" })
          .then(() => sessionStorage.setItem("entrada", "1")),
    ]);
    // sin su perfil (corte de red) no sabríamos su zona horaria: mejor reintentar que mostrar horas equivocadas
    if (errOtro) { aviso(SIN_CONEXION); return; }
    otro = o || { id: otroId || SIN_CUENTA, nombre: !otroId && u ? nombreDe(u) : "Tu pareja" };
    tituloHome(); renderPendiente();
    $("heart").classList.add("beat");
    irA(tabDeUrl(location.href));
    // Parejas creadas antes de tener fechas: se toman las de config.js
    const F = C.FECHAS || {};
    if (!pareja.desde && !pareja.conocidos && (F.novios || F.conocidos)) {
      const { data } = await sb.rpc("fijar_fechas", { p_conocidos: F.conocidos || null, p_desde: F.novios || null });
      if (data && data.id) pareja = { ...pareja, ...data };
    }
    // relojes y contadores: se repintan cada 30 s (también cambia "es mañana" → "¡hoy!" a medianoche)
    clearInterval(relojTimer); renderRelojes(); diaVisto = diaPregunta();
    // a medianoche (de quien vive más al oeste) cambian la pregunta, el riego y "Hoy te toca": se recarga todo
    relojTimer = setInterval(() => { renderRelojes(); renderJuntos(); if (diaPregunta() !== diaVisto) ponerseAlDia(); }, 30000);
    renderAvatares(); renderDistancia(); conectarVivo();
    // Bienvenida la primera vez que entran
    let vista = false; try { vista = localStorage.getItem("bienvenida-vista") === "1"; } catch (e) {}
    $("bienvenida").hidden = vista;
    // La carga se va apenas está lo de arriba del Inicio (la cuenta regresiva y "Hoy te toca");
    // lo demás sigue llegando sin hacer esperar. Los vales se cargan al abrir Juntos.
    // (la campanita abre su canal después de traer las que había, también sin red)
    Promise.all([render(), cargarDispo(), cargarAnimos(), cargarMomentos(), cargarNotitas(), cargarCanciones(), cargarCampana().then(suscribirCampana)]);
    // si una de estas cargas falla, igual se sigue: sin esto quedarían sin abrir el tiempo real y las notificaciones
    try { await Promise.all([cargarJuntos(), cargarPregunta(), cargarCartas(), cargarGirasol(), cargarFrasco()]); }
    catch (e) { console.error(e); }
    await quitarCarga(); ritualDelDia();
    // Funciones en archivos aparte (noche.js) arrancan con lo que necesitan de aquí
    window.nosotros = {
      sb, toast, estallido, pocoMovimiento, hora, partes, claveDia, miTz, suTz, tzPareja, renderAvatares,
      lluvia, vibrar, irA, ago, aIso, diaHoy, fechaCorta, plural, subirFoto, aImagen, cargarMomentos,
      get user() { return user; }, get perfil() { return perfil; }, get pareja() { return pareja; }, get otro() { return otro; },
    };
    window.dispatchEvent(new Event("nosotros:dentro"));
    setTimeout(cargarJuegos, 3000); // después de que el saludo del día termina de dibujarse
    suscribirPareja();
    prepararPush();
  }

  // Canal de la pareja: lo que el otro hace aparece al instante. Si se cae, se vuelve a abrir solo (vivo-canal.js) y,
  // al volver, se recarga lo que se ve: lo que pasó mientras tanto no llega por el tiempo real.
  function suscribirPareja() {
    if (canal) canal.apagar();
    canal = window.VivoCanal(sb, "pareja", {}, (c) => c.on("postgres_changes",
      { event: "INSERT", schema: "public", table: "eventos", filter: `pareja_id=eq.${pareja.id}` },
      (payload) => {
        const ev = payload.new;
        if (ev.de_usuario !== user.id) {
          // (con la sesión de pareja abierta en pantalla ya se ve lo que escribe: sin aviso encima)
          if (!(ev.tipo.startsWith("sesion") && document.body.classList.contains("con-sesion"))) {
            toast((AVISOS[ev.tipo] || AVISOS.te_extrano)(otro.nombre));
          }
          sentir(ev.tipo); sessionStorage.setItem("sentido", ev.id);
          if (ev.tipo === "respuesta") cargarPregunta();
          if (ev.tipo === "carta") cargarCartas();
          if (ev.tipo === "momento") cargarMomentos();
          if (ev.tipo === "riego") cargarGirasol();
          if (ev.tipo === "vale" || ev.tipo === "canje") cargarVales();
          if (ev.tipo === "razon") cargarFrasco();
          if (ev.tipo === "notita") cargarNotitas();
          if (ev.tipo === "cancion") cargarCanciones();
        }
        render();
      }
    ).on("postgres_changes",
      // sin filtro: RLS solo deja pasar nuestras dos filas
      { event: "*", schema: "public", table: "disponibilidad" },
      (payload) => {
        const d = payload.eventType === "DELETE" ? null : payload.new;
        const id = d ? d.usuario_id : payload.old.usuario_id;
        if (id === user.id) dispo.mia = d; else if (id === otro.id) dispo.suya = d;
        renderDispo();
      }
    ).on("postgres_changes",
      // ánimo: igual que disponibilidad, RLS solo deja pasar nuestras dos filas
      { event: "*", schema: "public", table: "animos" },
      (payload) => {
        const a = payload.eventType === "DELETE" ? null : payload.new;
        const id = a ? a.usuario_id : payload.old.usuario_id;
        if (id === user.id) animos.mio = a; else if (id === otro.id) animos.suyo = a;
        renderAnimos();
      }
    ).on("postgres_changes",
      // si mi pareja cambia su nombre o su zona horaria, lo vemos al instante
      { event: "UPDATE", schema: "public", table: "perfiles", filter: `id=eq.${otro.id}` },
      (payload) => { otro = { ...otro, ...payload.new }; tituloHome(); render(); renderDispo(); renderRelojes(); renderAvatares(); renderDistancia(); }
    ).on("postgres_changes",
      // "juntos desde" cambiado por cualquiera de los dos, o mi pareja que por fin llegó
      { event: "UPDATE", schema: "public", table: "parejas", filter: `id=eq.${pareja.id}` },
      (payload) => {
        const llego = !pareja.usuario_b && payload.new.usuario_b;
        pareja = { ...pareja, ...payload.new }; renderJuntos();
        if (llego) llegoMiPareja();
      }
    ).on("postgres_changes",
      // si mi pareja corrige su respuesta (las nuevas llegan como evento 'respuesta')
      { event: "UPDATE", schema: "public", table: "respuestas", filter: `pareja_id=eq.${pareja.id}` },
      (payload) => { if (payload.new.usuario_id === otro.id) cargarPregunta(); }
    ).on("postgres_changes",
      // cartas: me entero cuando mi pareja abre la que le escribí
      { event: "UPDATE", schema: "public", table: "cartas", filter: `pareja_id=eq.${pareja.id}` },
      (payload) => {
        const c = payload.new, antes = cartas.find((x) => x.id === c.id);
        if (c.de_usuario === user.id && c.leida_en && antes && !antes.leida_en) toast(`${otro.nombre} abrió tu carta 💌`);
        cargarCartas();
      }
    ).on("postgres_changes",
      // notitas: me entero cuando mi pareja guarda la que le dejé
      { event: "UPDATE", schema: "public", table: "notitas", filter: `pareja_id=eq.${pareja.id}` },
      (payload) => {
        const n = payload.new;
        if (n.de_usuario === user.id && n.despegada_en) toast(`${otro.nombre} guardó tu notita en su corazón 💛`);
        cargarNotitas();
      }
    ).on("postgres_changes",
      // lista compartida (sin filtro para recibir también lo que se quita)
      { event: "*", schema: "public", table: "deseos" },
      (payload) => {
        if (payload.eventType === "INSERT" && payload.new.creado_por !== user.id) toast(`${otro.nombre} agregó a la lista: ${payload.new.texto}`);
        if (!$("tab-juntos").hidden) cargarDeseos();
      }
    ).on("postgres_changes",
      // horario de mi pareja: una fila por hora marcada
      { event: "*", schema: "public", table: "horarios" },
      (payload) => {
        const r = payload.eventType === "DELETE" ? payload.old : payload.new;
        // (si todavía no se abrió Horarios, se cargará completo al abrirlo)
        if (r.usuario_id !== otro.id || !refSuyo) return;
        const l = refSuyo.aLocal[idx(r.dia, r.hora)];
        if (payload.eventType === "DELETE") horarios.suyos.delete(l); else horarios.suyos.add(l);
        if (!$("tab-horarios").hidden && mapaMio) renderHorarios();
      }
    ).on("postgres_changes",
      // calendario: cualquier cambio recarga la lista (sin filtro, para recibir también los borrados)
      { event: "*", schema: "public", table: "eventos_cal" },
      (payload) => {
        const ev = payload.new;
        if (payload.eventType === "INSERT" && ev.creado_por !== user.id) toast(`${otro.nombre} agendó: ${ev.titulo}`);
        if (!$("tab-calendario").hidden) cargarCal();
        cargarJuntos();
      }
    ), null, recargar);
    canal.abrir();
  }

  // ---------- al volver a la app: ponerse al día ----------
  // El tiempo real no repite lo que pasó mientras el teléfono dormía, y a veces el canal se cae.
  // Al volver tras un rato, al recuperar la red o al cambiar el día, se recarga lo que se ve y se
  // revisan los canales (vivo-canal.js vuelve a abrir el que se cayó sin avisar). noche.js, focus.js,
  // sesion.js y la sala de juegos se enteran con "nosotros:aldia".
  let ocultaDesde = 0, diaVisto = null;
  function ponerseAlDia() {
    if (!pareja || !otro || S.home.hidden) return;
    diaVisto = diaPregunta();
    [canal, canalCampana, canalVivo].forEach((c) => { if (c) c.revisar(); });
    recargar(); cargarCampana();
    window.dispatchEvent(new Event("nosotros:aldia"));
  }
  // Lo que llega por el canal de la pareja, de nuevo desde la base (también cuando el canal vuelve después de caerse)
  function recargar() {
    if (!pareja || !otro || S.home.hidden) return;
    render(); cargarDispo(); cargarAnimos(); cargarNotitas(); cargarCanciones(); cargarMomentos();
    cargarJuntos(); cargarPregunta(); cargarCartas(); cargarGirasol(); cargarFrasco();
    const tab = TABS.find((t) => !$("tab-" + t).hidden);
    if (tab === "juntos") { cargarHistorial(); cargarDeseos(); cargarVales(); cargarNumeros(); }
    // (Ajustes no: rehacerlo borraría lo que estás escribiendo en el formulario)
    else if (tab && tab !== "inicio" && tab !== "ajustes" && AL_ABRIR[tab]) AL_ABRIR[tab]();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { ocultaDesde = Date.now(); return; }
    if (ocultaDesde && Date.now() - ocultaDesde > 30000) ponerseAlDia();
  });
  window.addEventListener("online", ponerseAlDia);

  function tituloHome() {
    $("home-title").innerHTML = "";
    $("home-title").append(otro.nombre + " ");
    const em = document.createElement("em"); em.textContent = "te extraña"; $("home-title").append(em, ".");
  }

  // Textos de cada tipo de evento: aviso al llegar (toast) y línea del historial
  const AVISOS = {
    entrada: (n) => `${n} acaba de entrar y te extraña ❤️`,
    te_extrano: (n) => `${n} dice: te extraño ❤️`,
    libre: (n) => `${n} está libre para hablar ☎️`,
    abrazo: (n) => `${n} te manda un abrazo 🤗`,
    beso: (n) => `${n} te manda un beso 😘`,
    pensando: (n) => `${n} está pensando en ti 💭`,
    buenos_dias: (n) => `Buenos días de parte de ${n} ☀️`,
    buenas_noches: (n) => `${n} te da las buenas noches 🌙`,
    animo: (n) => `${n} compartió cómo se siente 💗`,
    respuesta: (n) => `${n} respondió la pregunta del día 💭`,
    carta: (n) => `${n} te escribió una carta 💌`,
    momento: (n) => `${n} compartió un momento 📸`,
    riego: (n) => `${n} regó nuestro girasol 💧`,
    vale: (n) => `${n} te regaló un vale 🎟️`,
    canje: (n) => `${n} canjeó tu vale 🎟️`,
    razon: (n) => `${n} echó una razón al frasco 🫙`,
    latido: (n) => `${n} te mandó su latido 💓`,
    notita: (n) => `${n} te dejó una notita 📝`,
    cancion: (n) => `${n} te dedicó una canción 🎶`,
    a_dormir: (n) => `${n} se fue a la camita 🌙`,
    despierto: (n) => `${n} despertó y te da los buenos días ☀️`,
    foco: (n) => `${n} quiere concentrarse contigo 📚`,
    foco_empieza: (n) => `${n} se sumó: ¡a concentrarse! ⏳`,
    record: (n) => `${n} te quitó un récord 🏆 ¿Revancha?`,
    reto: (n) => `${n} te reta a un juego 😏🎮`,
    sesion: (n) => `${n} abrió una sesión para hablar 💬`,
    sesion_msj: (n) => `${n} escribió en su sesión 💬`,
    sesion_fin: () => "Llegó el resumen de su sesión 💌",
  };
  const SENALES = {
    entrada: (n) => `${n} entró`,
    te_extrano: (n) => `${n}: “te extraño”`,
    libre: (n) => `${n} se puso libre para hablar`,
    abrazo: (n) => `${n} mandó un abrazo 🤗`,
    beso: (n) => `${n} mandó un beso 😘`,
    pensando: (n) => `${n} pensó en ti 💭`,
    buenos_dias: (n) => `${n}: “buenos días” ☀️`,
    buenas_noches: (n) => `${n}: “buenas noches” 🌙`,
    animo: (n) => `${n} compartió su ánimo 💗`,
    respuesta: (n) => `${n} respondió la pregunta del día 💭`,
    carta: (n) => `${n} escribió una carta 💌`,
    momento: (n) => `${n} compartió un momento 📸`,
    riego: (n) => `${n} regó el girasol 💧`,
    vale: (n) => `${n} regaló un vale 🎟️`,
    canje: (n) => `${n} canjeó un vale 🎟️`,
    razon: (n) => `${n} echó una razón al frasco 🫙`,
    latido: (n) => `${n} mandó su latido 💓`,
    notita: (n) => `${n} dejó una notita 📝`,
    cancion: (n) => `${n} dedicó una canción 🎶`,
    a_dormir: (n) => `${n} se fue a dormir 🌙`,
    despierto: (n) => `${n} despertó ☀️`,
    foco: (n) => `${n} propuso un rato de foco 📚`,
    foco_empieza: (n) => `${n} se sumó al rato de foco ⏳`,
    record: (n) => `${n} rompió un récord 🏆`,
    reto: (n) => `${n} retó a un juego 🎮`,
    sesion: (n) => `${n} abrió una sesión de pareja 💬`,
    sesion_msj: (n) => `${n} escribió en la sesión 💬`,
    sesion_fin: (n) => `${n} cerró la sesión: llegó el resumen 💌`,
  };
  // Lo que se "siente" al recibir una señal: lluvia de emojis y vibración (Android)
  const SENTIR = {
    te_extrano: { emoji: "❤️", vibra: [200, 100, 200] },
    abrazo: { emoji: "🤗", vibra: [500] },
    beso: { emoji: "😘", vibra: [80, 60, 80] },
    pensando: { emoji: "💭", vibra: [60] },
    buenos_dias: { emoji: "☀️", vibra: [100, 80, 100, 80, 100] },
    buenas_noches: { emoji: "🌙", vibra: [100, 80, 100, 80, 100] },
    carta: { emoji: "💌", vibra: [100, 50, 100, 50, 300] },
    vale: { emoji: "🎟️", vibra: [80, 60, 80, 60, 200] },
    razon: { emoji: "💗", vibra: [60, 40, 60] },
    latido: { emoji: "💓", vibra: [90, 120, 90, 600, 90, 120, 90, 600] },
    notita: { emoji: "📝", vibra: [60, 60, 60] },
    cancion: { emoji: "🎶", vibra: [80, 80, 80] },
    a_dormir: { emoji: "💤", vibra: [60, 80, 60] },
    despierto: { emoji: "☀️", vibra: [100, 80, 100, 80, 100] },
    record: { emoji: "🏆", vibra: [120, 60, 120, 60, 320] },
    reto: { emoji: "🎮", vibra: [80, 60, 80] },
  };
  function lluvia(emoji, n = 16) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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
  function sentir(tipo) {
    const s = SENTIR[tipo]; if (!s) return;
    lluvia(s.emoji);
    try { if (navigator.vibrate) navigator.vibrate(s.vibra); } catch (e) {}
  }

  // ---------- utilidades de animación ----------
  const pocoMovimiento = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Vuelve a disparar una animación CSS aunque ya se haya usado
  function animar(el, clase) {
    if (!el) return;
    el.classList.remove(clase); void el.offsetWidth; el.classList.add(clase);
    el.addEventListener("animationend", () => el.classList.remove(clase), { once: true });
  }
  // Corazoncitos que salen disparados desde un botón
  function estallido(el, emoji = "💗", n = 7) {
    if (!el || pocoMovimiento()) return;
    const r = el.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2, d = 34 + Math.random() * 18;
      const s = document.createElement("span"); s.className = "chispa"; s.textContent = emoji;
      s.style.left = r.left + r.width / 2 + "px"; s.style.top = r.top + r.height / 2 + "px";
      s.style.setProperty("--dx", Math.round(Math.cos(a) * d) + "px");
      s.style.setProperty("--dy", Math.round(Math.sin(a) * d) + "px");
      document.body.append(s); setTimeout(() => s.remove(), 600);
    }
  }
  // Un número que cuenta hasta su valor (≤ 450 ms, suave al final)
  function contar(el, hasta, desde = 0) {
    if (!el) return;
    if (pocoMovimiento() || hasta === desde) { el.textContent = hasta; return; }
    const t0 = performance.now(), dur = 450;
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(desde + (hasta - desde) * e);
      if (k < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }
  // Al abrir una pestaña, sus bloques entran uno tras otro
  function entrarEscalonado(tab) {
    if (pocoMovimiento()) return;
    const bloques = [...document.querySelectorAll(`#tab-${tab} > .col > *`)].filter((e) => !e.hidden).slice(0, 12);
    bloques.forEach((e, i) => { e.style.setProperty("--i", i); animar(e, "entra"); });
  }
  // La "luz" de la barra se desliza hasta la pestaña activa
  function moverLuz() {
    const nav = $("tabs"), luz = nav.querySelector(".luz"), b = nav.querySelector("button.on");
    if (!luz || !b || nav.hidden) return;
    const primera = !nav.classList.contains("con-luz");
    if (primera) luz.style.transition = "none"; // la primera vez aparece directo en su lugar
    luz.style.width = b.offsetWidth + "px"; luz.style.height = b.offsetHeight + "px";
    luz.style.transform = `translate(${b.offsetLeft}px, ${b.offsetTop - 6}px)`;
    nav.classList.add("con-luz");
    if (primera) { void luz.offsetWidth; luz.style.transition = ""; }
  }
  window.addEventListener("resize", moverLuz);

  async function render() {
    // las últimas señales de los dos y, aparte, su última entrada y su último "te extraño"
    // (entre las 12 últimas pueden no estar: con unas horas de uso de uno solo ya quedan afuera)
    const suUltimo = (tipo) => sb.from("eventos").select("creado_en").eq("pareja_id", pareja.id).eq("de_usuario", otro.id)
      .eq("tipo", tipo).order("creado_en", { ascending: false }).limit(1).maybeSingle();
    const [{ data: evs, error: errEvs }, { data: ultEntrada }, { data: ultMsg }, { count: veces }] = await Promise.all([
      sb.from("eventos").select("*").eq("pareja_id", pareja.id).order("creado_en", { ascending: false }).limit(12),
      suUltimo("entrada"), suUltimo("te_extrano"),
      // ¿Cuántas veces pensó en ti hoy? (señales de cariño desde la medianoche de tu zona)
      sb.from("eventos").select("id", { count: "exact", head: true })
        .eq("pareja_id", pareja.id).eq("de_usuario", otro.id)
        .in("tipo", ["te_extrano", "pensando", "beso", "abrazo", "latido", "buenos_dias", "buenas_noches", "notita", "carta", "razon", "cancion"])
        .gte("creado_en", aIso(diaHoy() + "T00:00", miTz())),
    ]);
    if (errEvs) return; // sin red se queda lo que ya se veía
    const suyos = (evs || []).filter((e) => e.de_usuario !== user.id);
    // Si abriste la app por una señal reciente (p. ej. tocando la notificación del abrazo), la sientes al entrar
    const ult = suyos[0];
    if (ult && SENTIR[ult.tipo] && Date.now() - new Date(ult.creado_en).getTime() < 10 * 60000
        && sessionStorage.getItem("sentido") !== String(ult.id)) {
      sessionStorage.setItem("sentido", ult.id); sentir(ult.tipo);
    }
    $("status-title").textContent = ultEntrada ? `${otro.nombre} entró ${ago(ultEntrada.creado_en)}` : `${otro.nombre} todavía no ha entrado`;
    $("status-when").textContent = ultMsg ? `último “te extraño” ${ago(ultMsg.creado_en)}` : "aún sin mensajes";
    $("pensando-hoy").hidden = !veces;
    if (veces) $("pensando-hoy").textContent = `💭 Hoy ${otro.nombre} pensó en ti ${veces === 1 ? "1 vez" : veces + " veces"}`;
    const list = $("log-list"); list.innerHTML = "";
    (evs || []).forEach((e) => {
      const quien = e.de_usuario === user.id ? perfil.nombre : otro.nombre;
      const li = document.createElement("li"), a = document.createElement("span"), b = document.createElement("span");
      a.textContent = (SENALES[e.tipo] || SENALES.entrada)(quien);
      b.textContent = ago(e.creado_en); li.append(a, b); list.append(li);
    });
  }

  $("btn-extrano").addEventListener("click", async () => {
    const b = $("btn-extrano"); b.disabled = true; estallido(b, "❤️", 9);
    const { error } = await sb.from("eventos").insert({ pareja_id: pareja.id, de_usuario: user.id, tipo: "te_extrano" });
    toast(error ? "No se pudo enviar" : "Enviado ❤️");
    b.disabled = false; render();
  });

  // Señales rápidas: abrazo, beso, pienso en ti, buenos días, buenas noches
  document.querySelectorAll("#senales button").forEach((b) => b.addEventListener("click", async () => {
    const tipo = b.dataset.senal;
    animar(b, "pop"); estallido(b, SENTIR[tipo].emoji, 6);
    document.querySelectorAll("#senales button").forEach((x) => (x.disabled = true));
    const { error } = await sb.from("eventos").insert({ pareja_id: pareja.id, de_usuario: user.id, tipo });
    if (error) toast("No se pudo enviar");
    else toast(`Enviado a ${otro.nombre} ${SENTIR[tipo].emoji}`);
    // una pausa corta para no mandar diez seguidas sin querer
    setTimeout(() => document.querySelectorAll("#senales button").forEach((x) => (x.disabled = false)), 1500);
    render();
  }));

  // ---------- bienvenida y guía ----------
  function cerrarBienvenida() { try { localStorage.setItem("bienvenida-vista", "1"); } catch (e) {} $("bienvenida").hidden = true; }
  $("bienvenida-ok").addEventListener("click", () => { cerrarBienvenida(); lluvia("💗", 10); });
  $("bienvenida-guia").addEventListener("click", () => {
    cerrarBienvenida(); irA("ajustes");
    const primero = $("guia").querySelector("details"); if (primero) primero.open = true;
    setTimeout(() => $("guia").scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  });

  // ---------- navegación por pestañas ----------
  const TABS = ["inicio", "juntos", "juegos", "horarios", "calendario", "ajustes"];
  const AL_ABRIR = {}; // cada pestaña registra aquí qué cargar al abrirse
  // La sala de juegos vive en juegos/sala.js: se entera por un evento
  // La sala de juegos (unos 130 KB) se baja con el Inicio ya en pantalla, para no demorar la entrada
  let juegos = null;
  function cargarJuegos() {
    if (juegos) return juegos;
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "/juegos/juegos.css"; document.head.append(css);
    juegos = new Promise((listo) => {
      // se bajan a la vez y corren en orden: primero la sala y después cada juego, que se anota en ella
      ["sala", "corazones", "vuelo", "memoria", "fusion"].forEach((j, i, todos) => {
        const s = document.createElement("script");
        s.src = `/juegos/${j}.js`; s.async = false;
        if (i === todos.length - 1) s.onload = s.onerror = listo;
        document.body.append(s);
      });
    }).then(() => {
      // si la sala no llegó a bajarse (sin red), la próxima vez que se abra Juegos se vuelve a intentar
      if (!window.NosotrosJuegos) { juegos = null; css.remove(); }
    });
    return juegos;
  }
  AL_ABRIR.juegos = () => cargarJuegos().then(() => window.dispatchEvent(new Event("nosotros:juegos")));
  function irA(tab) {
    if (!TABS.includes(tab)) tab = "inicio";
    TABS.forEach((t) => ($("tab-" + t).hidden = t !== tab));
    // Horarios vive dentro de Agenda, junto al calendario: en la barra se enciende el mismo botón
    const enBarra = tab === "horarios" ? "calendario" : tab;
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === enBarra));
    // se conserva el estado: si hay un juego abierto (p. ej. al tocar una notificación), "atrás" lo sigue cerrando
    history.replaceState(history.state, "", tab === "inicio" ? location.pathname : "#" + tab);
    window.scrollTo(0, 0);
    moverLuz(); entrarEscalonado(tab);
    if (AL_ABRIR[tab]) AL_ABRIR[tab]();
  }
  // Las acciones (momento, dibujo, notita, canción) también rebotan al tocarlas
  document.querySelectorAll(".acciones > *").forEach((b) => b.addEventListener("click", () => animar(b, "pop")));
  const tabDeUrl = (u) => (new URL(u, location.origin).hash || "#inicio").slice(1);
  document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => irA(b.dataset.tab)));
  // Selector Calendario / Horarios dentro de Agenda
  document.querySelectorAll("[data-ir]").forEach((b) => b.addEventListener("click", () => irA(b.dataset.ir)));
  // Al volver "atrás" desde un juego, la URL vuelve a decir la pestaña que se ve (pudo cambiar con el juego abierto)
  window.addEventListener("popstate", () => {
    const t = TABS.find((x) => !$("tab-" + x).hidden);
    if (t) history.replaceState(history.state, "", t === "inicio" ? location.pathname : "#" + t);
  });
  // Al tocar una notificación con la app ya abierta, el service worker nos dice a qué pestaña ir
  if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data && e.data.url && !S.home.hidden) irA(tabDeUrl(e.data.url));
  });

  // ---------- ajustes ----------
  const ZONAS = [
    "America/Guayaquil", "America/Santiago", "America/Bogota", "America/Lima", "America/Caracas", "America/La_Paz",
    "America/Asuncion", "America/Montevideo", "America/Argentina/Buenos_Aires", "America/Sao_Paulo",
    "America/Mexico_City", "America/Panama", "America/Costa_Rica", "America/Guatemala", "America/Havana",
    "America/Santo_Domingo", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
    "Europe/Madrid", "Europe/London", "Europe/Paris", "Europe/Rome", "UTC",
  ];
  const nombreTz = (z) => z.replace(/_/g, " ");
  function renderAjustes() {
    $("aj-nombre").value = perfil.nombre || "";
    const sel = $("aj-tz"); sel.innerHTML = "";
    [...new Set([miTz(), tzNavegador, ...ZONAS])].forEach((z) => {
      const o = document.createElement("option"); o.value = z;
      o.textContent = `${nombreTz(z)} · ${hora(new Date(), z)}`;
      sel.append(o);
    });
    sel.value = miTz();
    notaTz();
    $("aj-pareja").textContent = `Tu pareja: ${otro.nombre} · ${nombreTz(suTz())} (allá son las ${hora(new Date(), suTz())})`;
    $("aj-desde").value = pareja.desde || "";
    $("aj-conocidos").value = pareja.conocidos || "";
    $("aj-desde").max = $("aj-conocidos").max = diaHoy();
    $("aj-usuario").textContent = `Tu usuario: ${usuarioDe(user.email)}`;
    renderInstalar(); renderAvatares(); renderDistancia();
  }
  $("f-clave").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nueva = $("aj-clave").value;
    if (nueva.length < 8) { toast("La contraseña necesita al menos 8 caracteres"); return; }
    const { error } = await sb.auth.updateUser({ password: nueva });
    if (error) { toast("No se pudo cambiar: " + error.message); return; }
    $("aj-clave").value = ""; toast("Contraseña cambiada 🔐");
  });
  $("f-desde").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { data, error } = await sb.rpc("fijar_fechas", {
      p_conocidos: $("aj-conocidos").value || null, p_desde: $("aj-desde").value || null,
    });
    if (error || !filaValida(data)) { toast("No se pudieron guardar las fechas"); return; }
    pareja = { ...pareja, ...data }; renderJuntos();
    toast("Fechas guardadas 💞");
  });

  // ---------- instalar la app (PWA) ----------
  // Android y computador: el navegador ofrece instalarla (beforeinstallprompt). iPhone: desde Safari.
  let promptInstalar = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); promptInstalar = e; renderInstalar(); });
  window.addEventListener("appinstalled", () => { promptInstalar = null; toast("App instalada 💗"); renderInstalar(); });
  function renderInstalar() {
    const estado = $("instalar-estado");
    $("btn-instalar").hidden = $("btn-instalar-login").hidden = !promptInstalar;
    if (isStandalone) estado.textContent = "Ya la estás usando instalada ✓";
    else if (promptInstalar) estado.textContent = "Instálala para abrirla con su propio ícono, a pantalla completa.";
    else if (isIOS) estado.textContent = "En Safari, toca Compartir y luego “Agregar a pantalla de inicio”.";
    else estado.textContent = "En el menú del navegador, elige “Instalar app” o “Agregar a pantalla de inicio”.";
  }
  async function instalar() {
    if (!promptInstalar) return;
    promptInstalar.prompt();
    await promptInstalar.userChoice;
    promptInstalar = null; renderInstalar();
  }
  $("btn-instalar").addEventListener("click", instalar);
  $("btn-instalar-login").addEventListener("click", instalar);
  function notaTz() {
    $("aj-tz-note").textContent = `Para ti son las ${hora(new Date(), $("aj-tz").value)}; para ${otro.nombre}, las ${hora(new Date(), suTz())}.`;
  }
  $("aj-tz").addEventListener("change", notaTz);
  $("f-ajustes").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = $("aj-nombre").value.trim(), tz = $("aj-tz").value;
    if (!nombre) return;
    const { error } = await sb.from("perfiles").update({ nombre, tz }).eq("id", user.id);
    if (error) { toast("No se pudo guardar"); return; }
    perfil = { ...perfil, nombre, tz };
    // el saludo, los relojes y las fechas usan el nombre y la zona: se repintan ya, no al próximo tic del reloj
    toast("Guardado ❤️"); render(); renderDispo(); renderAjustes(); renderRelojes(); renderAvatares(); renderJuntos();
  });
  AL_ABRIR.ajustes = renderAjustes;

  // ---------- disponibilidad para llamar ----------
  const dispo = { mia: null, suya: null };
  let dispoTimer = null;
  // Una fila cuenta como "libre" solo si no venció (por si el cron aún no la apagó)
  function estaLibre(d) { return !!(d && d.libre && (!d.hasta || new Date(d.hasta) > new Date())); }

  async function cargarDispo() {
    const { data, error } = await sb.from("disponibilidad").select("*").in("usuario_id", [user.id, otro.id]); if (error) return; // sin red se queda lo que ya se veía
    dispo.mia = (data || []).find((d) => d.usuario_id === user.id) || null;
    dispo.suya = (data || []).find((d) => d.usuario_id === otro.id) || null;
    renderDispo();
  }

  function renderDispo() {
    const mia = estaLibre(dispo.mia), suya = estaLibre(dispo.suya);
    const b = $("btn-libre");
    b.classList.toggle("on", mia);
    b.textContent = mia ? "Estoy libre · tocar para apagar" : "Estoy libre para hablar";
    $("libre-note").textContent = mia
      ? `Se apaga solo a las ${hora(dispo.mia.hasta, miTz())}.`
      : `Avísale que puedes hablar ahora. Se apaga solo en ${HORAS_LIBRE} h.`;

    const box = $("libre-status");
    box.hidden = !suya;
    box.classList.toggle("ambos", mia && suya);
    if (suya) {
      $("libre-title").textContent = mia ? "¡Los dos están libres!" : `${otro.nombre} está libre ahora`;
      $("libre-when").textContent = mia
        ? "Es el momento de llamar ☎️"
        : `hasta las ${hora(dispo.suya.hasta, miTz())} tu hora · ${hora(dispo.suya.hasta, suTz())} la suya`;
    }

    // Volver a pintar cuando venza la más próxima
    clearTimeout(dispoTimer);
    const vence = [dispo.mia, dispo.suya].filter(estaLibre).map((d) => new Date(d.hasta).getTime() - Date.now()).filter((ms) => ms > 0);
    if (vence.length) dispoTimer = setTimeout(renderDispo, Math.min(...vence) + 500);
  }

  $("btn-libre").addEventListener("click", async () => {
    const b = $("btn-libre"); b.disabled = true;
    const libre = !estaLibre(dispo.mia);
    const hasta = libre ? new Date(Date.now() + HORAS_LIBRE * 3600_000).toISOString() : null;
    const { data, error } = await sb.from("disponibilidad")
      .upsert({ usuario_id: user.id, libre, hasta, actualizado_en: new Date().toISOString() })
      .select().single();
    if (error) toast("No se pudo cambiar");
    else { dispo.mia = data; toast(libre ? `Listo, le avisamos a ${otro.nombre} ☎️` : "Ya no estás libre"); }
    b.disabled = false; renderDispo();
  });

  // ---------- ánimo: cómo se siente cada uno ----------
  // `frase`: cómo se lee sobre la otra persona ("Matina tiene sueño"); mismos estados que en notificar
  const ESTADOS = {
    feliz: { emoji: "😊", texto: "Feliz", frase: "está feliz" },
    amor: { emoji: "🥰", texto: "Con mucho amor", frase: "anda con mucho amor" },
    calma: { emoji: "😌", texto: "En calma", frase: "está en calma" },
    sueno: { emoji: "😴", texto: "Con sueño", frase: "tiene sueño" },
    extrano: { emoji: "🥺", texto: "Extrañándote", frase: "te está extrañando" },
    triste: { emoji: "😢", texto: "Triste", frase: "está triste" },
    estres: { emoji: "😤", texto: "Con estrés", frase: "tiene estrés" },
    malestar: { emoji: "🤒", texto: "Con malestar", frase: "no se siente bien" },
    celebrar: { emoji: "🥳", texto: "Con ganas de celebrar", frase: "tiene ganas de celebrar" },
  };
  const animos = { mio: null, suyo: null };
  let animoElegido = null;

  async function cargarAnimos() {
    const { data, error } = await sb.from("animos").select("*").in("usuario_id", [user.id, otro.id]); if (error) return; // sin red se queda lo que ya se veía
    animos.mio = (data || []).find((a) => a.usuario_id === user.id) || null;
    animos.suyo = (data || []).find((a) => a.usuario_id === otro.id) || null;
    renderAnimos();
  }
  function renderAnimos() {
    const s = animos.suyo, p = $("animo-suyo"), e = s && ESTADOS[s.estado];
    p.hidden = !e;
    if (e) {
      p.innerHTML = "";
      const b = document.createElement("b"); b.textContent = e.emoji;
      p.append(b, `${otro.nombre} ${e.frase} · ${ago(s.actualizado_en)}`);
      if (s.nota) { const q = document.createElement("q"); q.textContent = s.nota; p.append(document.createElement("br"), q); }
    }
    const m = animos.mio && ESTADOS[animos.mio.estado];
    $("btn-animo").textContent = m ? `Tu ánimo: ${m.emoji} ${m.texto}` : "¿Cómo te sientes hoy? 💗";
  }

  function abrirAnimo() {
    animoElegido = animos.mio ? animos.mio.estado : null;
    $("animo-nota").value = (animos.mio && animos.mio.nota) || "";
    $("animo-ayuda").textContent = `${otro.nombre} lo verá en su Inicio y le llegará un aviso.`;
    const g = $("animos"); g.innerHTML = "";
    Object.entries(ESTADOS).forEach(([k, e]) => {
      const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(k === animoElegido));
      const em = document.createElement("b"); em.textContent = e.emoji; b.append(em, e.texto);
      b.addEventListener("click", () => {
        animoElegido = k;
        g.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      });
      g.append(b);
    });
    $("dlg-animo").showModal();
  }
  $("btn-animo").addEventListener("click", abrirAnimo);
  $("animo-cancelar").addEventListener("click", () => $("dlg-animo").close());
  $("f-animo").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!animoElegido) { toast("Elige cómo te sientes"); return; }
    const fila = { usuario_id: user.id, estado: animoElegido, nota: $("animo-nota").value.trim() || null, actualizado_en: new Date().toISOString() };
    const { data, error } = await sb.from("animos").upsert(fila).select().single();
    if (error) { toast("No se pudo compartir"); return; }
    animos.mio = data; renderAnimos();
    $("dlg-animo").close(); toast(`Listo, ${otro.nombre} ya sabe cómo estás ${ESTADOS[animoElegido].emoji}`);
  });

  // ---------- horarios habituales ----------
  // Se guardan como hora UTC (dia 0=domingo … 6=sábado, hora 0-23) de una semana fija de referencia
  // (SEMANA_REF): así "lunes 20:00" sigue siendo lunes 20:00 para quien lo marcó aunque su país cambie
  // de hora (Chile en abril y septiembre). Para cruzar los dos horarios se usa la semana actual.
  // En memoria: mios = horas locales mías, suyos = horas locales de mi pareja (índice dia*24+hora).
  const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const DIAS_LARGO = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0]; // lunes primero
  const horarios = { mios: new Set(), suyos: new Set() }; // índices UTC: dia*24+hora
  const idx = (d, h) => d * 24 + h;
  const hh = (h) => String(h % 24).padStart(2, "0") + ":00";
  let mapaMio = null, mapaSuyo = null, refMio = null, refSuyo = null;
  // Semana del 15 de noviembre de 2026: sin cambios de hora en América ni en Europa, y con los mismos
  // desfases con que se marcaron los primeros horarios (Ecuador UTC−5, Chile UTC−3)
  const SEMANA_REF = new Date(Date.UTC(2026, 10, 15));

  // Desplazamiento (en minutos) de una zona horaria en un instante dado
  function offsetMin(tz, date) {
    const p = {};
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(date).forEach((x) => (p[x.type] = x.value));
    const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((comoUtc - date.getTime()) / 60000);
  }
  // Para una zona: índice UTC → índice local y al revés, en la semana de `ref` (por defecto, la actual)
  function mapaTz(tz, ref = new Date()) {
    const aLocal = new Array(168), aUtc = new Array(168);
    const base = new Date(ref); base.setUTCHours(0, 0, 0, 0);
    base.setUTCDate(base.getUTCDate() - base.getUTCDay()); // domingo de esta semana, 00:00 UTC
    for (let i = 0; i < 168; i++) {
      const t = new Date(base.getTime() + i * 3600000);
      const local = new Date(t.getTime() + offsetMin(tz, t) * 60000);
      const li = idx(local.getUTCDay(), local.getUTCHours());
      aLocal[i] = li; aUtc[li] = i;
    }
    // hueco por cambio de hora (una hora local que no existe esa semana): usar la vecina
    for (let i = 0; i < 168; i++) if (aUtc[i] === undefined) aUtc[i] = aUtc[(i + 167) % 168];
    return { aLocal, aUtc };
  }
  // Hora local de mi pareja para mi (día, hora) local
  const horaSuya = (d, h) => mapaSuyo.aLocal[mapaMio.aUtc[idx(d, h % 24)]] % 24;

  // Mi hora local (índice) → la hora local de mi pareja en ese mismo instante de esta semana
  const enSuya = (l) => mapaSuyo.aLocal[mapaMio.aUtc[l]];
  async function cargarHorarios() {
    mapaMio = mapaTz(miTz()); mapaSuyo = mapaTz(suTz());
    refMio = mapaTz(miTz(), SEMANA_REF); refSuyo = mapaTz(suTz(), SEMANA_REF);
    const { data, error } = await sb.from("horarios").select("usuario_id, dia, hora").in("usuario_id", [user.id, otro.id]);
    if (error) return;
    horarios.mios = new Set(); horarios.suyos = new Set();
    (data || []).forEach((r) => {
      const guardado = idx(r.dia, r.hora);
      if (r.usuario_id === user.id) horarios.mios.add(refMio.aLocal[guardado]);
      else horarios.suyos.add(refSuyo.aLocal[guardado]);
    });
    renderHorarios();
  }
  AL_ABRIR.horarios = cargarHorarios;

  function renderHorarios() {
    $("hor-otro").textContent = otro.nombre;
    const g = $("horario"); g.innerHTML = "";
    const texto = (cls, t) => { const e = document.createElement("div"); e.className = cls; e.textContent = t; return e; };
    g.append(texto("dia", ""));
    ORDEN_DIAS.forEach((d) => g.append(texto("dia", DIAS[d])));
    for (let h = 0; h < 24; h++) {
      const lab = texto("hora", hh(h));
      const s = document.createElement("small"); s.textContent = hh(horaSuya(1, h)); lab.append(s);
      g.append(lab);
      ORDEN_DIAS.forEach((d) => {
        const c = document.createElement("div"); c.className = "celda";
        const l = idx(d, h);
        c.dataset.l = l;
        c.classList.toggle("mio", horarios.mios.has(l));
        c.classList.toggle("suyo", horarios.suyos.has(enSuya(l)));
        g.append(c);
      });
    }
    renderComun();
  }

  // Lista "Horas en común": cruce de los dos, agrupado por mi día local, con las dos horas
  function renderComun() {
    const list = $("comun-list"); list.innerHTML = "";
    const comunes = [...horarios.mios].filter((l) => horarios.suyos.has(enSuya(l)));
    if (!comunes.length) {
      const li = document.createElement("li"); li.className = "muted";
      li.textContent = horarios.suyos.size ? "Todavía no coinciden horas. Marca más o pídele que marque." : `${otro.nombre} todavía no marcó su horario.`;
      list.append(li); return;
    }
    const porDia = {};
    comunes.forEach((l) => (porDia[Math.floor(l / 24)] = porDia[Math.floor(l / 24)] || []).push(l % 24));
    ORDEN_DIAS.filter((d) => porDia[d]).forEach((d) => {
      const rangos = [];
      porDia[d].sort((a, b) => a - b).forEach((h) => {
        const r = rangos[rangos.length - 1];
        if (r && r.fin === h) r.fin = h + 1; else rangos.push({ ini: h, fin: h + 1 });
      });
      const li = document.createElement("li"), a = document.createElement("span"), b = document.createElement("span");
      a.textContent = DIAS_LARGO[d];
      b.textContent = rangos.map((r) =>
        `${hh(r.ini)}–${hh(r.fin)} tú · ${hh(horaSuya(d, r.ini))}–${hh(horaSuya(d, r.fin))} ${otro.nombre}`
      ).join("  |  ");
      li.append(a, b); list.append(li);
    });
  }

  // Marcar tocando o arrastrando; se guarda al soltar
  let pintando = null; // { valor, tocados }
  const grilla = $("horario");
  function pintar(c) {
    const l = +c.dataset.l;
    if (pintando.tocados.has(l)) return;
    pintando.tocados.add(l);
    c.classList.toggle("mio", pintando.valor);
    if (pintando.valor) horarios.mios.add(l); else horarios.mios.delete(l);
  }
  grilla.addEventListener("pointerdown", (e) => {
    const c = e.target.closest(".celda"); if (!c) return;
    grilla.setPointerCapture(e.pointerId);
    pintando = { valor: !c.classList.contains("mio"), tocados: new Set() };
    pintar(c);
  });
  grilla.addEventListener("pointermove", (e) => {
    if (!pintando) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const c = el && el.closest(".celda"); if (c) pintar(c);
  });
  async function guardarHorario() {
    if (!pintando) return;
    const { valor, tocados } = pintando; pintando = null;
    // de mis horas locales a lo que se guarda (UTC de la semana de referencia)
    const us = [...tocados].map((l) => refMio.aUtc[l]); if (!us.length) return;
    let error;
    if (valor) {
      const filas = us.map((u) => ({ usuario_id: user.id, dia: Math.floor(u / 24), hora: u % 24 }));
      ({ error } = await sb.from("horarios").upsert(filas, { onConflict: "usuario_id,dia,hora" }));
    } else {
      const f = us.map((u) => `and(dia.eq.${Math.floor(u / 24)},hora.eq.${u % 24})`).join(",");
      ({ error } = await sb.from("horarios").delete().eq("usuario_id", user.id).or(f));
    }
    if (error) { toast("No se pudo guardar"); cargarHorarios(); } else renderComun();
  }
  grilla.addEventListener("pointerup", guardarHorario);
  grilla.addEventListener("pointercancel", guardarHorario);

  // ---------- calendario compartido ----------
  const EMOJI = { llamada: "☎️", cita: "💞", viaje: "✈️", aniversario: "🎉", otro: "📌" };
  let eventosCal = [], mesVisto = null, diaSel = null, editando = null;
  const pad = (n) => String(n).padStart(2, "0");

  // Partes de la fecha local de un instante en una zona
  function partes(iso, tz) {
    const p = {};
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })
      .formatToParts(new Date(iso)).forEach((x) => (p[x.type] = x.value));
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
  }
  // instante → "YYYY-MM-DDTHH:MM" (lo que usa <input type=datetime-local>) en una zona
  const aWall = (iso, tz) => { const p = partes(iso, tz); return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`; };
  const claveDia = (iso, tz) => aWall(iso, tz).slice(0, 10);
  // "YYYY-MM-DDTHH:MM" en una zona → instante ISO (UTC)
  function aIso(wall, tz) {
    const [y, m, d, h, mi] = wall.split(/[-T:]/).map(Number);
    const comoUtc = Date.UTC(y, m - 1, d, h, mi);
    let utc = comoUtc - offsetMin(tz, new Date(comoUtc)) * 60000;
    utc = comoUtc - offsetMin(tz, new Date(utc)) * 60000; // segunda pasada por si cae en cambio de hora
    return new Date(utc).toISOString();
  }
  const sumarDia = (k) => { const [y, m, d] = k.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, d + 1)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
  function fechaCorta(iso, tz) {
    const opts = { weekday: "short", day: "numeric", month: "short" };
    try { return new Date(iso).toLocaleDateString("es", { ...opts, timeZone: tz }); }
    catch (e) { return new Date(iso).toLocaleDateString("es", opts); }
  }
  const fechaLarga = (k) => {
    const t = new Date(k + "T00:00:00Z").toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  };

  async function cargarCal() {
    const { data, error } = await sb.from("eventos_cal").select("*").eq("pareja_id", pareja.id).order("inicio"); if (error) return; // sin red se queda lo que ya se veía
    eventosCal = data || [];
    if (!mesVisto) { const p = partes(new Date().toISOString(), miTz()); mesVisto = { y: p.y, m: p.m }; }
    renderCal();
  }
  AL_ABRIR.calendario = cargarCal;
  function renderCal() { renderMes(); renderLista(); }

  // Vista mes: un punto por evento (hasta 3) en cada día, en mi zona
  function renderMes() {
    const { y, m } = mesVisto;
    const titulo = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es", { month: "long", year: "numeric", timeZone: "UTC" });
    $("mes-titulo").textContent = titulo.charAt(0).toUpperCase() + titulo.slice(1);
    const g = $("mes"); g.innerHTML = "";
    ORDEN_DIAS.forEach((d) => { const e = document.createElement("div"); e.className = "dia"; e.textContent = DIAS[d]; g.append(e); });
    const marcas = {};
    eventosCal.forEach((ev) => {
      let k = claveDia(ev.inicio, miTz()); const kf = claveDia(ev.fin || ev.inicio, miTz());
      for (let i = 0; i < 62 && k <= kf; i++) { (marcas[k] = marcas[k] || []).push(ev); k = sumarDia(k); }
    });
    const hueco = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // lunes = 0
    const nDias = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const hoy = claveDia(new Date().toISOString(), miTz());
    for (let i = 0; i < hueco; i++) g.append(document.createElement("div"));
    for (let d = 1; d <= nDias; d++) {
      const k = `${y}-${pad(m)}-${pad(d)}`;
      const c = document.createElement("button"); c.type = "button"; c.className = "celda-mes";
      c.classList.toggle("hoy", k === hoy); c.classList.toggle("sel", k === diaSel);
      const n = document.createElement("span"); n.textContent = d; c.append(n);
      // días especiales del mes (el de novios y el de conocerse)
      const esp = especialesDe(k);
      if (esp.length) {
        c.classList.add("especial");
        const em = document.createElement("em"); em.textContent = esp.map((x) => x.e.emoji).join(""); c.append(em);
        c.setAttribute("aria-label", `${d}: ${esp.map((x) => textoEspecial(x.e, x.f, k, false)).join(", ")}`);
      }
      if (marcas[k]) { const dots = document.createElement("i"); dots.textContent = "•".repeat(Math.min(3, marcas[k].length)); c.append(dots); }
      c.addEventListener("click", () => { diaSel = diaSel === k ? null : k; renderCal(); });
      g.append(c);
    }
  }
  function cambiarMes(n) {
    const t = new Date(Date.UTC(mesVisto.y, mesVisto.m - 1 + n, 1));
    mesVisto = { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 }; diaSel = null; renderCal();
  }
  $("mes-prev").addEventListener("click", () => cambiarMes(-1));
  $("mes-next").addEventListener("click", () => cambiarMes(1));

  // Lista: los próximos, o los del día tocado en el mes
  function renderLista() {
    const list = $("prox-list"); list.innerHTML = "";
    let evs;
    if (diaSel) {
      evs = eventosCal.filter((ev) => claveDia(ev.inicio, miTz()) <= diaSel && claveDia(ev.fin || ev.inicio, miTz()) >= diaSel);
      $("prox-titulo").textContent = fechaLarga(diaSel);
    } else {
      evs = eventosCal.filter((ev) => new Date(ev.fin || ev.inicio).getTime() >= Date.now()).slice(0, 10);
      $("prox-titulo").textContent = "Próximos";
    }
    $("btn-nuevo").textContent = diaSel ? "Agendar ese día" : "Agendar algo";
    // Día especial: arriba de la lista (el día tocado, o el próximo si no hay día elegido)
    const prox = diaSel ? null : proximoEspecial();
    const especiales = diaSel ? especialesDe(diaSel).map((x) => ({ ...x, k: diaSel })) : prox ? [prox] : [];
    especiales.forEach((x) => {
      const li = document.createElement("li"); li.className = "especial";
      const a = document.createElement("strong"), b = document.createElement("span");
      a.textContent = textoEspecial(x.e, x.f, x.k, false);
      b.textContent = x.e.clave === "novios" ? "Día especial de cada mes · les llega un aviso a los dos" : "El día que se conocieron · les llega un aviso a los dos";
      if (!diaSel) b.textContent = `${fechaCorta(x.k + "T12:00:00Z", "UTC")} · ${b.textContent}`;
      li.append(a, b); list.append(li);
    });
    if (!evs.length && especiales.length) return;
    if (!evs.length) {
      const li = document.createElement("li"); li.className = "muted";
      li.textContent = diaSel ? "Nada ese día." : "Nada agendado todavía. ¿Una llamada?";
      list.append(li); return;
    }
    evs.forEach((ev) => {
      const li = document.createElement("li"), a = document.createElement("strong"), b = document.createElement("span");
      a.textContent = `${EMOJI[ev.tipo] || EMOJI.otro} ${ev.titulo}`;
      b.textContent = cuando(ev);
      li.append(a, b);
      if (ev.nota) { const n = document.createElement("span"); n.className = "nota"; n.textContent = ev.nota; li.append(n); }
      li.addEventListener("click", () => abrirEvento(ev));
      list.append(li);
    });
  }
  // "sáb 19 oct · 19:00–20:00 tú · 21:00–22:00 Camila"; si para mi pareja cae otro día, se indica
  function cuando(ev) {
    const rango = (tz) => hora(ev.inicio, tz) + (ev.fin ? "–" + hora(ev.fin, tz) : "");
    if (ev.fin && claveDia(ev.fin, miTz()) !== claveDia(ev.inicio, miTz())) {
      return `${fechaCorta(ev.inicio, miTz())} ${hora(ev.inicio, miTz())} → ${fechaCorta(ev.fin, miTz())} ${hora(ev.fin, miTz())} (tu hora)`;
    }
    const otroDia = claveDia(ev.inicio, suTz()) !== claveDia(ev.inicio, miTz()) ? ` (${fechaCorta(ev.inicio, suTz())})` : "";
    return `${fechaCorta(ev.inicio, miTz())} · ${rango(miTz())} tú · ${rango(suTz())} ${otro.nombre}${otroDia}`;
  }

  // Diálogo crear / editar
  function abrirEvento(ev, k) {
    editando = ev || null;
    $("ev-titulo-form").textContent = ev ? "Editar" : "Agendar";
    $("ev-titulo").value = ev ? ev.titulo : "";
    $("ev-tipo").value = ev ? ev.tipo : "llamada";
    $("ev-inicio").value = ev ? aWall(ev.inicio, miTz()) : `${k || claveDia(new Date().toISOString(), miTz())}T20:00`;
    $("ev-fin").value = ev && ev.fin ? aWall(ev.fin, miTz()) : "";
    $("ev-nota").value = ev ? ev.nota || "" : "";
    $("ev-borrar").hidden = !ev;
    notaSuya();
    $("dlg-evento").showModal();
  }
  function notaSuya() {
    const w = $("ev-inicio").value;
    if (!w) { $("ev-suya").textContent = ""; return; }
    const iso = aIso(w, miTz());
    $("ev-suya").textContent = `Para ${otro.nombre} es el ${fechaCorta(iso, suTz())} a las ${hora(iso, suTz())}.`;
  }
  $("ev-inicio").addEventListener("input", notaSuya);
  $("btn-nuevo").addEventListener("click", () => abrirEvento(null, diaSel));
  $("ev-cancelar").addEventListener("click", () => $("dlg-evento").close());
  $("f-evento").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fila = {
      titulo: $("ev-titulo").value.trim(), tipo: $("ev-tipo").value,
      inicio: aIso($("ev-inicio").value, miTz()),
      fin: $("ev-fin").value ? aIso($("ev-fin").value, miTz()) : null,
      nota: $("ev-nota").value.trim() || null,
    };
    if (fila.fin && fila.fin < fila.inicio) { toast("Termina antes de empezar, revisa las horas"); return; }
    const q = editando
      ? sb.from("eventos_cal").update(fila).eq("id", editando.id)
      : sb.from("eventos_cal").insert({ ...fila, pareja_id: pareja.id, creado_por: user.id });
    const { error } = await q;
    if (error) { toast("No se pudo guardar"); return; }
    $("dlg-evento").close(); toast(editando ? "Cambiado ❤️" : "Agendado ❤️"); cargarCal(); cargarJuntos();
  });
  $("ev-borrar").addEventListener("click", async () => {
    if (!editando || !confirm("¿Borrar este evento?")) return;
    // Primero un toque (el trigger anota quién borra, para avisar solo al otro) y luego se borra
    await sb.from("eventos_cal").update({ actualizado_en: new Date().toISOString() }).eq("id", editando.id);
    const { error } = await sb.from("eventos_cal").delete().eq("id", editando.id);
    if (error) { toast("No se pudo borrar"); return; }
    $("dlg-evento").close(); toast("Borrado"); cargarCal(); cargarJuntos();
  });

  // ---------- relojes, juntos desde y cuenta regresiva para vernos ----------
  let relojTimer = null, proximo = null, ultimoNum = null;
  const diaHoy = () => claveDia(new Date().toISOString(), miTz());
  const utcDe = (k) => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  const diasEntre = (k1, k2) => Math.round((utcDe(k2) - utcDe(k1)) / 86400000);
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const icono = (h) => (h < 6 ? "🌙" : h < 8 ? "🌅" : h < 18 ? "☀️" : h < 20 ? "🌇" : "🌙");

  function renderRelojes() {
    const ahora = new Date(), iso = ahora.toISOString();
    $("reloj-mio").textContent = hora(ahora, miTz());
    $("reloj-suyo").textContent = hora(ahora, suTz());
    $("reloj-su-nombre").textContent = otro.nombre;
    const hs = partes(iso, suTz()).h;
    $("ico-mio").textContent = icono(partes(iso, miTz()).h);
    $("ico-suyo").textContent = icono(hs);
    const dif = Math.round((offsetMin(suTz(), ahora) - offsetMin(miTz(), ahora)) / 60);
    $("reloj-dif").textContent = dif === 0 ? "misma hora" : dif > 0 ? `+${dif} h` : `−${-dif} h`;
    $("reloj-nota").hidden = hs >= 7;
    $("reloj-nota").textContent = `Shh… para ${otro.nombre} es de madrugada 😴. Tus señales le esperan al despertar.`;
    renderLuna(); renderSaludo(); renderFrase();
  }

  // Saludo según la hora de cada uno
  function momentoDelDia() {
    const h = partes(new Date().toISOString(), miTz()).h;
    return h >= 5 && h < 12 ? "manana" : h >= 12 && h < 19 ? "tarde" : "noche";
  }
  const SALUDOS = { manana: ["Buenos días", "☀️"], tarde: ["Buenas tardes", "🌤️"], noche: ["Buenas noches", "🌙"] };
  function renderSaludo() {
    const [s, e] = SALUDOS[momentoDelDia()];
    $("saludo").textContent = `${s}, ${perfil.nombre} ${e}`; // el emoji no queda solo en otra línea
  }
  // Una frase bonita por día (la misma para los dos)
  const FRASES = [
    "Cada día que pasa es un día menos para abrazarte.", "La distancia es solo el tiempo que falta para vernos.",
    "Te pienso en mi hora y en la tuya.", "Mi lugar favorito es cualquier conversación contigo.",
    "El corazón no sabe medir kilómetros.", "Contigo hasta las videollamadas con mala señal son lindas.",
    "Hoy también te elijo.", "Eres mi buenos días y mi buenas noches.",
    "Nos separa un mapa, nos une todo lo demás.", "Cada mensaje tuyo es un abrazo a distancia.",
    "Contando los días, pero disfrutando cada uno contigo.", "El mismo cielo, la misma luna, el mismo amor.",
    "Si pudiera, te mandaría un abrazo por correo.", "Me haces sonreír sin estar aquí.",
    "Lo mejor de mi día eres tú.", "Pronto, la distancia será solo una historia que contaremos.",
    "Te quiero en todos los husos horarios.", "Mi canción favorita es tu risa.",
    "Falta poco, y cada día vale la pena.", "Eres mi casualidad más bonita.",
    "Querer es estar cerca aunque estemos lejos.", "Gracias por quedarte, aunque el camino sea largo.",
    "Tu voz es mi lugar tranquilo.", "Hasta Talca, y después a donde sea, contigo.",
    "Un día más cerca de tu abrazo.", "Te extraño bonito.",
    "Cada «buenas noches» tuyo me abriga.", "Lo nuestro no entiende de kilómetros.",
    "Eres mi persona favorita en cualquier país.", "Prometo un abrazo por cada día de espera.",
  ];
  function fraseDeHoy() {
    const n = FRASES.length, i = ((diasEntre("2026-01-01", diaPregunta()) % n) + n) % n;
    return FRASES[i];
  }
  function renderFrase() { $("frase-dia").textContent = fraseDeHoy(); }

  // La primera vez que se abre la app cada día: cielo según la hora, un corazón que se dibuja y unas palabras
  let granDiaHoy = false; // ese día la celebración del gran día va sola
  function ritualDelDia() {
    const r = $("ritual"), hoy = diaHoy();
    if (!r.hidden || granDiaHoy || !perfil || !otro) return;
    let visto = null; try { visto = localStorage.getItem("ritual-dia"); } catch (e) {}
    if (visto === hoy) return;
    try { localStorage.setItem("ritual-dia", hoy); } catch (e) {}

    const momento = momentoDelDia(), [s, e] = SALUDOS[momento];
    let fecha = "";
    try { fecha = new Date().toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", timeZone: miTz() }); } catch (err) {}
    $("ritual-fecha").textContent = fecha;
    $("ritual-saludo").textContent = `${s}, ${perfil.nombre} ${e}`;
    // cuánto llevamos (o el texto del día especial, si hoy es 8)
    const j = $("ritual-juntos"), l = textoDesde(ESPECIALES[0], pareja.desde);
    j.hidden = !l;
    if (l && l.hoy) j.textContent = l.texto;
    else if (l) { const n = diasEntre(pareja.desde, hoy); j.innerHTML = `Llevamos <b>${n.toLocaleString("es")}</b> ${n === 1 ? "día" : "días"} de novios 💞`; }
    // cuánto falta para vernos
    const f = $("ritual-falta"), dias = proximo ? diasEntre(hoy, claveDia(proximo.inicio, miTz())) : null;
    f.hidden = dias === null;
    if (dias > 1) f.innerHTML = `y faltan <b>${dias.toLocaleString("es")}</b> días para vernos ✈️`;
    else if (dias === 1) f.textContent = "¡y mañana por fin nos vemos! 😭💞";
    else if (dias !== null) f.textContent = "y hoy estamos juntos 💞";
    $("ritual-frase").textContent = fraseDeHoy();
    $("ritual-firma").textContent = `${otro.nombre} y tú, un día más cerca 💗`;

    // estrellas de noche, lucecitas de día
    const cielo = $("ritual-estrellas"); cielo.innerHTML = "";
    for (let i = 0; i < (momento === "noche" ? 46 : 18); i++) {
      const st = document.createElement("i"), t = momento === "noche" ? 1.5 + Math.random() * 2 : 4 + Math.random() * 10;
      st.style.left = Math.random() * 100 + "%";
      st.style.top = (momento === "noche" ? Math.random() * 70 : 40 + Math.random() * 60) + "%";
      st.style.width = st.style.height = t + "px";
      st.style.animationDelay = -Math.random() * 7 + "s";
      if (momento !== "noche") st.style.filter = `blur(${t / 4}px)`;
      cielo.append(st);
    }
    // cada línea entra después de la anterior, mientras el corazón se termina de dibujar
    let d = 1.3;
    r.querySelectorAll(".ritual-cont > :not(.ritual-corazon)").forEach((el) => {
      if (el.hidden) return;
      el.style.animationDelay = d + "s"; d += el.id === "ritual-frase" ? 0.7 : 0.45;
    });
    r.className = "ritual " + momento;
    r.hidden = false; document.body.classList.add("sin-scroll");
    setTimeout(() => { if (!r.hidden) $("ritual-entrar").focus({ preventScroll: true }); }, d * 1000);
  }
  function cerrarRitual() {
    const r = $("ritual"); if (r.hidden || r.classList.contains("fuera")) return;
    r.classList.add("fuera"); document.body.classList.remove("sin-scroll");
    setTimeout(() => { r.hidden = true; r.classList.remove("fuera"); }, 600);
    lluvia("💗", 20);
  }
  $("ritual-entrar").addEventListener("click", cerrarRitual);
  $("ritual").addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarRitual(); });
  // si la app quedó abierta desde ayer, al volver a ella también saluda
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !S.home.hidden) ritualDelDia(); });
  // Celebrar algo una sola vez en este teléfono (lluvia de emojis)
  function celebrarUnaVez(clave, emoji) {
    let ya = false; try { ya = localStorage.getItem(clave) === "1"; localStorage.setItem(clave, "1"); } catch (e) {}
    if (!ya) setTimeout(() => lluvia(emoji, 22), 700);
    return !ya;
  }
  // El gran día: cuando por fin se ven, una celebración a pantalla completa (una vez)
  function granDia() {
    if (!celebrarUnaVez("gran-dia-" + proximo.inicio.slice(0, 10), "💞")) return;
    granDiaHoy = true;
    $("gran-texto").textContent = /primera vez/i.test(proximo.titulo)
      ? "Hoy se ven por primera vez. Abrácense muy fuerte 🤗" : proximo.titulo;
    setTimeout(() => $("dlg-gran-dia").showModal(), 900);
  }
  $("gran-cerrar").addEventListener("click", () => { $("dlg-gran-dia").close(); lluvia("💗", 20); });

  // Años, meses y días entre dos claves "YYYY-MM-DD"
  function duracion(desde, hasta) {
    const [y1, m1, d1] = desde.split("-").map(Number), [y2, m2] = hasta.split("-").map(Number);
    // "desde" + n meses; si ese día no existe en el mes (31 de febrero), el último del mes
    const sumar = (n) => {
      const y = y1 + Math.floor((m1 - 1 + n) / 12), m = ((m1 - 1 + n) % 12) + 1;
      return `${y}-${pad(m)}-${pad(Math.min(d1, new Date(Date.UTC(y, m, 0)).getUTCDate()))}`;
    };
    let meses = (y2 - y1) * 12 + (m2 - m1);
    if (sumar(meses) > hasta) meses--;
    return { a: Math.floor(meses / 12), m: meses % 12, d: diasEntre(sumar(meses), hasta) };
  }
  // "1 año, 3 meses y 4 días"
  const unir = (p) => (p.length > 1 ? p.slice(0, -1).join(", ") + " y " + p[p.length - 1] : p[0]);
  const tiempo = (a, m, d) => unir([a && plural(a, "año", "años"), m && plural(m, "mes", "meses"), d && plural(d, "día", "días")].filter(Boolean));

  // Días especiales de cada mes: el día en que se hicieron novios (`desde`) y en que se conocieron
  const ESPECIALES = [
    { clave: "novios", campo: "desde", emoji: "💗" },
    { clave: "conocidos", campo: "conocidos", emoji: "💫" },
  ];
  // El mismo día del mes que `fecha`; si el mes es más corto, el último día
  const diaDelMes = (fecha, y, m) => Math.min(+fecha.slice(8, 10), new Date(Date.UTC(y, m, 0)).getUTCDate());
  const esEspecial = (fecha, k) => { const [y, m, d] = k.split("-").map(Number); return k > fecha && d === diaDelMes(fecha, y, m); };
  // Los especiales que caen en el día k: [{ e, f }]
  const especialesDe = (k) => ESPECIALES.map((e) => ({ e, f: pareja[e.campo] })).filter((x) => x.f && esEspecial(x.f, k));
  // Texto de un día especial (hoy o en el calendario)
  function textoEspecial(e, fecha, k, hoy) {
    const { a, m } = duracion(fecha, k), t = tiempo(a, m, 0), redondo = m === 0;
    const uno = (a === 1 && m === 0) || (a === 0 && m === 1);
    if (e.clave === "novios") {
      if (!hoy) return `${e.emoji} ${t} de novios`;
      return redondo ? `🎉 ¡Hoy cumplen ${t} de novios!` : `${e.emoji} ¡Feliz mesiversario! Hoy cumplen ${t} de novios`;
    }
    if (!hoy) return `${e.emoji} ${t} desde que se conocieron`;
    return `${redondo ? "🎉" : e.emoji} Hoy ${uno ? "se cumple" : "se cumplen"} ${t} desde que se conocieron`;
  }
  // Línea normal: "Novios hace 2 meses y 15 días · 76 días"
  function textoDesde(e, fecha) {
    const hoy = diaHoy();
    if (!fecha || fecha > hoy) return null;
    if (esEspecial(fecha, hoy)) return { hoy: true, texto: textoEspecial(e, fecha, hoy, true) };
    const total = diasEntre(fecha, hoy);
    if (total === 0) return { hoy: true, texto: e.clave === "novios" ? "💞 Hoy empieza lo nuestro" : "💫 Hoy se conocieron" };
    const { a, m, d } = duracion(fecha, hoy), t = tiempo(a, m, d);
    const extra = a || m ? ` · ${total.toLocaleString("es")} días` : "";
    return { hoy: false, texto: e.clave === "novios" ? `💞 Novios hace ${t}${extra}` : `💫 Se conocieron hace ${t}` };
  }
  // El próximo día especial (sin contar hoy)
  function proximoEspecial() {
    const hoy = diaHoy(); let mejor = null;
    ESPECIALES.forEach((e) => {
      const f = pareja[e.campo]; if (!f) return;
      let [y, m] = hoy.split("-").map(Number);
      for (let i = 0; i < 3; i++) {
        const k = `${y}-${pad(m)}-${pad(diaDelMes(f, y, m))}`;
        if (k > hoy && k > f) { if (!mejor || k < mejor.k) mejor = { k, e, f }; break; }
        if (++m > 12) { m = 1; y++; }
      }
    });
    return mejor;
  }

  // El próximo viaje o cita del calendario es el encuentro que contamos
  async function cargarJuntos() {
    // el que está pasando ahora (no terminó) o, si no hay, el siguiente: los ya pasados no cuentan
    const ahora = new Date().toISOString();
    const { data, error } = await sb.from("eventos_cal").select("titulo, tipo, inicio, fin, creado_en")
      .eq("pareja_id", pareja.id).in("tipo", ["viaje", "cita"])
      .or(`fin.gte."${ahora}",inicio.gte."${ahora}"`).order("inicio").limit(1);
    if (error) return; // sin red se queda la cuenta que ya se veía
    proximo = (data && data[0]) || null;
    renderJuntos();
  }
  function renderJuntos() {
    const lineas = [["juntos", ESPECIALES[0], pareja.desde], ["conocidos-txt", ESPECIALES[1], pareja.conocidos]];
    let hoyEspecial = null;
    lineas.forEach(([id, e, fecha]) => {
      const l = textoDesde(e, fecha), p = $(id);
      p.hidden = !l; if (!l) return;
      p.textContent = l.texto; p.classList.toggle("hoy", l.hoy);
      if (l.hoy) hoyEspecial = hoyEspecial || e.clave;
    });
    const prox = proximoEspecial(), np = $("especial-prox");
    np.hidden = !prox;
    if (prox) {
      const dias = diasEntre(diaHoy(), prox.k);
      np.textContent = `Próximo día especial: ${textoEspecial(prox.e, prox.f, prox.k, false)} · ${fechaCorta(prox.k + "T12:00:00Z", "UTC")} · ${dias === 1 ? "mañana" : "en " + plural(dias, "día", "días")}`;
    }
    $("juntos-poner").hidden = !!(pareja.desde || pareja.conocidos);
    // Un día especial se celebra con una lluvia de corazones, una vez por día
    if (hoyEspecial) {
      const clave = "celebrado-" + diaHoy();
      let ya = false; try { ya = localStorage.getItem(clave) === "1"; localStorage.setItem(clave, "1"); } catch (e) {}
      if (!ya) setTimeout(() => lluvia(hoyEspecial === "novios" ? "💗" : "💫", 18), 600);
    }

    const num = $("heart-num");
    num.hidden = $("cuenta").hidden = !proximo;
    if (!proximo) return;
    const ahora = Date.now(), ini = new Date(proximo.inicio).getTime();
    const dias = diasEntre(diaHoy(), claveDia(proximo.inicio, miTz()));
    let n, txt;
    // Hitos de la espera: mensaje especial y lluvia de corazones (una vez por hito)
    const HITOS = {
      100: "¡Faltan solo 100 días! 💯", 50: "¡Faltan 50 días! Ya falta menos 💪", 30: "¡Un mes y se ven! 🗓️",
      14: "¡Dos semanas! 💓", 7: "¡Una semana! Prepara el abrazo 🤗", 3: "¡Solo 3 días! 😍", 2: "¡Pasado mañana! 😍",
    };
    if (ini <= ahora) { n = "💞"; txt = "¡Por fin juntos!"; granDia(); }
    else if (dias <= 0) { n = "¡Hoy!"; txt = "hoy se ven, por fin"; granDia(); }
    else if (dias === 1) { n = "1"; txt = "día para vernos · ¡es mañana! 😭💞"; celebrarUnaVez("hito-1-" + proximo.inicio, "💞"); }
    else { n = String(dias); txt = HITOS[dias] || "días para vernos"; if (HITOS[dias]) celebrarUnaVez(`hito-${dias}-${proximo.inicio}`, "💞"); }
    // el número cuenta hasta su valor la primera vez y da un saltito cuando cambia
    if (n !== ultimoNum) {
      const antes = Number(ultimoNum), ahoraN = Number(n);
      if (/^\d+$/.test(n)) contar(num, ahoraN, Number.isFinite(antes) && ultimoNum !== null ? antes : 0); else num.textContent = n;
      if (ultimoNum !== null) animar(num, "salta");
      ultimoNum = n;
    }
    num.classList.toggle("chico", n.length > 3);
    $("cuenta-txt").textContent = txt;
    $("cuenta-ev").textContent = `${EMOJI[proximo.tipo] || EMOJI.otro} ${proximo.titulo} · ${fechaCorta(proximo.inicio, miTz())}`;
    // cuánto de la espera ya pasó: desde que se agendó hasta que empieza
    const desdeMs = new Date(proximo.creado_en).getTime();
    const pct = ini > desdeMs ? Math.min(100, Math.max(0, Math.round(((ahora - desdeMs) / (ini - desdeMs)) * 100))) : 100;
    $("espera").hidden = ini <= ahora;
    $("espera").setAttribute("aria-valuenow", pct);
    $("espera-bar").style.width = pct + "%";
    $("espera-txt").textContent = ini > ahora ? `Ya pasó el ${pct}% de la espera ♥` : "";
  }
  $("juntos-poner").addEventListener("click", () => { irA("ajustes"); $("aj-conocidos").focus(); });

  // ---------- pregunta del día ----------
  const PREGUNTAS = window.NOSOTROS_PREGUNTAS || ["¿Qué es lo que más te gusta de nosotros?"];
  const respHoy = { mia: null, suya: null, suyaRespondio: false };
  let editandoResp = false;
  // La pregunta cambia a medianoche de quien vive más al oeste: así a nadie le cambia antes de dormir
  const tzPareja = () => { const a = new Date(); return offsetMin(miTz(), a) <= offsetMin(suTz(), a) ? miTz() : suTz(); };
  const diaPregunta = () => claveDia(new Date().toISOString(), tzPareja());
  const preguntaDe = (dia) => {
    const n = PREGUNTAS.length;
    return PREGUNTAS[((diasEntre("2026-01-01", dia) % n) + n) % n];
  };

  async function cargarPregunta() {
    const dia = diaPregunta();
    // pasó la medianoche mientras escribes tu respuesta: se queda la pregunta que estás respondiendo
    // (se guarda en su día y después aparece la nueva)
    const escribiendo = document.activeElement === $("resp-texto") && $("resp-texto").value.trim();
    if (respHoy.dia && dia !== respHoy.dia && escribiendo) return;
    // la primera vez se muestra al tiro; después, solo cuando llega la respuesta (si falla, pregunta y respuesta siguen juntas)
    if (!respHoy.dia) $("preg-texto").textContent = preguntaDe(dia);
    $("resp-su-nombre").textContent = otro.nombre;
    const [{ data: filas, error }, { data: suya }, { data: racha }] = await Promise.all([
      sb.from("respuestas").select("*").eq("pareja_id", pareja.id).eq("dia", dia),
      sb.rpc("respondio_pareja", { p_dia: dia }),
      sb.rpc("racha_preguntas", { p_hoy: dia }),
    ]);
    if (error) return; // sin red se queda lo que ya se veía
    respHoy.dia = dia;
    respHoy.mia = (filas || []).find((r) => r.usuario_id === user.id) || null;
    respHoy.suya = (filas || []).find((r) => r.usuario_id === otro.id) || null;
    respHoy.suyaRespondio = !!suya;
    // la pregunta que quedó guardada con la respuesta manda (si se agregan preguntas, el cálculo del día cambia)
    respHoy.pregunta = (respHoy.mia && respHoy.mia.pregunta) || (respHoy.suya && respHoy.suya.pregunta) || preguntaDe(dia);
    $("preg-texto").textContent = respHoy.pregunta;
    $("preg-racha").textContent = racha > 1 ? `🔥 ${racha} días seguidos` : "";
    renderPregunta();
  }
  function renderPregunta() {
    const { mia, suya, suyaRespondio } = respHoy;
    const responder = !mia || editandoResp;
    $("f-respuesta").hidden = !responder;
    $("respuestas").hidden = responder;
    if (responder) {
      $("resp-enviar").textContent = mia ? "Guardar cambio" : "Responder";
      $("resp-nota").textContent = mia ? ""
        : suyaRespondio ? `${otro.nombre} ya respondió 👀 Responde para ver lo que dijo.`
        : "Cuando respondan los dos, cada uno verá la respuesta del otro.";
    } else {
      $("resp-mia").textContent = mia.texto;
      $("resp-suya").textContent = suya ? suya.texto : "Todavía no responde. Te avisamos cuando lo haga 💌";
      $("resp-suya").classList.toggle("espera-resp", !suya);
    }
    respHoy.cargada = true;
    actualizarPuntos();
  }
  $("f-respuesta").addEventListener("submit", async (e) => {
    e.preventDefault();
    const texto = $("resp-texto").value.trim(); if (!texto) return;
    // se guarda en el día de la pregunta que está en pantalla, aunque justo haya pasado la medianoche
    const dia = respHoy.dia || diaPregunta(), primera = !respHoy.mia;
    const { data: filas, error } = primera
      ? await sb.from("respuestas").insert({ pareja_id: pareja.id, usuario_id: user.id, dia, pregunta: respHoy.pregunta || preguntaDe(dia), texto }).select("dia")
      : await sb.from("respuestas").update({ texto }).eq("usuario_id", user.id).eq("dia", dia).select("dia");
    if (error || !filas || !filas.length) { toast("No se pudo guardar"); return; }
    $("resp-texto").value = "";
    editandoResp = false;
    if (primera) lluvia("💗", 10);
    await cargarPregunta(); cargarHistorial();
  });
  $("resp-editar").addEventListener("click", () => {
    editandoResp = true; renderPregunta();
    // se rellena una sola vez al empezar a editar: una recarga por tiempo real no pisa lo que estás escribiendo
    if (respHoy.mia) $("resp-texto").value = respHoy.mia.texto;
    $("resp-texto").focus();
  });

  // Días anteriores (último mes). La respuesta de tu pareja aparece solo en los días que respondiste.
  async function cargarHistorial() {
    const dia = diaPregunta();
    const desde = new Date(utcDe(dia) - 30 * 86400000).toISOString().slice(0, 10);
    const { data, error } = await sb.from("respuestas").select("*").eq("pareja_id", pareja.id)
      .lt("dia", dia).gte("dia", desde).order("dia", { ascending: false });
    if (error) return;
    const porDia = {};
    (data || []).forEach((r) => {
      const d = (porDia[r.dia] = porDia[r.dia] || { pregunta: r.pregunta });
      d[r.usuario_id === user.id ? "mia" : "suya"] = r.texto;
    });
    const list = $("hist-list"); list.innerHTML = "";
    const dias = Object.keys(porDia).sort().reverse();
    if (!dias.length) {
      const li = document.createElement("li"); li.className = "muted";
      li.textContent = "Aquí se irán guardando sus respuestas 💗"; list.append(li); return;
    }
    dias.forEach((d) => {
      const r = porDia[d], li = document.createElement("li");
      const f = document.createElement("span"); f.className = "hist-dia"; f.textContent = fechaLarga(d);
      const q = document.createElement("strong"); q.textContent = r.pregunta;
      li.append(f, q);
      [["Tú", r.mia], [otro.nombre, r.suya]].forEach(([quien, texto]) => {
        if (!texto) return;
        const p = document.createElement("p"), b = document.createElement("b");
        b.textContent = quien + ": "; p.append(b, texto); li.append(p);
      });
      list.append(li);
    });
  }
  AL_ABRIR.juntos = () => {
    cargarPregunta(); cargarHistorial(); cargarCartas(); cargarDeseos();
    cargarGirasol(); cargarFrasco(); cargarVales(); cargarMomentos(); cargarCanciones(); cargarNumeros();
  };

  // ---------- lista "Cuando nos veamos" ----------
  let deseos = [];
  async function cargarDeseos() {
    const { data, error } = await sb.from("deseos").select("*").eq("pareja_id", pareja.id).order("creado_en"); if (error) return; // sin red se queda lo que ya se veía
    deseos = data || []; renderDeseos();
  }
  function renderDeseos() {
    const list = $("deseos-list"); list.innerHTML = "";
    const pendientesD = deseos.filter((d) => !d.hecho_en);
    const hechos = deseos.filter((d) => d.hecho_en).sort((a, b) => b.hecho_en.localeCompare(a.hecho_en));
    [...pendientesD, ...hechos].forEach((d) => {
      const li = document.createElement("li"); li.classList.toggle("hecho", !!d.hecho_en);
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.id = "deseo-" + d.id; cb.checked = !!d.hecho_en;
      const lab = document.createElement("label"); lab.htmlFor = cb.id; lab.textContent = d.texto;
      if (d.hecho_en) { const s = document.createElement("small"); s.textContent = `✓ ${fechaCorta(d.hecho_en, miTz())}`; lab.append(s); }
      const x = document.createElement("button"); x.type = "button"; x.className = "quitar"; x.textContent = "×";
      x.setAttribute("aria-label", `Quitar de la lista: ${d.texto}`);
      cb.addEventListener("change", async () => {
        const hecho_en = cb.checked ? new Date().toISOString() : null;
        const { error } = await sb.from("deseos").update({ hecho_en }).eq("id", d.id);
        if (error) { toast("No se pudo guardar"); cb.checked = !cb.checked; return; }
        d.hecho_en = hecho_en;
        if (hecho_en) { lluvia("💞", 12); toast("¡Uno menos, juntos! 💞"); }
        renderDeseos();
      });
      x.addEventListener("click", async () => {
        if (!confirm(`¿Quitar “${d.texto}” de la lista?`)) return;
        const { error } = await sb.from("deseos").delete().eq("id", d.id);
        if (error) { toast("No se pudo quitar"); return; }
        deseos = deseos.filter((y) => y.id !== d.id); renderDeseos();
      });
      li.append(cb, lab, x); list.append(li);
    });
    if (!deseos.length) {
      const li = document.createElement("li"); li.className = "muted vacia";
      li.textContent = "Empiecen la lista: ¿qué es lo primero que harán juntos?"; list.append(li);
    }
    $("deseos-hechos").textContent = hechos.length ? `Ya cumplieron ${plural(hechos.length, "deseo", "deseos")} juntos 💞` : "";
  }
  $("f-deseo").addEventListener("submit", async (e) => {
    e.preventDefault();
    const texto = $("deseo-texto").value.trim(); if (!texto) return;
    const { data, error } = await sb.from("deseos").insert({ pareja_id: pareja.id, creado_por: user.id, texto }).select().single();
    if (error) { toast("No se pudo agregar"); return; }
    $("deseo-texto").value = ""; deseos.push(data); renderDeseos();
  });

  // ---------- cartas ----------
  let cartas = [], selladas = [];
  async function cargarCartas() {
    const [{ data: cs, error }, { data: sl }, { data: sinLeer }] = await Promise.all([
      sb.from("cartas").select("*").eq("pareja_id", pareja.id).order("creado_en", { ascending: false }).limit(40),
      sb.rpc("cartas_selladas"),
      // las suyas sin leer aunque sean viejas: una carta sellada hace meses aparece recién al llegar su fecha
      sb.from("cartas").select("*").eq("pareja_id", pareja.id).neq("de_usuario", user.id).is("leida_en", null),
    ]);
    if (error) return; // sin red se queda la lista que ya se veía
    // lo más nuevo arriba; una carta sellada cuenta desde el momento en que se pudo abrir
    const desde = (c) => (c.abrir_en && new Date(c.abrir_en) <= new Date() ? c.abrir_en : c.creado_en);
    const vistas = new Set();
    cartas = [...(sinLeer || []), ...(cs || [])].filter((c) => !vistas.has(c.id) && vistas.add(c.id))
      .sort((a, b) => new Date(desde(b)) - new Date(desde(a)));
    selladas = sl || [];
    renderCartas();
  }
  function renderCartas() {
    const list = $("cartas-list"); list.innerHTML = "";
    const item = (icono, titulo, detalle, clase, alTocar) => {
      const li = document.createElement("li"); if (clase) li.className = clase;
      const i = document.createElement("span"); i.className = "c-icono"; i.innerHTML = iconoSvg(icono);
      const t = document.createElement("span"); t.className = "c-texto";
      const a = document.createElement("strong"), b = document.createElement("small");
      a.textContent = titulo; b.textContent = detalle; t.append(a, b); li.append(i, t);
      if (alTocar) {
        li.tabIndex = 0; li.setAttribute("role", "button");
        li.addEventListener("click", alTocar);
        li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alTocar(); } });
      }
      list.append(li);
    };
    selladas.forEach((s) => {
      const dias = diasEntre(diaHoy(), claveDia(s.abrir_en, miTz()));
      item("candado", `Carta sellada de ${otro.nombre}`,
        `Se abre el ${fechaCorta(s.abrir_en, miTz())} a las ${hora(s.abrir_en, miTz())}` + (dias > 0 ? ` · en ${plural(dias, "día", "días")}` : ""),
        "sellada");
    });
    cartas.forEach((c) => {
      if (c.de_usuario === user.id) {
        const estado = c.abrir_en && new Date(c.abrir_en) > new Date() ? `🔒 sellada hasta el ${fechaCorta(c.abrir_en, miTz())}`
          : c.leida_en ? `leída ✓ ${ago(c.leida_en)}` : "aún sin abrir";
        item("carta", `Para ${otro.nombre}`, `${fechaCorta(c.creado_en, miTz())} · ${estado}`, "", () => leerCarta(c));
      } else {
        item("carta-amor", `Carta de ${otro.nombre}`, c.leida_en ? `${fechaCorta(c.creado_en, miTz())}` : "nueva · tócala para abrirla",
          c.leida_en ? "" : "nueva", () => leerCarta(c));
      }
    });
    if (!selladas.length && !cartas.length) {
      const li = document.createElement("li"); li.className = "muted vacia";
      li.textContent = "Todavía no hay cartas. ¿Escribes la primera?"; list.append(li);
    }
    pendientes.cartas = cartas.some((c) => c.de_usuario !== user.id && !c.leida_en);
    actualizarPuntos();
  }

  // Leer: primero se abre el sobre, luego aparece la carta
  function leerCarta(c) {
    const mia = c.de_usuario === user.id, dlg = $("dlg-leer");
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    $("leer-meta").textContent = mia ? `Para ${otro.nombre} · ${fechaCorta(c.creado_en, miTz())}` : `De ${otro.nombre} · escrita el ${fechaCorta(c.creado_en, miTz())}`;
    $("leer-texto").textContent = c.texto;
    $("leer-firma").textContent = `con amor, ${mia ? perfil.nombre : otro.nombre}`;
    dlg.classList.remove("abierto");
    dlg.showModal();
    setTimeout(() => dlg.classList.add("abierto"), reducido ? 0 : 1250);
    if (!mia && !c.leida_en) {
      setTimeout(() => lluvia("💌", 12), reducido ? 0 : 1250);
      sb.rpc("marcar_leida", { p_id: c.id }).then(({ error }) => {
        if (!error) { c.leida_en = new Date().toISOString(); renderCartas(); }
      });
    }
  }
  $("leer-cerrar").addEventListener("click", () => $("dlg-leer").close());

  // Escribir: el borrador se guarda en este teléfono mientras escribes
  const borrador = {
    leer: () => { try { return localStorage.getItem("borrador-carta") || ""; } catch (e) { return ""; } },
    guardar: (t) => { try { localStorage.setItem("borrador-carta", t); } catch (e) {} },
    borrar: () => { try { localStorage.removeItem("borrador-carta"); } catch (e) {} },
  };
  $("btn-carta").addEventListener("click", () => {
    $("carta-para").textContent = `Una carta para ${otro.nombre}`;
    $("carta-texto").value = borrador.leer();
    $("carta-sellar").checked = false; $("carta-abrir").hidden = true; $("carta-abrir").value = "";
    notaCarta(); $("dlg-carta").showModal();
  });
  $("carta-texto").addEventListener("input", () => borrador.guardar($("carta-texto").value));
  $("carta-sellar").addEventListener("change", () => {
    const sellar = $("carta-sellar").checked;
    $("carta-abrir").hidden = !sellar;
    $("carta-abrir").min = aWall(new Date().toISOString(), miTz());
    // por defecto, dentro de una semana a las 9 de la mañana
    if (sellar && !$("carta-abrir").value) $("carta-abrir").value = aWall(new Date(Date.now() + 7 * 86400000).toISOString(), miTz()).slice(0, 11) + "09:00";
    notaCarta();
  });
  $("carta-abrir").addEventListener("input", notaCarta);
  function notaCarta() {
    const w = $("carta-abrir").value;
    if (!$("carta-sellar").checked || !w) { $("carta-nota").textContent = `${otro.nombre} la recibirá ahora mismo.`; return; }
    const iso = aIso(w, miTz());
    $("carta-nota").textContent = `Quedará sellada hasta el ${fechaCorta(iso, suTz())} a las ${hora(iso, suTz())}, hora de ${otro.nombre}. Le avisaremos cuando pueda abrirla.`;
  }
  $("carta-cancelar").addEventListener("click", () => $("dlg-carta").close());
  $("f-carta").addEventListener("submit", async (e) => {
    e.preventDefault();
    const texto = $("carta-texto").value.trim(); if (!texto) return;
    let abrir_en = null;
    if ($("carta-sellar").checked) {
      // marcada para sellar pero sin fecha: no se manda abierta por error
      if (!$("carta-abrir").value) { toast("Elige cuándo se podrá abrir"); return; }
      abrir_en = aIso($("carta-abrir").value, miTz());
      if (new Date(abrir_en) <= new Date()) { toast("Elige una fecha futura para sellarla"); return; }
    }
    const { error } = await sb.from("cartas").insert({ pareja_id: pareja.id, de_usuario: user.id, texto, abrir_en });
    if (error) { toast("No se pudo enviar"); return; }
    borrador.borrar();
    $("dlg-carta").close(); lluvia("💌", 12);
    toast(abrir_en ? "Carta sellada y enviada 🔒💌" : `Carta enviada a ${otro.nombre} 💌`);
    cargarCartas();
  });

  // Puntito en la pestaña Juntos cuando algo te espera ahí
  const pendientes = { pregunta: false, cartas: false, girasol: false, frasco: false };
  function actualizarPuntos() {
    pendientes.pregunta = respHoy.suyaRespondio && !respHoy.mia;
    const hay = Object.values(pendientes).some(Boolean);
    const b = document.querySelector('#tabs button[data-tab="juntos"]');
    b.classList.toggle("punto", hay);
    b.setAttribute("aria-label", hay ? "Juntos: hay algo nuevo para ti" : "Juntos");
    renderHoyToca();
  }

  // Tarjeta "Hoy te toca" en el Inicio: lo pendiente, y un toque lleva directo a cada cosa
  function irAJuntos(id, enfocar) {
    irA("juntos");
    setTimeout(() => {
      const el = $(id); if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      animar(el, "pop");
      if (enfocar) $(enfocar).focus({ preventScroll: true });
    }, 120);
  }
  function renderHoyToca() {
    const items = [];
    const nueva = cartas.find((c) => c.de_usuario !== user.id && !c.leida_en);
    if (nueva) items.push(["carta", `Leer la carta de ${otro.nombre}`, () => leerCarta(nueva)]);
    if (respHoy.cargada && !respHoy.mia) items.push(["pregunta",
      respHoy.suyaRespondio ? `Responder la pregunta: ${otro.nombre} ya respondió` : "Responder la pregunta del día",
      () => irAJuntos("f-respuesta", "resp-texto")]);
    if (pendientes.girasol) items.push(["girasol", `Regar el girasol: ${otro.nombre} ya lo regó`, () => irAJuntos("btn-regar")]);
    if (pendientes.frasco) items.push(["frasco", "Sacar una razón del frasco", () => irAJuntos("btn-sacar")]);
    const ul = $("hoy-toca-list"); ul.innerHTML = "";
    items.forEach(([ico, texto, alTocar]) => {
      const li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.innerHTML = `<b>${iconoSvg(ico)}</b><span></span><i aria-hidden="true">›</i>`;
      b.querySelector("span").textContent = texto;
      b.addEventListener("click", alTocar);
      li.append(b); ul.append(li);
    });
    $("hoy-toca").hidden = !items.length;
  }

  // ---------- fotos (bucket privado de Storage) ----------
  // Rutas: <pareja_id>/<usuario_id>/<archivo>. Se muestran con URLs firmadas que duran una semana y quedan
  // guardadas en el teléfono: así cada foto conserva su dirección y el navegador no la vuelve a bajar cada vez
  // que se abre la app. Las del álbum se firman todas juntas, en un solo pedido.
  const VIDA_URL = 7 * 86400; // segundos que dura una URL firmada
  const urlsFotos = (() => { try { return JSON.parse(localStorage.getItem("urls-fotos") || "{}") || {}; } catch (e) { return {}; } })();
  const firmando = {}; // ruta → pedido en curso, para no firmar dos veces la misma foto
  const vigente = (ruta) => { const c = urlsFotos[ruta]; return c && c.vence > Date.now() ? c.url : null; };
  const anotarUrl = (ruta, url) => (urlsFotos[ruta] = { url, vence: Date.now() + (VIDA_URL - 3600) * 1000 }); // una hora de margen
  function guardarUrls() { // solo las vigentes, y no más de 300
    const vivas = Object.entries(urlsFotos).filter(([, c]) => c.vence > Date.now()).sort((a, b) => b[1].vence - a[1].vence).slice(0, 300);
    try { localStorage.setItem("urls-fotos", JSON.stringify(Object.fromEntries(vivas))); } catch (e) {}
  }
  function urlDeFoto(ruta) {
    if (!ruta) return Promise.resolve(null);
    const ya = vigente(ruta);
    if (ya) return Promise.resolve(ya);
    return (firmando[ruta] = firmando[ruta] || sb.storage.from("fotos").createSignedUrl(ruta, VIDA_URL)
      .then(({ data }) => { if (!data) return null; anotarUrl(ruta, data.signedUrl); guardarUrls(); return data.signedUrl; }, () => null)
      .finally(() => delete firmando[ruta]));
  }
  async function firmarFotos(rutas) {
    const faltan = [...new Set(rutas.filter((r) => r && !vigente(r)))];
    if (faltan.length) {
      const { data } = await sb.storage.from("fotos").createSignedUrls(faltan, VIDA_URL).catch(() => ({ data: null }));
      (data || []).forEach((d) => { if (d.path && d.signedUrl) anotarUrl(d.path, d.signedUrl); });
      guardarUrls();
    }
    return rutas.map(vigente);
  }
  const cargarImagen = (file) => new Promise((ok, mal) => {
    const img = new Image(); img.onload = () => ok(img); img.onerror = mal; img.src = URL.createObjectURL(file);
  });
  // WebP pesa como un tercio menos que JPEG con la misma calidad; si el teléfono no sabe crearlo, va en JPEG
  const aImagen = (canvas, calidad) => new Promise((ok) => canvas.toBlob((b) => {
    if (b && b.type === "image/webp") ok(b); else canvas.toBlob(ok, "image/jpeg", calidad);
  }, "image/webp", calidad));
  // Achica la foto antes de subirla (así carga rápido y ocupa poco)
  async function reducir(file, max = 1280) {
    const img = await cargarImagen(file);
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return aImagen(c, 0.82);
  }
  // Una foto nunca cambia (cada una tiene su propio nombre): el teléfono puede guardarla por un año
  async function subirFoto(blob, nombre) {
    const webp = blob.type === "image/webp";
    const ruta = `${pareja.id}/${user.id}/${nombre}-${Date.now()}.${webp ? "webp" : "jpg"}`;
    const { error } = await sb.storage.from("fotos").upload(ruta, blob, { contentType: webp ? "image/webp" : "image/jpeg", cacheControl: "31536000" });
    return error ? null : ruta;
  }

  // ---------- fotos de perfil ----------
  async function pintarAvatar(el, persona) {
    const url = persona && persona.foto ? await urlDeFoto(persona.foto) : null;
    el.style.backgroundImage = url ? `url("${url}")` : "";
    el.textContent = url ? "" : ((persona && persona.nombre) || "?").charAt(0).toUpperCase();
  }
  function renderAvatares() {
    document.querySelectorAll('[data-av="mio"]').forEach((el) => pintarAvatar(el, perfil));
    document.querySelectorAll('[data-av="suyo"]').forEach((el) => pintarAvatar(el, otro));
    $("foto-quitar").hidden = !(perfil && perfil.foto);
  }
  // Recorte cuadrado: arrastrar para mover, deslizador para acercar
  const rec = { img: null, zoom: 1, x: 0, y: 0 }, lienzo = $("recorte-canvas"), ctxRec = lienzo.getContext("2d");
  function dibujarRecorte() {
    const { img, zoom } = rec; if (!img) return;
    const L = lienzo.width, s = Math.max(L / img.naturalWidth, L / img.naturalHeight) * zoom;
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    rec.x = Math.min((w - L) / 2, Math.max(-(w - L) / 2, rec.x)); // que la foto siempre cubra el cuadro
    rec.y = Math.min((h - L) / 2, Math.max(-(h - L) / 2, rec.y));
    ctxRec.fillStyle = "#fff"; ctxRec.fillRect(0, 0, L, L);
    ctxRec.drawImage(img, (L - w) / 2 + rec.x, (L - h) / 2 + rec.y, w, h);
  }
  $("foto-input").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try { rec.img = await cargarImagen(f); } catch (err) { toast("No se pudo abrir esa imagen"); return; }
    rec.zoom = 1; rec.x = 0; rec.y = 0;
    // en fotos verticales se empieza mirando la parte de arriba, donde suele estar la cara
    const L = lienzo.width, h = rec.img.naturalHeight * Math.max(L / rec.img.naturalWidth, L / rec.img.naturalHeight);
    if (h > L) rec.y = ((h - L) / 2) * 0.6;
    $("recorte-zoom").value = 1; dibujarRecorte(); $("dlg-recorte").showModal();
  });
  let arrastre = null;
  lienzo.addEventListener("pointerdown", (e) => { lienzo.setPointerCapture(e.pointerId); arrastre = { x: e.clientX, y: e.clientY }; });
  lienzo.addEventListener("pointermove", (e) => {
    if (!arrastre) return;
    const k = lienzo.width / lienzo.getBoundingClientRect().width;
    rec.x += (e.clientX - arrastre.x) * k; rec.y += (e.clientY - arrastre.y) * k;
    arrastre = { x: e.clientX, y: e.clientY }; dibujarRecorte();
  });
  ["pointerup", "pointercancel"].forEach((t) => lienzo.addEventListener(t, () => (arrastre = null)));
  $("recorte-zoom").addEventListener("input", (e) => { rec.zoom = +e.target.value; dibujarRecorte(); });
  $("recorte-cancelar").addEventListener("click", () => $("dlg-recorte").close());
  $("recorte-ok").addEventListener("click", async () => {
    const b = $("recorte-ok"); b.disabled = true;
    const out = document.createElement("canvas"); out.width = out.height = 400;
    out.getContext("2d").drawImage(lienzo, 0, 0, 400, 400);
    const ruta = await subirFoto(await aImagen(out, 0.88), "perfil");
    if (!ruta) { b.disabled = false; toast("No se pudo subir la foto"); return; }
    const vieja = perfil.foto;
    const { error } = await sb.from("perfiles").update({ foto: ruta }).eq("id", user.id);
    b.disabled = false;
    if (error) { toast("No se pudo guardar la foto"); return; }
    perfil.foto = ruta;
    if (vieja) sb.storage.from("fotos").remove([vieja]);
    $("dlg-recorte").close(); renderAvatares(); toast("¡Qué linda foto! 💗");
  });
  $("foto-quitar").addEventListener("click", async () => {
    if (!perfil.foto || !confirm("¿Quitar tu foto?")) return;
    const vieja = perfil.foto;
    const { error } = await sb.from("perfiles").update({ foto: null }).eq("id", user.id);
    if (error) { toast("No se pudo quitar"); return; }
    perfil.foto = null; sb.storage.from("fotos").remove([vieja]); renderAvatares();
  });

  // ---------- momentos: la foto del día ----------
  let momentos = [], momentoArchivo = null;
  async function cargarMomentos() {
    const { data, error } = await sb.from("momentos").select("*").eq("pareja_id", pareja.id).order("creado_en", { ascending: false }).limit(30); if (error) return; // sin red se queda lo que ya se veía
    momentos = data || []; renderMomentos();
  }
  async function renderMomentos() {
    // en Inicio, el último momento de tu pareja
    const suyo = momentos.find((m) => m.de_usuario === otro.id), box = $("momento-suyo");
    box.hidden = !suyo;
    if (suyo) {
      $("momento-quien").textContent = `Un momento de ${otro.nombre}`;
      $("momento-texto").textContent = suyo.texto || "";
      $("momento-cuando").textContent = ago(suyo.creado_en);
      $("momento-img").alt = suyo.texto ? `Foto de ${otro.nombre}: ${suyo.texto}` : `Foto de ${otro.nombre}`;
      box.onclick = () => verMomento(suyo);
      urlDeFoto(suyo.ruta).then((u) => { if (u) $("momento-img").src = u; });
    }
    // en Juntos, el álbum: se arma solo con esa pestaña abierta (al abrirla se vuelve a cargar), con todas las
    // fotos firmadas en un pedido y cada una bajando recién cuando aparece en pantalla
    const g = $("album");
    if ($("tab-juntos").hidden) return;
    if (!momentos.length) {
      const p = document.createElement("p"); p.className = "small-note"; p.style.gridColumn = "1 / -1";
      p.textContent = "Aquí se irán guardando sus momentos 📸 Compártelos desde Inicio.";
      g.replaceChildren(p); return;
    }
    const lista = momentos, urls = await firmarFotos(lista.map((m) => m.ruta));
    if (lista !== momentos) return; // mientras se firmaban llegó una lista más nueva
    g.replaceChildren(...lista.map((m, i) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "album-foto";
      b.setAttribute("aria-label", `${m.de_usuario === user.id ? "Tu momento" : "Momento de " + otro.nombre}${m.texto ? ": " + m.texto : ""}, ${ago(m.creado_en)}`);
      b.addEventListener("click", () => verMomento(m));
      const img = document.createElement("img"); img.alt = ""; img.loading = "lazy"; img.decoding = "async";
      if (urls[i]) img.src = urls[i];
      b.append(img);
      return b;
    }));
  }
  $("momento-input").addEventListener("change", (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    momentoArchivo = f; $("momento-prev").src = URL.createObjectURL(f); $("momento-texto-in").value = "";
    $("dlg-momento").showModal();
  });
  $("momento-cancelar").addEventListener("click", () => $("dlg-momento").close());
  $("f-momento").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!momentoArchivo) return;
    const b = $("momento-enviar"); b.disabled = true; b.textContent = "Subiendo…";
    let ruta = null;
    try { ruta = await subirFoto(await reducir(momentoArchivo), "momento"); } catch (err) {}
    const texto = $("momento-texto-in").value.trim() || null;
    const { error } = ruta
      ? await sb.from("momentos").insert({ pareja_id: pareja.id, de_usuario: user.id, ruta, texto })
      : { error: true };
    b.disabled = false; b.textContent = "Compartir 📸";
    if (error) { toast("No se pudo compartir"); return; }
    $("dlg-momento").close(); lluvia("📸", 8); toast(`Compartido con ${otro.nombre} 📸`); cargarMomentos();
  });
  let momentoViendo = null;
  async function verMomento(m) {
    momentoViendo = m;
    $("ver-img").removeAttribute("src");
    $("ver-img").alt = m.texto || "Momento";
    $("ver-texto").textContent = m.texto || "";
    $("ver-meta").textContent = `${m.de_usuario === user.id ? "Tú" : otro.nombre} · ${fechaCorta(m.creado_en, miTz())}, ${hora(m.creado_en, miTz())}`;
    $("ver-borrar").hidden = m.de_usuario !== user.id;
    $("dlg-ver").showModal();
    const u = await urlDeFoto(m.ruta); if (u) $("ver-img").src = u;
  }
  $("ver-cerrar").addEventListener("click", () => $("dlg-ver").close());
  $("ver-borrar").addEventListener("click", async () => {
    const m = momentoViendo; if (!m || !confirm("¿Borrar este momento?")) return;
    const { error } = await sb.from("momentos").delete().eq("id", m.id);
    if (error) { toast("No se pudo borrar"); return; }
    sb.storage.from("fotos").remove([m.ruta]);
    $("dlg-ver").close(); cargarMomentos();
  });

  // ---------- nuestro girasol ----------
  // Cada uno lo riega una vez por día. Un día con los dos riegos suma 1 punto; con uno solo, medio.
  const ETAPAS = [[0, "Semillita"], [1, "Brotecito"], [3, "Tallito"], [6, "Con hojitas"], [10, "Creciendo fuerte"], [16, "Con botón"], [23, "¡Abriéndose!"], [30, "En flor 🌻"]];
  let riegos = [];
  async function cargarGirasol() {
    // los más recientes primero: Supabase entrega como mucho 1000 filas y los de hoy no pueden quedar afuera
    // (1000 riegos son más de 400 puntos; el girasol con su ramo completo llega a 90)
    const { data, error } = await sb.from("riegos").select("usuario_id, dia").eq("pareja_id", pareja.id)
      .order("dia", { ascending: false }).limit(1000);
    // sin red se quedan los riegos que había, pero se repinta: si cambió el día, el botón vuelve a "Regar"
    if (!error) riegos = data || [];
    renderGirasol();
  }
  function puntosGirasol() {
    const porDia = {};
    riegos.forEach((r) => (porDia[r.dia] = (porDia[r.dia] || 0) + 1));
    return Object.values(porDia).reduce((s, n) => s + (n >= 2 ? 1 : 0.5), 0);
  }
  // Dibujo del girasol según la etapa (y más girasoles alrededor si siguen regando después de florecer)
  function svgGirasol(etapa, pts, sed) {
    const verde = sed ? "#8aa36b" : "#3f9b4a", verdeOsc = sed ? "#6f8656" : "#2f7d3a";
    const alto = [0, 16, 42, 70, 100, 118, 128, 132][etapa], y0 = 176, tope = y0 - alto;
    const flor = (cx, cy, r, a = 1) => {
      let p = "";
      for (let i = 0; i < 16; i++) p += `<ellipse cx="${cx}" cy="${cy - r * 0.92 * a}" rx="${r * 0.27}" ry="${r * 0.6 * a}" fill="#f7b500" transform="rotate(${i * 22.5} ${cx} ${cy})"/>`;
      return p + `<circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="#6b3a1e"/><circle cx="${cx}" cy="${cy}" r="${r * 0.36}" fill="#8a4f27"/>`;
    };
    const hoja = (y, lado, t) => `<path d="M100 ${y} q ${20 * lado * t} ${-16 * t} ${38 * lado * t} ${-6 * t} q ${-16 * lado * t} ${14 * t} ${-38 * lado * t} ${6 * t}Z" fill="${verde}"/>`;
    let planta = "";
    if (etapa === 0) planta = `<ellipse cx="100" cy="${y0 - 3}" rx="7" ry="4.5" fill="#7a4a2a"/><path d="M100 ${y0 - 7} q 2 -6 6 -7" stroke="${verde}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
    else {
      planta = `<path d="M100 ${y0} C 98 ${y0 - alto * 0.5}, 102 ${y0 - alto * 0.7}, 100 ${tope}" stroke="${verdeOsc}" stroke-width="${2.5 + etapa * 0.7}" fill="none" stroke-linecap="round"/>`;
      const hojas = [0, 2, 2, 4, 4, 6, 6, 6][etapa];
      for (let i = 0; i < hojas; i++) planta += hoja(y0 - 12 - i * (alto / (hojas + 1)), i % 2 ? 1 : -1, Math.min(1, 0.55 + etapa * 0.08));
      if (etapa === 5) planta += `<circle cx="100" cy="${tope}" r="9" fill="${verde}"/><path d="M93 ${tope - 4} q 7 -9 14 0" fill="#f7b500" opacity=".8"/>`;
      if (etapa === 6) planta += flor(100, tope, 17, 0.6);
      if (etapa === 7) planta += flor(100, tope, 26);
    }
    // girasoles extra: uno nuevo cada 15 puntos después de florecer (hasta 4)
    const extra = pts >= 45 ? Math.min(4, Math.floor((pts - 30) / 15)) : 0;
    // salen de la misma maceta y se abren hacia los lados, como un ramo
    const otros = [[76, 92, -22], [124, 100, 22], [86, 64, -40], [114, 70, 40]].slice(0, extra).map(([x, h, dx]) =>
      `<path d="M${x} ${y0} q ${dx * 0.2} ${-h * 0.6} ${dx} ${-h}" stroke="${verdeOsc}" stroke-width="4" fill="none" stroke-linecap="round"/>${flor(x + dx, y0 - h, 15)}`).join("");
    return `<svg viewBox="0 0 200 218" role="img"><g class="planta${sed ? " sed" : ""}">${otros}${planta}</g>
      <path d="M62 176 h76 l-9 38 h-58 z" fill="#c8694a"/><rect x="58" y="170" width="84" height="12" rx="4" fill="#d9805f"/>
      <ellipse cx="100" cy="176" rx="38" ry="4" fill="#6b3f2a"/></svg>`;
  }
  function renderGirasol() {
    const hoy = diaPregunta(), pts = puntosGirasol();
    const yo = riegos.some((r) => r.usuario_id === user.id && r.dia === hoy);
    const suyo = riegos.some((r) => r.usuario_id === otro.id && r.dia === hoy);
    let etapa = 0; ETAPAS.forEach(([min], i) => { if (pts >= min) etapa = i; });
    const ultimo = riegos.reduce((m, r) => (r.dia > m ? r.dia : m), "");
    const sed = !!ultimo && diasEntre(ultimo, hoy) >= 3;
    $("girasol").innerHTML = svgGirasol(etapa, pts, sed);
    const extra = pts >= 45 ? Math.min(4, Math.floor((pts - 30) / 15)) : 0;
    $("girasol-etapa").textContent = extra ? `¡Un jardín de ${extra + 1} girasoles!` : ETAPAS[etapa][1];
    const lugar = (C.FECHAS && C.FECHAS.lugar) ? `antes de ${C.FECHAS.lugar}` : "antes de verse";
    $("girasol-nota").textContent =
      yo && suyo ? "Los dos lo regaron hoy 💛 Mañana crecerá otro poquito."
      : yo ? `Ya lo regaste. Falta ${otro.nombre} 💧`
      : suyo ? `${otro.nombre} ya lo regó. ¡Te toca!`
      : sed ? "Tiene sed… ¿lo riegan hoy? 🥺"
      : `Riéguenlo los dos cada día para que florezca ${lugar}.`;
    $("btn-regar").disabled = yo;
    $("btn-regar").textContent = yo ? "Regado hoy ✓" : "Regar";
    pendientes.girasol = suyo && !yo; actualizarPuntos();
    // ¿Subió de etapa desde la última vez que lo viste en este teléfono? Entonces crece con rebote
    const nivel = etapa + extra;
    let antes = null; try { antes = localStorage.getItem("girasol-nivel"); localStorage.setItem("girasol-nivel", String(nivel)); } catch (e) {}
    if (antes !== null && nivel > Number(antes)) {
      animar($("girasol"), "crece"); setTimeout(() => estallido($("girasol"), "✨", 9), 200);
      toast(extra ? "¡Nació otro girasol en el ramo! 🌻" : `¡El girasol creció! Ahora está: ${ETAPAS[etapa][1].toLowerCase()} 🌱`);
    }
  }
  // Gotas que caen sobre la planta al regar
  function gotas() {
    if (pocoMovimiento()) return;
    const card = document.querySelector(".girasol-card");
    for (let i = 0; i < 6; i++) {
      const g = document.createElement("span"); g.className = "gota"; g.textContent = "💧";
      g.style.left = `calc(50% + ${Math.round((i - 2.5) * 16)}px)`; g.style.top = "40px";
      g.style.animationDelay = i * 45 + "ms";
      card.append(g); setTimeout(() => g.remove(), 800);
    }
  }
  $("btn-regar").addEventListener("click", async () => {
    const dia = diaPregunta();
    $("btn-regar").disabled = true;
    const { error } = await sb.from("riegos").insert({ pareja_id: pareja.id, usuario_id: user.id, dia });
    if (error) { toast("No se pudo regar"); $("btn-regar").disabled = false; return; }
    riegos.push({ usuario_id: user.id, dia }); gotas();
    setTimeout(() => { renderGirasol(); animar($("girasol"), "regado"); }, 420);
  });

  // ---------- frasco de razones ----------
  let enFrasco = 0;
  async function cargarFrasco() {
    const [{ data: n, error: e1 }, { data: rs, error: e2 }] = await Promise.all([
      sb.rpc("razones_en_frasco"),
      sb.from("razones").select("*").eq("pareja_id", pareja.id).order("creado_en", { ascending: false }).limit(200),
    ]);
    if (e1 || e2) return; // sin red se queda lo que ya se veía
    enFrasco = n || 0;
    const leidas = (rs || []).filter((r) => r.de_usuario !== user.id); // las de tu pareja que ya sacaste (RLS esconde el resto)
    const mias = (rs || []).filter((r) => r.de_usuario === user.id);
    // el frasco con un papelito por razón esperándote (hasta 12)
    let papeles = "";
    for (let i = 0; i < Math.min(12, enFrasco); i++) {
      const x = 30 + ((i * 37) % 44), y = 112 - Math.floor(i / 3) * 15 - (i % 2) * 4;
      papeles += `<path d="M${x} ${y} c -6 -7 -14 0 -7 7 l 7 7 l 7 -7 c 7 -7 -1 -14 -7 -7z" fill="${["#ff8fb1", "#f7b500", "#ffb3c7", "#e86a92"][i % 4]}" transform="rotate(${(i * 23) % 40 - 20} ${x} ${y})"/>`;
    }
    $("frasco").innerHTML = `<svg viewBox="0 0 104 132"><rect x="30" y="6" width="44" height="14" rx="4" fill="#c99a6b"/>
      <path d="M26 22 h52 q 10 6 10 22 v62 q 0 20 -20 20 h-32 q -20 0 -20 -20 v-62 q 0 -16 10 -22z" fill="rgba(255,255,255,.55)" stroke="#e7c7d3" stroke-width="2.5"/>
      ${papeles}<path d="M30 36 q -6 10 -6 26" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/></svg>`;
    $("frasco-estado").textContent = enFrasco
      ? `${otro.nombre} te dejó ${plural(enFrasco, "razón", "razones")} en el frasco 💌`
      : `El frasco está vacío por ahora. Cuando ${otro.nombre} eche una razón, aparecerá aquí.`;
    $("btn-sacar").disabled = !enFrasco;
    const sinSacar = mias.filter((r) => !r.sacada_en).length;
    $("razones-mias").textContent = mias.length
      ? `Echaste ${plural(mias.length, "razón", "razones")}${sinSacar ? ` · ${sinSacar} esperando que ${otro.nombre} las saque` : ""}.`
      : `Escribe por qué quieres a ${otro.nombre}: no la podrá leer hasta sacarla del frasco.`;
    $("razones-det").hidden = !leidas.length;
    const ul = $("razones-list"); ul.innerHTML = "";
    leidas.forEach((r) => { const li = document.createElement("li"); li.textContent = r.texto; ul.append(li); });
    pendientes.frasco = enFrasco > 0; actualizarPuntos();
  }
  $("btn-sacar").addEventListener("click", async () => {
    animar($("frasco"), "sacude"); // el frasco se sacude mientras sale la razón
    const [{ data, error }] = await Promise.all([sb.rpc("sacar_razon"), new Promise((r) => setTimeout(r, pocoMovimiento() ? 0 : 420))]);
    if (error || !data || !data.texto) { toast("El frasco está vacío"); cargarFrasco(); return; }
    $("razon-de").textContent = `De ${otro.nombre}`;
    $("razon-leida").textContent = data.texto;
    $("dlg-razon").showModal(); setTimeout(() => lluvia("💗", 14), 150);
    cargarFrasco();
  });
  $("razon-cerrar").addEventListener("click", () => $("dlg-razon").close());
  $("f-razon").addEventListener("submit", async (e) => {
    e.preventDefault();
    let texto = $("razon-texto").value.trim(); if (!texto) return;
    const { error } = await sb.from("razones").insert({ pareja_id: pareja.id, de_usuario: user.id, texto });
    if (error) { toast("No se pudo echar al frasco"); return; }
    $("razon-texto").value = ""; toast(`Al frasco 🫙 ${otro.nombre} la leerá cuando la saque`); cargarFrasco();
  });

  // ---------- vales de amor ----------
  const IDEAS_VALES = [
    ["🤗", "Un abrazo de 10 minutos"], ["😘", "Besos ilimitados por un día"], ["🎬", "Tú eliges la película"],
    ["💆", "Un masaje"], ["🍳", "Un desayuno hecho por mí"], ["🌅", "Ver el atardecer juntos"],
    ["💃", "Bailar nuestra canción"], ["🍦", "Un helado a mi cuenta"], ["🌻", "Un ramo de girasoles"],
  ];
  const EMOJIS_VALES = ["🎟️", "🤗", "😘", "💆", "🍳", "🎬", "🌅", "💃", "🍦", "🌻", "🍷", "🎁"];
  let vales = [], valeEmoji = "🎟️", valeRecien = null;
  async function cargarVales() {
    const { data, error } = await sb.from("vales").select("*").eq("pareja_id", pareja.id).order("creado_en", { ascending: false }); if (error) return; // sin red se queda lo que ya se veía
    vales = data || []; renderVales();
  }
  function renderVales() {
    const ul = $("vales-list"); ul.innerHTML = "";
    const paraMi = vales.filter((v) => v.de_usuario !== user.id), mios = vales.filter((v) => v.de_usuario === user.id);
    const fila = (v, mio) => {
      const li = document.createElement("li"); li.classList.toggle("usado", !!v.canjeado_en);
      if (v.id === valeRecien) { li.classList.add("recien"); valeRecien = null; } // el sello CANJEADO cae con rebote
      const e = document.createElement("span"); e.className = "v-emoji"; e.textContent = v.emoji; e.setAttribute("aria-hidden", "true");
      const t = document.createElement("span"); t.className = "v-texto";
      const a = document.createElement("strong"), b = document.createElement("small");
      a.textContent = v.texto;
      b.textContent = mio
        ? `Para ${otro.nombre} · ${v.canjeado_en ? "canjeado el " + fechaCorta(v.canjeado_en, miTz()) + " 💗" : "sin canjear"}`
        : v.canjeado_en ? `Canjeado el ${fechaCorta(v.canjeado_en, miTz())} 💗` : `De ${otro.nombre} · vale para cuando quieras`;
      t.append(a, b); li.append(e, t);
      if (!mio && !v.canjeado_en) {
        const c = document.createElement("button"); c.type = "button"; c.textContent = "Canjear";
        c.addEventListener("click", async () => {
          if (!confirm(`¿Canjear “${v.texto}”? ${otro.nombre} recibirá un aviso.`)) return;
          const { data, error } = await sb.rpc("canjear_vale", { p_id: v.id });
          if (error || !filaValida(data)) { toast("No se pudo canjear"); return; }
          estallido(c, v.emoji, 8); valeRecien = v.id; toast("¡Canjeado! 💗"); cargarVales();
        });
        li.append(c);
      }
      if (mio && !v.canjeado_en) {
        const x = document.createElement("button"); x.type = "button"; x.className = "quitar"; x.textContent = "×";
        x.setAttribute("aria-label", `Quitar el vale: ${v.texto}`);
        x.addEventListener("click", async () => {
          if (!confirm("¿Quitar este vale?")) return;
          const { error } = await sb.from("vales").delete().eq("id", v.id);
          if (!error) cargarVales();
        });
        li.append(x);
      }
      ul.append(li);
    };
    paraMi.forEach((v) => fila(v, false));
    mios.forEach((v) => fila(v, true));
    if (!vales.length) {
      const li = document.createElement("li"); li.className = "muted vacia";
      li.textContent = `Toca una idea de arriba para regalarle el primero a ${otro.nombre}.`; ul.append(li);
    }
  }
  function abrirVale(emoji, texto) {
    valeEmoji = emoji || "🎟️";
    $("vale-para").textContent = `Un vale para ${otro.nombre}`;
    $("vale-texto").value = texto || "";
    const g = $("vale-emojis"); g.innerHTML = "";
    EMOJIS_VALES.forEach((em) => {
      const b = document.createElement("button"); b.type = "button"; b.textContent = em;
      b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(em === valeEmoji)); b.setAttribute("aria-label", em);
      b.addEventListener("click", () => { valeEmoji = em; g.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b))); });
      g.append(b);
    });
    $("dlg-vale").showModal();
  }
  (function pintarIdeas() {
    const g = $("vale-ideas");
    const nuevo = document.createElement("button"); nuevo.type = "button"; nuevo.textContent = "✍️ Escribir uno";
    nuevo.addEventListener("click", () => abrirVale("🎟️", "")); g.append(nuevo);
    IDEAS_VALES.forEach(([em, t]) => {
      const b = document.createElement("button"); b.type = "button"; b.textContent = `${em} ${t}`;
      b.addEventListener("click", () => abrirVale(em, t)); g.append(b);
    });
  })();
  $("vale-cancelar").addEventListener("click", () => $("dlg-vale").close());
  $("f-vale").addEventListener("submit", async (e) => {
    e.preventDefault();
    const texto = $("vale-texto").value.trim(); if (!texto) return;
    const { error } = await sb.from("vales").insert({ pareja_id: pareja.id, de_usuario: user.id, texto, emoji: valeEmoji });
    if (error) { toast("No se pudo regalar"); return; }
    $("dlg-vale").close(); lluvia(valeEmoji, 10); toast(`Vale regalado a ${otro.nombre} 🎟️`); cargarVales();
  });

  // ---------- distancia entre ustedes ----------
  function km(a, b) {
    const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(x));
  }
  function renderDistancia() {
    const p = $("distancia"), ok = perfil && otro && perfil.lat != null && otro.lat != null;
    p.hidden = !ok;
    if (ok) {
      const d = Math.round(km(perfil, otro));
      p.textContent = d < 20 ? "📍 ¡Están en la misma ciudad! 💞" : `📍 ${d.toLocaleString("es")} km nos separan`;
    }
    $("ubicacion-nota").textContent = perfil && perfil.lat != null
      ? (otro && otro.lat != null ? "Distancia activada para los dos ✓" : `Tu ubicación está guardada. Falta que ${otro ? otro.nombre : "tu pareja"} active la suya.`)
      : "Se guarda aproximada (unos 10 km), solo para calcular cuánto los separa.";
  }
  $("btn-ubicacion").addEventListener("click", () => {
    if (!navigator.geolocation) { toast("Este navegador no da la ubicación"); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      // redondeada a 1 decimal (~10 km): suficiente para la distancia, sin dar la dirección exacta
      const lat = Math.round(pos.coords.latitude * 10) / 10, lon = Math.round(pos.coords.longitude * 10) / 10;
      const { error } = await sb.from("perfiles").update({ lat, lon }).eq("id", user.id);
      if (error) { toast("No se pudo guardar"); return; }
      perfil = { ...perfil, lat, lon }; renderDistancia(); toast("Listo 📍");
    }, () => toast("Sin permiso para la ubicación"), { maximumAge: 3600000, timeout: 15000 });
  });

  // ---------- corazón vivo: besitos, latido y presencia ----------
  // Canal en tiempo real que no guarda nada: quién está en la app (presencia), los besitos al vuelo y el latido. Si
  // se cae, se vuelve a abrir solo y me anoto de nuevo (vivo-canal.js, que además cuida el límite de la presencia).
  // El latido va por mensajes y no por la presencia: Supabase deja cambiarla solo 5 veces cada 30 s, a la sexta cierra
  // el canal, y mantener el corazón un par de veces la gastaba. Mientras lo mantengo mando "latido" cada segundo; el
  // otro late mientras le sigan llegando y me contesta "siento": así sé que lo sintió y no hace falta el aviso.
  const PATRON_LATIDO = [90, 120, 90, 600];
  const vibrar = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };
  let canalVivo = null, otroAqui = false, otroTocando = false, yoTocando = false, vibraLatido = null;
  // el otro late por mensaje (suyoLate, mientras sigan llegando) o, si tiene la app vieja, por la presencia (suyoToca)
  let suyoLate = false, suyoToca = false, finSuyo = null, sientoEn = 0, meSienteEn = 0, latidoCada = null;
  function conectarVivo() {
    if (canalVivo) canalVivo.apagar();
    canalVivo = window.VivoCanal(sb, `vivo-${pareja.id}`, { config: { presence: { key: user.id }, broadcast: { self: false } } }, (c) => c
      .on("presence", { event: "sync" }, () => {
        const estado = c.presenceState()[otro.id] || [];
        otroAqui = estado.length > 0;
        suyoToca = estado.some((p) => p.tocando);
        renderVivo();
      })
      .on("broadcast", { event: "beso" }, ({ payload }) => {
        const n = (payload && payload.n) || 1;
        if (!$("tab-inicio").hidden) besosVoladores(n, false); else lluvia("💋", Math.min(10, 3 + n));
        toast(n > 1 ? `${otro.nombre} te mandó ${n} besitos 😘` : `${otro.nombre} te mandó un besito 😘`);
        vibrar([40, 40, 40]);
      })
      .on("broadcast", { event: "latido" }, ({ payload }) => {
        clearTimeout(finSuyo);
        suyoLate = !!(payload && payload.on);
        // si dejan de llegar (soltó y no llegó el aviso, o se cortó), deja de latir solo
        if (suyoLate) finSuyo = setTimeout(() => { suyoLate = false; renderVivo(); }, 2600);
        // le cuento que lo siento (con la app a la vista; como mucho una vez por segundo)
        if (suyoLate && !document.hidden && Date.now() - sientoEn > 900) { sientoEn = Date.now(); mandarVivo("siento"); }
        renderVivo();
      })
      .on("broadcast", { event: "siento" }, () => { meSienteEn = Date.now(); if (yoTocando) tipLatido(); }));
    canalVivo.abrir();
    marcarVivo();
  }
  // En la presencia figuro "en la app" solo con la app a la vista
  function marcarVivo() { if (canalVivo) canalVivo.presencia(document.hidden ? null : { aqui: true }); }
  function mandarVivo(evento, payload) {
    if (canalVivo && canalVivo.canal) canalVivo.canal.send({ type: "broadcast", event: evento, payload: payload || {} }).catch(() => {});
  }
  // Si la app pasa a segundo plano, deja de figurar como "en la app" (y si tenía el dedo en el corazón, lo suelta)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && toque) soltarCorazon(false);
    marcarVivo();
  });
  function renderVivo() {
    otroTocando = suyoLate || suyoToca;
    const aqui = otroAqui || otroTocando;
    $("presente").hidden = !aqui;
    $("presente").textContent = otroTocando ? `${otro.nombre} está tocando su corazón 💓` : `${otro.nombre} está en la app ahora`;
    document.querySelectorAll('[data-av="suyo"]').forEach((el) => el.classList.toggle("aqui", aqui));
    // cuando los dos están en la app, sus fotos se acercan un poquito
    document.querySelectorAll(".avatares").forEach((el) => el.classList.toggle("cerca", aqui));
    const h = $("heart");
    h.classList.toggle("suyo", otroTocando);
    h.classList.toggle("latiendo", otroTocando || yoTocando);
    const juntos = otroTocando && yoTocando;
    if (juntos && $("latido-juntos").hidden) { lluvia("💞", 18); vibrar([200, 100, 200, 100, 600]); }
    $("latido-juntos").hidden = !juntos;
    // mientras tu pareja toca su corazón, el tuyo late con el suyo
    if (otroTocando && !vibraLatido) {
      latir(); vibraLatido = setInterval(latir, 1200);
      if ($("tab-inicio").hidden) toast(`💓 ${otro.nombre} te está mandando su latido`);
    } else if (!otroTocando && vibraLatido) { clearInterval(vibraLatido); vibraLatido = null; }
  }
  // Un latido: vibra en Android. El iPhone no deja que las apps web vibren, así que ahí suena un «tum-tum» suavecito
  // (solo si el teléfono no está en silencio y si ya se tocó la app alguna vez: antes, el navegador no deja sonar).
  function latir() { if (navigator.vibrate) vibrar(PATRON_LATIDO); else sonarLatido(); }
  let audioLatido = null;
  function audioListo() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!audioLatido && AC) audioLatido = new AC();
      if (audioLatido && audioLatido.state !== "running") audioLatido.resume().catch(() => {});
    } catch (e) {}
    return audioLatido;
  }
  // (se prepara con el primer toque, que es cuando el navegador lo permite)
  if (!navigator.vibrate) document.addEventListener("pointerdown", audioListo, { passive: true });
  function sonarLatido() {
    const ac = audioListo();
    if (!ac || ac.state !== "running") return;
    [[0, 140, 0.5], [0.22, 120, 0.35]].forEach(([d, f, v]) => {
      const t = ac.currentTime + d, o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.14);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.2);
    });
  }
  function besosVoladores(n = 1, mio = false) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = $("heart").getBoundingClientRect(); if (!r.width) return;
    for (let i = 0; i < Math.min(n, 12); i++) {
      const s = document.createElement("span"); s.className = "beso-volador";
      s.textContent = mio ? "💗" : ["💋", "😘", "💗", "💕"][i % 4];
      s.style.left = r.left + r.width / 2 + "px"; s.style.top = r.top + r.height / 2 + "px";
      s.style.setProperty("--x", Math.round(Math.random() * 140 - 70) + "px");
      s.style.setProperty("--r", Math.round(Math.random() * 40 - 20) + "deg");
      s.style.animationDelay = i * 0.12 + "s";
      document.body.append(s); setTimeout(() => s.remove(), 2000 + i * 120);
    }
  }
  // Tocar el corazón = besito. Los toques seguidos se juntan en un solo envío.
  let besosPend = 0, besosTimer = null;
  function mandarBeso() {
    besosVoladores(1, true); vibrar(15); besosPend++;
    clearTimeout(besosTimer);
    besosTimer = setTimeout(async () => {
      const n = besosPend; besosPend = 0;
      if (otroAqui && canalVivo && canalVivo.canal) { canalVivo.canal.send({ type: "broadcast", event: "beso", payload: { n } }); return; }
      // si no está en la app, le llega un "te manda un beso" (como mucho uno cada 10 minutos)
      // (no está en la app y ya le llegó un aviso de beso hace poco: no se repite)
      if (pocoDesde("ultimo-beso", 10)) { toast(`Ya le avisamos de tus besitos hace poco 😘`); return; }
      const { error } = await sb.from("eventos").insert({ pareja_id: pareja.id, de_usuario: user.id, tipo: "beso" });
      // si no salió, la espera de 10 minutos no corre: el próximo besito lo vuelve a intentar
      if (error) { olvidarDesde("ultimo-beso"); toast("No se pudo mandar tu beso, intenta otra vez"); return; }
      toast(`${otro.nombre} no está en la app: le llegó tu beso como aviso 😘`); render();
    }, 700);
  }
  // ¿Pasaron menos de `min` minutos desde la última vez? (y anota la vez de ahora si no)
  function pocoDesde(clave, min) {
    let antes = 0; try { antes = +localStorage.getItem(clave) || 0; } catch (e) {}
    if (Date.now() - antes < min * 60000) return true;
    try { localStorage.setItem(clave, String(Date.now())); } catch (e) {}
    return false;
  }
  const olvidarDesde = (clave) => { try { localStorage.removeItem(clave); } catch (e) {} };
  // Mantener el corazón = tu latido
  let toque = null;
  const corazon = $("heart");
  corazon.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    toque = { t: Date.now(), largo: false, timer: setTimeout(empezarLatido, 450) };
  });
  function empezarLatido() {
    if (!toque) return;
    toque.largo = true; yoTocando = true; vibrar(60); renderVivo();
    mandarVivo("latido", { on: true });
    clearInterval(latidoCada); latidoCada = setInterval(() => mandarVivo("latido", { on: true }), 1000);
    tipLatido();
  }
  function tipLatido() {
    $("heart-tip").textContent = Date.now() - meSienteEn < 2500 ? `${otro.nombre} siente tu latido ahora mismo 💓` : "Mandando tu latido… 💓";
  }
  async function soltarCorazon(cancelado) {
    if (!toque) return;
    const t = toque; toque = null; clearTimeout(t.timer);
    if (!t.largo) { if (!cancelado) mandarBeso(); return; }
    yoTocando = false; clearInterval(latidoCada); latidoCada = null; renderVivo();
    mandarVivo("latido", { on: false });
    $("heart-tip").textContent = "Toca el corazón para mandarle besitos · mantenlo para mandar tu latido";
    // si no lo sintió en vivo (no tenía la app a la vista), le llega como notificación (como mucho una cada 10 minutos)
    if (!cancelado && meSienteEn < t.t && Date.now() - t.t >= 1500) {
      if (pocoDesde("ultimo-latido", 10)) { toast("Tu latido ya va en camino 💓"); return; }
      const { error } = await sb.from("eventos").insert({ pareja_id: pareja.id, de_usuario: user.id, tipo: "latido" });
      if (error) olvidarDesde("ultimo-latido");
      toast(error ? "No se pudo mandar" : `Le mandaste tu latido a ${otro.nombre} 💓`); render();
    }
  }
  corazon.addEventListener("pointerup", () => soltarCorazon(false));
  corazon.addEventListener("pointerleave", () => soltarCorazon(false));
  // El navegador cancela el toque si el dedo se corre un poco (cree que vas a desplazar la página).
  // Un toque corto cancelado era un scroll: no manda nada. Pero si el latido ya había empezado, se manda igual.
  corazon.addEventListener("pointercancel", () => soltarCorazon(!(toque && toque.largo)));
  corazon.addEventListener("contextmenu", (e) => e.preventDefault());
  corazon.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); mandarBeso(); } });

  // ---------- notita en la nevera ----------
  let notitaColor = "amarillo", notitaSuya = null, misNotitas = 0;
  async function cargarNotitas() {
    const { data, error } = await sb.from("notitas").select("*").eq("pareja_id", pareja.id).is("despegada_en", null).order("creado_en", { ascending: false }); if (error) return; // sin red se queda lo que ya se veía
    const suyas = (data || []).filter((n) => n.de_usuario === otro.id);
    misNotitas = (data || []).filter((n) => n.de_usuario === user.id).length;
    const anterior = notitaSuya && notitaSuya.id;
    notitaSuya = suyas[0] || null;
    const box = $("notita-suya"); box.hidden = !notitaSuya;
    if (notitaSuya) {
      box.className = "notita " + notitaSuya.color;
      if (notitaSuya.id !== anterior) animar(box, "pega"); // una notita nueva se pega con un tambaleo
      $("notita-de").textContent = `De ${otro.nombre} · ${ago(notitaSuya.creado_en)}` + (suyas.length > 1 ? ` · ${suyas.length - 1} más debajo` : "");
      $("notita-texto").textContent = notitaSuya.texto;
    }
  }
  $("notita-guardar").addEventListener("click", async () => {
    if (!notitaSuya) return;
    const { data, error } = await sb.rpc("despegar_notita", { p_id: notitaSuya.id });
    if (error || !filaValida(data)) { toast("No se pudo guardar"); return; }
    // se despega volando y después se carga la siguiente (si hay)
    $("notita-suya").classList.add("despega");
    setTimeout(() => { $("notita-suya").classList.remove("despega"); lluvia("💛", 10); cargarNotitas(); }, pocoMovimiento() ? 0 : 240);
    toast("Guardada en tu corazón 💗");
  });
  function pintarColoresNotita() {
    $("notita-colores").querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.color === notitaColor)));
    $("notita-in").style.background = getComputedStyle($("notita-colores").querySelector(`[data-color="${notitaColor}"]`)).backgroundColor;
  }
  $("notita-colores").querySelectorAll("button").forEach((b) => {
    b.setAttribute("role", "radio");
    b.addEventListener("click", () => { notitaColor = b.dataset.color; pintarColoresNotita(); });
  });
  $("btn-notita").addEventListener("click", () => {
    $("notita-para").textContent = `Una notita para ${otro.nombre}`;
    $("notita-in").value = "";
    $("notita-ayuda").textContent = misNotitas
      ? `Ya tiene ${plural(misNotitas, "notita tuya pegada", "notitas tuyas pegadas")} sin despegar 💛`
      : "Le quedará pegada en su Inicio hasta que la guarde.";
    pintarColoresNotita(); $("dlg-notita").showModal();
  });
  $("notita-cancelar").addEventListener("click", () => $("dlg-notita").close());
  $("f-notita").addEventListener("submit", async (e) => {
    e.preventDefault();
    const texto = $("notita-in").value.trim(); if (!texto) return;
    const { error } = await sb.from("notitas").insert({ pareja_id: pareja.id, de_usuario: user.id, texto, color: notitaColor });
    if (error) { toast("No se pudo pegar"); return; }
    $("dlg-notita").close(); lluvia("📝", 8); toast(`Notita pegada en el Inicio de ${otro.nombre} 📝`); cargarNotitas();
  });

  // ---------- una canción para ti ----------
  let canciones = [];
  const enlaceSeguro = (url) => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.href : null; } catch (e) { return null; } };
  async function cargarCanciones() {
    const { data, error } = await sb.from("canciones").select("*").eq("pareja_id", pareja.id).order("creado_en", { ascending: false }).limit(60); if (error) return; // sin red se queda lo que ya se veía
    canciones = data || []; renderCanciones();
  }
  function renderCanciones() {
    // en Inicio, la última que te dedicó tu pareja (durante una semana)
    const suya = canciones.find((c) => c.de_usuario === otro.id);
    const mostrar = suya && Date.now() - new Date(suya.creado_en).getTime() < 7 * 86400000;
    $("cancion-suya").hidden = !mostrar;
    if (mostrar) {
      $("cancion-de").textContent = `${otro.nombre} te dedicó · ${ago(suya.creado_en)}`;
      $("cancion-titulo").textContent = suya.titulo;
      $("cancion-nota").textContent = suya.nota ? `“${suya.nota}”` : "";
      const url = enlaceSeguro(suya.url);
      $("cancion-play").hidden = !url; if (url) $("cancion-play").href = url;
    }
    // en Juntos, la playlist de los dos
    const ul = $("playlist"); ul.innerHTML = "";
    if (!canciones.length) {
      const li = document.createElement("li"); li.className = "muted";
      li.textContent = "Dedíquense canciones desde Inicio (🎶) y aquí se arma su playlist."; ul.append(li); return;
    }
    canciones.forEach((c) => {
      const li = document.createElement("li");
      const i = document.createElement("span"); i.textContent = "🎶"; i.setAttribute("aria-hidden", "true");
      const t = document.createElement("span"); t.className = "p-info";
      const a = document.createElement("strong"), b = document.createElement("small");
      a.textContent = c.titulo;
      b.textContent = `${c.de_usuario === user.id ? "Tú" : otro.nombre} · ${fechaCorta(c.creado_en, miTz())}${c.nota ? " · " + c.nota : ""}`;
      t.append(a, b); li.append(i, t);
      const url = enlaceSeguro(c.url);
      if (url) { const l = document.createElement("a"); l.href = url; l.target = "_blank"; l.rel = "noopener noreferrer"; l.textContent = "▶"; l.setAttribute("aria-label", `Escuchar ${c.titulo}`); li.append(l); }
      ul.append(li);
    });
  }
  $("btn-cancion").addEventListener("click", () => {
    $("cancion-para").textContent = `Una canción para ${otro.nombre}`;
    ["cancion-titulo-in", "cancion-url-in", "cancion-nota-in"].forEach((id) => ($(id).value = ""));
    $("dlg-cancion").showModal();
  });
  $("cancion-cancelar").addEventListener("click", () => $("dlg-cancion").close());
  $("f-cancion").addEventListener("submit", async (e) => {
    e.preventDefault();
    const titulo = $("cancion-titulo-in").value.trim(); if (!titulo) return;
    const crudo = $("cancion-url-in").value.trim(), url = crudo ? enlaceSeguro(crudo) : null;
    if (crudo && !url) { toast("Ese enlace no parece válido (debe empezar con https://)"); return; }
    // ya normalizado puede crecer (tildes, espacios): la base acepta hasta 400 caracteres
    if (url && url.length > 400) { toast("Ese enlace es demasiado largo. Prueba con el botón Compartir → Copiar enlace"); return; }
    const nota = $("cancion-nota-in").value.trim() || null;
    const { error } = await sb.from("canciones").insert({ pareja_id: pareja.id, de_usuario: user.id, titulo, url, nota });
    if (error) { toast("No se pudo dedicar"); return; }
    $("dlg-cancion").close(); lluvia("🎶", 10); toast(`Canción dedicada a ${otro.nombre} 🎶`); cargarCanciones();
  });

  // (los dibujos con el dedo están en dibujo.js: llegan al álbum como un momento más)

  // ---------- la misma luna ----------
  // Fase de la luna (es la misma en Ecuador y en Chile): días desde una luna nueva conocida
  function faseLuna(d = new Date()) {
    const ciclo = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14);
    const edad = ((((d.getTime() - ref) / 86400000) % ciclo) + ciclo) % ciclo;
    const ilum = Math.round(((1 - Math.cos((2 * Math.PI * edad) / ciclo)) / 2) * 100);
    const i = Math.floor((edad / ciclo) * 8 + 0.5) % 8;
    return {
      ilum,
      emoji: ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"][i],
      nombre: ["luna nueva", "luna creciente", "cuarto creciente", "creciente gibosa", "luna llena", "menguante gibosa", "cuarto menguante", "luna menguante"][i],
    };
  }
  function renderLuna() {
    const h = partes(new Date().toISOString(), miTz()).h, p = $("luna"), noche = h >= 18 || h < 6;
    p.hidden = !noche; if (!noche) return;
    const f = faseLuna(), b = document.createElement("b");
    b.textContent = f.emoji; p.innerHTML = "";
    p.append(b, f.ilum >= 97 ? "Esta noche hay luna llena y la miran los dos 💛"
      : f.ilum <= 3 ? "Esta noche no se ve la luna, pero las estrellas son las mismas ✨"
      : `Esta noche miran la misma luna · ${f.nombre} (${f.ilum}%)`);
  }

  // ---------- nuestro amor en números ----------
  async function cargarNumeros() {
    const hace7 = new Date(Date.now() - 7 * 86400000).toISOString();
    const hace60 = new Date(Date.now() - 60 * 86400000).toISOString();
    // Supabase entrega como mucho 1000 filas: se piden solo los tipos que se cuentan aquí, los más nuevos primero
    // (las entradas, riegos, etc. llenarían el cupo y dejarían afuera lo de esta semana)
    const [{ data, error }, { data: noches }] = await Promise.all([
      sb.from("eventos").select("de_usuario, tipo, creado_en").eq("pareja_id", pareja.id).gte("creado_en", hace7)
        .in("tipo", ["beso", "abrazo", "te_extrano", "pensando", "latido", "carta", "notita"])
        .order("creado_en", { ascending: false }).limit(1000),
      sb.from("eventos").select("de_usuario, tipo, creado_en").eq("pareja_id", pareja.id).gte("creado_en", hace60)
        .eq("tipo", "buenas_noches").order("creado_en", { ascending: false }).limit(1000),
    ]);
    if (error) return;
    const evs = [...(data || []), ...(noches || [])], semana = evs.filter((e) => e.creado_en >= hace7);
    const cuenta = (tipos, quien) => semana.filter((e) => tipos.includes(e.tipo) && (!quien || e.de_usuario === quien)).length;
    const g = $("numeros"); g.innerHTML = "";
    [["beso", ["beso", "besos"], ["beso"]], ["abrazo", ["abrazo", "abrazos"], ["abrazo"]], ["corazon", ["te extraño", "te extraño"], ["te_extrano"]],
     ["pienso", ["pienso en ti", "pienso en ti"], ["pensando"]], ["latido", ["latido", "latidos"], ["latido"]],
     ["carta", ["carta o notita", "cartas y notitas"], ["carta", "notita"]]].forEach(([ico, [uno, varios], tipos]) => {
      const d = document.createElement("div"); d.className = "numero";
      const b = document.createElement("b"), s = document.createElement("strong"), sm = document.createElement("small");
      b.innerHTML = iconoSvg(ico);
      const total = cuenta(tipos);
      contar(s, total); // los números cuentan desde 0
      sm.textContent = `${total === 1 ? uno : varios} · tú ${cuenta(tipos, user.id)}, ${otro.nombre} ${cuenta(tipos, otro.id)}`;
      d.append(b, s, sm); g.append(d);
    });
    // ¿Quién extraña más? (todas las señales de cariño de la semana)
    const carino = ["te_extrano", "pensando", "beso", "abrazo", "latido", "notita", "carta"];
    const yo = cuenta(carino, user.id), ella = cuenta(carino, otro.id);
    $("quien-extrana").textContent = !yo && !ella ? "Esta semana todavía no hay señales… ¿quién empieza? 😏"
      : yo === ella ? "Esta semana se extrañan exactamente igual 💞"
      : yo > ella ? `Esta semana tú extrañas más 😏 (por ${yo - ella})`
      : `Esta semana ${otro.nombre} extraña más 😏 (por ${ella - yo})`;
    // Racha de noches seguidas en que los dos se dieron las buenas noches
    const tz = tzPareja(), porDia = {};
    evs.filter((e) => e.tipo === "buenas_noches").forEach((e) => { const k = claveDia(e.creado_en, tz); (porDia[k] = porDia[k] || new Set()).add(e.de_usuario); });
    const ambos = (k) => porDia[k] && porDia[k].size >= 2;
    let k = claveDia(new Date().toISOString(), tz), racha = 0;
    if (!ambos(k)) k = claveDia(new Date(utcDe(k) - 86400000 + 43200000).toISOString(), "UTC");
    while (ambos(k)) { racha++; k = claveDia(new Date(utcDe(k) - 86400000 + 43200000).toISOString(), "UTC"); }
    $("racha-noches").textContent = racha >= 2 ? `🌙 Llevan ${racha} noches seguidas dándose las buenas noches`
      : "🌙 Dense las buenas noches los dos cada día para empezar una racha.";
  }

  // ---------- notificaciones push ----------
  function b64ToU8(s) {
    const pad = "=".repeat((4 - (s.length % 4)) % 4);
    const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }
  // Estado de las notificaciones: texto y botón en Ajustes, atajo en Inicio
  async function prepararPush() {
    const estado = $("push-estado"), hint = $("push-hint"), btn = $("btn-push");
    btn.hidden = true; hint.hidden = true; $("ios-hint").hidden = true;
    if (isIOS && !isStandalone) {
      $("ios-hint").hidden = false;
      estado.textContent = "Falta instalar la app en la pantalla de inicio.";
      hint.hidden = false; hint.textContent = "Cómo activar las notificaciones";
      return;
    }
    if (!("PushManager" in window) || !("Notification" in window)) {
      estado.textContent = "Este navegador no permite notificaciones."; return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub && Notification.permission === "granted") {
      estado.textContent = (await guardarSub(sub)) ? "Activadas en este teléfono ✓"
        : "No se pudieron dejar listas en este teléfono. Revisa tu conexión y vuelve a abrir la app.";
      return;
    }
    if (Notification.permission === "denied") {
      estado.textContent = "Bloqueadas en este navegador. Permítelas en los ajustes del teléfono."; return;
    }
    estado.textContent = "Aún no activadas en este teléfono.";
    btn.hidden = false; hint.hidden = false; hint.textContent = "Activar notificaciones en este teléfono";
  }
  $("btn-push").addEventListener("click", async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast("Sin permiso para notificar"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(C.VAPID_PUBLIC_KEY) });
      toast((await guardarSub(sub)) ? "Notificaciones activadas ❤️" : "No se pudieron activar. Revisa tu conexión e intenta de nuevo.");
    } catch (e) { toast("No se pudo activar: " + e.message); }
    prepararPush();
  });
  $("push-hint").addEventListener("click", () => {
    if (!$("btn-push").hidden) $("btn-push").click(); else irA("ajustes");
  });
  // Devuelve si quedó guardada. guardar_push la pasa a esta cuenta aunque el aparato estuviera a nombre de la
  // otra (con RLS un upsert no puede); si la base todavía no tiene esa función, se usa el upsert de siempre.
  async function guardarSub(sub) {
    const j = sub.toJSON();
    let { error } = await sb.rpc("guardar_push", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
    if (error && (error.code === "PGRST202" || error.code === "42883")) {
      ({ error } = await sb.from("push_subs").upsert(
        { usuario_id: user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth },
        { onConflict: "endpoint" }
      ));
    }
    return !error;
  }
})();
