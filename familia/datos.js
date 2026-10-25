// Recreo · datos: la única puerta a la base.
// Personas (familia_miembros), ranking (ranking_familia), últimas partidas (actividad_familia), guardar partidas
// (familia_partidas, con una cola si no hay señal) y el tiempo real. En modo prueba no hay Supabase: todo vive en
// memoria con los datos de la maqueta. Avisa los cambios con el evento "recreo:datos".
(() => {
  "use strict";
  const JUEGOS = ["lluvia", "vuelo", "memoria", "fusion"];
  let sb = null, user = null, prueba = false, canal = null;
  let miembros = [];     // { usuario_id, nombre, avatar, color, creado_en, actualizado_en }
  let marcador = {};     // juego → usuario_id → { mejor, partidas, hoy, ultima }
  let actividad = [];    // { usuario_id, juego, puntos, creado_en }
  let sinRed = false;
  let ultimoError = "";  // lo último que respondió mal la base (para mostrarlo en pantalla)

  const R = () => window.recreo || {};
  // x, o el valor de respaldo si x no existe. (Sin "??": los navegadores de algunos teléfonos, como el de un Nubia
  // de Eli, son anteriores a Chrome 80 y no lo entienden: el archivo entero dejaba de cargar.)
  const siNulo = (x, respaldo) => (x == null ? respaldo : x);
  const leer = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
  const anotar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const avisar = () => window.dispatchEvent(new Event("recreo:datos"));
  const uid = () => (user ? user.id : null);
  const desdeHoy = () => {
    try { return R().aIso(R().diaHoy() + "T00:00", R().tz); } catch (e) { return new Date(Date.now() - 86400000).toISOString(); }
  };
  const esDeHoy = (iso) => { try { return R().claveDia(iso, R().tz) === R().diaHoy(); } catch (e) { return false; } };

  // ---------- el marcador ----------
  function armar(filas) {
    marcador = {};
    (filas || []).forEach((f) => {
      (marcador[f.juego] = marcador[f.juego] || {})[f.usuario_id] = { mejor: f.mejor, partidas: f.partidas, hoy: f.mejor_hoy, ultima: f.ultima };
    });
  }
  function filasDelMarcador() {
    const filas = [];
    Object.entries(marcador).forEach(([juego, m]) => Object.entries(m).forEach(([id, r]) =>
      filas.push({ juego, usuario_id: id, mejor: r.mejor, partidas: r.partidas, mejor_hoy: r.hoy, ultima: r.ultima })));
    return filas;
  }
  function sumar(id, juego, puntos, iso) {
    const m = (marcador[juego] = marcador[juego] || {});
    const r = (m[id] = m[id] || { mejor: null, partidas: 0, hoy: null, ultima: null });
    r.mejor = r.mejor == null ? puntos : Math.max(r.mejor, puntos);
    r.partidas++;
    if (esDeHoy(iso)) r.hoy = r.hoy == null ? puntos : Math.max(r.hoy, puntos);
    r.ultima = iso;
    actividad = [{ usuario_id: id, juego, puntos, creado_en: iso }, ...actividad].slice(0, 30);
  }

  // ---------- cargar ----------
  const claveCache = () => `recreo-cache-${uid()}`;
  function guardarCache() { anotar(claveCache(), { miembros, filas: filasDelMarcador(), actividad, en: new Date().toISOString() }); }
  function usarCache() {
    const c = leer(claveCache());
    if (!c || miembros.length) return;
    miembros = c.miembros || []; armar(c.filas); actividad = c.actividad || [];
  }
  async function recargar() {
    if (prueba) { avisar(); return true; }
    if (!sb || !user) return false;
    const [m, r, a] = await Promise.all([
      sb.from("familia_miembros").select("*").order("creado_en"),
      sb.rpc("ranking_familia", { p_desde: desdeHoy() }),
      sb.rpc("actividad_familia", { p_limite: 20 }),
    ]);
    if (m.error || r.error || a.error) { sinRed = true; usarCache(); avisar(); return false; }
    sinRed = false;
    miembros = m.data || []; armar(r.data); actividad = a.data || [];
    guardarCache(); avisar();
    return true;
  }

  // ---------- tiempo real ----------
  function suscribir() {
    if (prueba || !sb) return;
    if (canal) sb.removeChannel(canal);
    canal = sb.channel("recreo")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "familia_partidas" }, (p) => {
        const f = p.new;
        if (!f || f.usuario_id === uid()) return; // las mías ya se sumaron al guardarlas
        sumar(f.usuario_id, f.juego, f.puntos, f.creado_en);
        const quien = miembro(f.usuario_id), def = window.RecreoJuegos && window.RecreoJuegos.juego(f.juego);
        if (quien && def && R().toast) R().toast(`🎮 ${quien.nombre} acaba de hacer ${def.marca(f.puntos)} en ${def.nombre}`);
        avisar();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "familia_miembros" }, (p) => {
        const f = p.new;
        if (!f || !f.usuario_id) return;
        const i = miembros.findIndex((x) => x.usuario_id === f.usuario_id);
        if (i >= 0) miembros[i] = { ...miembros[i], ...f }; else miembros.push(f);
        avisar();
      })
      .subscribe();
  }
  const canalCaido = () => !prueba && (!canal || canal.state === "closed" || canal.state === "errored");

  // ---------- guardar (con cola si no hay señal) ----------
  const clavePendientes = () => `recreo-pendientes-${uid()}`;
  async function guardar(juego, puntos, detalle) {
    const ahora = new Date().toISOString();
    sumar(uid(), juego, puntos, ahora);
    avisar();
    if (prueba) return true;
    const { error } = await sb.from("familia_partidas").insert({ usuario_id: uid(), juego, puntos, detalle: detalle || null });
    if (!error) return true;
    const cola = leer(clavePendientes()) || [];
    cola.push({ juego, puntos, detalle: detalle || null });
    anotar(clavePendientes(), cola.slice(-50));
    return false;
  }
  let reintentando = false;
  async function reintentar() {
    if (prueba || !sb || !user || reintentando) return;
    const cola = leer(clavePendientes()) || [];
    if (!cola.length) return;
    reintentando = true;
    const quedan = [];
    for (const p of cola) {
      const { error } = await sb.from("familia_partidas").insert({ usuario_id: uid(), ...p });
      if (error) quedan.push(p);
    }
    anotar(clavePendientes(), quedan);
    reintentando = false;
    if (quedan.length < cola.length && R().toast) R().toast("Se guardaron las partidas que estaban pendientes ✓");
  }

  // ---------- personas ----------
  function miembro(id) { return miembros.find((m) => m.usuario_id === id) || null; }
  const yo = () => miembro(uid());
  // Entrar al Recreo (la primera vez crea mi fila). En modo prueba, op = { prueba, quien, nuevo }.
  async function entrar(op = {}) {
    if (op.prueba) { prueba = true; datosDePrueba(op.quien || "eli", op.nuevo); return yo(); }
    if (op.sb) { sb = op.sb; user = op.user; }
    if (prueba) return yo();
    const { data, error } = await sb.rpc("entrar_familia");
    if (error) throw error;
    const fila = Array.isArray(data) ? data[0] : data;
    if (!fila || !fila.usuario_id) return null;
    const i = miembros.findIndex((x) => x.usuario_id === fila.usuario_id);
    if (i >= 0) miembros[i] = fila; else miembros.push(fila);
    return fila;
  }
  async function editarMiembro({ nombre = null, avatar = null, color = null }) {
    if (prueba) {
      const m = yo();
      Object.assign(m, nombre ? { nombre } : {}, avatar ? { avatar } : {}, color ? { color } : {}, { actualizado_en: new Date().toISOString() });
      avisar(); return m;
    }
    let data = null, error = null;
    try { ({ data, error } = await sb.rpc("editar_familia", { p_nombre: nombre, p_avatar: avatar, p_color: color })); }
    catch (e) { error = e; }
    const fila = Array.isArray(data) ? data[0] : data;
    ultimoError = error ? String(error.message || error.code || error) : !fila || !fila.usuario_id ? "sin respuesta" : "";
    if (ultimoError) return null;
    const i = miembros.findIndex((x) => x.usuario_id === fila.usuario_id);
    if (i >= 0) miembros[i] = fila;
    avisar(); return fila;
  }

  // ---------- consultas para las pantallas ----------
  const ordenNombre = (a, b) => a.nombre.localeCompare(b.nombre, "es");
  // Todas las personas en un juego, de mayor a menor. Empate = mismo puesto; sin partidas = sin puesto, al final.
  function tabla(juego, { hoy = false } = {}) {
    const m = marcador[juego] || {};
    const filas = miembros.map((p) => {
      const r = m[p.usuario_id] || {};
      return { persona: p, marca: siNulo(hoy ? r.hoy : r.mejor, null), partidas: r.partidas || 0, ultima: r.ultima || null };
    });
    filas.forEach((f) => { f.puesto = f.marca == null ? null : 1 + filas.filter((x) => x.marca != null && x.marca > f.marca).length; });
    return filas.sort((a, b) => siNulo(b.marca, -1) - siNulo(a.marca, -1) || ordenNombre(a.persona, b.persona));
  }
  function medallero({ hoy = false } = {}) {
    const cuenta = new Map(miembros.map((p) => [p.usuario_id, { persona: p, oro: 0, plata: 0, bronce: 0 }]));
    JUEGOS.forEach((j) => tabla(j, { hoy }).forEach((f) => {
      const c = cuenta.get(f.persona.usuario_id);
      if (f.puesto === 1) c.oro++; else if (f.puesto === 2) c.plata++; else if (f.puesto === 3) c.bronce++;
    }));
    return [...cuenta.values()].sort((a, b) => b.oro - a.oro || b.plata - a.plata || b.bronce - a.bronce || ordenNombre(a.persona, b.persona));
  }
  // Las marcas de los demás en un juego, de menor a mayor (la "siguiente meta" dentro del juego)
  function metas(juego) {
    const m = marcador[juego] || {};
    return miembros.filter((p) => p.usuario_id !== uid() && m[p.usuario_id] && m[p.usuario_id].mejor != null)
      .map((p) => ({ ...p, mejor: m[p.usuario_id].mejor })).sort((a, b) => a.mejor - b.mejor);
  }
  function mio(juego) {
    const r = (marcador[juego] || {})[uid()] || {};
    return { mejor: siNulo(r.mejor, null), hoy: siNulo(r.hoy, null), partidas: r.partidas || 0 };
  }

  // ---------- mientras no estabas ----------
  const claveVisto = () => `recreo-visto-${uid()}`;
  const mejores = () => {
    const o = {};
    JUEGOS.forEach((j) => { o[j] = {}; Object.entries(marcador[j] || {}).forEach(([id, r]) => { if (r.mejor != null) o[j][id] = r.mejor; }); });
    return o;
  };
  function novedades() {
    const visto = leer(claveVisto());
    if (!visto) { marcarVisto(); return []; } // la primera vez no hay "antes"
    const lista = [];
    JUEGOS.forEach((j) => {
      const t = tabla(j), yoAhora = (marcador[j] || {})[uid()];
      const miMarca = yoAhora ? yoAhora.mejor : null;
      t.forEach((f) => {
        const id = f.persona.usuario_id, antes = siNulo((visto[j] || {})[id], null);
        if (id === uid() || f.marca == null || (antes != null && f.marca <= antes)) return;
        const meSupero = miMarca != null && f.marca > miMarca && (antes == null || antes <= miMarca);
        const primero = f.puesto === 1;
        lista.push({ juego: j, persona: f.persona, marca: f.marca, tipo: meSupero ? "supero" : primero ? "primero" : "mejoro" });
      });
    });
    const orden = { supero: 0, primero: 1, mejoro: 2 };
    return lista.sort((a, b) => orden[a.tipo] - orden[b.tipo]).slice(0, 3);
  }
  function marcarVisto() { if (uid()) anotar(claveVisto(), mejores()); }

  // ---------- modo prueba: los datos de la maqueta ----------
  function datosDePrueba(quien, nuevo) {
    const hace = (h) => new Date(Date.now() - h * 3600000).toISOString();
    miembros = [
      { usuario_id: "eli", nombre: "Eli", avatar: "🦋", color: "uva" },
      { usuario_id: "maritza", nombre: "Maritza", avatar: "🌺", color: "coral" },
      { usuario_id: "fernando", nombre: "Fernando", avatar: "🦊", color: "azul" },
      { usuario_id: "martina", nombre: "Martina", avatar: "🐧", color: "menta" },
    ].map((m) => ({ ...m, creado_en: hace(200), actualizado_en: hace(100) }));
    const p = (id, juego, puntos, h) => ({ usuario_id: id, juego, puntos, creado_en: hace(h) });
    const partidas = [
      p("martina", "lluvia", 2340, 30), p("fernando", "lluvia", 2100, 50), p("eli", "lluvia", 1800, 26), p("maritza", "lluvia", 950, 70),
      p("martina", "vuelo", 3200, 5), p("fernando", "vuelo", 2700, 90), p("maritza", "vuelo", 1400, 3),
      p("maritza", "memoria", 1120, 2), p("eli", "memoria", 980, 24), p("fernando", "memoria", 900, 96), p("martina", "memoria", 640, 150),
      p("fernando", "fusion", 4380, 8), p("eli", "fusion", 2150, 1), p("martina", "fusion", 1960, 40), p("maritza", "fusion", 1200, 1.5),
    ].sort((a, b) => a.creado_en < b.creado_en ? -1 : 1);
    marcador = {}; actividad = [];
    partidas.forEach((x) => sumar(x.usuario_id, x.juego, x.puntos, x.creado_en));
    user = { id: miembros.some((m) => m.usuario_id === quien) ? quien : "eli", email: `${quien}@prueba` };
    if (nuevo) { const m = yo(); m.actualizado_en = m.creado_en; } // para ver "Elige tu personaje"
    // que haya algo en "Mientras no estabas": lo visto antes de que Maritza jugara Memoria
    if (!leer(claveVisto())) { const v = mejores(); v.memoria.maritza = 600; v.vuelo.martina = 2500; anotar(claveVisto(), v); }
  }

  // ---------- arranque ----------
  // Después de entrar(): carga todo y abre el tiempo real
  async function iniciar() {
    if (prueba) { avisar(); return true; }
    const ok = await recargar();
    suscribir();
    reintentar();
    return ok;
  }
  async function alDia() {
    if (prueba) return;
    if (canalCaido()) suscribir();
    await recargar();
    reintentar();
  }

  window.RecreoDatos = {
    JUEGOS, iniciar, recargar, alDia, reintentar, entrar, editarMiembro, guardar,
    yo, miembro, miembros: () => miembros.slice(), tabla, medallero, metas, mio,
    actividad: () => actividad.slice(), novedades, marcarVisto,
    sinRed: () => sinRed, usuarioId: uid, ultimoError: () => ultimoError,
  };
})();
