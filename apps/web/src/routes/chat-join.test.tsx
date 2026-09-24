import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult } from '@/lib/api/http';
import type { GuestJoinBody, LinkGuestJoined, LinkInvitation, LinkJoined } from '@/lib/api/link-join';
import { sessionStore, type GuestIdentity } from '@/lib/api/session';
import { loadInviteCatalog } from '@/lib/i18n-invite-catalog';
import { compile, match } from '@/lib/router';
import { typeInto } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ChatJoin, type ChatJoinDeps } from './chat-join';
import { ROUTES } from './route-table';

/**
 * `/chat/:link` — LA JONCTION PAR LIEN (#5561), rendue.
 *
 * Ce que les témoins du port (`link-join.test.ts`) ne peuvent pas prouver :
 * qui AFFICHE ce qu'ils décident, et ce que chaque geste déclenche. L'écran est
 * monté SANS routeur, ses effets de bord injectés (`ChatJoinDeps`) — même
 * dispositif que `MagicLinkValidation` (`validate`, `go`).
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadInviteCatalog('fr');
  ensureHappyDomRegistered({ url: 'http://localhost/chat/mshy_equipe_7f3a' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let mounted: { readonly container: HTMLDivElement; readonly root: Root } | null = null;

afterEach(() => {
  act(() => {
    mounted?.root.unmount();
    sessionStore.getState().clearSession();
  });
  mounted?.container.remove();
  mounted = null;
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
});

const LINK = 'mshy_equipe_7f3a';

const OPEN_TERMS = {
  allowed: true,
  nicknameRequired: true,
  emailRequired: false,
  birthdayRequired: false,
  languages: [] as readonly string[],
  mayWrite: true,
  mayImages: true,
  mayFiles: false,
} as const;

const INVITATION: LinkInvitation = {
  linkId: 'mshy_equipe_7f3a',
  title: 'Équipe déploiement',
  kind: 'group',
  inviter: { name: 'Awa Diallo', username: 'awa', avatar: null },
  message: 'Viens suivre la mise en production avec nous.',
  group: { description: 'Le fil de l’équipe qui livre Meeshy.', createdAt: '2025-09-02T09:00:00.000Z', avatar: null, banner: null },
  stats: {
    people: 248,
    languages: [
      { code: 'fr', count: 3 },
      { code: 'es', count: 1 },
    ],
  },
  limits: { expiresAt: '2026-09-30T13:00:00.000Z', maxUses: 50, currentUses: 12 },
  readsHistory: false,
  guest: OPEN_TERMS,
};

const NOW = new Date('2026-09-24T12:00:00.000Z');
const ORIGIN = 'https://meeshy.me';

const JOINED: ApiResult<LinkJoined> = { ok: true, data: { conversationId: 'c-deploiement', alreadyMember: false } };

const never = <T,>(): Promise<T> => new Promise<T>(() => undefined);

const GUEST_JOINED: ApiResult<LinkGuestJoined> = {
  ok: true,
  data: {
    conversationId: 'c-deploiement',
    participantId: 'p-invitee',
    sessionToken: 'anon_du_temoin',
    readsHistory: false,
    mayWrite: true,
  },
};

type Recorded = {
  readonly copies: string[];
  readonly shares: Array<{ readonly title: string; readonly text: string; readonly url: string }>;
  readonly loads: string[];
  readonly joins: Array<readonly [string, string | null]>;
  readonly guestJoins: Array<readonly [string, GuestJoinBody]>;
  readonly adopted: Array<readonly [string, GuestIdentity]>;
  readonly order: string[];
};

function depsWith(overrides: Partial<ChatJoinDeps> = {}): { readonly deps: ChatJoinDeps; readonly recorded: Recorded } {
  const recorded: Recorded = { copies: [], shares: [], loads: [], joins: [], guestJoins: [], adopted: [], order: [] };
  const deps: ChatJoinDeps = {
    load: async (link) => {
      recorded.loads.push(link);
      return { ok: true, data: INVITATION };
    },
    join: async (link, language) => {
      recorded.joins.push([link, language]);
      return JOINED;
    },
    joinGuest: async (link, body) => {
      recorded.guestJoins.push([link, body]);
      return GUEST_JOINED;
    },
    adoptGuest: (sessionToken, guest) => {
      recorded.adopted.push([sessionToken, guest]);
      recorded.order.push('adopt');
    },
    go: (url, replace) => {
      recorded.order.push(`go ${url} ${replace ? 'replace' : 'push'}`);
    },
    joined: () => {
      recorded.order.push('joined');
    },
    expireSession: () => {
      recorded.order.push('expire');
      sessionStore.getState().clearSession();
    },
    copyText: async (url) => {
      recorded.copies.push(url);
      return 'copied';
    },
    shareUrl: async (data) => {
      recorded.shares.push(data);
      return 'partage';
    },
    origin: () => ORIGIN,
    now: () => NOW,
    ...overrides,
  };
  return { deps, recorded };
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function mount(deps: ChatJoinDeps, link = LINK): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(<ChatJoin link={link} deps={deps} />);
  });
  await settle();
  return container;
}

const signIn = () =>
  act(() => {
    sessionStore.getState().establish({
      user: { id: '0'.repeat(24), username: 'ada', displayName: 'Ada', avatar: '', systemLanguage: 'en' },
      token: 'jeton-du-temoin',
      sessionToken: 'session-du-temoin',
      expiresIn: 3600,
    });
  });

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/gu, ' ');
const joinButton = (el: HTMLElement) =>
  [...el.querySelectorAll('button')].find((button) => /Rejoindre|Entrée dans la conversation/u.test(text(button))) ?? null;
const anchorTo = (el: HTMLElement, pathname: string) =>
  [...el.querySelectorAll('a')].find((a) => new URL(a.getAttribute('href') ?? '', 'http://localhost').pathname === pathname) ?? null;
const nextOf = (anchor: HTMLAnchorElement | null) => new URL(anchor?.getAttribute('href') ?? '', 'http://localhost').searchParams.get('next');

async function click(button: HTMLElement | null) {
  await act(async () => {
    button?.click();
  });
  await settle();
}

describe('ROUTES — /chat/$link', () => {
  test('s’apparie à /chat/<lien>, en extrait `link`, et à rien d’autre', () => {
    const compiled = compile(ROUTES.chatJoin.pattern);
    expect(match(compiled, '/chat/mshy_equipe_7f3a')).toEqual({ link: 'mshy_equipe_7f3a' });
    expect(match(compiled, '/chat/')).toBeNull();
    expect(match(compiled, '/chat')).toBeNull();
    expect(match(compiled, '/c/mshy_equipe_7f3a')).toBeNull();
    expect(typeof ROUTES.chatJoin.screen).toBe('function');
  });
});

const withTerms = (terms: Partial<LinkInvitation['guest']>) => ({
  load: async (): Promise<ApiResult<LinkInvitation>> => ({
    ok: true,
    data: { ...INVITATION, guest: { ...OPEN_TERMS, ...terms } },
  }),
});

const withInvitation = (overrides: Partial<LinkInvitation>) => ({
  load: async (): Promise<ApiResult<LinkInvitation>> => ({ ok: true, data: { ...INVITATION, ...overrides } }),
});

describe('la page d’accueil d’invitation (#7796) — dans l’ordre de la maquette', () => {
  test('chargement : l’écran s’annonce avant que l’invitation n’arrive', async () => {
    const { deps } = depsWith({ load: () => never() });
    const el = await mount(deps);
    expect(text(el)).toContain('Ouverture de l’invitation…');
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  test('a. qui invite d’abord, puis son MESSAGE dans une bulle', async () => {
    const { deps, recorded } = depsWith();
    const el = await mount(deps);
    expect(recorded.loads).toEqual([LINK]);
    const inviter = el.querySelector('[data-invite-inviter]');
    expect(text(inviter)).toContain('Awa Diallo t’invite');
    expect(text(inviter)).toContain('@awa');
    expect(text(el.querySelector('[data-invite-message]'))).toBe('Viens suivre la mise en production avec nous.');
    const order = [...el.querySelectorAll('[data-invite-inviter], [data-invite-group], [data-invite-figures], [data-invite-rights], [data-invite-join]')].map(
      (node) => [...node.attributes].find((attribute) => attribute.name.startsWith('data-invite-'))?.name,
    );
    expect(order).toEqual(['data-invite-inviter', 'data-invite-group', 'data-invite-figures', 'data-invite-rights', 'data-invite-join']);
  });

  test('un message d’invitation vide n’ouvre aucune bulle', async () => {
    const { deps } = depsWith(withInvitation({ message: null }));
    const el = await mount(deps);
    expect(el.querySelector('[data-invite-message]')).toBeNull();
  });

  test('b. le groupe : nom, type et date de création, description, puis son lien — jamais `/l/`', async () => {
    const { deps } = depsWith();
    const el = await mount(deps);
    expect(el.querySelector('h1')?.textContent).toBe('Équipe déploiement');
    expect(text(el.querySelector('[data-invite-meta]'))).toBe('Groupe · créé le 2 sept. 2025');
    expect(text(el.querySelector('[data-invite-description]'))).toBe('Le fil de l’équipe qui livre Meeshy.');
    const url = text(el.querySelector('[data-invite-url]'));
    expect(url).toContain('meeshy.me/chat/mshy_equipe_7f3a');
    expect(url).not.toContain('/l/');
  });

  test('sans bannière ni logo : un dégradé et les initiales ; avec : leurs images', async () => {
    const plain = await mount(depsWith().deps);
    expect(plain.querySelector('[data-invite-banner]')?.getAttribute('data-invite-banner')).toBe('gradient');
    expect(plain.querySelector('[data-invite-group] img')).toBeNull();
    act(() => mounted?.root.unmount());
    const rich = await mount(depsWith(withInvitation({ group: { ...INVITATION.group, avatar: 'g/logo.png', banner: 'g/banniere.jpg' } })).deps);
    expect(rich.querySelector('[data-invite-banner]')?.getAttribute('data-invite-banner')).toBe('image');
    expect(rich.querySelector('[data-invite-group] img[alt="Logo de Équipe déploiement"]')).not.toBeNull();
  });

  test('le lien affiché est celui que sert la passerelle, pas l’adresse tapée', async () => {
    const { deps } = depsWith(withInvitation({ linkId: 'mshy_canonique' }));
    const el = await mount(deps, 'mshy_alias-du-nom');
    expect(text(el.querySelector('[data-invite-url]'))).toContain('meeshy.me/chat/mshy_canonique');
  });

  test('c. les chiffres sans identité : personnes, langues, et la légende en toutes lettres', async () => {
    const { deps } = depsWith();
    const el = await mount(deps);
    expect(text(el.querySelector('[data-invite-figure="people"]'))).toContain('personnes');
    expect(text(el.querySelector('[data-invite-figure="people"] strong'))).toBe('248');
    expect(text(el.querySelector('[data-invite-figure="languages"]'))).toContain('langues parlées');
    expect(text(el.querySelector('[data-language-share="fr"]'))).toBe('Français 75 %');
    expect(text(el.querySelector('[data-language-share="es"]'))).toBe('Español 25 %');
  });

  test('sans chiffres servis, la section ne s’affiche pas', async () => {
    const { deps } = depsWith(withInvitation({ stats: { people: null, languages: [] } }));
    const el = await mount(deps);
    expect(el.querySelector('[data-invite-figures]')).toBeNull();
  });

  test('d. « En anonyme, tu pourras » : quatre droits cochés ou barrés', async () => {
    const { deps } = depsWith();
    const el = await mount(deps);
    const rows = [...el.querySelectorAll('[data-invite-right]')].map((row) => [row.getAttribute('data-invite-right'), row.getAttribute('data-granted')]);
    expect(rows).toEqual([
      ['messages', 'true'],
      ['images', 'true'],
      ['files', 'false'],
      ['history', 'false'],
    ]);
    expect(text(el.querySelector('[data-invite-right="files"]'))).toContain('non autorisé');
  });

  test('d. ce qu’on demandera, les langues acceptées, la validité et les places restantes', async () => {
    const { deps } = depsWith();
    const el = await mount(deps);
    const terms = text(el.querySelector('[data-invite-terms]'));
    expect(terms).toContain('On te demandera : un prénom');
    expect(terms).toContain('Langues acceptées : toutes');
    expect(terms).toContain('Lien valable encore 7 jours · 38 places restantes');
  });

  test('d. sans expiration ni maximum : sans limite de durée, places illimitées ; langues nommées dans leur écriture', async () => {
    const { deps } = depsWith(
      withInvitation({ limits: { expiresAt: null, maxUses: null, currentUses: 3 }, guest: { ...OPEN_TERMS, languages: ['fr', 'ar'], emailRequired: true } }),
    );
    const el = await mount(deps);
    const terms = text(el.querySelector('[data-invite-terms]'));
    expect(terms).toContain('sans limite de durée · places illimitées');
    /* `Intl.ListFormat` ISOLE chaque élément (U+2068…U+2069) : l'arabe ne retourne pas la phrase française autour de lui. */
    expect(terms.replace(/[\u2068\u2069]/gu, '')).toContain('Langues acceptées : Français et العربية');
    expect(terms).toContain('un prénom et une adresse e-mail');
  });

  test('d. un lien qui exige un compte ne décrit pas une porte anonyme fermée', async () => {
    const { deps } = depsWith(withTerms({ allowed: false }));
    const el = await mount(deps);
    expect(el.querySelector('[data-invite-rights]')).toBeNull();
  });
});

