import type { SessionState } from '@/lib/api/session';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import {
  GUEST_ATTACHMENT_KIND_EXTENSIONS,
  GUEST_ATTACHMENT_MAX_BYTES,
  guestAttachmentKindOfMimeType,
  isGuestAttachmentKind,
  type GuestAttachmentKind,
} from '@meeshy/shared/types/guest-attachment-kind-rules';
import { WORLD_GUEST_ATTACHMENT_KINDS, WORLD_SHARE_LINK_IDENTIFIER } from '@meeshy/shared/types/world-identity';

/**
 * CE QU'UN INVITÉ PEUT JOINDRE DANS CE FIL (#10003, planche « Attach »).
 *
 * La passerelle juge le CONTENU réel (#10001) et reste l'autorité ; ce module
 * décide de ce que le composeur OFFRE et de ce qu'il refuse en le disant, avant
 * que les octets ne partent. Un compte n'est jamais restreint par famille.
 */

/**
 * Les familles qui gouvernent le fil `conversationId`, ou `null` quand rien ne
 * restreint par famille (compte, invité d'une autre conversation, lien sans
 * familles). Une session d'invité World Wide enregistrée avant le champ prend
 * le plafond de la conversation ; des familles servies plus larges que ce
 * plafond y sont resserrées — même règle qu'iOS (#10006).
 */
export function guestAttachmentKindsFor(session: SessionState, conversationId: string): readonly GuestAttachmentKind[] | null {
  if (session.status !== 'guest' || session.guest.conversationId !== conversationId) return null;
  const stored = session.guest.attachmentKinds;
  const served = stored === undefined || stored === null ? stored : stored.filter(isGuestAttachmentKind);
  const ceiling = session.guest.link === WORLD_SHARE_LINK_IDENTIFIER ? WORLD_GUEST_ATTACHMENT_KINDS : null;
  if (ceiling === null) return served === undefined ? null : served;
  if (served === undefined || served === null) return [...ceiling];
  return served.filter((kind) => ceiling.includes(kind));
}

const ACCEPT_TYPES: Readonly<Record<GuestAttachmentKind, readonly string[]>> = {
  text: ['text/plain'],
  audio: ['audio/*'],
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  pdf: ['application/pdf'],
};

/** L'attribut `accept` d'un sélecteur qui ne propose que ces familles. */
export function guestAcceptAttribute(kinds: readonly GuestAttachmentKind[]): string {
  return kinds.flatMap((kind) => [...GUEST_ATTACHMENT_KIND_EXTENSIONS[kind].map((extension) => `.${extension}`), ...ACCEPT_TYPES[kind]]).join(',');
}

export type GuestAttachmentVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: 'kind' | 'size' };

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
};

/** La famille d'un fichier : son type déclaré quand il en nomme une, sinon son extension. */
function kindOfFile(file: File): GuestAttachmentKind | null {
  const declared = guestAttachmentKindOfMimeType(file.type);
  if (declared !== null) return declared;
  const extension = extensionOf(file.name);
  const byExtension = Object.entries(GUEST_ATTACHMENT_KIND_EXTENSIONS).find(([, extensions]) => extensions.includes(extension));
  const kind: unknown = byExtension?.[0];
  return isGuestAttachmentKind(kind) ? kind : null;
}

/**
 * Ce fichier passe-t-il chez un invité restreint ? La famille se lit sur le
 * type déclaré, l'extension ne servant que quand le navigateur n'en déclare
 * aucun qu'on reconnaisse ; le plafond de taille est celui que la passerelle
 * applique (25 Mio).
 */
export function guestAttachmentVerdict(file: File, kinds: readonly GuestAttachmentKind[]): GuestAttachmentVerdict {
  const kind = kindOfFile(file);
  if (kind === null || !kinds.includes(kind)) return { ok: false, reason: 'kind' };
  if (file.size > GUEST_ATTACHMENT_MAX_BYTES) return { ok: false, reason: 'size' };
  return { ok: true };
}

/**
 * Une PORTE du composeur (tuile, bouton de la barre) désignée par un type —
 * `image/*`, `audio/*`, ou le type précis d'un fichier — est-elle ouverte à
 * cet invité ? Une famille ouverte prime sur les droits instantanés de sa
 * jonction (#10029) : seul le lien en décide.
 */
export function guestKindsAllowMime(kinds: readonly GuestAttachmentKind[], mimeType: string | undefined): boolean {
  if (mimeType === 'image/*') return kinds.includes('image');
  if (mimeType === 'audio/*') return kinds.includes('audio');
  const kind = guestAttachmentKindOfMimeType(mimeType);
  return kind !== null && kinds.includes(kind);
}

/** Ce que l'hôte du composeur sait d'un invité restreint : ses familles, et le titre du fil (« Partager dans … »). */
export type GuestAttachments = { readonly kinds: readonly GuestAttachmentKind[]; readonly title: string };

const INLINE_KEY = {
  text: 'composer.guest.inline.text',
  audio: 'composer.guest.inline.audio',
  image: 'composer.guest.inline.image',
  pdf: 'composer.guest.inline.pdf',
} as const satisfies Readonly<Record<GuestAttachmentKind, string>>;

/** Les familles ouvertes, jointes par la conjonction de la langue (« fichiers texte (.txt) et audio »). */
export function guestKindsPhrase(language: InterfaceLanguage, kinds: readonly GuestAttachmentKind[]): string {
  const names = kinds.map((kind) => translate(language, INLINE_KEY[kind]));
  return new Intl.ListFormat(language, { type: 'conjunction', style: 'long' }).format(names);
}

/** Le plafond de taille dit dans la langue (« 25 Mo », « 25 MB »). */
export function guestMaxSizeLabel(language: InterfaceLanguage): string {
  return new Intl.NumberFormat(language, { style: 'unit', unit: 'megabyte', unitDisplay: 'short' }).format(GUEST_ATTACHMENT_MAX_BYTES / (1024 * 1024));
}

/** Pourquoi CE fichier ne passe pas — nommé, avec ce qui passe (planche « Attach »). */
export function guestRefusalText(language: InterfaceLanguage, params: { readonly name: string; readonly reason: 'kind' | 'size'; readonly kinds: readonly GuestAttachmentKind[] }): string {
  return params.reason === 'size'
    ? translate(language, 'composer.guest.refused.size', { name: params.name, max: guestMaxSizeLabel(language) })
    : translate(language, 'composer.guest.refused.kind', { name: params.name, kinds: guestKindsPhrase(language, params.kinds) });
}
