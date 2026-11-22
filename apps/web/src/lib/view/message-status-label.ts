import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

import type { Delivery } from './message';

/**
 * L'ÉTAT D'ENVOI DIT DANS LA LANGUE D'INTERFACE — « envoyé », « sent », « remis »… —
 * SITE UNIQUE (itération 92w, épure/a11y #17584).
 *
 * Extrait du pied de rangée (`components/message-blocks.tsx`, qui le RÉEXPORTE
 * pour ses douze consommateurs) pour que le LIBELLÉ D'ACCESSIBILITÉ d'un message
 * (`message-a11y-label.ts`) le PARTAGE au lieu d'en réécrire une jumelle. Cette
 * jumelle (`deliveryWord`) rendait le mot EN DUR EN FRANÇAIS — un lecteur
 * d'écran anglophone, hispanophone, arabophone… entendait « lu », « envoyé » sur
 * SES propres messages, pendant que le reste du libellé descendait bien le
 * catalogue — et elle avait même divergé du pied de rangée EN français
 * (« distribué » contre « remis » pour `delivered`). Une seule table, une seule
 * descente, le vocabulaire que l'œil lit déjà.
 */
const STATUS_KEY = {
  pending: 'message.status.pending',
  sent: 'message.status.sent',
  delivered: 'message.status.delivered',
  read: 'message.status.read',
} as const satisfies Record<Delivery, InterfaceCatalogKey>;

export function statusLabel(status: Delivery, language: InterfaceLanguage = currentInterfaceLanguage()): string {
  return translate(language, STATUS_KEY[status]);
}
