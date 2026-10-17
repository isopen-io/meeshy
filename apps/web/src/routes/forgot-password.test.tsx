import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import ForgotPasswordScreen, { type ForgotPasswordDeps } from '@/routes/forgot-password';
import { loadAccountRecoveryCatalog } from '@/lib/i18n-account-recovery-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { authColumnIn, strayFromAuthColumn } from '@/test-support/auth-column';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { controlledBy, perceivableText } from '@/test-support/perceivable-text';

/**
 * « TU PROFITES POUR METTRE À JOUR /forgot-password POUR QUE ÇA RESSEMBLE À
 * /login » (#6583, directive porteur 2026-09-14).
 *
 * L'écran portait une BARRE DE TITRE (un « X » et « Mot de passe oublié »)
 * héritée de `MeeshyForgotPasswordView.swift` ; `/login` n'en a pas. Il prend
 * la forme de son voisin : le halo, la colonne centrée, un glyphe, une phrase,
 * un champ, un bouton — et le retour vers la connexion en pied, comme les
 * deux portes de `/login`.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const NOTHING_RECEIVED_TEXT = 'Regardez vos indésirables (spam) : le message peut y être tombé.';

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/forgot-password' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all(
    (['fr', 'en', 'de'] as const).flatMap((language) => [loadInterfaceCatalog(language), loadAccountRecoveryCatalog(language)]),
  );
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  document.documentElement.lang = 'fr';
});

const EMAIL = 'ada@meeshy.example';

/** Le transport N'EST PAS le singleton : la demande est INJECTÉE, comme
 * `MagicLinkPanel` le fait depuis #6404 — c'est la seule façon d'atteindre
 * l'écran d'envoi sans parler à une passerelle. */
function mount(deps?: ForgotPasswordDeps): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<ForgotPasswordScreen {...(deps === undefined ? {} : { deps })} />);
  });
  return container;
}

/** Une demande qui aboutit, et la mémoire des adresses envoyées. */
function acceptedRequest() {
  const calls: string[] = [];
  const deps: ForgotPasswordDeps = {
    request: async (email: string) => {
      calls.push(email);
      return { ok: true as const, status: 200, data: { message: 'ok' } };
    },
  };
  return { calls, deps };
}

async function sendFrom(el: HTMLDivElement) {
  const champ = el.querySelector('#forgot-email') as HTMLInputElement;
  act(() => {
    champ.value = EMAIL;
    champ.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    (el.querySelector('form') as HTMLFormElement).requestSubmit();
  });
}

const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/gu, ' ');

