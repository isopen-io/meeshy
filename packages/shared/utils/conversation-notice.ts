/**
 * Avis de vie d'un groupe — « Demo a retiré Bob », « Bob a quitté la
 * conversation », « Nom du groupe modifié », « Photo du groupe modifiée » (#7593).
 *
 * Même contrat que l'avis d'arrivée (`join-notice.ts`) : le sens voyage dans
 * `Message.metadata`, jamais dans le texte. Le `content` stocké n'est qu'un
 * repli français pour les surfaces sans rendu dédié. La ligne de liste lit
 * la clé localisable que le gateway en dérive (`system.member-removed`, …).
 *
 * L'ajout par un tiers n'est PAS ici : c'est un avis d'arrivée qui porte
 * `addedBy` (`join-notice.ts`), pour que les clients qui dessinent déjà la
 * carte d'arrivée continuent de la dessiner.
 */

/** Qui a fait le geste, ou qui l'a subi — `Participant.id` et nom affiché. */
export type NoticeActor = {
  readonly participantId: string;
  readonly displayName: string;
};

export const CONVERSATION_NOTICE_KINDS = [
  'member-removed',
  'member-left',
  'conversation-renamed',
  'conversation-image',
] as const;

export type ConversationNoticeKind = (typeof CONVERSATION_NOTICE_KINDS)[number];

export type MemberRemovedNotice = {
  readonly kind: 'member-removed';
  readonly actor: NoticeActor;
  readonly target: NoticeActor;
};

export type ActorOnlyNotice = {
  readonly kind: 'member-left' | 'conversation-renamed' | 'conversation-image';
  readonly actor: NoticeActor;
};

export type ConversationNotice = MemberRemovedNotice | ActorOnlyNotice;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Lit un acteur, ou rend `null` : les deux champs, non vides, et rien d'autre. */
export function parseNoticeActor(value: unknown): NoticeActor | null {
  const raw = asRecord(value);
  if (!raw) return null;
  if (typeof raw.participantId !== 'string' || !raw.participantId) return null;
  if (typeof raw.displayName !== 'string' || !raw.displayName) return null;
  return { participantId: raw.participantId, displayName: raw.displayName };
}

function isNoticeKind(kind: unknown): kind is ConversationNoticeKind {
  return typeof kind === 'string' && (CONVERSATION_NOTICE_KINDS as readonly string[]).includes(kind);
}

/**
 * Lit `Message.metadata` comme un avis de vie du groupe, ou rend `null`.
 * VALIDE plutôt que caste : la colonne est partagée par toutes les familles
 * de messages système.
 */
export function parseConversationNotice(metadata: unknown): ConversationNotice | null {
  const raw = asRecord(metadata);
  if (!raw || !isNoticeKind(raw.kind)) return null;
  const actor = parseNoticeActor(raw.actor);
  if (!actor) return null;
  if (raw.kind !== 'member-removed') return { kind: raw.kind, actor };
  const target = parseNoticeActor(raw.target);
  return target ? { kind: 'member-removed', actor, target } : null;
}
