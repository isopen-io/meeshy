import { lisLAppareilPush, poseLAppareilPush } from '@/lib/api/push-appareil';
import { retireLeJetonPush } from '@/lib/api/push-tokens';
import { PREFS } from '@/lib/contenu/prefs-de-notif';
import { CACHE_DE_ROTATION_PUSH, CLE_DE_CONTEXTE_PUSH, CLE_DE_ROTATION_PUSH } from '@/lib/sw/signal';

import { montreLaReussite, montreLaSessionExpiree, montreLEchec } from './prefs-fentes';
import { peinsLaRangee } from './prefs-peinture';

/**
 * LE MODULE D'ABONNEMENT PUSH (#5391, § 3.4 de la spécification) — armé par
 * `lib/realtime/prefs.ts` SUR LA RANGÉE PUSH UNIQUEMENT, jamais sur les
 * treize bascules : elles restent un aller simple vers `basculeUnePreference`
 * (`lib/api/preferences.ts`), ce module n'y touche pas.
 *
 * LA PASSERELLE NE PARLE QUE FCM (§ 0 de la spécification) — aucun VAPID
 * serveur, aucun `web-push`. S'abonner exige donc de PARLER À FCM
 * DIRECTEMENT, en REST, SANS le SDK `firebase/messaging` (des dizaines de
 * Ko interdits par la charte, § 12.4) : deux appels, la danse que le SDK
 * exécute en interne — Installations (obtenir un `authToken` d'appareil) puis
 * Registrations (échanger la `PushSubscription` du navigateur contre un
 * TOKEN FCM). Leur forme est copiée de `firebase-js-sdk` (`packages/
 * messaging/src/internals/requests.ts`, vendoré dans `apps/web/node_modules/
 * @firebase/messaging`) — la seule pièce non contractuelle de ce travail,
 * vérifiée en staging au premier envoi réel (§ 9, Q4).
 *
 * LES DEUX MOITIÉS SONT INTERCEPTÉES (restante FLUIDITÉ de #5391, ce
 * travail) : `valeur=true` (s'abonner) suit le chemin ci-dessous, inchangé.
 * `valeur=false` (se désabonner) appelle DIRECTEMENT la passerelle
 * (`retireLeJetonPush`, `lib/api/push-tokens.ts` — le MÊME site que la
 * porte utilise) plutôt que de laisser la soumission NATIVE recharger la
 * page — le patron des treize bascules voisines (`lib/realtime/prefs.ts`),
 * jamais celui du rejeu en arrière-plan (`rejoueSiRotationEnArrierePlan`,
 * réservé à une surface SANS cet écran). Le CHEMIN SANS JAVASCRIPT — le
 * `<form method="post">` nu, la porte qui retire le token depuis le COOKIE
 * appareil (`app/connecte/prefs-porte.ts`) — reste le repli qui marche
 * partout : ce module l'AMÉLIORE, il ne le remplace pas.
 *
 * SUR LA MOITIÉ « ABONNER », LE SERVEUR RESTE LE COMPOSITEUR : ce module ne
 * peint jamais l'état « abonné » lui-même — il remplit les DEUX champs
 * cachés que la porte lit (`abonnement`, `deviceId`) puis laisse la
 * soumission NATIVE partir (`formulaire.submit()`, qui NE DÉCLENCHE PAS
 * l'événement `submit` — la spec DOM le garantit, c'est ce qui évite la
 * boucle avec l'écouteur ci-dessous) : la porte fait le Post/Redirect/Get,
 * et la rangée peinte au retour est celle que le SERVEUR a relue sur `GET
 * /users/me/devices`. LA MOITIÉ « DÉSABONNER » PEINT, ELLE, OPTIMISTE — le
 * patron des treize bascules, jamais un espoir qui divergerait : réconciliée
 * sur `fait`, défaite sur tout autre genre (voir `surSoumissionDesabonner`
 * plus bas).
 *
 * CHAQUE ÉCHEC EST UN ÉTAT PEINT (permission refusée, navigateur
 * incompatible, `subscribe()` qui jette, un appel FCM non-2xx) — jamais une
 * exception avalée, jamais un formulaire qui part à vide (charte règle 7).
 */

