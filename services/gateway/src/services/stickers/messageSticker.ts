/**
 * Sticker de message — validation d'entrée et extraction depuis `metadata` (#4823).
 *
 * Le client n'envoie JAMAIS de `metadata` brut : cette enveloppe porte des
 * champs à autorité serveur (postReplyTo, trackingLinks, résumés d'appel)
 * qu'un passthrough permettrait de forger. Les requêtes portent un champ
 * `sticker` dédié, que `parseMessageSticker` valide et que le serveur seul
 * écrit dans `metadata.sticker` — copie BLANCHIE champ par champ, jamais un
 * spread : un objet client peut porter n'importe quoi à côté des quatre clés
 * attendues, et rien de ce « à côté » ne doit atteindre la base.
 *
 * Le sticker voyage en clair, comme `location` : la pièce jointe PNG qui
 * l'accompagne suit le régime de chiffrement des médias, mais ce descripteur
 * n'est que la recette du rendu natif (gabarit + textes + mouvement).
 *
 * Miroir de `services/location/sharedPlace.ts`.
 */
import {
  MESSAGE_STICKER_ANIMATIONS,
  type MessageSticker,
  type MessageStickerAnimation,
} from '@meeshy/shared/types/message-sticker';

const TEMPLATE_ID_MAX_LENGTH = 64;
const TEMPLATE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
const SLOTS_MAX_COUNT = 8;
const SLOT_KEY_MAX_LENGTH = 32;
const SLOT_KEY_PATTERN = /^[a-z][a-zA-Z0-9]*$/;
const SLOT_VALUE_MAX_LENGTH = 200;
const EMOJI_MAX_LENGTH = 16;

const ANIMATIONS: ReadonlySet<string> = new Set(MESSAGE_STICKER_ANIMATIONS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function trimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Un `templateId` malformé REJETTE le sticker plutôt que d'être tronqué : c'est
 * une clé de gabarit qu'iOS résout dans son registre, et une clé tronquée ne
 * désigne rien — servir un sticker « presque bon » afficherait un gabarit vide.
 */
function parseTemplateId(value: unknown): { ok: true; value?: string } | { ok: false } {
  if (value === undefined) return { ok: true };
  const trimmed = trimmedString(value);
  if (trimmed === null) return { ok: true };
  if (trimmed.length > TEMPLATE_ID_MAX_LENGTH || !TEMPLATE_ID_PATTERN.test(trimmed)) return { ok: false };
  return { ok: true, value: trimmed };
}

/**
 * Les slots sont les TEXTES du gabarit. Une clé hors forme ou une valeur trop
 * longue rejette le sticker entier : les slots d'un gabarit sont nommés par
 * le gabarit, une clé inconnue ne peut être que forgée. Un slot vide après
 * `trim` est simplement omis ; des slots tous vides ⇒ pas de clé `slots`.
 */
function parseSlots(value: unknown): { ok: true; value?: Readonly<Record<string, string>> } | { ok: false } {
  if (value === undefined) return { ok: true };
  if (!isPlainObject(value)) return { ok: false };
  const entries = Object.entries(value);
  if (entries.length > SLOTS_MAX_COUNT) return { ok: false };

  const wellFormed = entries.every(([key, raw]) =>
    key.length <= SLOT_KEY_MAX_LENGTH && SLOT_KEY_PATTERN.test(key) &&
    typeof raw === 'string' && raw.trim().length <= SLOT_VALUE_MAX_LENGTH
  );
  if (!wellFormed) return { ok: false };

  const kept = entries.flatMap(([key, raw]) => {
    const text = typeof raw === 'string' ? raw.trim() : '';
    return text.length > 0 ? [[key, text] as const] : [];
  });
  if (kept.length === 0) return { ok: true };
  return { ok: true, value: Object.fromEntries(kept) };
}

function parseAnimation(value: unknown): { ok: true; value?: MessageStickerAnimation } | { ok: false } {
  if (value === undefined) return { ok: true };
  if (typeof value !== 'string' || !ANIMATIONS.has(value)) return { ok: false };
  return { ok: true, value: value as MessageStickerAnimation };
}

function parseEmoji(value: unknown): { ok: true; value?: string } | { ok: false } {
  if (value === undefined) return { ok: true };
  if (typeof value !== 'string') return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true };
  if (trimmed.length > EMOJI_MAX_LENGTH) return { ok: false };
  return { ok: true, value: trimmed };
}

/**
 * Valide une entrée CLIENT (le champ `sticker` d'une requête de message).
 * Rend `null` — pas de sticker — dès qu'une borne est franchie ou qu'il n'y a
 * ni gabarit ni emoji : un sticker sans rien à rendre n'existe pas, et un
 * refus silencieux vaut mieux qu'un message rejeté pour une décoration.
 */
export function parseMessageSticker(input: unknown): MessageSticker | null {
  if (!isPlainObject(input)) return null;

  const templateId = parseTemplateId(input['templateId']);
  const slots = parseSlots(input['slots']);
  const animation = parseAnimation(input['animation']);
  const emoji = parseEmoji(input['emoji']);
  if (!templateId.ok || !slots.ok || !animation.ok || !emoji.ok) return null;
  if (templateId.value === undefined && emoji.value === undefined) return null;

  return {
    ...(templateId.value !== undefined ? { templateId: templateId.value } : {}),
    ...(slots.value !== undefined ? { slots: slots.value } : {}),
    ...(animation.value !== undefined ? { animation: animation.value } : {}),
    ...(emoji.value !== undefined ? { emoji: emoji.value } : {}),
  };
}

/**
 * Relit `metadata.sticker` tel que le serveur l'a écrit (Prisma `Json?`, forme
 * inconnue au type). Repasse par `parseMessageSticker` : ce qui sort de la base
 * n'est pas plus digne de confiance que ce qui y entre, une ligne antérieure au
 * durcissement d'une borne ne doit pas la contourner à la relecture.
 */
export function stickerFromMetadata(metadata: unknown): MessageSticker | null {
  if (!isPlainObject(metadata)) return null;
  if (!('sticker' in metadata)) return null;
  return parseMessageSticker(metadata['sticker']);
}

/**
 * Hisse `metadata.sticker` en champ racine `sticker` sur UNE entité. Miroir de
 * `hoistLocationOnto` — source unique pour tous les payloads REST/socket, afin
 * qu'une surface de lecture n'oublie pas le hoist qu'une autre applique.
 * Sans sticker, rend l'entité TELLE QUELLE : aucune clé `sticker: undefined`
 * ne vient élargir le jeu de clés servi.
 *
 * Contrainte `object` plutôt que `{ metadata?: unknown }` : un type dont tous
 * les membres sont optionnels est « faible » pour le compilateur, qui refuse
 * alors toute ligne SANS `metadata` — or un `select` qui ne charge pas la
 * colonne produit exactement une telle ligne, et elle doit rester hissable
 * (no-op) sans cast au site d'appel.
 */
export function hoistStickerOnto<T extends object>(entity: T): T & { sticker?: MessageSticker } {
  const sticker = stickerFromMetadata((entity as { metadata?: unknown }).metadata);
  if (!sticker) return entity;
  return { ...entity, sticker };
}
