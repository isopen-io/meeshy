import { origineEtrangere, refusDOrigine } from '@/app/provenance';
import { estSecurisee, jetonDuLecteur } from '@/app/session';
import { deconnexion, type Recuperateur } from '@/lib/api/authentification';
import { COOKIE_DE_JETON, COOKIE_DE_SESSION, expireLeCookie } from '@/lib/api/cookies';
import { cookiesDEffacementDesPlaces } from '@/lib/api/guest-session';
import { COOKIE_DE_L_APPAREIL_PUSH, lisLAppareilPush } from '@/lib/api/push-appareil';
import { retireLeJetonPush } from '@/lib/api/push-tokens';

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

/**
 * DEUX CHAMPS, UNE SEULE LECTURE DU CORPS — `Request.formData()` consomme le
 * flux du corps ; l'appeler une SECONDE fois (un second `champDuFormulaire`
 * qui referait son propre `requete.formData()`) jetterait, et le `.catch(()
 * => null)` qui protège CETTE lecture aurait alors rendu `null` en SILENCE
 * pour `pushAppareil` (#5391) — jamais un champ manquant, un corps déjà lu.
 */
const champsDuFormulaire = async (
  requete: Request,
  noms: readonly string[],
): Promise<Readonly<Record<string, string | null>>> => {
  const formulaire = await requete.formData().catch(() => null);
  return Object.fromEntries(
    noms.map((nom) => {
      const brut = formulaire?.get(nom);
      return [nom, typeof brut === 'string' && brut !== '' ? brut : null];
    }),
  );
};

const composeLesCookiesDeSortie = (requete: Request): readonly string[] => {
  const secure = estSecurisee(requete);
  return [
    expireLeCookie(COOKIE_DE_JETON, { secure }),
    expireLeCookie(COOKIE_DE_SESSION, { secure }),
    expireLeCookie(COOKIE_DE_L_APPAREIL_PUSH, { secure }),
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
  const champs = await champsDuFormulaire(requete, ['session', 'pushAppareil']);
  const jetonDeSession = champs['session'] ?? null;
  /**
   * LE COOKIE D'ABORD, LE CHAMP ENSUITE (défaut de revue, #5391) — le champ
   * `pushAppareil` n'est REMPLI que par `lib/realtime/deconnexion.ts`, donc
   * SANS JavaScript il partait vide et le token FCM de cet appareil restait
   * ACTIF côté passerelle : le navigateur d'un lecteur déconnecté continuait
   * de recevoir, sur son écran verrouillé, les bannières d'un compte qu'il
   * venait de quitter. Le cookie `meeshy_v3_push_appareil` voyage, lui, dans
   * CHAQUE requête — c'est la même règle que le geste `valeur=false` de
   * `app/connecte/prefs-porte.ts` : le COOKIE est la source de vérité, le
   * champ n'est qu'un repli (un navigateur qui aurait effacé ses cookies
   * mais tiendrait encore l'identifiant en mémoire de page).
   */
  const pushAppareil = lisLAppareilPush(requete.headers.get('cookie')) ?? champs['pushAppareil'] ?? null;

  if (jeton !== null) {
    // Best-effort : une panne, un délai dépassé ou un 401 de la passerelle
    // ne retiennent JAMAIS la sortie (§ 2.1).
    try {
      await deconnexion({ jeton, jetonDeSession, recuperer });
    } catch {
      // avalée — voir le doc-comment ci-dessus.
    }

    // LA PURGE DU TOKEN PUSH (#5391, § 3.5) — best-effort, comme la
    // déconnexion elle-même : un gateway muet, un 401 ou un délai dépassé
    // n'empêchent JAMAIS la sortie. `deviceId` SEUL (jamais un corps vide)
    // retire le token de CET appareil sans toucher aux tokens iOS/Android
    // du même compte (`retireLeJetonPush`, `lib/api/push-tokens.ts`).
    if (pushAppareil !== null) {
      try {
        await retireLeJetonPush({ jeton, deviceId: pushAppareil, recuperer });
      } catch {
        // avalée — même raison que ci-dessus.
      }
    }
  }

  return sortie(requete);
};

/** Une navigation, un préchargement, un lien collé — jamais un geste de déconnexion. */
export const SORTIE_SANS_EFFET = (): Promise<Response> =>
  Promise.resolve(new Response(null, { status: 303, headers: REPONSE }));
