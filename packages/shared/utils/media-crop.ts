/**
 * **Le recadrage d'un média de scène — la loi, une fois, pour les trois
 * clients** (#5085).
 *
 * ## Ce qui a rendu ce fichier nécessaire
 *
 * Le modèle est né côté iOS (`MediaCropRect` / `MediaCropRule`, Swift) et
 * traversait la passerelle SANS AUCUN LECTEUR : `crop` voyage dans
 * `payload`, que `canvas-v3.ts` déclare `z.record(z.string(), z.unknown())`
 * — permissif PAR CONTRAT. La clé passait donc la validation, arrivait chez
 * le web et chez Android, et n'y était lue par personne.
 *
 * **Une image recadrée sur iOS se rendait ENTIÈRE ailleurs**, sans qu'un seul
 * test ne rougisse : un schéma permissif n'a pas de site où refuser, et un
 * lecteur qui ignore un champ ne se distingue pas d'un lecteur qui ne l'a
 * jamais reçu.
 *
 * > C'est la forme du § « une énumération de sites porte DEUX affirmations »
 * > du `CLAUDE.md` : le lot iOS savait dire « ces sites appliquent la règle »,
 * > il ne savait pas dire « ce sont les sites où la règle s'applique ».
 *
 * ## Le contrat de fil
 *
 * Quatre nombres, en FRACTIONS de la source, écrits par
 * `CanvasV3Migration` (Swift) sous `cropX` · `cropY` · `cropW` · `cropH`, et
 * OMIS quand le recadrage est plein. L'absence est donc un fait lisible : pas
 * de recadrage, pas de clé — jamais `{0,0,1,1}` écrit explicitement.
 *
 * Les quatre se lisent ENSEMBLE ou pas du tout. Un recadrage amputé d'une
 * borne n'a pas de repli sensé : compléter par un défaut fabriquerait un
 * cadrage que personne n'a posé, et le rendrait indiscernable d'un vrai.
 */

export type MediaCropRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** Le recadrage neutre — toute la source. */
export const FULL_MEDIA_CROP: MediaCropRect = { x: 0, y: 0, width: 1, height: 1 };

/**
 * Un pour cent de la source. En dessous, l'auteur ne voit plus ce qu'il cadre.
 * Le nombre est le même que `MediaCropRule.minimumSide` côté Swift — deux
 * planchers différents feraient deux bandes différentes pour un même geste.
 */
export const MINIMUM_CROP_SIDE = 0.01;

export const isFullMediaCrop = (crop: MediaCropRect): boolean =>
  crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1;

/**
 * **Ramène un rectangle DANS la source.** Une borne qui déborde ne casse rien
 * au rendu — le moteur clippe — mais elle voyage jusqu'au renderer d'export,
 * où une multiplication par la taille réelle peut en faire autre chose.
 *
 * **L'ORIGINE est bornée pour que le plancher TIENNE.** Écrite naïvement —
 * origine bornée à `1`, puis dimension bornée à `1 - origine` — la seconde
 * borne DÉFAIT la première : à `y = 1`, `min(max(0,01, h), 0)` rend `0`,
 * c'est-à-dire exactement le média invisible que le plancher existe pour
 * empêcher. Le témoin qui l'attrape doit donc porter sur une origine EN
 * DÉBORDEMENT ; sur un rectangle valide, les deux écritures s'accordent.
 *
 * Miroir de `MediaCropRule.clamped` (Swift), qui portait le même défaut et a
 * été corrigé dans le même lot — deux planchers qui ne tiennent pas au même
 * endroit rendraient deux bandes différentes pour un même geste.
 */
export const clampMediaCrop = (crop: MediaCropRect): MediaCropRect => {
  const room = 1 - MINIMUM_CROP_SIDE;
  const x = Math.min(Math.max(0, crop.x), room);
  const y = Math.min(Math.max(0, crop.y), room);
  return {
    x,
    y,
    width: Math.min(Math.max(MINIMUM_CROP_SIDE, crop.width), 1 - x),
    height: Math.min(Math.max(MINIMUM_CROP_SIDE, crop.height), 1 - y),
  };
};

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * **Lit le recadrage d'un payload d'objet canvas-v3.**
 *
 * Rend `null` — « pas de recadrage » — dans TROIS cas qui sont le même fait :
 * aucune clé, des clés partielles, ou un recadrage plein. Les distinguer chez
 * l'appelant l'obligerait à connaître la forme de fil, ce que ce module existe
 * pour lui épargner.
 */
export const readMediaCrop = (
  payload: Record<string, unknown> | null | undefined,
): MediaCropRect | null => {
  if (!payload) return null;
  const x = finite(payload.cropX);
  const y = finite(payload.cropY);
  const width = finite(payload.cropW);
  const height = finite(payload.cropH);
  if (x === null || y === null || width === null || height === null) return null;
  const crop = clampMediaCrop({ x, y, width, height });
  return isFullMediaCrop(crop) ? null : crop;
};

/**
 * **Ce que le recadrage rend au rendu** — le rapport EFFECTIF de l'objet.
 * Un média recadré n'a plus les proportions de son fichier, et c'est ce nombre
 * que la carte doit ajuster, jamais `aspectRatio`.
 */
export const effectiveMediaRatio = (
  sourceRatio: number,
  crop: MediaCropRect | null | undefined,
): number => {
  if (!crop || isFullMediaCrop(crop) || crop.height <= 0) return sourceRatio;
  return sourceRatio * (crop.width / crop.height);
};

/**
 * **Le recadrage en style CSS, pour un média qui remplit son conteneur.**
 *
 * Le web n'a pas d'équivalent de `CALayer.contentsRect` : la seule façon de
 * montrer une FRACTION d'une image sans la ré-encoder est de l'agrandir puis
 * de la décaler sous un conteneur qui coupe. C'est exactement ce que fait
 * `contentsRect` en interne, et c'est pourquoi le résultat est identique — le
 * pixel n'est jamais retouché, ni ici ni là.
 *
 * Le décalage se dit en POURCENTAGE de background-position, dont la
 * convention n'est pas linéaire : `p%` aligne le point `p%` de l'image sur le
 * point `p%` du conteneur. Le point visé est donc `x / (1 - width)`, et non
 * `x` — la division est le piège de cette conversion, et elle est indéfinie
 * quand la bande occupe toute la dimension (`width === 1`), auquel cas il n'y
 * a rien à décaler.
 *
 * Rendu pour un conteneur en `overflow: hidden` ; le média porte
 * `position: absolute` et ce style.
 */
export type MediaCropStyle = {
  readonly width: string;
  readonly height: string;
  readonly left: string;
  readonly top: string;
};

export const mediaCropStyle = (crop: MediaCropRect): MediaCropStyle => {
  const bounded = clampMediaCrop(crop);
  const pct = (value: number) => `${value * 100}%`;
  return {
    width: pct(1 / bounded.width),
    height: pct(1 / bounded.height),
    left: pct(-bounded.x / bounded.width),
    top: pct(-bounded.y / bounded.height),
  };
};
