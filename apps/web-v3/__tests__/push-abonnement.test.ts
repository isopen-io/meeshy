/**
 * LE MODULE D'ABONNEMENT PUSH (#5391) — `lib/realtime/push-abonnement.ts`,
 * armé par `lib/realtime/prefs.ts` sur la rangée push UNIQUEMENT.
 *
 * Ce que ces témoins gardent :
 *   - `valeur=false` (désabonner) traverse SANS interception — le chemin
 *     sans JavaScript reste le seul, § 3.2 ;
 *   - `valeur=true` sans configuration Firebase (attributs `data-` absents)
 *     ne fait RIEN — le bouton `disabled` ne devrait jamais soumettre, et
 *     ce module ne suppose pas le contraire ;
 *   - chaque échec (navigateur incompatible, permission refusée, `subscribe`
 *     qui jette, un appel FCM non-2xx) peint la fente `.echec`, jamais une
 *     exception avalée ;
 *   - le chemin nominal remplit `abonnement`/`deviceId` puis appelle
 *     `formulaire.submit()` — jamais `requestSubmit()`, qui redéclencherait
 *     l'écouteur.
 */

import {
  armeLAbonnementPush,
  genereUnFid,
  memoriseLeContextePush,
  rejoueSiRotation,
  rejoueSiRotationEnArrierePlan,
  urlBase64VersOctets,
} from '@/lib/realtime/push-abonnement';
import { CLE_DE_CONTEXTE_PUSH, CLE_DE_ROTATION_PUSH } from '@/lib/sw/signal';

const CONFIG_ATTRS = {
  'data-firebase-api-key': 'AIza-test',
  'data-firebase-project-id': 'meeshy-test',
  'data-firebase-app-id': '1:123:web:abc',
  'data-firebase-vapid': 'NeX7OBg0HiQMZj_rtRqIBZsHuDaD5NgDgsGV-taXmCQ6dAeO2KaW3iOZn0J7ij98dTX_5FCWgLUN884-Fy2OgBo',
  'data-fcm-installations-base': 'https://fcm-installations.bouchon.test',
  'data-fcm-registrations-base': 'https://fcm-registrations.bouchon.test',
} as const;

const monteLaRangee = (attrs?: Readonly<Record<string, string>>): { main: HTMLElement; formulaire: HTMLFormElement } => {
  const attributs = Object.entries(attrs ?? {})
    .map(([nom, valeur]) => `${nom}="${valeur}"`)
    .join(' ');
  document.body.innerHTML =
    `<main data-participation="prefs" ${attributs}>` +
    '<p class="avis" role="status" hidden></p>' +
    '<p class="echec" role="alert" hidden></p>' +
    '<form class="bascule-push" method="post">' +
    '<input type="hidden" name="geste" value="push">' +
    '<input type="hidden" name="valeur" value="true">' +
    '<input type="hidden" name="abonnement" value="">' +
    '<input type="hidden" name="deviceId" value="">' +
    '<button type="submit" role="switch" aria-checked="false">basculer</button>' +
    '</form>' +
    '</main>';
  return {
    main: document.querySelector('main') as HTMLElement,
    formulaire: document.querySelector('form.bascule-push') as HTMLFormElement,
  };
};

const soumets = (formulaire: HTMLFormElement): Event => {
  const evenement = new Event('submit', { bubbles: true, cancelable: true });
  formulaire.dispatchEvent(evenement);
  return evenement;
};

const attendUneMicrotache = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * `Response` n'est PAS un global de `jest-environment-jsdom` (mesuré :
 * `typeof Response === 'undefined'` dans ce harnais) — alors que le code
 * PRODUIT (`memoriseLeContextePush`, `rejoueSiRotationEnArrierePlan`) en
 * construit un réel, comme le fait déjà `lib/sw/travailleur.js`
 * (`__tests__/sw-zone.test.ts`, même constat, même repli). Un polyfill
 * MINIMAL — suffisant pour `.json()` sur un corps JSON — plutôt qu'un objet
 * nu que le code testé ne construirait jamais lui-même.
 */
