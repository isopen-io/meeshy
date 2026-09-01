import { rendLePage } from './enveloppe/vue';
import { documentDeLaVitrine } from './vitrine/vue';

/**
 * `/` — la vitrine publique.
 *
 * La politique de cache vit dans `rendLePage` (`app/enveloppe/vue.ts`), avec
 * celle des cinq pages institutionnelles : ces six documents ne dépendent
 * d'aucun lecteur et ne portent aucune donnée. C'est la raison pour laquelle
 * aucun d'eux ne passe par `rendDocument`, le rendu des écrans de lien : celui-
 * là pose `cache-control: no-store`, juste pour une réponse composée autour
 * d'un jeton dont l'état change sans prévenir, et ruineux ici — un aller-retour
 * complet à chaque visite, sur les surfaces mêmes qui vantent la légèreté.
 */
export const GET = (): Response => rendLePage(documentDeLaVitrine());
