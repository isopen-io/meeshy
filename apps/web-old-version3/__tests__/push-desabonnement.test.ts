/**
 * LA MOITIÉ « DÉSABONNER » DU MODULE PUSH (restante FLUIDITÉ de #5391) —
 * `lib/realtime/push-abonnement.ts` › `armeLAbonnementPush`, branche
 * `valeur=false`. Avant ce travail, ce geste traversait l'écouteur sans
 * interception : la soumission NATIVE partait, la porte
 * (`app/connecte/prefs-porte.ts`) la traitait en Post/Redirect/Get, et la
 * page RECHARGEAIT ENTIÈREMENT (`__tests__/push-abonnement.test.ts:120-129`
 * l'épinglait). Ce fichier garde le contraire : `valeur=false` est
 * intercepté, peint OPTIMISTE, confirmé ou défait sur le MÊME patron que les
 * treize bascules voisines (`lib/realtime/prefs.ts`).
 */

import { armeLAbonnementPush } from '@/lib/realtime/push-abonnement';
import { PREFS } from '@/lib/contenu/prefs-de-notif';
import { CLE_DE_CONTEXTE_PUSH } from '@/lib/sw/signal';

const CONFIG_ATTRS = {
  'data-firebase-api-key': 'AIza-test',
  'data-firebase-project-id': 'meeshy-test',
  'data-firebase-app-id': '1:123:web:abc',
  'data-firebase-vapid': 'NeX7OBg0HiQMZj_rtRqIBZsHuDaD5NgDgsGV-taXmCQ6dAeO2KaW3iOZn0J7ij98dTX_5FCWgLUN884-Fy2OgBo',
  'data-fcm-installations-base': 'https://fcm-installations.bouchon.test',
  'data-fcm-registrations-base': 'https://fcm-registrations.bouchon.test',
} as const;

const CTX = { passerelle: 'https://passerelle.bouchon.test', jeton: 'jeton-jest' } as const;

/** La rangée déjà ABONNÉE : `aria-checked="true"`, `valeur="false"` — l'inverse de l'état affiché, comme partout dans la v3. */
const monteLaRangeeAbonnee = (): { main: HTMLElement; formulaire: HTMLFormElement; bouton: HTMLButtonElement } => {
  const attributs = Object.entries(CONFIG_ATTRS)
    .map(([nom, valeur]) => `${nom}="${valeur}"`)
    .join(' ');
  document.body.innerHTML =
    `<main data-participation="prefs" ${attributs}>` +
    '<p class="avis" role="status" hidden></p>' +
    '<p class="echec" role="alert" hidden></p>' +
    '<div id="bandeau-session-expiree" hidden></div>' +
    '<form class="bascule-push" method="post">' +
    '<input type="hidden" name="geste" value="push">' +
    '<input type="hidden" name="valeur" value="false">' +
    '<input type="hidden" name="abonnement" value="">' +
    '<input type="hidden" name="deviceId" value="">' +
    '<button type="submit" class="commutateur" role="switch" aria-checked="true">' +
    '<span class="hors-ecran">Abonné</span>' +
    '</button>' +
    '</form>' +
    '</main>';
  return {
    main: document.querySelector('main') as HTMLElement,
    formulaire: document.querySelector('form.bascule-push') as HTMLFormElement,
    bouton: document.querySelector('button[role="switch"]') as HTMLButtonElement,
  };
};

const soumets = (formulaire: HTMLFormElement): Event => {
  const evenement = new Event('submit', { bubbles: true, cancelable: true });
  formulaire.dispatchEvent(evenement);
  return evenement;
};

const attendUneMicrotache = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const attendPlusieursMicrotaches = async (n = 6): Promise<void> => {
  for (let i = 0; i < n; i += 1) await attendUneMicrotache();
};

const purgeLesCookies = (): void => {
  document.cookie.split(';').forEach((c) => {
    const nom = c.split('=')[0]?.trim();
    if (nom) document.cookie = `${nom}=; Max-Age=0; path=/`;
  });
};

const poseLeCookieAppareil = (deviceId: string): void => {
  document.cookie = `meeshy_v3_push_appareil=${deviceId}; path=/`;
};

