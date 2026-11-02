import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { useState } from 'react';

import { CIRCLE_NOTIFY_DEFAULTS, type CircleNotifyKey, type RelationAudienceChoice } from '@meeshy/shared/utils/relation-levels';

import { loadCircleNotifyCatalog } from '@/lib/i18n-circle-notify-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { createActMounter, typeInto } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CircleNotifySectionView, type CircleNotifyView } from './settings-circle-notify';

/**
 * « QUI EST PRÉVENU » DESSINÉ (#14063) — trois familles qui se déplient par
 * action, le défaut servi sans configuration, un sélecteur natif par action
 * (clavier et lecteur d'écran sans rien réinventer), et une phrase claire
 * sous les crans Communauté et Public.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadCircleNotifyCatalog('fr'), loadCircleNotifyCatalog('ar')]);
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(unmountAll);

const ready = (overrides: Partial<Record<CircleNotifyKey, RelationAudienceChoice>> = {}): CircleNotifyView => ({
  kind: 'ready',
  preferences: { ...CIRCLE_NOTIFY_DEFAULTS, ...overrides },
});

/** L'hôte applique le choix comme l'écran le fait (optimiste) : le sélecteur est contrôlé. */
function Host(props: {
  readonly view: CircleNotifyView;
  readonly disabled: boolean;
  readonly language: InterfaceLanguage;
  readonly onChoose: (key: CircleNotifyKey, value: RelationAudienceChoice) => void;
  readonly onRetry: () => void;
}) {
  const [view, setView] = useState(props.view);
  return (
    <CircleNotifySectionView
      language={props.language}
      view={view}
      disabled={props.disabled}
      onChoose={(key, value) => {
        props.onChoose(key, value);
        setView((current) => (current.kind === 'ready' ? { kind: 'ready', preferences: { ...current.preferences, [key]: value } } : current));
      }}
      onRetry={props.onRetry}
    />
  );
}

function section(params: { readonly view?: CircleNotifyView; readonly disabled?: boolean; readonly language?: InterfaceLanguage } = {}) {
  const chosen: Array<readonly [CircleNotifyKey, RelationAudienceChoice]> = [];
  const retries: string[] = [];
  const element = (
    <Host
      language={params.language ?? 'fr'}
      view={params.view ?? ready()}
      disabled={params.disabled ?? false}
      onChoose={(key, value) => chosen.push([key, value])}
      onRetry={() => retries.push('retry')}
    />
  );
  return { element, chosen, retries };
}

const familyButton = (host: HTMLElement, family: string) => host.querySelector<HTMLButtonElement>(`[data-circle-family="${family}"]`);

describe('« Qui est prévenu » — trois familles, le défaut affiché', () => {
  test('sans configuration : Proche, Proche, Sang, repliées', async () => {
    const host = await mount(section().element);
    expect(host.querySelector('h2')?.textContent).toBe('QUI EST PRÉVENU');
    expect(familyButton(host, 'publication')?.textContent).toContain('Mes publications');
    expect(familyButton(host, 'publication')?.textContent).toContain('Proche');
    expect(familyButton(host, 'onMyContent')?.textContent).toContain('Proche');
    expect(familyButton(host, 'elsewhere')?.textContent).toContain('Sang');
    for (const family of ['publication', 'onMyContent', 'elsewhere']) {
      expect(familyButton(host, family)?.getAttribute('aria-expanded')).toBe('false');
    }
    expect(host.querySelector('select')).toBeNull();
  });

  test('une famille dont les actions diffèrent le dit', async () => {
    const host = await mount(section({ view: ready({ circlePublicationReel: 'PUBLIC' }) }).element);
    expect(familyButton(host, 'publication')?.textContent).toContain('Selon l’action');
  });
});

