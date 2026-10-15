import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { createActMounter, typeInto } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConversationRenameDialog } from './conversation-rename-dialog';

/**
 * RENOMMER UNE CONVERSATION POUR SOI (#10593) — le champ porte le nom
 * personnel, le nom d'origine en indice ; vide, il rend ce nom d'origine.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const mount = async (customName: string | undefined) => {
  const saved: (string | null)[] = [];
  const cancelled: number[] = [];
  const host = await mounter.mount(
    <ConversationRenameDialog
      language="fr"
      customName={customName}
      originalName="Équipe Lyon"
      onSave={(name) => saved.push(name)}
      onCancel={() => cancelled.push(1)}
    />,
  );
  return { host, saved, cancelled };
};

const submit = (host: ParentNode) =>
  act(() => {
    host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });

describe('ConversationRenameDialog', () => {
  test('nommée « Renommer la conversation », le champ porte le nom personnel et le nom d’origine en indice', async () => {
    const { host } = await mount('Les copains');
    const dialog = host.querySelector('dialog[data-rename-dialog]');
    const titleId = dialog?.getAttribute('aria-labelledby') ?? '';
    expect(host.querySelector(`[id="${titleId}"]`)?.textContent).toBe('Renommer la conversation');
    const input = host.querySelector<HTMLInputElement>('input');
    expect(input?.value).toBe('Les copains');
    expect(input?.placeholder).toBe('Équipe Lyon');
    expect(host.textContent).toContain('Laissez vide pour lui rendre son nom d’origine.');
  });

  test('un nom saisi part ROGNÉ', async () => {
    const { host, saved } = await mount(undefined);
    typeInto(host.querySelector('input'), '  Famille  ');
    submit(host);
    expect(saved).toEqual(['Famille']);
  });

  test('vide (ou blanc) rend le nom d’origine : `null`', async () => {
    const { host, saved } = await mount('Les copains');
    typeInto(host.querySelector('input'), '   ');
    submit(host);
    expect(saved).toEqual([null]);
  });

  test('« Annuler » ne sauve rien', async () => {
    const { host, saved, cancelled } = await mount('Les copains');
    act(() => host.querySelector<HTMLButtonElement>('[data-rename="cancel"]')?.click());
    expect(saved).toEqual([]);
    expect(cancelled).toEqual([1]);
  });
});