describe('Copier et Repartager (#7796 § 3)', () => {
  test('« Copier » copie l’adresse ENTIÈRE, devient « Copié » et le dit', async () => {
    const { deps, recorded } = depsWith();
    const el = await mount(deps);
    await click(el.querySelector<HTMLButtonElement>('[data-invite-copy]'));
    expect(recorded.copies).toEqual(['https://meeshy.me/chat/mshy_equipe_7f3a']);
    expect(text(el.querySelector('[data-invite-copy]'))).toBe('Copié');
    expect(text(el.querySelector('[data-invite-announce]'))).toBe('Lien copié.');
  });

  test('un presse-papiers refusé se DIT, en erreur', async () => {
    const { deps } = depsWith({ copyText: async () => 'failed' });
    const el = await mount(deps);
    await click(el.querySelector<HTMLButtonElement>('[data-invite-copy]'));
    expect(text(el.querySelector('[data-invite-copy]'))).toBe('Copier');
    expect(el.querySelector('[data-invite-announce]')?.getAttribute('data-announce-tone')).toBe('error');
  });

  test('« Repartager » ouvre la feuille de partage avec le nom du groupe et l’adresse', async () => {
    const { deps, recorded } = depsWith();
    const el = await mount(deps);
    await click(el.querySelector<HTMLButtonElement>('[data-invite-reshare]'));
    expect(recorded.shares).toEqual([
      { title: 'Équipe déploiement', text: 'Rejoins Équipe déploiement sur Meeshy — chacun y écrit dans sa langue.', url: 'https://meeshy.me/chat/mshy_equipe_7f3a' },
    ]);
  });

  test('sans feuille de partage, la copie de repli se dit ; sans rien du tout, l’absence aussi', async () => {
    const copied = await mount(depsWith({ shareUrl: async () => 'copie' }).deps);
    await click(copied.querySelector<HTMLButtonElement>('[data-invite-reshare]'));
    expect(text(copied.querySelector('[data-invite-announce]'))).toBe('Lien copié.');
    act(() => mounted?.root.unmount());
    const none = await mount(depsWith({ shareUrl: async () => 'indisponible' }).deps);
    await click(none.querySelector<HTMLButtonElement>('[data-invite-reshare]'));
    expect(text(none.querySelector('[data-invite-announce]'))).toBe('Le partage n’est pas disponible ici.');
  });
});

