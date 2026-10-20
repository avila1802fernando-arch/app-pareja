/* Nosotros — app principal */
(function () {
  const C = window.NOSOTROS_CONFIG;
  const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
  const $ = (id) => document.getElementById(id);

  const S = { login: $("s-login"), pair: $("s-pair"), home: $("s-home") };
  let user = null, perfil = null, pareja = null, otro = null, canal = null, toastTimer = null;

  // ---------- utilidades ----------
  function show(name) { Object.keys(S).forEach((k) => (S[k].hidden = k !== name)); }
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
    const { error } = await sb.from("perfiles").upsert({ id: user.id, nombre });
    if (error) { $("pair-msg").textContent = error.message; return false; }
    perfil = { id: user.id, nombre };
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
    if (canal) sb.removeChannel(canal);
    canal = sb.channel("eventos").on("postgres_changes",
      { event: "INSERT", schema: "public", table: "eventos", filter: `pareja_id=eq.${pareja.id}` },
      (payload) => {
        const ev = payload.new;
        if (ev.de_usuario !== user.id) toast(ev.tipo === "entrada" ? `${otro.nombre} acaba de entrar y te extraña ❤️` : `${otro.nombre} dice: te extraño ❤️`);
        render();
      }
    ).subscribe();
    prepararPush();
  }

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
      a.textContent = e.tipo === "entrada" ? `${quien} entró` : `${quien}: “te extraño”`;
      b.textContent = ago(e.creado_en); li.append(a, b); list.append(li);
    });
  }

  $("btn-extrano").addEventListener("click", async () => {
    const b = $("btn-extrano"); b.disabled = true;
    const { error } = await sb.from("eventos").insert({ pareja_id: pareja.id, de_usuario: user.id, tipo: "te_extrano" });
    toast(error ? "No se pudo enviar" : "Enviado ❤️");
    b.disabled = false; render();
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