/** Le MÊME polyfill minimal que `push-abonnement.test.ts` — `Response` n'est pas un global de jsdom (le CODE PRODUIT en construit un réel dans `memoriseLeContextePush`). */
class ReponseFactice {
  private readonly corps: string;
  constructor(corps: string) {
    this.corps = corps;
  }
  json(): Promise<unknown> {
    return Promise.resolve(JSON.parse(this.corps));
  }
}

/** Le résultat d'un `fetch` mocké — `ok`/`status`/`json()`, la forme que `retireLeJetonPush` (`lib/api/push-tokens.ts` › `issue`) inspecte. */
const reponseFetch = (corps: unknown, statut = 200): Response =>
  ({ ok: statut >= 200 && statut < 300, status: statut, json: () => Promise.resolve(corps) }) as unknown as Response;

type FauxCache = { put: (cle: string, reponse: unknown) => Promise<void> };
const monteLesCaches = (): { readonly open: jest.Mock<Promise<FauxCache>, [string]>; readonly ecrits: Map<string, ReponseFactice> } => {
  const ecrits = new Map<string, ReponseFactice>();
  const cache: FauxCache = { put: (cle, reponse) => Promise.resolve(void ecrits.set(cle, reponse as ReponseFactice)) };
  return { open: jest.fn((_nom: string) => Promise.resolve(cache)), ecrits };
};

