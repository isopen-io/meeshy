import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { ProtectedMediaDeps } from './protected-media';
import { useProtectedMediaSrc } from './use-protected-media';

/**
 * # LA RÉSOLUTION QUI ARRIVE APRÈS LE DÉMONTAGE (#7015, seconde revue-correction)
 *
 * `useProtectedMediaSrc` révoque bien l'URL d'objet au démontage — un témoin
 * le garde (`background-track-audio.test.tsx` § (j)). **Il ne gardait que le
 * cas où la piste était DÉJÀ résolue.** L'autre moitié de la branche
 * d'abandon,
 *
 *     if (abandonne) { if (result.kind === 'ready') deps.revokeObjectURL(result.url); return; }
 *
 * n'était couverte par AUCUN témoin : mesuré le 2026-09-18 en la RETIRANT —
 * `bun test src/components/background-track-audio.test.tsx
 * src/components/scene-object-audio.test.tsx` reste VERT (23 pass / 0 fail).
 * Un correctif qu'aucun témoin ne fait rougir n'est pas gardé.
 *
 * **Ce n'est pas un cas de laboratoire, c'est le cas NOMINAL de cet écran.**
 * Le lecteur de story REMONTE la piste à chaque tour de boucle (`key` de
 * l'appelant, #6903) et le fil des Réels démonte la scène au moindre
 * défilement : chaque montage lance un `fetch`, chaque démontage AVANT la
 * réponse laissait derrière lui une URL d'objet que PERSONNE ne détenait —
 * `objectUrl` est encore `null` dans la fermeture de nettoyage, et la seule
 * référence aux octets naît après. Les octets (jusqu'à 7 Mo pièce, mesuré sur
 * `/app/sounds`) restent alors en mémoire pour toute la vie du document, et la
 * fuite est PROPORTIONNELLE au temps passé sur l'écran — exactement ce que le
 * doc-comment du hook promet d'éviter (dimension 3, `CLAUDE.md` § Roadmap).
 *
 * Le témoin exige donc les DEUX moitiés : l'URL tardive est révoquée, et
 * l'état n'est PAS posé (un `setState` après démontage relance un rendu sur un
 * arbre mort).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const SON_PROTEGE = '/api/v1/static/d0bf39b7-cd47-4e70-8f1c-34b2d9b5ee4b.m4a';

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function mount(element: ReactElement): void {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(element);
  });
}

/** Une piste dont la réponse n'arrive QUE sur ordre du témoin — la seule
 * façon d'ouvrir la fenêtre « démonté, résolution en vol ». */
function depsDifferees(journal: { readonly revoked: string[]; readonly crees: string[] }): {
  readonly deps: ProtectedMediaDeps;
  readonly repondre: () => void;
} {
  let liberer: (() => void) | null = null;
  const attente = new Promise<void>((resolve) => {
    liberer = resolve;
  });
  const deps: ProtectedMediaDeps = {
    credential: () => ({ kind: 'registered', token: 'jeton-de-test' }),
    fetchImpl: async () => {
      await attente;
      return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' }), { status: 200 });
    },
    createObjectURL: () => {
      const url = `blob:meeshy/son-${journal.crees.length}`;
      journal.crees.push(url);
      return url;
    },
    revokeObjectURL: (url) => {
      journal.revoked.push(url);
    },
  };
  return { deps, repondre: () => liberer?.() };
}

function Sonde({ deps, onRender }: { readonly deps: ProtectedMediaDeps; readonly onRender: (src: string | null) => void }) {
  const { src } = useProtectedMediaSrc(SON_PROTEGE, deps);
  onRender(src);
  return null;
}

describe('useProtectedMediaSrc — la résolution qui arrive APRÈS le démontage (#7015)', () => {
  test('démonté AVANT la réponse ⇒ l’URL d’objet créée ensuite est RÉVOQUÉE (aucun octet orphelin)', async () => {
    const journal = { revoked: [] as string[], crees: [] as string[] };
    const { deps, repondre } = depsDifferees(journal);
    mount(<Sonde deps={deps} onRender={() => {}} />);

    act(() => {
      root.render(<span />);
    });

    repondre();
    await act(async () => {});
    await new Promise((resolve) => setImmediate(resolve));
    await act(async () => {});

    expect(journal.crees).toEqual(['blob:meeshy/son-0']);
    expect(journal.revoked).toEqual(['blob:meeshy/son-0']);
  });

  /**
   * UN TÉMOIN ÉCRIT PUIS JETÉ, et la raison mérite d'être écrite (2026-09-18).
   *
   * « démonté avant la réponse ⇒ aucune source n'est posée après coup » a été
   * rédigé ici, puis RETIRÉ : mesuré, il reste VERT quand on supprime la garde
   * `if (abandonne) … return;` tout entière. React 18 ignore silencieusement
   * un `setState` sur une racine démontée — le témoin mesurait donc le
   * RUNTIME, pas le correctif. Un témoin vert des deux côtés de l'annulation
   * ne garde rien ; il est plus honnête de ne pas l'avoir que de le compter.
   * Ce que la garde d'abandon protège RÉELLEMENT — les octets orphelins — est
   * gardé par le témoin ci-dessus, dont le rouge est mesuré.
   */

  test('CONTRASTE — resté monté, la même piste est POSÉE et révoquée seulement au démontage', async () => {
    const journal = { revoked: [] as string[], crees: [] as string[] };
    const { deps, repondre } = depsDifferees(journal);
    const rendus: (string | null)[] = [];
    mount(<Sonde deps={deps} onRender={(src) => rendus.push(src)} />);

    repondre();
    await act(async () => {});
    await new Promise((resolve) => setImmediate(resolve));
    await act(async () => {});

    expect(rendus.at(-1)).toBe('blob:meeshy/son-0');
    expect(journal.revoked).toEqual([]);

    act(() => {
      root.render(<span />);
    });
    expect(journal.revoked).toEqual(['blob:meeshy/son-0']);
  });
});
