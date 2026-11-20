const SERIALIZED_ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': '\u00a0',
};

/**
 * Défait, en UNE passe, les entités qu'une sérialisation HTML pose sur du texte (`&amp;`, `&lt;`, `&gt;`,
 * `&quot;`, `&#39;`, `&nbsp;`). Une seule passe : « &amp;lt; » rend « &lt; », jamais « < ».
 */
export function unescapeSerializedText(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#39|#x27|nbsp);/g, (entity) => SERIALIZED_ENTITIES[entity] ?? entity);
}
