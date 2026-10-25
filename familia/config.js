// Claves PÚBLICAS de Supabase (las mismas de la otra app: está bien que vayan en el frontend)
window.RECREO_CONFIG = {
  SUPABASE_URL: "https://lrsrmblmqvkpltajegqw.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyc3JtYmxtcXZrcGx0YWplZ3F3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3NzMyODQsImV4cCI6MjEwODM0OTI4NH0.crEUsi0jlmC8aaPMPVeR5TxzkBcmQi4ePPpvqHS32KY",

  // La familia: los mismos de FAMILIA_PERMITIDOS en la función familia-cuenta. Salen como tarjetas en la entrada.
  FAMILIA: [
    { usuario: "eli", nombre: "Eli", avatar: "🦋", color: "uva" },
    { usuario: "maritza", nombre: "Maritza", avatar: "🌺", color: "coral" },
  ],
  // Entra con su cuenta de siempre (usuario@nosotros.invalid). Martina no: está oculta en el Recreo
  // (supabase/familia.sql) y no puede entrar.
  YA_TIENEN_CUENTA: ["fernando"],
};
