import { TABLEAU } from './connecte/porte';
import { rendLePage } from './enveloppe/vue';
import { aUneSession } from './session';
import { documentDeLaVitrine } from './vitrine/vue';

/**
 * `/` — LA RACINE, ET SES DEUX LECTEURS.
 *
 * Le legacy servait ici DEUX écrans sous une seule adresse : la vitrine pour un
 * visiteur, le fil de la conversation « meeshy » pour un compte connecté
 * (`apps/web/app/page.tsx`). La v3 a hérité de cette responsabilité en prenant
 * `/`, et la tient maintenant des deux côtés — non plus par une redirection
 * vers le legacy, mais en SERVANT le tableau de bord.
 *
 * L'ÉCRAN CONNECTÉ N'EST PAS LE FIL, et c'est une décision du porteur
 * (2026-09-01) : « après la connexion la v3 va servir la nouvelle page dashboard
 * sur `/`, ainsi BubbleStreamPage disparaît ». Le tableau de bord récapitule et
 * mène à `/chats` ; le fil en temps réel n'est plus la porte d'entrée.
 *
 * `aUneSession` LIT UN COOKIE QUI N'AUTORISE RIEN. `meeshy_session` n'est ni
 * signé ni `HttpOnly` : il choisit quel écran servir, pas ce qu'on a le droit de
 * voir. Ce qui garde la porte est le jeton, opposé à la passerelle par
 * `app/connecte/porte.ts` — un cookie forgé n'obtient donc pas des données, mais
 * un renvoi vers la connexion.
 *
 * POURQUOI LA VITRINE N'EST PLUS MISE EN CACHE ICI. La réponse dépend d'un
 * cookie. La politique précédente — `s-maxage=300, stale-while-revalidate=86400`
 * — autorisait un navigateur à resservir la vitrine pendant 24 h : un lecteur
 * qui vient de se connecter serait retombé sur « Créer un compte ». `Vary:
 * Cookie` aurait le même coût réel (Meeshy pose plusieurs cookies, l'entrée ne
 * serait presque jamais réutilisée) pour une complexité de plus.
 */
export const GET = async (requete: Request): Promise<Response> => {
  if (aUneSession(requete)) return TABLEAU(requete);

  const reponse = rendLePage(documentDeLaVitrine());
  reponse.headers.set('cache-control', 'no-store, private');
  return reponse;
};
