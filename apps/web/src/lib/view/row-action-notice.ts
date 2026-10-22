import { useEffect } from 'react';

import type { RowActionEvent } from '@/lib/api/conversation-actions';
import { rowMenuText, type RowMenuCatalogKey } from '@/lib/i18n-row-menu-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

import { useLiveAnnouncer, type Announcer, type AnnouncementTone } from './use-live-announcer';

/**
 * **LE GESTE DE RANGÉE DIT SON ISSUE** — épingler, mettre en sourdine,
 * archiver, marquer lu : l'override optimiste se VOIT (un glyphe), mais ni le
 * lecteur d'écran ne l'entendait, ni l'œil ne savait POURQUOI une rangée
 * revenait en arrière quand la passerelle refusait le geste. Ce module est le
 * pont : `performRowAction` (module, hors de tout arbre React) publie un
 * {@link RowActionEvent}, l'écran de la liste l'écoute et le pose dans sa
 * région `role="status"` (`useLiveAnnouncer`, la même que le reste du produit).
 */
export type RowNotice = { readonly text: string; readonly tone: AnnouncementTone };

const ANNOUNCE_KEY = {
  pin: 'pin',
  mute: 'mute',
  archive: 'archive',
  read: 'read',
} as const;

export function rowActionNoticeOf(event: RowActionEvent, language: InterfaceLanguage): RowNotice {
  if (event.kind === 'refused') return { text: rowMenuText(language, 'listRow.announce.refused'), tone: 'error' };
  const key = `listRow.announce.${ANNOUNCE_KEY[event.action]}.${event.on ? 'on' : 'off'}` as RowMenuCatalogKey;
  return { text: rowMenuText(language, key), tone: 'neutral' };
}

type Listener = (notice: RowNotice) => void;

const listeners = new Set<Listener>();

export function publishRowNotice(notice: RowNotice): void {
  listeners.forEach((listener) => listener(notice));
}

/**
 * Le pont de `rowAction` : une catalogue pas encore chargé ne doit JAMAIS
 * défaire un geste déjà appliqué — au pire, il reste muet comme avant.
 */
export function announceRowEvent(event: RowActionEvent): void {
  try {
    publishRowNotice(rowActionNoticeOf(event, currentInterfaceLanguage()));
  } catch {
    return;
  }
}

export const rowNoticeListenerCount = (): number => listeners.size;

export function useRowActionNotice(durationMs?: number): Announcer {
  const announcer = useLiveAnnouncer(durationMs);
  const { announce } = announcer;
  useEffect(() => {
    const listener: Listener = ({ text, tone }) => announce(text, tone);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [announce]);
  return announcer;
}