describe('un visiteur CONNECTÉ rejoint', () => {
  test('« Rejoindre », la langue du compte part, puis /c/:id, PUIS le cache des conversations', async () => {
    signIn();
    const { deps, recorded } = depsWith();
    const el = await mount(deps);
    await click(joinButton(el));
    expect(recorded.joins).toEqual([[LINK, 'en']]);
    expect(recorded.order).toEqual(['go /c/c-deploiement replace', 'joined']);
  });

  test('succès : l’écran le dit pendant que le fil arrive', async () => {
    signIn();
    const { deps } = depsWith();
    const el = await mount(deps);
    await click(joinButton(el));
    expect(text(el.querySelector('[role="status"]'))).toContain('Tu as rejoint');
  });

  test('un membre EXISTANT est redirigé vers son fil', async () => {
    signIn();
    const { deps, recorded } = depsWith({ join: async () => ({ ok: true, data: { conversationId: 'c-deja', alreadyMember: true } }) });
    const el = await mount(deps);
    await click(joinButton(el));
    expect(recorded.order).toEqual(['go /c/c-deja replace', 'joined']);
  });

  test('jonction en cours : le bouton est désactivé, et un second geste ne rejoint pas deux fois', async () => {
    signIn();
    const joins: string[] = [];
    const { deps } = depsWith({
      join: (link) => {
        joins.push(link);
        return never();
      },
    });
    const el = await mount(deps);
    await click(joinButton(el));
    const busy = joinButton(el);
    expect(busy?.disabled).toBe(true);
    expect(busy?.getAttribute('aria-busy')).toBe('true');
    expect(text(busy)).toContain('Entrée dans la conversation…');
    await click(busy);
    expect(joins).toEqual([LINK]);
  });

  test('aucune sortie vers la connexion n’est proposée à un compte connecté', async () => {
    signIn();
    const { deps } = depsWith();
    const el = await mount(deps);
    expect(anchorTo(el, '/login')).toBeNull();
    expect(anchorTo(el, '/signup')).toBeNull();
  });
});

