import type { SessionState } from '@/lib/api/session';

import {
  GUEST_KIND_EXTENSIONS,
  GUEST_KIND_MAX_BYTES,
  WORLD_GUEST_KINDS,
  WORLD_LINK_IDENTIFIER,
  guestKindOfMimeType,
  isGuestKind,
  type GuestKind,
} from './guest-attachment-kinds';

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
export function guestAttachmentKindsFor(session: SessionState, conversationId: string): readonly GuestKind[] | null {
  if (session.status !== 'guest' || session.guest.conversationId !== conversationId) return null;
  const served = session.guest.attachmentKinds;
  const ceiling = session.guest.link === WORLD_LINK_IDENTIFIER ? WORLD_GUEST_KINDS : null;
  if (ceiling === null) return served === undefined ? null : served;
  if (served === undefined || served === null) return [...ceiling];
  return served.filter((kind) => ceiling.includes(kind));
}

const ACCEPT_TYPES: Readonly<Record<GuestKind, readonly string[]>> = {
  text: ['text/plain'],
  audio: ['audio/*'],
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  pdf: ['application/pdf'],
};

/** L'attribut `accept` d'un sélecteur qui ne propose que ces familles. */
export function guestAcceptAttribute(kinds: readonly GuestKind[]): string {
  return kinds.flatMap((kind) => [...GUEST_KIND_EXTENSIONS[kind].map((extension) => `.${extension}`), ...ACCEPT_TYPES[kind]]).join(',');
}

export type GuestAttachmentVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: 'kind' | 'size' };

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
};

/** La famille d'un fichier : son type déclaré quand il en nomme une, sinon son extension. */
function kindOfFile(file: File): GuestKind | null {
  const declared = guestKindOfMimeType(file.type);
  if (declared !== null) return declared;
  const extension = extensionOf(file.name);
  const byExtension = Object.entries(GUEST_KIND_EXTENSIONS).find(([, extensions]) => extensions.includes(extension));
  const kind: unknown = byExtension?.[0];
  return isGuestKind(kind) ? kind : null;
}

/**
 * Ce fichier passe-t-il chez un invité restreint ? La famille se lit sur le
 * type déclaré, l'extension ne servant que quand le navigateur n'en déclare
 * aucun qu'on reconnaisse ; le plafond de taille est celui que la passerelle
 * applique (25 Mio).
 */
export function guestAttachmentVerdict(file: File, kinds: readonly GuestKind[]): GuestAttachmentVerdict {
  const kind = kindOfFile(file);
  if (kind === null || !kinds.includes(kind)) return { ok: false, reason: 'kind' };
  if (file.size > GUEST_KIND_MAX_BYTES) return { ok: false, reason: 'size' };
  return { ok: true };
}
