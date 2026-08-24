import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const SUPABASE_URL = url;
export const supabase = url && key ? createClient(url, key) : null;

export async function saveResult({ partidaId, jugadores, tiempoSegundos }) {
  if (!supabase) {
    console.warn("[supabase] no configurado, se omite el guardado del resultado");
    return;
  }

  const { error } = await supabase.from("resultados").insert({
    partida_id: partidaId,
    jugadores,
    tiempo_segundos: tiempoSegundos,
  });

  if (error) {
    console.error("[supabase] error guardando resultado:", error.message);
  }
}