describe('un visiteur SANS session', () => {
  test('les deux sorties le ramènent ici par `next`, et aucune jonction de MEMBRE ne part', async () => {
    const { deps, recorded } = depsWith();
    const el = await mount(deps);
    /* « Rejoindre » est l'action d'un COMPTE : elle n'est pas offerte ici. La
       porte anonyme, elle, l'est — et c'est « Continuer en anonyme ». */
    expect(joinButton(el)).toBeNull();
    const login = anchorTo(el, '/login');
    const signup = anchorTo(el, '/signup');
    expect(text(login)).toBe('Se connecter');
    expect(text(signup)).toBe('Créer un compte');
    expect(nextOf(login)).toBe('/chat/mshy_equipe_7f3a');
    expect(nextOf(signup)).toBe('/chat/mshy_equipe_7f3a');
    expect(recorded.joins).toEqual([]);
  });

  test('un lien aux caractères encodés revient à la MÊME adresse', async () => {
    const { deps } = depsWith();
    const el = await mount(deps, 'mshy_équipe 7f3a');
    expect(nextOf(anchorTo(el, '/login'))).toBe('/chat/mshy_%C3%A9quipe%207f3a');
  });

  test('les deux sorties sont des cibles de 44 px au moins', async () => {
    const { deps } = depsWith();
    const el = await mount(deps);
    for (const anchor of [anchorTo(el, '/login'), anchorTo(el, '/signup')]) {
      expect(Number.parseInt(anchor?.style.minHeight ?? '0', 10)).toBeGreaterThanOrEqual(44);
    }
  });
});

