import { useStore } from 'zustand/react';
import { createStore } from 'zustand/vanilla';

import type { Attachment } from '@/lib/api/types';

/**
 * LA LECTURE QUI SURVIT AU PLEIN ÉCRAN (#9256) — miroir du moteur iOS que
 * possède `ConversationAudioCoordinator` et non `AudioFullscreenView` (« Pas de
 * `.onDisappear` : fermer le plein écran laisse la lecture continuer »). Le
 * web n'a pas de moteur partagé : chaque `<audio>` vit dans son composant.
 * Fermer le lecteur pendant qu'il joue CONFIE donc la piste, sa position et
 * sa vitesse à ce magasin, et la coquille monte le mini-lecteur
 * (`mini-audio-player.tsx`), qui reprend là où la page s'est arrêtée.
 *
 * #9279 — le mini-lecteur PUBLIE ici sa lecture vivante (`live`) : c'est le
 * seul moteur du vocal confié, et la bulle du même vocal, dans le fil, en
 * devient la télécommande (`useCarriedPlayback`) au lieu d'ouvrir un second
 * son — le coordinateur iOS n'a qu'un moteur, et la bulle le reflète.
 *
 * Module LÉGER (lu par la coquille avant le premier pixel) : un état, quelques
 * verbes, aucun rendu.
 */
export type CarriedAudio = {
  readonly attachment: Attachment;
  /** La piste ÉLUE par le Prisme au moment de fermer — jamais réélue : on reprend ce qu'on écoutait. */
  readonly trackUrl: string;
  readonly trackLanguage: string;
  readonly positionMs: number;
  readonly rate: number;
  /** L'auteur du vocal, quand le plein écran le connaissait. */
  readonly title: string | null;
  /** La conversation du vocal (#9279) — le toucher l'ouvre, le mini-lecteur s'y efface et la bulle y reprend la main. `null` : hors conversation. */
  readonly conversationId?: string | null;
};

export type CarriedPlaybackStatus = 'idle' | 'playing' | 'paused' | 'error';

/** Ce que le mini-lecteur joue, À L'INSTANT — lu par la bulle du même vocal. */
export type CarriedPlayback = {
  readonly attachmentId: string;
  readonly status: CarriedPlaybackStatus;
  readonly progress: number;
  readonly position: number;
  readonly duration: number;
  readonly rate: number;
  readonly element: HTMLMediaElement | null;
  readonly toggle: () => void;
  readonly seek: (seconds: number) => void;
  readonly setRate: (rate: number) => void;
};

type AudioCarryState = {
  readonly carried: CarriedAudio | null;
  /** Monte à chaque reprise : deux reprises du même vocal remontent le lecteur. */
  readonly serial: number;
  readonly live: CarriedPlayback | null;
};

export const audioCarryStore = createStore<AudioCarryState>(() => ({ carried: null, serial: 0, live: null }));

export function carryAudio(carried: CarriedAudio): void {
  audioCarryStore.setState((state) => ({ carried, serial: state.serial + 1, live: null }));
}

export function dropCarriedAudio(): void {
  audioCarryStore.setState({ carried: null, live: null });
}

/** Le mini-lecteur publie sa lecture ; il ne retire que la SIENNE (un lecteur remonté a déjà publié la nouvelle). */
export function publishCarriedPlayback(live: CarriedPlayback): void {
  audioCarryStore.setState({ live });
}

export function withdrawCarriedPlayback(toggle: CarriedPlayback['toggle']): void {
  if (audioCarryStore.getState().live?.toggle === toggle) audioCarryStore.setState({ live: null });
}

/** La lecture du mini-lecteur QUAND il joue CE vocal — `null` sinon : la bulle garde la sienne. */
export function useCarriedPlayback(attachmentId: string): CarriedPlayback | null {
  return useStore(audioCarryStore, (state) => (state.live?.attachmentId === attachmentId ? state.live : null));
}

/**
 * LE MINI-LECTEUR S'EFFACE DANS LA CONVERSATION DU VOCAL (#9279) — miroir de
 * `MiniAudioPlayerBar.isInsidePlayingConversation` iOS : la bulle y expose les
 * mêmes commandes, la barre par-dessus serait redondante. Ailleurs, il reste.
 */
export function concealsMiniPlayer({
  carried,
  openConversationId,
}: {
  readonly carried: CarriedAudio;
  readonly openConversationId: string | null;
}): boolean {
  const conversationId = carried.conversationId ?? null;
  return conversationId !== null && conversationId === openConversationId;
}
