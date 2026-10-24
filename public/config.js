// Rellena estos tres valores (ver README, pasos 2 y 4).
// Son claves PÚBLICAS: está bien que vayan en el frontend.
window.NOSOTROS_CONFIG = {
  SUPABASE_URL: "https://lrsrmblmqvkpltajegqw.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyc3JtYmxtcXZrcGx0YWplZ3F3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3NzMyODQsImV4cCI6MjEwODM0OTI4NH0.crEUsi0jlmC8aaPMPVeR5TxzkBcmQi4ePPpvqHS32KY",
  VAPID_PUBLIC_KEY: "BFK1DYeXzb9yS1cqHthEXNTlAFoWPsNWcfUXi8g1ct3KHuy7r-a_pgBxhmAKoJ-hetEHq8lwvLqcOt7P335v8gw",

  // Los dos usuarios de la app (los mismos de USUARIOS_PERMITIDOS en la función `cuenta`).
  // Así se ve el nombre de tu pareja aunque todavía no haya creado su cuenta.
  USUARIOS: ["fernando", "martina"],

  // Fechas de ustedes. Se guardan en la base al crear la pareja (después se cambian en Ajustes).
  // `encuentro` se agrega al calendario como viaje, así el corazón del Inicio cuenta los días.
  FECHAS: {
    conocidos: "2026-05-05",  // el día que se conocieron → el 5 de cada mes es especial
    novios: "2026-08-08",     // el día que se hicieron novios → el 8 de cada mes es especial
    encuentro: "2027-03-01",  // la primera vez que se ven en persona
    lugar: "Talca",           // dónde se ven
  },
};
