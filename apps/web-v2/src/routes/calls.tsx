import { PendingScreen } from '@/components/pending-screen';
import { CALLS_DESTINATION } from '@/lib/view/floating-menu';

/**
 * APPELS — troisième barreau, miroir `ContactsHubView(initialTab: .calls)` : côté iOS le journal d'appels est un ONGLET d'un hub partagé avec les contacts. L'adresse est séparée ici, et pourra devenir un onglet de `/contacts` sans que la table des destinations bouge — c'est pourquoi `route` y est un champ distinct de `key`.
 *
 * L'adresse existe AVANT le contenu (#6214) : sans elle, le barreau qui la
 * vise serait un contrôle qui ment. Le contenu arrive dans son issue à lui ;
 * cet écran-ci n'en préjuge rien et se contente de dire ce qui vient.
 */
export default function CallsScreen() {
  return <PendingScreen destination={CALLS_DESTINATION} />;
}
