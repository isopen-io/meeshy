import { NAME_BOUNDARY_LEFT, escapeRegex } from './mention-parser.js';
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
 *
 * La casse d'origine du username SURVIT à l'ajout — jumelle exacte de
 * `ComposerReferences.upsert` (Swift), qui pose `reference` telle quelle sur
 * ce chemin. `User.username` n'est pas normalisé en minuscules ; l'aplatir
 * ici ferait dévier le chip affiché du pseudo réel de la personne. Seule la
 * CLÉ de comparaison est insensible à la casse.
 */
export function upsertReference(
  reference: ComposerReference,
  references: readonly ComposerReference[]
): ComposerReference[] {
  const key = reference.username.toLowerCase();
  const index = references.findIndex((r) => r.username.toLowerCase() === key);
  if (index === -1) return [...references, reference];

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
 *
 * Frontière de mot à GAUCHE {@link NAME_BOUNDARY_LEFT} — la MÊME source que
 * `parseMentions`/`hasMentions` : un `@` précédé d'un caractère de nom
 * appartient à une adresse e-mail (`bob@alice`), n'a jamais été DÉTECTÉ comme
 * mention, et ne doit donc pas être RETIRÉ ici. Sans ce lookbehind, la
 * suppression frappait un span que la détection n'avait jamais reconnu — un
 * drift exactement de la classe que `mention-parser.ts` interdit. Le lookbehind
 * se place APRÈS `\s*` (à hauteur du `@`) : quand une espace précède le handle,
 * le caractère testé est cette espace (frontière propre) ; sans espace, c'est le
 * caractère réellement collé au `@` (lettre d'e-mail ⇒ pas de retrait).
 *
 * `escapeRegex` vient de {@link escapeRegex} (mention-parser) — MÊME source que
 * la détection. La copie locale ajoutait `-` à sa classe d'échappement ; comme
 * le résultat est interpolé HORS d'une classe de caractères et que la regex
 * porte le flag `u`, un `\-` levait `Invalid escape` — `removingHandle` crashait
 * sur TOUT username à tiret (`@marie-claire`), pourtant valide (cf. la regex
 * `/^[a-zA-Z0-9_-]+$/`). Réutiliser le SSOT ferme le drift à sa racine.
 */
export function removingHandle(username: string, text: string): string {
  const escaped = escapeRegex(username);
  const pattern = new RegExp(`\\s*${NAME_BOUNDARY_LEFT}@${escaped}(?![\\p{L}\\p{N}_.-])`, 'giu');
  return text.replace(pattern, '').trim();
}