describe('« Qui est prévenu » — se déplier par action, choisir', () => {
  test('déplier A montre ses six actions, chacune avec son sélecteur nommé et les sept crans', async () => {
    const host = await mount(section().element);
    const button = familyButton(host, 'publication');
    if (button !== null) await click(button);
    expect(button?.getAttribute('aria-expanded')).toBe('true');
    const panel = host.querySelector(`#${button?.getAttribute('aria-controls') ?? 'absent'}`);
    const selects = [...(panel?.querySelectorAll('select') ?? [])];
    expect(selects.map((select) => select.getAttribute('data-circle-key'))).toEqual([
      'circlePublicationPost',
      'circlePublicationReel',
      'circlePublicationStory',
      'circlePublicationMood',
      'circlePublicationRepost',
      'circlePublicationShare',
    ]);
    const first = selects[0];
    expect(first?.value).toBe('CLOSE');
    const label = host.querySelector(`label[for="${first?.id ?? 'absent'}"]`);
    expect(label?.textContent).toBe('Publication');
    expect([...(first?.options ?? [])].map((option) => option.textContent)).toEqual([
      'Personne',
      'Sang',
      'Proche',
      'Ami',
      'Connaissance',
      'Communauté',
      'Public',
    ]);
  });

  test('choisir un cran le remet à l’hôte, clé plate et valeur', async () => {
    const { element, chosen } = section();
    const host = await mount(element);
    const button = familyButton(host, 'elsewhere');
    if (button !== null) await click(button);
    typeInto(host.querySelector<HTMLSelectElement>('select[data-circle-key="circleElsewhereMention"]'), 'NOBODY');
    expect(chosen).toEqual([['circleElsewhereMention', 'NOBODY']]);
    expect(familyButton(host, 'elsewhere')?.textContent).toContain('Selon l’action');
  });

  test('Communauté et Public disent en clair qui sera prévenu', async () => {
    const host = await mount(section({ view: ready({ circleOnMyContentShare: 'COMMUNITY', circleOnMyContentQuote: 'PUBLIC' }) }).element);
    const button = familyButton(host, 'onMyContent');
    if (button !== null) await click(button);
    const share = host.querySelector<HTMLSelectElement>('select[data-circle-key="circleOnMyContentShare"]');
    const quote = host.querySelector<HTMLSelectElement>('select[data-circle-key="circleOnMyContentQuote"]');
    const explanation = (select: HTMLSelectElement | null) =>
      host.querySelector(`#${select?.getAttribute('aria-describedby') ?? 'absent'}`)?.textContent ?? '';
    expect(explanation(share)).toContain('membres des communautés');
    expect(explanation(quote)).toContain('aucun inconnu');
    expect(host.querySelector<HTMLSelectElement>('select[data-circle-key="circleOnMyContentComment"]')?.hasAttribute('aria-describedby')).toBe(false);
  });

  test('hors ligne, les sélecteurs ne s’offrent pas', async () => {
    const host = await mount(section({ disabled: true }).element);
    const button = familyButton(host, 'publication');
    if (button !== null) await click(button);
    expect([...host.querySelectorAll('select')].every((select) => select.disabled)).toBe(true);
  });

  test('en arabe, les cercles portent les noms partagés', async () => {
    const host = await mount(section({ language: 'ar' }).element);
    expect(familyButton(host, 'elsewhere')?.textContent).toContain('دم');
  });
});

describe('« Qui est prévenu » — lecture en panne', () => {
  test('la panne le dit et offre de réessayer', async () => {
    const { element, retries } = section({ view: { kind: 'error' } });
    const host = await mount(element);
    const retry = host.querySelector<HTMLButtonElement>('[data-circle-retry]');
    expect(retry?.textContent).toBe('Réessayer');
    if (retry !== null) await click(retry);
    expect(retries).toEqual(['retry']);
  });

  test('en chargement, aucune valeur n’est inventée', async () => {
    const host = await mount(section({ view: { kind: 'loading' } }).element);
    expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(host.querySelector('[data-circle-family]')).toBeNull();
  });
});