type ConfigurationFCM = {
  readonly apiKey: string;
  readonly projectId: string;
  readonly appId: string;
  readonly vapid: string;
  readonly baseInstallations: string;
  readonly baseRegistrations: string;
};

/**
 * La configuration voyage par attributs `data-` sur le NŒUD DE MONTAGE (le
 * `<main>` que `prefs.ts` a déjà résolu) — jamais une variable globale : les
 * témoins e2e la pointent vers le bouchon en réécrivant simplement le
 * document servi (§ 3.4).
 */
const configurationDepuis = (main: HTMLElement): ConfigurationFCM | null => {
  const {
    firebaseApiKey,
    firebaseProjectId,
    firebaseAppId,
    firebaseVapid,
    fcmInstallationsBase,
    fcmRegistrationsBase,
  } = main.dataset;
  if (
    firebaseApiKey === undefined ||
    firebaseProjectId === undefined ||
    firebaseAppId === undefined ||
    firebaseVapid === undefined ||
    fcmInstallationsBase === undefined ||
    fcmRegistrationsBase === undefined
  ) {
    return null;
  }
  return {
    apiKey: firebaseApiKey,
    projectId: firebaseProjectId,
    appId: firebaseAppId,
    vapid: firebaseVapid,
    baseInstallations: fcmInstallationsBase,
    baseRegistrations: fcmRegistrationsBase,
  };
};

/** La clé VAPID publique, du base64url que Firebase sert, à l'octet que `PushManager.subscribe` exige. */
export const urlBase64VersOctets = (base64Url: string): Uint8Array => {
  const remplissage = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + remplissage).replace(/-/g, '+').replace(/_/g, '/');
  const brut = atob(base64);
  const octets = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i += 1) octets[i] = brut.charCodeAt(i);
  return octets;
};

/**
 * L'IDENTIFIANT D'INSTALLATION FIREBASE (`fid`) — 17 octets aléatoires,
 * l'octet 0 forcé à `0b0111xxxx` (les quatre bits de poids fort du premier
 * octet marquent la version du format FID), base64url, 22 caractères
 * (§ 2.5 de la spécification — la forme copiée de `generate-fid.ts` du SDK).
 */
export const genereUnFid = (): string => {
  const octets = new Uint8Array(17);
  crypto.getRandomValues(octets);
  octets[0] = 0b01110000 | ((octets[0] ?? 0) & 0b00001111);
  let binaire = '';
  octets.forEach((octet) => {
    binaire += String.fromCharCode(octet);
  });
  return btoa(binaire)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .slice(0, 22);
};

/**
 * L'HÔTE DE LA PORTÉE — `web.origin` du corps Registrations
 * (`getRegistrationOrigin`, SDK réel) : l'hôte que la registration du
 * travailleur de zone sert, jamais un hôte forgé. Un `scope` non-URL
 * (harnais de test, registration dégradée) ne fait pas jeter l'abonnement
 * pour autant — `origin` est absent du corps plutôt qu'inventé.
 */
const origineDeLaPortee = (scope: string): string | undefined => {
  try {
    return new URL(scope).host;
  } catch {
    return undefined;
  }
};

/**
 * Les DEUX appels REST (§ 0, § 2.5) — jamais le SDK, mais leur FORME est
 * celle du SDK réel, comparée au source vendoré (`node_modules/.bun/
 * @firebase+messaging@0.13.0…/dist/esm/index.esm.js`, `getHeaders`/
 * `getBody`) plutôt que devinée. DEUX défauts trouvés à cette comparaison
 * (revue de #5391) : l'en-tête d'autorisation Installations→Registrations
 * porte le jeton NU quand la passerelle FCM exige `FIS ${jeton}` (espace
 * compris — `getHeaders`), et le corps omettait `web.origin` (l'hôte de la
 * portée, `getRegistrationOrigin`) que `getBody` sert toujours. Jette sur
 * toute forme inattendue : l'appelant peint l'échec.
 */
