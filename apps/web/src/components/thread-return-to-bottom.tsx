import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import type { ListPaginationState } from '@/lib/lens/pagination';
import {
  THREAD_LOAD_SIGNAL_DELAY_MS,
  threadLoadSignalOf,
  useDelayedSignal,
  type ThreadLoadSignal,
} from '@/lib/view/thread-load-signal';
import type { ThreadChromeSignals } from '@/lib/view/use-thread-chrome-signals';

import { ScrollToBottomButton } from './thread-chrome';

/**
 * Les libellés de l'attente, pris aux catalogues EXISTANTS (aucune clé
 * nouvelle à payer sept fois, #9302) : « Recherche… » est le mot exact d'iOS
 * (`conversation.searching`, `ConversationScrollControlsView`), « Chargement… »
 * le libellé générique d'une page qui arrive.
 */
const LOAD_SIGNAL_TEXT: Readonly<Record<ThreadLoadSignal, 'keypad.searching' | 'media_hub.loading'>> = {
  seeking: 'keypad.searching',
  newer: 'media_hub.loading',
};

/**
 * **LE RETOUR EN BAS, ET CE QU'IL DIT PENDANT QUE LE FIL CHARGE** (#9302) —
 * l'écran (`routes/thread.tsx`, hors budget pour tout ajout) ne fait que
 * câbler ce composant : le signal (`threadLoadSignalOf`, retardé par
 * `useDelayedSignal`) se calcule ICI, dans la feuille qui l'affiche — même
 * motif qu'iOS, qui isole l'état d'animation dans la sous-vue.
 *
 * L'annonce passe par une région `role="status"` TOUJOURS montée,
 * visuellement masquée : une région live annonce son CONTENU qui change, et
 * une région montée en même temps que son texte se tait sur une partie des
 * lecteurs d'écran. Elle se vide quand l'attente finit — un retour discret,
 * jamais une annonce de fin.
 */
export function ThreadReturnToBottom({
  chrome,
  windowLoading,
  newerState,
}: {
  readonly chrome: Pick<
    ThreadChromeSignals,
    'scrollButtonVisible' | 'scrollButtonUnreadCount' | 'scrollButtonSenderName' | 'scrollButtonPreviewText' | 'onScrollToBottom'
  >;
  readonly windowLoading: boolean;
  readonly newerState: ListPaginationState;
}) {
  const signal = useDelayedSignal(threadLoadSignalOf({ windowLoading, newerState }), THREAD_LOAD_SIGNAL_DELAY_MS);
  const text = signal === null ? '' : translate(currentInterfaceLanguage(), LOAD_SIGNAL_TEXT[signal]);
  return (
    <>
      <ScrollToBottomButton
        visible={chrome.scrollButtonVisible}
        unreadCount={chrome.scrollButtonUnreadCount}
        senderName={chrome.scrollButtonSenderName}
        previewText={chrome.scrollButtonPreviewText}
        onClick={chrome.onScrollToBottom}
        loading={signal === null ? null : { kind: signal, text }}
      />
      <span role="status" className="offscreen">
        {text}
      </span>
    </>
  );
}
