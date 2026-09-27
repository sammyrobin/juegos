// Texts created from JavaScript. Static texts live in each page's HTML
// (/juegos/pista/ in Spanish, /juegos/en/pista/ in English).

const STRINGS = {
  es: {
    locale: 'es-MX',
    level: (n) => `¡NIVEL ${n}!`,
    ambient: { day: 'De día', sunset: 'Atardecer', night: 'De noche' },
    go: '¡YA!',
    loop: '¡LOOP!',
    jump: '¡SALTO!',
    nitro: '¡NITRO!',
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
    cars: [
      { name: 'Brasa', desc: 'Cuña deportiva con alerón' },
      { name: 'Marea', desc: 'Roadster de curvas suaves' },
      { name: 'Chispa', desc: 'Buggy de ruedas gigantes' },
      { name: 'Eclipse', desc: 'Muscle car con franjas neón' },
    ],
    carLabel: (name, desc) => `${name}: ${desc}`,
  },
  en: {
    locale: 'en-US',
    level: (n) => `LEVEL ${n}!`,
    ambient: { day: 'Daytime', sunset: 'Sunset', night: 'Night' },
    go: 'GO!',
    loop: 'LOOP!',
    jump: 'JUMP!',
    nitro: 'NITRO!',
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
    cars: [
      { name: 'Ember', desc: 'Sports wedge with a big wing' },
      { name: 'Tide', desc: 'Smooth, rounded roadster' },
      { name: 'Spark', desc: 'Buggy with giant wheels' },
      { name: 'Eclipse', desc: 'Muscle car with neon stripes' },
    ],
    carLabel: (name, desc) => `${name}: ${desc}`,
  },
};

const lang = (document.documentElement.lang || 'es').slice(0, 2);

export const t = STRINGS[lang] || STRINGS.es;
