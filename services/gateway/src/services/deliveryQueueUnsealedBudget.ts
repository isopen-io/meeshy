import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';

/**
 * LE BUDGET DU CLAIR GARDÉ FAUTE DE SCEAU (#19945).
 *
 * #19827 garde dans le tas l'entrée d'une conversation chiffrée au repos qu'on
 * n'a pas PU sceller, et une cause inconnue y est transitoire par défaut. Pour
 * une cause ISOLÉE, c'est juste : détruire une livraison demande une raison.
 * Pour une cause SYSTÉMATIQUE — un bug qui lève à chaque scellement —, le
 * défaut « garder » devenait une rétention GLOBALE de clair, que seuls les
 * plafonds de la tranche mémoire bornaient : 1 000 comptes × 50 entrées =
 * 50 000 charges, pendant 48 h, et rien ne bornait les OCTETS (une charge
 * `message:new` porte texte, traductions et métadonnées : 2 à 10 Ko, soit
 * 100 à 500 Mo, sous une passerelle sans `mem_limit`).
 *
 * Garder protège UNE livraison, pas la flotte. Au-delà du budget, on cesse
 * de garder : l'entrée est détruite (fail-closed sur le volume). Ce qui est
 * perdu est le REJEU, pas le message, que `saveMessage` a écrit avant tout
 * éventail (voir `sealedForStorage`).
 *
 * Les défauts : 5 000 entrées — le dixième de la tranche mémoire, assez pour
 * couvrir les absents d'un incident de quelques minutes — et 16 Mio, soit
 * 3,2 Ko de moyenne à plein compte, et un plafond de tas qui ne dépend plus
 * de la taille des charges.
 */
export type UnsealedBudgetLimits = { readonly maxEntries: number; readonly maxBytes: number };

export const DEFAULT_UNSEALED_BUDGET: UnsealedBudgetLimits = { maxEntries: 5_000, maxBytes: 16 * 1024 * 1024 };

/**
 * Tient les entrées gardées en clair qui vivent ENCORE dans le tas. Elles
 * quittent la tranche mémoire par six portes (drain, purge, balayage, deux
 * évictions, remplacement) : plutôt qu'un oubli à tenir sur chacune, le
 * budget se RAPPROCHE du tas réel au moment où il serait dépassé, et
 * seulement alors — le chemin nominal ne paie rien.
 */
export class UnsealedRetentionBudget {
  private readonly held = new Map<QueuedMessagePayload, number>();

  constructor(
    private readonly limits: UnsealedBudgetLimits,
    private readonly liveSlices: () => Iterable<readonly QueuedMessagePayload[]>,
  ) {}

  admit(entry: QueuedMessagePayload, bytes: number): boolean {
    if (bytes > this.limits.maxBytes) return false;
    if (this.wouldOverflow(bytes)) this.forgetDeparted();
    if (this.wouldOverflow(bytes)) return false;
    this.held.set(entry, bytes);
    return true;
  }

  private wouldOverflow(bytes: number): boolean {
    return this.held.size + 1 > this.limits.maxEntries || this.heldBytes() + bytes > this.limits.maxBytes;
  }

  private heldBytes(): number {
    return [...this.held.values()].reduce((total, bytes) => total + bytes, 0);
  }

  private forgetDeparted(): void {
    const live = new Set([...this.liveSlices()].flat());
    [...this.held.keys()].filter((entry) => !live.has(entry)).forEach((entry) => this.held.delete(entry));
  }
}
