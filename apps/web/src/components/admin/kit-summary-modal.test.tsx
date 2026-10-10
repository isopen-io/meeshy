import { describe, expect, test } from 'bun:test';
import { act, useEffect } from 'react';

import { useAdminOpen } from '@/lib/admin/use-admin-open';
import { createRouter, navigate } from '@/lib/router';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminDetailSheet } from './detail-sheet';
import { AdminSummaryCard, AdminSummaryGrid } from './summary-card';

/**
 * **LE PATRON « SYNTHÈSE → MODALE »** (spec 2026-10-04 § 1) — la carte résumée
 * (chiffres déjà formatés, « Ouvrir » de 44 px), la modale dont le contenu n'est
 * monté qu'à l'ouverture, et l'adresse qui la porte (`?open=`).
 */
const { mount, mounter } = setupAdminKitTests({ languages: ['fr', 'en'] });

describe('AdminSummaryCard — une zone dite en deux à quatre chiffres', () => {
  test('titre, valeurs, phrase et « Ouvrir {titre} » de 44 px', async () => {
    const opened: string[] = [];
    const host = await mount(
      <AdminSummaryCard
        language="fr"
        id="platform"
        title="Plateforme"
        glyph="users"
        values={[
          { label: 'Comptes', value: '1 200' },
          { label: 'Messages', value: '34 000' },
        ]}
        sentence="3 nouveaux comptes en 24 h"
        onOpen={() => opened.push('platform')}
      />,
    );
    const card = host.querySelector('[data-admin-summary="platform"]');
    expect(card?.querySelector('h2, h3')?.textContent).toBe('Plateforme');
    expect([...(card?.querySelectorAll('dt') ?? [])].map((node) => node.textContent)).toEqual(['Comptes', 'Messages']);
    expect([...(card?.querySelectorAll('dd') ?? [])].map((node) => node.textContent)).toEqual(['1 200', '34 000']);
    expect(card?.textContent).toContain('3 nouveaux comptes en 24 h');
    const open = card?.querySelector<HTMLButtonElement>('[data-admin-summary-open]');
    expect(open?.getAttribute('aria-label')).toBe('Ouvrir Plateforme');
    expect(open?.style.minHeight).toBe('44px');
    expect(open?.className).toContain('focus-visible:outline-2');
    await mounter.click(open ?? null);
    expect(opened).toEqual(['platform']);
  });

  test('le libellé du bouton suit la langue d’administration', async () => {
    const host = await mount(<AdminSummaryCard language="en" id="now" title="Right now" values={[{ label: 'Online', value: '12' }]} onOpen={() => undefined} />);
    expect(host.querySelector('[data-admin-summary-open]')?.getAttribute('aria-label')).toBe('Open Right now');
  });

  test('squelette : libellés gardés, aucune valeur inventée, « Ouvrir » reste offert', async () => {
    const host = await mount(
      <AdminSummaryCard language="fr" id="usage" title="Usage" state="loading" values={[{ label: 'Taux', value: '—' }]} onOpen={() => undefined} />,
    );
    const card = host.querySelector('[data-admin-summary="usage"]');
    expect(card?.getAttribute('data-admin-summary-state')).toBe('loading');
    expect(card?.getAttribute('aria-busy')).toBe('true');
    expect(card?.querySelector('dd')?.textContent).toBe('');
    expect(card?.querySelector('[data-admin-summary-open]')).not.toBeNull();
  });

  test('erreur : « Réessayer » rappelle la lecture ; refus : la ligne de refus, sans « Réessayer »', async () => {
    const retries: number[] = [];
    const host = await mount(
      <AdminSummaryGrid>
        <AdminSummaryCard language="fr" id="a" title="A" state="error" onRetry={() => retries.push(1)} values={[]} onOpen={() => undefined} />
        <AdminSummaryCard language="fr" id="b" title="B" state="denied" values={[]} onOpen={() => undefined} />
      </AdminSummaryGrid>,
    );
    expect(host.querySelector('[data-admin-summary-grid]')).not.toBeNull();
    await mounter.click(host.querySelector<HTMLElement>('[data-admin-summary="a"] [data-admin-retry]'));
    expect(retries).toEqual([1]);
    const denied = host.querySelector('[data-admin-summary="b"]');
    expect(denied?.querySelector('[data-admin-denied-inline]')).not.toBeNull();
    expect(denied?.querySelector('[data-admin-retry]')).toBeNull();
    expect(denied?.querySelector('[data-admin-summary-open]')).toBeNull();
  });
});

let mounts = 0;
function CountsMounts() {
  useEffect(() => {
    mounts += 1;
  }, []);
  return <p data-detail-body>détail</p>;
}