const creeLAbonnementFCM = async (
  configuration: ConfigurationFCM,
  souscription: PushSubscription,
  scope: string,
): Promise<string> => {
  const brute = souscription.toJSON() as { readonly endpoint?: string; readonly keys?: Readonly<Record<string, string>> };
  const endpoint = brute.endpoint;
  const p256dh = brute.keys?.['p256dh'];
  const auth = brute.keys?.['auth'];
  if (endpoint === undefined || p256dh === undefined || auth === undefined) {
    throw new Error('subscription incomplète');
  }

  const installations = await fetch(`${configuration.baseInstallations}/v1/projects/${configuration.projectId}/installations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': configuration.apiKey },
    body: JSON.stringify({ fid: genereUnFid(), appId: configuration.appId, authVersion: 'FIS_v2', sdkVersion: 'w:0.0.0' }),
  });
  if (!installations.ok) throw new Error('installations FCM en échec');
  const jetonAuth = ((await installations.json()) as { readonly authToken?: { readonly token?: string } }).authToken?.token;
  if (jetonAuth === undefined) throw new Error('jeton d’installation absent');

  const origin = origineDeLaPortee(scope);
  const registrations = await fetch(`${configuration.baseRegistrations}/v1/projects/${configuration.projectId}/registrations`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': configuration.apiKey,
      'x-goog-firebase-installations-auth': `FIS ${jetonAuth}`,
    },
    body: JSON.stringify({
      web: { ...(origin === undefined ? {} : { origin }), endpoint, auth, p256dh, applicationPubKey: configuration.vapid },
    }),
  });
  if (!registrations.ok) throw new Error('registrations FCM en échec');
  const jeton = ((await registrations.json()) as { readonly token?: string }).token;
  if (jeton === undefined) throw new Error('jeton d’abonnement absent');
  return jeton;
};

/**
 * La registration DE ZONE (`/__v3/sw`) — préférée sur la portée du fil, sinon
 * la première trouvée.
 *
 * PAS SEULEMENT `active` (défaut de revue) : `/notifications/preferences` est
 * HORS des portées du travailleur (§ `V3_SW_PORTEES`), donc cette page n'est
 * contrôlée par aucun worker et ne peut pas attendre `navigator.serviceWorker
 * .ready`. Au TOUT PREMIER passage, le worker que le document vient
 * d'enregistrer est encore `installing`/`waiting` — ne regarder que `active`
 * rendait alors `null`, et le lecteur lisait « L'abonnement n'a pas pu être
 * créé » pour un worker qui existait. `pushManager` vit sur la REGISTRATION,
 * pas sur le worker : elle sert dès qu'elle est trouvée.
 */
const scriptDe = (registration: ServiceWorkerRegistration): string | undefined =>
  (registration.active ?? registration.waiting ?? registration.installing)?.scriptURL;

const trouveLaRegistrationDeZone = async (): Promise<ServiceWorkerRegistration | null> => {
  const registrations = await navigator.serviceWorker.getRegistrations();
  const deZone = registrations.filter((r) => scriptDe(r)?.includes('/__v3/sw') === true);
  return deZone.find((r) => r.scope.includes('/chats')) ?? deZone[0] ?? null;
};

const surSoumissionAbonner = async (main: HTMLElement, formulaire: HTMLFormElement): Promise<void> => {
  const configuration = configurationDepuis(main);
  if (configuration === null) return;

  try {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      montreLEchec(main, PREFS.push.motifNavigateurIncompatible);
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      montreLEchec(main, PREFS.push.motifPermissionRefusee);
      return;
    }

    const registration = await trouveLaRegistrationDeZone();
    if (registration === null) {
      montreLEchec(main, PREFS.push.motifEchecAbonnement);
      return;
    }

    const souscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // `Uint8Array<ArrayBufferLike>` (le type générique de la lib DOM
      // installée) n'est pas structurellement `BufferSource` sans ce cast —
      // la VALEUR reste les mêmes octets, la clé publique VAPID.
      applicationServerKey: urlBase64VersOctets(configuration.vapid) as BufferSource,
    });
    const jetonFCM = await creeLAbonnementFCM(configuration, souscription, registration.scope);
    const deviceId = poseLAppareilPush({ secure: location.protocol === 'https:' });

    const champAbonnement = formulaire.querySelector<HTMLInputElement>('input[name="abonnement"]');
    const champDeviceId = formulaire.querySelector<HTMLInputElement>('input[name="deviceId"]');
    if (champAbonnement !== null) champAbonnement.value = jetonFCM;
    if (champDeviceId !== null) champDeviceId.value = deviceId;

    // `HTMLFormElement.submit()` — jamais `requestSubmit()` — ne déclenche PAS
    // l'événement `submit` (spécification DOM) : c'est ce qui évite que cette
    // soumission NATIVE ne re-tombe dans l'écouteur ci-dessous.
    formulaire.submit();
  } catch {
    montreLEchec(main, PREFS.push.motifEchecAbonnement);
  }
};

/** Le contexte que `lib/realtime/prefs.ts` détient déjà et transmet à l'armement (jeton du cookie, base de la passerelle). */
export type ContextePush = {
  readonly passerelle: string;
  readonly jeton: string;
};

/**
 * LA MOITIÉ « DÉSABONNER » (restante FLUIDITÉ de #5391, ce travail) — le
 * patron des treize bascules voisines (`lib/realtime/prefs.ts` ›
 * `surBascule`) : peinture OPTIMISTE, appel DIRECT à la passerelle
 * (`retireLeJetonPush`, `lib/api/push-tokens.ts` — le MÊME site que la porte
 * utilise sans JavaScript), rollback VISIBLE sur refus — jamais le patron du
 * rejeu en arrière-plan (`rejoueSiRotationEnArrierePlan`), réservé à une
 * surface SANS cet écran.
 *
 * LE COOKIE APPAREIL EST LA SOURCE DE VÉRITÉ du `deviceId` — jamais le champ
 * caché du formulaire, qu'un lecteur pourrait altérer : la MÊME source que
 * la porte lit sans JavaScript (`app/connecte/prefs-porte.ts`).
 *
 * LE SERVEUR D'ABORD, LE PUSHMANAGER APRÈS `fait` — direction d'erreur par
 * coût de réparation (§ 4 étape 2 de la spécification) : désabonner le
 * navigateur avant un retrait serveur qui échoue recréerait le symptôme même
 * de #5391 (token FCM MORT chez la passerelle, rangée « Abonné »,
 * notifications éteintes en silence). L'inverse — une souscription
 * navigateur orpheline après un retrait serveur réussi — est inoffensif :
 * plus aucun push ne part depuis ce navigateur.
 *
 * LE CONTEXTE DURABLE SUIT (`memoriseLeContextePush`) : sans cette
 * réécriture, `rejoueSiRotationEnArrierePlan` sur `/chats` réabonnerait dans
 * son dos un lecteur qui vient de se désabonner explicitement — le contexte
 * écrit au dernier chargement de cette page disait encore `abonne: true`.
 *
 * PAS DE VERROU ANTI-DOUBLE-CLIC : `DELETE /users/register-device-token`
 * est IDEMPOTENT (`deletedCount: 0` reste un 200) et un second clic sur la
 * rangée repeinte (`valeur='true'`) est le geste LÉGITIME de réabonnement.
 */
const surSoumissionDesabonner = async (main: HTMLElement, formulaire: HTMLFormElement, ctx: ContextePush): Promise<void> => {
  const deviceId = lisLAppareilPush(document.cookie);
  if (deviceId === null) {
    montreLEchec(main, PREFS.push.motifAucunAbonnementConnu);
    return;
  }

  const bouton = formulaire.querySelector<HTMLButtonElement>('button[role="switch"]');
  if (bouton === null) return;

  const peins = (valeur: boolean): void =>
    peinsLaRangee({ formulaire, bouton, valeur, libelleActif: PREFS.push.abonne, libelleInactif: PREFS.push.nonAbonne });

  peins(false);

  const issueDuRetrait = await retireLeJetonPush({ jeton: ctx.jeton, deviceId, base: ctx.passerelle });

  if (issueDuRetrait.genre !== 'fait') {
    peins(true);
    if (issueDuRetrait.genre === 'session-expiree') {
      montreLaSessionExpiree(main);
      return;
    }
    montreLEchec(main, PREFS.push.motifEchecDesabonnement);
    return;
  }

  montreLaReussite(main, PREFS.push.regleDesabonne);
  void memoriseLeContextePush(main);

  try {
    const registration = await trouveLaRegistrationDeZone();
    const souscription = await registration?.pushManager.getSubscription();
    await souscription?.unsubscribe();
  } catch {
    // best-effort — une souscription navigateur orpheline est inoffensive
    // (voir le doc-comment ci-dessus) : rien d'autre à faire ici.
  }
};

/**
 * L'ARMEMENT — délégué sur `main`, comme les treize bascules
 * (`lib/realtime/prefs.ts`), filtré sur `form.bascule-push` et aiguillé par
 * la VALEUR du geste : `valeur=true` (s'abonner) suit le chemin existant,
 * `valeur=false` (se désabonner, restante FLUIDITÉ de #5391) appelle
 * `surSoumissionDesabonner` ci-dessus, toute autre valeur traverse sans
 * interception (repli sans JavaScript).
 */
export const armeLAbonnementPush = (main: HTMLElement, ctx: ContextePush): void => {
  main.addEventListener('submit', (evenement) => {
    const formulaire = evenement.target;
    if (!(formulaire instanceof HTMLFormElement) || !formulaire.classList.contains('bascule-push')) return;
    const champValeur = formulaire.querySelector<HTMLInputElement>('input[name="valeur"]');
    if (champValeur === null) return;

    if (champValeur.value === 'false') {
      evenement.preventDefault();
      void surSoumissionDesabonner(main, formulaire, ctx);
      return;
    }

    if (champValeur.value !== 'true') return;
    // Sans configuration Firebase, la rangée est déjà servie `disabled`
    // (`prefs-vue.ts`) : ce geste ne devrait jamais arriver ici, mais s'il
    // le fait, laisser la soumission NATIVE partir est le repli correct —
    // la porte sert alors le motif « exige JavaScript » (§ 3.2), jamais un
    // `preventDefault` qui n'aurait rien à faire suivre.
    if (configurationDepuis(main) === null) return;

    evenement.preventDefault();
    void surSoumissionAbonner(main, formulaire);
  });
};

/**
 * LA CACHE DE ROTATION EXISTE-T-ELLE DÉJÀ ? — `caches.open()` CRÉE le nom
 * qu'on lui passe, MÊME SANS aucun `.put()` derrière : la spec Cache Storage
 * crée l'entrée d'index à l'OUVERTURE, pas à l'écriture (même constat que le
 * doc-comment de `lib/sw/travailleur.js` sur la fenêtre de suppression du
 * worker). `rejoueSiRotation` et `rejoueSiRotationEnArrierePlan` ne font
 * qu'une LECTURE d'un drapeau qui, la plupart du temps, n'a jamais été posé
 * (aucune rotation n'est jamais survenue sur cet appareil) : appeler
 * `caches.open()` pour ce simple test d'existence RESSUSCITE un cache que la
 * DÉCONNEXION vient de purger, si l'ouverture arrive après la purge — la
 * course mesurée par `e2e/visual/v3-deconnexion.spec.ts`
 * (« plus AUCUN cache… ») : `rejoueSiRotationEnArrierePlan` tourne EN
 * ARRIÈRE-PLAN à CHAQUE chargement de `/chats` (`lib/realtime/liste.ts:565`,
 * `void`, sans attendre), la surface même que « Mon espace » ouvre pour
 * sortir. `caches.keys()` D'ABORD ferme cette course à la source, pour les
 * deux lecteurs : rien à ouvrir tant que rien n'a jamais existé.
 */
const laCacheDeRotationExiste = async (): Promise<boolean> => (await caches.keys()).includes(CACHE_DE_ROTATION_PUSH);

const effaceLeDrapeauDeRotation = async (): Promise<void> => {
  try {
    const cache = await caches.open(CACHE_DE_ROTATION_PUSH);
    await cache.delete(CLE_DE_ROTATION_PUSH);
  } catch {
    // best-effort — un navigateur qui refuse le Cache Storage laisse le
    // drapeau en place, et le prochain chargement retentera le rejeu.
  }
};

/**
 * LE REJEU DE LA ROTATION (#5391, suivi de revue) — un navigateur peut
 * invalider la `PushSubscription` HORS du contrôle de toute page (rotation
 * de clé côté navigateur ou FCM) ; l'événement `pushsubscriptionchange`
 * n'arrive alors qu'au WORKER (`lib/sw/travailleur.js`), qui pose un DRAPEAU
 * dans le Cache Storage (contrat `lib/sw/signal.ts`) faute de pouvoir
 * rejouer lui-même la danse REST — la configuration Firebase vit sur CE
 * document, jamais dans le fichier plat.
 *
 * Sans ce rejeu, RIEN ne le fait : la passerelle détient un token FCM MORT,
 * la rangée continue d'afficher « Abonné » (elle relit `GET /users/me/
 * devices`, qui ne sait rien d'une rotation navigateur), et les
 * notifications cessent en SILENCE.
 *
 * N'AGIT QUE SI LA RANGÉE DIT DÉJÀ « ABONNÉ » (`valeur=false`, l'inverse que
 * le PROCHAIN clic enverrait — `peinsLaRangee`, `lib/realtime/prefs.ts`) :
 * un lecteur qui s'est explicitement désabonné n'a pas à être réabonné dans
 * son dos par un drapeau resté d'avant son geste.
 */
export const rejoueSiRotation = async (main: HTMLElement): Promise<void> => {
  if (!('caches' in window)) return;
  if (configurationDepuis(main) === null) return;
  const formulaire = main.querySelector<HTMLFormElement>('form.bascule-push');
  if (formulaire === null) return;
  const champValeur = formulaire.querySelector<HTMLInputElement>('input[name="valeur"]');
  if (champValeur === null || champValeur.value !== 'false') return;

  let drapeau: unknown;
  try {
    if (!(await laCacheDeRotationExiste())) return;
    const cache = await caches.open(CACHE_DE_ROTATION_PUSH);
    drapeau = await cache.match(CLE_DE_ROTATION_PUSH);
  } catch {
    return;
  }
  if (drapeau === undefined) return;

  await effaceLeDrapeauDeRotation();
  await surSoumissionAbonner(main, formulaire);
};

/**
 * LE CONTEXTE DURABLE (#5391, suivi de revue défaut 3) — écrit à CHAQUE
 * chargement de `/notifications/preferences`, y compris le rechargement qui
 * suit immédiatement un premier abonnement (Post/Redirect/Get) : c'est ce qui
 * garantit qu'un lecteur qui « ouvre la page UNE fois pour s'abonner, plus
 * jamais » laisse quand même un contexte utilisable derrière lui.
 *
 * `deviceId` vient du COOKIE — jamais `poseLAppareilPush`, qui EN CRÉERAIT UN
 * pour un visiteur qui n'a jamais rien abonné : ce module lit, il ne pose
 * pas. Sans cookie, rien n'a jamais pu être créé sur cet appareil — rien à
 * mémoriser.
 */
export const memoriseLeContextePush = async (main: HTMLElement): Promise<void> => {
  if (!('caches' in window)) return;
  const configuration = configurationDepuis(main);
  if (configuration === null) return;
  const deviceId = lisLAppareilPush(document.cookie);
  if (deviceId === null) return;

  const formulaire = main.querySelector<HTMLFormElement>('form.bascule-push');
  const champValeur = formulaire?.querySelector<HTMLInputElement>('input[name="valeur"]');
  // `valeur=false` = la rangée dit déjà « Abonné » (`peinsLaRangee` pose
  // l'inverse de l'état affiché) — même convention que `rejoueSiRotation`.
  const abonne = champValeur?.value === 'false';

  try {
    const cache = await caches.open(CACHE_DE_ROTATION_PUSH);
    await cache.put(CLE_DE_CONTEXTE_PUSH, new Response(JSON.stringify({ configuration, abonne, deviceId })));
  } catch {
    // best-effort — un navigateur qui refuse le Cache Storage n'a simplement
    // pas de rejeu en arrière-plan ; `rejoueSiRotation` reste son seul filet,
    // sur cette page.
  }
};

/**
 * LE REJEU EN ARRIÈRE-PLAN (#5391, suivi de revue défaut 3) — `rejoueSiRotation`
 * ci-dessus ne peut vivre QUE sur `/notifications/preferences` : c'est la
 * SEULE page qui sert la configuration Firebase et le formulaire
 * `bascule-push`. Un lecteur qui l'ouvre UNE fois pour s'abonner puis n'y
 * revient JAMAIS (le cas nominal) laissait un token FCM mort survivre sans
 * fin en cas de rotation — le symptôme même que #5391 nommait, déplacé d'un
 * cran plutôt que fermé.
 *
 * Ce second rejeu vit sur la surface que le lecteur RÉOUVRE — `/chats`
 * (`lib/realtime/liste.ts`) — et lit le CONTEXTE DURABLE que
 * `memoriseLeContextePush` a écrit lors du dernier passage sur les
 * préférences (même Cache Storage, même origine — § doc-comment de
 * `CLE_DE_CONTEXTE_PUSH`). Sans ce contexte (préférences jamais ouvertes,
 * jamais abonné), rien à rejouer : ce module n'invente ni configuration ni
 * consentement, il relit ce qu'un geste explicite a déjà écrit.
 *
 * PAS DE NAVIGATION : contrairement à `rejoueSiRotation`, qui laisse le
 * formulaire de la page préférences faire un Post/Redirect/Get, ce rejeu
 * poste en ARRIÈRE-PLAN (`fetch`, même origine, mêmes champs que la porte
 * attend, § 2.5) — recharger `/chats` sous le lecteur pour une rotation de
 * clé serait une régression pire que le token mort qu'il corrige.
 *
 * `Notification.permission` est LU, jamais REDEMANDÉ : `abonne === true`
 * suppose déjà un octroi passé — solliciter `requestPermission()` en tâche de
 * fond ferait surgir l'invite du navigateur sans geste du lecteur.
 */
export const rejoueSiRotationEnArrierePlan = async (): Promise<void> => {
  if (!('caches' in window)) return;

  let drapeauPose: boolean;
  let brut: unknown;
  try {
    if (!(await laCacheDeRotationExiste())) return;
    const cache = await caches.open(CACHE_DE_ROTATION_PUSH);
    drapeauPose = (await cache.match(CLE_DE_ROTATION_PUSH)) !== undefined;
    if (!drapeauPose) return;
    const reponseContexte = await cache.match(CLE_DE_CONTEXTE_PUSH);
    brut = reponseContexte === undefined ? undefined : await reponseContexte.json();
  } catch {
    return;
  }
  if (brut === undefined || typeof brut !== 'object' || brut === null) return;

  const { configuration, abonne, deviceId } = brut as {
    readonly configuration?: ConfigurationFCM;
    readonly abonne?: boolean;
    readonly deviceId?: string;
  };
  if (configuration === undefined || abonne !== true || typeof deviceId !== 'string' || deviceId === '') return;
  if (
    !('Notification' in window) ||
    Notification.permission !== 'granted' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return;
  }

  try {
    const registration = await trouveLaRegistrationDeZone();
    if (registration === null) return;
    const souscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64VersOctets(configuration.vapid) as BufferSource,
    });
    const jetonFCM = await creeLAbonnementFCM(configuration, souscription, registration.scope);

    const reponse = await fetch('/notifications/preferences', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ geste: 'push', valeur: 'true', abonnement: jetonFCM, deviceId }),
    });
    if (!reponse.ok) return;

    await effaceLeDrapeauDeRotation();
  } catch {
    // best-effort — un échec laisse le drapeau posé : le prochain chargement
    // (préférences ou `/chats`) retentera le rejeu.
  }
};
