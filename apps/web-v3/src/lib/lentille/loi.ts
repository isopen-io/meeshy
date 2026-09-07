/**
 * LA LOI DE LA LENTILLE — perspective au défilement et élection de la carte de
 * focus, DÉRIVÉE de `packages/shared/utils/focus-curve.ts`.
 *
 * POURQUOI UNE COPIE PLUTÔT QU'UN IMPORT, et pourquoi ce n'est pas une jumelle.
 *
 * `@meeshy/shared` est la source de vérité, et l'importer serait le premier
 * réflexe — c'est la règle du dépôt (« UNE source de vérité, aucune jumelle
 * divergente »). Mais ce paquet dépend de `@prisma/client` et de `zod` : le
 * déclarer ici les ferait entrer dans l'installation, dans l'image Docker et
 * dans la chaîne de construction, et il faudrait construire `packages/shared`
 * — donc générer Prisma — pour compiler une application dont la raison d'être
 * est de peser 25 Ko. Payer cela pour quarante lignes d'ARITHMÉTIQUE PURE — la
 * loi n'importe rien, ne lit rien, ne dépend de rien — serait un mauvais
 * échange.
 *
 * La règle interdit une jumelle qui DIVERGE, pas une valeur dérivée dont la
 * dérive est IMPOSSIBLE. C'est exactement le dispositif que cette application
 * emploie déjà pour sa palette : `packages/design-tokens/ios.css` est généré
 * depuis Swift, et `check:jetons` rougit à la moindre dérive. Ici,
 * `scripts/verifie-courbe.mjs` compare CHAQUE constante et CHAQUE valeur de la
 * courbe à celles de la source amont, sur un balayage de distances. Une
 * divergence ne peut pas être commitée.
 *
 * Ce qui vit ici est donc la loi, jamais une interprétation : si la spec
 * change, elle change dans `packages/shared`, et ce fichier tombe jusqu'à ce
 * qu'on l'y accorde.
 */

/** `f = min(1, d/520)`, `alpha = 1 − 0,45f`, `echelle = 1 − 0,04f`. */
export const DISTANCE_MAX_LISTE = 520;
export const FONDU_LISTE = 0.45;
export const ECHELLE_LISTE = 0.04;

/** Sous la bande : fondu court sur `d/160`, plafonné à `−0,35`. */
export const DISTANCE_SOUS_BANDE = 160;
export const PLAFOND_SOUS_BANDE = 0.35;

/** La bande de focus de la LISTE : `bas − 140`, demi-hauteur 45. */
export const DECALAGE_DE_BANDE = 140;
export const DEMI_HAUTEUR_DE_BANDE = 45;

const borne01 = (v: number): number => Math.min(1, Math.max(0, v));

export type Perspective = { readonly alpha: number; readonly echelle: number };

/**
 * `distance` est la distance verticale AU-DESSUS de la bande de focus : grande
 * et positive pour un rang qui a défilé loin au-dessus, nulle pour un rang PILE
 * dans la bande, NÉGATIVE pour un rang sous elle.
 *
 * Le fondu sous la bande est un terme ADDITIF, et une rampe PROPORTIONNELLE
 * plafonnée — jamais `max(d/160, −0,35)`, une forme qui confond la pente et le
 * plafond et sature à `d = −56` au lieu de `d = −160`. La source amont porte
 * cette correction ; la recopier sans elle serait recopier un bogue déjà
 * corrigé.
 */
export const perspective = (distance: number): Perspective => {
  const f = borne01(distance / DISTANCE_MAX_LISTE);
  const fonduSousBande =
    distance < 0 ? -PLAFOND_SOUS_BANDE * borne01(-distance / DISTANCE_SOUS_BANDE) : 0;

  return {
    alpha: borne01(1 - FONDU_LISTE * f + fonduSousBande),
    echelle: 1 - ECHELLE_LISTE * f,
  };
};

export type Candidat = { readonly id: string; readonly milieuY: number };

