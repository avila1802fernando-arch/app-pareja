// Juegos en vivo · el canal de tiempo real que se arregla solo (el mismo archivo en las dos apps)
// supabase-js a veces deja un canal muerto sin avisar: si el servidor lo cierra (p. ej. porque venció la sesión con el
// teléfono dormido) no lo vuelve a abrir, y si al volver a unirse le dicen que no, se queda «uniéndose» para siempre.
// Ahí no llegan las jugadas del otro ni se sabe si está mirando. Este canal se abre de nuevo solo, cada vez más
// espaciado, y avisa (alVolver) cada vez que vuelve después de una caída, para que el juego traiga lo que se perdió.
(() => {
  "use strict";
  // armar(c): le pone sus .on(...) a cada canal nuevo; alUnirse(c): quedó unido (p. ej. para anotarse en la presencia)
  function VivoCanal(sb, nombre, opciones, armar, alUnirse, alVolver) {
    let canal = null, desde = 0, estuvo = false, espera = 0, reintento = null, prendido = false;
    const unido = () => !!canal && canal.state === "joined";
    function nuevo() {
      clearTimeout(reintento); reintento = null;
      const viejo = canal;
      canal = null; // (así el CLOSED del viejo no cuenta como caída)
      if (viejo) sb.removeChannel(viejo);
      const c = sb.channel(nombre, opciones);
      canal = c; desde = Date.now();
      armar(c);
      c.subscribe((estado) => {
        if (canal !== c) return; // uno que ya se reemplazó o se apagó
        desde = Date.now();
        if (estado !== "SUBSCRIBED") { programar(); return; } // CHANNEL_ERROR, TIMED_OUT o CLOSED
        espera = 0;
        if (alUnirse) alUnirse(c);
        if (estuvo && alVolver) alVolver();
        estuvo = true;
      });
    }
    // Otro intento en 2 s, después en 4, 8, 16 y cada 30 (si para entonces ya se unió solo, no se hace nada)
    function programar() {
      if (reintento || !prendido) return;
      espera = Math.min(espera ? espera * 2 : 2000, 30000);
      reintento = setTimeout(() => { reintento = null; if (prendido && !unido()) nuevo(); }, espera);
    }
    return {
      get canal() { return canal; },
      unido,
      abrir() { prendido = true; if (!canal) nuevo(); },
      // Por si se cayó sin que se notara: cerrado, o lleva rato sin unirse y no hay otro intento en camino
      revisar() {
        if (!prendido) return;
        if (!canal || canal.state === "closed" || (!unido() && !reintento && Date.now() - desde > 20000)) nuevo();
      },
      apagar() {
        prendido = false; estuvo = false; espera = 0;
        clearTimeout(reintento); reintento = null;
        const viejo = canal;
        canal = null;
        if (viejo) sb.removeChannel(viejo);
      },
    };
  }
  window.VivoCanal = VivoCanal;
})();
