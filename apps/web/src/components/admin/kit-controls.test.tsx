import { act, useState } from 'react';
import { describe, expect, test } from 'bun:test';

import { setupAdminKitTests } from '@/test-support/admin-harness';
import { typeInto } from '@/test-support/act-mount';
import { createRouter, navigate } from '@/lib/router';

import { AdminFilterChips, AdminListToolbar } from './list-toolbar';
import { AdminTabs, useAdminTab } from './tabs';

const { mount, mounter } = setupAdminKitTests();

describe('AdminListToolbar — ne dessine que ce que la passerelle sert', () => {
  const status = { id: 'status', label: 'Statut', value: '', options: [{ value: '', label: 'Tous' }, { value: 'pending', label: 'En attente' }], onChange: () => undefined };

  test('sans `search`, aucun champ de recherche — un champ qui ne filtre rien est un contrôle sans effet', async () => {
    const host = await mount(<AdminListToolbar language="fr" filters={[status]} />);
    expect(host.querySelector('[data-admin-search]')).toBeNull();
    expect(host.querySelector('[data-admin-filter="status"]')).not.toBeNull();
  });

  function Controlled({ tapes, choix }: { readonly tapes: string[]; readonly choix: string[] }) {
    const [q, setQ] = useState('');
    const [statut, setStatut] = useState('');
    return (
      <AdminListToolbar
        language="fr"
        search={{ label: 'Rechercher un compte', value: q, onChange: (value) => (tapes.push(value), setQ(value)) }}
        filters={[{ ...status, value: statut, onChange: (value) => (choix.push(value), setStatut(value)) }]}
      />
    );
  }

  test('la recherche : libellé visible, champ de 44 px, la frappe est remontée', async () => {
    const tapes: string[] = [];
    const host = await mount(<Controlled tapes={tapes} choix={[]} />);
    expect(host.querySelector('label')?.textContent).toContain('Rechercher un compte');
    const champ = host.querySelector<HTMLInputElement>('[data-admin-search]');
    expect(champ?.style.minHeight).toBe('44px');
    mounter.type(host, '[data-admin-search]', 'awa');
    expect(tapes).toEqual(['awa']);
  });

  test('un filtre remonte sa valeur', async () => {
    const choix: string[] = [];
    const host = await mount(<Controlled tapes={[]} choix={choix} />);
    typeInto(host.querySelector<HTMLSelectElement>('[data-admin-filter="status"]'), 'pending');
    expect(choix).toEqual(['pending']);
  });

  test('« Réinitialiser » n’existe que si une recherche ou un filtre est posé', async () => {
    const vide = await mount(<AdminListToolbar language="fr" filters={[status]} search={{ label: 'r', value: '  ', onChange: () => undefined }} onReset={() => undefined} />);
    expect(vide.querySelector('[data-admin-list-reset]')).toBeNull();
    mounter.unmountAll();

    let resets = 0;
    const filtre = await mount(<AdminListToolbar language="fr" filters={[{ ...status, value: 'pending' }]} onReset={() => (resets += 1)} />);
    await act(async () => filtre.querySelector<HTMLButtonElement>('[data-admin-list-reset]')?.click());
    expect(resets).toBe(1);
    mounter.unmountAll();

    const recherche = await mount(<AdminListToolbar language="fr" search={{ label: 'r', value: 'awa', onChange: () => undefined }} onReset={() => undefined} />);
    expect(recherche.querySelector('[data-admin-list-reset]')?.textContent).toContain('Réinitialiser');
  });

  test('le compteur de fin de barre, et tout passe à la ligne (375 px sans défilement horizontal)', async () => {
    const host = await mount(<AdminListToolbar language="fr" trailing="1 204 comptes" />);
    expect(host.querySelector('[data-admin-toolbar-count]')?.textContent).toBe('1 204 comptes');
    expect(host.querySelector('[data-admin-toolbar]')?.className).toContain('flex-wrap');
  });
});

