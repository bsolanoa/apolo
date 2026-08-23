import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase = url && key ? createClient(url, key) : null;

export async function saveResult({ partidaId, jugador1, jugador2, tiempoSegundos }) {
  if (!supabase) {
    console.warn("[supabase] no configurado, se omite el guardado del resultado");
    return;
  }

  const { error } = await supabase.from("resultados").insert({
    partida_id: partidaId,
    jugador_1: jugador1,
    jugador_2: jugador2 || null,
    tiempo_segundos: tiempoSegundos,
  });

  if (error) {
    console.error("[supabase] error guardando resultado:", error.message);
  }
}
