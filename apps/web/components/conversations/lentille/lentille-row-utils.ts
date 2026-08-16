/**
 * Utilitaires du rang Lentille — WL-102 (LWS-10).
 *
 * Logique de résolution des PARTICIPANTS pour la présence (§ dot de
 * présence) — délibérément DUPLIQUÉE (et non importée) depuis la logique
 * inline de `ConversationItem.getOtherParticipantUser` : ce fichier est
 * INTERDIT d'édition (c'est le modèle historique, §0 de la tâche), et
 * aucune fonction équivalente n'y est exportée. La généralisation « dots
 * aussi pour les groupes » (contrat LWS-10) exige de toute façon un
 * comportement DIFFÉRENT (N participants, pas 1) que la version historique
 * ne couvre pas.
 */
import type { Conversation, Participant } from '@meeshy/shared/types';
import type { PresenceSource } from '@/lib/user-status';

export type LentillePresenceEntry = {
  readonly userId: string;
  readonly source: PresenceSource;
};

const toPresenceEntry = (participant: Participant): LentillePresenceEntry | null => {
  const userId = participant.userId ?? participant.user?.id;
  if (!userId) return null;
  return {
    userId,
    source: {
      isOnline: participant.user?.isOnline ?? participant.isOnline,
      lastActiveAt: participant.user?.lastActiveAt ?? participant.lastActiveAt,
    },
  };
};

/**
 * Participants dont la présence doit être reflétée par le dot du rang.
 *
 * `direct` — MÊME repli à trois niveaux que `ConversationItem` : le
 * participant dont l'id diffère du lecteur, sinon le second, sinon l'unique.
 * Rend au plus une entrée.
 *
 * Tout autre type (`group`, `channel`, `community`, `bot`…) — TOUS les
 * participants hors lecteur, dédupliqués par `userId`. Le rang agrège
 * ensuite (« quelqu'un d'actif ») : `LentilleRow` monte un
 * `ParticipantPresenceIndicator` par entrée, superposés au même point
 * d'ancrage — chacun rend `null` s'il est hors ligne (`OnlineIndicator`),
 * donc le dot n'apparaît QUE si au moins un participant est actif, jamais
 * un compte fabriqué.
 */
export function resolveLentillePresenceEntries(
  conversation: Pick<Conversation, 'type' | 'participants'>,
  currentUserId: string | null | undefined
): readonly LentillePresenceEntry[] {
  const participants = conversation.participants ?? [];
  if (participants.length === 0) return [];

  if (conversation.type === 'direct') {
    let other = participants.find((participant) => {
      const participantUserId = participant.userId ?? participant.user?.id;
      return participantUserId != null && participantUserId !== currentUserId;
    });
    if (!other && participants.length >= 2) other = participants[1];
    if (!other && participants.length === 1) other = participants[0];

    const entry = other ? toPresenceEntry(other) : null;
    return entry ? [entry] : [];
  }

  const seen = new Set<string>();
  const entries: LentillePresenceEntry[] = [];
  for (const participant of participants) {
    const entry = toPresenceEntry(participant);
    if (!entry) continue;
    if (currentUserId != null && entry.userId === currentUserId) continue;
    if (seen.has(entry.userId)) continue;
    seen.add(entry.userId);
    entries.push(entry);
  }
  return entries;
}

/**
 * Autre participant d'une conversation directe, pour le nom/avatar —
 * MÊME repli à trois niveaux que `ConversationItem.getOtherParticipantUser`,
 * dupliqué pour la même raison que ci-dessus (fichier modèle interdit
 * d'édition). Rend un objet compatible `getConversationNameOnly` /
 * `getConversationAvatarUrl` (`conversation-utils.tsx`, réutilisés tels
 * quels par `LentilleRow`).
 */
export function resolveOtherDirectParticipantUser(
  conversation: Pick<Conversation, 'type' | 'participants'>,
  currentUserId: string | null | undefined
): unknown {
  if (conversation.type !== 'direct') return null;
  const participants = conversation.participants ?? [];
  if (participants.length === 0) return null;

  let other = participants.find((participant) => {
    const participantUserId = participant.userId ?? (participant as { user?: { id?: string } }).user?.id;
    return participantUserId != null && participantUserId !== currentUserId;
  });
  if (!other && participants.length >= 2) other = participants[1];
  if (!other && participants.length === 1) other = participants[0];
  if (!other) return null;

  return (
    (other as { user?: unknown }).user ?? {
      id: other.userId,
      displayName: other.displayName,
      username: (other as { nickname?: string }).nickname ?? other.displayName,
      avatar: (other as { avatar?: string }).avatar,
    }
  );
}
