/**
 * CE QU'UN INVITÉ PEUT JOINDRE PAR UN LIEN DE PARTAGE (#10001).
 *
 * `ConversationShareLink.allowedAttachmentKinds` liste les familles de pièces
 * jointes ouvertes aux participants ANONYMES venus par ce lien. Les comptes ne
 * sont jamais concernés : ils gardent leurs pièces jointes habituelles.
 *
 * - liste VIDE (la valeur de toute ligne écrite avant la colonne) : aucune
 *   restriction par famille, le comportement d'avant s'applique
 *   (`allowAnonymousFiles` / `allowAnonymousImages`) ;
 * - liste NON VIDE : elle seule décide, et chaque famille se MÉRITE par le
 *   contenu réel du fichier (signature, décodage structurel), jamais par
 *   l'extension ni par le type déclaré. Une valeur inconnue y est ignorée, et
 *   une liste qui ne contient que des inconnues n'ouvre RIEN.
 *
 * La conversation World Wide plafonne la liste à `WORLD_GUEST_ATTACHMENT_KINDS`
 * quoi que porte son lien : la décision vit sur la conversation (#10029).
 *
 * Ce que les clients reçoivent dans les termes du lien
 * (`GET /anonymous/link/:identifier`, `GET /links/:identifier`) est la liste
 * EFFECTIVE (`effectiveGuestAttachmentKinds`) : `null` = pas de restriction par
 * famille, un tableau = les seules familles que le sélecteur de l'invité offre.
 *
 * Ce module ne charge AUCUN schéma (#10038) : un client qui n'a besoin que
 * d'une famille ou d'un code de refus ne paie pas `zod`. Les schémas Zod
 * vivent dans `guest-attachment-kinds.ts`, qui le réexporte.
 */
export const GUEST_ATTACHMENT_KINDS = ['text', 'audio', 'image', 'pdf'] as const;

export type GuestAttachmentKind = (typeof GUEST_ATTACHMENT_KINDS)[number];


const KNOWN_KINDS: readonly string[] = GUEST_ATTACHMENT_KINDS;

/** Une valeur venue du fil est-elle une famille connue ? */
export function isGuestAttachmentKind(value: unknown): value is GuestAttachmentKind {
  return typeof value === 'string' && KNOWN_KINDS.includes(value);
}

/**
 * Le même champ en JSON Schema, pour les réponses Fastify qui servent les
 * termes d'un lien : un champ non déclaré y serait supprimé en silence.
 */
export const allowedAttachmentKindsJsonSchema = {
  type: 'array',
  nullable: true,
  items: { type: 'string', enum: [...GUEST_ATTACHMENT_KINDS] },
  description: 'Familles de pièces jointes ouvertes aux invités ; null = aucune restriction par famille',
} as const;

/** Les codes de refus, stables et localisables, que les trois chemins d'envoi rendent. */
export const GUEST_ATTACHMENT_REFUSAL_CODES = {
  KIND_NOT_ALLOWED: 'GUEST_ATTACHMENT_KIND_NOT_ALLOWED',
  TOO_LARGE: 'GUEST_ATTACHMENT_TOO_LARGE',
} as const;

export type GuestAttachmentRefusalCode =
  (typeof GUEST_ATTACHMENT_REFUSAL_CODES)[keyof typeof GUEST_ATTACHMENT_REFUSAL_CODES];

/**
 * Plafond d'une pièce jointe d'invité sur un lien restreint par famille : la
 * vérification lit le fichier ENTIER (un en-tête ne prouve rien), elle a donc
 * besoin d'une borne. 25 Mio couvrent des heures de voix.
 */
export const GUEST_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

/** Extensions qu'un sélecteur de fichiers peut proposer pour chaque famille. */
export const GUEST_ATTACHMENT_KIND_EXTENSIONS: Readonly<Record<GuestAttachmentKind, readonly string[]>> = {
  text: ['txt'],
  audio: ['mp3', 'm4a', 'mp4', 'aac', 'ogg', 'oga', 'opus', 'webm', 'weba', 'wav'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  pdf: ['pdf'],
};

const RASTER_IMAGE_MIME_TYPES: readonly string[] = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

function baseMimeType(mimeType: string): string {
  return (mimeType.split(';')[0] ?? '').trim().toLowerCase();
}

/**
 * La famille que DÉCLARE un type MIME — jamais une preuve : le serveur la
 * confronte au contenu. Sert au filtrage du sélecteur et à la relecture, à
 * l'envoi, d'une pièce déjà admise.
 */
export function guestAttachmentKindOfMimeType(mimeType: string | null | undefined): GuestAttachmentKind | null {
  if (!mimeType) return null;
  const base = baseMimeType(mimeType);
  if (base === 'text/plain') return 'text';
  if (base.startsWith('audio/')) return 'audio';
  if (RASTER_IMAGE_MIME_TYPES.includes(base)) return 'image';
  if (base === 'application/pdf') return 'pdf';
  return null;
}

/** Ne garde que les familles connues, dans l'ordre et sans doublon. */
function knownKinds(kinds: readonly string[]): readonly GuestAttachmentKind[] {
  return GUEST_ATTACHMENT_KINDS.filter((kind) => kinds.includes(kind));
}

export type GuestAttachmentPolicySource = {
  readonly allowedAttachmentKinds?: readonly string[] | null;
  readonly conversationIdentifier?: string | null;
};

/**
 * Les familles qu'un invité de ce lien peut joindre, ou `null` quand le lien
 * ne restreint pas par famille. `ceilings` porte les plafonds décidés sur la
 * CONVERSATION (World Wide) : ils s'appliquent même quand le lien ne dit rien,
 * et le lien ne peut que les resserrer.
 */
export function effectiveGuestAttachmentKinds(
  source: GuestAttachmentPolicySource,
  ceilings: Readonly<Record<string, readonly GuestAttachmentKind[]>> = {},
): readonly GuestAttachmentKind[] | null {
  const declared = source.allowedAttachmentKinds && source.allowedAttachmentKinds.length > 0
    ? knownKinds(source.allowedAttachmentKinds)
    : null;
  const ceiling = source.conversationIdentifier ? ceilings[source.conversationIdentifier] : undefined;
  if (!ceiling) return declared;
  return declared ? declared.filter((kind) => ceiling.includes(kind)) : [...ceiling];
}
