create table if not exists resultados (
  id uuid primary key default gen_random_uuid(),
  partida_id text not null,
  jugadores text[] not null,
  tiempo_segundos integer not null,
  fecha timestamptz not null default now()
);

-- Migración desde el esquema anterior (2 jugadores máximo, columnas
-- jugador_1/jugador_2 fijas). Solo aplica si la tabla ya existía con esas
-- columnas; en una tabla nueva (creada con el create table de arriba) estas
-- sentencias no hacen nada.
alter table resultados add column if not exists jugadores text[];
update resultados
  set jugadores = array_remove(array[jugador_1, jugador_2], null)
  where jugadores is null and jugador_1 is not null;
alter table resultados alter column jugadores set not null;
alter table resultados drop column if exists jugador_1;
alter table resultados drop column if exists jugador_2;

-- RLS: por defecto todo cerrado. El backend usa la service_role key (bypassa RLS).
alter table resultados enable row level security;

-- Si el frontend en modo single player va a insertar directo desde el cliente
-- con la anon key, habilitar esta policy (y usar SUPABASE_ANON_KEY en el frontend):
-- create policy "insertar resultados desde cliente"
--   on resultados for insert
--   to anon
--   with check (true);
