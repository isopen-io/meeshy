import type { RelationLevel, RelationRequestLevel } from '@meeshy/shared/types/relation';
import type { ProfileCapabilityKey, ProfileCircleView } from '@meeshy/shared/utils/profile-circle-view';

/**
 * **LA FICHE D'UN AUTRE EST LE PROFIL D'UNE RELATION** (#18879, chantier #18857) — trois faces, et sur
 * la face Actions chaque opération est offerte ou verrouillée selon le cercle commun.
 *
 * **L'ACCÈS N'EST ÉCRIT NULLE PART ICI.** Chaque état est le verdict que la passerelle a servi
 * (`?expand=circle`, la loi d'accès des cercles) ; ce module ne tient que la PRÉSENTATION : quelle
 * action regroupe quelle capacité, et dans quel ordre. Un verrou ne porte que `circle` : jamais la
 * valeur protégée, jamais un champ voisin. Sans verdict servi (passerelle plus ancienne, cache
 * vide) la fonction rend `null` : l'écran garde son comportement d'avant et n'invente rien.
 */

export const PROFILE_FACES = ['vitrine', 'liens', 'actions'] as const;
export type ProfileFace = (typeof PROFILE_FACES)[number];

export const PROFILE_FACE_PARAM = 'face';

export const resolveProfileFace = ({ requested, fallback }: { readonly requested: string | null; readonly fallback: ProfileFace }): ProfileFace =>
  PROFILE_FACES.find((face) => face === requested) ?? fallback;

export type RelationActionId = 'write' | 'call' | 'talkie' | 'together' | 'bring' | 'location' | 'battery' | 'unreachable';
export type RelationActionGroup = 'speak' | 'together' | 'device';

export type RelationActionItem = {
  readonly id: RelationActionId;
  readonly group: RelationActionGroup;
  readonly state: 'open' | 'locked';
  /** Le cercle qui ouvre l'action : ce qu'un verrou dit, et RIEN d'autre. */
  readonly circle: RelationLevel;
  /** `write` seulement : l'écriture n'est offerte que comme DEMANDE (cercle Public). */
  readonly request?: true;
};

const CAPABILITY_OF: Readonly<Record<Exclude<RelationActionId, 'write'>, { readonly key: ProfileCapabilityKey; readonly group: RelationActionGroup }>> = {
  call: { key: 'ring', group: 'speak' },
  talkie: { key: 'talkie', group: 'speak' },
  together: { key: 'together', group: 'together' },
  bring: { key: 'bring', group: 'together' },
  location: { key: 'locationTemporary', group: 'together' },
  battery: { key: 'battery', group: 'device' },
  unreachable: { key: 'unreachable', group: 'device' },
};

const OPEN_ORDER: readonly Exclude<RelationActionId, 'write'>[] = ['call', 'talkie', 'together', 'bring', 'location', 'battery', 'unreachable'];

const writeOf = (view: ProfileCircleView): RelationActionItem | null => {
  const direct = view.capabilities.directMessage;
  const request = view.capabilities.messageRequest;
  if (direct?.state === 'open') return { id: 'write', group: 'speak', state: 'open', circle: direct.circle };
  if (request?.state === 'open') return { id: 'write', group: 'speak', state: 'open', circle: request.circle, request: true };
  const closed = direct ?? request;
  return closed === undefined ? null : { id: 'write', group: 'speak', state: 'locked', circle: closed.circle };
};

export function relationActionsOf(view: ProfileCircleView | null): readonly RelationActionItem[] | null {
  if (view === null || view.isSelf) return null;
  const write = writeOf(view);
  const others = OPEN_ORDER.flatMap((id): readonly RelationActionItem[] => {
    const { key, group } = CAPABILITY_OF[id];
    const capability = view.capabilities[key];
    return capability === undefined ? [] : [{ id, group, state: capability.state === 'open' ? 'open' : 'locked', circle: capability.circle }];
  });
  return write === null ? others : [write, ...others];
}

export type CircleLadder = {
  readonly level: RelationLevel;
  readonly grantedByViewer: RelationLevel | null;
  readonly grantedByTarget: RelationLevel | null;
  readonly missing: { readonly level: RelationRequestLevel; readonly byViewer: boolean; readonly byTarget: boolean } | null;
};

/** « Notre cercle » : le niveau commun, ce que chaque côté a accordé, et ce qui manque pour monter. */
export function circleLadderOf(view: ProfileCircleView | null): CircleLadder | null {
  if (view === null || view.isSelf) return null;
  return {
    level: view.level,
    grantedByViewer: view.grantedByViewer ?? null,
    grantedByTarget: view.grantedByTarget ?? null,
    missing: view.missing ?? null,
  };
}

/**
 * La face demandée par l'adresse. Un ancien lien `?tab=details` ouvrait la section devenue la face Actions :
 * il y mène encore (rétrocompatibilité des liens partagés et des notifications déjà envoyées).
 */
export const requestedFaceOf = (search: URLSearchParams): string | null =>
  search.get(PROFILE_FACE_PARAM) ?? (search.get('tab') === 'details' ? 'actions' : null);
