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

  // ---------- login con código por correo ----------
  $("f-email").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("email").value.trim();
    $("login-msg").textContent = "Enviando…";
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) { $("login-msg").textContent = "No se pudo enviar: " + error.message; return; }
    $("login-msg").textContent = "Revisa tu correo (también la carpeta de spam).";
    $("f-email").hidden = true; $("f-otp").hidden = false; $("otp").focus();
  });
  $("f-otp").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("email").value.trim(), token = $("otp").value.trim();
    const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
    if (error) { $("login-msg").textContent = "Código incorrecto o vencido."; return; }
    $("login-msg").textContent = "";
  });
  $("otp-back").addEventListener("click", () => { $("f-email").hidden = false; $("f-otp").hidden = true; });
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
      $("nombre").value = (perfil && perfil.nombre) || "";
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
    await render();
    await cargarDispo();
    if (canal) sb.removeChannel(canal);
    canal = sb.channel("pareja").on("postgres_changes",
      { event: "INSERT", schema: "public", table: "eventos", filter: `pareja_id=eq.${pareja.id}` },
      (payload) => {
        const ev = payload.new;
        if (ev.de_usuario !== user.id) toast((AVISOS[ev.tipo] || AVISOS.te_extrano)(otro.nombre));
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
      // si mi pareja cambia su nombre o su zona horaria, lo vemos al instante
      { event: "UPDATE", schema: "public", table: "perfiles", filter: `id=eq.${otro.id}` },
      (payload) => { otro = { ...otro, ...payload.new }; tituloHome(); render(); renderDispo(); }
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
      }
    ).subscribe();
    prepararPush();
  }

  function tituloHome() {
    $("home-title").innerHTML = "";
    $("home-title").append(otro.nombre + " ");
    const em = document.createElement("em"); em.textContent = "te extraña"; $("home-title").append(em, ".");
  }

  const AVISOS = {
    entrada: (n) => `${n} acaba de entrar y te extraña ❤️`,
    te_extrano: (n) => `${n} dice: te extraño ❤️`,
    libre: (n) => `${n} está libre para hablar ☎️`,
  };
  const SENALES = {
    entrada: (n) => `${n} entró`,
    te_extrano: (n) => `${n}: “te extraño”`,
    libre: (n) => `${n} se puso libre para hablar`,
  };

  async function render() {
    const { data: evs } = await sb.from("eventos").select("*").eq("pareja_id", pareja.id)
      .order("creado_en", { ascending: false }).limit(12);
    const suyos = (evs || []).filter((e) => e.de_usuario !== user.id);
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

  // ---------- navegación por pestañas ----------
  const TABS = ["inicio", "horarios", "calendario", "ajustes"];
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
    $("aj-pareja").textContent = `Vinculado con ${otro.nombre} · su zona: ${nombreTz(suTz())} (ahora son las ${hora(new Date(), suTz())})`;
  }
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
  const fechaLarga = (k) => new Date(k + "T00:00:00Z").toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

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
    $("dlg-evento").close(); toast(editando ? "Cambiado ❤️" : "Agendado ❤️"); cargarCal();
  });
  $("ev-borrar").addEventListener("click", async () => {
    if (!editando || !confirm("¿Borrar este evento?")) return;
    // Primero un toque (el trigger anota quién borra, para avisar solo al otro) y luego se borra
    await sb.from("eventos_cal").update({ actualizado_en: new Date().toISOString() }).eq("id", editando.id);
    const { error } = await sb.from("eventos_cal").delete().eq("id", editando.id);
    if (error) { toast("No se pudo borrar"); return; }
    $("dlg-evento").close(); toast("Borrado"); cargarCal();
  });

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
