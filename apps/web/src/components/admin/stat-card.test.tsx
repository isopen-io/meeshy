import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminStatCard, AdminStatGrid, type AdminDelta } from './stat-card';

const { mount } = setupAdminKitTests({ languages: ['fr', 'en'] });
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });

const base = { language: 'fr', label: 'Comptes', value: '12 408', anchor: 'users' } as const;
const plain = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ');

describe('AdminStatCard — le chiffre, sa légende, sa variation', () => {
  test('libellé, chiffre clé déjà formaté, légende', async () => {
    const host = await mount(<AdminStatCard {...base} caption="dont 12 en 24 h" />);
    const carte = host.querySelector('[data-admin-stat="users"]');
    expect(carte?.textContent).toContain('Comptes');
    expect(carte?.textContent).toContain('12 408');
    expect(carte?.textContent).toContain('dont 12 en 24 h');
  });

  test('avec une cible, TOUTE la carte est un lien de 44 px vers la liste filtrée', async () => {
    const host = await mount(<AdminStatCard {...base} target={{ kind: 'section', section: 'users', search: { isActive: 'true' } }} />, BIGBOSS);
    const lien = host.querySelector('[data-admin-stat="users"] a');
    expect(lien?.getAttribute('href')).toBe('/admin/users?isActive=true');
    expect(lien?.textContent).toContain('12 408');
    expect((lien as HTMLElement | null)?.style.minHeight).toBe('44px');
  });

  test('sans droit sur la section visée, la carte reste lisible mais n’est pas un lien', async () => {
    const host = await mount(<AdminStatCard {...base} target={{ kind: 'section', section: 'users' }} />, adminIdentityFixture({ role: 'MODERATOR' }));
    expect(host.querySelector('a')).toBeNull();
    expect(host.textContent).toContain('12 408');
  });
});

describe('la variation : flèche, signe, mot — jamais la couleur seule', () => {
  const delta = (ratio: number, goodWhen: AdminDelta['goodWhen']): AdminDelta => ({ ratio, period: 'vs 7 jours précédents', goodWhen });
  const lire = async (d: AdminDelta) => {
    const host = await mount(<AdminStatCard {...base} delta={d} />);
    const noeud = host.querySelector('[data-admin-delta]');
    return { tone: noeud?.getAttribute('data-admin-delta'), visible: plain(noeud?.querySelector('span[aria-hidden="true"]')?.textContent), mot: noeud?.querySelector('.sr-only')?.textContent, texte: noeud?.textContent };
  };

  test('une hausse dont la hausse est bonne : succès, « +12 % », « en hausse de 12 % »', async () => {
    const lu = await lire(delta(0.12, 'up'));
    expect(lu.tone).toBe('success');
    expect(plain(lu.visible)).toBe('+12 %');
    expect(plain(lu.mot)).toBe('en hausse de 12 %');
    expect(lu.texte).toContain('vs 7 jours précédents');
  });

  test('une hausse dont la baisse serait bonne (les échecs) : danger', async () => {
    expect((await lire(delta(0.12, 'down'))).tone).toBe('danger');
  });

  test('une baisse : signe moins typographique et mot « en baisse de »', async () => {
    const lu = await lire(delta(-0.5, 'up'));
    expect(lu.tone).toBe('danger');
    expect(plain(lu.visible)).toBe('−50 %');
    expect(plain(lu.mot)).toBe('en baisse de 50 %');
  });

  test('neutre ou nulle : ton neutre ; zéro se dit « stable »', async () => {
    expect((await lire(delta(0.3, 'neutral'))).tone).toBe('neutral');
    const stable = await lire(delta(0, 'up'));
    expect(stable.tone).toBe('neutral');
    expect(stable.mot).toBe('stable');
  });

  test('la flèche est un glyphe : hausse, baisse, stable', async () => {
    for (const ratio of [0.1, -0.1, 0]) {
      const host = await mount(<AdminStatCard {...base} delta={delta(ratio, 'neutral')} />);
      expect(host.querySelector('[data-admin-delta] svg')).not.toBeNull();
    }
  });
});

describe('la tendance', () => {
  test('une courbe décorative NOMMÉE par sa synthèse textuelle', async () => {
    const host = await mount(<AdminStatCard {...base} trend={[12, 20, 48]} />);
    const courbe = host.querySelector('[data-admin-sparkline]');
    expect(courbe?.getAttribute('role')).toBe('img');
    expect(courbe?.getAttribute('aria-label')).toBe('Tendance : de 12 à 48');
  });

  test('une tendance d’un seul point ne dessine rien', async () => {
    const host = await mount(<AdminStatCard {...base} trend={[12]} />);
    expect(host.querySelector('[data-admin-sparkline]')).toBeNull();
  });
});

describe('les états', () => {
  test('squelette : le libellé reste, le chiffre est une barre, la carte est occupée', async () => {
    const host = await mount(<AdminStatCard {...base} state="loading" />);
    const carte = host.querySelector('[data-admin-stat="users"]');
    expect(carte?.getAttribute('aria-busy')).toBe('true');
    expect(carte?.textContent).toContain('Comptes');
    expect(carte?.textContent).not.toContain('12 408');
  });

  test('erreur : message, « Réessayer » qui rappelle — la carte ne ment pas par un zéro', async () => {
    let appels = 0;
    const host = await mount(<AdminStatCard {...base} state="error" onRetry={() => (appels += 1)} />);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Impossible de charger');
    expect(host.textContent).not.toContain('12 408');
    await act(async () => host.querySelector<HTMLButtonElement>('[data-admin-retry]')?.click());
    expect(appels).toBe(1);
  });
});

describe('AdminStatGrid', () => {
  test('une colonne sous sm, deux dès sm, `columns` dès lg', async () => {
    const host = await mount(
      <AdminStatGrid columns={3}>
        <span />
      </AdminStatGrid>,
    );
    const classes = host.querySelector('[data-admin-stat-grid]')?.className ?? '';
    expect(classes).toContain('grid-cols-1');
    /* Des seuils de CONTENU (conteneur), pas de fenêtre : le menu déplié retire 248 px. */
    expect(classes).toContain('@lg:grid-cols-2');
    expect(classes).toContain('@4xl:grid-cols-3');
    expect(classes).not.toMatch(/(^|\s)(sm|lg):grid-cols/);
  });
});
