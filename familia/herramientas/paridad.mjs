// Revisión automática del Recreo (va en familia/herramientas/paridad.mjs). Correr desde la raíz del repo:
//   node familia/herramientas/paridad.mjs
// 1. Paridad: cada juego del Recreo conserva, letra por letra, las líneas que fijan el puntaje y la dificultad
//    del juego de Nosotros. Así un récord de Fernando o Martina vale lo mismo que uno de Eli o Maritza.
// 2. Nada romántico: ninguna palabra ni emoji de pareja en lo que se publica (familia/, sin herramientas/).
// 3. Nosotros intacto: ningún archivo de la app principal cambió.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

let fallas = 0;
const ok = (cond, txt) => { console.log(`${cond ? "OK " : "MAL"} ${txt}`); if (!cond) fallas++; };
const leer = (f) => { try { return readFileSync(f, "utf8"); } catch { return null; } };

// ---------- 1. paridad ----------
const PARIDAD = {
  "public/juegos/corazones.js → familia/juegos/lluvia.js": [
    "const GAME_TIME = 90, ESCAPE_LIMIT = 6;",
    "{ at: 0,", "{ at: 15,", "{ at: 30,", "{ at: 45,", "{ at: 60,", "{ at: 75,",
    "score: 0, lives: 3, combo: 0, maxCombo: 0, timeLeft: GAME_TIME, elapsed: 0, level: 1,",
    "spawnAcc: 0, countdown: 3.4,",
    "const mult = () => Math.min(1 + Math.floor(S.combo / 8), 5);",
    "const pBroken = Lv >= 2 ? Math.min(0.2 + 0.05 * (Lv - 2), 0.4) : 0;",
    "const pCupid = Lv >= 3 ? 0.08 : 0, pGold = 0.025, pLetter = 0.02, pFreeze = Lv >= 3 ? 0.02 : 0;",
    "const size = (Lv >= 5 ? 38 : Lv >= 3 ? 42 : 47) * (type === \"gold\" ? 0.9 : 1);",
    "const baseV = (120 + Lv * 44) * (H / 440);",
    "vy: baseV * (0.8 + Math.random() * 0.5) * (type === \"gold\" ? 1.55 : 1),",
    "sway: Lv >= 4 ? 16 + Math.random() * 30 : 0, swayF: 1.6 + Math.random() * 2.2,",
    "ghost: Lv >= 5 && type !== \"cupid\" && Math.random() < 0.55, t: 0,",
    "pts = 10 * m;", "pts = 25 * m;", "pts = 50 * m;", "S.timeLeft += 2;", "S.freezeT = 2.5;",
    "if (S.combo > 0 && S.combo % 8 === 0 && S.combo <= 32)",
    "const MARGEN = 16, RETRASO = 0.1;",
    "const bajo = e.vy * (S.freezeT > 0 ? 0.45 : 1) * RETRASO;",
    "if (d > (roto ? 0 : MARGEN)) return;",
    "S.score = Math.max(0, S.score - 5);",
    "const slow = S.freezeT > 0 ? 0.45 : 1;",
    "let interval = Math.max(0.24, 0.72 - 0.085 * (S.level - 1));",
    "if (S.level >= 6) interval *= 0.85;",
    "const wind = S.level >= 6 ? Math.sin(S.elapsed * 1.1) * 95 : 0;",
    "if (S.escaped % ESCAPE_LIMIT === 0)",
    "if (S.timeLeft <= 0 || S.lives <= 0)",
  ],
  "public/juegos/vuelo.js → familia/juegos/vuelo.js": [
    "const KM_NUBE = 100, KM_CARTA = 50;",
    "let W = L.W, H = L.H, k = H / 640;",
    "const piso = () => H - 30 * k;", "const radio = () => 15 * k;", "const ancho = () => 64 * k;",
    "const px = () => W * 0.3;", "const avance = () => Math.min(1, S.nubes / 40);",
    "const hueco = () => (205 - 60 * avance()) * k;", "const velocidad = () => (150 + 65 * avance()) * k;",
    "const espacio = () => 235 * k;",
    "const h = hueco(), min = 64 * k + h / 2, max = piso() - 24 * k - h / 2;",
    "S.centro + (Math.random() - 0.5) * H * 0.5",
    "if (Math.random() < 0.42) S.sobres.push({ x: x + ancho() + (espacio() - ancho()) / 2, y: c + (Math.random() - 0.5) * h * 0.4,",
    "S.vy = Math.min(S.vy + 1500 * k * dt, 700 * k);",
    "const x = px(), r = radio() * 0.8;",
    "Math.hypot(l.x - x, l.y - S.y) < radio() + 16 * k",
    "if (S.y + r > piso()) { chocar(); return; }",
    "circRect(x, S.y, r, c.x, -60, ancho(), c.c - c.h / 2 + 60) || circRect(x, S.y, r, c.x, c.c + c.h / 2, ancho(), H)",
    "S.vy = -430 * k;",
    "puntos: S.km,",
  ],
  "public/juegos/memoria.js → familia/juegos/memoria.js": [
    "const RONDAS = [{ cols: 3, filas: 4, seg: 45, ver: 1.6 }, { cols: 4, filas: 4, seg: 60, ver: 2.1 }, { cols: 4, filas: 5, seg: 75, ver: 2.6 }, { cols: 4, filas: 6, seg: 90, ver: 3.1 }];",
    "const pts = 100 + 50 * Math.min(S.racha - 1, 9);",
    "S.puntos = Math.max(0, S.puntos - 10);",
    "bono = Math.ceil(S.tiempo) * 15 + (perfecta ? 300 : 0);",
    "S.puntos += 500;",
    "if (pausado || S.fase !== \"juego\") return;",
  ],
  "public/juegos/fusion.js → familia/juegos/fusion.js": [
    "grid[y][x] = crearFicha(Math.random() < 0.9 ? 1 : 2, x, y);",
    "S.puntos += 2 ** o.v;",
    "if (o.v === f.v && !unidas.has(o.id)) {",
    "if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;",
  ],
  "public/juegos/sala.js → familia/juegos/sala.js": [
    "const puntos = Math.max(0, Math.round(res.puntos || 0));",
  ],
};
for (const [par, lineas] of Object.entries(PARIDAD)) {
  const [original, copia] = par.split(" → ");
  const a = leer(original), b = leer(copia);
  if (!b) { ok(false, `${copia} no existe todavía`); continue; }
  const faltan = lineas.filter((l) => a.includes(l) && !b.includes(l));
  const raras = lineas.filter((l) => !a.includes(l));
  ok(!faltan.length, `${copia}: puntaje igual que ${original}` + (faltan.length ? `\n      cambió o falta:\n      - ${faltan.join("\n      - ")}` : ""));
  if (raras.length) console.log(`    (aviso: ${raras.length} línea(s) de la lista ya no están en ${original}: revisar la lista)`);
}
// Memoria necesita al menos 10 cartas distintas (la ronda 3 tiene 10 pares)
const mem = leer("familia/juegos/memoria.js");
if (mem) {
  const bloque = (mem.match(/const CARTAS = \[([\s\S]*?)\n  \];/) || [])[1] || "";
  const n = (bloque.match(/^\s*\[/gm) || []).length;
  ok(n >= 10, `Memoria tiene ${n} cartas (mínimo 10)`);
}
// Fusión: 13 frutas, como los 13 niveles del original
const fu = leer("familia/juegos/fusion.js");
if (fu) {
  const bloque = (fu.match(/const FICHAS = \[null,([\s\S]*?)\];/) || [])[1] || "";
  const n = (bloque.match(/\["/g) || []).length;
  ok(n === 13, `Fusión tiene ${n} niveles de fruta (deben ser 13)`);
}

// ---------- 2. nada romántico ----------
const PROHIBIDO = /coraz|amor\b|amorcit|enamor|beso|besit|pareja|novi[oa]s?\b|te quiero|te amo|extra[ñn]|cupido|talca|nosotros|💗|💖|💕|💞|💘|💝|💓|💟|💌|💋|❤|♥|🥰|😘|😍|🌹|💑|💏|💍/i;
function archivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "herramientas" || n === "node_modules" || n === ".vercel" ? [] : archivos(p);
    return /\.(js|css|html|json|webmanifest|txt)$/.test(n) ? [p] : [];
  });
}
let hallazgos = [];
try {
  for (const f of archivos("familia")) {
    // (el dominio de las cuentas de Fernando y Martina sí puede estar: lo necesita el login de config.js)
    readFileSync(f, "utf8").split("\n").forEach((l, i) => {
      if (PROHIBIDO.test(l.replace(/nosotros\.invalid/gi, ""))) hallazgos.push(`${f}:${i + 1}: ${l.trim().slice(0, 110)}`);
    });
  }
  ok(!hallazgos.length, "nada romántico en familia/" + (hallazgos.length ? `\n      ${hallazgos.slice(0, 30).join("\n      ")}` : ""));
} catch { ok(false, "no existe la carpeta familia/ todavía"); }

// ---------- 3. Nosotros intacto ----------
const NOSOTROS = ["public", "supabase/schema.sql", "supabase/avisos.sql", "supabase/functions/cuenta", "supabase/functions/notificar",
  "supabase/functions/recordatorios", "supabase/functions/_shared", "README.md"];
const cambios = execSync(`git status --porcelain -- ${NOSOTROS.map((p) => `"${p}"`).join(" ")}`, { encoding: "utf8" }).trim();
ok(!cambios, "Nosotros sin cambios (public/, schema.sql, avisos.sql, funciones y README)" + (cambios ? `\n      ${cambios.replace(/\n/g, "\n      ")}` : ""));

console.log(fallas ? `\n${fallas} revisión(es) con problemas` : "\nTodo bien ✓");
process.exit(fallas ? 1 : 0);
