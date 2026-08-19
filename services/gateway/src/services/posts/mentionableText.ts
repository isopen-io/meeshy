/**
 * Les fragments de texte dans lesquels un `@handle` compte comme référence
 * INLINE.
 *
 * DEUX sources, et c'est le cœur de cette unité : une story n'écrit pas son
 * texte dans `content`. La légende y vit, mais le texte porté par la slide vit
 * dans `storyEffects.textObjects[].text` — que la résolution de mentions ne
 * lisait pas du tout. Taper `@alice` dans un objet texte ne produisait donc
 * AUCUNE ligne `PostMention`, aucune notification, aucun surlignage.
 *
 * Les BADGES de référence sont exclus. Un badge PINNED est lui aussi un objet
 * texte portant `@pseudo` — c'est ce qui lui donne gratuitement déplacement,
 * rotation, z-order et export. Le lire ici le re-dériverait en INLINE à chaque
 * édition, écrasant le mode que l'auteur a choisi. `referenceUserId` est
 * exactement ce qui distingue un badge d'une phrase.
 *
 * `storyEffects` arrive en `unknown` : c'est un Json Prisma, validé par un
 * schéma `passthrough()` qui n'en garantit pas la forme. Tout ce qui n'est pas
 * lisible est ignoré plutôt que de faire échouer une publication.
 */

type MentionableTextParams = {
  readonly content?: string | null;
  readonly storyEffects?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Le texte d'un objet de canevas, ou `null` s'il n'y en a pas à lire — objet
 * malformé, texte vide, ou badge de référence.
 */
function readableText(entry: unknown): string | null {
  if (!isRecord(entry)) return null;
  if (typeof entry.referenceUserId === 'string' && entry.referenceUserId.length > 0) return null;
  const text = entry.text;
  return typeof text === 'string' && text.length > 0 ? text : null;
}

export function collectMentionableText(params: MentionableTextParams): string[] {
  const caption = params.content && params.content.length > 0 ? [params.content] : [];

  if (!isRecord(params.storyEffects)) return caption;
  const objects = params.storyEffects.textObjects;
  if (!Array.isArray(objects)) return caption;

  return [
    ...caption,
    ...objects
      .map(readableText)
      .filter((text): text is string => text !== null),
  ];
}
