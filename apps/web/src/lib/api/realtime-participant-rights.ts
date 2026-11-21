import type { QueryClient } from '@tanstack/react-query';
import type { ParticipantRightsUpdatedEventData } from '@meeshy/shared/types/socketio-events/participant';

import { patchConversationDetail } from './conversations';
import type { Conversation } from './types';

/**
 * **UN DROIT CHANGÉ EN DIRECT S'APPLIQUE** (#20228) — `participant:rights-updated`,
 * que la passerelle adresse à la room de conversation (charge RÉDUITE), à la
 * room personnelle du sujet et à celle des autres hôtes (charge COMPLÈTE,
 * `participant-rights-core.ts`). Les droits servis sont l'état RÉSOLU du
 * participant NOMMÉ : ils se posent sur SA ligne du détail, celle que le fil
 * relit (`thread.tsx` → `menuViewerOf` → `viewerCanWrite`, et le tiroir du
 * composeur par `viewerParticipant?.permissions`).
 *
 * **Le web n'avait AUCUN consommateur jusqu'à #20228** — mesuré le 2026-11-21,
 * zéro occurrence de `rights-updated` dans `apps/web/src` — alors que le
 * commentaire du site d'émission en nommait un (« `!== undefined` côté web »)
 * et niait celui d'Android, qui existe depuis le dégel du Kotlin (#11570). Un
 * visiteur de lien dont l'hôte venait de retirer `canSendMessages` gardait donc
 * son composeur et ses gestes d'écriture jusqu'au prochain montage du détail,
 * puis recevait un refus du serveur.
 *
 * **LES DROITS SERVIS RECOUVRENT CEUX DE LA LIGNE, ILS NE LA REMPLACENT PAS.**
 * La charge de la ROOM retire `canViewHistory` (#4009, décision porteur
 * 2026-08-27 : « qui a le droit de voir l'historique » est un fait de
 * MODÉRATION) — la clé est ABSENTE, jamais `false`. Une recopie
 * INCONDITIONNELLE de `rights` effacerait donc l'octroi chez tout membre
 * ordinaire de la room, à chaque changement d'un droit d'envoi. Un droit NOMMÉ
 * s'applique ; un droit absent n'affirme rien. Même règle que
 * `carriesHistoryGrant` (iOS) et `ParticipantProfileLive.applying` (Android).
 *
 * **L'octroi par DATE (`historyVisibleFrom`) n'a aucune surface web, et ce lot
 * n'en fabrique pas une** : le détail ne le SERT pas
 * (`conversationDetailInclude` ne le sélectionne pas) et rien dans `apps/web`
 * ne le lit. Ce que le web porte de l'octroi est le booléen voisin,
 * `permissions.canViewHistory`, et c'est là que la règle de PRÉSENCE ci-dessus
 * le protège.
 *
 * Rien à poser sur la LISTE : ses participants sont servis sans `permissions`
 * (`conversationListParticipantSelect`) — y écrire le champ fabriquerait une
 * donnée que la passerelle ne sert jamais.
 *
 * FAIL-CLOSED sur la forme : sans conversation, sans participant nommé, sans
 * `rights` lisible ou sans AUCUN droit booléen, rien ne change. Une ligne
 * ABSENTE du détail (au-delà du plafond de 100) ne se FABRIQUE pas — et le
 * partage structurel de TanStack rend alors la MÊME référence, donc aucun
 * abonné du détail ne se re-rend (témoin d'identité, `toBe(before)`).
 */
type ServedRights = ParticipantRightsUpdatedEventData['rights'];

type RightName = keyof Required<ServedRights>;

/**
 * La table des droits que la charge peut NOMMER, dérivée du contrat : un droit
 * ajouté à `ParticipantRightsUpdatedEventData.rights` et absent d'ici ne
 * compile pas (`satisfies Record<RightName, true>`), et un droit d'ici qui
 * quitte le contrat non plus. Une chaîne de `if` ne garde pas cette propriété.
 */
const RIGHT_NAMES = Object.keys({
  canSendMessages: true,
  canSendFiles: true,
  canSendImages: true,
  canSendVideos: true,
  canSendAudios: true,
  canSendLocations: true,
  canSendLinks: true,
  canViewHistory: true,
} satisfies Record<RightName, true>) as readonly RightName[];

export type ParticipantRightsUpdate = {
  readonly conversationId: string;
  readonly participantId: string;
  /** Les droits NOMMÉS par la charge, et eux seuls. */
  readonly rights: Readonly<Partial<Record<RightName, boolean>>>;
};

type Payload = Readonly<Record<string, unknown>>;

const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

export function participantRightsUpdateOf(value: unknown): ParticipantRightsUpdate | null {
  if (typeof value !== 'object' || value === null) return null;
  const payload = value as Payload;
  const conversationId = textOf(payload.conversationId);
  const participantId = textOf(payload.participantId);
  if (conversationId === null || participantId === null) return null;
  if (typeof payload.rights !== 'object' || payload.rights === null) return null;
  const served = payload.rights as Payload;
  const named = RIGHT_NAMES.filter((name) => typeof served[name] === 'boolean');
  if (named.length === 0) return null;
  const rights = Object.fromEntries(named.map((name) => [name, served[name] as boolean])) as Partial<Record<RightName, boolean>>;
  return { conversationId, participantId, rights };
}

export function applyParticipantRightsUpdate(queryClient: QueryClient, update: ParticipantRightsUpdate): void {
  patchConversationDetail(queryClient, update.conversationId, (conversation): Conversation => {
    const participants = conversation.participants;
    /* Une forme allégée d'un cache peut n'avoir aucune ligne ; mapper `undefined` LÈVERAIT dans un écouteur de socket. */
    if (!Array.isArray(participants)) return conversation;
    return {
      ...conversation,
      participants: participants.map((participant) =>
        participant.id === update.participantId
          ? { ...participant, permissions: { ...participant.permissions, ...update.rights } }
          : participant,
      ),
    };
  });
}

export const participantRightsUpdatedListener =
  (queryClient: QueryClient) =>
  (payload: unknown): void => {
    const update = participantRightsUpdateOf(payload);
    if (update !== null) applyParticipantRightsUpdate(queryClient, update);
  };
