/**
 * RAMÈNE LA FORME À BARRE FINALE SUR LA FORME CANONIQUE, dans le service
 * worker, pour que les cinq pages institutionnelles ne soient mises en cache
 * QU'UNE fois.
 *
 * LE PROBLÈME, MESURÉ. Le préchauffage écrit chaque page dans ses deux formes —
 * `about.html` et `about/index.html` —, parce qu'un serveur statique ne résout
 * pas forcément les deux (#5554 : `/privacy` tombait dans le repli de
 * l'application pendant que `/privacy/` fonctionnait). Ces deux fichiers sont
 * identiques OCTET POUR OCTET, mais ce sont deux ADRESSES : Workbox les
 * précachait donc toutes les deux. Relevé sur navigateur réel à l'installation :
 *
 *     10 requêtes, 279,8 Ko bruts — dont la moitié en pur doublon (~37 Ko gzip),
 *     soit PLUS que la première peinture entière de l'application (25,13 Ko).
 *
 * Pour un produit dont la raison d'être est le mégaoctet payé en zone rurale,
 * c'était la dépense la moins défendable du lot.
 *
 * CE QUE CE FICHIER FAIT. Seule la forme canonique entre au précache
 * (`globIgnores: ['*&#47;index.html']`). Une navigation vers `/about/` est
 * redirigée ici vers `/about`, que le précache sert — donc hors ligne aussi.
 * Le fichier `about/index.html` reste sur le disque : il sert la PREMIÈRE
 * visite, celle où aucun service worker ne contrôle encore la page.
 *
 * POURQUOI UNE REDIRECTION PLUTÔT QU'UNE LECTURE DE CACHE. Servir directement
 * le contenu précaché supposerait de connaître la clé de cache de Workbox, qui
 * porte sa révision (`?__WB_REVISION__=…`) — un détail interne, qu'une montée
 * de version peut changer sans prévenir. La redirection ne suppose rien, et
 * elle aligne en prime l'adresse affichée sur le `<link rel="canonical">` que
 * la page déclare déjà.
 *
 * Il est chargé par `importScripts` EN TÊTE du service worker généré, donc son
 * écouteur `fetch` est enregistré avant ceux de Workbox : c'est lui qui répond
 * le premier sur les adresses qu'il revendique, et il laisse passer tout le
 * reste sans y toucher.
 */
const INSTITUTIONAL_ROUTES = ['about', 'contact', 'partners', 'privacy', 'terms'];

const TRAILING_SLASH = new RegExp(`^/(${INSTITUTIONAL_ROUTES.join('|')})/$`);

self.addEventListener('fetch', (event) => {
  // Une redirection ne se pose que sur une NAVIGATION : une requête de
  // ressource vers la même adresse (préchargement, sonde) ne doit pas bouger.
  if (event.request.mode !== 'navigate') return;

  const href = new URL(event.request.url);
  const found = TRAILING_SLASH.exec(href.pathname);
  if (found === null) return;

  // 302, jamais 301 : une redirection PERMANENTE est mise en cache par le
  // navigateur lui-même, hors de portée du service worker, et survivrait à un
  // changement de cette règle.
  event.respondWith(
    Promise.resolve(Response.redirect(`${href.origin}/${found[1]}${href.search}`, 302)),
  );
});
