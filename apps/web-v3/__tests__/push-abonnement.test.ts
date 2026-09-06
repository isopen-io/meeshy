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

import { armeLAbonnementPush, genereUnFid, urlBase64VersOctets } from '@/lib/realtime/push-abonnement';

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
