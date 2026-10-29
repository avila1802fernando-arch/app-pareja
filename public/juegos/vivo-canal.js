// Juegos en vivo · el canal de tiempo real que se arregla solo (el mismo archivo en las dos apps)
// supabase-js a veces deja un canal muerto sin avisar: si el servidor lo cierra (p. ej. porque venció la sesión con el
// teléfono dormido) no lo vuelve a abrir, y si al volver a unirse le dicen que no, se queda «uniéndose» para siempre.
// Ahí no llegan las jugadas del otro ni se sabe si está mirando. Este canal se abre de nuevo solo, cada vez más
// espaciado, y avisa (alVolver) cada vez que vuelve después de una caída, para que el juego traiga lo que se perdió.
// La presencia también se cuida: Supabase deja anotarse o borrarse (track/untrack) solo 5 veces cada 30 s por canal,
// y a la sexta CIERRA el canal entero. presencia(estado) guarda lo que quiero que se vea y lo manda cuando se puede:
// junta los cambios seguidos en uno, nunca pasa de 4 cada 31 s y, si no salió, lo intenta de nuevo. Al unirse otra
// vez (el servidor empieza de cero) se anota solo.
(() => {
  "use strict";
  const VENTANA = 31000, MAX_ENVIOS = 4; // (el servidor deja 5 cada 30 s: uno de margen y un segundo por si la red demora)
  // armar(c): le pone sus .on(...) a cada canal nuevo; alUnirse(c): quedó unido
  function VivoCanal(sb, nombre, opciones, armar, alUnirse, alVolver) {
    let canal = null, desde = 0, estuvo = false, espera = 0, reintento = null, prendido = false;
    // la presencia: lo que quiero que se vea (null: nada), lo que tiene el servidor y cuándo se mandó cada cambio
    let quiero = null, puesto = null, envios = [], enCamino = false, pendiente = null;
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
        puesto = null; envios = []; enCamino = false; // (en el servidor es un canal nuevo: sin presencia y la cuenta en cero)
        mandarPresencia();
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
    // Manda la presencia que quiero si es distinta de la que tiene el servidor y queda cupo; si no, espera su turno
    function mandarPresencia() {
      clearTimeout(pendiente); pendiente = null;
      if (!prendido || !unido() || enCamino) return;
      const q = quiero ? JSON.stringify(quiero) : null;
      if (q === puesto) return;
      const ahora = Date.now();
      envios = envios.filter((t) => ahora - t < VENTANA);
      if (envios.length >= MAX_ENVIOS) { pendiente = setTimeout(mandarPresencia, envios[0] + VENTANA - ahora); return; }
      envios.push(ahora); enCamino = true;
      const c = canal, otraVez = () => { if (canal === c) { enCamino = false; pendiente = setTimeout(mandarPresencia, 5000); } };
      (q ? c.track(quiero) : c.untrack()).then((r) => {
        if (canal !== c) return;
        if (r !== "ok") { otraVez(); return; }
        enCamino = false; puesto = q;
        mandarPresencia(); // (por si cambió mientras iba)
      }, otraVez);
    }
    return {
      get canal() { return canal; },
      unido,
      abrir() { prendido = true; if (!canal) nuevo(); },
      // Lo que quiero que el otro vea de mí (null: no figurar). Los cambios seguidos se juntan en uno.
      presencia(estado) {
        quiero = estado || null;
        if (!pendiente) pendiente = setTimeout(mandarPresencia, 250);
      },
      // Por si se cayó sin que se notara: cerrado, o lleva rato sin unirse y no hay otro intento en camino
      revisar() {
        if (!prendido) return;
        if (!canal || canal.state === "closed" || (!unido() && !reintento && Date.now() - desde > 20000)) nuevo();
      },
      apagar() {
        prendido = false; estuvo = false; espera = 0;
        clearTimeout(reintento); reintento = null;
        clearTimeout(pendiente); pendiente = null; quiero = null; puesto = null; envios = []; enCamino = false;
        const viejo = canal;
        canal = null;
        if (viejo) sb.removeChannel(viejo);
      },
    };
  }
  window.VivoCanal = VivoCanal;
})();
