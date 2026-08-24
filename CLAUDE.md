# Jupiter Puzzle (Rompecabezas Online)

> Nombre visible de la app (título, topbar, home). El repo, los servicios de
> Vercel/Render y el proyecto de Supabase siguen llamándose "apolo" — no se
> renombró la infraestructura, solo el branding que ve el jugador.
>
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
rompecabezas infantil), generados con curvas Bézier propias —
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

## Fotos: las sube el propio jugador (no hay catálogo fijo)

No hay catálogo de fotos predefinidas — cada jugador sube su propia foto
(`frontend/src/components/PhotoUploader.jsx`). Restricciones (mismos valores
duplicados en `frontend/src/utils/photoValidation.js` para feedback inmediato
y en `backend/src/photoLimits.js`, que es quien realmente los hace cumplir):
JPG/PNG/WEBP, máx 8MB, entre 300 y 6000px de lado.

- **Single player**: todo corre en el cliente, la foto se usa directo como
  object URL local (`URL.createObjectURL`) — no pasa por el backend ni se
  sube a ningún lado.
- **Multiplayer**: la foto la sube quien crea la sala (o quien reinicia la
  partida) por `POST /api/upload` (`backend/src/upload.js`) — necesita estar
  accesible para el otro jugador, así que no alcanza con una object URL
  local. El backend mide el ancho/alto real de los bytes recibidos con
  `image-size` (nunca confía en lo que reporte el cliente) y sube el archivo
  a un bucket público de Supabase Storage (`puzzle-photos`); devuelve
  `{ url, width, height }`, y esa URL es la que se manda por Socket.io en
  `room:create` / `game:restart`. El server valida que la URL efectivamente
  apunte a ese bucket antes de aceptarla — la fuente de verdad del tamaño
  del tablero en multiplayer sigue siendo siempre el backend, ahora sobre
  una foto arbitraria en vez de un catálogo fijo.
- `image-size` detecta el formato por los primeros bytes del archivo, no por
  el mimetype declarado, y tiene parsers de otros formatos (ICNS/JXL/HEIF)
  vulnerables a DoS por loop infinito sin fix disponible (GHSA-w3rx-r6r6-pgpr,
  GHSA-5p2g-fcmc-qvqq) — por eso `upload.js` valida la firma real del
  archivo (magic bytes) contra JPEG/PNG/WEBP *antes* de llamar a
  `imageSize()`, sin importar el mimetype que haya mandado el cliente.

### Cantidad de piezas: siempre múltiplos de 12

El jugador elige un nivel (Fácil 48 / Medio 96 / Difícil 192 piezas —
`PIECE_LEVELS` en `frontend/src/utils/pieceLevels.js`, duplicado en
`backend/src/pieceLevels.js`), nunca un número libre. En multiplayer el
cliente manda el `id` del nivel, no la cantidad — el server la resuelve
contra su propia copia de la tabla, mismo patrón que antes se usaba para
resolver la foto contra el catálogo. `gridForPieceCount(count, aspect)`
busca, entre los divisores de esa cantidad, el par filas x columnas cuyo
aspect ratio más se acerca al de la foto (así la pieza queda lo más cuadrada
posible sin importar si la foto es horizontal o vertical).

El tablero mantiene siempre la misma área aproximada (la de la proporción
original 856x600 de la primera foto de referencia usada al armar esto) pero
adapta ancho/alto al aspect ratio de la foto subida (`boardDimsForAspect()`)
para no estirarla — así una foto vertical no queda deformada en un tablero
horizontal.

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

Deploy actual: frontend en Vercel (https://apolo-beta.vercel.app, también con el
dominio propio https://games.bstech.top apuntando ahí vía registro A a la IP de
Vercel 76.76.21.21 — DNS gestionado en Hostinger), backend en Render
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
  - `CLIENT_ORIGIN` (env var, usada tanto por el CORS de Express como por el de
    Socket.io) debe listar **todos** los dominios desde donde se sirve el frontend,
    separados por coma — hoy `https://apolo-beta.vercel.app,https://games.bstech.top`.
    Agregar un dominio nuevo en Vercel sin sumarlo acá rompe silenciosamente
    `POST /api/upload` (el fetch falla con "Failed to fetch", sin más detalle) y la
    conexión de Socket.io desde ese dominio.
- **Persistencia** (`supabase/schema.sql`): Supabase (Postgres, free tier), solo para el
  resultado final de cada partida. Una tabla (`resultados`), un único INSERT al terminar.
  El backend usa la `service_role` key (bypassa RLS); si en algún momento el cliente
  necesita insertar directo en modo single player, ver la policy comentada en el schema.
- **Fotos de multiplayer**: bucket público de Supabase Storage (`puzzle-photos`, mismo
  proyecto que la tabla `resultados`), con `file_size_limit`/`allowed_mime_types`
  configurados en el propio bucket como límite adicional (server-side, no solo en
  `upload.js`). El backend sube con la `service_role` key.

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
