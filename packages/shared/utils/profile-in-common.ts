/**
 * « EN COMMUN » — ce que la fiche d'un autre sert de ce que le lecteur partage
 * avec lui : communautés, amis, médias des conversations partagées (#19200,
 * chantier #18857, vue `Autre-Commun` de la planche du profil).
 *
 * UNE fonction pure qui NE réécrit AUCUNE règle : chaque partie est le verdict
 * de `resolveRelationAccess` pour la feature de la loi qui porte son plancher.
 *
 * ## Pourquoi des features existantes, et pas trois features neuves
 *
 * Une feature de la loi a deux miroirs (Swift, Kotlin) et un jeu de cas partagé
 * que leurs suites rejouent : en créer trois imposerait trois miroirs à tenir
 * dans le même lot. Comme la fiche par cercle pour le pays et le fuseau
 * (`profile-circle-view.ts`), chaque partie EMPRUNTE une feature dont le
 * plancher est celui de la planche et qui ne porte aucun trait de plus
 * (consentement, réglage d'entourage, bouclier des mineurs, action adressée).
 * Le témoin `profile-in-common.test.ts` fige les planchers servis : si l'une
 * de ces features bouge, il rougit au lieu de déplacer « En commun » en silence.
 *
 * ## Ce qu'une partie fermée ne porte JAMAIS
 *
 * `{ state: 'locked', circle }` : le cercle qui l'ouvrirait, jamais un nombre.
 * Une cible bloquée, désactivée, introuvable, ou soi-même, rend la réponse d'un
 * inconnu sans communauté (loi 9) : rien ne distingue « privé » de « absent ».
 */

import type { RelationLevel } from '../types/relation.js';
import { resolveRelationAccess } from './relation-access.js';
import { RELATION_FEATURE_MIN_LEVEL, type RelationFeature } from './relation-levels.js';
import type { ProfileCircleViewInput } from './profile-circle-view.js';

const IN_COMMON_PART_FEATURE = {
  communities: 'views.identity',
  friends: 'game.basic',
  media: 'dm.direct',
  history: 'dm.direct',
} as const satisfies Readonly<Record<string, RelationFeature>>;

export type InCommonPart = keyof typeof IN_COMMON_PART_FEATURE;

export const IN_COMMON_PARTS = Object.keys(IN_COMMON_PART_FEATURE) as readonly InCommonPart[];

/**
 * Les parties servies quand le client n'en nomme aucune. « Notre histoire »
 * (#19378) est OPTIONNELLE : un client qui ne la connaît pas ne la reçoit pas.
 */
export const IN_COMMON_DEFAULT_PARTS: readonly InCommonPart[] = IN_COMMON_PARTS.filter((part) => part !== 'history');

export const isInCommonPart = (value: unknown): value is InCommonPart =>
  typeof value === 'string' && (IN_COMMON_PARTS as readonly string[]).includes(value);

/** Le cercle qui ouvre chaque partie (le plancher de la feature qui la porte). */
export const IN_COMMON_PART_CIRCLE: Readonly<Record<InCommonPart, RelationLevel>> = Object.fromEntries(
  IN_COMMON_PARTS.map((part) => [part, RELATION_FEATURE_MIN_LEVEL[IN_COMMON_PART_FEATURE[part]]] as const),
) as Record<InCommonPart, RelationLevel>;

export type InCommonPartState = { readonly state: 'open' | 'locked'; readonly circle: RelationLevel };

export type InCommonParts = Readonly<Record<InCommonPart, InCommonPartState>>;

const stateOf = (part: InCommonPart, open: boolean): InCommonPartState => ({
  state: open ? 'open' : 'locked',
  circle: IN_COMMON_PART_CIRCLE[part],
});

const closedParts = (): InCommonParts =>
  Object.fromEntries(IN_COMMON_PARTS.map((part) => [part, stateOf(part, false)] as const)) as Record<InCommonPart, InCommonPartState>;

const isClosedPair = (input: ProfileCircleViewInput): boolean =>
  !input.viewerId || !input.targetId || input.viewerId === input.targetId || Boolean(input.blockedEitherWay) || Boolean(input.targetDeactivated);

export const resolveInCommonParts = (input: ProfileCircleViewInput): InCommonParts => {
  if (isClosedPair(input)) return closedParts();
  return Object.fromEntries(
    IN_COMMON_PARTS.map((part) => {
      const verdict = resolveRelationAccess({
        viewerId: input.viewerId,
        targetId: input.targetId,
        grantedByViewer: input.grantedByViewer,
        grantedByTarget: input.grantedByTarget,
        sharesCommunity: input.sharesCommunity,
        blockedEitherWay: false,
        viewerMinor: input.viewerMinor,
        targetMinor: input.targetMinor,
        viewerRole: input.viewerRole,
        targetRole: input.targetRole,
        feature: IN_COMMON_PART_FEATURE[part],
      });
      return [part, stateOf(part, verdict.allowed)] as const;
    }),
  ) as Record<InCommonPart, InCommonPartState>;
};
