import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Usado solo en modo single player: el backend no participa, así que el
// cliente inserta directo (requiere la policy de insert para "anon" en schema.sql).
export async function saveSinglePlayerResult({ partidaId, jugador1, tiempoSegundos }) {
  if (!supabase) {
    console.warn("[supabase] no configurado, se omite el guardado del resultado");
    return;
  }

  const { error } = await supabase.from("resultados").insert({
    partida_id: partidaId,
    jugador_1: jugador1,
    jugador_2: null,
    tiempo_segundos: tiempoSegundos,
  });

  if (error) {
    console.error("[supabase] error guardando resultado:", error.message);
  }
}
