import type { CSSProperties } from 'react';

/**
 * **LA COLONNE DE LECTURE** (#7449) — la largeur au-delà de laquelle un fil
 * cesse de grandir, et la loi qui le CENTRE dans ce qui reste.
 *
 * Le Flux et les Réels sont nés mobiles : leur scrollport prenait `flex-1`
 * sans borne, si bien qu'à 1440 px une carte de publication faisait 1416 px de
 * large. Ce n'est pas « un téléphone élargi », c'est PIRE — une ligne de texte
 * de cette longueur se relit mal (l'œil perd le retour à la ligne), la
 * mosaïque média s'étire, et le rail d'actions d'un réel part au bord opposé
 * du regard. Le premier réflexe serait une media query ; c'en est une de trop :
 * **la borne vaut à TOUTE largeur**, elle ne mord simplement pas en dessous
 * d'elle-même. Aucun seuil à tenir, aucun gabarit à nommer.
 *
 * **CE N'EST PAS LA GÉOGRAPHIE DESKTOP** — celle-là (deux colonnes liste + fil)
 * est un chantier de design à part entière. Ici on répare une lecture, on ne
 * dessine pas un bureau : une colonne bornée et centrée est ce que l'écran
 * mobile EST DÉJÀ, servi tel quel à une fenêtre plus large.
 */

/**
 * **640 px** — la borne du fil de PUBLICATIONS.
 *
 * Elle vient du contenu, jamais d'un gabarit d'appareil : `MEDIA_GRID_MAX_WIDTH`
 * borne déjà une mosaïque à 300 px dans une bulle, et une carte de fil porte
 * deux colonnes de cette échelle plus ses gouttières. 640 tient ~85 caractères
 * au corps du dépôt — la mesure haute d'une ligne encore confortable — et
 * laisse la carte respirer sans qu'un média y devienne une affiche.
 *
 * Elle est AU-DESSUS de tous les gabarits que les gates mesurent (390 × 844,
 * 320 × 568) : le rendu mobile est, au pixel près, celui d'avant ce lot.
 */
export const READING_COLUMN_MAX = 640;

/**
 * **LE RAPPORT D'UN RÉEL** — 9:16, celui de la scène que `reelStageOf`
 * (`lib/reels/scene.ts`) cadre déjà et que `ReelsPlayerView` (iOS) présente
 * plein écran sur un téléphone.
 *
 * La colonne des Réels ne se borne donc PAS à un nombre de pixels mais à la
 * HAUTEUR disponible : une page de réel occupe toute la hauteur, sa largeur
 * utile est `hauteur × 9/16`. Au-delà, on n'ajoute que du noir — et du noir
 * qui éloigne les contrôles.
 */
export const REEL_COLUMN_RATIO = 9 / 16;

/**
 * La colonne du fil, en style INLINE plutôt qu'en classe utilitaire : la cote
 * est une CONSTANTE de module que deux écrans et leurs témoins partagent, et
 * une classe `max-w-[640px]` la recopierait en texte — la jumelle exacte que
 * `check-utilities.mjs` ne peut pas voir (une classe juste qui désigne une
 * autre valeur que la constante ne rougit nulle part).
 */
export const READING_COLUMN_STYLE: CSSProperties = {
  width: '100%',
  maxWidth: READING_COLUMN_MAX,
  marginInline: 'auto',
};

/**
 * La colonne des Réels. `100dvh` et non `100vh` : sur une WebView mobile, la
 * barre d'adresse rétractable fait diverger les deux, et c'est `h-dvh` que
 * `ReelsFrame` emploie déjà — la largeur doit suivre la hauteur RÉELLE, sinon
 * la colonne déborde ou laisse une bande au moment exact où la barre bouge.
 */
export const REEL_COLUMN_STYLE: CSSProperties = {
  width: '100%',
  maxWidth: `calc(100dvh * ${REEL_COLUMN_RATIO})`,
  marginInline: 'auto',
};

/**
 * La largeur RÉELLEMENT peinte par la colonne du fil dans une fenêtre donnée —
 * loi PURE, pour que le témoin éprouve l'arithmétique sans navigateur.
 */
export function readingColumnWidth(viewportWidth: number): number {
  return Math.min(viewportWidth, READING_COLUMN_MAX);
}

/** Idem pour la colonne des Réels, qui dépend de la HAUTEUR. */
export function reelColumnWidth(viewport: { readonly width: number; readonly height: number }): number {
  return Math.min(viewport.width, viewport.height * REEL_COLUMN_RATIO);
}
