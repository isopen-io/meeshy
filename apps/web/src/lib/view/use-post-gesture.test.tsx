import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';

import { FEED_QUERY_KEY } from '@/lib/api/feed';
import type { FeedInfiniteData, FeedPost } from '@/lib/api/feed-pages';
import { appQueryClient } from '@/lib/api/query-client';

import { usePostGesture } from './use-post-gesture';

/**
 * `usePostGesture` ANNONCE DANS LA LANGUE D'INTERFACE (#6488) — la couche
 * réseau (`RETOUR_PARTAGE_PUBLICATION`, `share-url.ts`) ne rend plus un texte
 * déjà traduit mais une CLÉ de catalogue ; ce hook est le SEUL point qui
 * connaît la langue et doit la traduire avant d'`announce()`r. Sans ce
 * témoin, un partage indisponible annoncerait la clé brute (`feed.share.
 * error`) au lieu d'un texte lisible.
 *
 * LE PARTAGE, PAS LE « LIKE » : sous `bun test`, `apiDeps.source` vaut
 * `'fixtures'` (`__FIXTURES__`, `bunfig.toml`) — `sendGesture`
 * (`feed-gestures.ts`) y court-circuite TOUJOURS sur `ok:true`, si bien
 * qu'aucun scénario public ne peut faire passer `onGesture` par la branche
 * `ok:false` sous ce harnais. Le partage, lui, dépend de la détection de
 * fonctionnalité du NAVIGATEUR (`navigator.share`/`navigator.clipboard`) —
 * happy-dom expose `navigator.clipboard.writeText`, jamais `navigator.share`,
 * donc `partagerLien` retombe de façon fiable sur `'copie'` — même chemin de
 * code (`RETOUR_PARTAGE_PUBLICATION[result]` → `translate` → `announce`) que
 * `onGesture`.
 *
 * Patron `use-live-announcer.test.tsx` (happy-dom + `createRoot` + `act`).
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadInterfaceCatalog('fr'), loadInterfaceCatalog('en')]);
});

afterAll(async () => {
  document.documentElement.lang = 'fr';
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
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

function Harness({ postId }: { readonly postId: string }) {
  const { announcement, onShare } = usePostGesture();
  return (
    <div>
      <span data-live>{announcement}</span>
      <button type="button" data-share onClick={() => onShare(postId)} />
    </div>
  );
}

function mount(postId = 'p1'): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Harness postId={postId} />);
  });
  return container;
}

const liveOf = (el: HTMLDivElement): string => el.querySelector('[data-live]')!.textContent ?? '';

/** Laisse la promesse de `partagerLien().then()` s'écouler, DANS `act`. */
const laisserPasser = () => act(async () => Promise.resolve());

describe('usePostGesture — l’annonce suit la langue d’interface (#6488)', () => {
  test('en : le lien copié s’annonce en anglais, jamais la clé brute', async () => {
    document.documentElement.lang = 'en';
    const el = mount();
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-share]')!.click();
    });
    await laisserPasser();
    const texte = liveOf(el);
    expect(texte).not.toBe('feed.share.copied');
    expect(texte).toBe(translate('en', 'feed.share.copied'));
    expect(texte).toBe('Link copied — just paste it.');
  });

  test('fr : la MÊME issue s’annonce en français une fois la langue reposée', async () => {
    document.documentElement.lang = 'fr';
    const el = mount();
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-share]')!.click();
    });
    await laisserPasser();
    expect(liveOf(el)).toBe(translate('fr', 'feed.share.copied'));
    expect(liveOf(el)).toBe('Lien copié — il ne reste qu’à le coller.');
  });
});

/**
 * **COMMENTER EST LE TROISIÈME GESTE DE LA RANGÉE** (#7113) — il vivait en
 * DEUX copies chez les hôtes (`feed.tsx`, `user-profile.tsx`), chacune
 * réécrivant la même adresse, pendant que les deux autres écrans qui montent
 * la carte n'en avaient aucune. Une intention recopiée chez ses appelants est
 * une intention qu'un appelant oublie : c'est arrivé deux fois.
 *
 * Il rejoint donc `onGesture` et `onShare` dans le seul hôte des gestes d'une
 * publication — et tout écran qui monte la carte le reçoit en le
 * DÉSTRUCTURANT, plutôt qu'en le réécrivant.
 *
 * Ce témoin mesure l'ADRESSE, là où la garde d'inventaire
 * (`routes/post-card-hosts.test.ts`) mesure QUI l'offre. L'une sans l'autre
 * laisserait passer soit un écran muet, soit un bouton qui mène ailleurs.
 */
