import type { AdminSummaryValue } from '@/components/admin/summary-card';
import type { AdminGlyphName } from '@/components/glyphs-admin';
import type { AgentLiveState } from '@/lib/api/admin-agent';
import type { AdminConversationFiche } from '@/lib/api/admin-conversation-fiche';
import { translateAdmin, type AdminLanguage, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';

import { conversationStateOf } from './conversation-model';
import { interpretConversationType, interpretEncryption } from './interpret/enums';
import { formatCount } from './interpret/numbers';
import { adminMomentOf } from './interpret/time';

/**
 * **LA FICHE D'UNE CONVERSATION, EN CARTES** (spec 2026-10-04 § 3, lot « Échanges
 * et contenus ») — l'en-tête d'identité, le geste « Configurer » et le bandeau
 * de chiffres restent visibles ; chaque bloc détaillé devient une carte résumée
 * qui ouvre sa section d'hier dans une modale (`?open=<id>`).
 *
 * Les valeurs viennent de lectures DÉJÀ faites : la fiche, et l'état vivant de
 * l'agent (qui décide si la carte Agent existe). Aucune carte ne lit le détail —
 * la liste des membres, et surtout le CONTENU des messages, ne se lisent qu'à
 * l'ouverture de leur modale.
 */
export const ADMIN_CONVERSATION_SECTIONS = ['members', 'settings', 'reading', 'agent', 'community', 'links'] as const;

export type AdminConversationSection = (typeof ADMIN_CONVERSATION_SECTIONS)[number];

export const ADMIN_CONVERSATION_SECTION_TITLES = {
  members: 'admin.conversation.members.title',
  settings: 'admin.conversation.card.settings',
  reading: 'admin.conversation.reading.title',
  agent: 'admin.agentPanel.conversation.title',
  community: 'admin.conversation.card.community',
  links: 'admin.conversation.stat.shareLinks',
} as const satisfies Readonly<Record<AdminConversationSection, AdminPlainCatalogKey>>;

export const ADMIN_CONVERSATION_SECTION_GLYPHS = {
  members: 'users',
  settings: 'gear',
  reading: 'eye',
  agent: 'robot',
  community: 'usersThree',
  links: 'linkSimple',
} as const satisfies Readonly<Record<AdminConversationSection, AdminGlyphName>>;

export type AdminConversationSummary = { readonly values: readonly AdminSummaryValue[]; readonly sentence: string | null };

export function conversationSummaryOf(
  section: AdminConversationSection,
  facts: {
    readonly fiche: AdminConversationFiche;
    /** L'état vivant de l'agent, `null` tant qu'il n'est pas lu (ou sans agent). */
    readonly agent: AgentLiveState | null;
    /** Le rang souverain lit sans motif écrit. */
    readonly sovereign: boolean;
  },
  language: AdminLanguage,
  now: Date,
): AdminConversationSummary {
  const { fiche, agent, sovereign } = facts;
  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  const v = (label: AdminPlainCatalogKey, value: string): AdminSummaryValue => ({ label: t(label), value });

  switch (section) {
    case 'members':
      return { values: [v('admin.conversation.stat.members', formatCount(fiche.memberCount, language))], sentence: null };
    case 'settings': {
      const last = adminMomentOf(fiche.lastMessageAt, now, language);
      return {
        values: [
          v('admin.conversation.meta.type', interpretConversationType(fiche.type, language).label),
          v('admin.conversation.meta.state', conversationStateOf(fiche, language).label),
          v('admin.conversation.meta.encryption', interpretEncryption(fiche.settings.encryptionMode ?? 'none', language).label),
        ],
        sentence: last === null ? t('admin.conversation.meta.noMessage') : translateAdmin(language, 'admin.conversation.card.lastMessage', { when: last.relative }),
      };
    }
    case 'reading':
      return {
        values: [v('admin.conversation.stat.messages', formatCount(fiche.messageCount, language))],
        sentence: t(sovereign ? 'admin.conversation.card.reading.sovereign' : 'admin.conversation.card.reading.motive'),
      };
    case 'agent':
      return {
        values:
          agent === null
            ? []
            : [
                v('admin.agentPanel.conversation.messages', formatCount(agent.messagesSent, language)),
                v('admin.conversation.card.agent.users', formatCount(agent.controlledUsers.length, language)),
              ],
        sentence: agent !== null && agent.isScanning ? t('admin.conversation.card.agent.scanning') : null,
      };
    case 'community':
      return {
        values: fiche.community === null ? [] : [v('admin.conversation.meta.community', fiche.community.name)],
        /* La carte n'est posée que pour une conversation de communauté : son adresse publique en sous-titre. */
        sentence: fiche.community?.identifier ?? null,
      };
    case 'links':
      return {
        values: [v('admin.conversation.stat.shareLinks', formatCount(fiche.shareLinkCount, language))],
        sentence: fiche.shareLinkCount === 0 ? t('admin.conversation.card.links.none') : null,
      };
  }
}
