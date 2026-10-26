// Juegos en vivo · lo de la pareja (solo en Nosotros)
// batalla.js y uno.js son los mismos en las dos apps (lo revisa familia/herramientas/paridad.mjs); lo que es solo de
// la pareja vive aquí y sala.js se lo pasa a cada juego con el rival (rival.adaptador y rival.ideas): las partidas
// van por la pareja (batalla_crear, uno_crear), el tiempo real se filtra por pareja_id y "¡Avisarle!" manda una push
// (batalla_avisar, uno_avisar). Los canales se llaman igual que antes, así la presencia sigue andando con la versión
// anterior de la app mientras alguno no la actualice.
(() => {
  "use strict";
  // Ideas de apuesta para los dos
  const IDEAS = [
    "Quien pierde canta una canción en la próxima llamada 🎤",
    "Quien gana elige la película de esta noche 🎬",
    "Quien pierde cocina cuando nos veamos 🍳",
    "Quien pierde da un masaje de 10 minutos cuando nos veamos 💆",
    "Quien pierde escribe una carta de amor 💌",
    "Quien pierde manda una foto chistosa 🤪",
  ];
  const conError = (r) => { if (r.error) throw r.error; return r.data; };
  const fila = (d) => (d && d.id ? d : null); // una función que no encuentra nada devuelve una fila vacía

  // El canal de la pareja para un juego: sus filas (filtradas por pareja), lo que se juega en ellas (sin filtro: RLS
  // solo deja pasar lo de nuestras partidas; el juego descarta lo que no es de la que tiene abierta) y quién tiene la
  // mesa abierta (cada uno se anota con track mientras la mira)
  function canalPareja(sb, yoId, parejaId, nombre, tabla, tipo, tablaJugadas, tipoJugadas) {
    const oyentes = new Set();
    const emitir = (t, f) => oyentes.forEach((fn) => fn(t, f));
    let canal = null, viendo = false;
    function abrir() {
      if (canal) sb.removeChannel(canal);
      const c = sb.channel(`${nombre}-${parejaId}`, { config: { presence: { key: yoId } } });
      canal = c;
      c.on("postgres_changes", { event: "*", schema: "public", table: tabla, filter: `pareja_id=eq.${parejaId}` },
        (p) => { if (p.new && p.new.id) emitir(tipo, p.new); })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: tablaJugadas },
          (p) => { if (p.new && p.new.id) emitir(tipoJugadas, p.new); })
        .on("presence", { event: "sync" }, () => {
          const st = c.presenceState();
          emitir("presencia", Object.keys(st).some((k) => k !== yoId && st[k].length > 0));
        })
        .subscribe((estado) => { if (estado === "SUBSCRIBED" && viendo) c.track({ viendo: true }).catch(() => {}); });
    }
    return {
      escuchar(fn) { oyentes.add(fn); if (!canal) abrir(); return () => oyentes.delete(fn); },
      reabrir() { if (!canal || canal.state === "closed" || canal.state === "errored") abrir(); },
      presencia(si) {
        if (viendo === si) return;
        viendo = si;
        if (canal && canal.state === "joined") (si ? canal.track({ viendo: true }) : canal.untrack()).catch(() => {});
      },
      apagar() { if (canal) sb.removeChannel(canal); canal = null; oyentes.clear(); },
    };
  }

  // Batalla naval (la forma que espera batalla.js)
  function batalla(sb, yoId, parejaId) {
    return Object.assign(canalPareja(sb, yoId, parejaId, "batalla", "batallas", "batalla", "batalla_disparos", "disparo"), {
      modo: "vivo",
      async activa() {
        return conError(await sb.from("batallas").select("*").eq("pareja_id", parejaId).in("estado", ["colocando", "jugando"])
          .order("creado_en", { ascending: false }).limit(1))[0] || null;
      },
      async historial() {
        return conError(await sb.from("batallas").select("id, estado, creado_por, rival, ganador, rendido, apuesta, creado_en, actualizado_en")
          .eq("pareja_id", parejaId).eq("estado", "terminada").order("actualizado_en", { ascending: false }).limit(300)) || [];
      },
      async crear(apuesta) { return fila(conError(await sb.rpc("batalla_crear", { p_apuesta: apuesta || null }))); },
      async colocar(id, barcos) { return fila(conError(await sb.rpc("batalla_colocar", { p_id: id, p_barcos: barcos }))); },
      async disparar(id, celda) { return fila(conError(await sb.rpc("batalla_disparar", { p_id: id, p_celda: celda }))); },
      async rendirse(id) { return fila(conError(await sb.rpc("batalla_rendirse", { p_id: id }))); },
      async miFlota(id) {
        const d = conError(await sb.from("batalla_flotas").select("barcos").eq("batalla_id", id).eq("usuario_id", yoId).maybeSingle());
        return d ? d.barcos : null;
      },
      async flotaRival(id) { return conError(await sb.rpc("batalla_flota_rival", { p_id: id })) || null; },
      async disparos(id) { return conError(await sb.from("batalla_disparos").select("*").eq("batalla_id", id).order("id")) || []; },
      async avisar(id) { return conError(await sb.rpc("batalla_avisar", { p_id: id })) === true; },
    });
  }

  // UNO (la forma que espera uno.js)
  function uno(sb, yoId, parejaId) {
    const rpc = async (nombre, args) => conError(await sb.rpc(nombre, args));
    return Object.assign(canalPareja(sb, yoId, parejaId, "uno", "unos", "uno", "uno_jugadas", "jugada"), {
      modo: "vivo",
      async activa() {
        return conError(await sb.from("unos").select("*").eq("pareja_id", parejaId).eq("estado", "jugando")
          .order("creado_en", { ascending: false }).limit(1))[0] || null;
      },
      async historial() {
        return conError(await sb.from("unos").select("id, estado, creado_por, rival, ganador, puntos, rendido, apuesta, creado_en, actualizado_en")
          .eq("pareja_id", parejaId).eq("estado", "terminada").order("actualizado_en", { ascending: false }).limit(300)) || [];
      },
      async crear(apuesta) { return fila(await rpc("uno_crear", { p_apuesta: apuesta || null })); },
      async jugar(id, carta, color) { return (await rpc("uno_jugar", { p_id: id, p_carta: carta, p_color: color || null })) || null; },
      async robar(id) { return (await rpc("uno_robar", { p_id: id })) || null; },
      async pasar(id) { return (await rpc("uno_pasar", { p_id: id })) || null; },
      async decir(id) { return fila(await rpc("uno_decir", { p_id: id })); },
      async pillar(id) { return fila(await rpc("uno_pillar", { p_id: id })); },
      async rendirse(id) { return fila(await rpc("uno_rendirse", { p_id: id })); },
      async miMano(id) {
        const d = conError(await sb.from("uno_manos").select("cartas, robada").eq("juego_id", id).eq("usuario_id", yoId).maybeSingle());
        return d ? { cartas: d.cartas || [], robada: d.robada || null } : null;
      },
      async manoRival(id) { return (await rpc("uno_mano_rival", { p_id: id })) || null; },
      async avisar(id) { return (await rpc("uno_avisar", { p_id: id })) === true; },
    });
  }

  window.VivoPareja = { IDEAS, batalla, uno };
})();
