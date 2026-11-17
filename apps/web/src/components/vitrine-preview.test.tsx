import { beforeAll, describe, expect, test } from 'bun:test';

import { RELATION_LEVELS, type RelationLevel } from '@meeshy/shared/types/relation';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { localVitrineView } from '@/lib/profile/vitrine-preview';
import { kitMount } from '@/test-support/kit-mount';

import { VisitorVitrine, VitrineCapabilities, VitrinePreview } from './vitrine-preview';

const { mount, render, act } = kitMount();

beforeAll(async () => {
  await loadInterfaceCatalog('fr');
});

const PROFILE = { displayName: 'Aïssa Ndiaye', username: 'aissa', avatar: null, bio: 'Designer sonore à Dakar.' } as const;
const viewAt = (level: RelationLevel) => localVitrineView({ level, targetId: 'owner-1' });
const lockedRows = (root: HTMLElement) => [...root.querySelectorAll('[data-kit-locked-row]')];
const text = (node: Element | null | undefined) => (node?.textContent ?? '').replace(/\s+/gu, ' ').trim();

const preview = (level: RelationLevel, onLevel: (next: RelationLevel) => void = () => undefined) => (
  <VitrinePreview language="fr" profile={PROFILE} level={level} onLevel={onLevel} view={viewAt(level)} />
);

describe('VitrinePreview — ma Vitrine telle que la voit un cercle', () => {
  test('six onglets, Public en tête et sélectionné, dans l’ordre de la loi', () => {
    const root = mount(preview('PUBLIC'));
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    expect(root.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Voir ma vitrine comme');
    expect(tabs.map((tab) => text(tab))).toEqual(['Public', 'Communauté', 'Connaissance', 'Ami', 'Proche', 'Sang']);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false']);
  });

  test('toucher un cercle le demande à l’hôte, au clavier comme au doigt', () => {
    const asked: RelationLevel[] = [];
    const onLevel = (next: RelationLevel) => asked.push(next);
    const root = mount(preview('PUBLIC', onLevel));
    act(() => (root.querySelectorAll('[role="tab"]')[3] as HTMLButtonElement).click());
    expect(asked).toEqual(['FRIEND']);
  });

  test('l’identité montrée est celle de la fiche : nom, pseudo, bio', () => {
    const root = mount(preview('PUBLIC'));
    expect(root.textContent).toContain('Aïssa Ndiaye');
    expect(root.textContent).toContain('@aissa');
    expect(root.textContent).toContain('Designer sonore à Dakar.');
  });

  test('ce qui est fermé se montre en rangées verrouillées du kit, avec le cercle qui l’ouvre', () => {
    const root = mount(preview('PUBLIC'));
    const rows = lockedRows(root);
    expect(rows.length).toBeGreaterThan(0);
    const battery = rows.find((row) => text(row).includes('Batterie'));
    expect(battery).toBeDefined();
    expect(text(battery)).toContain('dès Proche');
    expect(battery?.getAttribute('aria-label')).toContain('verrouillé');
  });

  test('chaque cercle plus haut ferme autant ou moins de rangées, et au moins un cran en ferme moins', () => {
    const root = mount(preview('PUBLIC'));
    const counts = RELATION_LEVELS.map((level) => {
      render(preview(level));
      return lockedRows(root).length;
    });
    counts.forEach((count, rank) => expect(count <= (counts[rank - 1] ?? Infinity)).toBe(true));
    expect(counts[0]).toBeGreaterThan(counts[counts.length - 1] ?? 0);
  });

  test('aucune rangée fermée ne porte la valeur protégée : seul le nom de la chose et le cercle', () => {
    const root = mount(preview('PUBLIC'));
    for (const row of lockedRows(root)) expect(text(row)).toMatch(/^[^0-9]*(dès|Sang)/u);
  });

  test('ce qui est ouvert est dit à part : une liste « ouvert à ce niveau »', () => {
    const root = mount(preview('FRIEND'));
    const opened = root.querySelector('[data-vitrine-opened]');
    expect(opened).not.toBeNull();
    expect(text(opened)).toContain('Présence');
  });

  test('sans verdict du tout (bloqué, ancien serveur) : aucune section inventée, pas de rangée', () => {
    const root = mount(<VitrineCapabilities language="fr" view={{ ...viewAt('PUBLIC'), capabilities: {} }} />);
    expect(lockedRows(root)).toHaveLength(0);
    expect(root.querySelector('[data-vitrine-opened]')).toBeNull();
  });
});

describe('VisitorVitrine — la page publique est exactement le niveau Public', () => {
  test('dit que le profil est public, puis ne montre QUE ce qui est réservé aux cercles', () => {
    const root = mount(<VisitorVitrine language="fr" targetId="owner-1" />);
    expect(text(root.querySelector('[data-vitrine-visitor]'))).toContain('Profil public');
    expect(root.querySelector('[data-vitrine-opened]')).toBeNull();
    expect(text(root.querySelector('[data-vitrine-locked] h2'))).toBe('Réservé à ses cercles');
  });

  test('les rangées sont celles de la vue Public de « Voir comme », rangée pour rangée', () => {
    const visitor = lockedRows(mount(<VisitorVitrine language="fr" targetId="owner-1" />)).map((row) => text(row));
    const owner = lockedRows(mount(preview('PUBLIC'))).map((row) => text(row));
    expect(visitor).toEqual(owner);
    expect(visitor.length).toBeGreaterThan(0);
  });

  test('aucune action d’écriture pour un visiteur : ni geste, ni lien, ni bouton dans les rangées fermées', () => {
    const root = mount(<VisitorVitrine language="fr" targetId="owner-1" />);
    expect(root.querySelectorAll('[data-vitrine-locked] button, [data-vitrine-locked] a')).toHaveLength(0);
  });
});
