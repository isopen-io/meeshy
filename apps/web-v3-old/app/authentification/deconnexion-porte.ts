import { origineEtrangere, refusDOrigine } from '@/app/provenance';
import { estSecurisee, jetonDuLecteur } from '@/app/session';
import { deconnexion, type Recuperateur } from '@/lib/api/authentification';
import { COOKIE_DE_JETON, COOKIE_DE_SESSION, expireLeCookie } from '@/lib/api/cookies';
import { cookiesDEffacementDesPlaces } from '@/lib/api/guest-session';

/**
 * LA PORTE DE SORTIE — ON SORT ENFIN DE LA V3 (#5095).
 *
 * Elle vit ICI, et non dans `app/deconnexion/route.ts`, pour la raison qui
 * gouverne déjà `reglages-porte.ts` et `authentification/porte.ts` : un
 * gestionnaire de route Next reçoit `(requête, CONTEXTE)` — Next compose lui
 * même le second argument (`{ params }`, `next/dist/server/route-modules/
 * app-route/module.js:210,422`) et le passe TOUJOURS, même à une route sans
 * segment dynamique. Un handler exporté qui déclare `recuperer` en 2ᵉ position
 * reçoit donc cet OBJET à la place de la fonction, et l'appel de passerelle
 * meurt en `TypeError` — avalé par le `try/catch` du best-effort, donc
 * SILENCIEUX en production pendant qu'un témoin qui injecte, lui, reste vert.
 * L'injection appartient à la porte ; `route.ts` n'expose qu'un argument.
 *
 * Une déconnexion n'est jamais un demi-échec : le jeton expire, la session
 * expire, chaque place invitée détenue expire, et le lecteur atterrit sur `/`
 * — qui rend alors la VITRINE (`app/route.ts:97` lit `meeshy_session`,
 * désormais expiré). Que la passerelle réponde, échoue ou n'ait rien à dire ne
 * change RIEN à cela (§ 2.1 de la spécification : `POST /api/v1/auth/logout`
 * est BEST-EFFORT).
 *
 * `Set-Cookie` D'ABORD SUR LES DEUX COOKIES DU MEMBRE, INCONDITIONNELLEMENT :
 * un lecteur sans `meeshy_auth` (jeton déjà perdu, ou navigateur qui l'a
 * bloqué) garde parfois `meeshy_session` — l'expirer est ce qui fait
 * BASCULER `/` vers la vitrine ; l'inverse serait un « demi-déconnecté » qui
 * voit encore le tableau de bord après avoir cliqué « Se déconnecter ».
 *
 * LE JETON DE SESSION, S'IL EST PRÉSENTÉ. `meeshy_session_token` ne vit que
 * dans `localStorage` (jamais en cookie) — le SERVEUR ne peut le relayer que
 * si le NAVIGATEUR le lui remet, par le champ caché `session` du formulaire
 * (`lib/realtime/deconnexion.ts`). Sans lui, l'appel part avec le seul
 * `Authorization: Bearer` — dégradé assumé (§ 2.1).
 */

const REPONSE = { location: '/', 'cache-control': 'no-store, private' } as const;

const champDuFormulaire = async (requete: Request, nom: string): Promise<string | null> => {
  const formulaire = await requete.formData().catch(() => null);
  const brut = formulaire?.get(nom);
  return typeof brut === 'string' && brut !== '' ? brut : null;
};

const composeLesCookiesDeSortie = (requete: Request): readonly string[] => {
  const secure = estSecurisee(requete);
  return [
    expireLeCookie(COOKIE_DE_JETON, { secure }),
    expireLeCookie(COOKIE_DE_SESSION, { secure }),
    ...cookiesDEffacementDesPlaces(requete.headers.get('cookie'), secure),
  ];
};

const sortie = (requete: Request): Response => {
  const reponse = new Response(null, { status: 302, headers: REPONSE });
  for (const cookie of composeLesCookiesDeSortie(requete)) {
    reponse.headers.append('set-cookie', cookie);
  }
  return reponse;
};

export const SORTIE = async (requete: Request, recuperer?: Recuperateur): Promise<Response> => {
  if (origineEtrangere(requete)) return refusDOrigine(requete);

  const jeton = jetonDuLecteur(requete);
  const jetonDeSession = await champDuFormulaire(requete, 'session');

  if (jeton !== null) {
    // Best-effort : une panne, un délai dépassé ou un 401 de la passerelle
    // ne retiennent JAMAIS la sortie (§ 2.1).
    try {
      await deconnexion({ jeton, jetonDeSession, recuperer });
    } catch {
      // avalée — voir le doc-comment ci-dessus.
    }
  }

  return sortie(requete);
};

/** Une navigation, un préchargement, un lien collé — jamais un geste de déconnexion. */
export const SORTIE_SANS_EFFET = (): Promise<Response> =>
  Promise.resolve(new Response(null, { status: 303, headers: REPONSE }));
