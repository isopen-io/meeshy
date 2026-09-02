import { FEUILLE_CONNECTEE } from '@/app/connecte/feuille';
import { documentDuSite } from '@/app/enveloppe/vue';
import { echappe } from '@/app/socle';

/**
 * D'OÙ VIENT LA REQUÊTE — deux gardes de provenance, posées sur toute porte de
 * la v3 qui a un EFFET, et écrites une fois.
 *
 * 1. UN CHARGEMENT SPÉCULATIF N'A AUCUN EFFET. Un navigateur précharge et
 *    prérend des pages que personne n'a encore ouvertes : les règles de
 *    spéculation de Chrome (`Sec-Purpose: prefetch`, `prefetch;prerender`),
 *    le `Purpose: prefetch` des agents plus anciens, le `X-Purpose: preview`
 *    de Safari (Top Hit), le `X-moz: prefetch` de Firefox. Or `GET /chat/:lien`
 *    JOINT un membre connecté (§ 12.3) et `GET /chats/:cle` DIT à la passerelle
 *    que ce qui est servi est lu : servis à une spéculation, ces effets se
 *    produiraient sans que le lecteur ait rien fait — une adhésion posée par
 *    un aperçu de lien, un fil marqué lu sans avoir été ouvert. La réponse est
 *    un 503 sans corps : c'est ce que Chrome documente comme l'annulation d'une
 *    spéculation — la navigation réelle repart de zéro. Un 204 serait
 *    RÉUTILISÉ par le clic suivant (une navigation vers un 204 ne mène nulle
 *    part), et une page servie sans ses effets serait montrée comme si elle
 *    les avait eus.
 * 2. UN FORMULAIRE VIENT DE MEESHY. `meeshy_auth` et `meeshy_guest_*` sont
 *    `SameSite=Lax` : ils ne PARTENT pas avec un POST inter-sites, mais un
 *    `Set-Cookie` s'APPLIQUE quel que soit `SameSite`, et une page tierce peut
 *    auto-soumettre `<form action="https://meeshy.me/chat/…" method="post">`
 *    avec le pseudo de son choix — la victime en ressortirait membre anonyme
 *    d'une conversation qu'elle n'a jamais vue, sous un nom choisi par
 *    l'attaquant, en consommant les usages du lien. `Sec-Fetch-Site`, posé par
 *    le navigateur et hors de portée d'une page, tranche quand il est là ;
 *    `Origin` quand lui seul est là ; un agent qui n'envoie ni l'un ni l'autre
 *    n'est pas un navigateur moderne, et passe — cette garde protège des
 *    navigateurs, elle ne remplace pas la créance que la passerelle vérifie.
 *
 * Aucune des deux ne coûte un octet de JavaScript : ce sont des en-têtes lus
 * par le serveur, sur le chemin qui marche partout.
 */

const SPECULATION = /\b(prefetch|prerender)\b/i;

/** Un préchargement ou un prérendu — quel que soit le navigateur qui le nomme. */
export const chargementSpeculatif = (requete: Request): boolean => {
  const secPurpose = requete.headers.get('sec-purpose');
  if (secPurpose !== null) return SPECULATION.test(secPurpose);
  return (
    SPECULATION.test(requete.headers.get('purpose') ?? '') ||
    SPECULATION.test(requete.headers.get('x-moz') ?? '') ||
    /\bpreview\b/i.test(requete.headers.get('x-purpose') ?? '')
  );
};

/** La réponse à une spéculation : rien n'a eu lieu, et rien n'est à garder. */
export const sansEffet = (): Response =>
  new Response(null, { status: 503, headers: { 'cache-control': 'no-store' } });

const hoteDe = (valeur: string | null): string | null => {
  const premier = valeur?.split(',')[0]?.trim().toLowerCase();
  return premier === undefined || premier === '' ? null : premier;
};

/**
 * L'hôte que le lecteur a demandé — celui que le proxy relaie
 * (`X-Forwarded-Host`, Traefik), sinon `Host`, sinon celui de l'adresse que le
 * serveur a reconstruite.
 */
const hoteServi = (requete: Request): string =>
  hoteDe(requete.headers.get('x-forwarded-host')) ??
  hoteDe(requete.headers.get('host')) ??
  new URL(requete.url).host.toLowerCase();

