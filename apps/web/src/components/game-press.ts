import '@/styles/game.css';

/**
 * LE REBOND DU JEU, PAR SON NOM (#9563, amendement n° 2) — la classe que porte
 * tout ce qui se touche dans Progression (`styles/game.css` en écrit la courbe,
 * une fois). À part de `game-touch.tsx` : un lien, une ligne de menu ou le
 * retour de l'en-tête rebondissent sans rien savoir des précisions.
 */
export const PRESS = 'game-press';