describe('AdminFilterChips', () => {
  const options = [{ value: '', label: 'Tous' }, { value: 'pending', label: 'En attente', count: '12' }];

  test('un groupe nommé de puces de 44 px ; la puce active porte aria-pressed ET un fond — jamais la couleur seule', async () => {
    const host = await mount(<AdminFilterChips label="Statut" options={options} value="pending" onChange={() => undefined} />);
    expect(host.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Statut');
    const [tous, attente] = [...host.querySelectorAll<HTMLButtonElement>('button')];
    expect(tous?.getAttribute('aria-pressed')).toBe('false');
    expect(attente?.getAttribute('aria-pressed')).toBe('true');
    expect(attente?.querySelector('svg')).not.toBeNull();
    expect(attente?.textContent).toContain('12');
    expect(attente?.style.minHeight).toBe('44px');
  });

  test('toucher une puce la choisit', async () => {
    const choix: string[] = [];
    const host = await mount(<AdminFilterChips label="Statut" options={options} value="" onChange={(v) => choix.push(v)} />);
    await act(async () => host.querySelector<HTMLButtonElement>('[data-admin-chip="pending"]')?.click());
    expect(choix).toEqual(['pending']);
  });
});

describe('AdminTabs — des onglets ARIA', () => {
  const tabs = [{ id: 'activity', label: 'Activité' }, { id: 'messages', label: 'Messages', count: '12' }, { id: 'calls', label: 'Appels' }] as const;

  function Harness({ start = 'activity' }: { readonly start?: 'activity' | 'messages' | 'calls' }) {
    const [active, setActive] = useState<'activity' | 'messages' | 'calls'>(start);
    return <AdminTabs label="Statistiques" tabs={tabs} active={active} onChange={setActive} />;
  }

  const roles = (host: Element) => [...host.querySelectorAll('[role="tab"]')];

  test('tablist nommée, un tab par onglet, un seul dans l’ordre de tabulation', async () => {
    const host = await mount(<Harness />);
    expect(host.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Statistiques');
    expect(roles(host).map((tab) => [tab.getAttribute('aria-selected'), tab.getAttribute('tabindex')])).toEqual([
      ['true', '0'],
      ['false', '-1'],
      ['false', '-1'],
    ]);
  });

  test('le compteur s’affiche à côté du libellé', async () => {
    const host = await mount(<Harness />);
    expect(roles(host)[1]?.textContent).toBe('Messages12');
  });

  test('cliquer ouvre l’onglet', async () => {
    const host = await mount(<Harness />);
    await act(async () => (roles(host)[2] as HTMLElement).click());
    expect(roles(host)[2]?.getAttribute('aria-selected')).toBe('true');
  });

  const press = (host: Element, index: number, key: string) =>
    act(async () => {
      roles(host)[index]?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    });

  test('flèche droite avance, flèche gauche recule, en boucle ; Début et Fin', async () => {
    const host = await mount(<Harness />);
    await press(host, 0, 'ArrowRight');
    expect(roles(host)[1]?.getAttribute('aria-selected')).toBe('true');
    await press(host, 1, 'ArrowLeft');
    await press(host, 0, 'ArrowLeft');
    expect(roles(host)[2]?.getAttribute('aria-selected')).toBe('true');
    await press(host, 2, 'Home');
    expect(roles(host)[0]?.getAttribute('aria-selected')).toBe('true');
    await press(host, 0, 'End');
    expect(roles(host)[2]?.getAttribute('aria-selected')).toBe('true');
  });

  test('les flèches sont INVERSÉES en arabe : droite recule dans l’ordre de lecture', async () => {
    document.documentElement.dir = 'rtl';
    try {
      const host = await mount(<Harness start="messages" />);
      await press(host, 1, 'ArrowRight');
      expect(roles(host)[0]?.getAttribute('aria-selected')).toBe('true');
    } finally {
      document.documentElement.dir = 'ltr';
    }
  });

  test('l’onglet actif porte aussi un filet de 2 px — la sélection ne repose pas sur la couleur', async () => {
    const host = await mount(<Harness />);
    expect((roles(host)[0] as HTMLElement).style.borderBottomWidth).toBe('2px');
    expect((roles(host)[0] as HTMLElement).style.borderBottomColor).toBe('var(--color-ios-brand)');
    expect((roles(host)[1] as HTMLElement).style.borderBottomColor).toBe('transparent');
  });
});

describe('useAdminTab — l’onglet dans l’adresse', () => {
  const IDS = ['activity', 'messages', 'calls'] as const;

  function Probe() {
    const [tab, change] = useAdminTab(IDS, 'activity');
    return (
      <div>
        <p data-tab>{tab}</p>
        <button type="button" data-go="calls" onClick={() => change('calls')} />
        <button type="button" data-go="activity" onClick={() => change('activity')} />
      </div>
    );
  }

  const { Router: ProbeRouter } = createRouter(
    { probe: { pattern: '/probe', screen: async () => ({ default: Probe }) } },
    () => <p>absent</p>,
  );

  const mountProbe = async (url: string) => {
    navigate(url, true);
    const host = await mounter.mount(<ProbeRouter wrap={(children) => children} skeleton={null} />);
    for (let attempt = 0; attempt < 20 && host.querySelector('[data-tab]') === null; attempt += 1) await mounter.settle();
    return host;
  };

  test('un onglet inconnu ou absent retombe sur le défaut — liste blanche', async () => {
    expect((await mountProbe('/probe?tab=inconnu')).querySelector('[data-tab]')?.textContent).toBe('activity');
    mounter.unmountAll();
    expect((await mountProbe('/probe')).querySelector('[data-tab]')?.textContent).toBe('activity');
  });

  test('un onglet valide de l’adresse est lu', async () => {
    expect((await mountProbe('/probe?tab=messages')).querySelector('[data-tab]')?.textContent).toBe('messages');
  });

  test('changer d’onglet écrit ?tab= EN PLACE (aucun retour arrière de plus) ; revenir au défaut l’efface', async () => {
    const host = await mountProbe('/probe?q=x');
    const avant = window.history.length;

    await act(async () => host.querySelector<HTMLButtonElement>('[data-go="calls"]')?.click());
    expect(window.location.search).toBe('?q=x&tab=calls');
    expect(host.querySelector('[data-tab]')?.textContent).toBe('calls');
    expect(window.history.length).toBe(avant);

    await act(async () => host.querySelector<HTMLButtonElement>('[data-go="activity"]')?.click());
    expect(window.location.search).toBe('?q=x');
  });
});