class ReponseFactice {
  private readonly corps: string;
  constructor(corps: string) {
    this.corps = corps;
  }
  json(): Promise<unknown> {
    return Promise.resolve(JSON.parse(this.corps));
  }
}

describe('urlBase64VersOctets', () => {
  it('décode une clé VAPID base64url en octets', () => {
    const octets = urlBase64VersOctets('AAEC');
    expect(Array.from(octets)).toEqual([0, 1, 2]);
  });
});

describe('genereUnFid', () => {
  it('rend 22 caractères base64url, le premier octet portant le motif 0111xxxx', () => {
    const fid = genereUnFid();
    expect(fid).toHaveLength(22);
    expect(fid).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const octets = urlBase64VersOctets(fid);
    expect((octets[0] ?? 0) & 0b11110000).toBe(0b01110000);
  });
});

describe('armeLAbonnementPush', () => {
  const submitEspion = HTMLFormElement.prototype.submit;

  beforeEach(() => {
    HTMLFormElement.prototype.submit = jest.fn();
  });

  afterEach(() => {
    HTMLFormElement.prototype.submit = submitEspion;
    jest.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'Notification');
    Reflect.deleteProperty(navigator, 'serviceWorker');
    Reflect.deleteProperty(window, 'PushManager');
  });

  it('n’intercepte JAMAIS le désabonnement (valeur=false) — aucun preventDefault', () => {
    const { main, formulaire } = monteLaRangee(CONFIG_ATTRS);
    formulaire.querySelector<HTMLInputElement>('input[name="valeur"]')!.value = 'false';
    armeLAbonnementPush(main);

    const evenement = soumets(formulaire);

    expect(evenement.defaultPrevented).toBe(false);
    expect(HTMLFormElement.prototype.submit).not.toHaveBeenCalled();
  });

  it('sans configuration Firebase (attributs data- absents), ne fait rien', () => {
    const { main, formulaire } = monteLaRangee();
    armeLAbonnementPush(main);

    const evenement = soumets(formulaire);

    expect(evenement.defaultPrevented).toBe(false);
  });

  it('navigateur incompatible (ni Notification, ni serviceWorker, ni PushManager) : échec peint, formulaire NON soumis', async () => {
    const { main, formulaire } = monteLaRangee(CONFIG_ATTRS);
    armeLAbonnementPush(main);

    soumets(formulaire);
    await attendUneMicrotache();
    await attendUneMicrotache();

    const echec = main.querySelector('.echec') as HTMLElement;
    expect(echec.hidden).toBe(false);
    expect(echec.textContent).toContain('ne prend pas en charge');
    expect(HTMLFormElement.prototype.submit).not.toHaveBeenCalled();
  });

  it('permission refusée : échec peint, formulaire NON soumis', async () => {
    const { main, formulaire } = monteLaRangee(CONFIG_ATTRS);
    (globalThis as { Notification?: unknown }).Notification = { requestPermission: jest.fn(() => Promise.resolve('denied')) };
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
    (window as { PushManager?: unknown }).PushManager = function PushManager(): void {};
    armeLAbonnementPush(main);

    soumets(formulaire);
    await attendUneMicrotache();
    await attendUneMicrotache();
    await attendUneMicrotache();

    const echec = main.querySelector('.echec') as HTMLElement;
    expect(echec.hidden).toBe(false);
    expect(echec.textContent).toContain('permission');
    expect(HTMLFormElement.prototype.submit).not.toHaveBeenCalled();
  });

  it('chemin nominal : remplit abonnement/deviceId puis soumet NATIVEMENT (submit, pas requestSubmit)', async () => {
    const { main, formulaire } = monteLaRangee(CONFIG_ATTRS);

    (globalThis as { Notification?: unknown }).Notification = { requestPermission: jest.fn(() => Promise.resolve('granted')) };
    const subscribe = jest.fn(() =>
      Promise.resolve({ toJSON: () => ({ endpoint: 'https://fcm.test/x', keys: { p256dh: 'clé-p256dh', auth: 'clé-auth' } }) }),
    );
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistrations: () =>
          Promise.resolve([{ active: { scriptURL: 'https://x.test/__v3/sw?portees=%2Fchats' }, scope: 'https://x.test/chats', pushManager: { subscribe } }]),
      },
      configurable: true,
    });
    (window as { PushManager?: unknown }).PushManager = function PushManager(): void {};

    const appelsFetch: string[] = [];
    globalThis.fetch = jest.fn(async (url: unknown) => {
      const cible = String(url);
      appelsFetch.push(cible);
      if (cible.includes('installations')) {
        return { ok: true, json: async () => ({ authToken: { token: 'jeton-installation' }, fid: 'fid-1' }) };
      }
      return { ok: true, json: async () => ({ token: 'fcm-token-final' }) };
    }) as unknown as typeof fetch;

    armeLAbonnementPush(main);
    soumets(formulaire);
    for (let i = 0; i < 10; i += 1) await attendUneMicrotache();

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(appelsFetch.some((u) => u.includes('installations'))).toBe(true);
    expect(appelsFetch.some((u) => u.includes('registrations'))).toBe(true);
    expect(formulaire.querySelector<HTMLInputElement>('input[name="abonnement"]')?.value).toBe('fcm-token-final');
    expect(formulaire.querySelector<HTMLInputElement>('input[name="deviceId"]')?.value).toMatch(/.+/);
    expect(HTMLFormElement.prototype.submit).toHaveBeenCalledTimes(1);
  });

  /**
   * LA FORME EXACTE DE L'APPEL REGISTRATIONS (défaut de revue, #5391) —
   * comparée au SDK RÉEL vendoré (`node_modules/.bun/@firebase+messaging@
   * 0.13.0…/dist/esm/index.esm.js`, `getHeaders`/`getBody`), pas devinée :
   * l'en-tête `x-goog-firebase-installations-auth` porte le jeton PRÉFIXÉ
   * `FIS ` (espace compris — `getHeaders`: `` `FIS ${authToken}` ``), et le
   * corps porte `web.origin` (l'hôte de la portée de la registration,
   * `getRegistrationOrigin`) — deux champs que la passerelle FCM réelle
   * exige et que ce module omettait, un défaut invisible contre le bouchon
   * (qui accepte tout corps).
   */
  it('l’appel Registrations porte le jeton PRÉFIXÉ "FIS " et l’origin de la portée — forme du SDK réel', async () => {
    const { main, formulaire } = monteLaRangee(CONFIG_ATTRS);
    (globalThis as { Notification?: unknown }).Notification = { requestPermission: jest.fn(() => Promise.resolve('granted')) };
    const subscribe = jest.fn(() =>
      Promise.resolve({ toJSON: () => ({ endpoint: 'https://fcm.test/x', keys: { p256dh: 'clé-p256dh', auth: 'clé-auth' } }) }),
    );
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistrations: () =>
          Promise.resolve([{ active: { scriptURL: 'https://x.test/__v3/sw?portees=%2Fchats' }, scope: 'https://x.test/chats', pushManager: { subscribe } }]),
      },
      configurable: true,
    });
    (window as { PushManager?: unknown }).PushManager = function PushManager(): void {};

    const appels: { url: string; init: { headers?: Record<string, string>; body?: string } }[] = [];
    globalThis.fetch = jest.fn(async (url: unknown, init?: { headers?: Record<string, string>; body?: string }) => {
      appels.push({ url: String(url), init: init ?? {} });
      if (String(url).includes('installations')) {
        return { ok: true, json: async () => ({ authToken: { token: 'jeton-installation' }, fid: 'fid-1' }) };
      }
      return { ok: true, json: async () => ({ token: 'fcm-token-final' }) };
    }) as unknown as typeof fetch;

    armeLAbonnementPush(main);
    soumets(formulaire);
    for (let i = 0; i < 10; i += 1) await attendUneMicrotache();

    const registrations = appels.find((a) => a.url.includes('registrations'));
    expect(registrations).toBeDefined();
    expect(registrations!.init.headers?.['x-goog-firebase-installations-auth']).toBe('FIS jeton-installation');
    const corps = JSON.parse(registrations!.init.body ?? '{}') as { web?: { origin?: string } };
    expect(corps.web?.origin).toBe('x.test');
  });

  /**
   * AU TOUT PREMIER PASSAGE (défaut de revue) — `/notifications/preferences`
   * est HORS des portées du travailleur, donc le worker que le document vient
   * d'enregistrer est encore `installing` : ne regarder que `active` peignait
   * un échec pour une registration qui existe, et `pushManager` vit sur la
   * REGISTRATION, jamais sur le worker.
   */
  it('une registration de zone encore `installing` sert quand même — pushManager vit sur la registration', async () => {
    const { main, formulaire } = monteLaRangee(CONFIG_ATTRS);
    (globalThis as { Notification?: unknown }).Notification = { requestPermission: jest.fn(() => Promise.resolve('granted')) };
    const subscribe = jest.fn(() =>
      Promise.resolve({ toJSON: () => ({ endpoint: 'https://fcm.test/x', keys: { p256dh: 'p', auth: 'a' } }) }),
    );
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistrations: () =>
          Promise.resolve([
            { active: null, waiting: null, installing: { scriptURL: 'https://x.test/__v3/sw?portees=%2Fchats' }, scope: 'https://x.test/chats', pushManager: { subscribe } },
          ]),
      },
      configurable: true,
    });
    (window as { PushManager?: unknown }).PushManager = function PushManager(): void {};
    globalThis.fetch = jest.fn(async (url: unknown) =>
      String(url).includes('installations')
        ? { ok: true, json: async () => ({ authToken: { token: 'jeton' } }) }
        : { ok: true, json: async () => ({ token: 'fcm-token-final' }) },
    ) as unknown as typeof fetch;

    armeLAbonnementPush(main);
    soumets(formulaire);
    for (let i = 0; i < 10; i += 1) await attendUneMicrotache();

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(formulaire.querySelector<HTMLInputElement>('input[name="abonnement"]')?.value).toBe('fcm-token-final');
  });

  /**
   * AUCUNE registration de zone (le worker n'a jamais été enregistré, ou il
   * a été désinscrit) — un échec PEINT, jamais une exception avalée.
   */
  it('sans aucune registration de zone, l’échec est peint et le formulaire n’est pas soumis', async () => {
    const { main, formulaire } = monteLaRangee(CONFIG_ATTRS);
    (globalThis as { Notification?: unknown }).Notification = { requestPermission: jest.fn(() => Promise.resolve('granted')) };
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations: () => Promise.resolve([]) },
      configurable: true,
    });
    (window as { PushManager?: unknown }).PushManager = function PushManager(): void {};

    armeLAbonnementPush(main);
    soumets(formulaire);
    for (let i = 0; i < 6; i += 1) await attendUneMicrotache();

    const echec = main.querySelector('.echec') as HTMLElement;
    expect(echec.hidden).toBe(false);
    expect(HTMLFormElement.prototype.submit).not.toHaveBeenCalled();
  });

  it('un appel FCM non-2xx peint l’échec sans soumettre', async () => {
    const { main, formulaire } = monteLaRangee(CONFIG_ATTRS);
    (globalThis as { Notification?: unknown }).Notification = { requestPermission: jest.fn(() => Promise.resolve('granted')) };
    const subscribe = jest.fn(() =>
      Promise.resolve({ toJSON: () => ({ endpoint: 'https://fcm.test/x', keys: { p256dh: 'p', auth: 'a' } }) }),
    );
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistrations: () =>
          Promise.resolve([{ active: { scriptURL: 'https://x.test/__v3/sw' }, scope: 'https://x.test/chats', pushManager: { subscribe } }]),
      },
      configurable: true,
    });
    (window as { PushManager?: unknown }).PushManager = function PushManager(): void {};
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;

    armeLAbonnementPush(main);
    soumets(formulaire);
    await attendUneMicrotache();
    await attendUneMicrotache();
    await attendUneMicrotache();
    await attendUneMicrotache();

    const echec = main.querySelector('.echec') as HTMLElement;
    expect(echec.hidden).toBe(false);
    expect(HTMLFormElement.prototype.submit).not.toHaveBeenCalled();
  });
});

