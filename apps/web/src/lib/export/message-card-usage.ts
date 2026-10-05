import type { SafeStorage } from '@/lib/storage';

import { FEATURED_TEMPLATE_IDS, parseTemplateId, type MessageCardTemplateId } from './message-card-templates';

/**
 * **LE COMPTEUR D'USAGE DES TEMPLATES** — chaque carte ENREGISTRÉE (galerie
 * ou partage aboutis, jamais un simple aperçu) compte une fois pour son
 * template. Les plus utilisés remontent en tête de la feuille (« Populaires »),
 * la vitrine complète tant que l'appareil a peu exporté.
 *
 * Le compte vit sur l'appareil, comme le format par défaut : c'est une
 * préférence de présentation, sans aucun contenu. Le classement des
 * meilleurs templates entre tous les utilisateurs demande un compte serveur
 * — un suivi, pas ce module.
 */

export type TemplateUsage = Readonly<Partial<Record<MessageCardTemplateId, number>>>;

export const MESSAGE_CARD_USAGE_KEY = 'meeshy.export.message-card.usage';

export function readTemplateUsage(storage: Pick<SafeStorage, 'getItem'>): TemplateUsage {
  try {
    const value: unknown = JSON.parse(storage.getItem(MESSAGE_CARD_USAGE_KEY) ?? '{}');
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, count]) => {
        const id = parseTemplateId(key);
        return id !== null && Number.isInteger(count) && (count as number) > 0 ? [[id, count as number]] : [];
      }),
    );
  } catch {
    return {};
  }
}

export function recordTemplateUse(storage: Pick<SafeStorage, 'getItem' | 'setItem'>, id: MessageCardTemplateId): void {
  const usage = readTemplateUsage(storage);
  storage.setItem(MESSAGE_CARD_USAGE_KEY, JSON.stringify({ ...usage, [id]: (usage[id] ?? 0) + 1 }));
}

/** Les `count` templates à montrer d'abord : les plus utilisés, puis la vitrine. */
export function popularTemplates(usage: TemplateUsage, count: number): readonly MessageCardTemplateId[] {
  const used = (Object.entries(usage) as [MessageCardTemplateId, number][]).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  return [...new Set([...used, ...FEATURED_TEMPLATE_IDS])].slice(0, count);
}
