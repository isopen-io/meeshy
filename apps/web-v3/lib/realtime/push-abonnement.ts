import { poseLAppareilPush } from '@/lib/api/push-appareil';
import { PREFS } from '@/lib/contenu/prefs-de-notif';

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
 * SEULE LA MOITIÉ « ABONNER » EST INTERCEPTÉE (`valeur=true`) : LA MOITIÉ
 * « DÉSABONNER » (`valeur=false`) RESTE UN `<form method="post">` NU — la
 * porte (`app/connecte/prefs-porte.ts`) retire le token depuis le COOKIE
 * appareil, sans qu'aucun geste client ne soit nécessaire (§ 3.2). Un module
 * qui interceptait aussi ce chemin aurait dupliqué une logique déjà servie
 * PLUS SIMPLEMENT sans JavaScript.
 *
 * LE SERVEUR RESTE LE COMPOSITEUR : ce module ne peint jamais l'état
 * « abonné » lui-même — il remplit les DEUX champs cachés que la porte lit
 * (`abonnement`, `deviceId`) puis laisse la soumission NATIVE partir
 * (`formulaire.submit()`, qui NE DÉCLENCHE PAS l'événement `submit` — la
 * spec DOM le garantit, c'est ce qui évite la boucle avec l'écouteur
 * ci-dessous) : la porte fait le Post/Redirect/Get, et la rangée peinte au
 * retour est celle que le SERVEUR a relue sur `GET /users/me/devices`.
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

const montreLEchec = (main: HTMLElement, motif: string): void => {
  const avis = main.querySelector<HTMLElement>('.avis');
  const echec = main.querySelector<HTMLElement>('.echec');
  if (avis !== null) avis.hidden = true;
  if (echec === null) return;
  echec.hidden = false;
  echec.textContent = motif;
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

/** Les DEUX appels REST (§ 0, § 2.5) — jamais le SDK. Jette sur toute forme inattendue : l'appelant peint l'échec. */
const creeLAbonnementFCM = async (configuration: ConfigurationFCM, souscription: PushSubscription): Promise<string> => {
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

  const registrations = await fetch(`${configuration.baseRegistrations}/v1/projects/${configuration.projectId}/registrations`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': configuration.apiKey,
      'x-goog-firebase-installations-auth': jetonAuth,
    },
    body: JSON.stringify({ web: { endpoint, p256dh, auth, applicationPubKey: configuration.vapid } }),
  });
  if (!registrations.ok) throw new Error('registrations FCM en échec');
  const jeton = ((await registrations.json()) as { readonly token?: string }).token;
  if (jeton === undefined) throw new Error('jeton d’abonnement absent');
  return jeton;
};

/** La registration DE ZONE (`/__v3/sw`) — préférée sur la portée du fil, sinon la première trouvée. */
const trouveLaRegistrationDeZone = async (): Promise<ServiceWorkerRegistration | null> => {
  const registrations = await navigator.serviceWorker.getRegistrations();
  const deZone = registrations.filter((r) => r.active?.scriptURL.includes('/__v3/sw') === true);
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
    const jetonFCM = await creeLAbonnementFCM(configuration, souscription);
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

/**
 * L'ARMEMENT — délégué sur `main`, comme les treize bascules
 * (`lib/realtime/prefs.ts`), mais filtré sur `form.bascule-push` ET
 * `valeur=true` : la moitié « désabonner » traverse cet écouteur sans être
 * interceptée.
 */
export const armeLAbonnementPush = (main: HTMLElement): void => {
  main.addEventListener('submit', (evenement) => {
    const formulaire = evenement.target;
    if (!(formulaire instanceof HTMLFormElement) || !formulaire.classList.contains('bascule-push')) return;
    const champValeur = formulaire.querySelector<HTMLInputElement>('input[name="valeur"]');
    if (champValeur === null || champValeur.value !== 'true') return;
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
