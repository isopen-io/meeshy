import { act, useState } from 'react';
import { describe, expect, test } from 'bun:test';

import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminInlineField } from './inline-field';

const { mount } = setupAdminKitTests();

type Commits = string[];

function Host({ initial, commits, kind = 'text' }: { readonly initial: string; readonly commits: Commits; readonly kind?: 'text' | 'date' | 'select' }) {
  const [value, setValue] = useState(initial);
  return (
    <AdminInlineField
      id="pseudo"
      language="fr"
      label="Pseudo"
      value={value}
      kind={kind}
      {...(kind === 'select'
        ? {
            options: [
              { value: 'USER', label: 'Membre' },
              { value: 'ADMIN', label: 'Administrateur' },
            ],
          }
        : {})}
      onCommit={(next) => {
        commits.push(next);
        setValue(next);
      }}
    />
  );
}

const view = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-admin-inline-view="pseudo"]');
const input = (host: ParentNode) => host.querySelector<HTMLInputElement>('[data-admin-inline-input="pseudo"]');

async function edit(host: ParentNode) {
  await act(async () => view(host)?.click());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function typeIn(field: HTMLInputElement | HTMLSelectElement | null, value: string, event: 'input' | 'change' = 'input') {
  await act(async () => {
    if (field === null) return;
    const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, value);
    field.dispatchEvent(new Event(event, { bubbles: true }));
  });
}

async function key(field: HTMLElement | null, name: string) {
  await act(async () => {
    field?.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
  });
}

describe('AdminInlineField — l’information s’édite là où elle s’affiche (#10562)', () => {
  test('au repos : le libellé, la valeur, et un bouton de 44 px nommé « Modifier Pseudo »', async () => {
    const host = await mount(<Host initial="awa" commits={[]} />);
    expect(view(host)?.textContent).toContain('Pseudo');
    expect(view(host)?.textContent).toContain('awa');
    expect(view(host)?.getAttribute('aria-label')).toBe('Modifier Pseudo : awa');
    expect(view(host)?.style.minHeight).toBe('44px');
    expect(input(host)).toBeNull();
  });

  test('une valeur vide se dit « Non renseigné », jamais un trou', async () => {
    const host = await mount(<Host initial="" commits={[]} />);
    expect(view(host)?.textContent).toContain('Non renseigné');
  });

  test('un clic ouvre le champ, déjà rempli et focalisé', async () => {
    const host = await mount(<Host initial="awa" commits={[]} />);
    await edit(host);
    expect(input(host)?.value).toBe('awa');
    expect(document.activeElement).toBe(input(host));
    expect(view(host)).toBeNull();
  });

  test('Entrée valide : la valeur NETTOYÉE part une fois, et la zone redevient lisible', async () => {
    const commits: Commits = [];
    const host = await mount(<Host initial="awa" commits={commits} />);
    await edit(host);
    await typeIn(input(host), '  awa_diop  ');
    await key(input(host), 'Enter');
    expect(commits).toEqual(['awa_diop']);
    expect(view(host)?.textContent).toContain('awa_diop');
  });

  test('quitter le champ valide (perte du focus), une seule fois', async () => {
    const commits: Commits = [];
    const host = await mount(<Host initial="awa" commits={commits} />);
    await edit(host);
    await typeIn(input(host), 'awa2');
    await act(async () => input(host)?.blur());
    expect(commits).toEqual(['awa2']);
    expect(input(host)).toBeNull();
  });

  test('Échap annule : rien ne part, la valeur d’avant revient', async () => {
    const commits: Commits = [];
    const host = await mount(<Host initial="awa" commits={commits} />);
    await edit(host);
    await typeIn(input(host), 'autre');
    await key(input(host), 'Escape');
    expect(commits).toEqual([]);
    expect(view(host)?.textContent).toContain('awa');
  });

  test('une valeur inchangée ne part pas — aucune écriture pour rien', async () => {
    const commits: Commits = [];
    const host = await mount(<Host initial="awa" commits={commits} />);
    await edit(host);
    await key(input(host), 'Enter');
    expect(commits).toEqual([]);
  });

  test('une date : un champ date, valide comme un texte', async () => {
    const commits: Commits = [];
    const host = await mount(<Host initial="1990-03-12" commits={commits} kind="date" />);
    await edit(host);
    expect(input(host)?.type).toBe('date');
    await typeIn(input(host), '1991-04-01');
    await key(input(host), 'Enter');
    expect(commits).toEqual(['1991-04-01']);
  });

  test('une liste : le libellé du choix au repos, et choisir valide aussitôt', async () => {
    const commits: Commits = [];
    const host = await mount(<Host initial="USER" commits={commits} kind="select" />);
    expect(view(host)?.textContent).toContain('Membre');
    await edit(host);
    const select = host.querySelector<HTMLSelectElement>('select[data-admin-inline-input="pseudo"]');
    expect(document.activeElement).toBe(select);
    await typeIn(select, 'ADMIN', 'change');
    expect(commits).toEqual(['ADMIN']);
    expect(view(host)?.textContent).toContain('Administrateur');
  });

  test('un refus se dit en alerte sous la zone ; en cours, la zone le dit et ne s’ouvre pas', async () => {
    const host = await mount(
      <>
        <AdminInlineField id="a" language="fr" label="Nom" value="Diop" status={{ phase: 'error', message: 'Pseudo déjà pris' }} onCommit={() => undefined} />
        <AdminInlineField id="b" language="fr" label="Prénom" value="Awa" status={{ phase: 'saving' }} onCommit={() => undefined} />
      </>,
    );
    expect(host.querySelector('[data-admin-inline="a"] [role="alert"]')?.textContent).toBe('Pseudo déjà pris');
    const saving = host.querySelector<HTMLButtonElement>('[data-admin-inline-view="b"]');
    expect(saving?.getAttribute('aria-busy')).toBe('true');
    expect(saving?.disabled).toBe(true);
  });

  test('en lecture seule (aucun droit d’écrire), la valeur se lit sans bouton', async () => {
    const host = await mount(<AdminInlineField id="c" language="fr" label="Nom" value="Diop" readOnly onCommit={() => undefined} />);
    expect(host.querySelector('[data-admin-inline-view="c"]')).toBeNull();
    expect(host.querySelector('[data-admin-inline="c"]')?.textContent).toContain('Diop');
  });
});