describe('usePostGesture — commenter conduit au fil, à son ancre (#7113)', () => {
  function CommentHarness({ postId }: { readonly postId: string }) {
    const { onComment } = usePostGesture();
    return <button type="button" data-comment onClick={() => onComment(postId)} />;
  }

  /** `navigate` écrit par `history.pushState` — on écoute l'API que le routeur
   * appelle vraiment, plutôt qu'un substitut du routeur lui-même. */
  function adresseDuTap(postId: string): string {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<CommentHarness postId={postId} />);
    });
    const natif = window.history.pushState.bind(window.history);
    const vues: string[] = [];
    window.history.pushState = ((..._args: readonly unknown[]) => {
      vues.push(String(_args[2]));
    }) as unknown as typeof window.history.pushState;
    try {
      act(() => {
        container.querySelector<HTMLButtonElement>('[data-comment]')!.click();
      });
    } finally {
      window.history.pushState = natif;
    }
    return vues.join(' | ');
  }

  test('le tap mène au DÉTAIL de CETTE publication, ancré sur les commentaires', () => {
    expect(adresseDuTap('p1')).toBe('/post/p1#commentaires');
  });

  /* L'identifiant n'est pas décoratif : une adresse qui ignorerait le sien
     ouvrirait le fil d'une AUTRE publication, ce que le témoin ci-dessus ne
     distingue pas à lui seul. */
  test('une autre publication mène à SON fil', () => {
    expect(adresseDuTap('p2')).toBe('/post/p2#commentaires');
  });
});

/**
 * REPARTAGER (#6484) — le QUATRIÈME geste de la rangée, même patron que
 * « J'aime » (l'annonce ci-dessus) : sous fixtures, `performRepost` réussit
 * toujours et rend `feed.post.repost.success`, que ce hook doit traduire
 * avant de l'`announce()`r — jamais la clé brute.
 */
/**
 * **MODIFIER LE TEXTE — L'ANNONCE, ET L'ISSUE RENDUE** (#7534) — la feuille
 * d'édition attend l'issue de `menu.onEdit` pour se fermer (`'done'`) ou
 * rester ouverte (`'offline'`/`'failed'`) ; ce hook doit donc RENDRE l'issue
 * en plus de l'annoncer, contrairement aux trois autres gestes du menu qui
 * n'ont pas de surface qui attend.
 */
describe('usePostGesture — modifier le texte annonce dans la langue d’interface, et rend l’issue (#7534)', () => {
  function EditHarness({ postId }: { readonly postId: string }) {
    const { announcement, menu } = usePostGesture();
    return (
      <div>
        <span data-live>{announcement}</span>
        <button type="button" data-edit onClick={() => void menu.onEdit(postId, 'Texte corrigé')} />
      </div>
    );
  }

  function montreEdit(postId: string): HTMLDivElement {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<EditHarness postId={postId} />);
    });
    return container;
  }

  /* Sous fixtures (`__FIXTURES__`), `editPostAction` rend `'failed'` pour une
     publication ABSENTE du cache (`findCardPost` ne la trouve pas) — c'est le
     seul chemin déterministe SANS seed de cache pour exercer une issue non
     confirmée sous ce harnais, exactement comme `onGesture` ne peut exercer
     `ok:false` que par une détection de fonctionnalité du navigateur (voir le
     commentaire du fichier). */
  test('fr : une publication introuvable annonce l’échec, jamais la clé brute', async () => {
    document.documentElement.lang = 'fr';
    const el = montreEdit('introuvable');
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-edit]')!.click();
    });
    await laisserPasser();
    const texte = liveOf(el);
    expect(texte).not.toBe('feed.post.edit_failed');
    expect(texte).toBe(translate('fr', 'feed.post.edit_failed'));
  });

  test('la promesse rendue porte l’issue', async () => {
    let issue: string | undefined;
    function CaptureHarness() {
      const { menu } = usePostGesture();
      return (
        <button
          type="button"
          data-edit
          onClick={() => {
            void menu.onEdit('introuvable', 'Texte').then((outcome) => {
              issue = outcome;
            });
          }}
        />
      );
    }
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<CaptureHarness />);
    });
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-edit]')!.click();
    });
    await laisserPasser();
    expect(issue).toBe('failed');
  });
});