const hoteDeLOrigine = (origine: string): string | null => {
  try {
    return new URL(origine).host.toLowerCase();
  } catch {
    return null;
  }
};

/**
 * Le formulaire a-t-il été soumis depuis un AUTRE site ? `Sec-Fetch-Site` fait
 * foi (`cross-site` refuse ; `same-origin`, `same-site`, `none` — la barre
 * d'adresse — passent) ; sans lui, une `Origin` qui n'est pas l'hôte servi
 * refuse — `Origin: null`, celle d'un document opaque, comprise.
 */
export const origineEtrangere = (requete: Request): boolean => {
  const site = requete.headers.get('sec-fetch-site')?.trim().toLowerCase();
  if (site !== undefined && site !== '') return site === 'cross-site';
  const origine = requete.headers.get('origin');
  if (origine === null) return false;
  const hote = hoteDeLOrigine(origine);
  return hote === null || hote !== hoteServi(requete);
};

/**
 * UNE NAVIGATION VAUT-ELLE UN GESTE DU LECTEUR ? `GET /chat/:lien` JOINT un
 * membre connecté (§ 12.3) — une mutation sur une navigation. Or `meeshy_auth`
 * est `SameSite=Lax` : il PART avec toute navigation de premier niveau, d'où
 * qu'elle vienne — un lien, une redirection, un `window.open` posés par un
 * site tiers feraient adhérer un lecteur connecté à n'importe quelle
 * conversation, à son insu, et le préchargement n'est pas la seule spéculation
 * qui existe. `Sec-Fetch-Site` dit qui a INITIÉ la navigation, hors de portée
 * d'une page : `none` (la barre d'adresse, un favori, une autre application —
 * le lien reçu dans WhatsApp), `same-origin` et `same-site` (Meeshy lui-même,
 * le retour de `/login`) sont le geste du lecteur ; `cross-site` est le geste
 * d'un autre. `Sec-Fetch-Mode` et `Sec-Fetch-Dest` retiennent ce qui n'est
 * pas une navigation de document (`<img src>`, `<iframe>`, un `fetch`) ; un
 * agent qui n'envoie pas ces en-têtes ne prouve rien — la porte DEMANDE alors
 * l'adhésion par un formulaire, elle ne la suppose pas (fail-closed).
 */
export const navigationEtrangere = (requete: Request): boolean => {
  const site = requete.headers.get('sec-fetch-site')?.trim().toLowerCase() ?? '';
  const mode = requete.headers.get('sec-fetch-mode')?.trim().toLowerCase() ?? '';
  const destination = requete.headers.get('sec-fetch-dest')?.trim().toLowerCase() ?? '';
  if (site === '' || site === 'cross-site') return true;
  if (mode !== '' && mode !== 'navigate') return true;
  return destination !== '' && destination !== 'document';
};

export const PROVENANCE = {
  titre: 'Ce formulaire ne vient pas de Meeshy',
  corps: 'Il a été envoyé depuis un autre site. Ouvrez la page sur Meeshy et recommencez.',
  action: 'Ouvrir la page',
} as const;

/** Le refus d'un formulaire étranger — un état DESSINÉ, avec la porte à reprendre, jamais un 403 nu. */
export const refusDOrigine = (requete: Request): Response => {
  const ici = new URL(requete.url).pathname;
  return new Response(
    documentDuSite({
      titre: `${PROVENANCE.titre} — Meeshy`,
      description: PROVENANCE.corps,
      feuille: FEUILLE_CONNECTEE,
      corps:
        '<div class="bonjour">' +
        `<h1>${echappe(PROVENANCE.titre)}</h1>` +
        `<p>${echappe(PROVENANCE.corps)}</p>` +
        '</div>' +
        `<section class="acces" aria-label="${echappe(PROVENANCE.action)}"><nav>` +
        `<a class="action primaire" href="${echappe(ici)}">${echappe(PROVENANCE.action)}</a>` +
        '</nav></section>',
      retour: true,
    }),
    {
      status: 403,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store, private',
        'x-robots-tag': 'noindex, nofollow',
      },
    },
  );
};
