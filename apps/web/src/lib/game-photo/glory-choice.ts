import type { PackAssetRef } from '@meeshy/shared/types/content-pack';
import type { GloryFrameBirdLayout } from '@meeshy/shared/types/glory-frame-format';
import type { FrameRef } from '@meeshy/shared/utils/game/glory-frames';

/**
 * LE CHOIX DU CADRE ET DE LA POSE (#10164, L11, § 5.4 et § 5.12 du prompt des
 * Cadres de gloire) — une loi PURE, sans DOM ni réseau, entre l'OFFRE (ce que
 * la loi partagée `gloryFramesFor` propose pour l'étape, projetée en tuiles par
 * l'environnement) et ce que l'utilisateur a TOUCHÉ.
 *
 *  - la présélection de la loi vaut tant que l'utilisateur n'a rien choisi ;
 *  - un choix tient tant que l'offre relue (époque du catalogue) le propose
 *    encore ; sinon la présélection reprend — jamais un cadre absent ;
 *  - la carte simple est TOUJOURS un choix (aucun pack n'est obligatoire pour
 *    aller au bout du chemin nominal) ;
 *  - une pose n'existe que si le cadre choisi la déclare (fail-closed) ;
 *    `null` est la pose que le cadre déclare par défaut.
 *
 * La présence d'une tuile se lit sur l'offre (prête, ou le poids qui manque)
 * et se laisse recouvrir par ce que l'appareil a VÉCU depuis (chargement en
 * cours, échec) : la loi ne lit ni l'horloge ni le magasin.
 */

export type GloryOfferTile = {
  readonly ref: FrameRef;
  /** Le nom du cadre dans la langue d'interface (chaînes du pack), sinon son identifiant. */
  readonly name: string;
  /** Le libellé « Utilisable : … » de la loi d'usage (#10146), déjà traduit. */
  readonly usage: string;
  readonly thumb: PackAssetRef;
  /** Les mises en page des oiseaux que le format story déclare, la sienne par défaut en premier. */
  readonly poses: readonly GloryFrameBirdLayout[];
  readonly defaultPose: GloryFrameBirdLayout;
  /** `formats.square === null` : le carré se peint en carte simple, et le sélecteur le DIT (D1, #10180). */
  readonly squareSimple: boolean;
  /** Le cadre a un SUPPORT de message (cartouche, ruban, parchemin : l'emplacement `message` du contrat) ; le sélecteur l'indique (#10165). */
  readonly message: boolean;
  /** Toutes les couches du format story sont au magasin. */
  readonly ready: boolean;
  /** Les octets qui manquent au magasin ; 0 quand la tuile est prête. */
  readonly missingBytes: number;
};

export type GloryOffer = {
  readonly tiles: readonly GloryOfferTile[];
  readonly preselected: FrameRef | null;
};

export type TilePresence = 'ready' | 'missing' | 'loading' | 'failed';

export type GloryChoice = {
  /** `null` : la carte simple. */
  readonly frame: FrameRef | null;
  /** `null` : la pose que le cadre déclare par défaut. */
  readonly pose: GloryFrameBirdLayout | null;
  /** L'utilisateur a touché la bande : la présélection ne le reprend plus. */
  readonly byUser: boolean;
};

export const INITIAL_CHOICE: GloryChoice = { frame: null, pose: null, byUser: false };

export const sameRef = (a: FrameRef | null, b: FrameRef | null): boolean => a === b || (a !== null && b !== null && a.pack === b.pack && a.frameId === b.frameId);

export const tileOf = (offer: GloryOffer | null, ref: FrameRef | null): GloryOfferTile | undefined =>
  ref === null || offer === null ? undefined : offer.tiles.find((tile) => sameRef(tile.ref, ref));

const poseFor = (tile: GloryOfferTile | undefined, pose: GloryFrameBirdLayout | null): GloryFrameBirdLayout | null =>
  tile !== undefined && pose !== null && tile.poses.includes(pose) ? pose : null;

/** L'offre (re)lue : un choix de l'utilisateur encore proposé tient ; sinon la présélection de la loi. */
export function reconcileChoice(choice: GloryChoice, offer: GloryOffer | null): GloryChoice {
  if (offer === null) return choice;
  if (choice.byUser && (choice.frame === null || tileOf(offer, choice.frame) !== undefined)) return choice;
  return { frame: offer.preselected, pose: poseFor(tileOf(offer, offer.preselected), choice.pose), byUser: false };
}

/** Choisir un cadre de l'offre (ou la carte simple) ; la pose ne survit que si le nouveau cadre la déclare. */
export function chooseFrame(choice: GloryChoice, offer: GloryOffer | null, ref: FrameRef | null): GloryChoice {
  const tile = tileOf(offer, ref);
  if (ref !== null && tile === undefined) return choice;
  return { frame: ref, pose: poseFor(tile, choice.pose), byUser: true };
}

/** Choisir une pose parmi celles du cadre choisi ; une pose qu'il ne déclare pas est ignorée ; `null` rend la sienne. */
export function choosePose(choice: GloryChoice, offer: GloryOffer | null, pose: GloryFrameBirdLayout | null): GloryChoice {
  const tile = tileOf(offer, choice.frame);
  if (tile === undefined) return choice;
  if (pose !== null && !tile.poses.includes(pose)) return choice;
  return { ...choice, pose, byUser: true };
}

export type ComposedVersion = {
  readonly frameId: string | null;
  readonly pose: GloryFrameBirdLayout | null;
  /** Le message de l'auteur ÉCRIT sur le cadre (#10165) ; `null` ou absent : aucun. */
  readonly message?: string | null;
  readonly momentId: string;
};

/**
 * Le nom de la VERSION d'une prise pour la loi d'enregistrement (`capture-save`) : la scène COMPOSÉE
 * (jamais le seul choix — un cadre choisi mais pas encore prêt se compose en carte simple) et, sur un
 * cadre, la pose et le message, qui changent l'image autant que le cadre. Sans scène, la carte simple
 * du moment : un message n'y est pas écrit, il ne la nomme pas.
 */
export const composedVersionOf = ({ frameId, pose, message = null, momentId }: ComposedVersion): string => {
  if (frameId === null) return momentId;
  const posed = pose === null ? frameId : `${frameId}#${pose}`;
  return message === null || message.length === 0 ? posed : `${posed}#«${message}»`;
};

/** La présence d'une tuile : ce que l'appareil a vécu depuis prime sur ce que l'offre disait. */
export function presenceOf(offer: GloryOffer, ref: FrameRef, lived: ReadonlyMap<string, TilePresence>): TilePresence {
  const vécu = lived.get(ref.frameId);
  if (vécu !== undefined) return vécu;
  return tileOf(offer, ref)?.ready === false ? 'missing' : 'ready';
}