/* ========================================================================= *
 *  REJOINDRE SANS COMPTE (#5561)
 * ========================================================================= */

/* La saisie vient du dépôt (`test-support/act-mount.ts § typeInto`), jamais
   d'une troisième écriture de la même règle : setter natif cherché sur la
   chaîne de prototypes DE L'ÉLÉMENT, et `act` SYNCHRONE. */

const guestForm = (el: HTMLElement) => el.querySelector<HTMLFormElement>('[data-guest-form]');
const nicknameField = (el: HTMLElement) => el.querySelector<HTMLInputElement>('[data-guest-nickname]');
const languageField = (el: HTMLElement) => el.querySelector<HTMLSelectElement>('[data-guest-language]');
const guestSubmit = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('[data-guest-submit]');


/**
 * SOUMET LE FORMULAIRE, JAMAIS EN CLIQUANT SON BOUTON — même méthode que
 * `test-support/act-mount.ts § submit`.
 *
 * Sous happy-dom, un clic sur un `<button type="submit">` ne déclenche PAS
 * l'événement `submit` du formulaire : le geste part, et rien ne se passe. Un
 * témoin qui cliquerait le bouton verdirait sur « rien n'est envoyé » en
 * croyant mesurer l'envoi.
 */
async function submitGuest(el: HTMLElement) {
  const form = guestForm(el);
  if (form === null) throw new Error('formulaire d’invité absent');
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await settle();
}

