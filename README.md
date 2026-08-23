# Preciosa Puzzle

Rompecabezas jugable en single player o multiplayer (2 jugadores), con sincronización
en tiempo real vía Socket.io y persistencia de resultados en Supabase.

## Estructura

```
backend/    Node.js + Express + Socket.io (estado de salas en memoria)
frontend/   React + Vite + Konva (react-konva)
supabase/   schema.sql — tabla `resultados`
```

## Setup

### 1. Supabase
1. Crear un proyecto en supabase.com (free tier).
2. Ejecutar `supabase/schema.sql` en el SQL editor.
3. Copiar la URL del proyecto y la `service_role` key (para el backend) y la `anon` key
   (para el frontend, solo si el modo single player va a guardar el resultado
   directo desde el cliente — ver la policy comentada en el schema).

### 2. Backend
```bash
cd backend
cp .env.example .env   # completar SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLIENT_ORIGIN
npm install
npm run dev             # http://localhost:4000
```

### 3. Frontend
```bash
cd frontend
cp .env.example .env    # VITE_BACKEND_URL apuntando al backend
npm install
npm run dev              # http://localhost:5173
```

## Flujo multiplayer (Socket.io)

1. Jugador A emite `room:create` → el server genera un `roomId` y el estado inicial
   del puzzle: piezas con recorte tipo jigsaw real (tabs/blancos que encastran entre
   vecinas, ver `puzzleUtils.js`) dispersas en las 4 franjas alrededor del tablero
   (arriba/abajo/izquierda/derecha), permitiendo que se superpongan entre sí — como
   en un rompecabezas real, para "destapar" una pieza hay que mover la que está encima.
2. Jugador A comparte el código de sala. Jugador B emite `room:join` con ese código.
3. Al completarse los 2 jugadores, el server marca la sala `playing` y arranca el timer
   (`startedAt`).
4. Al tomar una pieza: `piece:pick` → si está libre, el server la bloquea (`lockedBy`)
   y difunde `piece:locked` a ambos jugadores (la pieza se ve deshabilitada/atenuada
   para el otro).
5. Mientras se arrastra: `piece:move` (throttled ~40ms en el cliente) → el server
   reenvía `piece:moved` al otro jugador para que vea el arrastre en vivo.
6. Al soltar: `piece:release` → el server evalúa si encajó (umbral de distancia a la
   posición correcta), libera el lock y difunde `piece:updated`.
7. Cuando todas las piezas están colocadas, el server calcula el tiempo total,
   emite `game:completed` y hace el `INSERT` en `resultados` (usa la service_role key,
   así que no requiere RLS abierto).

En single player todo corre en el cliente (`utils/puzzleGenerator.js`, misma lógica
de grilla que el backend) y el resultado se guarda con un INSERT directo desde el
frontend usando la anon key.

## Despliegue

- **Backend → Render.com**: Web Service apuntando a `backend/`, build `npm install`,
  start `npm start`. Configurar las env vars del `.env.example`. Cold start ~20-30s
  tras inactividad (free tier), aceptado.
- **Frontend → Vercel o Hostinger**: build `npm run build` en `frontend/`, servir
  `dist/`. Configurar `VITE_BACKEND_URL` apuntando a la URL pública de Render.

## Forma de las piezas (jigsaw real)

Cada borde interior de la grilla se genera una sola vez como una curva Bézier de 3
tramos (aproximación → protuberancia redondeada → retorno, con tamaño/posición
aleatorios por borde), y las dos piezas vecinas que lo comparten reutilizan los
mismos puntos absolutos recorridos en direcciones opuestas — por eso encastran
exactamente aunque cada pieza se renderice de forma independiente. La pieza se
dibuja como un `Shape` de Konva con `clip()` + `drawImage()` sobre la imagen
completa (no un recorte rectangular). Ver `puzzleUtils.js` (backend, fuente de
verdad para multiplayer) y `puzzleGenerator.js` (frontend, usado en single player).

## Notas / próximos pasos

- El estado de las salas vive en memoria del proceso backend: si Render reinicia
  el servicio, las partidas en curso se pierden (aceptable para este alcance).
- No hay reconexión automática de jugador a una sala tras un refresh/desconexión.
- El z-order de piezas superpuestas (qué pieza queda "arriba") se maneja solo en el
  cliente (`PuzzleBoard.jsx`), no está sincronizado entre jugadores — cada uno puede
  ver un orden de apilado distinto, sin afectar el estado real del juego.
