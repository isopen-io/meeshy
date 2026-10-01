import { act, useState } from 'react';
import { describe, expect, test } from 'bun:test';

import { setupAdminKitTests } from '@/test-support/admin-harness';
import { typeInto } from '@/test-support/act-mount';
import { createRouter, navigate } from '@/lib/router';

import { AdminFilterChips, AdminListToolbar } from './list-toolbar';
import { AdminSortControl } from './sort-control';
import { AdminTabPanel, AdminTabs, adminTabId, adminTabPanelId, useAdminTab } from './tabs';
import { AdminPager } from '@/routes/admin-table';

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

describe('AdminListToolbar — un tri n’est pas un filtre posé', () => {
  const sort = {
    id: 'sort',
    label: 'Trier par',
    value: 'createdAt',
    defaultValue: 'createdAt',
    options: [{ value: 'createdAt', label: 'Inscription' }, { value: 'username', label: 'Pseudonyme' }],
    onChange: () => undefined,
  };

  test('une valeur égale à son état de repos ne fait pas apparaître « Réinitialiser » — un bouton qui ne change rien n’a pas à être là', async () => {
    const host = await mount(<AdminListToolbar language="fr" filters={[sort]} onReset={() => undefined} />);
    expect(host.querySelector('[data-admin-list-reset]')).toBeNull();
  });

  test('une valeur DIFFÉRENTE de l’état de repos, elle, le fait apparaître', async () => {
    const host = await mount(<AdminListToolbar language="fr" filters={[{ ...sort, value: 'username' }]} onReset={() => undefined} />);
    expect(host.querySelector('[data-admin-list-reset]')).not.toBeNull();
  });

  test('sans defaultValue, le repos est « vide » comme avant', async () => {
    const { defaultValue: _repos, ...plain } = sort;
    const host = await mount(<AdminListToolbar language="fr" filters={[plain]} onReset={() => undefined} />);
    expect(host.querySelector('[data-admin-list-reset]')).not.toBeNull();
  });
});

describe('AdminSortControl — le tri des cartes', () => {
  const options = [{ value: 'createdAt', label: 'Inscription' }, { value: 'username', label: 'Pseudonyme' }];

  test('un « Trier par » étiqueté, et un bouton d’ordre de 44 px qui dit l’ordre courant', async () => {
    const host = await mount(<AdminSortControl language="fr" options={options} sort="createdAt" order="desc" onSort={() => undefined} />);
    expect(host.querySelector('label')?.textContent).toContain('Trier par');
    expect(host.querySelector<HTMLSelectElement>('[data-admin-sort-select]')?.style.minHeight).toBe('44px');
    const button = host.querySelector<HTMLButtonElement>('[data-admin-sort-direction]');
    expect(button?.style.minHeight).toBe('44px');
    expect(button?.getAttribute('aria-label')).toBe('Inverser l’ordre du tri (actuellement : Décroissant)');
  });

  test('choisir une AUTRE clé la remonte ; choisir la même ne remonte rien ; le bouton remonte la clé COURANTE (inversion)', async () => {
    const choix: string[] = [];
    function Stateful() {
      const [sort, setSort] = useState('createdAt');
      return (
        <AdminSortControl
          language="fr"
          options={options}
          sort={sort}
          order="asc"
          onSort={(key) => {
            choix.push(key);
            setSort(key);
          }}
        />
      );
    }
    const host = await mount(<Stateful />);
    const select = host.querySelector<HTMLSelectElement>('[data-admin-sort-select]');

    typeInto(select, 'createdAt');
    typeInto(select, 'username');
    await act(async () => host.querySelector<HTMLButtonElement>('[data-admin-sort-direction]')?.click());

    expect(choix).toEqual(['username', 'username']);
  });

  test('sans colonne triable, rien n’est dessiné — un contrôle sans effet est interdit', async () => {
    const host = await mount(<AdminSortControl language="fr" options={[]} sort="" order="asc" onSort={() => undefined} />);
    expect(host.querySelector('[data-admin-sort-control]')).toBeNull();
  });

  test('il se dit dans la langue du lecteur', async () => {
    const { loadAdminInterfaceCatalog } = await import('@/lib/i18n-admin-catalog');
    await loadAdminInterfaceCatalog('es');
    const host = await mount(<AdminSortControl language="es" options={options} sort="createdAt" order="asc" onSort={() => undefined} />);
    expect(host.querySelector('label')?.textContent).toContain('Ordenar por');
  });
});

