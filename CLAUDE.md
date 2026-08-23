# Preciosa Puzzle (Rompecabezas Online)

Juego de rompecabezas jugable en modo **single player** o **multiplayer (2 jugadores máximo)**.
En multiplayer, ambos jugadores ven el mismo tablero y mueven piezas en tiempo real; si un
jugador toma una pieza, queda bloqueada para el otro hasta que la suelte. Al completar el
rompecabezas (en cualquiera de los dos modos) se guarda el tiempo que tomó armarlo.

El juego **no arranca solo**: hace falta presionar "Comenzar" explícitamente (en ambos modos).
En multiplayer, ese botón ni siquiera aparece hasta que los 2 jugadores están presentes
(sala en estado `ready`); el servidor rechaza `piece:pick` si la sala no está en `playing`,
no es solo una validación visual del cliente. Ver `rooms.js` (estados `waiting → ready →
playing → finished`) y el evento `game:start` en `socketHandlers.js`.

No hay autenticación de usuarios, leaderboards ni perfiles — fuera de alcance por ahora.

## Piezas: recorte tipo jigsaw real (no rectángulos)

Cada pieza tiene tabs/blancos con forma de "botón redondo sobre cuello angosto" (clásico
rompecabezas infantil, ver `sources/ejemplo.png`), generados con curvas Bézier propias —
**no** es un puerto de ningún generador de terceros (el de referencia investigado,
Draradech/jigsaw, no tiene licencia declarada; se reimplementó la técnica desde cero). Cada
borde interior de la grilla se calcula una sola vez y las dos piezas vecinas que lo comparten
reutilizan los mismos puntos absolutos recorridos en direcciones opuestas, así encastran
exactamente. Lógica duplicada a propósito en `backend/src/puzzleUtils.js` (fuente de verdad
para multiplayer) y `frontend/src/utils/puzzleGenerator.js` (usado en single player).

Las piezas se dispersan en las 4 franjas alrededor del tablero (arriba/abajo/izq/der) y
**se permite que se superpongan** — es intencional, como en un rompecabezas real: para
llegar a una pieza tapada hay que mover primero la que está encima. El z-order de piezas
superpuestas es solo local a cada cliente (no sincronizado entre jugadores).

Imagen y tamaño de grilla por defecto: `frontend/public/foto1.jpg` (foto provista por el
usuario, optimizada de 8.6MB a ~320KB), grilla 8x6 = 48 piezas, tablero 856x600 (calzado con
el aspect ratio de la foto). Ver `sources/` para el material de referencia original.

## Stack (elegido para que todo corra en tiers 100% gratuitos)

- **Frontend** (`frontend/`): React + Vite + Konva/react-konva (canvas para renderizar y
  arrastrar piezas) + socket.io-client.
  - Hosting: Hostinger (hosting compartido, sin VPS, solo sirve el build estático) o Vercel.
- **Backend realtime** (`backend/`): Node.js + Express + Socket.io. Mantiene el estado de
  cada sala (2 jugadores) **en memoria** — posición de piezas y bloqueo de la pieza tomada.
  No usar la DB para el estado en curso, solo para el resultado final.
  - Hosting: Render.com (free web service). Se "duerme" tras ~15 min sin uso; primera
    conexión de una partida puede tardar 20-30s en despertar — esperado, no es un bug.
- **Persistencia** (`supabase/schema.sql`): Supabase (Postgres, free tier), solo para el
  resultado final de cada partida. Una tabla (`resultados`), un único INSERT al terminar.
  El backend usa la `service_role` key (bypassa RLS); si en algún momento el cliente
  necesita insertar directo en modo single player, ver la policy comentada en el schema.

## Decisiones de arquitectura (no reevaluar sin razón nueva)

- El lock/sincronización de piezas se resuelve con estado en memoria del server de Socket.io,
  **no** con la base de datos — evita latencia y complejidad innecesaria para salas de 2.
- Se descartó PartyKit/Cloudflare Durable Objects porque requieren el plan Workers Paid
  ($5/mes mínimo) — no hay tier gratuito para uso en producción.
- Se descartó SQLite como persistencia porque Render (free tier) tiene filesystem efímero:
  se pierde en cada reinicio/redeploy. Si en el futuro se migra el backend a un host con
  volumen persistente (ej. Fly.io), SQLite vuelve a ser una opción válida para simplificar
  a un solo servicio.
- Vercel no reemplaza al backend realtime: sus funciones serverless no soportan conexiones
  WebSocket persistentes.
- En `PuzzlePiece.jsx`, la posición de la pieza **no** se pasa como prop controlado `x`/`y`
  a `<Shape>` de Konva: se sincroniza a mano vía `ref` (`useLayoutEffect`) y se salta mientras
  hay un drag local en curso (`isDraggingRef`). Si `x`/`y` fueran props normales, cualquier
  evento de socket que llegara en pleno drag (por ejemplo el otro jugador tomando una pieza
  distinta) le reimpondría a Konva la posición vieja del estado de React, cortando el drag en
  seco — la pieza queda con la máquina de estados de arrastre de Konva corrompida y no vuelve
  a responder, aunque visualmente se vea normal (sin tinte de "bloqueada"). Por la misma razón,
  `draggable` nunca se apaga mientras `isDraggingRef` es true, sin importar qué lo dispare.
