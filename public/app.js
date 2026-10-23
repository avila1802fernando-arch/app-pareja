/* Nosotros — app principal */
(function () {
  const C = window.NOSOTROS_CONFIG;
  const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
  const $ = (id) => document.getElementById(id);

  const HORAS_LIBRE = 2; // "Estoy libre para hablar" se apaga solo después de estas horas

  const S = { login: $("s-login"), pair: $("s-pair"), home: $("s-home") };
  let user = null, perfil = null, pareja = null, otro = null, canal = null, toastTimer = null;

  // ---------- utilidades ----------
  function show(name) {
    Object.keys(S).forEach((k) => (S[k].hidden = k !== name));
    $("tabs").hidden = name !== "home";
    document.body.classList.toggle("con-tabs", name === "home");
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
    const dt = new Date(iso);
    return `el ${dt.toLocaleDateString("es", { day: "numeric", month: "short" })} a las ${dt.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}`;
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
  let modoLogin = "entrar";
  function ponerModo(m) {
    modoLogin = m;
    const crear = m === "crear";
    $("clave2").hidden = $("clave2-lab").hidden = !crear;
    $("clave2").required = crear;
    $("clave").autocomplete = crear ? "new-password" : "current-password";
    $("btn-login").textContent = crear ? "Crear cuenta" : "Entrar";
    $("btn-modo").textContent = crear ? "Ya tengo cuenta" : "Crear una cuenta nueva";
    $("login-msg").textContent = crear ? "Sin correo: solo un usuario y una contraseña de al menos 8 caracteres. Guárdala bien 💗" : "";
  }
  $("btn-modo").addEventListener("click", () => ponerModo(modoLogin === "crear" ? "entrar" : "crear"));
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
    msg.textContent = error ? "Usuario o contraseña incorrectos." : "";
  });
  $("btn-logout").addEventListener("click", async () => { await sb.auth.signOut(); location.reload(); });

  sb.auth.onAuthStateChange((_ev, session) => {
    user = session ? session.user : null;
    if (!user) { show("login"); return; }
    cargar();
  });

  // ---------- carga de perfil y pareja ----------
  async function cargar() {
    const { data: p } = await sb.from("perfiles").select("*").eq("id", user.id).maybeSingle();
    perfil = p;
    // Perfiles creados antes de tener zona horaria: guardar la del teléfono
    if (perfil && !perfil.tz) {
      await sb.from("perfiles").update({ tz: tzNavegador }).eq("id", user.id);
      perfil.tz = tzNavegador;
    }
    const { data: pj } = await sb.from("parejas").select("*")
      .or(`usuario_a.eq.${user.id},usuario_b.eq.${user.id}`).maybeSingle();
    pareja = pj;
    if (!pareja || !pareja.usuario_b) {
      show("pair");
      // nombre sugerido a partir del usuario: "martina" → "Martina"
      const sugerido = usuarioDe(user.email).replace(/^./, (c) => c.toUpperCase());
      $("nombre").value = (perfil && perfil.nombre) || sugerido;
      if (pareja) { mostrarCodigo(pareja.codigo); esperarPareja(); }
      return;
    }
    await entrar();
  }

  async function guardarNombre() {
    const nombre = $("nombre").value.trim();
    if (!nombre) { $("pair-msg").textContent = "Escribe tu nombre primero."; return false; }
    const tz = miTz();
    const { error } = await sb.from("perfiles").upsert({ id: user.id, nombre, tz });
    if (error) { $("pair-msg").textContent = error.message; return false; }
    perfil = { id: user.id, nombre, tz };
    return true;
  }

  $("btn-crear").addEventListener("click", async () => {
    if (!(await guardarNombre())) return;
    const codigo = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
    const { data, error } = await sb.from("parejas").insert({ usuario_a: user.id, codigo }).select().single();
    if (error) { $("pair-msg").textContent = error.message; return; }
    pareja = data; mostrarCodigo(codigo); esperarPareja();
  });

  function mostrarCodigo(codigo) {
    $("btn-crear").hidden = true; $("f-unirse").hidden = true;
    $("codigo-box").hidden = false; $("codigo").textContent = codigo;
  }
  function esperarPareja() {
    sb.channel("espera").on("postgres_changes",
      { event: "UPDATE", schema: "public", table: "parejas", filter: `id=eq.${pareja.id}` },
      (payload) => { if (payload.new.usuario_b) { pareja = payload.new; entrar(); } }
    ).subscribe();
  }

  $("f-unirse").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!(await guardarNombre())) return;
    const codigo = $("codigo-in").value.trim().toUpperCase();
    const { data, error } = await sb.rpc("unirse_pareja", { p_codigo: codigo });
    if (error || !data) { $("pair-msg").textContent = "Código no válido o ya usado."; return; }
    pareja = data; await entrar();
  });

  // ---------- pantalla principal ----------
  async function entrar() {
    show("home");
    const otroId = pareja.usuario_a === user.id ? pareja.usuario_b : pareja.usuario_a;
    const { data: o } = await sb.from("perfiles").select("*").eq("id", otroId).maybeSingle();
    otro = o || { id: otroId, nombre: "Tu pareja" };
    tituloHome();
    $("heart").classList.add("beat");
    irA(tabDeUrl(location.href));

    // Registrar mi entrada (una vez por apertura)
    if (!sessionStorage.getItem("entrada")) {
      await sb.from("eventos").insert({ pareja_id: pareja.id, de_usuario: user.id, tipo: "entrada" });
      sessionStorage.setItem("entrada", "1");
    }
    // relojes y contadores: se repintan cada 30 s (también cambia "es mañana" → "¡hoy!" a medianoche)
    clearInterval(relojTimer); renderRelojes();
    relojTimer = setInterval(() => { renderRelojes(); renderJuntos(); }, 30000);
    await Promise.all([render(), cargarDispo(), cargarAnimos(), cargarJuntos(), cargarPregunta(), cargarCartas()]);
    if (canal) sb.removeChannel(canal);
    canal = sb.channel("pareja").on("postgres_changes",
      { event: "INSERT", schema: "public", table: "eventos", filter: `pareja_id=eq.${pareja.id}` },
      (payload) => {
        const ev = payload.new;
        if (ev.de_usuario !== user.id) {
          toast((AVISOS[ev.tipo] || AVISOS.te_extrano)(otro.nombre));
          sentir(ev.tipo); sessionStorage.setItem("sentido", ev.id);
          if (ev.tipo === "respuesta") cargarPregunta();
          if (ev.tipo === "carta") cargarCartas();
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
      (payload) => { otro = { ...otro, ...payload.new }; tituloHome(); render(); renderDispo(); renderRelojes(); }
    ).on("postgres_changes",
      // "juntos desde" cambiado por cualquiera de los dos
      { event: "UPDATE", schema: "public", table: "parejas", filter: `id=eq.${pareja.id}` },
      (payload) => { pareja = { ...pareja, ...payload.new }; renderJuntos(); }
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
        if (r.usuario_id !== otro.id) return;
        if (payload.eventType === "DELETE") horarios.suyos.delete(idx(r.dia, r.hora)); else horarios.suyos.add(idx(r.dia, r.hora));
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
    ).subscribe();
    prepararPush();
  }

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

  async function render() {
    const { data: evs } = await sb.from("eventos").select("*").eq("pareja_id", pareja.id)
      .order("creado_en", { ascending: false }).limit(12);
    const suyos = (evs || []).filter((e) => e.de_usuario !== user.id);
    // Si abriste la app por una señal reciente (p. ej. tocando la notificación del abrazo), la sientes al entrar
    const ult = suyos[0];
    if (ult && SENTIR[ult.tipo] && Date.now() - new Date(ult.creado_en).getTime() < 10 * 60000
        && sessionStorage.getItem("sentido") !== String(ult.id)) {
      sessionStorage.setItem("sentido", ult.id); sentir(ult.tipo);
    }
    const ultEntrada = suyos.find((e) => e.tipo === "entrada");
    const ultMsg = suyos.find((e) => e.tipo === "te_extrano");
    $("status-title").textContent = ultEntrada ? `${otro.nombre} entró ${ago(ultEntrada.creado_en)}` : `${otro.nombre} todavía no ha entrado`;
    $("status-when").textContent = ultMsg ? `último “te extraño” ${ago(ultMsg.creado_en)}` : "aún sin mensajes";
    const list = $("log-list"); list.innerHTML = "";
    (evs || []).forEach((e) => {
      const quien = e.de_usuario === user.id ? perfil.nombre : otro.nombre;
      const li = document.createElement("li"), a = document.createElement("span"), b = document.createElement("span");
      a.textContent = (SENALES[e.tipo] || SENALES.entrada)(quien);
      b.textContent = ago(e.creado_en); li.append(a, b); list.append(li);
    });
  }

  $("btn-extrano").addEventListener("click", async () => {
    const b = $("btn-extrano"); b.disabled = true;
    const { error } = await sb.from("eventos").insert({ pareja_id: pareja.id, de_usuario: user.id, tipo: "te_extrano" });
    toast(error ? "No se pudo enviar" : "Enviado ❤️");
    b.disabled = false; render();
  });

  // Señales rápidas: abrazo, beso, pienso en ti, buenos días, buenas noches
  document.querySelectorAll("#senales button").forEach((b) => b.addEventListener("click", async () => {
    const tipo = b.dataset.senal;
    document.querySelectorAll("#senales button").forEach((x) => (x.disabled = true));
    const { error } = await sb.from("eventos").insert({ pareja_id: pareja.id, de_usuario: user.id, tipo });
    if (error) toast("No se pudo enviar");
    else { lluvia(SENTIR[tipo].emoji, 6); toast(`Enviado a ${otro.nombre} ${SENTIR[tipo].emoji}`); }
    // una pausa corta para no mandar diez seguidas sin querer
    setTimeout(() => document.querySelectorAll("#senales button").forEach((x) => (x.disabled = false)), 1500);
    render();
  }));

  // ---------- navegación por pestañas ----------
  const TABS = ["inicio", "juntos", "horarios", "calendario", "ajustes"];
  const AL_ABRIR = {}; // cada pestaña registra aquí qué cargar al abrirse
  function irA(tab) {
    if (!TABS.includes(tab)) tab = "inicio";
    TABS.forEach((t) => ($("tab-" + t).hidden = t !== tab));
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    history.replaceState(null, "", tab === "inicio" ? location.pathname : "#" + tab);
    window.scrollTo(0, 0);
    if (AL_ABRIR[tab]) AL_ABRIR[tab]();
  }
  const tabDeUrl = (u) => (new URL(u, location.origin).hash || "#inicio").slice(1);
  document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => irA(b.dataset.tab)));
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
    $("aj-desde").max = diaHoy();
    $("aj-usuario").textContent = `Tu usuario: ${usuarioDe(user.email)}`;
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
    const { data, error } = await sb.rpc("fijar_desde", { p_fecha: $("aj-desde").value || null });
    if (error || !data) { toast("No se pudo guardar la fecha"); return; }
    pareja = { ...pareja, ...data }; renderJuntos();
    toast(pareja.desde ? "Guardado 💞" : "Fecha quitada");
  });
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
    toast("Guardado ❤️"); render(); renderDispo(); renderAjustes();
  });
  AL_ABRIR.ajustes = renderAjustes;

  // ---------- disponibilidad para llamar ----------
  const dispo = { mia: null, suya: null };
  let dispoTimer = null;
  // Una fila cuenta como "libre" solo si no venció (por si el cron aún no la apagó)
  function estaLibre(d) { return !!(d && d.libre && (!d.hasta || new Date(d.hasta) > new Date())); }

  async function cargarDispo() {
    const { data } = await sb.from("disponibilidad").select("*").in("usuario_id", [user.id, otro.id]);
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
    const { data } = await sb.from("animos").select("*").in("usuario_id", [user.id, otro.id]);
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
  // Se guardan en UTC (dia 0=domingo … 6=sábado, hora 0-23) y cada uno los ve en su zona.
  const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const DIAS_LARGO = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0]; // lunes primero
  const horarios = { mios: new Set(), suyos: new Set() }; // índices UTC: dia*24+hora
  const idx = (d, h) => d * 24 + h;
  const hh = (h) => String(h % 24).padStart(2, "0") + ":00";
  let mapaMio = null, mapaSuyo = null;

  // Desplazamiento (en minutos) de una zona horaria en un instante dado
  function offsetMin(tz, date) {
    const p = {};
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(date).forEach((x) => (p[x.type] = x.value));
    const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((comoUtc - date.getTime()) / 60000);
  }
  // Para una zona: índice UTC → índice local y al revés, tomando la semana actual como referencia
  function mapaTz(tz) {
    const aLocal = new Array(168), aUtc = new Array(168);
    const base = new Date(); base.setUTCHours(0, 0, 0, 0);
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

  async function cargarHorarios() {
    mapaMio = mapaTz(miTz()); mapaSuyo = mapaTz(suTz());
    const { data } = await sb.from("horarios").select("usuario_id, dia, hora").in("usuario_id", [user.id, otro.id]);
    horarios.mios = new Set(); horarios.suyos = new Set();
    (data || []).forEach((r) => (r.usuario_id === user.id ? horarios.mios : horarios.suyos).add(idx(r.dia, r.hora)));
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
        const u = mapaMio.aUtc[idx(d, h)];
        c.dataset.u = u;
        c.classList.toggle("mio", horarios.mios.has(u));
        c.classList.toggle("suyo", horarios.suyos.has(u));
        g.append(c);
      });
    }
    renderComun();
  }

  // Lista "Horas en común": cruce de los dos, agrupado por mi día local, con las dos horas
  function renderComun() {
    const list = $("comun-list"); list.innerHTML = "";
    const comunes = [...horarios.mios].filter((u) => horarios.suyos.has(u));
    if (!comunes.length) {
      const li = document.createElement("li"); li.className = "muted";
      li.textContent = horarios.suyos.size ? "Todavía no coinciden horas. Marca más o pídele que marque." : `${otro.nombre} todavía no marcó su horario.`;
      list.append(li); return;
    }
    const porDia = {};
    comunes.forEach((u) => { const l = mapaMio.aLocal[u]; (porDia[Math.floor(l / 24)] = porDia[Math.floor(l / 24)] || []).push(l % 24); });
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
    const u = +c.dataset.u;
    if (pintando.tocados.has(u)) return;
    pintando.tocados.add(u);
    c.classList.toggle("mio", pintando.valor);
    if (pintando.valor) horarios.mios.add(u); else horarios.mios.delete(u);
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
    const us = [...tocados]; if (!us.length) return;
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
    const { data } = await sb.from("eventos_cal").select("*").eq("pareja_id", pareja.id).order("inicio");
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
  let relojTimer = null, proximo = null;
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
  }

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
  function textoJuntos(desde) {
    const hoy = diaHoy();
    if (desde > hoy) return null;
    const total = diasEntre(desde, hoy);
    if (total === 0) return "💞 Hoy empieza lo nuestro";
    const { a, m, d } = duracion(desde, hoy);
    const p = [a && plural(a, "año", "años"), m && plural(m, "mes", "meses"), d && plural(d, "día", "días")].filter(Boolean);
    const t = p.length > 1 ? p.slice(0, -1).join(", ") + " y " + p[p.length - 1] : p[0];
    if (d === 0) return `🎉 ¡Hoy cumplen ${t} juntos!`;
    return `💞 Juntos hace ${t}` + (a || m ? ` · ${total.toLocaleString("es")} días` : "");
  }

  // El próximo viaje o cita del calendario es el encuentro que contamos
  async function cargarJuntos() {
    const hace60 = new Date(Date.now() - 60 * 86400000).toISOString();
    const { data } = await sb.from("eventos_cal").select("titulo, tipo, inicio, fin, creado_en")
      .eq("pareja_id", pareja.id).in("tipo", ["viaje", "cita"]).gte("inicio", hace60).order("inicio").limit(20);
    proximo = (data || []).find((ev) => new Date(ev.fin || ev.inicio).getTime() >= Date.now()) || null;
    renderJuntos();
  }
  function renderJuntos() {
    const tj = pareja.desde ? textoJuntos(pareja.desde) : null;
    $("juntos").hidden = !tj; if (tj) $("juntos").textContent = tj;
    $("juntos-poner").hidden = !!pareja.desde;

    const num = $("heart-num");
    num.hidden = $("cuenta").hidden = !proximo;
    if (!proximo) return;
    const ahora = Date.now(), ini = new Date(proximo.inicio).getTime();
    const dias = diasEntre(diaHoy(), claveDia(proximo.inicio, miTz()));
    let n, txt;
    if (ini <= ahora) { n = "💞"; txt = "¡Por fin juntos!"; }
    else if (dias <= 0) { n = "¡Hoy!"; txt = "hoy se ven, por fin"; }
    else if (dias === 1) { n = "1"; txt = "día para vernos · ¡es mañana!"; }
    else { n = String(dias); txt = "días para vernos"; }
    num.textContent = n; num.classList.toggle("chico", n.length > 3);
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
  $("juntos-poner").addEventListener("click", () => { irA("ajustes"); $("aj-desde").focus(); });

  // ---------- pregunta del día ----------
  const PREGUNTAS = window.NOSOTROS_PREGUNTAS || ["¿Qué es lo que más te gusta de nosotros?"];
  const respHoy = { mia: null, suya: null, suyaRespondio: false };
  let editandoResp = false;
  // La pregunta cambia a medianoche de quien vive más al oeste: así a nadie le cambia antes de dormir
  function diaPregunta() {
    const ahora = new Date();
    const tz = offsetMin(miTz(), ahora) <= offsetMin(suTz(), ahora) ? miTz() : suTz();
    return claveDia(ahora.toISOString(), tz);
  }
  const preguntaDe = (dia) => {
    const n = PREGUNTAS.length;
    return PREGUNTAS[((diasEntre("2026-01-01", dia) % n) + n) % n];
  };

  async function cargarPregunta() {
    const dia = diaPregunta();
    $("preg-texto").textContent = preguntaDe(dia);
    $("resp-su-nombre").textContent = otro.nombre;
    const [{ data: filas }, { data: suya }, { data: racha }] = await Promise.all([
      sb.from("respuestas").select("*").eq("pareja_id", pareja.id).eq("dia", dia),
      sb.rpc("respondio_pareja", { p_dia: dia }),
      sb.rpc("racha_preguntas", { p_hoy: dia }),
    ]);
    respHoy.mia = (filas || []).find((r) => r.usuario_id === user.id) || null;
    respHoy.suya = (filas || []).find((r) => r.usuario_id === otro.id) || null;
    respHoy.suyaRespondio = !!suya;
    $("preg-racha").textContent = racha > 1 ? `🔥 ${racha} días seguidos` : "";
    renderPregunta();
  }
  function renderPregunta() {
    const { mia, suya, suyaRespondio } = respHoy;
    const responder = !mia || editandoResp;
    $("f-respuesta").hidden = !responder;
    $("respuestas").hidden = responder;
    if (responder) {
      if (mia) $("resp-texto").value = mia.texto;
      $("resp-enviar").textContent = mia ? "Guardar cambio" : "Responder";
      $("resp-nota").textContent = mia ? ""
        : suyaRespondio ? `${otro.nombre} ya respondió 👀 Responde para ver lo que dijo.`
        : "Cuando respondan los dos, cada uno verá la respuesta del otro.";
    } else {
      $("resp-mia").textContent = mia.texto;
      $("resp-suya").textContent = suya ? suya.texto : "Todavía no responde. Te avisamos cuando lo haga 💌";
      $("resp-suya").classList.toggle("espera-resp", !suya);
    }
    actualizarPuntos();
  }
  $("f-respuesta").addEventListener("submit", async (e) => {
    e.preventDefault();
    const texto = $("resp-texto").value.trim(); if (!texto) return;
    const dia = diaPregunta(), primera = !respHoy.mia;
    const { error } = primera
      ? await sb.from("respuestas").insert({ pareja_id: pareja.id, usuario_id: user.id, dia, pregunta: preguntaDe(dia), texto })
      : await sb.from("respuestas").update({ texto }).eq("usuario_id", user.id).eq("dia", dia);
    if (error) { toast("No se pudo guardar"); return; }
    editandoResp = false;
    if (primera) lluvia("💗", 10);
    await cargarPregunta(); cargarHistorial();
  });
  $("resp-editar").addEventListener("click", () => { editandoResp = true; renderPregunta(); $("resp-texto").focus(); });

  // Días anteriores (último mes). La respuesta de tu pareja aparece solo en los días que respondiste.
  async function cargarHistorial() {
    const dia = diaPregunta();
    const desde = new Date(utcDe(dia) - 30 * 86400000).toISOString().slice(0, 10);
    const { data } = await sb.from("respuestas").select("*").eq("pareja_id", pareja.id)
      .lt("dia", dia).gte("dia", desde).order("dia", { ascending: false });
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
  AL_ABRIR.juntos = () => { cargarPregunta(); cargarHistorial(); cargarCartas(); cargarDeseos(); };

  // ---------- lista "Cuando nos veamos" ----------
  let deseos = [];
  async function cargarDeseos() {
    const { data } = await sb.from("deseos").select("*").eq("pareja_id", pareja.id).order("creado_en");
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
    const [{ data: cs }, { data: sl }] = await Promise.all([
      sb.from("cartas").select("*").eq("pareja_id", pareja.id).order("creado_en", { ascending: false }).limit(40),
      sb.rpc("cartas_selladas"),
    ]);
    cartas = cs || []; selladas = sl || [];
    renderCartas();
  }
  function renderCartas() {
    const list = $("cartas-list"); list.innerHTML = "";
    const item = (icono, titulo, detalle, clase, alTocar) => {
      const li = document.createElement("li"); if (clase) li.className = clase;
      const i = document.createElement("span"); i.className = "c-icono"; i.textContent = icono; i.setAttribute("aria-hidden", "true");
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
      item("🔒", `Carta sellada de ${otro.nombre}`,
        `Se abre el ${fechaCorta(s.abrir_en, miTz())} a las ${hora(s.abrir_en, miTz())}` + (dias > 0 ? ` · en ${plural(dias, "día", "días")}` : ""),
        "sellada");
    });
    cartas.forEach((c) => {
      if (c.de_usuario === user.id) {
        const estado = c.abrir_en && new Date(c.abrir_en) > new Date() ? `🔒 sellada hasta el ${fechaCorta(c.abrir_en, miTz())}`
          : c.leida_en ? `leída ✓ ${ago(c.leida_en)}` : "aún sin abrir";
        item("✉️", `Para ${otro.nombre}`, `${fechaCorta(c.creado_en, miTz())} · ${estado}`, "", () => leerCarta(c));
      } else {
        item("💌", `Carta de ${otro.nombre}`, c.leida_en ? `${fechaCorta(c.creado_en, miTz())}` : "nueva · tócala para abrirla",
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
    if ($("carta-sellar").checked && $("carta-abrir").value) {
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
  const pendientes = { pregunta: false, cartas: false };
  function actualizarPuntos() {
    pendientes.pregunta = respHoy.suyaRespondio && !respHoy.mia;
    const hay = Object.values(pendientes).some(Boolean);
    const b = document.querySelector('#tabs button[data-tab="juntos"]');
    b.classList.toggle("punto", hay);
    b.setAttribute("aria-label", hay ? "Juntos: hay algo nuevo para ti" : "Juntos");
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
      await guardarSub(sub); estado.textContent = "Activadas en este teléfono ✓"; return;
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
      await guardarSub(sub);
      toast("Notificaciones activadas ❤️");
    } catch (e) { toast("No se pudo activar: " + e.message); }
    prepararPush();
  });
  $("push-hint").addEventListener("click", () => {
    if (!$("btn-push").hidden) $("btn-push").click(); else irA("ajustes");
  });
  async function guardarSub(sub) {
    const j = sub.toJSON();
    await sb.from("push_subs").upsert(
      { usuario_id: user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth },
      { onConflict: "endpoint" }
    );
  }
})();
