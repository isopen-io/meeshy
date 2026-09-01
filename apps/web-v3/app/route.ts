import { rendLePage } from './enveloppe/vue';
import { DESTINATION_PAR_DEFAUT } from './authentification/remise';
import { aUneSession } from './session';
import { documentDeLaVitrine } from './vitrine/vue';

/**
 * `/` — LA RACINE, ET SES DEUX LECTEURS.
 *
 * Le legacy servait ici DEUX écrans sous une seule adresse : la vitrine pour un
 * visiteur, le fil de la conversation « meeshy » pour un compte connecté
 * (`apps/web/app/page.tsx`, branche `state.mode === 'authenticated'`). En
 * prenant `/`, la v3 a hérité de cette responsabilité — et n'en servait qu'une
 * moitié : un utilisateur connecté y voyait « Créer son compte maintenant ».
 *
 * La v3 ne rend pas le fil : il demande un client Socket.IO, un cache de
 * messages et le Prisme appliqué en direct — c'est l'application, pas une page.
 * Elle fait donc ce qu'un aiguilleur doit faire : elle REND LA MAIN, vers
 * l'accueil applicatif que le legacy sert déjà et vers lequel son propre
 * formulaire de connexion renvoie.
 *
 * POURQUOI CETTE RÉPONSE N'EST PLUS MISE EN CACHE. Elle dépend désormais d'un
 * cookie. La politique précédente — `s-maxage=300, stale-while-revalidate=86400`
 * — autorisait un navigateur à resservir la vitrine pendant 24 h : un lecteur
 * qui vient de se connecter serait retombé sur « Créer un compte », et il aurait
 * fallu vider son cache pour en sortir. `Vary: Cookie` aurait le même coût réel
 * (Meeshy pose plusieurs cookies, donc l'entrée ne serait presque jamais
 * réutilisée) pour une complexité de plus. Le prix est un aller-retour par
 * visite, sur un document de 10,8 Ko servi en UNE requête.
 */
export const GET = (requete: Request): Response => {
  if (aUneSession(requete)) {
    return new Response(null, {
      status: 302,
      headers: { location: DESTINATION_PAR_DEFAUT, 'cache-control': 'no-store, private' },
    });
  }

  return rendLePage(documentDeLaVitrine());
};
