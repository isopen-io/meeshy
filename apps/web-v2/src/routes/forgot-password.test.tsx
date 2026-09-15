import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import ForgotPasswordScreen, { type ForgotPasswordDeps } from '@/routes/forgot-password';
import { NOTHING_RECEIVED_TEXT } from '@/lib/view/auth-copy';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

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

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/forgot-password' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
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
});

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
    expect(text(el)).toContain('lien de réinitialisation');
    expect(el.querySelector('#forgot-email')).not.toBeNull();
    expect(text(el)).toContain('Recevoir le lien');
  });

  test('le retour vers la connexion est une ANCRE, dès la première seconde', () => {
    const el = mount();
    expect([...el.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/login')).toBe(true);
  });

  test('le pied de marque, comme sur /login', () => {
    expect(text(mount())).toContain('Services CEO');
  });
});

/**
 * LA NOTE SUR LES INDÉSIRABLES (#6583) — la connexion par e-mail la porte
 * depuis #6404, repliée derrière un (i) depuis #6626, et c'est EXACTEMENT le
 * même moment : on attend un e-mail qui peut ne jamais paraître. Le TEXTE est
 * PARTAGÉ (`lib/view/auth-copy.ts`) et le (i) vient du socle — deux phrases,
 * ou deux mises en scène, pour une même attente auraient dérivé au premier
 * correctif.
 */
describe('l’écran d’envoi dit où chercher l’e-mail', () => {
  test('« Rien reçu ? » est là, et sa note est la MÊME que celle de la connexion par e-mail', async () => {
    const el = mount({ request: async () => ({ ok: true as const, status: 200, data: { message: 'ok' } }) });
    const champ = el.querySelector('#forgot-email') as HTMLInputElement;
    act(() => {
      champ.value = 'ada@meeshy.example';
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      (el.querySelector('form') as HTMLFormElement).requestSubmit();
    });
    // L'écran d'envoi n'a pas de titre non plus (§ le bloc ci-dessus) : c'est
    // l'enveloppe et la phrase qui disent ce qui vient de se passer.
    expect(text(el)).toContain('vient d’être envoyé');
    // Le (i) de #6626 : la note est dans le DOM, repliée en `sr-only`, et le
    // libellé de son bouton est LU à côté du glyphe (§ `InfoHintButton`).
    expect(el.querySelector('button[aria-label="Rien reçu ?"]')).not.toBeNull();
    expect(text(el)).toContain(NOTHING_RECEIVED_TEXT);
  });
});
