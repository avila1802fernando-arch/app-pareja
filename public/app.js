/* Nosotros — app principal */
(function () {
  const C = window.NOSOTROS_CONFIG;
  const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
  const $ = (id) => document.getElementById(id);

  const HORAS_LIBRE = 2; // "Estoy libre para hablar" se apaga solo después de estas horas

  const S = { login: $("s-login"), pair: $("s-pair"), home: $("s-home") };
  let user = null, perfil = null, pareja = null, otro = null, canal = null, toastTimer = null;

  // ---------- utilidades ----------
  function show(name) { Object.keys(S).forEach((k) => (S[k].hidden = k !== name)); }
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
    $("home-title").innerHTML = "";
    $("home-title").append(otro.nombre + " ");
    const em = document.createElement("em"); em.textContent = "te extraña"; $("home-title").append(em, ".");
    $("heart").classList.add("beat");

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
    ).subscribe();
    prepararPush();
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

  // ---------- notificaciones push ----------
  function b64ToU8(s) {
    const pad = "=".repeat((4 - (s.length % 4)) % 4);
    const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }
  async function prepararPush() {
    if (!("PushManager" in window) || !("Notification" in window)) {
      if (isIOS && !isStandalone) $("ios-hint").hidden = false;
      return;
    }
    if (isIOS && !isStandalone) { $("ios-hint").hidden = false; return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub && Notification.permission === "granted") { await guardarSub(sub); return; }
    if (Notification.permission === "denied") return;
    $("btn-push").hidden = false;
  }
  $("btn-push").addEventListener("click", async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast("Sin permiso para notificar"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(C.VAPID_PUBLIC_KEY) });
      await guardarSub(sub);
      $("btn-push").hidden = true; toast("Notificaciones activadas ❤️");
    } catch (e) { toast("No se pudo activar: " + e.message); }
  });
  async function guardarSub(sub) {
    const j = sub.toJSON();
    await sb.from("push_subs").upsert(
      { usuario_id: user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth },
      { onConflict: "endpoint" }
    );
  }
})();
