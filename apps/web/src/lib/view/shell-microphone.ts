import { appelNatifMethode, coqueCourante, type CoqueNative } from '@/lib/native-shell';

/**
 * **LE MICRO D'UN VOCAL TENU HORS DE L'ÉCRAN** (#9238) — un navigateur tient
 * lui-même le micro d'un onglet masqué, iOS a son mode d'arrière-plan
 * `audio`. Dans la coque Android, rien ne le tenait : quitter l'app pendant
 * un enregistrement laissait `MediaRecorder` capter du SILENCE jusqu'au
 * retour, et le vocal partait avec une fin muette. La coque démarre donc un
 * service au premier plan de type `microphone` (`MeeshyRecorderPlugin`) tant
 * que l'enregistreur capte.
 *
 * Un navigateur, ou une coque construite avant le plugin, reçoit une prise
 * sans effet ; un refus de la coque ne remonte jamais au composeur.
 */
export type MicrophoneHold = {
  readonly hold: () => void;
  readonly release: () => void;
};

const PLUGIN = 'MeeshyRecorder';

function geste(coque: CoqueNative | undefined, methode: string): () => void {
  const appel = appelNatifMethode(coque, PLUGIN, methode);
  if (appel === null) return () => {};
  return () => {
    appel({}).catch(() => {});
  };
}

export function shellMicrophoneHold(coque: CoqueNative | undefined = coqueCourante()): MicrophoneHold {
  return { hold: geste(coque, 'holdMicrophone'), release: geste(coque, 'releaseMicrophone') };
}
