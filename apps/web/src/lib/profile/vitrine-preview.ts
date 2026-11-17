import { RELATION_LEVELS, compareRelationLevel, type RelationLevel } from '@meeshy/shared/types/relation';
import {
  PROFILE_CAPABILITIES,
  resolveProfileCircleViewAs,
  type ProfileCapabilityKey,
  type ProfileCircleView,
} from '@meeshy/shared/utils/profile-circle-view';

import type { InterfaceCatalogKey } from '@/lib/i18n-catalog';

/**
 * **LA VITRINE PAR CERCLE** (#18878, chantier #18857) — ce qu'un cercle ouvre de ma fiche, ce qu'il
 * ferme, et le cercle qui l'ouvrirait.
 *
 * **L'ACCÈS N'EST ÉCRIT NULLE PART ICI.** Chaque rangée est le verdict de `resolveProfileCircleViewAs`
 * (`@meeshy/shared`, la loi d'accès des cercles que la passerelle et les deux autres clients appliquent),
 * ou celui que la passerelle a servi sur `?as=` (`lib/api/profile-circle.ts`). Ce module ne tient que la
 * PRÉSENTATION : le nom d'une capacité et son ordre d'affichage. Ajouter un cercle ou déplacer un
 * plancher dans la loi change l'aperçu sans toucher ce fichier.
 *
 * Les niveaux proposés sont ceux de la loi, Public en tête : « ce que voit un inconnu » est la
 * première réponse, et c'est exactement la page publique d'un visiteur sans compte.
 */

export const VITRINE_LEVELS: readonly RelationLevel[] = RELATION_LEVELS;

/** Le nom d'une capacité, dans l'ordre où la fiche la montre. Clé absente ⇒ rangée écartée. */
const CAPABILITY_LABEL: Readonly<Record<ProfileCapabilityKey, InterfaceCatalogKey>> = {
  presence: 'userProfile.vitrine.cap.presence',
  presenceDetailed: 'userProfile.vitrine.cap.presenceDetailed',
  game: 'userProfile.vitrine.cap.game',
  gameSparks: 'userProfile.vitrine.cap.gameSparks',
  directMessage: 'userProfile.vitrine.cap.directMessage',
  messageRequest: 'userProfile.vitrine.cap.messageRequest',
  ring: 'userProfile.vitrine.cap.ring',
  talkie: 'userProfile.vitrine.cap.talkie',
  together: 'userProfile.vitrine.cap.together',
  bring: 'userProfile.vitrine.cap.bring',
  listeningCategory: 'userProfile.vitrine.cap.listeningCategory',
  listeningTitle: 'userProfile.vitrine.cap.listeningTitle',
  locationTemporary: 'userProfile.vitrine.cap.locationTemporary',
  locationLive: 'userProfile.vitrine.cap.locationLive',
  locationHistory: 'userProfile.vitrine.cap.locationHistory',
  locationProximity: 'userProfile.vitrine.cap.locationProximity',
  battery: 'userProfile.vitrine.cap.battery',
  batteryPull: 'userProfile.vitrine.cap.batteryPull',
  unreachable: 'userProfile.vitrine.cap.unreachable',
};

export type VitrineRow = {
  readonly key: ProfileCapabilityKey;
  readonly labelKey: InterfaceCatalogKey;
  readonly circle: RelationLevel;
};

export type VitrinePreview = {
  readonly opened: readonly VitrineRow[];
  readonly locked: readonly VitrineRow[];
};

const rowOf = (view: ProfileCircleView, key: ProfileCapabilityKey): { readonly row: VitrineRow; readonly open: boolean } | null => {
  const capability = view.capabilities[key];
  if (capability === undefined) return null;
  return { row: { key, labelKey: CAPABILITY_LABEL[key], circle: capability.circle }, open: capability.state === 'open' };
};

/**
 * Les rangées d'une vue. Un état qui n'est pas `open` se lit FERMÉ (fail-closed), les fermées vont du
 * cercle le plus proche au plus intime (le tri est stable : l'ordre de la fiche départage).
 */
export function vitrinePreviewOf(view: ProfileCircleView): VitrinePreview {
  const rows = PROFILE_CAPABILITIES.flatMap((key) => {
    const found = rowOf(view, key);
    return found === null ? [] : [found];
  });
  return {
    opened: rows.filter(({ open }) => open).map(({ row }) => row),
    locked: rows
      .filter(({ open }) => !open)
      .map(({ row }) => row)
      .sort((a, b) => compareRelationLevel(a.circle, b.circle)),
  };
}

/**
 * Le verdict LOCAL, immédiat : la loi d'accès appelée avec un lecteur ordinaire du cercle demandé.
 * Il peint l'aperçu au premier rendu (jamais de spinner) ; la passerelle le remplace dès qu'elle répond,
 * avec l'âge et le rôle RÉELS du propriétaire.
 */
export const localVitrineView = (params: { readonly level: RelationLevel; readonly targetId: string }): ProfileCircleView =>
  resolveProfileCircleViewAs(params);
