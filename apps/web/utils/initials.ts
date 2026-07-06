/**
 * Source unique des initiales d'avatar à partir d'un nom (chaîne).
 *
 * Sémantique canonique (alignée sur l'état de l'art — Telegram/Discord/Slack) :
 * - retire un éventuel `@` en tête (noms de type handle), `trim`, découpe sur les espaces ;
 * - aucun mot → `fallback` ;
 * - 1 mot → 2 premiers caractères ;
 * - multi-mot → 1ᵉʳ caractère du 1er + 1ᵉʳ caractère du dernier mot ;
 * - toujours en majuscules, null/undefined-safe.
 *
 * Le découpage se fait par **point de code Unicode** (`[...word]`), jamais par
 * unité UTF-16 (`word[0]`) : un nom commençant par un emoji hors BMP (paire de
 * substitution, ex. `'🎨'` = `🎨`) produisait sinon une **demi-paire
 * isolée** (`'\uD83C'`) — un glyphe cassé `�` dans l'avatar. Répandu sur un
 * produit social/chat où les noms d'affichage contiennent des emoji.
 *
 * @param name - Le nom (déjà résolu) à partir duquel dériver les initiales
 * @param fallback - Valeur retournée quand aucun mot exploitable (défaut `'?'`)
 * @returns Les initiales en majuscules
 */
export function getInitials(name: string | null | undefined, fallback: string = '?'): string {
  const cleaned = (name ?? '').replace(/^@+/, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return fallback;
  }

  if (parts.length === 1) {
    return [...parts[0]].slice(0, 2).join('').toUpperCase();
  }

  const first = [...parts[0]][0] ?? '';
  const last = [...parts[parts.length - 1]][0] ?? '';
  return `${first}${last}`.toUpperCase();
}
