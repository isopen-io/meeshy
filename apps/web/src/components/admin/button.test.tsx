import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { SectionButton } from '@/routes/admin-member-parts';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminButton } from './button';

const { mount } = setupAdminKitTests();

const buttonOf = (host: HTMLElement) => host.querySelector('button') as HTMLButtonElement;

describe('AdminButton — le bouton commun de l’administration', () => {
  test('l’action principale est un APLAT de la marque : aucun dégradé, 44 px', async () => {
    const host = await mount(<AdminButton tone="primary">Enregistrer</AdminButton>);
    const style = buttonOf(host).style;
    expect(style.backgroundColor).toBe('var(--color-ios-brand)');
    expect(style.backgroundImage).toBe('');
    expect(style.cssText).not.toContain('gradient');
    expect(style.minHeight).toBe('44px');
    expect(buttonOf(host).className).toContain('text-ios-on-brand');
  });

  test('secondaire et danger : une surface bordée, le danger porte le ton du danger', async () => {
    const host = await mount(
      <>
        <AdminButton>Annuler</AdminButton>
        <AdminButton tone="danger">Fermer le lien</AdminButton>
      </>,
    );
    const [secondary, danger] = [...host.querySelectorAll('button')];
    expect(secondary?.style.color).toBe('var(--color-ios-ink)');
    expect(danger?.style.color).toBe('var(--color-danger)');
    for (const button of [secondary, danger]) expect(button?.style.minHeight).toBe('44px');
  });

  test('désactivé ou occupé : le bouton ne part pas, et l’occupation se dit', async () => {
    let clicks = 0;
    const host = await mount(
      <>
        <AdminButton disabled onClick={() => (clicks += 1)}>A</AdminButton>
        <AdminButton busy onClick={() => (clicks += 1)}>B</AdminButton>
      </>,
    );
    const [disabled, busy] = [...host.querySelectorAll('button')];
    await act(async () => disabled?.click());
    await act(async () => busy?.click());
    expect(clicks).toBe(0);
    expect(busy?.getAttribute('aria-busy')).toBe('true');
    expect(disabled?.getAttribute('aria-busy')).toBe('false');
  });

  test('le clic est remonté, les ancres de recette et le nom accessible sont posés', async () => {
    let clicks = 0;
    const host = await mount(
      <AdminButton data={{ 'data-admin-create-open': '' }} label="Créer un compte" onClick={() => (clicks += 1)}>
        +
      </AdminButton>,
    );
    await act(async () => buttonOf(host).click());
    expect(clicks).toBe(1);
    expect(buttonOf(host).hasAttribute('data-admin-create-open')).toBe(true);
    expect(buttonOf(host).getAttribute('aria-label')).toBe('Créer un compte');
  });
});

describe('SectionButton — les gestes des fiches de membre passent par le bouton commun', () => {
  test('« primary » n’a plus de dégradé : le texte blanc tient son contraste', async () => {
    const host = await mount(<SectionButton tone="primary" data={{ 'data-admin-create-open': '' }}>Créer un compte</SectionButton>);
    expect(buttonOf(host).style.backgroundColor).toBe('var(--color-ios-brand)');
    expect(buttonOf(host).style.cssText).not.toContain('gradient');
    expect(buttonOf(host).hasAttribute('data-admin-create-open')).toBe(true);
  });
});
