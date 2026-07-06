/**
 * Source unique des initiales d'avatar à partir d'un nom (chaîne).
 *
 * Sémantique canonique (alignée sur l'état de l'art — Telegram/Discord/Slack) :
 * - retire un éventuel `@` en tête (noms de type handle), `trim`, découpe sur les espaces ;
 * - aucun mot → `fallback` ;
 * - 1 mot → 2 premières lettres ;
 * - multi-mot → 1ʳᵉ lettre du 1er + 1ʳᵉ lettre du dernier mot ;
 * - toujours en majuscules, null/undefined-safe.
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
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
