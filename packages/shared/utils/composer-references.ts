import type {
  ComposerReference,
  PostReferenceDisplay,
  PostReferenceInput,
} from '../types/post-reference.js';

/**
 * Les modes qu'un CLIENT peut déclarer. INLINE en est absent : le serveur le
 * dérive en relisant le texte, et le déclarer ouvrirait un second chemin vers
 * le même fait, que le premier désaccord ferait diverger.
 */
export const DECLARABLE_DISPLAYS: readonly Exclude<PostReferenceDisplay, 'INLINE'>[] = [
  'PINNED',
  'NOTE',
  'SILENT',
];

/**
 * Ajoute une personne, ou change son mode si elle est déjà là.
 *
 * EN PLACE, pas en fin de liste : choisir un mode et en changer sont le même
 * geste côté UI, et voir la pastille sauter au bout de la rangée à chaque
 * changement donnerait l'impression d'avoir ajouté quelqu'un.
 */
export function upsertReference(
  reference: ComposerReference,
  references: readonly ComposerReference[]
): ComposerReference[] {
  const key = reference.username.toLowerCase();
  const index = references.findIndex((r) => r.username.toLowerCase() === key);
  if (index === -1) return [...references, { ...reference, username: key }];

  return references.map((r, i) => (i === index ? { ...r, display: reference.display } : r));
}

/** Retire une personne. Insensible à la casse — le serveur résout de même. */
export function removeReference(
  username: string,
  references: readonly ComposerReference[]
): ComposerReference[] {
  const key = username.toLowerCase();
  return references.filter((r) => r.username.toLowerCase() !== key);
}

/** Ce que la publication DÉCLARE au serveur : les non-INLINE, et elles seules. */
export function referencePayload(
  references: readonly ComposerReference[]
): PostReferenceInput[] {
  return references.flatMap((reference) => {
    if (reference.display === 'INLINE') return [];
    const display = reference.display;
    return [reference.userId ? { userId: reference.userId, display } : { username: reference.username, display }];
  });
}

/**
 * Retire un `@handle` du texte, avec l'espace qu'il laisserait derrière lui.
 *
 * C'est la transition INLINE → autre chose : passer une référence en note ou en
 * silence n'a de sens que si le pseudo quitte la phrase. Frontière de mot à
 * droite : `@alice` ne doit pas emporter `@alicia`.
 */
export function removingHandle(username: string, text: string): string {
  const escaped = username.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const pattern = new RegExp(`\\s*@${escaped}(?![\\p{L}\\p{N}_.-])`, 'giu');
  return text.replace(pattern, '').trim();
}
