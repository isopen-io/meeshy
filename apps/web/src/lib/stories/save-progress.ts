/**
 * **LA PROGRESSION D'UN EXPORT DE STORY** (#7116) — miroir PUR de
 * `StorySaveProgressMapper` (`apps/ios/Meeshy/Features/Main/Services/StoryPhotoSaveService.swift:7-24`)
 * et de `StorySaveProgressRing` (`:12-121`).
 *
 * Le bake/téléchargement occupe **0…0,9** de l'anneau, la livraison
 * (écriture Photos côté iOS ; téléchargement navigateur ou partage de
 * fichier côté web) les **10 % restants** — « sans ce découpage, l'anneau
 * atteindrait 100 % avant que le fichier n'existe réellement chez le
 * destinataire ». `percent()` DÉRIVE de `downloadShare()` : le chiffre
 * affiché et l'arc peint sont la MÊME valeur, jamais deux calculs qui
 * pourraient diverger d'un rendu à l'autre.
 */

/** Borne une fraction dans `[0, 1]` — un flux réseau peut annoncer un ratio
 * hors bornes (arrondi, dernier paquet plus gros que prévu). */
function clamp01(fraction: number): number {
  return Math.min(1, Math.max(0, fraction));
}

/** La part de l'anneau que le TÉLÉCHARGEMENT occupe — 0 à 0,9. */
export function downloadShare(rawProgress: number): number {
  return clamp01(rawProgress) * 0.9;
}

/** La LIVRAISON n'a pas de callback de progression (ni `<a download>` ni
 * `navigator.share` n'en publient un) : elle est réputée pleine dès qu'on
 * l'atteint, comme l'écriture Photos d'iOS. */
export function deliveryDone(): number {
  return 1;
}

/** Le CHIFFRE affiché au centre de l'anneau — dérivé de `downloadShare`,
 * jamais recalculé à côté : c'est ce qui garantit que le chiffre et l'arc ne
 * peuvent pas se contredire. */
export function percent(rawProgress: number): number {
  return Math.round(downloadShare(rawProgress) * 100);
}

export type RingAppearance = {
  /** `accent` tant que l'utilisateur peut encore annuler ; `inert` une fois
   * la livraison entamée (`StorySaveProgressRing.swift` : `.secondary`). */
  readonly tone: 'accent' | 'inert';
  /** Le balayage indéterminé — « la seule chose qui bouge encore pendant
   * deux passes qui ne publient AUCUNE progression ». Jamais si le lecteur a
   * demandé moins de mouvement (`prefers-reduced-motion`). */
  readonly sweeps: boolean;
};

export function ringAppearance(params: { readonly cancellable: boolean; readonly reduceMotion: boolean }): RingAppearance {
  if (params.cancellable) return { tone: 'accent', sweeps: false };
  return { tone: 'inert', sweeps: !params.reduceMotion };
}