async function fillAndSubmit(el: HTMLElement, nickname: string) {
  typeInto(nicknameField(el), nickname);
  await settle();
  await submitGuest(el);
}

describe('un visiteur SANS session REJOINT EN INVITÉ', () => {
  test('le formulaire demande le pseudo et la langue, et RIEN d’autre tant que le lien ne l’exige pas', async () => {
    const { deps } = depsWith();
    const el = await mount(deps);
    expect(guestForm(el)).not.toBeNull();
    expect(nicknameField(el)).not.toBeNull();
    expect(languageField(el)).not.toBeNull();
    expect(el.querySelector('[data-guest-email]')).toBeNull();
    expect(el.querySelector('[data-guest-birthday]')).toBeNull();
    expect(text(guestSubmit(el))).toBe('Continuer en anonyme');
  });

  test('un lien qui exige e-mail et date de naissance les demande, et eux seuls', async () => {
    const { deps } = depsWith(withTerms({ emailRequired: true, birthdayRequired: true }));
    const el = await mount(deps);
    expect(el.querySelector('[data-guest-email]')).not.toBeNull();
    expect(el.querySelector('[data-guest-birthday]')).not.toBeNull();
  });

  /**
   * LA LANGUE EST SEMÉE AVEC L'INVITATION — un `<select>` qui s'ouvrirait vide
   * ferait refuser la saisie avant qu'aucune requête ne parte, et l'écran
   * dirait « choisissez une langue » sur un champ que personne n'a touché.
   */
  test('le formulaire s’ouvre avec une langue DÉJÀ choisie', async () => {
    const { deps } = depsWith();
    const el = await mount(deps);
    expect(languageField(el)?.value).toBe('fr');
  });

  test('le corps part, la session d’invité est ADOPTÉE, puis le fil s’ouvre', async () => {
    const { deps, recorded } = depsWith();
    const el = await mount(deps);
    /* Ce que le formulaire PORTE au moment du geste — lu AVANT de soumettre :
       une jonction réussie démonte le formulaire, et lire ses champs ensuite
       rendrait `undefined` en laissant croire à un champ vide. */
    typeInto(nicknameField(el), 'Awa');
    await settle();
    expect(nicknameField(el)?.value).toBe('Awa');
    expect(languageField(el)?.value).toBe('fr');

    await submitGuest(el);

    expect(recorded.guestJoins).toEqual([[LINK, { language: 'fr', nickname: 'Awa' }]]);
    expect(recorded.adopted).toEqual([
      [
        'anon_du_temoin',
        { participantId: 'p-invitee', nickname: 'Awa', conversationId: 'c-deploiement', link: LINK, mayWrite: true },
      ],
    ]);
    /* L'ADOPTION PRÉCÈDE LA NAVIGATION : le fil doit trouver la créance déjà
       posée quand il monte, sinon sa première requête part nue. */
    expect(recorded.order).toEqual(['adopt', 'go /c/c-deploiement replace', 'joined']);
  });

  test('aucune jonction de MEMBRE ne part sur ce chemin', async () => {
    const { deps, recorded } = depsWith();
    const el = await mount(deps);
    await fillAndSubmit(el, 'Awa');
    expect(recorded.joins).toEqual([]);
  });

  test('un pseudo exigé mais vide : RIEN ne part, et le refus se pose sous son champ', async () => {
    const { deps, recorded } = depsWith();
    const el = await mount(deps);
    await submitGuest(el);

    expect(recorded.guestJoins).toEqual([]);
    expect(guestForm(el)).not.toBeNull();
    expect(nicknameField(el)?.getAttribute('aria-invalid')).toBe('true');
    const described = nicknameField(el)?.getAttribute('aria-describedby') ?? '';
    expect(text(el.querySelector(`#${described.split(' ')[0]}`))).toContain('Choisis un prénom');
  });

  test('pseudo PRIS : le formulaire est GARDÉ, la suggestion pré-remplie, et on peut réessayer', async () => {
    const { deps, recorded } = depsWith({
      joinGuest: async () => ({ ok: false, status: 409, error: 'pris', code: 'USERNAME_TAKEN_IN_CONVERSATION', suggestedNickname: 'awa2' }),
    });
    const el = await mount(deps);
    await fillAndSubmit(el, 'awa');

    expect(guestForm(el)).not.toBeNull();
    expect(nicknameField(el)?.value).toBe('awa2');
    expect(text(el.querySelector('[role="alert"]'))).toContain('awa2');
    expect(guestSubmit(el)?.disabled).toBe(false);
    expect(recorded.order).toEqual([]);
  });

  test('un refus du LIEN retire le formulaire et garde les deux sorties', async () => {
    const { deps } = depsWith({ joinGuest: async () => ({ ok: false, status: 410, error: 'mort', code: 'LINK_EXPIRED' }) });
    const el = await mount(deps);
    await fillAndSubmit(el, 'Awa');

    expect(guestForm(el)).toBeNull();
    expect(text(el.querySelector('[role="alert"]'))).toContain('expiré');
    expect(nextOf(anchorTo(el, '/login'))).toBe('/chat/mshy_equipe_7f3a');
    expect(anchorTo(el, '/signup')).not.toBeNull();
  });

  test('un lien qui EXIGE un compte n’offre aucun formulaire, et le DIT', async () => {
    const { deps } = depsWith(withTerms({ allowed: false }));
    const el = await mount(deps);
    expect(guestForm(el)).toBeNull();
    expect(text(el)).toContain('demande un compte Meeshy');
    expect(anchorTo(el, '/login')).not.toBeNull();
  });

  test('un compte CONNECTÉ ne voit jamais le formulaire d’invité', async () => {
    signIn();
    const { deps } = depsWith();
    const el = await mount(deps);
    expect(guestForm(el)).toBeNull();
    expect(joinButton(el)).not.toBeNull();
  });

  test('la matrice des choix : visiteur sur un lien ouvert — le formulaire, puis se connecter ou créer un compte', async () => {
    const { deps } = depsWith();
    const el = await mount(deps);
    const join = el.querySelector('[data-invite-join]');
    expect(join?.querySelector('[data-guest-form]')).not.toBeNull();
    expect(join?.querySelector('[data-invite-sign-in]')).not.toBeNull();
    expect(join?.querySelector('[data-invite-sign-up]')).not.toBeNull();
    expect(join?.querySelector('[data-invite-join-account]')).toBeNull();
    expect(text(join)).toContain('ou avec ton compte');
  });

  test('la matrice des choix : compte connecté — « Rejoindre avec mon compte », et aucune porte anonyme', async () => {
    signIn();
    const { deps } = depsWith();
    const el = await mount(deps);
    const join = el.querySelector('[data-invite-join]');
    expect(text(join?.querySelector('[data-invite-join-account]') ?? null)).toBe('Rejoindre avec mon compte');
    expect(join?.querySelector('[data-guest-form]')).toBeNull();
    expect(join?.querySelector('[data-invite-sign-in]')).toBeNull();
  });

  test('la matrice des choix : visiteur, compte requis — se connecter devient l’action primaire', async () => {
    const { deps } = depsWith(withTerms({ allowed: false }));
    const el = await mount(deps);
    const join = el.querySelector('[data-invite-join]');
    expect(join?.querySelector('[data-guest-form]')).toBeNull();
    expect(join?.querySelector('[data-invite-account-required]')).not.toBeNull();
    expect(join?.querySelector<HTMLElement>('[data-invite-sign-in]')?.style.background).toContain('linear-gradient');
  });
});