/**
 * LE REJEU DE LA ROTATION (#5391, suivi de revue) — le drapeau que
 * `pushsubscriptionchange` pose côté worker (`__tests__/sw-zone.test.ts`)
 * relu ICI, côté page, à chaque chargement de `/notifications/preferences`.
 * Sans ce rejeu, un token FCM mort survit en silence dans la passerelle
 * pendant que la rangée continue d'afficher « Abonné ».
 */
describe('rejoueSiRotation', () => {
  const submitEspionDeLaRotation = HTMLFormElement.prototype.submit;
  type FauxCache = { match: (cle: string) => Promise<unknown>; delete: (cle: string) => Promise<boolean> };

  const monteLesCaches = (drapeauPose: boolean): { readonly open: jest.Mock<Promise<FauxCache>, [string]>; readonly entrees: Map<string, unknown> } => {
    const entrees = new Map<string, unknown>();
    if (drapeauPose) entrees.set(CLE_DE_ROTATION_PUSH, { corps: '1' });
    const cache: FauxCache = {
      match: (cle) => Promise.resolve(entrees.get(cle)),
      delete: (cle) => Promise.resolve(entrees.delete(cle)),
    };
    return { open: jest.fn((_nom: string) => Promise.resolve(cache)), entrees };
  };

  const rangeeAbonnee = (): { main: HTMLElement; formulaire: HTMLFormElement } => {
    const { main, formulaire } = monteLaRangee(CONFIG_ATTRS);
    // `valeur=false` : la rangée dit déjà « Abonné » (`peinsLaRangee` pose
    // l'INVERSE de l'état affiché) — c'est l'état que la rotation vise.
    formulaire.querySelector<HTMLInputElement>('input[name="valeur"]')!.value = 'false';
    return { main, formulaire };
  };

  beforeEach(() => {
    HTMLFormElement.prototype.submit = jest.fn();
    (globalThis as { Notification?: unknown }).Notification = { requestPermission: jest.fn(() => Promise.resolve('granted')) };
    const subscribe = jest.fn(() =>
      Promise.resolve({ toJSON: () => ({ endpoint: 'https://fcm.test/x', keys: { p256dh: 'p', auth: 'a' } }) }),
    );
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistrations: () =>
          Promise.resolve([{ active: { scriptURL: 'https://x.test/__v3/sw?portees=%2Fchats' }, scope: 'https://x.test/chats', pushManager: { subscribe } }]),
      },
      configurable: true,
    });
    (window as { PushManager?: unknown }).PushManager = function PushManager(): void {};
    globalThis.fetch = jest.fn(async (url: unknown) =>
      String(url).includes('installations')
        ? { ok: true, json: async () => ({ authToken: { token: 'jeton' } }) }
        : { ok: true, json: async () => ({ token: 'fcm-token-rearme' }) },
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    HTMLFormElement.prototype.submit = submitEspionDeLaRotation;
    jest.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'Notification');
    Reflect.deleteProperty(navigator, 'serviceWorker');
    Reflect.deleteProperty(window, 'PushManager');
    Reflect.deleteProperty(globalThis, 'caches');
  });

  it('drapeau posé + rangée déjà abonnée : rejoue la danse REST et EFFACE le drapeau', async () => {
    const { main, formulaire } = rangeeAbonnee();
    const caches = monteLesCaches(true);
    (globalThis as { caches?: unknown }).caches = caches;

    await rejoueSiRotation(main);
    for (let i = 0; i < 6; i += 1) await attendUneMicrotache();

    expect(HTMLFormElement.prototype.submit).toHaveBeenCalledTimes(1);
    expect(formulaire.querySelector<HTMLInputElement>('input[name="abonnement"]')?.value).toBe('fcm-token-rearme');
    expect(caches.entrees.has(CLE_DE_ROTATION_PUSH)).toBe(false);
  });

  it('sans drapeau posé, ne rejoue rien', async () => {
    const { main } = rangeeAbonnee();
    (globalThis as { caches?: unknown }).caches = monteLesCaches(false);

    await rejoueSiRotation(main);
    for (let i = 0; i < 6; i += 1) await attendUneMicrotache();

    expect(HTMLFormElement.prototype.submit).not.toHaveBeenCalled();
  });

  it('rangée DÉSABONNÉE (valeur=true) : ignore le drapeau, ne réabonne pas dans le dos du lecteur', async () => {
    const { main } = monteLaRangee(CONFIG_ATTRS);
    const caches = monteLesCaches(true);
    (globalThis as { caches?: unknown }).caches = caches;

    await rejoueSiRotation(main);
    for (let i = 0; i < 6; i += 1) await attendUneMicrotache();

    expect(HTMLFormElement.prototype.submit).not.toHaveBeenCalled();
    expect(caches.open).not.toHaveBeenCalled();
  });

  it('sans `caches` dans `window` (navigateur incompatible), ne jette pas', async () => {
    const { main } = rangeeAbonnee();
    Reflect.deleteProperty(globalThis, 'caches');

    await expect(rejoueSiRotation(main)).resolves.toBeUndefined();
    expect(HTMLFormElement.prototype.submit).not.toHaveBeenCalled();
  });

  it('sans configuration Firebase, ne touche pas au Cache Storage', async () => {
    const { main, formulaire } = monteLaRangee();
    formulaire.querySelector<HTMLInputElement>('input[name="valeur"]')!.value = 'false';
    const caches = monteLesCaches(true);
    (globalThis as { caches?: unknown }).caches = caches;

    await rejoueSiRotation(main);

    expect(caches.open).not.toHaveBeenCalled();
  });
});