describe('/forgot-password prend la forme de /login', () => {
  test('aucune barre de titre — ni `<h1>`, ni « Mot de passe oublié » en en-tête', () => {
    const el = mount();
    expect(el.querySelector('h1')).toBeNull();
    expect(el.querySelector('h2')).toBeNull();
  });

  test('un glyphe, la phrase, le champ et le bouton', () => {
    const el = mount();
    expect(el.querySelector('svg')).not.toBeNull();
    expect(text(el)).toContain('Recevez par e-mail un lien pour choisir un nouveau mot de passe.');
    expect(el.querySelector('#forgot-email')).not.toBeNull();
    expect(el.querySelector('button[type="submit"]')?.textContent).toBe('Recevoir le lien');
  });

  test('champ vide ou adresse incomplète : le bouton est désactivé et rien ne part (#10885)', async () => {
    const { calls, deps } = acceptedRequest();
    const el = mount(deps);
    const bouton = el.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    await act(async () => {
      (el.querySelector('form') as HTMLFormElement).requestSubmit();
    });
    const champ = el.querySelector('#forgot-email') as HTMLInputElement;
    act(() => {
      champ.value = 'ada@meeshy';
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(bouton.disabled).toBe(true);
    await act(async () => {
      (el.querySelector('form') as HTMLFormElement).requestSubmit();
    });
    expect(calls).toEqual([]);
    act(() => {
      champ.value = EMAIL;
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(bouton.disabled).toBe(false);
  });

  test('le retour vers la connexion est une ANCRE, dès la première seconde', () => {
    const el = mount();
    expect([...el.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/login')).toBe(true);
  });

  test('le pied de marque, comme sur /login : « by services.ceo », un lien vers la plateforme (#10096)', () => {
    const el = mount();
    expect(text(el)).toContain('by services.ceo');
    const credit = el.querySelector('a[href="https://services.ceo"]');
    expect(credit?.getAttribute('target')).toBe('_blank');
    expect(credit?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(credit?.textContent).toBe('by services.ceo — ouvre la plateforme services.ceo dans un nouvel onglet');
  });

  /** LA COLONNE EST CELLE DE LA CONNEXION, PARTAGÉE (#6643) — l'écran la
   * recopiait ; la largeur se mesure en navigateur (`check-access-column.mjs`). */
  test('tout tient dans LA colonne d’accès partagée', () => {
    const el = mount();
    expect(authColumnIn(el)?.querySelector('#forgot-email')).not.toBeNull();
    expect(strayFromAuthColumn(el)).toEqual([]);
  });
});

/**
 * « MOT DE PASSE OUBLIÉ » SERT AUSSI À CRÉER UN PREMIER MOT DE PASSE (#6643).
 *
 * Directive porteur 2026-09-15 : « la page de récupération de mot de passe doit
 * permettre de setter le mot de passe même si on a jamais eu de mot de passe ».
 * Le lien part aussi vers un compte qui n'en a jamais eu (#6642, passerelle) ;
 * l'écran le dit sans détail technique — une phrase qui parle de CHOISIR, et le
 * cas du premier mot de passe derrière un (i) qui NOMME la question (D-71).
 */
describe('« Mot de passe oublié » sert aussi à créer un premier mot de passe (#6643)', () => {
  test('« Jamais eu de mot de passe ? » est un (i) dont la question se LIT, replié, qui s’ouvre sur la réponse', () => {
    const el = mount();
    const info = el.querySelector('button[aria-label="Jamais eu de mot de passe ?"]') as HTMLButtonElement | null;
    expect(info?.textContent).toContain('Jamais eu de mot de passe ?');
    expect(info?.getAttribute('aria-expanded')).toBe('false');
    const note = controlledBy(info);
    expect(note?.textContent).toBe('Ce même lien vous permet d’en créer un.');
    expect(note?.classList.contains('sr-only')).toBe(true);

    act(() => {
      info?.click();
    });
    expect(info?.getAttribute('aria-expanded')).toBe('true');
    expect(note?.classList.contains('sr-only')).toBe(false);
  });

  test('aucun libellé perçu ne dit « réinitialisation » ni « magique », ni à la saisie ni à l’envoi', async () => {
    const el = mount(acceptedRequest().deps);
    expect(perceivableText(el)).not.toMatch(/r[ée]initialis|magi(que|c)/iu);
    await sendFrom(el);
    expect(perceivableText(el)).not.toMatch(/r[ée]initialis|magi(que|c)/iu);
  });
});

/**
 * L'ÉCRAN D'ENVOI EST CELUI DE LA CONNEXION PAR E-MAIL (#6583, #6643) — même
 * attente, mêmes mots : « E-mail envoyé », l'adresse, et le (i) « Rien reçu ? »
 * dont le TEXTE est partagé (`emailSent.*`, catalogue d'interface). Il disait « un lien de
 * réinitialisation vient d'être envoyé » : une seconde phrase pour le même
 * fait, et un mot faux pour qui n'a jamais eu de mot de passe.
 */
describe('l’écran d’envoi est celui de la connexion par e-mail', () => {
  test('« E-mail envoyé », « Ouvrez le lien reçu à … », « Rien reçu ? » et le retour — dans la colonne', async () => {
    const request = acceptedRequest();
    const el = mount(request.deps);
    await sendFrom(el);

    expect(request.calls).toEqual([EMAIL]);
    expect(el.querySelector('h2')?.textContent).toBe('E-mail envoyé');
    expect(text(el)).toContain(`Ouvrez le lien reçu à ${EMAIL}`);
    // Le (i) de #6626 : la note est dans le DOM, repliée en `sr-only`, et le
    // libellé de son bouton est LU à côté du glyphe (§ `InfoHintButton`).
    expect(el.querySelector('button[aria-label="Rien reçu ?"]')).not.toBeNull();
    expect(text(el)).toContain(NOTHING_RECEIVED_TEXT);
    const retour = [...el.querySelectorAll('a')].find((a) => text(a).trim() === 'Retour à la connexion');
    expect(retour?.getAttribute('href')).toBe('/login');
    expect(strayFromAuthColumn(el)).toEqual([]);
  });
});

/**
 * UNE SEULE LANGUE D'INTERFACE (#10823) — l'écran entier suit la langue
 * d'interface, jusqu'à l'écran d'envoi qu'il partage avec la connexion.
 */
describe('/forgot-password parle la langue d’interface', () => {
  test('interface en : la phrase, le (i), le bouton, le retour — aucun mot français', () => {
    document.documentElement.lang = 'en';
    const el = mount();
    expect(text(el)).toContain('Get a link by email to choose a new password.');
    expect(text(el)).toContain('Never had a password?');
    expect(el.querySelector('button[type="submit"]')?.textContent).toBe('Get the link');
    expect(text(el)).toContain('Back to sign in');
    expect(text(el)).not.toMatch(/Recevez|Jamais eu|Recevoir le lien|Retour à la connexion/u);
  });

  test('interface en : l’écran d’envoi dit « Email sent » et « Nothing received? »', async () => {
    document.documentElement.lang = 'en';
    const el = mount(acceptedRequest().deps);
    await sendFrom(el);
    expect(el.querySelector('h2')?.textContent).toBe('Email sent');
    expect(text(el)).toContain(`Open the link sent to ${EMAIL}`);
    expect(el.querySelector('button[aria-label="Nothing received?"]')).not.toBeNull();
    expect(text(el)).not.toMatch(/E-mail envoyé|Ouvrez|Rien reçu/u);
  });

  test('interface de : la phrase vient du catalogue allemand', () => {
    document.documentElement.lang = 'de';
    const el = mount();
    expect(text(el)).toContain('Erhalte per E-Mail einen Link, um ein neues Passwort festzulegen.');
    expect(text(el)).toContain('Noch nie ein Passwort gehabt?');
  });
});