describe('AdminDetailSheet — le détail n’existe qu’ouvert', () => {
  test('fermée : rien n’est monté (aucune requête du détail ne part)', async () => {
    mounts = 0;
    const host = await mount(
      <AdminDetailSheet language="fr" id="platform" title="Plateforme" open={false} onClose={() => undefined}>
        <CountsMounts />
      </AdminDetailSheet>,
    );
    expect(host.querySelector('dialog')).toBeNull();
    expect(mounts).toBe(0);
  });

  test('ouverte : une modale nommée, fermeture traduite, corps défilant, contenu monté une fois', async () => {
    mounts = 0;
    const closes: number[] = [];
    const host = await mount(
      <AdminDetailSheet language="en" id="platform" title="Platform" open onClose={() => closes.push(1)}>
        <CountsMounts />
      </AdminDetailSheet>,
    );
    const dialog = host.querySelector('dialog');
    expect(dialog?.querySelector('h2')?.textContent).toBe('Platform');
    expect(dialog?.querySelector('[data-admin-detail="platform"]')).not.toBeNull();
    expect(dialog?.querySelector('button')?.getAttribute('aria-label')).toBe('Close');
    expect(dialog?.querySelector('[data-detail-body]')).not.toBeNull();
    expect(mounts).toBe(1);
  });
});

describe('useAdminOpen — la modale ouverte vit dans l’adresse', () => {
  const IDS = ['now', 'platform'] as const;
  let legacy = false;

  function Probe() {
    const sheet = useAdminOpen(IDS, { legacyTab: legacy });
    return (
      <div>
        <p data-open>{sheet.active ?? 'aucune'}</p>
        <button type="button" data-go="platform" onClick={() => sheet.open('platform')} />
        <button type="button" data-close onClick={sheet.close} />
      </div>
    );
  }

  const { Router: ProbeRouter } = createRouter({ probe: { pattern: '/probe', screen: async () => ({ default: Probe }) } }, () => <p>absent</p>);

  const mountProbe = async (url: string) => {
    navigate(url, true);
    const host = await mounter.mount(<ProbeRouter wrap={(children) => children} skeleton={null} />);
    for (let attempt = 0; attempt < 20 && host.querySelector('[data-open]') === null; attempt += 1) await mounter.settle();
    return host;
  };
  const opened = (host: ParentNode) => host.querySelector('[data-open]')?.textContent;

  test('?open= connu est lu ; inconnu ou absent : aucune', async () => {
    legacy = false;
    expect(opened(await mountProbe('/probe?open=now'))).toBe('now');
    mounter.unmountAll();
    expect(opened(await mountProbe('/probe?open=inconnu'))).toBe('aucune');
    mounter.unmountAll();
    expect(opened(await mountProbe('/probe'))).toBe('aucune');
  });

  test('ouvrir POUSSE une entrée (le retour ferme) ; fermer rend NOTRE entrée par history.back()', async () => {
    legacy = false;
    const host = await mountProbe('/probe?q=x');
    const before = window.history.length;
    await mounter.click(host.querySelector<HTMLElement>('[data-go="platform"]'));
    expect(window.location.search).toBe('?q=x&open=platform');
    expect(window.history.length).toBe(before + 1);
    expect(opened(host)).toBe('platform');

    const original = window.history.back.bind(window.history);
    let backs = 0;
    window.history.back = () => {
      backs += 1;
      original();
    };
    try {
      await mounter.click(host.querySelector<HTMLElement>('[data-close]'));
      for (let turn = 0; turn < 10 && opened(host) !== 'aucune'; turn += 1) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
        });
      }
    } finally {
      window.history.back = original;
    }
    expect(backs).toBe(1);
    expect(window.location.search).toBe('?q=x');
    expect(opened(host)).toBe('aucune');
  });

  test('ouverte par un lien (entrée qui n’est pas la nôtre) : fermer REMPLACE, sans reculer', async () => {
    legacy = false;
    const host = await mountProbe('/probe?open=now&q=y');
    const original = window.history.back.bind(window.history);
    let backs = 0;
    window.history.back = () => {
      backs += 1;
    };
    try {
      await mounter.click(host.querySelector<HTMLElement>('[data-close]'));
    } finally {
      window.history.back = original;
    }
    expect(backs).toBe(0);
    expect(window.location.search).toBe('?q=y');
    expect(opened(host)).toBe('aucune');
  });

  test('legacyTab : un ?tab= connu ouvre la modale ; fermer l’efface aussi', async () => {
    legacy = true;
    const host = await mountProbe('/probe?tab=platform');
    expect(opened(host)).toBe('platform');
    await mounter.click(host.querySelector<HTMLElement>('[data-close]'));
    expect(window.location.search).toBe('');
    expect(opened(host)).toBe('aucune');
  });

  test('sans legacyTab, ?tab= est ignoré', async () => {
    legacy = false;
    expect(opened(await mountProbe('/probe?tab=platform'))).toBe('aucune');
  });

  test('hors routeur (un témoin de panneau), l’état reste local', async () => {
    legacy = false;
    const host = await mount(<Probe />);
    expect(opened(host)).toBe('aucune');
    await mounter.click(host.querySelector<HTMLElement>('[data-go="platform"]'));
    expect(opened(host)).toBe('platform');
    await mounter.click(host.querySelector<HTMLElement>('[data-close]'));
    expect(opened(host)).toBe('aucune');
  });
});
