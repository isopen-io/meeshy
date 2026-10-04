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
 * Module LÉGER (lu par la coquille avant le premier pixel) : un état, deux
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
};

type AudioCarryState = {
  readonly carried: CarriedAudio | null;
  /** Monte à chaque reprise : deux reprises du même vocal remontent le lecteur. */
  readonly serial: number;
};

export const audioCarryStore = createStore<AudioCarryState>(() => ({ carried: null, serial: 0 }));

export function carryAudio(carried: CarriedAudio): void {
  audioCarryStore.setState((state) => ({ carried, serial: state.serial + 1 }));
}

export function dropCarriedAudio(): void {
  audioCarryStore.setState({ carried: null });
}