/**
 * LE CONTEXTE DURABLE (#5391, suivi de revue défaut 3) — `memoriseLeContextePush`
 * écrit, à chaque chargement de `/notifications/preferences`, ce que
 * `rejoueSiRotationEnArrierePlan` (ci-dessous) relit depuis `/chats` : sans
 * ces témoins, la moitié aval du rejeu de rotation n'aurait aucun émetteur à
 * vérifier.
 */
describe('memoriseLeContextePush', () => {
  const purgeLesCookies = (): void => {
    document.cookie.split(';').forEach((c) => {
      const nom = c.split('=')[0]?.trim();
      if (nom) document.cookie = `${nom}=; Max-Age=0; path=/`;
    });
  };

  const poseLeCookieAppareil = (deviceId: string): void => {
    document.cookie = `meeshy_v3_push_appareil=${deviceId}; path=/`;
  };

  type FauxCache = { put: (cle: string, reponse: Response) => Promise<void> };
  const monteLesCaches = (): { readonly open: jest.Mock<Promise<FauxCache>, [string]>; readonly ecrits: Map<string, Response> } => {
    const ecrits = new Map<string, Response>();
    const cache: FauxCache = { put: (cle, reponse) => Promise.resolve(void ecrits.set(cle, reponse)) };
    return { open: jest.fn((_nom: string) => Promise.resolve(cache)), ecrits };
  };

  beforeEach(() => {
    purgeLesCookies();
    (globalThis as { Response?: unknown }).Response = ReponseFactice;
  });
  afterEach(() => {
    purgeLesCookies();
    Reflect.deleteProperty(globalThis, 'caches');
    Reflect.deleteProperty(globalThis, 'Response');
  });

  it('sans configuration Firebase, n’écrit rien', async () => {
    const { main } = monteLaRangee();
    poseLeCookieAppareil('appareil-1');
    const caches = monteLesCaches();
    (globalThis as { caches?: unknown }).caches = caches;

    await memoriseLeContextePush(main);

    expect(caches.open).not.toHaveBeenCalled();
  });

  it('sans cookie d’appareil (jamais abonné sur ce navigateur), n’écrit rien', async () => {
    const { main } = monteLaRangee(CONFIG_ATTRS);
    const caches = monteLesCaches();
    (globalThis as { caches?: unknown }).caches = caches;

    await memoriseLeContextePush(main);

    expect(caches.open).not.toHaveBeenCalled();
  });

  it('rangée ABONNÉE (valeur=false) : écrit la configuration, `abonne:true` et le deviceId', async () => {
    const { main, formulaire } = monteLaRangee(CONFIG_ATTRS);
    formulaire.querySelector<HTMLInputElement>('input[name="valeur"]')!.value = 'false';
    poseLeCookieAppareil('appareil-9');
    const caches = monteLesCaches();
    (globalThis as { caches?: unknown }).caches = caches;

    await memoriseLeContextePush(main);

    const ecrit = caches.ecrits.get(CLE_DE_CONTEXTE_PUSH);
    expect(ecrit).toBeDefined();
    const contexte = (await ecrit!.json()) as { abonne: boolean; deviceId: string; configuration: { apiKey: string } };
    expect(contexte.abonne).toBe(true);
    expect(contexte.deviceId).toBe('appareil-9');
    expect(contexte.configuration.apiKey).toBe(CONFIG_ATTRS['data-firebase-api-key']);
  });

  it('rangée NON abonnée (valeur=true) : écrit `abonne:false`', async () => {
    const { main, formulaire } = monteLaRangee(CONFIG_ATTRS);
    formulaire.querySelector<HTMLInputElement>('input[name="valeur"]')!.value = 'true';
    poseLeCookieAppareil('appareil-9');
    const caches = monteLesCaches();
    (globalThis as { caches?: unknown }).caches = caches;

    await memoriseLeContextePush(main);

    const contexte = (await caches.ecrits.get(CLE_DE_CONTEXTE_PUSH)!.json()) as { abonne: boolean };
    expect(contexte.abonne).toBe(false);
  });
});

