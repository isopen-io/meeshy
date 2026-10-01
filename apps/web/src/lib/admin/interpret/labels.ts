import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { interpretPostType, interpretReportType } from './enums';

/**
 * LES VRAIS NOMS (#8876) — ce qui tient lieu de titre à une personne, une
 * conversation, un lien, une publication, un signalement. **Jamais un
 * identifiant** : un ObjectId n'est pas un nom, il ne vit que dans la ligne
 * « Identifiant technique » de la fiche.
 *
 * Les gabarits n'acceptent que les champs qui PEUVENT servir de nom : un lien de
 * partage ne reçoit ni son `identifier` ni son `linkId` (secrets d'entrée), donc
 * aucun appelant ne peut les faire fuiter dans un libellé.
 */
export type PersonNameFields = {
  readonly displayName?: string | null;
  readonly username?: string | null;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
};

const text = (value: string | null | undefined): string => value?.trim() ?? '';

export function personLabel(person: PersonNameFields | null | undefined, language: AdminLanguage): string {
  if (person === null || person === undefined) return translateAdmin(language, 'admin.value.person.unknown');
  const displayName = text(person.displayName);
  if (displayName !== '') return displayName;
  const fullName = [text(person.firstName), text(person.lastName)].filter((part) => part !== '').join(' ');
  if (fullName !== '') return fullName;
  const username = text(person.username);
  return username === '' ? translateAdmin(language, 'admin.value.person.unnamed') : `@${username}`;
}

export function guestLabel(displayName: string | null | undefined, language: AdminLanguage): string {
  const name = text(displayName);
  return name === '' ? translateAdmin(language, 'admin.value.guest.unnamed') : name;
}

/** `@username`, ou `null` : le secondaire d'une personne n'est jamais inventé. */
export function personSecondary(username: string | null | undefined): string | null {
  const name = text(username);
  return name === '' ? null : `@${name}`;
}

export function personInitials(label: string): string {
  const words = label
    .replace(/^@/, '')
    .split(/\s+/)
    .filter((word) => word !== '');
  const initials = words
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('');
  return initials === '' ? '?' : initials.toLocaleUpperCase();
}

export type ConversationNameFields = {
  readonly title?: string | null;
  readonly type?: string | null;
  readonly participants?: readonly PersonNameFields[] | null | undefined;
  /** Le nombre total de membres, quand la charge ne sert qu'un aperçu des premiers. */
  readonly total?: number | null | undefined;
};

export function conversationLabel(conversation: ConversationNameFields, language: AdminLanguage): string {
  const title = text(conversation.title);
  if (title !== '') return title;

  const names = (conversation.participants ?? []).map((person) => personLabel(person, language));
  if (names.length === 0) return translateAdmin(language, 'admin.value.conversation.untitled');

  const list = new Intl.ListFormat(language, { style: 'long', type: 'conjunction' });
  const total = Math.max(conversation.total ?? names.length, names.length);
  const shown = names.slice(0, 2);
  const rest = total - shown.length;
  if (rest <= 0 || (total <= 3 && names.length >= total)) return list.format(names.slice(0, 3));

  const head = shown.join(', ');
  return rest === 1
    ? translateAdmin(language, 'admin.value.conversation.moreOne', { names: head })
    : translateAdmin(language, 'admin.value.conversation.moreMany', { names: head, count: String(rest) });
}

export function shareLinkLabel(link: { readonly name?: string | null }, language: AdminLanguage): string {
  const name = text(link.name);
  return name === '' ? translateAdmin(language, 'admin.value.shareLink.unnamed') : name;
}

export function trackingLinkLabel(
  link: { readonly name?: string | null; readonly campaign?: string | null },
  language: AdminLanguage,
): string {
  const name = text(link.name);
  if (name !== '') return name;
  const campaign = text(link.campaign);
  return campaign === '' ? translateAdmin(language, 'admin.value.trackingLink.unnamed') : campaign;
}

export function postLabel(
  post: { readonly type?: string | null; readonly author?: PersonNameFields | null },
  language: AdminLanguage,
): string {
  return translateAdmin(language, 'admin.value.post.by', {
    type: interpretPostType(post.type, language).label,
    author: personLabel(post.author, language),
  });
}

/** Un extrait lisible : espaces repliés, coupé sur `max` caractères (80 par défaut) avec « … ». */
export function excerptOf(content: string | null | undefined, max = 80): string | null {
  const flat = text(content).replace(/\s+/g, ' ');
  if (flat === '') return null;
  const characters = Array.from(flat);
  return characters.length <= max ? flat : `${characters.slice(0, max - 1).join('').trimEnd()}…`;
}

export function reportLabel(report: { readonly type?: string | null }, language: AdminLanguage): string {
  return translateAdmin(language, 'admin.value.report.titled', { reason: interpretReportType(report.type, language).label });
}

export function invitationLabel(
  invitation: { readonly sender?: PersonNameFields | null; readonly recipient?: PersonNameFields | null },
  language: AdminLanguage,
): string {
  return translateAdmin(language, 'admin.value.invitation.label', {
    sender: personLabel(invitation.sender, language),
    recipient: personLabel(invitation.recipient, language),
  });
}

/** Un booléen DIT en une phrase propre au champ : jamais `true`/`false`. */
export function booleanPhrase(
  value: boolean | null | undefined,
  phrases: { readonly yes: string; readonly no: string; readonly unknown?: string },
  language: AdminLanguage,
): string {
  if (value === true) return phrases.yes;
  if (value === false) return phrases.no;
  return phrases.unknown ?? translateAdmin(language, 'admin.value.unknown');
}