const REFUSALS: ReadonlyArray<readonly [number, string | undefined, string]> = [
  [404, undefined, 'introuvable'],
  [410, 'LINK_DEACTIVATED', 'désactivé'],
  [410, 'LINK_INACTIVE', 'désactivé'],
  [410, 'LINK_EXPIRED', 'expiré'],
  [410, 'CONVERSATION_CLOSED', 'terminée'],
  [409, 'LINK_EXHAUSTED', 'limite de participants'],
  [410, 'LINK_MAX_USES', 'limite de participants'],
  [403, 'LANGUAGE_NOT_ALLOWED', 'ta langue'],
  [403, 'BANNED', 'ne peux plus rejoindre'],
  [429, undefined, 'Trop de tentatives'],
  [0, undefined, 'hors ligne'],
];

const failure = (status: number, code: string | undefined): ApiResult<never> =>
  code === undefined ? { ok: false, status, error: 'refus' } : { ok: false, status, error: 'refus', code };

describe('chaque refus est un bandeau qui dit la cause et garde une sortie', () => {
  for (const [status, code, cause] of REFUSALS) {
    test(`à la lecture — ${status} ${code ?? '(sans code)'}`, async () => {
      const { deps } = depsWith({ load: async () => failure(status, code) });
      const el = await mount(deps);
      const alert = el.querySelector('[role="alert"]');
      expect(text(alert)).toContain(cause);
      const home = [...(alert?.querySelectorAll('a') ?? [])].find((a) => a.getAttribute('href') === '/');
      expect(text(home ?? null)).toBe('Revenir à l’accueil');
      expect(Number.parseInt(home?.style.minHeight ?? '0', 10)).toBeGreaterThanOrEqual(44);
      expect(el.querySelector('h1')).toBeNull();
    });
  }

  test('à la jonction — un refus DÉFINITIF garde l’invitation et retire « Rejoindre »', async () => {
    signIn();
    const { deps, recorded } = depsWith({ join: async () => failure(403, 'LANGUAGE_NOT_ALLOWED') });
    const el = await mount(deps);
    await click(joinButton(el));
    expect(text(el.querySelector('[role="alert"]'))).toContain('ta langue');
    expect(el.querySelector('h1')?.textContent).toBe('Équipe déploiement');
    expect(joinButton(el)).toBeNull();
    expect(recorded.order).toEqual([]);
  });

  test('à la jonction — un refus PASSAGER (429) laisse rejoindre à nouveau', async () => {
    signIn();
    const { deps } = depsWith({ join: async () => failure(429, undefined) });
    const el = await mount(deps);
    await click(joinButton(el));
    expect(text(el.querySelector('[role="alert"]'))).toContain('Trop de tentatives');
    expect(joinButton(el)?.disabled).toBe(false);
  });

  test('à la jonction — servie EN INVITÉ : la session est close, et l’on revient par la connexion', async () => {
    signIn();
    const { deps, recorded } = depsWith({ join: async () => failure(0, 'JOINED_AS_GUEST') });
    const el = await mount(deps);
    await click(joinButton(el));
    expect(recorded.order).toEqual(['expire']);
    expect(text(el.querySelector('[role="alert"]'))).toContain('session a expiré');
    expect(nextOf(anchorTo(el, '/login'))).toBe('/chat/mshy_equipe_7f3a');
    expect(joinButton(el)).toBeNull();
  });
});

describe('hors ligne', () => {
  test('sans réseau, aucune lecture ne part ; l’invitation arrive au retour du réseau', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const { deps, recorded } = depsWith();
    const el = await mount(deps);
    expect(recorded.loads).toEqual([]);
    expect(text(el.querySelector('[role="alert"]'))).toContain('hors ligne');

    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await settle();
    expect(recorded.loads).toEqual([LINK]);
    expect(el.querySelector('h1')?.textContent).toBe('Équipe déploiement');
  });

  test('une invitation déjà lue reste affichée, et « Rejoindre » attend le réseau', async () => {
    signIn();
    const { deps } = depsWith();
    const el = await mount(deps);
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(el.querySelector('h1')?.textContent).toBe('Équipe déploiement');
    expect(joinButton(el)?.disabled).toBe(true);
    expect(text(el)).toContain('Hors ligne');
  });
});
