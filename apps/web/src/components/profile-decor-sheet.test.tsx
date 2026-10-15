import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ServedProfileDecorItem } from '@meeshy/shared/types/profile-decor';

import { appearanceNames } from '@/lib/profile-decor/catalog';
import { loadProfileDecorCatalog } from '@/lib/i18n-profile-decor-catalog';
import { bannerOptions, ringOptions } from '@/lib/profile-decor/resolve';

import { DecorChoices, decorChoiceOf } from './profile-decor-sheet';

const rings = ringOptions({ installed: undefined, contracts: new Map() });
const banners = bannerOptions({ installed: undefined, contracts: new Map() });
const names = await appearanceNames('fr');
await loadProfileDecorCatalog('fr');

const noop = () => undefined;

const item = (pack: string, key: string): ServedProfileDecorItem => ({ pack, item: key, origin: 'builtin', contract: null });

describe('le sélecteur de contour', () => {
  test('ne liste que les contours possédés et installés, un par choix, plus « Aucun »', () => {
    const html = renderToStaticMarkup(<DecorChoices side="avatarRing" language="fr" groups={rings} names={names} current={null} accent="#6366F1" scheme="light" onChoose={noop} />);
    expect((html.match(/role="radio"/g) ?? []).length).toBe(8);
    expect(html).toContain('Aucun');
    expect(html).toContain('Filet');
    expect(html).toContain('Laurier');
  });

  test('le contour équipé est le seul coché', () => {
    const html = renderToStaticMarkup(
      <DecorChoices side="avatarRing" language="fr" groups={rings} names={names} current={item('contours-essentiels', 'perle')} accent="#6366F1" scheme="light" onChoose={noop} />,
    );
    expect((html.match(/aria-checked="true"/g) ?? []).length).toBe(1);
    expect(html).toMatch(/aria-checked="true"[^>]*data-decor-choice="perle"|data-decor-choice="perle"[^>]*aria-checked="true"/);
  });

  test('« Plus dans la boutique » ouvre la vitrine filtrée sur les contours', () => {
    const html = renderToStaticMarkup(<DecorChoices side="avatarRing" language="fr" groups={rings} names={names} current={null} accent="#6366F1" scheme="light" onChoose={noop} />);
    expect(html).toContain('Plus dans la boutique');
    expect(html).toContain('domaine=avatar-ring');
    expect(html).toContain('volet=packs');
  });
});

describe('le sélecteur de bannière', () => {
  test('propose « Photo » en tête, puis les sept bannières', () => {
    const html = renderToStaticMarkup(<DecorChoices side="banner" language="fr" groups={banners} names={names} current={null} accent="#6366F1" scheme="dark" onChoose={noop} />);
    expect((html.match(/role="radio"/g) ?? []).length).toBe(8);
    expect(html.indexOf('Photo')).toBeLessThan(html.indexOf('Aurore'));
    expect(html).toContain('domaine=banner');
  });

  test('sans bannière équipée, « Photo » est cochée ; avec une, c’est elle', () => {
    const none = renderToStaticMarkup(<DecorChoices side="banner" language="fr" groups={banners} names={names} current={null} accent="#6366F1" scheme="dark" onChoose={noop} />);
    expect(none).toMatch(/data-decor-choice="photo"[^>]*aria-checked="true"|aria-checked="true"[^>]*data-decor-choice="photo"/);
    const aurore = renderToStaticMarkup(
      <DecorChoices side="banner" language="fr" groups={banners} names={names} current={item('bannieres-essentielles', 'aurore')} accent="#6366F1" scheme="dark" onChoose={noop} />,
    );
    expect((aurore.match(/aria-checked="true"/g) ?? []).length).toBe(1);
    expect(aurore).not.toMatch(/data-decor-choice="photo"[^>]*aria-checked="true"/);
  });
});

describe('le choix posé au toucher', () => {
  test('un builtin porte son origine et aucune adresse de contrat', () => {
    const group = banners[0]!;
    expect(decorChoiceOf(group, group.items[0]!.ref)).toEqual({ pack: group.pack, item: group.items[0]!.ref.item, origin: 'builtin', contract: null });
  });

  test('un pack officiel porte l’adresse de son contrat, pour que les autres le voient', () => {
    const group = { ...banners[0]!, origin: 'official' as const, contract: 'abcdef0123456789.json' };
    expect(decorChoiceOf(group, group.items[0]!.ref).contract).toBe('abcdef0123456789.json');
  });
});
