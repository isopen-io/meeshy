import type { DeuxiemeFacteur, Session } from '@/lib/api/authentification';
import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '@/lib/api/cookies';

import { tableDeJetons } from '@/app/actifs-inlines';
import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { compacte } from '@/app/enveloppe/feuille';
import { SOCLE_DU_DOCUMENT } from '@/app/socle';
import { THEME_PAR_DEFAUT } from '@/app/theme-script';

/**
 * LA REMISE — le seul document de la v3 qui porte du JavaScript applicatif, et
 * la seule page qui en a besoin.
 *
 * POURQUOI ELLE EXISTE. La session que l'application legacy comprend vit dans
 * `localStorage` : `services/auth-manager.service.ts` y écrit
 * `meeshy_auth_token`, `meeshy_session_token` et `meeshy_user_data`, et le
 * store d'authentification se réhydrate en RELISANT ces clés brutes
 * (`stores/auth-store.ts` → `authManager.getAuthToken()` / `getCurrentUser()`).
 * Aucune réponse HTTP ne peut écrire `localStorage`. Une connexion servie par
 * le serveur doit donc, à un moment, passer la main au navigateur.
 *
 * L'ALTERNATIVE, ET POURQUOI ELLE EST ÉCARTÉE. On pourrait poser la session en
 * cookie `HttpOnly` et faire lire ce cookie à l'application. Ce n'est pas un
 * réglage : c'est une refonte du stockage d'authentification de l'application
 * VIVE — quatre-vingts sites de lecture, un service worker, un client
 * Socket.IO — pendant que la migration est en cours. Le lot qui la porte est
 * #4472. En attendant, la v3 parle la langue de son voisin.
 *
 * CE QUE CE CHOIX COÛTE, ET COMMENT IL EST BORNÉ :
 *
 *   • le jeton voyage dans le CORPS d'un document HTML. La réponse porte donc
 *     `no-store`, et cette page n'est la destination d'AUCUN lien : elle n'est
 *     rendue qu'en réponse à un POST, jamais à un GET ;
 *   • un lecteur SANS JavaScript ne peut pas terminer sa connexion. Le
 *     `<noscript>` le lui DIT, plutôt que de le laisser sur une page blanche —
 *     un écran qui échoue en silence est pire qu'un écran qui explique ;
 *   • le document n'affiche rien du compte. En cas d'échec du script, il ne
 *     reste à l'écran qu'une phrase et un lien.
 *
 * LE COOKIE EST ÉCRIT PAR LE SCRIPT, PAS PAR `Set-Cookie`, et c'est délibéré :
 * `clearAllSessions()` du legacy l'efface par `document.cookie`, ce qu'un
 * cookie `HttpOnly` rendrait impossible. Une déconnexion laisserait alors un
 * `meeshy_session` valide derrière elle — exactement la moitié de session que
 * ce fichier existe pour éviter.
 */

/**
 * Miroirs de `apps/web/constants/auth.ts` — les clés que le legacy relit.
 * `AUTH_STORAGE_KEYS` pour la session, `SESSION_STORAGE_KEYS` pour l'étape de
 * vérification. Gardés par un témoin de source qui les oppose au fichier.
 */
export const CLES = {
  jeton: 'meeshy_auth_token',
  jetonDeSession: 'meeshy_session_token',
  utilisateur: 'meeshy_user_data',
} as const;

export const CLES_DEUXIEME_FACTEUR = {
  jetonTemporaire: 'meeshy_2fa_temp_token',
  identifiantUtilisateur: 'meeshy_2fa_user_id',
  pseudonyme: 'meeshy_2fa_username',
} as const;

/** L'écran de vérification du legacy. Il franchit la zone, comme `/forgot-password`. */
export const ECRAN_DEUXIEME_FACTEUR = '/auth/verify-2fa';

export { COOKIE_DE_SESSION };

