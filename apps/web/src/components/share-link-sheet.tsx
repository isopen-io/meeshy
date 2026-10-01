import { useEffect, useState } from 'react';

import { SendSheetFrame } from '@/components/send-sheet-frame';
import type { ConversationsDeps } from '@/lib/api/conversations';
import type { Conversation } from '@/lib/api/types';
import { loadSendSheetCatalog, translateSendSheet } from '@/lib/i18n-send-sheet-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { eligibleForShareLink } from '@/lib/view/share-link-eligibility';
import { titleOf } from '@/lib/view/conversation';
import { partagerInvitation, type PortailPartage } from '@/lib/view/invitation';

/**
 * **LA FEUILLE « CRÉER UN LIEN DE PARTAGE »** (#5652, bloc D) — miroir
 * `ShareLinkPickerSheet` (`ConversationListView.swift:2106-2160`) : liste les
 * conversations ÉLIGIBLES (`canCreateShareLink`), sélectionner l'une d'elles
 * crée le lien IMMÉDIATEMENT (`POST links.root`, § 3.3) et le PARTAGE — un
 * geste, un effet, jamais un second écran de réglages (ceux-ci restent un
 * écran de plus, hors lot § 1.4).
 *
 * **Le port se charge au GESTE, pas avec l'écran d'accueil** (#6361). Cette
 * feuille vit dans l'en-tête de la liste des conversations ; le port des liens
 * de partage porte aussi la lecture de « Mes liens » (décodeurs, résumé,
 * brouillon validé). Importé en statique, il pesait 2,6 Ko gzip sur chaque
 * ouverture de l'app pour un geste rare.
 *
 * **SUR LE CADRE COMMUN DES FEUILLES DE PARTAGE** (#8884, directive porteur
 * 2026-09-30) : `SendSheetFrame` — verre liquide, « Annuler » lisible à gauche,
 * Échap et retour Android par le même chemin — comme la feuille d'envoi. Les
 * cinq textes, jusque-là du français codé en dur, viennent du catalogue
 * `shareLinkSheet.*`, chargé à l'ouverture : tant qu'il arrive (un tour de
 * boucle), la modale est déjà là, ses libellés vides plutôt qu'absents — une
 * feuille ouverte par un tap ne se fait pas attendre.
 */

type Say = (key: 'shareLinkSheet.title' | 'shareLinkSheet.empty' | 'shareLinkSheet.createFailed' | 'shareLinkSheet.copied' | 'shareLinkSheet.unavailable' | 'sendSheet.cancel') => string;

function catalogReady(language: InterfaceLanguage): boolean {
  try {
    translateSendSheet(language, 'sendSheet.cancel');
    return true;
  } catch {
    return false;
  }
}

function useSendSheetCatalog(language: InterfaceLanguage): Say {
  const [ready, setReady] = useState(() => catalogReady(language));
  useEffect(() => {
    if (ready) return;
    let live = true;
    void loadSendSheetCatalog(language).then(
      () => live && setReady(true),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [language, ready]);
  /* Lu à l'APPEL, pas figé au rendu : un retour annoncé après l'arrivée du
     catalogue porte son texte même si le geste est parti avant. */
  return (key) => {
    try {
      return translateSendSheet(language, key);
    } catch {
      return '';
    }
  };
}

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
  const say = useSendSheetCatalog(currentInterfaceLanguage());
  const eligibles = eligibleForShareLink(conversations);

  const onSelect = async (conversationId: string): Promise<void> => {
    setBusyId(conversationId);
    try {
      const { createShareLink, shareLinkUrl } = await import('@/lib/api/links');
      const result = await createShareLink(deps, conversationId);
      if (!result.ok) {
        onFeedback?.(say('shareLinkSheet.createFailed'));
        return;
      }
      const url = shareLinkUrl(origin, result.data.linkId);
      const issue = await partagerInvitation(url, portail);
      if (issue === 'copie') onFeedback?.(say('shareLinkSheet.copied'));
      if (issue === 'indisponible') onFeedback?.(say('shareLinkSheet.unavailable'));
      onClose();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SendSheetFrame title={say('shareLinkSheet.title')} cancelLabel={say('sendSheet.cancel')} onClose={onClose}>
      {eligibles.length === 0 ? (
        <p className="px-4 py-6 text-center text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
          {say('shareLinkSheet.empty')}
        </p>
      ) : (
        <ul className="pb-safe">
          {eligibles.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void onSelect(c.id)}
                className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-start disabled:opacity-50"
              >
                <span className="flex-1 truncate text-body font-medium" style={{ color: 'var(--color-ios-ink)' }}>
                  {titleOf(c, viewerId)}
                </span>
                {busyId === c.id ? (
                  <span className="text-caption" style={{ color: 'var(--color-ios-ink-3)' }}>
                    …
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </SendSheetFrame>
  );
}
