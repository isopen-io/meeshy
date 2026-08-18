/**
 * Un `<label for>` qui ne désigne rien n'est pas un label.
 *
 * Le formulaire de jonction anonyme portait `htmlFor="language"` au-dessus d'un
 * `Select` Radix : le déclencheur est un `<button>` dont Radix génère l'`id`, si
 * bien que l'attribut visait un élément inexistant. Chrome le signale
 * (« The label's for attribute doesn't match any element id », une ressource, vu
 * le 2026-08-18) et les conséquences sont réelles : le clic sur le libellé ne
 * donne pas le focus au champ, l'autofill ne sait pas ce qu'il remplit, et un
 * lecteur d'écran annonce un contrôle sans nom.
 *
 * C'est le premier écran que voit quelqu'un qui arrive par lien — la population
 * pour laquelle le web est fait. La garde porte sur TOUS les labels du
 * formulaire, pas sur le seul qui était cassé : la même erreur se réintroduit
 * au prochain champ ajouté.
 *
 * @jest-environment jsdom
 */

import { render } from '@testing-library/react';
import React from 'react';
import { AnonymousForm } from '@/components/join/AnonymousForm';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

const formData = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  username: 'ada',
  email: 'ada@example.com',
  birthday: '1815-12-10',
  language: 'fr',
};

function renderForm(overrides: Record<string, unknown> = {}) {
  return render(
    <AnonymousForm
      formData={formData}
      usernameCheckStatus={{ isChecking: false, isAvailable: true, message: '' }}
      requireNickname
      requireEmail
      requireBirthday
      isJoining={false}
      onUpdateForm={jest.fn()}
      onSubmit={jest.fn()}
      onCancel={jest.fn()}
      {...overrides}
    />
  );
}

function danglingLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('label[for]'))
    .map((label) => label.getAttribute('for') as string)
    .filter((id) => container.querySelector(`#${CSS.escape(id)}`) === null);
}

describe('chaque libellé désigne un champ qui existe', () => {
  it('ne laisse aucun `for` orphelin avec tous les champs demandés', () => {
    const { container } = renderForm();
    expect(danglingLabels(container)).toEqual([]);
  });

  /**
   * Les champs sont conditionnels : la variante minimale rend d'autres branches
   * et doit tenir la même règle.
   */
  it('ne laisse aucun `for` orphelin quand rien n’est obligatoire', () => {
    const { container } = renderForm({
      requireNickname: false,
      requireEmail: false,
      requireBirthday: false,
    });
    expect(danglingLabels(container)).toEqual([]);
  });

  /** Le champ qui était cassé, nommé explicitement pour que l'échec soit lisible. */
  it('associe le libellé de langue au déclencheur du sélecteur', () => {
    const { container } = renderForm();
    const label = container.querySelector('label[for="language"]');

    expect(label).not.toBeNull();
    expect(container.querySelector('#language')).not.toBeNull();
  });
});