/**
 * LE REJEU EN ARRIÈRE-PLAN (#5391, suivi de revue défaut 3) — la moitié aval
 * qui vivait SEULE sur `/notifications/preferences` (`rejoueSiRotation`
 * ci-dessus) : appelée depuis `/chats` (`lib/realtime/liste.ts`), SANS
 * document `main` ni formulaire, elle doit se suffire du contexte durable et
 * ne JAMAIS naviguer — le témoin décisif est l'absence de
 * `HTMLFormElement.prototype.submit`.
 */
describe('rejoueSiRotationEnArrierePlan', () => {
  type FauxCache = { match: (cle: string) => Promise<Response | undefined>; delete: (cle: string) => Promise<boolean> };

  const monteLesCaches = (options: {
    readonly drapeauPose: boolean;
    readonly contexte?: unknown;
  }): { readonly open: jest.Mock<Promise<FauxCache>, [string]>; readonly entrees: Map<string, Response> } => {
    const entrees = new Map<string, Response>();
    if (options.drapeauPose) entrees.set(CLE_DE_ROTATION_PUSH, new Response('1'));
    if (options.contexte !== undefined) entrees.set(CLE_DE_CONTEXTE_PUSH, new Response(JSON.stringify(options.contexte)));
    const cache: FauxCache = {
      match: (cle) => Promise.resolve(entrees.get(cle)),
      delete: (cle) => Promise.resolve(entrees.delete(cle)),
    };
    return { open: jest.fn((_nom: string) => Promise.resolve(cache)), entrees };
  };

  const CONTEXTE_ABONNE = {
    configuration: {
      apiKey: CONFIG_ATTRS['data-firebase-api-key'],
      projectId: CONFIG_ATTRS['data-firebase-project-id'],
      appId: CONFIG_ATTRS['data-firebase-app-id'],
      vapid: CONFIG_ATTRS['data-firebase-vapid'],
      baseInstallations: CONFIG_ATTRS['data-fcm-installations-base'],
      baseRegistrations: CONFIG_ATTRS['data-fcm-registrations-base'],
    },
    abonne: true,
    deviceId: 'appareil-durable',
  };

  const submitEspion = HTMLFormElement.prototype.submit;

  beforeEach(() => {
    HTMLFormElement.prototype.submit = jest.fn();
    (globalThis as { Notification?: unknown }).Notification = { permission: 'granted', requestPermission: jest.fn() };
    (globalThis as { Response?: unknown }).Response = ReponseFactice;
    const subscribe = jest.fn(() =>
      Promise.resolve({ toJSON: () => ({ endpoint: 'https://fcm.test/x', keys: { p256dh: 'p', auth: 'a' } }) }),
    );
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistrations: () =>
          Promise.resolve([{ active: { scriptURL: 'https://x.test/__v3/sw?portees=%2Fchats' }, scope: 'https://x.test/chats', pushManager: { subscribe } }]),
      },
      configurable: true,
    });
    (window as { PushManager?: unknown }).PushManager = function PushManager(): void {};
    globalThis.fetch = jest.fn(async (url: unknown) => {
      const cible = String(url);
      if (cible.includes('installations')) return { ok: true, json: async () => ({ authToken: { token: 'jeton' } }) };
      if (cible.includes('registrations')) return { ok: true, json: async () => ({ token: 'fcm-token-rearme' }) };
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    HTMLFormElement.prototype.submit = submitEspion;
    jest.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'Notification');
    Reflect.deleteProperty(navigator, 'serviceWorker');
    Reflect.deleteProperty(window, 'PushManager');
    Reflect.deleteProperty(globalThis, 'caches');
    Reflect.deleteProperty(globalThis, 'Response');
  });

  it('drapeau posé + contexte abonné : rejoue la danse REST par `fetch`, EFFACE le drapeau, ne NAVIGUE jamais', async () => {
    const caches = monteLesCaches({ drapeauPose: true, contexte: CONTEXTE_ABONNE });
    (globalThis as { caches?: unknown }).caches = caches;

    await rejoueSiRotationEnArrierePlan();
    for (let i = 0; i < 6; i += 1) await attendUneMicrotache();

    const appelDePorte = (globalThis.fetch as jest.Mock).mock.calls.find(([url]: [unknown]) =>
      String(url).includes('/notifications/preferences'),
    );
    expect(appelDePorte).toBeDefined();
    const [, options] = appelDePorte as [string, RequestInit];
    expect(options.method).toBe('POST');
    expect(String(options.body)).toContain('abonnement=fcm-token-rearme');
    expect(String(options.body)).toContain('deviceId=appareil-durable');
    expect(caches.entrees.has(CLE_DE_ROTATION_PUSH)).toBe(false);
    expect(HTMLFormElement.prototype.submit).not.toHaveBeenCalled();
  });

  it('sans drapeau posé, ne fait rien', async () => {
    const caches = monteLesCaches({ drapeauPose: false, contexte: CONTEXTE_ABONNE });
    (globalThis as { caches?: unknown }).caches = caches;

    await rejoueSiRotationEnArrierePlan();
    for (let i = 0; i < 6; i += 1) await attendUneMicrotache();

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('drapeau posé SANS contexte mémorisé (préférences jamais ouvertes) : ne fait rien', async () => {
    const caches = monteLesCaches({ drapeauPose: true });
    (globalThis as { caches?: unknown }).caches = caches;

    await rejoueSiRotationEnArrierePlan();
    for (let i = 0; i < 6; i += 1) await attendUneMicrotache();

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(caches.entrees.has(CLE_DE_ROTATION_PUSH)).toBe(true);
  });

  it('contexte `abonne:false` (lecteur explicitement désabonné) : ignore le drapeau, ne réabonne pas dans son dos', async () => {
    const caches = monteLesCaches({ drapeauPose: true, contexte: { ...CONTEXTE_ABONNE, abonne: false } });
    (globalThis as { caches?: unknown }).caches = caches;

    await rejoueSiRotationEnArrierePlan();
    for (let i = 0; i < 6; i += 1) await attendUneMicrotache();

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('`Notification.permission` non `granted` : n’agit pas et ne redemande jamais la permission', async () => {
    (globalThis as { Notification?: unknown }).Notification = { permission: 'default', requestPermission: jest.fn() };
    const caches = monteLesCaches({ drapeauPose: true, contexte: CONTEXTE_ABONNE });
    (globalThis as { caches?: unknown }).caches = caches;

    await rejoueSiRotationEnArrierePlan();
    for (let i = 0; i < 6; i += 1) await attendUneMicrotache();

    expect((Notification as unknown as { requestPermission: jest.Mock }).requestPermission).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('la passerelle FCM échoue : laisse le drapeau posé pour un prochain essai', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    const caches = monteLesCaches({ drapeauPose: true, contexte: CONTEXTE_ABONNE });
    (globalThis as { caches?: unknown }).caches = caches;

    await rejoueSiRotationEnArrierePlan();
    for (let i = 0; i < 6; i += 1) await attendUneMicrotache();

    expect(caches.entrees.has(CLE_DE_ROTATION_PUSH)).toBe(true);
  });
});
