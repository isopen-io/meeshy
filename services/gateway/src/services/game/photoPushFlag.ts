/**
 * L'INTERRUPTEUR DU PUSH PHOTO (#10175, L19 — § 5.16.4) : `GAME_PHOTO_PUSH`, variable d'environnement de la
 * passerelle. Seule la valeur exacte `on` allume la détection et l'envoi ; tout le reste, absence comprise, les
 * laisse éteints (livré éteint en production jusqu'à la recette). Relue à chaque passage du job et à chaque
 * marque : l'allumer ou l'éteindre est un geste réversible, sans redéploiement de code.
 */

export const GAME_PHOTO_PUSH_ENV = 'GAME_PHOTO_PUSH';

export const isGamePhotoPushOn = (env: Readonly<Record<string, string | undefined>> = process.env): boolean => env[GAME_PHOTO_PUSH_ENV] === 'on';