/**
 * LE JETON, EN COOKIE — ce qui rend la zone connectée RENDABLE PAR LE SERVEUR.
 *
 * Le jeton porteur vit dans `localStorage`, que le serveur ne voit pas : un
 * écran connecté de la v3 ne pouvait donc rien demander à la passerelle sans
 * embarquer du JavaScript, c'est-à-dire sans renoncer à ce qui fait la v3 — un
 * document complet en UNE requête, sans un octet de runtime.
 *
 * CE QUE CE COOKIE CHANGE, ET CE QU'IL NE CHANGE PAS. Il n'élargit PAS la
 * surface d'une injection : un script hostile qui tourne sur l'origine lit déjà
 * `localStorage`, et ce cookie n'est pas plus caché que lui. Il n'est
 * volontairement pas `HttpOnly`, pour la même raison que `meeshy_session` :
 * `clearAllSessions()` du legacy efface par `document.cookie` tout nom
 * commençant par `meeshy`, et un cookie `HttpOnly` SURVIVRAIT à la déconnexion
 * — une demi-session laissée derrière, exactement ce qu'on veut éviter. Le nom
 * choisi entre donc dans ce balayage.
 *
 * Ce qu'il ajoute est un envoi automatique vers NOTRE origine. `SameSite=Lax`
 * le retient sur toute requête de sous-ressource venue d'un autre site et sur
 * tout POST inter-site ; la v3 ne s'en sert que pour RENDRE, jamais pour agir.
 */
export { COOKIE_DE_JETON };

/**
 * MIROIR EXACT de `AuthManagerService.setSessionCookie`
 * (`apps/web/services/auth-manager.service.ts`). Ce cookie gouverne le
 * middleware du legacy, qui décide si le bundle `/admin` se charge : une
 * v3 plus GÉNÉREUSE que le legacy ouvrirait cette porte à un rôle qui ne
 * l'a pas. La liste est donc recopiée à l'identique, et un témoin de source
 * l'oppose au fichier d'origine.
 */
export const ROLES_ADMIN: readonly string[] = ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'];

const DUREE_DU_COOKIE_S = 7 * 24 * 60 * 60;

/**
 * Un `</script>` dans le JSON refermerait la balise et rendrait le reste du
 * document exécutable. Les deux séparateurs de ligne Unicode cassent, eux, le
 * littéral JavaScript sans casser le JSON.
 */
const jsonPourScript = (valeur: unknown): string =>
  JSON.stringify(valeur)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

/**
 * LA DESTINATION, et la garde contre la redirection ouverte.
 *
 * `returnUrl` vient de la barre d'adresse : un `//attaquant.example`, un
 * `https://…` ou un `/\attaquant.example` y enverrait l'utilisateur AILLEURS
 * juste après qu'il a saisi son mot de passe, sur une page qui a toute
 * l'apparence de la nôtre. Seul un chemin de l'origine courante est accepté ;
 * tout le reste retombe sur l'accueil de l'application.
 *
 * La garde se juge sur ce que le NAVIGATEUR fera de la chaîne, jamais sur ce
 * qu'elle a l'air d'être — voir `porteUnCaractereInterdit`.
 */
/**
 * OÙ L'ON ARRIVE APRÈS S'ÊTRE CONNECTÉ. `/` et non `/dashboard` : depuis que la
 * v3 sert le tableau de bord à la racine (décision du porteur, 2026-09-01), `/`
 * EST l'accueil connecté. Y renvoyer plutôt que vers l'écran du legacy évite au
 * lecteur un aller-retour de plus, et évite surtout deux accueils concurrents.
 */
export const DESTINATION_PAR_DEFAUT = '/';

/**
 * L'ORIGINE de la remise, et pourquoi elle est INVALIDE.
 *
 * `new URL(retour, BASE)` est le seul juge fiable de « ce chemin sort-il de
 * l'origine ? » : c'est l'analyseur du navigateur, pas une paire de
 * `startsWith`. Le domaine est en `.invalid` (RFC 2606) pour que la garde ne
 * puisse JAMAIS accepter une URL absolue vers lui par accident — aucune
 * machine ne porte ce nom.
 */
const ORIGINE_DE_CONTROLE = 'https://remise.invalid';

