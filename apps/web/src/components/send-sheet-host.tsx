import { lazy, Suspense } from 'react';
import { useStore } from 'zustand/react';

import { currentInterfaceLanguage } from '@/lib/interface-language';
import { closeSendSheet, sendSheetStore, type SendSheetRequest } from '@/lib/send/send-sheet-store';

/**
 * L'HÔTE DE LA FEUILLE D'ENVOI (#8884) — monté UNE fois par la coquille : toute
 * entrée (menu d'un message, visionneuse, publication, image venue d'ailleurs)
 * appelle `openSendSheet(...)` et ne monte jamais sa propre feuille.
 *
 * **La feuille ne coûte rien à la première peinture** : ce module ne porte que
 * l'abonnement au magasin. La feuille, sa géographie (`send-sheet.css`), ses
 * glyphes et son catalogue arrivent au PREMIER appel, en parallèle — comme la
 * bannière de mise à jour de `shell.tsx`, sans préchargement : on ne partage
 * qu'en ligne, quand le réseau répond.
 */
const loadSheet = () =>
  Promise.all([
    import('./send-sheet-screen'),
    import('@/lib/i18n-send-sheet-catalog').then(({ loadSendSheetCatalog }) => loadSendSheetCatalog(currentInterfaceLanguage())),
  ]).then(([module]) => ({ default: module.SendSheetScreen }));

const LazySendSheet = lazy(loadSheet);

/** Une identité par DEMANDE : une seconde demande remonte une feuille neuve
 * (sélection, légende et envoi en cours ne passent pas d'un contenu à l'autre). */
const ids = new WeakMap<SendSheetRequest, number>();
let nextId = 0;
const idOf = (request: SendSheetRequest): number => {
  const known = ids.get(request);
  if (known !== undefined) return known;
  nextId += 1;
  ids.set(request, nextId);
  return nextId;
};

export function SendSheetHost() {
  const request = useStore(sendSheetStore, (state) => state.request);
  if (request === null) return null;
  /* Ne ferme que SA demande : une feuille remplacée qui se ferme n'efface pas la suivante. */
  const onClose = () => {
    if (sendSheetStore.getState().request === request) closeSendSheet();
  };
  return (
    <Suspense fallback={null}>
      <LazySendSheet key={idOf(request)} request={request} onClose={onClose} />
    </Suspense>
  );
}