/**
 * **« PUBLICATION MODIFIÉE » — LA MOITIÉ `done`** (revue-correction #7534) :
 * le témoin ci-dessus ne jouait que l'échec. Le cache PARTAGÉ (`appQueryClient`)
 * est semé de la carte, et le port sous fixtures rend alors `done`.
 */
describe('usePostGesture — une modification CONFIRMÉE s’annonce (#7534)', () => {
  function EditHarness({ postId }: { readonly postId: string }) {
    const { announcement, menu } = usePostGesture();
    return (
      <div>
        <span data-live>{announcement}</span>
        <button type="button" data-edit onClick={() => void menu.onEdit(postId, 'Texte corrigé')} />
      </div>
    );
  }

  test('fr : « Publication modifiée », et la carte porte le texte neuf', async () => {
    document.documentElement.lang = 'fr';
    const post: FeedPost = { id: 'p-edit-done', type: 'POST', createdAt: '2026-09-24T10:00:00.000Z', content: 'Texte original' };
    appQueryClient.setQueryData<FeedInfiniteData>(FEED_QUERY_KEY, {
      pages: [{ posts: [post], pagination: { limit: 20, hasMore: false, nextCursor: null } }],
      pageParams: [undefined],
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<EditHarness postId="p-edit-done" />);
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-edit]')!.click();
    });
    await laisserPasser();

    expect(liveOf(container)).toBe(translate('fr', 'feed.post.edited'));
    const held = appQueryClient.getQueryData<FeedInfiniteData>(FEED_QUERY_KEY)?.pages[0]?.posts[0];
    expect(held?.content).toBe('Texte corrigé');
    appQueryClient.removeQueries({ queryKey: FEED_QUERY_KEY });
  });
});

/**
 * **UN SECOND TEXTE PENDANT LE VOL DU PREMIER N'ANNONCE JAMAIS
 * « Publication modifiée » POUR CE TEXTE-LÀ** (revue-correction #7534, défaut
 * majeur 1). Avant ce correctif, `editPost` rendait `'done'` pour CE second
 * appel SANS RIEN ENVOYER — la feuille (rouverte pendant le vol du premier,
 * § FERMER PENDANT LE VOL FERME de `publication-edit-sheet.tsx`) se fermait,
 * et cet hôte annonçait un succès pour un texte parti nulle part. `'busy'`
 * ferme ce chemin : la promesse du second appel ne peut plus rendre `'done'`
 * tant que son propre texte n'est pas passé par le réseau.
 */
describe('usePostGesture — un second texte, différent, pendant le vol du premier n’est jamais confirmé (revue-correction #7534)', () => {
  test('fr : `busy`, jamais `done`, pour le texte qui n’est pas parti', async () => {
    document.documentElement.lang = 'fr';
    const post: FeedPost = { id: 'p-edit-busy', type: 'POST', createdAt: '2026-09-24T10:00:00.000Z', content: 'Texte original' };
    appQueryClient.setQueryData<FeedInfiniteData>(FEED_QUERY_KEY, {
      pages: [{ posts: [post], pagination: { limit: 20, hasMore: false, nextCursor: null } }],
      pageParams: [undefined],
    });

    let firstOutcome: string | undefined;
    let secondOutcome: string | undefined;
    function EditHarness() {
      const { announcement, menu } = usePostGesture();
      return (
        <div>
          <span data-live>{announcement}</span>
          <button
            type="button"
            data-edit
            onClick={() => {
              /* LES DEUX PARTENT DANS LE MÊME TOUR, comme un clic « Publier »
                 sur une feuille rouverte pendant que le premier PUT vole
                 encore : rien ne les sépare qu'une garde EN MÉMOIRE. */
              void menu.onEdit('p-edit-busy', 'Premier texte').then((outcome) => {
                firstOutcome = outcome;
              });
              void menu.onEdit('p-edit-busy', 'Second texte').then((outcome) => {
                secondOutcome = outcome;
              });
            }}
          />
        </div>
      );
    }

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<EditHarness />);
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-edit]')!.click();
    });
    await laisserPasser();
    await laisserPasser();

    expect(secondOutcome).toBe('busy');
    expect(firstOutcome).toBe('done');
    /* Le SECOND texte n'a touché ni la caisse ni le réseau : la carte porte
       le PREMIER, jamais le second — et l'annonce finale ne ment pas sur ce
       qui est réellement parti. */
    const held = appQueryClient.getQueryData<FeedInfiniteData>(FEED_QUERY_KEY)?.pages[0]?.posts[0];
    expect(held?.content).toBe('Premier texte');
    /* L'annonce finale ne peut être QUE l'une de ces deux phrases, jamais une
       « Publication modifiée » qui daterait du texte qui n'est pas parti. */
    expect([translate('fr', 'feed.post.edited'), translate('fr', 'feed.post.edit_busy')]).toContain(liveOf(container));
    appQueryClient.removeQueries({ queryKey: FEED_QUERY_KEY });
  });
});

