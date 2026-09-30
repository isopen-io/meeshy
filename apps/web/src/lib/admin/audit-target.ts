import type { AdminEntityRef } from '@/components/admin/entity-chip';
import type { AdminAuditPerson, AdminAuditTarget } from '@/lib/api/admin-audit';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { interpretConversationType, interpretReportedEntity } from './interpret/enums';
import { conversationLabel, personLabel, personSecondary, postLabel, reportLabel, shareLinkLabel, trackingLinkLabel } from './interpret/labels';
import type { AdminEntityKind } from './admin-routes';

/**
 * **LA CIBLE D'UNE ENTRÉE, NOMMÉE** (#8876, #6727) — la passerelle résout le libellé de
 * la cible par genre d'élément (un compte, le titre d'une conversation, le nom d'un lien…) ;
 * ce module en fait ce que l'écran affiche.
 *
 * - Un genre qui a une fiche devient une `AdminEntityRef` (puce vers la fiche, dans
 *   l'espace courant et seulement si le lecteur peut l'ouvrir) ;
 * - un genre sans fiche (le modèle de l'agent, l'agent) devient un texte ;
 * - **l'identifiant n'est JAMAIS le nom** : sans libellé connu, le genre se dit par son
 *   nom générique (« Compte », « Communauté »).
 *
 * Un libellé absent ne veut pas toujours dire « supprimé » : une conversation, un lien
 * de partage ou un lien de suivi peuvent exister sans nom (la passerelle sert alors
 * `null`). Seuls les genres qui ont TOUJOURS un nom quand ils existent sont marqués
 * supprimés quand il manque.
 */
const ENTITY_KINDS: Readonly<Record<string, AdminEntityKind>> = {
  User: 'user',
  Conversation: 'conversation',
  ConversationShareLink: 'shareLink',
  Community: 'community',
  Report: 'report',
  Post: 'post',
  Broadcast: 'broadcast',
  TrackingLink: 'trackingLink',
  FriendRequest: 'invitation',
};

const MAY_BE_UNNAMED: ReadonlySet<string> = new Set(['Conversation', 'ConversationShareLink', 'TrackingLink']);

const KNOWN_TYPES = [
  'User',
  'Conversation',
  'ConversationShareLink',
  'Community',
  'Report',
  'Post',
  'Broadcast',
  'TrackingLink',
  'FriendRequest',
  'AgentLlmConfig',
  'Agent',
] as const;

type KnownType = (typeof KNOWN_TYPES)[number];

const isKnownType = (type: string): type is KnownType => KNOWN_TYPES.some((known) => known === type);

/** Le GENRE d'élément, dit en mots — le libellé générique d'une cible sans nom, et les options du filtre. */
export function auditEntityLabel(type: string, language: AdminLanguage): string {
  return translateAdmin(language, isKnownType(type) ? `admin.audit.target.${type}` : 'admin.audit.target.unknown');
}

export type AuditTargetDisplay =
  | { readonly kind: 'entity'; readonly entity: AdminEntityRef }
  | { readonly kind: 'plain'; readonly label: string; readonly secondary: string | null };

const secondaryOf = (text: string | null): { readonly secondary?: string } => (text === null ? {} : { secondary: text });

function namedLabel(target: AdminAuditTarget, language: AdminLanguage): string {
  switch (target.type) {
    case 'Conversation':
      return conversationLabel({ title: target.label, type: target.secondary }, language);
    case 'ConversationShareLink':
      return shareLinkLabel({ name: target.label }, language);
    case 'TrackingLink':
      return trackingLinkLabel({ name: target.label }, language);
    case 'Report':
      return target.label === null ? auditEntityLabel(target.type, language) : reportLabel({ type: target.label }, language);
    case 'Post':
      return target.label === null ? auditEntityLabel(target.type, language) : postLabel({ type: target.secondary, author: { displayName: target.label } }, language);
    default:
      return target.label ?? auditEntityLabel(target.type, language);
  }
}

function namedSecondary(target: AdminAuditTarget, language: AdminLanguage): string | null {
  if (target.secondary === null) return null;
  switch (target.type) {
    case 'Conversation':
      return interpretConversationType(target.secondary, language).label;
    case 'Report':
      return interpretReportedEntity(target.secondary, language).label;
    case 'Post':
      return null;
    default:
      return target.secondary;
  }
}

export function auditTargetOf(target: AdminAuditTarget, language: AdminLanguage): AuditTargetDisplay {
  const kind = ENTITY_KINDS[target.type];
  if (kind === undefined) return { kind: 'plain', label: auditEntityLabel(target.type, language), secondary: null };

  const secondary = target.label === null && !MAY_BE_UNNAMED.has(target.type) ? null : namedSecondary(target, language);
  const gone = target.label === null && !MAY_BE_UNNAMED.has(target.type);
  return {
    kind: 'entity',
    entity: { kind, id: target.id, label: namedLabel(target, language), ...secondaryOf(secondary), ...(gone ? { deleted: true } : {}) },
  };
}

/** Une personne du journal : nom affiché en libellé, @username en secondaire (sauf s'il EST le libellé), photo. */
export function auditPersonRef(person: AdminAuditPerson, language: AdminLanguage): AdminEntityRef {
  const label = personLabel(person, language);
  const secondary = personSecondary(person.username);
  return {
    kind: 'user',
    id: person.id,
    label,
    secondary: secondary === label ? null : secondary,
    avatarUrl: person.avatar,
  };
}
