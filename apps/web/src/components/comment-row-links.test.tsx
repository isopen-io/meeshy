import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { type PostComment } from '@/lib/api/publication-comments';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CommentRow } from './comment-row';

/**
 * **UN COMMENTAIRE OUVRE SES ADRESSES PAR `/l/`** (#9074) — la carte
 * `{ url, token }` du commentaire (`metadata.trackingLinks` en REST, hissée en
 * `trackingLinks` par le socket) : le lien SUIVI passe par `/l/<token>`, le
 * texte affiché reste l'adresse ; une adresse hors carte reste un lien direct.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

let container: HTMLDivElement | null = null;
let root: Root | null = null;

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

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const commentaire = (patch: Partial<PostComment> = {}): PostComment => ({
  id: 'c-liens',
  content: 'Lis https://exemple.org/guide puis https://ailleurs.net/x',
  createdAt: '2026-10-02T11:58:00.000Z',
  author: { id: 'u1', displayName: 'Noa Berger', username: 'noa' },
  originalLanguage: 'fr',
  ...patch,
});

const monter = async (comment: PostComment): Promise<HTMLDivElement> => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <ul>
        <CommentRow comment={comment} language="fr" preferredLanguages={['fr']} locale="fr-FR" now={new Date('2026-10-02T12:00:00.000Z')} />
      </ul>,
    ),
  );
  return container;
};

const hrefs = (host: ParentNode): readonly (string | null)[] =>
  [...host.querySelectorAll('[data-comment-row] [data-rich-text] a')].map((a) => a.getAttribute('href'));

const TRACKED = [{ url: 'https://exemple.org/guide', token: 'Guide3' }];

describe('Un commentaire ouvre ses adresses', () => {
  test('REST — la carte de `metadata` envoie l’adresse suivie par /l/, l’autre en direct', async () => {
    const host = await monter(commentaire({ metadata: { trackingLinks: TRACKED } }));
    expect(hrefs(host)).toEqual(['/l/Guide3', 'https://ailleurs.net/x']);
    expect(host.querySelector('[data-comment-row] [data-rich-text] a')?.textContent).toBe('m+Guide3');
  });

  test('socket — la carte hissée en `trackingLinks` vaut la même chose', async () => {
    const host = await monter(commentaire({ trackingLinks: TRACKED }));
    expect(hrefs(host)).toEqual(['/l/Guide3', 'https://ailleurs.net/x']);
  });

  test('sans carte, chaque adresse est un lien direct', async () => {
    const host = await monter(commentaire());
    expect(hrefs(host)).toEqual(['https://exemple.org/guide', 'https://ailleurs.net/x']);
  });
});