/**
 * **SUPPRIMER DEPUIS LA FICHE QUITTE LA FICHE** (revue-correction #7534) —
 * miroir `PostDetailView.swift` (`if await viewModel.deletePost(postId) {
 * router.pop() }`). La fiche reçoit le menu depuis #7534 ; sans ce rappel, la
 * requête partait, la carte restait PEINTE (l'observateur de `usePost` garde
 * son dernier résultat quand sa requête est retirée du cache) et seule une
 * annonce invisible disait qu'il s'était passé quelque chose.
 */
describe('usePostGesture — une suppression CONFIRMÉE prévient l’hôte (#7534)', () => {
  test('`onDeleted` reçoit l’identifiant après la confirmation', async () => {
    const deleted: string[] = [];
    function DeleteHarness() {
      const { menu } = usePostGesture({ onDeleted: (postId) => deleted.push(postId) });
      return <button type="button" data-delete onClick={() => menu.onDelete('p-gone')} />;
    }
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<DeleteHarness />);
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-delete]')!.click();
    });
    expect(deleted).toEqual([]);
    await laisserPasser();
    expect(deleted).toEqual(['p-gone']);
  });
});

/**
 * **`onRepost` DEMANDE, `confirmRepost` ENVOIE** (revue-correction #6278,
 * défaut majeur 1) — le repost est APPEND-ONLY, sans « annuler » nulle part
 * dans l'interface une fois parti ; iOS n'envoie jamais depuis le seul tap du
 * bouton, il ouvre une alerte (`FeedPostCard.swift:1049-1053`). Un tap seul
 * ne doit donc AUCUN effet — ni réseau, ni annonce — tant que
 * `confirmRepost()` n'a pas été appelé ; `cancelRepost()` referme la demande
 * sans qu'aucun des deux ne se produise jamais.
 */
describe('usePostGesture — repartager DEMANDE une confirmation avant d’envoyer (#6278)', () => {
  function RepostHarness({ postId }: { readonly postId: string }) {
    const { announcement, onRepost, pendingRepostId, confirmRepost, cancelRepost } = usePostGesture();
    return (
      <div>
        <span data-live>{announcement}</span>
        <span data-pending>{pendingRepostId ?? ''}</span>
        <button type="button" data-repost onClick={() => onRepost(postId)} />
        <button type="button" data-repost-confirm onClick={confirmRepost} />
        <button type="button" data-repost-cancel onClick={cancelRepost} />
      </div>
    );
  }

  function montreRepost(postId: string): HTMLDivElement {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<RepostHarness postId={postId} />);
    });
    return container;
  }

  const pendingOf = (el: HTMLDivElement): string => el.querySelector('[data-pending]')!.textContent ?? '';

  test('le seul tap n’envoie RIEN : il pose la demande, sans annonce', async () => {
    const el = montreRepost('reel-1');
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-repost]')!.click();
    });
    await laisserPasser();
    expect(pendingOf(el)).toBe('reel-1');
    expect(liveOf(el)).toBe('');
  });

  test('fr : confirmer envoie le repost et l’annonce en français, jamais la clé brute', async () => {
    document.documentElement.lang = 'fr';
    const el = montreRepost('reel-1');
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-repost]')!.click();
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-repost-confirm]')!.click();
    });
    await laisserPasser();
    const texte = liveOf(el);
    expect(texte).not.toBe('feed.post.repost.success');
    expect(texte).toBe(translate('fr', 'feed.post.repost.success'));
    expect(pendingOf(el)).toBe('');
  });

  test('annuler ne laisse AUCUN effet : ni annonce, ni demande restante', async () => {
    const el = montreRepost('reel-1');
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-repost]')!.click();
    });
    expect(pendingOf(el)).toBe('reel-1');
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-repost-cancel]')!.click();
    });
    await laisserPasser();
    expect(pendingOf(el)).toBe('');
    expect(liveOf(el)).toBe('');
  });
});
