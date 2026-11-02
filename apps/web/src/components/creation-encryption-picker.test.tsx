import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { CreationEncryptionMode } from '@meeshy/shared/utils/conversation-creation-encryption';
import { chosenCreationMode, webCreationEncryptionOffer } from '@/lib/conversation-new/encryption';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CreationEncryptionPicker } from './creation-encryption-picker';

/**
 * **LE CHOIX DU CHIFFREMENT À L'ÉCRAN DE CRÉATION** (décision du 2026-11-01) —
 * ce que la personne VOIT selon son rôle et le type de conversation, ce qu'elle
 * peut toucher, et ce qu'un lecteur d'écran en entend : un groupe de boutons
 * radio nommé « Chiffrement », un mode par ligne, sa phrase en description.
 */
const globals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

let container: HTMLDivElement;
let root: Root;
let picks: CreationEncryptionMode[] = [];

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/conversations/new' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  picks = [];
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

function Host(props: { readonly platformRole: string | null; readonly conversationType: 'direct' | 'group' }) {
  const [picked, setPicked] = useState<CreationEncryptionMode | null>(null);
  const offer = webCreationEncryptionOffer(props);
  return (
    <CreationEncryptionPicker
      offer={offer}
      selected={chosenCreationMode(offer, picked)}
      onSelect={(mode) => {
        picks.push(mode);
        setPicked(mode);
      }}
    />
  );
}

const mount = async (props: { readonly platformRole: string | null; readonly conversationType: 'direct' | 'group' }) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Host {...props} />);
  });
  for (let tries = 0; tries < 50 && document.querySelector('[data-creation-encryption]') === null; tries += 1) await settle();
};

const radio = (mode: CreationEncryptionMode) => document.querySelector<HTMLInputElement>(`input[type="radio"][value="${mode}"]`);
const offered = () => [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map((input) => input.value);
const describedText = (input: HTMLInputElement | null) =>
  (input?.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter((id) => id !== '')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
const labelOf = (input: HTMLInputElement | null) => {
  const id = input?.getAttribute('aria-labelledby') ?? '';
  return id === '' ? '' : (document.getElementById(id)?.textContent ?? '');
};

describe('un groupe de boutons radio nommé « Chiffrement »', () => {
  test('nommé par sa légende, et chaque mode par son libellé', async () => {
    await mount({ platformRole: 'USER', conversationType: 'direct' });
    expect(document.querySelector('fieldset[data-creation-encryption] legend')?.textContent).toBe('Chiffrement');
    expect(labelOf(radio('server'))).toBe('Serveur');
    expect(labelOf(radio('hybrid'))).toBe('Hybride');
    expect(new Set([...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map((input) => input.name)).size).toBe(1);
  });

  test('chaque mode porte sa phrase en description', async () => {
    await mount({ platformRole: 'USER', conversationType: 'direct' });
    expect(describedText(radio('server'))).toBe('Vos messages sont chiffrés sur nos serveurs. Traduction, transcription et recherche fonctionnent.');
    expect(describedText(radio('hybrid'))).toBe('Chiffré sur nos serveurs, comme Serveur. Le double chiffrement par vos appareils arrive bientôt.');
  });

  test('le pied du choix dit que le bout en bout ne se désactive jamais, et qu’une autre conversation reste possible', async () => {
    await mount({ platformRole: 'USER', conversationType: 'group' });
    expect(document.querySelector('[data-creation-encryption-footer]')?.textContent).toBe(
      'Le chiffrement de bout en bout ne se désactive jamais. Vous pourrez toujours ouvrir une autre conversation, sans chiffrement de bout en bout, avec les mêmes personnes.',
    );
  });
});

describe('ce qui est offert, rôle par rôle', () => {
  test('un utilisateur ordinaire : Serveur et Hybride, Serveur coché', async () => {
    await mount({ platformRole: 'USER', conversationType: 'direct' });
    expect(offered()).toEqual(['server', 'hybrid']);
    expect(radio('server')?.checked).toBe(true);
    expect(radio('hybrid')?.checked).toBe(false);
  });

  test('sans rôle servi (en vol, refus, panne) : rien de plus qu’un utilisateur ordinaire', async () => {
    await mount({ platformRole: null, conversationType: 'direct' });
    expect(offered()).toEqual(['server', 'hybrid']);
  });

  test('ANALYST, tête-à-tête : « Bout en bout » paraît, grisé, « Bientôt disponible sur le web »', async () => {
    await mount({ platformRole: 'ANALYST', conversationType: 'direct' });
    expect(offered()).toEqual(['server', 'hybrid', 'e2ee']);
    expect(labelOf(radio('e2ee'))).toBe('Bout en bout');
    expect(radio('e2ee')?.disabled).toBe(true);
    expect(describedText(radio('e2ee'))).toBe('Bientôt disponible sur le web');
    expect(radio('server')?.checked).toBe(true);
  });

  test('ADMIN, groupe : « Bientôt disponible pour les groupes »', async () => {
    await mount({ platformRole: 'ADMIN', conversationType: 'group' });
    expect(radio('e2ee')?.disabled).toBe(true);
    expect(describedText(radio('e2ee'))).toBe('Bientôt disponible pour les groupes');
  });
});

describe('toucher un mode le choisit', () => {
  test('Hybride se coche, Serveur se décoche', async () => {
    await mount({ platformRole: 'USER', conversationType: 'direct' });
    await act(async () => {
      radio('hybrid')?.click();
    });
    await settle();
    expect(picks).toEqual(['hybrid']);
    expect(radio('hybrid')?.checked).toBe(true);
    expect(radio('server')?.checked).toBe(false);
  });

  test('un mode grisé ne se choisit pas', async () => {
    await mount({ platformRole: 'ANALYST', conversationType: 'direct' });
    await act(async () => {
      radio('e2ee')?.click();
    });
    await settle();
    expect(picks).toEqual([]);
    expect(radio('server')?.checked).toBe(true);
  });
});
