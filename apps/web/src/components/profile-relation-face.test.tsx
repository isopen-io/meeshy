import { beforeAll, describe, expect, test } from 'bun:test';

import type { RelationLevel } from '@meeshy/shared/types/relation';
import { resolveProfileCircleView } from '@meeshy/shared/utils/profile-circle-view';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { circleLadderOf, relationActionsOf } from '@/lib/profile/relation-face';
import { rowOffered } from '@/routes/user-profile-relation-rows';
import { kitMount } from '@/test-support/kit-mount';

import { CircleLadderCard, RelationLockedRows, RelationWriteAction } from './profile-relation-face';

const { mount, act } = kitMount();

beforeAll(async () => {
  await loadInterfaceCatalog('fr');
});

const viewOf = (viewer: RelationLevel, target: RelationLevel = viewer) =>
  resolveProfileCircleView({
    viewerId: 'me',
    targetId: 'leo',
    grantedByViewer: viewer,
    grantedByTarget: target,
    sharesCommunity: false,
    viewerMinor: 'adult',
    targetMinor: 'adult',
  });

const text = (node: Element | null | undefined) => (node?.textContent ?? '').replace(/\s+/gu, ' ').trim();

describe('la face Actions : ce que le cercle ferme se voit verrouillé', () => {
  test('un Ami voit la batterie et le talkie verrouillés avec « dès Proche », et rien de leur valeur', () => {
    const items = relationActionsOf(viewOf('FRIEND')) ?? [];
    const root = mount(<RelationLockedRows language="fr" items={items} />);
    const battery = root.querySelector('[data-relation-locked-action="battery"]');
    expect(text(battery)).toContain('Batterie');
    expect(text(battery)).toContain('dès Proche');
    expect(root.querySelector('[data-relation-locked-action="talkie"]')).not.toBeNull();
    expect(root.textContent).not.toMatch(/\d+ ?%/u);
  });

  test('un Proche n’a plus de verrou sur le talkie', () => {
    const items = relationActionsOf(viewOf('CLOSE')) ?? [];
    const root = mount(<RelationLockedRows language="fr" items={items} />);
    expect(root.querySelector('[data-relation-locked-action="talkie"]')).toBeNull();
  });

  test('l’inconnu peut DEMANDER à écrire, et l’action le dit', () => {
    const write = (relationActionsOf(viewOf('PUBLIC')) ?? []).find((item) => item.id === 'write');
    if (write === undefined) throw new Error('write absent');
    const calls: string[] = [];
    const root = mount(<RelationWriteAction language="fr" item={write} disabled={false} onWrite={() => calls.push('write')} />);
    expect(text(root)).toContain('Demander à écrire');
    act(() => root.querySelector<HTMLButtonElement>('[data-kit-action-hit]')?.click());
    expect(calls).toEqual(['write']);
  });

  test('l’action d’écrire verrouillée n’est pas offerte du tout (elle apparaît en rangée verrouillée)', () => {
    const view = resolveProfileCircleView({ viewerId: 'me', targetId: 'leo', grantedByViewer: 'PUBLIC', grantedByTarget: 'PUBLIC', sharesCommunity: false, blockedEitherWay: true, viewerMinor: 'adult', targetMinor: 'adult' });
    const write = (relationActionsOf(view) ?? []).find((item) => item.id === 'write');
    if (write === undefined) throw new Error('write absent');
    expect(write.state).toBe('locked');
    expect(mount(<RelationWriteAction language="fr" item={write} disabled={false} onWrite={() => undefined} />).textContent).toBe('');
  });
});

describe('Notre cercle', () => {
  test('dit le niveau commun, ce que chacun accorde, et qui doit accorder pour monter', () => {
    const ladder = circleLadderOf(viewOf('FRIEND', 'ACQUAINTANCE'));
    if (ladder === null) throw new Error('ladder absent');
    const root = mount(<CircleLadderCard language="fr" ladder={ladder} name="Léo" />);
    expect(text(root.querySelector('[data-relation-granted="viewer"]'))).toContain('Ami');
    expect(text(root.querySelector('[data-relation-granted="target"]'))).toContain('Connaissance');
    expect(text(root.querySelector('[data-relation-missing]'))).toContain('Léo doit t’accorder');
  });
});

describe('les rangées existantes suivent le verdict servi, fail-closed', () => {
  test('avec un verdict, seule une action OUVERTE offre sa rangée, quelle que soit l’amitié', () => {
    const items = relationActionsOf(viewOf('FRIEND')) ?? [];
    expect(rowOffered(items, 'talkie', true)).toBe(false);
    expect(rowOffered(items, 'bring', false)).toBe(true);
  });

  test('sans verdict (ancienne passerelle), l’ancien critère reste seul juge', () => {
    expect(rowOffered(null, 'talkie', true)).toBe(true);
    expect(rowOffered(null, 'talkie', false)).toBe(false);
  });
});
