'use client';

import { memo } from 'react';
import { Check } from 'lucide-react';
import { useMessageReadStatus, useReadStatusSummary } from '@/stores/conversation-ui-store';
import { usePrivacyPreferences } from '@/stores/user-preferences-store';

/**
 * Coches de livraison/lecture sous une bulle envoyée par l'utilisateur.
 *
 * Extrait de `MessageContent` pour être testable isolément — la règle de
 * réciprocité ci-dessous mérite d'être verrouillée par des tests.
 *
 * **Réciprocité `showReadReceipts`** : qui ne partage pas ses accusés ne voit
 * pas ceux des autres. Le serveur applique déjà l'autre moitié — retirer des
 * réponses les participants opt-out — parce qu'elle protège une donnée
 * personnelle et doit résister à un client modifié.
 *
 * Celle-ci est une règle d'ÉQUITÉ, pas de confidentialité : ce qu'elle masque a
 * été consenti par ceux qui l'ont émis, il n'y a rien à protéger contre
 * l'utilisateur opt-out. D'où son application côté client, où elle vaut
 * uniformément pour le REST et le temps réel — la placer sur le REST seul
 * aurait donné des coches qui bougent en direct au-dessus d'une feuille de
 * détail restée vide.
 *
 * @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
 */
export const DeliveryIndicator = memo(function DeliveryIndicator({
  isOwnMessage,
  messageId,
  conversationId,
}: {
  isOwnMessage: boolean;
  messageId: string;
  conversationId: string;
}) {
  const messageSummary = useMessageReadStatus(messageId);
  const conversationSummary = useReadStatusSummary(conversationId);
  const { preferences } = usePrivacyPreferences();

  if (!isOwnMessage) return null;

  // Rien du tout, pas même la coche « envoyé » : l'utilisateur a renoncé à
  // cette information dans les deux sens. En afficher une partie serait
  // incohérent avec la feuille de détail, vide de son côté.
  if (!preferences.showReadReceipts) return null;

  // Per-message status takes priority, fallback to conversation-level summary
  const summary = messageSummary || conversationSummary;

  if (!summary) {
    // No status info yet — show single gray check (sent)
    return <Check className="h-3 w-3 text-white/60 flex-shrink-0" />;
  }

  const { totalMembers, deliveredCount, readCount } = summary;

  // Read by all: double blue/green checks
  if (totalMembers > 0 && readCount >= totalMembers) {
    return (
      <span className="inline-flex -space-x-1.5 flex-shrink-0">
        <Check className="h-3 w-3 text-sky-300" />
        <Check className="h-3 w-3 text-sky-300" />
      </span>
    );
  }

  // At least some have read: double blue checks
  if (readCount > 0) {
    return (
      <span className="inline-flex -space-x-1.5 flex-shrink-0">
        <Check className="h-3 w-3 text-sky-300" />
        <Check className="h-3 w-3 text-sky-300" />
      </span>
    );
  }

  // Delivered but not read: double gray/white checks
  if (deliveredCount > 0) {
    return (
      <span className="inline-flex -space-x-1.5 flex-shrink-0">
        <Check className="h-3 w-3 text-white/60" />
        <Check className="h-3 w-3 text-white/60" />
      </span>
    );
  }

  // Sent only: single gray/white check
  return <Check className="h-3 w-3 text-white/60 flex-shrink-0" />;
});
