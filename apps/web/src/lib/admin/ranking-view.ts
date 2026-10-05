import type { AdminEntityRef } from '@/components/admin/entity-chip';
import type { AdminNamePreview } from '@/lib/api/admin-name-preview';
import type { AdminRankingPerson, AdminRankingRow } from '@/lib/api/admin-ranking';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { interpretConversationType, interpretMessageType } from './interpret/enums';
import { conversationLabel, guestLabel, personLabel, personSecondary, shareLinkLabel, trackingLinkLabel } from './interpret/labels';
import { adminDate, adminMomentOf } from './interpret/time';
import type { AdminMoment } from './interpret/types';

/**
 * **UNE LIGNE DE CLASSEMENT, NOMMÉE** (#8876, #6730) — ce que la vue affiche, dérivé
 * d'une ligne décodée : la puce de l'entité (le VRAI nom, jamais un identifiant), le
 * créateur (liens), la valeur et l'instant.
 *
 * Fonction PURE : la langue et l'horloge sont passées, jamais lues. Le texte d'un
 * message n'y est pas — la ligne ne l'a jamais porté : un message se nomme par son
 * auteur, sa conversation, sa date et son type, et mène à la fiche de SA conversation.
 */
export type RankingRowView = {
  readonly key: string;
  readonly rank: number;
  readonly entity: AdminEntityRef;
  readonly creator: AdminEntityRef | null;
  /** `null` : le critère ordonne sans compter (activité la plus récente), aucune valeur n'est servie. */
  readonly value: number | null;
  readonly when: AdminMoment | null;
};

export type RankingViewContext = {
  readonly language: AdminLanguage;
  readonly now: Date;
  readonly showValue: boolean;
};

/** Un avatar n'est posé que s'il existe : sans lui, un lien ou une conversation garde le glyphe de son genre. */
/** Une conversation sans titre se dit par ses membres quand la passerelle les sert (rang d'administration). */
const namedByMembers = (row: {
  readonly title: string | null;
  readonly type: string | null;
  readonly members: AdminNamePreview | null;
}) => ({ title: row.title, type: row.type, participants: row.members?.participants, total: row.members?.total });

const withAvatar = (ref: AdminEntityRef, avatar: string | null): AdminEntityRef => (avatar === null ? ref : { ...ref, avatarUrl: avatar });

function creatorRef(creator: AdminRankingPerson | null, language: AdminLanguage): AdminEntityRef | null {
  if (creator === null) return null;
  return {
    kind: 'user',
    id: creator.id,
    label: personLabel(creator, language),
    secondary: personSecondary(creator.username),
    avatarUrl: creator.avatar,
  };
}

function conversationRef(
  row: { readonly title: string | null; readonly type: string | null; readonly members: AdminNamePreview | null },
  id: string,
  language: AdminLanguage,
): AdminEntityRef {
  return {
    kind: 'conversation',
    id,
    label: conversationLabel(namedByMembers(row), language),
    secondary: row.type === null ? null : interpretConversationType(row.type, language).label,
  };
}

function entityRef(row: AdminRankingRow, language: AdminLanguage): AdminEntityRef {
  switch (row.kind) {
    case 'users':
      return row.account === null
        ? { kind: 'user', id: row.id, label: personLabel(null, language), deleted: true }
        : {
            kind: 'user',
            id: row.id,
            label: personLabel(row.account, language),
            secondary: personSecondary(row.account.username),
            avatarUrl: row.account.avatar,
          };
    case 'conversations':
      return withAvatar(conversationRef(row, row.id, language), row.avatar);
    case 'messages': {
      const sender =
        row.sender === null
          ? personLabel(null, language)
          : row.sender.userId === null
            ? guestLabel(row.sender.displayName, language)
            : personLabel(row.sender, language);
      const conversation = row.conversation === null ? null : conversationLabel(namedByMembers(row.conversation), language);
      return {
        kind: 'conversation',
        id: row.conversation?.id ?? row.id,
        label: translateAdmin(language, 'admin.ranking.message.label', {
          sender,
          conversation: conversation ?? conversationLabel({}, language),
        }),
        secondary: translateAdmin(language, 'admin.ranking.message.meta', {
          date: adminDate(row.createdAt, language),
          type: interpretMessageType(row.messageType, language).label,
        }),
        ...(row.conversation === null ? { deleted: true } : {}),
      };
    }
    case 'trackingLinks':
      return {
        kind: 'trackingLink',
        id: row.id,
        label:
          row.host === null
            ? trackingLinkLabel({}, language)
            : translateAdmin(language, 'admin.ranking.trackingLink.to', { host: row.host }),
      };
    case 'shareLinks':
      return {
        kind: 'shareLink',
        id: row.id,
        label: shareLinkLabel({ name: row.name }, language),
        secondary: row.conversation === null ? null : conversationLabel(namedByMembers(row.conversation), language),
      };
  }
}

function momentOf(row: AdminRankingRow, context: RankingViewContext): AdminMoment | null {
  switch (row.kind) {
    case 'users':
    case 'conversations':
      return adminMomentOf(row.lastActivity, context.now, context.language);
    case 'trackingLinks':
    case 'shareLinks':
      return adminMomentOf(row.createdAt, context.now, context.language);
    case 'messages':
      return null;
  }
}

export function rankingRowViews(rows: readonly AdminRankingRow[], context: RankingViewContext): readonly RankingRowView[] {
  return rows.map((row, index) => ({
    key: row.id,
    rank: index + 1,
    entity: entityRef(row, context.language),
    creator: row.kind === 'trackingLinks' || row.kind === 'shareLinks' ? creatorRef(row.creator, context.language) : null,
    value: context.showValue ? row.count : null,
    when: momentOf(row, context),
  }));
}
