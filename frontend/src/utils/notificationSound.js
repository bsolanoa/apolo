// Beep corto para "mensaje nuevo en el chat", sintetizado con Web Audio API
// en vez de un archivo de audio — evita sumar un asset y el tema de licencia
// que ya se tuvo en cuenta para el resto del material del juego. Se reutiliza
// un único AudioContext para no crear uno por mensaje.
let audioContext = null;

function getAudioContext() {
  if (audioContext) return audioContext;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioContext = new Ctx();
  return audioContext;
}

export function playNotificationSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  // Los navegadores suspenden el AudioContext hasta el primer gesto del
  // usuario; para cuando llega un mensaje de chat ya hubo de sobra (escribir
  // el nombre, crear/unirse a la sala), pero por las dudas se reanuda.
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, now);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(now);
  oscillator.stop(now + 0.15);
}
