// Texts created from JavaScript. Static texts live in each page's HTML
// (/juegos/pista/ in Spanish, /juegos/en/pista/ in English).

const STRINGS = {
  es: {
    locale: 'es-MX',
    level: (n) => `¡NIVEL ${n}!`,
    ambient: { room: 'El cuarto', living: 'La sala', kitchen: 'La cocina', garden: 'El jardín' },
    go: '¡YA!',
    loop: '¡LOOP!',
    jump: '¡SALTO!',
    nitro: '¡NITRO!',
    ring: '¡ARO DE FUEGO!',
    newRecord: '¡Nuevo récord!',
    shareTitle: 'TURBO PISTA',
    shareText: (score) => `¡Hice ${score} puntos en TURBO PISTA! ¿Me superas?`,
    copied: 'Enlace copiado. ¡Pégalo donde quieras!',
    shareFail: 'No pude compartir. Copia la dirección de la página.',
    paused: 'Pausa',
    lifeLost: (n) => (n === 1 ? 'Te queda 1 vida' : `Te quedan ${n} vidas`),
    gameOver: (score) => `Fin de la carrera: ${score} puntos`,
    soundOn: 'Silenciar sonido',
    soundOff: 'Activar sonido',
    colors: { red: 'rojo', blue: 'azul', yellow: 'amarillo', purple: 'morado' },
    stats: { speed: 'Velocidad', accel: 'Aceleración', handling: 'Manejo' },
    carLabel: (num, color, st) => `Auto ${color} número ${num}. Velocidad ${st.speed} de 5, aceleración ${st.accel} de 5, manejo ${st.handling} de 5.`,
  },
  en: {
    locale: 'en-US',
    level: (n) => `LEVEL ${n}!`,
    ambient: { room: 'The bedroom', living: 'The living room', kitchen: 'The kitchen', garden: 'The garden' },
    go: 'GO!',
    loop: 'LOOP!',
    jump: 'JUMP!',
    nitro: 'NITRO!',
    ring: 'FIRE HOOP!',
    newRecord: 'New best!',
    shareTitle: 'TURBO PISTA',
    shareText: (score) => `I scored ${score} points in TURBO PISTA! Can you beat me?`,
    copied: 'Link copied. Paste it anywhere!',
    shareFail: 'Could not share. Copy the page address instead.',
    paused: 'Paused',
    lifeLost: (n) => (n === 1 ? '1 life left' : `${n} lives left`),
    gameOver: (score) => `Race over: ${score} points`,
    soundOn: 'Mute sound',
    soundOff: 'Turn sound on',
    colors: { red: 'red', blue: 'blue', yellow: 'yellow', purple: 'purple' },
    stats: { speed: 'Speed', accel: 'Acceleration', handling: 'Handling' },
    carLabel: (num, color, st) => `Number ${num}, ${color} car. Speed ${st.speed} of 5, acceleration ${st.accel} of 5, handling ${st.handling} of 5.`,
  },
};

const lang = (document.documentElement.lang || 'es').slice(0, 2);

export const t = STRINGS[lang] || STRINGS.es;
