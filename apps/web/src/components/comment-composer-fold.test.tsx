import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CommentComposer, type CommentComposerResult } from './comment-composer';

/**
 * #8643 (jumelle web de #8642), #9122, puis #9894 (jumelle de #9893) — **LE
 * CHEVRON ⌄ VIT TOUT À DROITE DU COMPOSEUR, APRÈS L'ENVOI, TOUJOURS VISIBLE** ;
 * il retire le focus du champ (le clavier se ferme) et réduit la barre à une
 * bulle de commentaire, qui la rouvre SANS rendre le focus au champ. Le
 * composeur DIT à son hôte quand on écrit (`onWritingChange`) et quand il se
 * replie (`onFoldChange`). Replier ou envoyer (hôte `foldOnSend`) rend la
 * lecture.
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

describe('CommentComposer — le repli ⌄ tout à droite, toujours visible (#9122, #9894)', () => {
  test('au repos, le ⌄ est DÉJÀ là, ouvert : la barre dit qu’elle se replie', async () => {
    const host = await monter(hote({ writes: [] }));
    const fold = host.querySelector<HTMLButtonElement>('[data-comment-fold]');
    expect(fold).not.toBeNull();
    expect(fold?.getAttribute('aria-expanded')).toBe('true');
    expect(fold?.getAttribute('aria-controls')).toBe(host.querySelector('[data-comment-composer-body]')?.id ?? 'absent');
  });

  test('toucher le ⌄ replie la barre en UNE icône de commentaire ; la toucher la rouvre, brouillon conservé', async () => {
    const host = await monter(hote({ writes: [] }));
    await taper(host, 'mon brouillon');
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-fold]')?.click());
    expect(champ(host).closest('.hidden')).not.toBeNull();
    expect(host.querySelector('[data-comment-fold]')).toBeNull();
    const unfold = host.querySelector<HTMLButtonElement>('[data-comment-unfold]');
    expect(unfold?.getAttribute('aria-label')).toBe('Afficher la saisie du commentaire');
    expect(unfold?.querySelector('[data-glyph="chatCircle"]')).not.toBeNull();
    expect(unfold?.getAttribute('aria-expanded')).toBe('false');
    await act(async () => unfold?.click());
    expect(champ(host).value).toBe('mon brouillon');
  });

  test('rouvrir la bulle NE DONNE PAS le focus au champ (aucun clavier) : il va au ⌄, au clavier physique on enchaîne', async () => {
    const host = await monter(hote({ writes: [] }));
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-fold]')?.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-unfold]')?.click());
    await act(async () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
    expect(document.activeElement).not.toBe(champ(host));
    expect(document.activeElement).toBe(host.querySelector('[data-comment-fold]'));
  });

  test('le composeur dit à son hôte quand il se replie et quand il se rouvre', async () => {
    const folds: boolean[] = [];
    const host = await monter(<CommentComposer language="fr" canWrite onSend={async () => ({ ok: true })} onFoldChange={(folded) => folds.push(folded)} />);
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-fold]')?.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-unfold]')?.click());
    expect(folds).toEqual([false, true, false]);
  });

  test('une réponse rouvre une barre repliée : sa bannière vit dedans', async () => {
    const node = (replyTo: { commentId: string; rootId: string; authorName: string; excerpt: null; mention: null } | null) => (
      <CommentComposer language="fr" canWrite onSend={async () => ({ ok: true })} replyTo={replyTo} />
    );
    const host = await monter(node(null));
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-fold]')?.click());
    expect(host.querySelector('[data-comment-unfold]')).not.toBeNull();
    await act(async () => root?.render(node({ commentId: 'c1', rootId: 'c1', authorName: 'Noa', excerpt: null, mention: null })));
    expect(host.querySelector('[data-comment-unfold]')).toBeNull();
    expect(host.querySelector('[data-comment-reply-banner]')).not.toBeNull();
  });

  test('le champ pris : le ⌄ reste là, TOUT À DROITE du composeur — après l’envoi, dernier de sa rangée, nommé, 44 px', async () => {
    const writes: boolean[] = [];
    const host = await monter(hote({ writes }));
    await act(async () => champ(host).focus());
    const fold = host.querySelector<HTMLButtonElement>('[data-comment-fold]');
    const send = host.querySelector<HTMLButtonElement>('[data-comment-send]');
    expect(fold).not.toBeNull();
    expect(fold?.closest('[data-comment-plate]')).toBeNull();
    expect(fold?.parentElement).toBe(send?.parentElement ?? null);
    expect(fold?.parentElement?.lastElementChild).toBe(fold);
    expect(fold?.getAttribute('aria-label')).toBe('Replier la saisie du commentaire');
    expect(fold?.style.width).toBe('44px');
    expect(fold?.style.height).toBe('44px');
    expect(writes.at(-1)).toBe(true);
  });

  test('champ vide ou rempli, le ⌄ ne disparaît jamais', async () => {
    const host = await monter(hote({ writes: [] }));
    await act(async () => champ(host).focus());
    await taper(host, 'texte');
    expect(host.querySelector('[data-comment-fold]')).not.toBeNull();
    await taper(host, '');
    expect(host.querySelector('[data-comment-fold]')).not.toBeNull();
  });

  test('toucher le ⌄ ne vole pas le focus avant son effet (pointerdown sans défaut)', async () => {
    const host = await monter(hote({ writes: [] }));
    await act(async () => champ(host).focus());
    const down = new Event('pointerdown', { bubbles: true, cancelable: true });
    host.querySelector('[data-comment-fold]')?.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });

  test('replier : la rédaction s’arrête, la barre se réduit à son icône, le focus reste dans le fil', async () => {
    const writes: boolean[] = [];
    const host = await monter(hote({ writes }));
    await act(async () => champ(host).focus());
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-fold]')?.click());
    expect(document.activeElement).toBe(host.querySelector('[data-hote-fil]'));
    expect(host.querySelector('[data-comment-fold]')).toBeNull();
    expect(host.querySelector('[data-comment-unfold]')).not.toBeNull();
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

  test('en réponse, la liste s’efface mais la CIBLE reste lisible : son extrait tient sur trois lignes, pas une', async () => {
    const host = await monter(
      <CommentComposer
        language="fr"
        canWrite
        onSend={async () => ({ ok: true })}
        replyTo={{ commentId: 'c1', rootId: 'c1', authorName: 'Noa', excerpt: 'Un long commentaire auquel on répond.', mention: null }}
      />,
    );
    const extrait = host.querySelector<HTMLElement>('[data-comment-reply-excerpt]');
    expect(extrait?.textContent).toBe('Un long commentaire auquel on répond.');
    expect(extrait?.classList.contains('truncate')).toBe(false);
    expect(extrait?.classList.contains('line-clamp-3')).toBe(true);
  });

  test('sans `foldOnSend` (détail d’une publication), l’envoi garde le champ : on enchaîne', async () => {
    const host = await monter(hote({ writes: [] }));
    await act(async () => champ(host).focus());
    await taper(host, 'belle vue');
    await entree(host);
    expect(document.activeElement).toBe(champ(host));
  });
});
