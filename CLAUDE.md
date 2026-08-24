# Apolo (Rompecabezas Online)

> Instancia independiente de Preciosa Puzzle (repo `piezas`): mismo juego y misma
> lógica, pero con repo, frontend, backend y base de datos propios (sin compartir
> infraestructura ni datos con `piezas`).

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

## Fotos y tamaño de grilla

Catálogo de 4 fotos para elegir (`frontend/src/imageCatalog.js`, duplicado en
`backend/src/imageCatalog.js` porque el server no sirve `frontend/public/` y necesita
igual el width/height de cada una — mismo patrón de duplicación que puzzleUtils.js /
puzzleGenerator.js). Grilla fija en **8x8 = 64 piezas** para cualquier foto. El tablero
mantiene siempre la misma área aproximada (la de la proporción original 856x600, pensada
para `foto1.jpg`) pero adapta ancho/alto al aspect ratio de la foto elegida
(`boardDimsForAspect()`) para no estirarla — así una foto vertical no queda deformada en
un tablero horizontal. En multiplayer el cliente solo manda un `imageId`; el server
resuelve src/width/height contra su propio catálogo, nunca contra lo que mande el cliente
— la fuente de verdad del tamaño del tablero es siempre el backend. Ver `sources/` para
el material de referencia original (fotos sin optimizar).

## Chat, música y reinicio (multiplayer)

- Chat de texto simple entre los 2 jugadores (`chat:message`): solo se reenvía en vivo,
  no se persiste ni tiene historial — se pierde al refrescar, igual que el resto del
  estado de la sala.
- La música de fondo es enteramente client-side (no hay audio en el backend): catálogo en
  `frontend/src/musicCatalog.js`, archivos en `frontend/public/music/`. Reproductor simple
  (anterior/reproducir/siguiente) en el topbar (`MusicPlayer.jsx`). El `<audio>` se
  remonta con `key={trackId}` en cada cambio de pista — cambiar `src` en el mismo elemento
  puede interrumpir un `play()` en curso del track anterior y dejar la música muda hasta
  el próximo refresh, por eso el remount en vez de mutar `src` in place.
- Al terminar una partida multiplayer, cualquiera de los 2 jugadores puede reiniciar en la
  misma sala (`game:restart`), reusando la foto o eligiendo otra — no hace falta crear una
  sala nueva (reusa `room.players`, vuelve a estado `ready`). El server trackea qué
  jugador encajó cada pieza (`piece.placedBy`) para mostrar cuántas piezas aportó cada uno
  al completar — es un dato efímero de esa partida, no un leaderboard persistente.

## Stack (elegido para que todo corra en tiers 100% gratuitos)

Deploy actual: frontend en Vercel (https://apolo-beta.vercel.app), backend en Render
(https://apolo-9kjq.onrender.com), repo en https://github.com/bsolanoa/apolo, base de
datos en un proyecto Supabase propio (ref `fjsoffjgrwneoopauqel`, región `sa-east-1`)
— totalmente separado del proyecto Supabase de `piezas`. El frontend en Vercel se
deployea por CLI (`vercel --prod` desde `frontend/`), no está conectado por Git — un
`git push` a `main` **no** lo actualiza solo (a diferencia del backend en Render, que
sí tiene auto-deploy desde GitHub).

- **Frontend** (`frontend/`): React + Vite + Konva/react-konva (canvas para renderizar y
  arrastrar piezas) + socket.io-client.
  - Hosting: Vercel (elegido sobre Hostinger — deploy más simple, sin subir `dist/` a mano).
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
