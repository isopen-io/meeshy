import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConfirmDialog } from './confirm-dialog';

/**
 * **LA CONFIRMATION UNIQUE** (revue-correction #6149) — voir le doc-comment
 * de `confirm-dialog.tsx`. Ce témoin mesure ce qu'un écran qui la monte
 * reçoit : une modale NOMMÉE et DÉCRITE, deux gestes qui appellent chacun
 * leur rappel, et un geste destructif lisible dans les deux schémas.
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

const mountDialog = async (over: { readonly onConfirm?: () => void; readonly onCancel?: () => void } = {}) =>
  mounter.mount(
    <ConfirmDialog
      name="probe"
      title="Supprimer la story ?"
      body="Cette action est définitive."
      cancelLabel="Annuler"
      confirmLabel="Supprimer"
      tone="destructive"
      onConfirm={over.onConfirm ?? (() => undefined)}
      onCancel={over.onCancel ?? (() => undefined)}
    />,
  );

describe('ConfirmDialog — une modale nommée, deux gestes, un effet chacun', () => {
  test('la modale porte son NOM et sa DESCRIPTION par leurs identifiants', async () => {
    const host = await mountDialog();
    const dialog = host.querySelector<HTMLDialogElement>('dialog[data-confirm-dialog="probe"]');
    expect(dialog).not.toBeNull();
    const titleId = dialog?.getAttribute('aria-labelledby') ?? '';
    const bodyId = dialog?.getAttribute('aria-describedby') ?? '';
    expect(host.querySelector(`[id="${titleId}"]`)?.textContent).toBe('Supprimer la story ?');
    expect(host.querySelector(`[id="${bodyId}"]`)?.textContent).toBe('Cette action est définitive.');
  });

  test('« Supprimer » appelle onConfirm, et SEULEMENT lui', async () => {
    const calls: string[] = [];
    const host = await mountDialog({ onConfirm: () => calls.push('confirm'), onCancel: () => calls.push('cancel') });
    host.querySelector<HTMLButtonElement>('[data-confirm="confirm"]')?.click();
    expect(calls).toEqual(['confirm']);
  });

  test('« Annuler » appelle onCancel', async () => {
    const calls: string[] = [];
    const host = await mountDialog({ onConfirm: () => calls.push('confirm'), onCancel: () => calls.push('cancel') });
    host.querySelector<HTMLButtonElement>('[data-confirm="cancel"]')?.click();
    expect(calls[0]).toBe('cancel');
    expect(calls).not.toContain('confirm');
  });

  /**
   * **LE GESTE DESTRUCTIF S'ÉCRIT EN ROUGE SUR LA CARTE, JAMAIS EN BLANC SUR
   * DU ROUGE** — c'est la forme de l'alerte iOS (`.destructive` : texte
   * rouge), et c'est la seule qui tienne AA dans les deux schémas : du blanc
   * sur `--color-danger` sombre (#f45b5b) ne contraste qu'à 3,2:1.
   */
  test('le geste destructif est un TEXTE couleur erreur, sans aplat plein', async () => {
    const host = await mountDialog();
    const confirm = host.querySelector<HTMLButtonElement>('[data-confirm="confirm"]');
    expect(confirm?.style.color).toBe('var(--color-error)');
    expect(confirm?.style.backgroundColor ?? '').not.toContain('--color-error');
  });

  test('les deux gestes offrent une cible de 44 px au moins', async () => {
    const host = await mountDialog();
    for (const action of ['cancel', 'confirm']) {
      const button = host.querySelector<HTMLButtonElement>(`[data-confirm="${action}"]`);
      expect(Number.parseInt(button?.style.minHeight ?? '0', 10)).toBeGreaterThanOrEqual(44);
    }
  });
});