/**
 * Une barre INVERSE ou un caractère de contrôle suffisent à sortir de
 * l'origine, et aucun des deux ne se voit dans une barre d'adresse.
 *
 * Les navigateurs normalisent `\` en `/` : `/\attaquant.example` ne commence
 * donc PAS par `//` — la garde le laissait passer — et `location.replace` y
 * envoie l'utilisateur sur `https://attaquant.example`. Les caractères de
 * contrôle sont écartés pour la raison jumelle : `%09`, `%0d` et leurs voisins
 * sont silencieusement retirés par l'analyseur d'URL, ce qui laisse un
 * `/<TAB>/attaquant.example` se replier sur une URL protocole-relative.
 *
 * Écrit en boucle plutôt qu'en classe de caractères : une plage de contrôle
 * dans un littéral d'expression régulière est invisible à la relecture, et
 * c'est exactement le genre de garde qu'on croit poser sans l'avoir posée.
 */
const porteUnCaractereInterdit = (chemin: string): boolean => {
  for (const caractere of chemin) {
    const point = caractere.codePointAt(0) ?? 0;
    if (caractere === '\\' || point < 0x20 || point === 0x7f) {
      return true;
    }
  }
  return false;
};

export const destination = (retour: string | null): string => {
  if (retour === null || !retour.startsWith('/') || retour.startsWith('//')) {
    return DESTINATION_PAR_DEFAUT;
  }
  if (porteUnCaractereInterdit(retour)) {
    return DESTINATION_PAR_DEFAUT;
  }
  try {
    const analyse = new URL(retour, ORIGINE_DE_CONTROLE);
    if (analyse.origin !== ORIGINE_DE_CONTROLE) {
      return DESTINATION_PAR_DEFAUT;
    }
    // Relu APRÈS analyse : c'est la forme normalisée qui sera navigée, et elle
    // peut differer de la chaine recue.
    if (!analyse.pathname.startsWith('/') || analyse.pathname.startsWith('//')) {
      return DESTINATION_PAR_DEFAUT;
    }
    // La requete et l'ancre survivent : un retour vers `/conversations?fil=3`
    // doit rouvrir CE fil, pas la liste.
    return analyse.pathname + analyse.search + analyse.hash;
  } catch {
    return DESTINATION_PAR_DEFAUT;
  }
};

/**
 * La remise porte la table de JETONS comme tout document de la v3 — et non une
 * poignée de couleurs écrites à la main. Elle est brève, mais elle n'est pas
 * jetable : sans JavaScript, elle RESTE à l'écran, et c'est justement le
 * lecteur le moins bien servi qui la lirait le plus longtemps.
 */
const FEUILLE_DE_LA_REMISE = compacte(`
body{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center}
p{margin:0;max-width:52ch;line-height:var(--leading-relaxed);color:var(--color-text-muted)}
a{color:var(--color-primary)}
`);

const ANNONCE = 'Connexion en cours…';
const SANS_SCRIPT =
  'La connexion a réussi, mais elle ne peut pas s’achever sans JavaScript : la session de Meeshy se garde dans le navigateur. Activez JavaScript, puis réessayez.';

/**
 * UNE remise, deux usages. La session et le second facteur écrivent des clés
 * différentes dans des magasins différents et repartent ailleurs — mais c'est
 * le MÊME geste : le serveur ne peut écrire ni `localStorage` ni
 * `sessionStorage`, donc il passe la main. Deux scripts seraient deux jumeaux,
 * dont l'un se serait fait oublier à la première évolution de l'échappement.
 */
export type Ecriture = {
  readonly magasin: 'localStorage' | 'sessionStorage';
  readonly cle: string;
  readonly valeur: string;
};

export type Biscuit = {
  readonly nom: string;
  readonly valeur: string;
};

export type Remise = {
  readonly ecritures: readonly Ecriture[];
  readonly cookies: readonly Biscuit[];
  readonly vers: string;
};

export const remiseDeSession = (session: Session, vers: string): Remise => ({
  ecritures: [
    { magasin: 'localStorage', cle: CLES.jeton, valeur: session.jeton },
    ...(session.jetonDeSession === null
      ? []
      : [
          {
            magasin: 'localStorage' as const,
            cle: CLES.jetonDeSession,
            valeur: session.jetonDeSession,
          },
        ]),
    {
      magasin: 'localStorage',
      cle: CLES.utilisateur,
      valeur: JSON.stringify(session.utilisateur),
    },
  ],
  cookies: [
    { nom: COOKIE_DE_SESSION, valeur: cookieDeSession(session) },
    { nom: COOKIE_DE_JETON, valeur: session.jeton },
  ],
  vers,
});

