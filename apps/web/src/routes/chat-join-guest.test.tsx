import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { GuestDraft, GuestTerms } from '@/lib/api/link-join';
import { typeInto } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { defaultGuestLanguage, guestLanguageOptions, GuestForm } from './chat-join-guest';

/**
 * **LE FORMULAIRE D'INVITÉ, SEUL** (#5561).
 *
 * Monté SANS l'écran qui le possède : ce que ces témoins isolent, c'est la
 * chaîne « geste → `onEdit` », que l'écran ne fait ensuite que recâbler sur son
 * état. Un témoin d'écran qui échoue laisse trois couches suspectes (la saisie,
 * le champ, l'état) ; celui-ci n'en laisse qu'une.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/chat/mshy_equipe_7f3a' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let mounted: { readonly container: HTMLDivElement; readonly root: Root } | null = null;

afterEach(() => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = null;
});

const TERMS: GuestTerms = {
  allowed: true,
  nicknameRequired: true,
  emailRequired: false,
  birthdayRequired: false,
  languages: [],
  mayWrite: true,
};

const DRAFT: GuestDraft = { nickname: '', email: '', birthday: '', language: 'fr' };

type Edit = readonly [string, string];

function mount(overrides: Partial<Parameters<typeof GuestForm>[0]> = {}): {
  readonly host: HTMLDivElement;
  readonly edits: Edit[];
  readonly submits: number[];
} {
  const edits: Edit[] = [];
  const submits: number[] = [];
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() => {
    root.render(
      <GuestForm
        terms={TERMS}
        draft={DRAFT}
        busy={false}
        online
        refusedField={null}
        refusalMessage={null}
        focused={null}
        onEdit={(field, value) => edits.push([field, value])}
        onFocus={() => undefined}
        onSubmit={() => submits.push(1)}
        {...overrides}
      />,
    );
  });
  return { host: container, edits, submits };
}

const nicknameField = (host: HTMLElement) => host.querySelector<HTMLInputElement>('[data-guest-nickname]');
const languageField = (host: HTMLElement) => host.querySelector<HTMLSelectElement>('[data-guest-language]');

describe('GuestForm — le geste atteint `onEdit`', () => {
  test('taper un pseudo rapporte le champ et sa valeur', () => {
    const { host, edits } = mount();
    typeInto(nicknameField(host), 'Awa');
    expect(edits).toEqual([['nickname', 'Awa']]);
  });

  /**
   * Le `<select>` est CONTRÔLÉ par son hôte (`value={draft.language}`), et
   * l'hôte est ici un espion qui ne met rien à jour : React restaure donc `fr`
   * dans la foulée du geste. Ce qu'on mesure est ce qui est RAPPORTÉ, jamais ce
   * que le champ retient — un `typeInto` strict échouerait sur un élément dont
   * le possesseur refuse le changement, ce qui ne dit rien du câblage.
   */
  test('choisir une langue rapporte le champ et sa valeur', () => {
    const { host, edits } = mount();
    const field = languageField(host);
    act(() => {
      if (field !== null) field.value = 'en';
      field?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(edits).toEqual([['language', 'en']]);
  });

  test('le champ REND ce que le brouillon porte — il est contrôlé par son hôte', () => {
    const { host } = mount({ draft: { ...DRAFT, nickname: 'Awa' } });
    expect(nicknameField(host)?.value).toBe('Awa');
  });

  test('soumettre le formulaire appelle `onSubmit`, et une seule fois', () => {
    const { host, submits } = mount();
    const form = host.querySelector('form');
    act(() => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(submits).toEqual([1]);
  });

  test('un refus se pose SOUS son champ, et le champ se déclare invalide', () => {
    const { host } = mount({ refusedField: 'nickname', refusalMessage: 'Ce pseudo est déjà pris' });
    const field = nicknameField(host);
    expect(field?.getAttribute('aria-invalid')).toBe('true');
    const described = field?.getAttribute('aria-describedby')?.split(' ')[0] ?? '';
    expect(host.querySelector(`#${described}`)?.textContent).toContain('déjà pris');
  });

  test('un refus SANS champ se pose au-dessus du formulaire, jamais sous un champ deviné', () => {
    const { host } = mount({ refusedField: null, refusalMessage: 'Une information manque' });
    expect(nicknameField(host)?.getAttribute('aria-invalid')).toBe('false');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Une information manque');
  });

  test('hors ligne : le bouton est inactif et l’écran le dit', () => {
    const { host } = mount({ online: false });
    expect(host.querySelector<HTMLButtonElement>('[data-guest-submit]')?.disabled).toBe(true);
    expect(host.textContent).toContain('Hors ligne');
  });
});

describe('les langues offertes', () => {
  test('un lien qui restreint ses langues n’en offre pas d’autres', () => {
    expect(guestLanguageOptions({ ...TERMS, languages: ['fr', 'wo'] })).toEqual(['fr', 'wo']);
  });

  test('une liste VIDE signifie « toutes celles du produit », jamais « aucune »', () => {
    expect(guestLanguageOptions(TERMS)).toContain('fr');
    expect(guestLanguageOptions(TERMS).length).toBeGreaterThan(1);
  });

  /* Un `<select>` qui s'ouvrirait sur une langue que le lien refuse ferait
     échouer le premier envoi sans que rien ne l'ait annoncé. */
  test('la langue pré-choisie est celle de l’interface si le lien l’accepte', () => {
    expect(defaultGuestLanguage(TERMS, 'en')).toBe('en');
  });

  test('sinon, la PREMIÈRE que le lien accepte', () => {
    expect(defaultGuestLanguage({ ...TERMS, languages: ['wo', 'fr'] }, 'en')).toBe('wo');
  });
});
