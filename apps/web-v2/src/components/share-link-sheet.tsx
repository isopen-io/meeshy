import { useState } from 'react';

import { Sheet, SheetEmpty } from '@/components/sheet';
import type { ConversationsDeps } from '@/lib/api/conversations';
import type { Conversation } from '@/lib/api/types';
import { eligibleForShareLink } from '@/lib/view/share-link-eligibility';
import { titleOf } from '@/lib/view/conversation';
import { partagerInvitation, type PortailPartage } from '@/lib/view/invitation';

/**
 * **LA FEUILLE « CRÉER UN LIEN DE PARTAGE »** (#5652, bloc D) — miroir
 * `ShareLinkPickerSheet` (`ConversationListView.swift:2106-2160`) : liste les
 * conversations ÉLIGIBLES (`canCreateShareLink`), sélectionner l'une d'elles
 * crée le lien IMMÉDIATEMENT (`POST /api/v1/links`, § 3.3) et le PARTAGE — un
 * geste, un effet, jamais un second écran de réglages (ceux-ci restent un
 * écran de plus, hors lot § 1.4).
 *
 * **Le port se charge au GESTE, pas avec l'écran d'accueil** (#6361). Cette
 * feuille vit dans l'en-tête de la liste des conversations ; le port des liens
 * de partage porte aussi la lecture de « Mes liens » (décodeurs, résumé,
 * brouillon validé). Importé en statique, il pesait 2,6 Ko gzip sur chaque
 * ouverture de l'app pour un geste rare.
 */

export type ShareLinkSheetProps = {
  readonly conversations: readonly Conversation[];
  readonly viewerId: string;
  readonly deps: ConversationsDeps;
  readonly origin: string;
  readonly onClose: () => void;
  readonly portail?: PortailPartage;
  /** Retour utilisateur — même contrat que `RETOUR_INVITATION` : une
   * chaîne à annoncer, ou `null` quand le système a déjà parlé (feuille de
   * partage native, annulation). */
  readonly onFeedback?: (message: string | null) => void;
};

export function ShareLinkSheet({ conversations, viewerId, deps, origin, onClose, portail, onFeedback }: ShareLinkSheetProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const eligibles = eligibleForShareLink(conversations);

  const onSelect = async (conversationId: string): Promise<void> => {
    setBusyId(conversationId);
    try {
      const { createShareLink, shareLinkUrl } = await import('@/lib/api/links');
      const result = await createShareLink(deps, conversationId);
      if (!result.ok) {
        onFeedback?.('Impossible de créer le lien — réessayez dans un instant.');
        return;
      }
      const url = shareLinkUrl(origin, result.data.linkId);
      const issue = await partagerInvitation(url, portail);
      if (issue === 'copie') onFeedback?.('Lien copié — il ne reste qu’à le coller.');
      if (issue === 'indisponible') onFeedback?.('Impossible de partager ici. Copiez l’adresse de cette page.');
      onClose();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Sheet title="Créer un lien de partage" onClose={onClose}>
      {eligibles.length === 0 ? (
        <SheetEmpty label="Aucune conversation ne peut recevoir un lien pour l’instant." />
      ) : (
        eligibles.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              disabled={busyId !== null}
              onClick={() => void onSelect(c.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-50"
              style={{ minHeight: 44 }}
            >
              <span className="flex-1 truncate text-body font-medium" style={{ color: 'var(--color-ios-ink)' }}>
                {titleOf(c, viewerId)}
              </span>
              {busyId === c.id ? <span className="text-caption" style={{ color: 'var(--color-ios-ink-3)' }}>…</span> : null}
            </button>
          </li>
        ))
      )}
    </Sheet>
  );
}
