create table if not exists resultados (
  id uuid primary key default gen_random_uuid(),
  partida_id text not null,
  jugador_1 text not null,
  jugador_2 text,
  tiempo_segundos integer not null,
  fecha timestamptz not null default now()
);

-- RLS: por defecto todo cerrado. El backend usa la service_role key (bypassa RLS).
alter table resultados enable row level security;

-- Si el frontend en modo single player va a insertar directo desde el cliente
-- con la anon key, habilitar esta policy (y usar SUPABASE_ANON_KEY en el frontend):
-- create policy "insertar resultados desde cliente"
--   on resultados for insert
--   to anon
--   with check (true);