export const remiseDeDeuxiemeFacteur = (etape: DeuxiemeFacteur, vers: string): Remise => ({
  ecritures: [
    {
      magasin: 'sessionStorage',
      cle: CLES_DEUXIEME_FACTEUR.jetonTemporaire,
      valeur: etape.jetonTemporaire,
    },
    {
      magasin: 'sessionStorage',
      cle: CLES_DEUXIEME_FACTEUR.identifiantUtilisateur,
      valeur: etape.identifiantUtilisateur,
    },
    { magasin: 'sessionStorage', cle: CLES_DEUXIEME_FACTEUR.pseudonyme, valeur: etape.pseudonyme },
  ],
  // Aucune session n'est encore ouverte : poser un cookie ici accorderait au
  // middleware du legacy — et à la zone connectée de la v3 — un utilisateur qui
  // n'a pas fini de prouver qui il est.
  cookies: [],
  vers,
});

const scriptDeRemise = ({ ecritures, cookies, vers }: Remise): string =>
  '(function(){' +
  'try{' +
  ecritures
    .map(
      ({ magasin, cle, valeur }) =>
        `${magasin}.setItem(${jsonPourScript(cle)},${jsonPourScript(valeur)});`,
    )
    .join('') +
  '}catch(e){}' +
  (cookies.length === 0
    ? ''
    : 'try{' +
      cookies
        .map(
          ({ nom, valeur }) =>
            `document.cookie=${jsonPourScript(nom)}+"="+${jsonPourScript(encodeURIComponent(valeur))}+";max-age=${DUREE_DU_COOKIE_S};path=/;SameSite=Lax;Secure";`,
        )
        .join('') +
      '}catch(e){}') +
  // `replace` et non `assign` : la remise ne doit pas rester dans l'historique,
  // sinon un retour arrière rejoue une page qui porte un jeton.
  `location.replace(${jsonPourScript(vers)});` +
  '})()';

export const cookieDeSession = (session: Session): string => {
  const role = typeof session.utilisateur.role === 'string' ? session.utilisateur.role : '';
  const donnees = {
    role,
    canAccessAdmin: session.utilisateur.canAccessAdmin === true || ROLES_ADMIN.includes(role),
    userId: typeof session.utilisateur.id === 'string' ? session.utilisateur.id : '',
  };
  return Buffer.from(JSON.stringify(donnees), 'utf8').toString('base64');
};

export const documentDeRemise = (remise: Remise): string =>
  '<!doctype html>' +
  `<html lang="${DOCUMENT_LANGUAGE}" class="${THEME_PAR_DEFAUT}">` +
  '<head>' +
  '<meta charset="utf-8"/>' +
  '<meta name="viewport" content="width=device-width, initial-scale=1"/>' +
  '<link rel="icon" href="data:,"/>' +
  '<meta name="robots" content="noindex, nofollow"/>' +
  `<title>${ANNONCE}</title>` +
  `<script>${scriptDeRemise(remise)}</script>` +
  `<style>${tableDeJetons()}${SOCLE_DU_DOCUMENT}${FEUILLE_DE_LA_REMISE}</style>` +
  '</head>' +
  '<body>' +
  `<p>${ANNONCE}</p>` +
  `<noscript><p>${SANS_SCRIPT}</p><p><a href="/login">Revenir à la connexion</a></p></noscript>` +
  '</body>' +
  '</html>';

/**
 * La réponse qui porte la remise. `no-store` ET `Clear-Site-Data` absents à
 * dessein : le premier suffit, le second effacerait le stockage que ce
 * document vient précisément d'écrire.
 */
export const rendLaRemise = (remise: Remise): Response =>
  new Response(documentDeRemise(remise), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, private',
      'referrer-policy': 'no-referrer',
    },
  });
