import type { CoqueNative } from '@/lib/native-shell';
import { NOTIFICATION_CLICKED_MESSAGE } from '@/lib/notifications/tap-navigation';
import { WIDGETS_BRIDGE } from '@/lib/shell-widgets/channel';

import { callBackIntentFromMessage, type CallBackIntent } from './call-back-intent';

/**
 * **« RAPPELER » SUR LA BANNIÈRE D'UN APPEL MANQUÉ, DANS LA COQUE** (#10908) —
 * jumeau de `rappeler()` (`sw-push.js`). Le toucher ouvre le fil par son lien
 * profond (`meeshy://c/<id>?rappeler=…`, routé par `shell-deep-links.ts`), et
 * `MeeshyWidgetsPlugin` signale à part l'appel à composer, RETENU côté natif
 * jusqu'à l'abonnement : un lancement à froid ne le perd pas. La charge est
 * relue par la loi du web (`callBackIntentFromMessage`).
 */
export const CALL_BACK_EVENT = 'callBackRequested';

export function ecouterRappels(coque: CoqueNative | undefined, onRequest: (intent: CallBackIntent) => void): boolean {
  const declare = coque?.PluginHeaders?.some((header) => header.name === WIDGETS_BRIDGE) === true;
  const addListener = coque?.addListener;
  if (!declare || typeof addListener !== 'function') return false;
  addListener(WIDGETS_BRIDGE, CALL_BACK_EVENT, (donnees) => {
    const intent = callBackIntentFromMessage({ type: NOTIFICATION_CLICKED_MESSAGE, callBack: donnees });
    if (intent !== null) onRequest(intent);
  });
  return true;
}
