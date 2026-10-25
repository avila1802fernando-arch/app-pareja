// Recreo · ranking
// La pestaña Ranking (medallero, una tabla por juego y las últimas partidas, «de siempre» o «de hoy») y la tarjeta
// «Mientras no estabas» de la pestaña Juegos. Todo sale de RecreoDatos; se repinta con "recreo:datos".
(() => {
  "use strict";
  const D = window.RecreoDatos;
  const $ = (id) => document.getElementById(id);
  let cuando = "siempre", dentro = false;
  const MEDALLA = ["", "🥇", "🥈", "🥉"];

  function nodo(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function avatar(p, extra) {
    const a = nodo("span", `av c-${p.color}${extra ? " " + extra : ""}`, p.avatar);
    a.setAttribute("aria-hidden", "true");
    return a;
  }
  const juegos = () => (window.RecreoJuegos ? window.RecreoJuegos.juegos() : []);
  const yoId = () => D.usuarioId();
  const ago = (iso) => (window.recreo && window.recreo.ago ? window.recreo.ago(iso) : "");

  // ---------- medallero ----------
  function pintarMedallero() {
    const caja = $("medallero"), hoy = cuando === "hoy";
    caja.innerHTML = "";
    caja.append(nodo("p", "ojo", hoy ? "Medallero de hoy · los cuatro juegos" : "Medallero · los cuatro juegos"));
    const filas = D.medallero({ hoy }), conMedalla = filas.filter((f) => f.oro + f.plata + f.bronce > 0);
    if (!conMedalla.length) {
      caja.append(nodo("p", "vacio", hoy ? "Hoy todavía nadie juega. ¡Estrena el día!" : "Todavía nadie tiene medallas. ¡A jugar!"));
      return;
    }
    const texto = (f) => [["🥇", f.oro], ["🥈", f.plata], ["🥉", f.bronce]].filter(([, n]) => n).map(([m, n]) => m + n).join(" ");
    const podio = nodo("div", "podio");
    [[1, "e2"], [0, "e1"], [2, "e3"]].forEach(([i, esc]) => {
      const f = conMedalla[i], col = nodo("div", "col");
      if (f) {
        if (i === 0) col.insertAdjacentHTML("beforeend", '<svg class="corona" viewBox="0 0 24 24" aria-hidden="true" style="width:28px;height:28px;margin-bottom:-4px"><path d="M3.5 8.5 8 12l4-6.5 4 6.5 4.5-3.5-1.8 9.5H5.3L3.5 8.5Z"/></svg>');
        col.append(avatar(f.persona, "g"), nodo("b", null, f.persona.usuario_id === yoId() ? `${f.persona.nombre} (tú)` : f.persona.nombre), nodo("span", "medallas", texto(f)));
        col.setAttribute("aria-label", `${i + 1}º lugar: ${f.persona.nombre}, ${f.oro} oros, ${f.plata} platas, ${f.bronce} bronces`);
      }
      col.append(nodo("div", `escalon ${esc}`, f ? String(i + 1) : ""));
      podio.append(col);
    });
    caja.append(podio);
    const resto = filas.slice(3);
    if (resto.length) {
      const ul = nodo("ul", "filas");
      ul.style.marginTop = "10px";
      resto.forEach((f, i) => {
        const li = nodo("li", `fila c-${f.persona.color}${f.persona.usuario_id === yoId() ? " yo" : ""}`);
        const t = nodo("span"); t.append(nodo("b", null, f.persona.nombre), nodo("small", null, texto(f) || "sin medallas todavía"));
        li.append(nodo("span", "puesto", String(4 + i)), avatar(f.persona), t, nodo("span"));
        ul.append(li);
      });
      caja.append(ul);
    }
  }

  // ---------- una tabla por juego ----------
  function pintarTablas() {
    const caja = $("tablas"), hoy = cuando === "hoy";
    caja.innerHTML = "";
    juegos().forEach((j) => {
      const sec = nodo("section", "tarjeta bloque");
      sec.setAttribute("aria-label", `Ranking de ${j.nombre}`);
      const tit = nodo("div", "bloque-titulo"), arte = nodo("span", `arte arte-${j.id} sticker`);
      arte.style.display = "grid"; arte.style.placeItems = "center";
      arte.append(nodo("span", "emo", j.emoji || "🎮"));
      arte.setAttribute("aria-hidden", "true");
      tit.append(arte, nodo("h2", null, j.nombre));
      const ul = nodo("ul", "filas");
      D.tabla(j.id, { hoy }).forEach((f) => {
        const soy = f.persona.usuario_id === yoId();
        const li = nodo("li", `fila c-${f.persona.color}${soy ? " yo" : ""}${f.marca == null ? " sin" : ""}`);
        const p = nodo("span", `puesto${f.puesto && f.puesto <= 3 ? " p" + f.puesto : ""}${f.puesto ? "" : " nada"}`, f.puesto ? String(f.puesto) : "–");
        const t = nodo("span"), b = nodo("b", null, f.persona.nombre);
        if (soy) b.append(nodo("span", "etiqueta-yo", "Tú"));
        const detalle = f.marca == null ? (hoy ? "hoy todavía no juega" : "todavía no juega")
          : `${f.partidas} ${f.partidas === 1 ? "partida" : "partidas"}${f.ultima ? " · " + ago(f.ultima) : ""}`;
        t.append(b, nodo("small", null, detalle));
        li.append(p, avatar(f.persona), t, nodo("span", "pts", f.marca == null ? "" : j.marca(f.marca)));
        li.setAttribute("aria-label", `${f.puesto ? f.puesto + "º" : "Sin puesto"}: ${f.persona.nombre}${soy ? " (tú)" : ""}, ${f.marca == null ? "todavía no juega" : j.marca(f.marca)}`);
        ul.append(li);
      });
      sec.append(tit, ul);
      caja.append(sec);
    });
  }

  // ---------- últimas partidas ----------
  function pintarRecientes() {
    const ul = $("recientes");
    ul.innerHTML = "";
    const lista = D.actividad().filter((a) => window.RecreoJuegos && window.RecreoJuegos.juego(a.juego)).slice(0, 8);
    if (!lista.length) { ul.append(nodo("li", "vacio", "Aquí aparecerán las partidas de todos 🎮")); return; }
    lista.forEach((a) => {
      const p = D.miembro(a.usuario_id), j = window.RecreoJuegos.juego(a.juego);
      if (!p) return;
      const mejor = (D.tabla(a.juego).find((f) => f.persona.usuario_id === a.usuario_id) || {}).marca;
      const li = nodo("li");
      li.append(nodo("span", null, `${p.avatar} ${a.usuario_id === yoId() ? "Tú" : p.nombre} · ${j.nombre}: ${j.marca(a.puntos)}${mejor === a.puntos ? " 🏆" : ""}`), nodo("span", null, ago(a.creado_en)));
      ul.append(li);
    });
  }

  // ---------- mientras no estabas ----------
  function pintarNovedades() {
    const caja = $("novedades"), lista = D.novedades(), b = document.querySelector('#tabs button[data-tab="ranking"]');
    if (b) {
      b.classList.toggle("punto", !!lista.length);
      b.setAttribute("aria-label", lista.length ? "Ranking: hay novedades" : "Ranking");
    }
    caja.hidden = !lista.length;
    caja.innerHTML = "";
    if (!lista.length) return;
    const t = nodo("p", "ojo", "Mientras no estabas"); t.id = "novedades-titulo";
    const ul = nodo("ul");
    lista.forEach((n) => {
      const j = window.RecreoJuegos && window.RecreoJuegos.juego(n.juego);
      if (!j) return;
      const corto = j.nombre;
      const txt = n.tipo === "supero" ? ["😮", `${n.persona.nombre} te pasó en ${corto}: ${j.marca(n.marca)}`]
        : n.tipo === "primero" ? ["👑", `${n.persona.nombre} es primer lugar en ${corto}`]
        : ["🎮", `${n.persona.nombre} mejoró su marca en ${corto}: ${j.marca(n.marca)}`];
      const li = nodo("li");
      li.append(nodo("span", "emo", txt[0]), nodo("span", null, txt[1]));
      ul.append(li);
    });
    const ver = nodo("button", "enlace", "Ver el ranking"); ver.type = "button";
    ver.addEventListener("click", () => window.recreo.irA("ranking"));
    const cerrar = nodo("button", "cerrar"); cerrar.type = "button"; cerrar.setAttribute("aria-label", "Ya lo vi");
    cerrar.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-cerrar"/></svg>';
    cerrar.addEventListener("click", () => { D.marcarVisto(); pintarNovedades(); });
    caja.append(t, ul, ver, cerrar);
  }

  function pintar() {
    if (!dentro) return;
    pintarNovedades();
    if ($("tab-ranking").hidden) return;
    pintarMedallero(); pintarTablas(); pintarRecientes();
  }
  document.querySelectorAll("#tab-ranking [data-cuando]").forEach((b) => b.addEventListener("click", () => {
    cuando = b.dataset.cuando;
    document.querySelectorAll("#tab-ranking [data-cuando]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    pintar();
  }));
  window.addEventListener("recreo:dentro", () => { dentro = true; pintar(); });
  window.addEventListener("recreo:datos", pintar);
  window.addEventListener("recreo:aldia", pintar);
  // al abrir el Ranking, lo nuevo queda visto
  window.addEventListener("recreo:tab", (e) => {
    if (e.detail !== "ranking") return;
    pintarMedallero(); pintarTablas(); pintarRecientes();
    D.marcarVisto(); pintarNovedades();
  });
})();