describe('AdminPager — tient dans 375 px', () => {
  test('le groupe de contrôles passe à la ligne, et chaque contrôle fait 44 px', async () => {
    const host = await mount(
      <AdminPager language="fr" offset={20} limit={20} count={20} total={57} hasMore pageSizes={[20, 50, 100]} onPage={() => undefined} />,
    );
    const controls = host.querySelector('[data-admin-page-size]')?.closest('div');

    expect(controls?.className).toContain('flex-wrap');
    expect(host.querySelector<HTMLSelectElement>('[data-admin-page-size]')?.style.minHeight).toBe('44px');
    expect(host.querySelector<HTMLButtonElement>('[data-admin-list-prev]')?.style.minHeight).toBe('44px');
    expect(host.querySelector<HTMLButtonElement>('[data-admin-list-next]')?.style.minHeight).toBe('44px');
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

  test('les flèches ne s’inversent JAMAIS : l’administration est à l’endroit même dans une interface arabe', async () => {
    document.documentElement.dir = 'rtl';
    try {
      const host = await mount(<Harness start="messages" />);
      await press(host, 1, 'ArrowRight');
      expect(roles(host)[2]?.getAttribute('aria-selected')).toBe('true');
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

describe('AdminTabs — le lien onglet ↔ panneau', () => {
  const tabs = [{ id: 'activity', label: 'Activité' }, { id: 'messages', label: 'Messages' }, { id: 'calls', label: 'Appels' }] as const;
  type TabId = (typeof tabs)[number]['id'];

  function Linked({ idBase }: { readonly idBase?: string }) {
    const [active, setActive] = useState<TabId>('activity');
    return (
      <div>
        <AdminTabs label="Statistiques" tabs={tabs} active={active} onChange={setActive} {...(idBase === undefined ? {} : { idBase })} />
        <AdminTabPanel idBase={idBase ?? 'absent'} tab={active}>
          <p data-body>{active}</p>
        </AdminTabPanel>
      </div>
    );
  }

  const roles = (host: Element) => [...host.querySelectorAll<HTMLElement>('[role="tab"]')];

  test('chaque onglet porte un identifiant ET aria-controls vers le panneau de son onglet', async () => {
    const host = await mount(<Linked idBase="stats" />);
    expect(roles(host).map((tab) => [tab.id, tab.getAttribute('aria-controls')])).toEqual(
      tabs.map(({ id }) => [adminTabId('stats', id), adminTabPanelId('stats', id)]),
    );
  });

  test('le panneau actif est un tabpanel nommé par SON onglet, et cet onglet existe', async () => {
    const host = await mount(<Linked idBase="stats" />);
    const panel = host.querySelector('[role="tabpanel"]');
    expect(panel?.id).toBe(roles(host)[0]?.getAttribute('aria-controls'));
    expect(panel?.getAttribute('aria-labelledby')).toBe(roles(host)[0]?.id);
    expect(host.querySelector(`#${panel?.getAttribute('aria-labelledby')}`)?.getAttribute('role')).toBe('tab');
  });

  test('changer d’onglet déplace le panneau : son nom et son contenu suivent', async () => {
    const host = await mount(<Linked idBase="stats" />);
    await act(async () => roles(host)[2]?.click());
    const panel = host.querySelector('[role="tabpanel"]');
    expect(panel?.getAttribute('aria-labelledby')).toBe(adminTabId('stats', 'calls'));
    expect(panel?.querySelector('[data-body]')?.textContent).toBe('calls');
    expect(host.querySelectorAll('[role="tabpanel"]').length).toBe(1);
  });

  test('sans base fournie, l’onglet reçoit quand même une base propre — jamais deux listes aux mêmes identifiants', async () => {
    const host = await mount(
      <div>
        <AdminTabs label="A" tabs={tabs} active="activity" onChange={() => undefined} />
        <AdminTabs label="B" tabs={tabs} active="activity" onChange={() => undefined} />
      </div>,
    );
    const ids = roles(host).map((tab) => tab.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id !== '' && !id.startsWith('undefined'))).toBe(true);
  });

  test('une flèche déplace aussi le FOCUS sur l’onglet ouvert — le clavier ne perd pas sa place', async () => {
    const host = await mount(<Linked idBase="stats" />);
    roles(host)[0]?.focus();
    await act(async () => {
      roles(host)[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
    });
    expect(document.activeElement?.id).toBe(adminTabId('stats', 'calls'));
    await act(async () => {
      roles(host)[2]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    });
    expect(document.activeElement?.id).toBe(adminTabId('stats', 'activity'));
  });

  test('l’ancre de recette `data-<anchor>` s’ajoute à `data-admin-tab`, sans la remplacer', async () => {
    const host = await mount(<AdminTabs label="Fiche" tabs={tabs} active="messages" onChange={() => undefined} idBase="fiche" anchor="admin-user-tab" />);
    const second = roles(host)[1];
    expect(second?.getAttribute('data-admin-tab')).toBe('messages');
    expect(second?.getAttribute('data-admin-user-tab')).toBe('messages');
  });

  test('l’onglet actif est ramené dans la liste seulement s’il en sort — aucun saut de page sinon', async () => {
    const scrolled: string[] = [];
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = function scrollIntoViewSpy(this: HTMLElement) {
      scrolled.push(this.id);
    };
    try {
      const host = await mount(<Linked idBase="stats" />);
      expect(scrolled).toEqual([]);
      const strip = host.querySelector<HTMLElement>('[role="tablist"]');
      Object.defineProperty(strip, 'clientWidth', { configurable: true, value: 100 });
      for (const tab of roles(host)) {
        Object.defineProperty(tab, 'offsetLeft', { configurable: true, value: roles(host).indexOf(tab) * 200 });
        Object.defineProperty(tab, 'offsetWidth', { configurable: true, value: 200 });
      }
      await act(async () => roles(host)[2]?.click());
      expect(scrolled).toEqual([adminTabId('stats', 'calls')]);
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
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