/**
 * ÉLECTION DE LA CARTE DE FOCUS, avec hystérésis : le rang courant garde la
 * main tant que son milieu reste dans `focusY ± hysteresis`. Sans elle, deux
 * rangs à distance voisine se disputeraient la carte à chaque image.
 *
 * Départage déterministe par `id` croissant à égalité : une loi qui rendrait un
 * gagnant différent selon l'ordre d'itération ferait clignoter la carte sur une
 * liste réordonnée, sans qu'aucun défilement ait eu lieu.
 */
export const elisLeFocus = ({
  candidats,
  focusY,
  courant,
  hysteresis,
}: {
  readonly candidats: readonly Candidat[];
  readonly focusY: number;
  readonly courant: string | null;
  readonly hysteresis: number;
}): string | null => {
  if (candidats.length === 0) return null;

  const actuel = courant === null ? undefined : candidats.find((c) => c.id === courant);
  if (actuel !== undefined && Math.abs(actuel.milieuY - focusY) <= hysteresis) return actuel.id;

  const gagnant = candidats.reduce<Candidat | null>((meilleur, candidat) => {
    if (meilleur === null) return candidat;
    const dMeilleur = Math.abs(meilleur.milieuY - focusY);
    const dCandidat = Math.abs(candidat.milieuY - focusY);
    if (dCandidat < dMeilleur) return candidat;
    if (dCandidat > dMeilleur) return meilleur;
    return candidat.id < meilleur.id ? candidat : meilleur;
  }, null);

  return gagnant === null ? null : gagnant.id;
};

/**
 * LE CENTRE DE LA BANDE. Au repos en haut de la liste elle est au bord haut, et
 * elle descend linéairement jusqu'au centre sur la première demi-hauteur de
 * défilement — sans quoi la toute première conversation ne pourrait jamais être
 * élue, la bande étant sous elle.
 */
export const centreDeLaBande = ({
  hautDuCadre,
  basDuCadre,
  defilement,
}: {
  readonly hautDuCadre: number;
  readonly basDuCadre: number;
  readonly defilement: number;
}): number => {
  const centre = (hautDuCadre + basDuCadre) / 2;
  const course = centre - hautDuCadre;
  if (course <= 0) return centre;
  return hautDuCadre + course * borne01(defilement / course);
};

/**
 * LA RESPIRATION DES VOISINES — l'écart que les rangées voisines ouvrent autour
 * de la magnifiée, pendant le défilement seulement.
 *
 * Ses trois cotes ne viennent PAS de `focus-curve.ts` mais de
 * `LentilleMetrics.FocusCard` (`apps/ios/.../Lentille/Core/LentilleMetrics.swift`) :
 * la courbe de perspective est partagée entre les clients, la respiration est
 * une cote de la peau Lentille. `scripts/verifie-courbe.mjs` va donc les
 * chercher dans le fichier Swift, exactement comme le générateur de jetons va
 * chercher la palette dans `MeeshyColors.swift`.
 *
 * `niveau` est l'activité de la scène : 0 au repos, 1 pendant le défilement.
 * Sans lui, une liste immobile garderait ses voisines écartées — la
 * respiration est un effet du MOUVEMENT, pas un état de la liste.
 */
export const RESPIRATION = 8;
export const RAMPE_DEBUT = 36;
export const RAMPE_LONGUEUR = 40;

/**
 * `distance` est ici `centre de bande − milieu du rang` : POSITIVE au-dessus de
 * la ligne, donc poussée vers le HAUT (valeur négative) ; négative en dessous,
 * poussée vers le bas.
 *
 * La rampe part de 36 et non de 0 : la rangée élue elle-même ne doit pas
 * bouger, et sa voisine immédiate ne doit pas SAUTER en franchissant la ligne.
 * Une rampe partant de zéro ferait exactement ce saut.
 */
export const respiration = ({
  distance,
  niveau,
  mouvementReduit,
}: {
  readonly distance: number;
  readonly niveau: number;
  readonly mouvementReduit: boolean;
}): number => {
  if (mouvementReduit || niveau <= 0 || distance === 0) return 0;
  const rampe = borne01((Math.abs(distance) - RAMPE_DEBUT) / RAMPE_LONGUEUR);
  return (distance > 0 ? -1 : 1) * RESPIRATION * rampe * niveau;
};
