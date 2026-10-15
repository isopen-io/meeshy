import { isCurrentHref, navigate } from '@/lib/router';
import { closeSendSheet } from '@/lib/send/send-sheet-store';
import { closeMoodPeek } from '@/lib/view/mood-peek';
import { closeProfilePeek } from '@/lib/view/profile-peek';
import { dismissAllLayers } from '@/lib/view/use-back-dismiss';

import { closeConversationPreview, openConversationPreview } from './conversation-preview';

/**
 * **LE SITE UNIQUE : « OUVRIR CE QUE DÉSIGNE UNE NOTIFICATION »** (#10539,
 * retour porteur 2026-10-13 : « ça ne dismiss pas la story ou le réel ou le
 * plein écran en cours… Il faudrait pourtant ! »).
 *
 * Tous les chemins y passent — la bannière in-app et sa pilule « Répondre »,
 * la ligne de la cloche (`TargetLink`), la bannière système (service worker,
 * `tap-navigation.ts`) et la coque Capacitor (`shell-push-runtime.ts`) : aucun
 * ne referme rien lui-même.
 *
 * Une story, un réel, le studio sont des ROUTES : naviguer les démonte. Ce qui
 * restait, ce sont les couches posées PAR-DESSUS une adresse, et `navigate` ne
 * peut rien pour elles : il ne fait rien quand l'adresse est déjà la bonne, et
 * la coquille comme la liste (grand écran) restent montées quand elle change.
 * On referme donc d'abord — les couches par la pile que toutes traversent
 * (`dismissAllLayers`), les feuilles de la coquille par leur magasin (leur
 * chunk peut ne pas être monté encore) — et on navigue ensuite.
 *
 * **L'HISTORIQUE** : une couche qui rend son entrée le fait par un retour, que
 * la navigation annule (#6313) — l'entrée resterait sous la destination, et il
 * faudrait deux retours pour revenir. Quand l'entrée courante est celle d'une
 * couche qu'on vient de refermer, la destination la REMPLACE. À la même
 * adresse, on ne touche à rien : la couche rend son entrée elle-même.
 *
 * L'appel en cours n'est pas une couche de cette pile, et ses feuilles sont
 * `held` : il n'est jamais refermé. Un brouillon ne se perd pas — celui du fil
 * et celui du studio sont gardés par leurs magasins, la retouche est `held`.
 */
function dismissShell(successor: boolean): boolean {
  const onLayerEntry = dismissAllLayers({ successor });
  closeProfilePeek();
  closeMoodPeek();
  closeSendSheet();
  return onLayerEntry;
}

export function openNotificationTarget(url: string): void {
  const onLayerEntry = dismissShell(false);
  closeConversationPreview();
  navigate(url, onLayerEntry && !isCurrentHref(url));
}

/**
 * TIRER LA BANNIÈRE POUR UN APERÇU referme d'abord la surface en cours : un
 * aperçu peint sous la visionneuse, ou inerte sous une feuille modale, n'est
 * pas un aperçu. Le peindre AU-DESSUS ne tenait pas — il recouvrirait les
 * menus que son propre fil pose sur `<body>`. L'entrée d'historique de la
 * couche refermée ATTEND l'aperçu, qui la reprend (`successor`).
 */
export function previewNotificationConversation(conversationId: string): void {
  dismissShell(true);
  openConversationPreview(conversationId);
}
