import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CommentComposer, type CommentComposerResult } from './comment-composer';

/**
 * #8643 (jumelle web de #8642) — **LE REPLI ⌄ VIT DANS LA PLAQUE, À L'ANGLE
 * HAUT-DROIT, ET N'EXISTE QU'EN RÉDACTION** (`StoryComposerFold.offersFoldButton`
 * côté iOS). Le composeur DIT à son hôte quand on écrit (`onWritingChange`) :
 * c'est ce qui fait réduire la scène au-dessus de lui. Replier ou envoyer
 * (hôte `foldOnSend`) rend la lecture.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root !== undefined) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

async function monter(node: React.ReactElement): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  return container;
}

const champ = (host: HTMLElement) => {
  const el = host.querySelector<HTMLTextAreaElement>('[data-comment-field]');
  if (el === null) throw new Error('champ absent');
  return el;
};

async function taper(host: HTMLElement, texte: string): Promise<void> {
  await act(async () => {
    champ(host).value = texte;
    champ(host).dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function entree(host: HTMLElement): Promise<void> {
  await act(async () => {
    champ(host).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  });
}

function hote(props: { readonly writes: boolean[]; readonly result?: CommentComposerResult; readonly foldOnSend?: boolean }) {
  return (
    <section tabIndex={-1} data-hote-fil="">
      <CommentComposer
        language="fr"
        canWrite
        onSend={async () => props.result ?? { ok: true }}
        onWritingChange={(writing) => props.writes.push(writing)}
        {...(props.foldOnSend === true ? { foldOnSend: true } : {})}
      />
    </section>
  );
}

describe('CommentComposer — le repli ⌄ dans la plaque, en rédaction seulement', () => {
  test('au repos, aucun ⌄ : le champ n’est pas en rédaction', async () => {
    const host = await monter(hote({ writes: [] }));
    expect(host.querySelector('[data-comment-fold]')).toBeNull();
  });

  test('le champ pris : le ⌄ paraît DANS la plaque du champ, à l’angle haut-droit, nommé', async () => {
    const writes: boolean[] = [];
    const host = await monter(hote({ writes }));
    await act(async () => champ(host).focus());
    const fold = host.querySelector<HTMLButtonElement>('[data-comment-fold]');
    expect(fold).not.toBeNull();
    expect(fold?.closest('[data-comment-plate]')).toBe(host.querySelector('[data-comment-plate]'));
    expect(champ(host).closest('[data-comment-plate]')).not.toBeNull();
    expect(fold?.style.top).toBe('0px');
    expect(fold?.style.insetInlineEnd).toBe('0px');
    expect(fold?.getAttribute('aria-label')).toBe('Replier la saisie du commentaire');
    expect(writes.at(-1)).toBe(true);
  });

  test('le texte ne passe jamais SOUS le ⌄ : le champ lui réserve sa place', async () => {
    const host = await monter(hote({ writes: [] }));
    await act(async () => champ(host).focus());
    expect(champ(host).style.paddingInlineEnd).toBe('44px');
  });

  test('toucher le ⌄ ne vole pas le focus avant son effet (pointerdown sans défaut)', async () => {
    const host = await monter(hote({ writes: [] }));
    await act(async () => champ(host).focus());
    const down = new Event('pointerdown', { bubbles: true, cancelable: true });
    host.querySelector('[data-comment-fold]')?.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });

  test('replier : la rédaction s’arrête, le ⌄ s’en va, le focus reste dans le fil', async () => {
    const writes: boolean[] = [];
    const host = await monter(hote({ writes }));
    await act(async () => champ(host).focus());
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-fold]')?.click());
    expect(document.activeElement).toBe(host.querySelector('[data-hote-fil]'));
    expect(host.querySelector('[data-comment-fold]')).toBeNull();
    expect(writes.at(-1)).toBe(false);
  });

  test('hôte `foldOnSend` : un envoi réussi rend la lecture', async () => {
    const writes: boolean[] = [];
    const host = await monter(hote({ writes, foldOnSend: true }));
    await act(async () => champ(host).focus());
    await taper(host, 'belle vue');
    await entree(host);
    expect(writes.at(-1)).toBe(false);
    expect(document.activeElement).toBe(host.querySelector('[data-hote-fil]'));
  });

  test('hôte `foldOnSend` : un REFUS garde la rédaction — le texte revient au champ', async () => {
    const writes: boolean[] = [];
    const host = await monter(hote({ writes, foldOnSend: true, result: { ok: false, message: 'comment.send.error' } }));
    await act(async () => champ(host).focus());
    await taper(host, 'belle vue');
    await entree(host);
    expect(writes.at(-1)).toBe(true);
    expect(document.activeElement).toBe(champ(host));
  });

  test('sans `foldOnSend` (détail d’une publication), l’envoi garde le champ : on enchaîne', async () => {
    const host = await monter(hote({ writes: [] }));
    await act(async () => champ(host).focus());
    await taper(host, 'belle vue');
    await entree(host);
    expect(document.activeElement).toBe(champ(host));
  });
});