describe('armeLAbonnementPush — la moitié désabonner', () => {
  const submitEspion = HTMLFormElement.prototype.submit;

  beforeEach(() => {
    HTMLFormElement.prototype.submit = jest.fn();
    poseLeCookieAppareil('appareil-jest');
    (globalThis as { Response?: unknown }).Response = ReponseFactice;
  });

  afterEach(() => {
    HTMLFormElement.prototype.submit = submitEspion;
    jest.restoreAllMocks();
    purgeLesCookies();
    Reflect.deleteProperty(globalThis, 'caches');
    Reflect.deleteProperty(globalThis, 'Response');
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('intercepte valeur=false : preventDefault posé, jamais de soumission native, UNE SEULE requête DELETE', async () => {
    const { main, formulaire } = monteLaRangeeAbonnee();
    globalThis.fetch = jest.fn(async () => reponseFetch({ success: true, data: { deletedCount: 1 } })) as unknown as typeof fetch;
    armeLAbonnementPush(main, CTX);

    const evenement = soumets(formulaire);
    await attendPlusieursMicrotaches();

    expect(evenement.defaultPrevented).toBe(true);
    expect(HTMLFormElement.prototype.submit).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (globalThis.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${CTX.passerelle}/api/v1/users/register-device-token`);
    expect(options.method).toBe('DELETE');
    expect(JSON.parse(String(options.body))).toEqual({ deviceId: 'appareil-jest' });
    expect((options.headers as Record<string, string>)['authorization']).toBe(`Bearer ${CTX.jeton}`);
  });

  it('optimiste : la rangée est peinte désabonnée AVANT que le fetch ne résolve', async () => {
    const { main, formulaire, bouton } = monteLaRangeeAbonnee();
    let resoud: (() => void) | null = null;
    globalThis.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          resoud = () => resolve(reponseFetch({ success: true, data: { deletedCount: 1 } }));
        }),
    ) as unknown as typeof fetch;
    armeLAbonnementPush(main, CTX);

    soumets(formulaire);
    await attendUneMicrotache();

    expect(bouton.getAttribute('aria-checked')).toBe('false');
    expect(bouton.querySelector('.hors-ecran')?.textContent).toBe(PREFS.push.nonAbonne);
    expect(formulaire.querySelector<HTMLInputElement>('input[name="valeur"]')?.value).toBe('true');

    resoud!();
    await attendPlusieursMicrotaches();
  });

  it('confirmation : 200 laisse la rangée désabonnée, révèle .avis, masque .echec', async () => {
    const { main, formulaire, bouton } = monteLaRangeeAbonnee();
    globalThis.fetch = jest.fn(async () => reponseFetch({ success: true, data: { deletedCount: 1 } })) as unknown as typeof fetch;
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations: () => Promise.resolve([]) },
      configurable: true,
    });
    armeLAbonnementPush(main, CTX);

    soumets(formulaire);
    await attendPlusieursMicrotaches();

    expect(bouton.getAttribute('aria-checked')).toBe('false');
    const avis = main.querySelector('.avis') as HTMLElement;
    const echec = main.querySelector('.echec') as HTMLElement;
    expect(avis.hidden).toBe(false);
    expect(avis.textContent).toBe(PREFS.push.regleDesabonne);
    expect(echec.hidden).toBe(true);
  });

  it.each([
    ['500', async () => reponseFetch({ success: false }, 500)],
    ['rejet réseau', async () => Promise.reject(new Error('réseau coupé'))],
  ])('rollback visible sur échec (%s) : rangée re-peinte abonnée, motif servi', async (_libelle, reponse) => {
    const { main, formulaire, bouton } = monteLaRangeeAbonnee();
    globalThis.fetch = jest.fn(reponse as () => Promise<Response>) as unknown as typeof fetch;
    armeLAbonnementPush(main, CTX);

    soumets(formulaire);
    await attendPlusieursMicrotaches();

    expect(bouton.getAttribute('aria-checked')).toBe('true');
    expect(bouton.querySelector('.hors-ecran')?.textContent).toBe(PREFS.push.abonne);
    expect(formulaire.querySelector<HTMLInputElement>('input[name="valeur"]')?.value).toBe('false');
    const echec = main.querySelector('.echec') as HTMLElement;
    const avis = main.querySelector('.avis') as HTMLElement;
    expect(echec.hidden).toBe(false);
    expect(echec.textContent).toBe(PREFS.push.motifEchecDesabonnement);
    expect(avis.hidden).toBe(true);
  });

  it('401 : rollback + bandeau de session expirée révélé, .echec masqué', async () => {
    const { main, formulaire, bouton } = monteLaRangeeAbonnee();
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch;
    armeLAbonnementPush(main, CTX);

    soumets(formulaire);
    await attendPlusieursMicrotaches();

    expect(bouton.getAttribute('aria-checked')).toBe('true');
    const bandeau = main.querySelector('#bandeau-session-expiree') as HTMLElement;
    expect(bandeau.hidden).toBe(false);
    const echec = main.querySelector('.echec') as HTMLElement;
    expect(echec.hidden).toBe(true);
  });

  /**
   * LE MOTIF PÉRIMÉ DOIT PARTIR (défaut relevé en revue) — le témoin
   * ci-dessus part d'une fente `.echec` DÉJÀ masquée : il ne peut pas dire si
   * le code la masque ou s'il n'y touche jamais. Ici elle est servie VISIBLE,
   * ce que la PORTE fait sans JavaScript après un retrait raté
   * (`app/connecte/prefs-porte.ts:323` — `echec: true`, `motif:
   * PREFS.push.motifEchecDesabonnement`) et ce que le module lui-même laisse
   * après un 500. Le lecteur clique de nouveau, la session a expiré : il ne
   * peut pas lire « réessayez » SOUS un bandeau qui lui dit de se
   * reconnecter. C'est la loi que `lib/realtime/prefs.ts` ›
   * `montreLaSessionExpiree` tient depuis #4899 pour les treize bascules —
   * la rangée push la partage désormais par le MÊME site
   * (`lib/realtime/prefs-fentes.ts`), jamais par une seconde règle.
   */
  it('401 sur une page qui montre DÉJÀ un échec : le motif périmé disparaît sous le bandeau', async () => {
    const { main, formulaire } = monteLaRangeeAbonnee();
    const echec = main.querySelector('.echec') as HTMLElement;
    echec.hidden = false;
    echec.textContent = PREFS.push.motifEchecDesabonnement;
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch;
    armeLAbonnementPush(main, CTX);

    soumets(formulaire);
    await attendPlusieursMicrotaches();

    expect((main.querySelector('#bandeau-session-expiree') as HTMLElement).hidden).toBe(false);
    expect(echec.hidden).toBe(true);
    expect((main.querySelector('.avis') as HTMLElement).hidden).toBe(true);
  });

  it('cookie appareil absent : zéro requête, .echec peint avec le motif nommé', async () => {
    purgeLesCookies();
    const { main, formulaire, bouton } = monteLaRangeeAbonnee();
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
    armeLAbonnementPush(main, CTX);

    const evenement = soumets(formulaire);
    await attendPlusieursMicrotaches();

    expect(evenement.defaultPrevented).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(bouton.getAttribute('aria-checked')).toBe('true');
    const echec = main.querySelector('.echec') as HTMLElement;
    expect(echec.hidden).toBe(false);
    expect(echec.textContent).toBe(PREFS.push.motifAucunAbonnementConnu);
  });

  it('le PushManager est désabonné APRÈS la confirmation serveur, jamais avant un échec', async () => {
    const unsubscribe = jest.fn(() => Promise.resolve(true));
    const getSubscription = jest.fn(() => Promise.resolve({ unsubscribe }));
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistrations: () =>
          Promise.resolve([{ active: { scriptURL: 'https://x.test/__v3/sw?portees=%2Fchats' }, scope: 'https://x.test/chats', pushManager: { getSubscription } }]),
      },
      configurable: true,
    });

    // D'ABORD un échec — le PushManager ne doit PAS être touché.
    const { main: mainEchec, formulaire: formulaireEchec } = monteLaRangeeAbonnee();
    globalThis.fetch = jest.fn(async () => reponseFetch({ success: false }, 500)) as unknown as typeof fetch;
    armeLAbonnementPush(mainEchec, CTX);
    soumets(formulaireEchec);
    await attendPlusieursMicrotaches();
    expect(getSubscription).not.toHaveBeenCalled();
    expect(unsubscribe).not.toHaveBeenCalled();

    // PUIS une confirmation — le PushManager est désabonné.
    const { main, formulaire } = monteLaRangeeAbonnee();
    globalThis.fetch = jest.fn(async () => reponseFetch({ success: true, data: { deletedCount: 1 } })) as unknown as typeof fetch;
    armeLAbonnementPush(main, CTX);
    soumets(formulaire);
    await attendPlusieursMicrotaches();

    expect(getSubscription).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('un getSubscription qui rend null ou qui jette ne casse rien (best-effort)', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistrations: () =>
          Promise.resolve([{ active: { scriptURL: 'https://x.test/__v3/sw' }, scope: 'https://x.test/chats', pushManager: { getSubscription: () => Promise.reject(new Error('indisponible')) } }]),
      },
      configurable: true,
    });
    const { main, formulaire } = monteLaRangeeAbonnee();
    globalThis.fetch = jest.fn(async () => reponseFetch({ success: true, data: { deletedCount: 1 } })) as unknown as typeof fetch;
    armeLAbonnementPush(main, CTX);

    soumets(formulaire);
    await attendPlusieursMicrotaches();

    const avis = main.querySelector('.avis') as HTMLElement;
    expect(avis.hidden).toBe(false);
    expect(avis.textContent).toBe(PREFS.push.regleDesabonne);
  });

  it('le contexte durable réécrit `abonne:false` après la confirmation', async () => {
    const { main, formulaire } = monteLaRangeeAbonnee();
    globalThis.fetch = jest.fn(async () => reponseFetch({ success: true, data: { deletedCount: 1 } })) as unknown as typeof fetch;
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations: () => Promise.resolve([]) },
      configurable: true,
    });
    const caches = monteLesCaches();
    (globalThis as { caches?: unknown }).caches = caches;
    armeLAbonnementPush(main, CTX);

    soumets(formulaire);
    await attendPlusieursMicrotaches();

    const ecrit = caches.ecrits.get(CLE_DE_CONTEXTE_PUSH);
    expect(ecrit).toBeDefined();
    const contexte = (await ecrit!.json()) as { abonne: boolean; deviceId: string };
    expect(contexte.abonne).toBe(false);
    expect(contexte.deviceId).toBe('appareil-jest');
  });

  it('une valeur ni true ni false traverse sans interception, zéro requête', () => {
    const { main, formulaire } = monteLaRangeeAbonnee();
    formulaire.querySelector<HTMLInputElement>('input[name="valeur"]')!.value = 'autre-chose';
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
    armeLAbonnementPush(main, CTX);

    const evenement = soumets(formulaire);

    expect(evenement.defaultPrevented).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
