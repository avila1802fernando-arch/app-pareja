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
    // Las fechas de config.js quedan guardadas desde el principio
    const F = C.FECHAS || {};
    const { data, error } = await sb.from("parejas")
      .insert({ usuario_a: user.id, codigo, desde: F.novios || null, conocidos: F.conocidos || null }).select().single();
    if (error) { $("pair-msg").textContent = error.message; return; }
    pareja = data; mostrarCodigo(codigo); esperarPareja();
    // …y el primer encuentro queda en el calendario como viaje (el corazón del Inicio cuenta los días)
    if (F.encuentro && F.encuentro >= claveDia(new Date().toISOString(), miTz())) {
      await sb.from("eventos_cal").insert({
        pareja_id: data.id, creado_por: user.id, tipo: "viaje",
        titulo: F.lugar ? `Nos vemos por primera vez en ${F.lugar} 💞` : "Nos vemos por primera vez 💞",
        inicio: aIso(F.encuentro + "T09:00", miTz()), nota: "Cambien la hora cuando tengan el vuelo ✈️",
      });
    }
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
    // Parejas creadas antes de tener fechas: se toman las de config.js
    const F = C.FECHAS || {};
    if (!pareja.desde && !pareja.conocidos && (F.novios || F.conocidos)) {
      const { data } = await sb.rpc("fijar_fechas", { p_conocidos: F.conocidos || null, p_desde: F.novios || null });
      if (data && data.id) pareja = { ...pareja, ...data };
    }
    // relojes y contadores: se repintan cada 30 s (también cambia "es mañana" → "¡hoy!" a medianoche)
    clearInterval(relojTimer); renderRelojes();
    relojTimer = setInterval(() => { renderRelojes(); renderJuntos(); }, 30000);
    renderAvatares(); renderDistancia(); conectarVivo();
    // Bienvenida la primera vez que entran
    let vista = false; try { vista = localStorage.getItem("bienvenida-vista") === "1"; } catch (e) {}
    $("bienvenida").hidden = vista;
    await Promise.all([render(), cargarDispo(), cargarAnimos(), cargarJuntos(), cargarPregunta(), cargarCartas(),
      cargarMomentos(), cargarGirasol(), cargarFrasco(), cargarVales(), cargarNotitas(), cargarCanciones()]);
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
    momento: (n) => `${n} compartió un momento 📸`,
    riego: (n) => `${n} regó nuestro girasol 💧`,
    vale: (n) => `${n} te regaló un vale 🎟️`,
    canje: (n) => `${n} canjeó tu vale 🎟️`,
    razon: (n) => `${n} echó una razón al frasco 🫙`,
    latido: (n) => `${n} te mandó su latido 💓`,
    notita: (n) => `${n} te dejó una notita 📝`,
    cancion: (n) => `${n} te dedicó una canción 🎶`,
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
    // ¿Cuántas veces pensó en ti hoy? (señales de cariño desde la medianoche de tu zona)
    const { count: veces } = await sb.from("eventos").select("id", { count: "exact", head: true })
      .eq("pareja_id", pareja.id).eq("de_usuario", otro.id)
      .in("tipo", ["te_extrano", "pensando", "beso", "abrazo", "latido", "buenos_dias", "buenas_noches", "notita", "carta", "razon", "cancion"])
      .gte("creado_en", aIso(diaHoy() + "T00:00", miTz()));
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

  // ---------- bienvenida y guía ----------
  function cerrarBienvenida() { try { localStorage.setItem("bienvenida-vista", "1"); } catch (e) {} $("bienvenida").hidden = true; }
  $("bienvenida-ok").addEventListener("click", () => { cerrarBienvenida(); lluvia("💗", 10); });
  $("bienvenida-guia").addEventListener("click", () => {
    cerrarBienvenida(); irA("ajustes");
    const primero = $("guia").querySelector("details"); if (primero) primero.open = true;
    setTimeout(() => $("guia").scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  });

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
    if (error || !data) { toast("No se pudieron guardar las fechas"); return; }
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
    renderLuna(); renderSaludo(); renderFrase();
  }

  // Saludo según la hora de cada uno
  function renderSaludo() {
    const h = partes(new Date().toISOString(), miTz()).h;
    const [s, e] = h >= 5 && h < 12 ? ["Buenos días", "☀️"] : h >= 12 && h < 19 ? ["Buenas tardes", "🌤️"] : ["Buenas noches", "🌙"];
    $("saludo").textContent = `${s}, ${perfil.nombre} ${e}`;
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
  function renderFrase() {
    const n = FRASES.length, i = ((diasEntre("2026-01-01", diaPregunta()) % n) + n) % n;
    $("frase-dia").textContent = FRASES[i];
  }
  // Celebrar algo una sola vez en este teléfono (lluvia de emojis)
  function celebrarUnaVez(clave, emoji) {
    let ya = false; try { ya = localStorage.getItem(clave) === "1"; localStorage.setItem(clave, "1"); } catch (e) {}
    if (!ya) setTimeout(() => lluvia(emoji, 22), 700);
    return !ya;
  }
  // El gran día: cuando por fin se ven, una celebración a pantalla completa (una vez)
  function granDia() {
    if (!celebrarUnaVez("gran-dia-" + proximo.inicio.slice(0, 10), "💞")) return;
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
    const hace60 = new Date(Date.now() - 60 * 86400000).toISOString();
    const { data } = await sb.from("eventos_cal").select("titulo, tipo, inicio, fin, creado_en")
      .eq("pareja_id", pareja.id).in("tipo", ["viaje", "cita"]).gte("inicio", hace60).order("inicio").limit(20);
    proximo = (data || []).find((ev) => new Date(ev.fin || ev.inicio).getTime() >= Date.now()) || null;
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
  AL_ABRIR.juntos = () => {
    cargarPregunta(); cargarHistorial(); cargarCartas(); cargarDeseos();
    cargarGirasol(); cargarFrasco(); cargarVales(); cargarMomentos(); cargarCanciones(); cargarNumeros();
  };

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
  const pendientes = { pregunta: false, cartas: false, girasol: false, frasco: false };
  function actualizarPuntos() {
    pendientes.pregunta = respHoy.suyaRespondio && !respHoy.mia;
    const hay = Object.values(pendientes).some(Boolean);
    const b = document.querySelector('#tabs button[data-tab="juntos"]');
    b.classList.toggle("punto", hay);
    b.setAttribute("aria-label", hay ? "Juntos: hay algo nuevo para ti" : "Juntos");
  }

  // ---------- fotos (bucket privado de Storage) ----------
  // Rutas: <pareja_id>/<usuario_id>/<archivo>. Se muestran con URLs firmadas que vencen en 1 hora.
  const urlsFotos = {};
  async function urlDeFoto(ruta) {
    if (!ruta) return null;
    const c = urlsFotos[ruta];
    if (c && c.vence > Date.now()) return c.url;
    const { data } = await sb.storage.from("fotos").createSignedUrl(ruta, 3600);
    if (!data) return null;
    urlsFotos[ruta] = { url: data.signedUrl, vence: Date.now() + 50 * 60000 };
    return data.signedUrl;
  }
  const cargarImagen = (file) => new Promise((ok, mal) => {
    const img = new Image(); img.onload = () => ok(img); img.onerror = mal; img.src = URL.createObjectURL(file);
  });
  const aJpeg = (canvas, calidad) => new Promise((ok) => canvas.toBlob(ok, "image/jpeg", calidad));
  // Achica la foto antes de subirla (así carga rápido y ocupa poco)
  async function reducir(file, max = 1280) {
    const img = await cargarImagen(file);
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return aJpeg(c, 0.82);
  }
  async function subirFoto(blob, nombre) {
    const ruta = `${pareja.id}/${user.id}/${nombre}-${Date.now()}.jpg`;
    const { error } = await sb.storage.from("fotos").upload(ruta, blob, { contentType: "image/jpeg" });
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
    const ruta = await subirFoto(await aJpeg(out, 0.88), "perfil");
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
    const { data } = await sb.from("momentos").select("*").eq("pareja_id", pareja.id).order("creado_en", { ascending: false }).limit(30);
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
    // en Juntos, el álbum
    const g = $("album"); g.innerHTML = "";
    if (!momentos.length) {
      const p = document.createElement("p"); p.className = "small-note"; p.style.gridColumn = "1 / -1";
      p.textContent = "Aquí se irán guardando sus momentos 📸 Compártelos desde Inicio."; g.append(p); return;
    }
    momentos.forEach((m) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "album-foto";
      b.setAttribute("aria-label", `${m.de_usuario === user.id ? "Tu momento" : "Momento de " + otro.nombre}${m.texto ? ": " + m.texto : ""}, ${ago(m.creado_en)}`);
      b.addEventListener("click", () => verMomento(m));
      urlDeFoto(m.ruta).then((u) => { if (u) b.style.backgroundImage = `url("${u}")`; });
      g.append(b);
    });
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
    const { data } = await sb.from("riegos").select("usuario_id, dia").eq("pareja_id", pareja.id);
    riegos = data || []; renderGirasol();
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
    $("btn-regar").textContent = yo ? "Regado hoy ✓" : "Regar 💧";
    pendientes.girasol = suyo && !yo; actualizarPuntos();
  }
  $("btn-regar").addEventListener("click", async () => {
    const dia = diaPregunta();
    $("btn-regar").disabled = true;
    const { error } = await sb.from("riegos").insert({ pareja_id: pareja.id, usuario_id: user.id, dia });
    if (error) { toast("No se pudo regar"); $("btn-regar").disabled = false; return; }
    riegos.push({ usuario_id: user.id, dia }); lluvia("💧", 12);
    renderGirasol();
    const g = $("girasol"); g.classList.remove("regado"); void g.offsetWidth; g.classList.add("regado");
  });

  // ---------- frasco de razones ----------
  let enFrasco = 0;
  async function cargarFrasco() {
    const [{ data: n }, { data: rs }] = await Promise.all([
      sb.rpc("razones_en_frasco"),
      sb.from("razones").select("*").eq("pareja_id", pareja.id).order("creado_en", { ascending: false }).limit(200),
    ]);
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
    const { data, error } = await sb.rpc("sacar_razon");
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
  let vales = [], valeEmoji = "🎟️";
  async function cargarVales() {
    const { data } = await sb.from("vales").select("*").eq("pareja_id", pareja.id).order("creado_en", { ascending: false });
    vales = data || []; renderVales();
  }
  function renderVales() {
    const ul = $("vales-list"); ul.innerHTML = "";
    const paraMi = vales.filter((v) => v.de_usuario !== user.id), mios = vales.filter((v) => v.de_usuario === user.id);
    const fila = (v, mio) => {
      const li = document.createElement("li"); li.classList.toggle("usado", !!v.canjeado_en);
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
          if (error || !data) { toast("No se pudo canjear"); return; }
          lluvia(v.emoji, 14); toast("¡Canjeado! 💗"); cargarVales();
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
  // Canal en tiempo real que no guarda nada: quién está en la app, quién toca su corazón y los besitos al vuelo.
  const PATRON_LATIDO = [90, 120, 90, 600];
  const vibrar = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };
  let canalVivo = null, otroAqui = false, otroTocando = false, yoTocando = false, vibraLatido = null;
  function conectarVivo() {
    if (canalVivo) sb.removeChannel(canalVivo);
    canalVivo = sb.channel(`vivo-${pareja.id}`, { config: { presence: { key: user.id }, broadcast: { self: false } } });
    canalVivo
      .on("presence", { event: "sync" }, () => {
        const estado = canalVivo.presenceState()[otro.id] || [];
        otroAqui = estado.length > 0;
        otroTocando = estado.some((p) => p.tocando);
        renderVivo();
      })
      .on("broadcast", { event: "beso" }, ({ payload }) => {
        const n = (payload && payload.n) || 1;
        if (!$("tab-inicio").hidden) besosVoladores(n, false); else lluvia("💋", Math.min(10, 3 + n));
        toast(n > 1 ? `${otro.nombre} te mandó ${n} besitos 😘` : `${otro.nombre} te mandó un besito 😘`);
        vibrar([40, 40, 40]);
      })
      .subscribe((s) => { if (s === "SUBSCRIBED" && !document.hidden) canalVivo.track({ tocando: false }); });
  }
  // Si la app pasa a segundo plano, deja de figurar como "en la app"
  document.addEventListener("visibilitychange", () => {
    if (!canalVivo) return;
    if (document.hidden) { yoTocando = false; canalVivo.untrack(); } else canalVivo.track({ tocando: false });
  });
  function renderVivo() {
    $("presente").hidden = !otroAqui;
    $("presente").textContent = otroTocando ? `${otro.nombre} está tocando su corazón 💓` : `${otro.nombre} está en la app ahora`;
    document.querySelectorAll('[data-av="suyo"]').forEach((el) => el.classList.toggle("aqui", otroAqui));
    const h = $("heart");
    h.classList.toggle("suyo", otroTocando);
    h.classList.toggle("latiendo", otroTocando || yoTocando);
    const juntos = otroTocando && yoTocando;
    if (juntos && $("latido-juntos").hidden) { lluvia("💞", 18); vibrar([200, 100, 200, 100, 600]); }
    $("latido-juntos").hidden = !juntos;
    // mientras tu pareja toca su corazón, el tuyo late y vibra con el suyo
    clearInterval(vibraLatido);
    if (otroTocando) { vibrar(PATRON_LATIDO); vibraLatido = setInterval(() => vibrar(PATRON_LATIDO), 1200); }
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
      if (otroAqui && canalVivo) { canalVivo.send({ type: "broadcast", event: "beso", payload: { n } }); return; }
      // si no está en la app, le llega un "te manda un beso" (como mucho uno cada 10 minutos)
      if (pocoDesde("ultimo-beso", 10)) { toast(`Besitos enviados 😘`); return; }
      await sb.from("eventos").insert({ pareja_id: pareja.id, de_usuario: user.id, tipo: "beso" });
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
    if (canalVivo) canalVivo.track({ tocando: true });
    $("heart-tip").textContent = otroAqui ? `${otro.nombre} siente tu latido ahora mismo 💓` : "Mandando tu latido… 💓";
  }
  async function soltarCorazon(cancelado) {
    if (!toque) return;
    const t = toque; toque = null; clearTimeout(t.timer);
    if (!t.largo) { if (!cancelado) mandarBeso(); return; }
    yoTocando = false; renderVivo();
    $("heart-tip").textContent = "Toca el corazón para mandarle besitos · mantenlo para mandar tu latido";
    if (canalVivo) canalVivo.track({ tocando: false });
    // si no estaba en la app, el latido le llega como notificación (como mucho uno cada 10 minutos)
    if (!cancelado && !otroAqui && Date.now() - t.t >= 1500) {
      if (pocoDesde("ultimo-latido", 10)) { toast("Tu latido ya va en camino 💓"); return; }
      const { error } = await sb.from("eventos").insert({ pareja_id: pareja.id, de_usuario: user.id, tipo: "latido" });
      toast(error ? "No se pudo mandar" : `Le mandaste tu latido a ${otro.nombre} 💓`); render();
    }
  }
  corazon.addEventListener("pointerup", () => soltarCorazon(false));
  corazon.addEventListener("pointerleave", () => soltarCorazon(false));
  corazon.addEventListener("pointercancel", () => soltarCorazon(true));
  corazon.addEventListener("contextmenu", (e) => e.preventDefault());
  corazon.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); mandarBeso(); } });

  // ---------- notita en la nevera ----------
  let notitaColor = "amarillo", notitaSuya = null, misNotitas = 0;
  async function cargarNotitas() {
    const { data } = await sb.from("notitas").select("*").eq("pareja_id", pareja.id).is("despegada_en", null).order("creado_en", { ascending: false });
    const suyas = (data || []).filter((n) => n.de_usuario === otro.id);
    misNotitas = (data || []).filter((n) => n.de_usuario === user.id).length;
    notitaSuya = suyas[0] || null;
    const box = $("notita-suya"); box.hidden = !notitaSuya;
    if (notitaSuya) {
      box.className = "notita " + notitaSuya.color;
      $("notita-de").textContent = `De ${otro.nombre} · ${ago(notitaSuya.creado_en)}` + (suyas.length > 1 ? ` · ${suyas.length - 1} más debajo` : "");
      $("notita-texto").textContent = notitaSuya.texto;
    }
  }
  $("notita-guardar").addEventListener("click", async () => {
    if (!notitaSuya) return;
    const { error } = await sb.rpc("despegar_notita", { p_id: notitaSuya.id });
    if (error) { toast("No se pudo guardar"); return; }
    lluvia("💛", 12); toast("Guardada en tu corazón 💗"); cargarNotitas();
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
    const { data } = await sb.from("canciones").select("*").eq("pareja_id", pareja.id).order("creado_en", { ascending: false }).limit(60);
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
    const nota = $("cancion-nota-in").value.trim() || null;
    const { error } = await sb.from("canciones").insert({ pareja_id: pareja.id, de_usuario: user.id, titulo, url, nota });
    if (error) { toast("No se pudo dedicar"); return; }
    $("dlg-cancion").close(); lluvia("🎶", 10); toast(`Canción dedicada a ${otro.nombre} 🎶`); cargarCanciones();
  });

  // ---------- dibujos con el dedo ----------
  // Los trazos terminados se guardan en un lienzo aparte; así dibujar no se pone lento.
  const COLORES_DIBUJO = ["#e0457b", "#c9325c", "#ff9ab8", "#f7b500", "#3f9b4a", "#3b82f6", "#7c3aed", "#3a2230", "#ffffff"];
  const GROSORES = [4, 9, 16, 28];
  const lienzoD = $("dibujo-canvas"), ctxD = lienzoD.getContext("2d");
  const baseD = document.createElement("canvas"); baseD.width = lienzoD.width; baseD.height = lienzoD.height;
  const ctxB = baseD.getContext("2d");
  const dib = { color: COLORES_DIBUJO[0], grosor: 9, trazos: [], actual: null };
  function trazar(ctx, t) {
    const p = t.puntos;
    ctx.strokeStyle = t.color; ctx.lineWidth = t.grosor; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y);
    if (p.length === 1) ctx.lineTo(p[0].x + 0.1, p[0].y);
    for (let i = 1; i < p.length - 1; i++) ctx.quadraticCurveTo(p[i].x, p[i].y, (p[i].x + p[i + 1].x) / 2, (p[i].y + p[i + 1].y) / 2);
    if (p.length > 1) ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y);
    ctx.stroke();
  }
  function rehacerBase() {
    ctxB.fillStyle = "#fffafc"; ctxB.fillRect(0, 0, baseD.width, baseD.height);
    dib.trazos.forEach((t) => trazar(ctxB, t));
  }
  function pintarDibujo() { ctxD.drawImage(baseD, 0, 0); if (dib.actual) trazar(ctxD, dib.actual); }
  const puntoD = (e) => { const r = lienzoD.getBoundingClientRect(), k = lienzoD.width / r.width; return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, k }; };
  lienzoD.addEventListener("pointerdown", (e) => {
    lienzoD.setPointerCapture(e.pointerId);
    const p = puntoD(e);
    dib.actual = { color: dib.color, grosor: dib.grosor * p.k, puntos: [{ x: p.x, y: p.y }] }; pintarDibujo();
  });
  lienzoD.addEventListener("pointermove", (e) => {
    if (!dib.actual) return;
    const p = puntoD(e); dib.actual.puntos.push({ x: p.x, y: p.y }); pintarDibujo();
  });
  ["pointerup", "pointercancel"].forEach((tipo) => lienzoD.addEventListener(tipo, () => {
    if (!dib.actual) return;
    dib.trazos.push(dib.actual); trazar(ctxB, dib.actual); dib.actual = null; pintarDibujo();
  }));
  function pintarHerramientas() {
    const c = $("dibujo-colores"), g = $("dibujo-grosores"); c.innerHTML = ""; g.innerHTML = "";
    COLORES_DIBUJO.forEach((col) => {
      const b = document.createElement("button"); b.type = "button"; b.style.background = col;
      b.setAttribute("role", "radio"); b.setAttribute("aria-label", `Color ${col}`); b.setAttribute("aria-checked", String(col === dib.color));
      b.addEventListener("click", () => { dib.color = col; pintarHerramientas(); }); c.append(b);
    });
    GROSORES.forEach((gr) => {
      const b = document.createElement("button"); b.type = "button";
      b.setAttribute("role", "radio"); b.setAttribute("aria-label", `Grosor ${gr}`); b.setAttribute("aria-checked", String(gr === dib.grosor));
      const i = document.createElement("i"); i.style.width = i.style.height = Math.min(24, gr) + "px"; b.append(i);
      b.addEventListener("click", () => { dib.grosor = gr; pintarHerramientas(); }); g.append(b);
    });
  }
  $("btn-dibujo").addEventListener("click", () => {
    $("dibujo-para").textContent = `Un dibujo para ${otro.nombre}`;
    $("dibujo-texto").value = ""; dib.trazos = []; dib.actual = null; rehacerBase(); pintarDibujo();
    pintarHerramientas(); $("dlg-dibujo").showModal();
  });
  $("dibujo-deshacer").addEventListener("click", () => { dib.trazos.pop(); rehacerBase(); pintarDibujo(); });
  $("dibujo-borrar").addEventListener("click", () => {
    if (dib.trazos.length && !confirm("¿Borrar todo el dibujo?")) return;
    dib.trazos = []; rehacerBase(); pintarDibujo();
  });
  $("dibujo-cancelar").addEventListener("click", () => $("dlg-dibujo").close());
  $("dibujo-enviar").addEventListener("click", async () => {
    if (!dib.trazos.length) { toast("Dibuja algo primero 😊"); return; }
    const b = $("dibujo-enviar"); b.disabled = true; b.textContent = "Enviando…";
    const ruta = await subirFoto(await aJpeg(baseD, 0.9), "dibujo");
    const texto = $("dibujo-texto").value.trim() || "✏️ Te hice un dibujo";
    const { error } = ruta ? await sb.from("momentos").insert({ pareja_id: pareja.id, de_usuario: user.id, ruta, texto }) : { error: true };
    b.disabled = false; b.textContent = "Enviar dibujo ✏️";
    if (error) { toast("No se pudo enviar"); return; }
    $("dlg-dibujo").close(); lluvia("✏️", 8); toast(`Dibujo enviado a ${otro.nombre} ✏️`); cargarMomentos();
  });

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
    const { data } = await sb.from("eventos").select("de_usuario, tipo, creado_en").eq("pareja_id", pareja.id).gte("creado_en", hace60).limit(5000);
    const evs = data || [], semana = evs.filter((e) => e.creado_en >= hace7);
    const cuenta = (tipos, quien) => semana.filter((e) => tipos.includes(e.tipo) && (!quien || e.de_usuario === quien)).length;
    const g = $("numeros"); g.innerHTML = "";
    [["😘", "besos", ["beso"]], ["🤗", "abrazos", ["abrazo"]], ["❤️", "te extraño", ["te_extrano"]],
     ["💭", "pienso en ti", ["pensando"]], ["💓", "latidos", ["latido"]], ["💌", "cartas y notitas", ["carta", "notita"]]].forEach(([em, nombre, tipos]) => {
      const d = document.createElement("div"); d.className = "numero";
      const b = document.createElement("b"), s = document.createElement("strong"), sm = document.createElement("small");
      b.textContent = em; b.setAttribute("aria-hidden", "true");
      s.textContent = cuenta(tipos);
      sm.textContent = `${nombre} · tú ${cuenta(tipos, user.id)}, ${otro.nombre} ${cuenta(tipos, otro.id)}`;
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
