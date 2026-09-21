import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { authorPostsQueryKey } from '@/lib/api/author-posts';
import { BLOCKED_USERS_QUERY_KEY } from '@/lib/api/blocks';
import { VIEWER_ID } from '@/lib/api/fixtures';
import { friendRequestsQueryKey } from '@/lib/api/friend-requests';
import { fixtureAuthorPosts } from '@/lib/api/fixtures-rich-text';
import { sharedConversationsQueryKey } from '@/lib/api/shared-conversations';
import { appQueryClient } from '@/lib/api/query-client';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { UserProfileView } from './user-profile';

/**
 * **LE PROFIL PUBLIC, MONTÉ** (#7083) — ce que les témoins de port et de pièce
 * ne peuvent pas prouver : que les TROIS blocs arrivent ensemble depuis UNE
 * requête, qu'un refus ne laisse RIEN transparaître du compte demandé (pas
 * même son existence, D-6), et qu'un blocage retire le contenu plutôt que de
 * le griser.
 *
 * Les gestes eux-mêmes sont mesurés là où ils vivent
 * (`lib/api/friend-actions.test.ts` : optimiste et retour arrière sur chaque
 * entrée de profil) ; ici on mesure le CÂBLAGE.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/u/kwame-mensah' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let mounted: { readonly container: HTMLDivElement; readonly root: Root } | null = null;

afterEach(() => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = null;
  appQueryClient.clear();
  /* LE RÉSEAU SE REMET ICI, jamais en fin de corps de témoin : une assertion
     qui casse avant la ligne de restauration laisserait l'`onlineManager` de
     TanStack en pause pour tout le reste du PROCESSUS — donc pour les autres
     fichiers de la suite. Voir `setOnline` ci-dessous. */
  setOnline(true);
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function mount(username: string): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(
      <QueryClientProvider client={appQueryClient}>
        <UserProfileView username={username} />
      </QueryClientProvider>,
    );
  });
  await settle();
  await settle();
  return container;
}

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/gu, ' ').trim();

describe('les trois blocs arrivent ensemble', () => {
  test('identité, relation, publications et statistiques sont peints', async () => {
    const el = await mount('kwame-mensah');
    expect(text(el.querySelector('[data-user-hero] p'))).toBe('Kwame Mensah');
    expect(text(el.querySelector('[data-user-hero] p:nth-of-type(2)'))).toBe('@kwame-mensah');
    expect(el.querySelector('[data-profile-relation]')).not.toBeNull();
    expect(el.querySelector('[data-profile-posts]')).not.toBeNull();
    expect(el.querySelector('[data-profile-stats]')).not.toBeNull();
  });

  test('chaque bloc est une SECTION nommée par son titre — l’idiome de `/me`', async () => {
    const el = await mount('kwame-mensah');
    const titles = [...el.querySelectorAll('#contenu section h2')].map((node) => text(node));
    /* AMENDÉ PAR #7124 — la QUATRIÈME section est arrivée, et l'ordre porte
       une décision : « ce que vous partagez déjà » se lit APRÈS ce que la
       personne publie et AVANT ses compteurs, parce que c'est la réponse à
       « où nous sommes-nous déjà parlé ? » — une question de RELATION, pas de
       mesure. Le témoin reste EXHAUSTIF et ORDONNÉ : c'est ce qui lui permet
       de dire qu'une section a disparu, ou qu'une s'est glissée sans décision. */
    expect(titles).toEqual(['CONNEXION', 'PUBLICATIONS', 'CONVERSATIONS', 'STATISTIQUES']);
  });

  test('le bandeau porte les comptes SERVIS, et le listing les publications de CET auteur', async () => {
    const el = await mount('kwame-mensah');
    expect(text(el.querySelector('[data-profile-tile="postsCount"]'))).toContain('3');
    expect([...el.querySelectorAll('[data-feed-card-id]')].length).toBeGreaterThan(0);
  });

  /* `report` a rejoint la liste au 2026-09-21 (#7187) — le port existait sans
     appelant. L'inventaire reste EXHAUSTIF et ORDONNÉ : c'est lui qui dirait
     qu'une action a disparu, ou qu'une s'est glissée sans décision. */
  test('la relation servie « aucune » offre Ajouter, Écrire, Bloquer, Signaler', async () => {
    const el = await mount('kwame-mensah');
    expect(el.querySelector('[data-profile-relation]')?.getAttribute('data-profile-relation')).toBe('none');
    expect([...el.querySelectorAll('[data-profile-action]')].map((n) => n.getAttribute('data-profile-action'))).toEqual(['add', 'write', 'block', 'report']);
  });
});

/**
 * **LE FILTRE NE DOIT PAS MURER LA SUITE** (revue #7083) — le filtre est
 * CLIENT, sur les pages déjà lues, et la tuile annonce un compte SERVEUR
 * (`expand=stats`). Le premier jet retirait « Charger plus » dès qu'un filtre
 * était actif : le bandeau disait « 2 Réels » au-dessus d'une liste d'UN, et
 * plus aucun geste n'atteignait le second. iOS n'arrête pas non plus sa
 * sentinelle sous un filtre (`ProfileUserPostsList.swift:246-252`).
 */
describe('le filtre et la pagination', () => {
  const cards = (el: HTMLElement) => el.querySelectorAll('[data-feed-card-id]').length;

  test('sous un filtre, « Charger plus » reste offert — et il ramène ce que la tuile annonce', async () => {
    const el = await mount('kwame-mensah');
    const all = cards(el);
    act(() => (el.querySelector('[data-profile-filter="reels"]') as HTMLButtonElement).click());
    const filtered = cards(el);
    expect(filtered).toBeLessThan(all);
    expect(el.querySelector('[data-profile-posts-more]')).not.toBeNull();

    act(() => (el.querySelector('[data-profile-posts-more]') as HTMLButtonElement).click());
    await settle();
    await settle();
    /* La tuile est la PROMESSE ; la liste filtrée doit pouvoir la tenir. */
    const promised = Number((el.querySelector('[data-profile-tile="reelsCount"] strong')?.textContent ?? '0').trim());
    expect(cards(el)).toBe(promised);
  });
});

describe('sa PROPRE fiche', () => {
  test('n’offre AUCUNE action relationnelle — on ne se demande pas en ami', async () => {
    const el = await mount('vous');
    expect(text(el.querySelector('[data-user-hero] p'))).toBe('Awa Diallo');
    expect(el.querySelector('[data-profile-relation]')).toBeNull();
    expect(el.querySelector('[data-profile-posts]')).not.toBeNull();
    /* Et les compteurs INTIMES, que le serveur ne sert qu'à soi. */
    expect(text(el.querySelector('[data-profile-stat="totalMessages"]'))).toContain('1204');
  });
});

describe('une demande REÇUE', () => {
  test('explique de quoi il s’agit et offre accepter / refuser', async () => {
    /* `amina` a une demande en attente dans le panier des reçues
       (`fixtures-friends.ts`), et `fixturePublicProfile` en DÉRIVE la relation
       — la même source que côté serveur (`relationAvec` lit `friendRequest`). */
    const el = await mount('amina.diallo');
    expect(el.querySelector('[data-profile-relation]')?.getAttribute('data-profile-relation')).toBe('pendingReceived');
    expect([...el.querySelectorAll('[data-profile-action]')].map((n) => n.getAttribute('data-profile-action'))).toEqual([
      'accept',
      'reject',
      'write',
      'block',
      'report',
    ]);
    expect(text(el.querySelector('[data-profile-context]'))).toContain('Amina Diallo');
  });
});

/**
 * **CE QUE VOUS PARTAGEZ DÉJÀ** (#7124) — l'onglet Conversations d'iOS
 * (`listSharedWith`, `UserProfileSheet.swift:325`), rendu en SECTION empilée.
 * Ce qui se mesure ici est le CÂBLAGE : que la question porte le SUJET, et
 * qu'elle ne parte PAS là où elle n'a pas de sens.
 */
describe('les conversations en commun', () => {
  test('la section est peinte, et chaque rangée mène à son fil', async () => {
    const el = await mount('kwame-mensah');
    const rangees = [...el.querySelectorAll('[data-profile-conversation] a')];
    expect(rangees.length).toBeGreaterThan(0);
    expect(rangees.every((a) => (a.getAttribute('href') ?? '').startsWith('/c/'))).toBe(true);
  });

  test('sur SA PROPRE fiche, la section n’est pas montée — et la question ne part pas', async () => {
    const el = await mount('vous');
    expect(el.querySelector('[data-profile-conversations]')).toBeNull();
    /* L'observateur EXISTE — un hook ne se monte pas sous condition — mais la
       question n'est jamais POSÉE : `dataUpdateCount` à 0 et `fetchStatus` au
       repos, la forme exacte que le témoin des publications d'un compte bloqué
       emploie déjà. */
    const etat = appQueryClient.getQueryState(sharedConversationsQueryKey(VIEWER_ID));
    expect(etat?.dataUpdateCount ?? 0).toBe(0);
    expect(etat?.fetchStatus ?? 'idle').toBe('idle');
  });

  test('sur un compte BLOQUÉ, aucune conversation n’est servie', async () => {
    const el = await mount('yann.legoff');
    expect(el.querySelector('[data-profile-conversations]')).toBeNull();
    const etat = appQueryClient.getQueryState(sharedConversationsQueryKey('u-yann'));
    expect(etat?.dataUpdateCount ?? 0).toBe(0);
    expect(etat?.fetchStatus ?? 'idle').toBe('idle');
  });
});

/**
 * **L'IDENTIFIANT DE LA DEMANDE ARRIVE AVEC L'IDENTITÉ** (#7122) — la fiche
 * chargeait le panier `GET /directory/friend-requests?direction=…` pour
 * retrouver la ligne que « Accepter » doit patcher, et désarmait ses trois
 * gestes tant qu'il était en vol. La passerelle sert `relationRequestId` sur
 * `expand=relation` : il n'y a plus de panier, plus de fenêtre, et les gestes
 * sont armés au premier rendu.
 *
 * C'est la forme EXACTE du lot #7125 une dimension plus loin — le blocage
 * avait quitté son panier, la ligne de demande quitte le sien.
 */
describe('la ligne de la demande, lue sur le FIL', () => {
  test('les gestes sont armés d’emblée — aucun n’attend sa ligne', async () => {
    const el = await mount('amina.diallo');
    const accept = el.querySelector('[data-profile-action="accept"]');
    expect(accept).not.toBeNull();
    expect((accept as HTMLButtonElement | null)?.disabled).toBe(false);
  });

  test('aucune page du panier des demandes n’a été servie', async () => {
    await mount('amina.diallo');
    /* Sans observateur, TanStack ne crée même pas l'entrée : l'ABSENCE d'état
       est la preuve, là où un compteur de pages mesurerait le drainage plutôt
       que sa disparition (même témoin que pour le panier des bloqués). */
    expect(appQueryClient.getQueryState(friendRequestsQueryKey('received'))).toBeUndefined();
    expect(appQueryClient.getQueryState(friendRequestsQueryKey('sent'))).toBeUndefined();
  });
});

describe('bloqué par le lecteur', () => {
  test('ni publications ni statistiques — l’identité et « Débloquer », rien d’autre', async () => {
    /* `yann` est dans le panier des bloqués du corpus. */
    const el = await mount('yann.legoff');
    expect(el.querySelector('[data-profile-blocked]')).not.toBeNull();
    expect(el.querySelector('[data-profile-action="unblock"]')).not.toBeNull();
    expect(el.querySelector('[data-profile-posts]')).toBeNull();
    expect(el.querySelector('[data-profile-stats]')).toBeNull();
    /* L'identité RESTE : on sait qui on a bloqué. */
    expect(text(el.querySelector('[data-user-hero] p'))).toBe('Yann Le Goff');
  });
});

describe('le refus ne laisse RIEN transparaître', () => {
  test('un profil introuvable ne dit ni « introuvable » ni le pseudo demandé', async () => {
    const el = await mount('personne-qui-nexiste-pas');
    const body = text(el);
    expect(body).toContain('Ce profil n’est pas accessible');
    expect(body.toLowerCase()).not.toContain('introuvable');
    expect(body).not.toContain('personne-qui-nexiste-pas');
    /* Un refus n'offre pas « Réessayer » : le geste rejouerait le refus. */
    expect(el.querySelector('[data-profile-retry]')).toBeNull();
    /* Et aucun bloc de contenu n'a été monté. */
    expect(el.querySelector('[data-profile-posts]')).toBeNull();
  });
});

/** L'identifiant de l'auteur des fixtures (`RICH_PERSON.id`) : la liste des
 * publications est indexée par `User.id`, jamais par pseudo
 * (`PostFeedService.ts:869`). */
const AUTHOR_ID = 'u-rich-kwame';

/**
 * **COUPER LE RÉSEAU DANS UN PROCESSUS PARTAGÉ SE DÉFAIT EXPLICITEMENT.**
 *
 * `bun test` exécute TOUS les fichiers dans UN process : `navigator`, le
 * `window` de happy-dom et l'`onlineManager` de TanStack Query y sont des
 * singletons. Une coupure mal rendue ne salit donc pas ce témoin — elle
 * salit la SUITE. Mesuré ici, et c'est la raison de ce commentaire : 52
 * témoins rouges dans des écrans qui n'ont AUCUN rapport (fiches
 * d'administration, création de conversation) et un run 10 fois plus long
 * (34 s → 354 s), les échecs crachant des dumps de DOM par millions de
 * lignes jusqu'à faire EXPIRER une fixture datée.
 *
 * **Et rejouer l'événement `online` ne suffit pas** — c'est le piège exact :
 * l'`onlineManager` n'ÉCOUTE le `window` que tant qu'il a un abonné. L'ordre
 * de l'`afterEach` (démonter, puis rétablir) laissait donc zéro abonné au
 * moment du `dispatchEvent`, l'événement tombait dans le vide, et le
 * gestionnaire restait HORS LIGNE pour tout le reste du processus : chaque
 * requête des fichiers suivants partait en PAUSE, sans jamais répondre.
 *
 * Les trois voies sont donc rendues explicitement : la propriété que lit
 * `useOnline` (`lib/net/online.ts`), l'événement pour ses abonnés vivants, et
 * l'`onlineManager` en direct — qui, lui, ne dépend d'aucun abonnement.
 */
const setOnline = (value: boolean) => {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  onlineManager.setOnline(value);
};

/**
 * **SOUS UN FILTRE, L'ÉCRAN NE DÉCLARE PAS UNE ABSENCE QUE SES VOISINS
 * DÉMENTENT** (revue #7083, défaut majeur 2).
 *
 * Le défaut mesuré : première page sans aucun réel, `hasMore: true` — l'écran
 * peignait « Aucun réel · Touchez à nouveau la tuile pour tout revoir » SOUS
 * une tuile disant « 2 Réels », avec « Charger plus » juste en dessous. Le
 * geste qui trouverait les réels était présenté comme l'alternative à une
 * phrase jurant qu'il n'y en a pas. iOS interdit cette image :
 * `filteredEmptyState` est MUET tant que `hasMore`
 * (`ProfileUserPostsList.swift:497-510`).
 *
 * Les deux branches du rendu étant DISJOINTES, c'est leur COEXISTENCE qu'il
 * faut mesurer — chaque moitié était déjà verte séparément.
 */
describe('le vide filtré et la page qui reste à lire', () => {
  /** Une première page de POSTES seuls, avec une suite annoncée — exactement
   * la forme que la passerelle sert quand les réels sont plus loin. */
  const seedPostsOnly = (hasMore: boolean) => {
    const page = fixtureAuthorPosts(AUTHOR_ID, null);
    appQueryClient.setQueryData(authorPostsQueryKey(AUTHOR_ID), {
      pages: [
        {
          posts: page.posts.filter((post) => post.type !== 'REEL'),
          pagination: { ...page.pagination, hasMore, nextCursor: hasMore ? 'author:3' : null },
        },
      ],
      pageParams: [undefined],
    });
  };

  test('tant qu’une page reste à lire, l’écran SE TAIT et ne montre que le geste qui trouve', async () => {
    seedPostsOnly(true);
    const el = await mount('kwame-mensah');
    act(() => (el.querySelector('[data-profile-filter="reels"]') as HTMLButtonElement).click());
    expect(el.querySelectorAll('[data-feed-card-id]').length).toBe(0);
    /* La tuile PROMET toujours, et c'est elle qui a raison. */
    expect(text(el.querySelector('[data-profile-tile="reelsCount"] strong'))).toBe('2');
    expect(el.querySelector('[data-profile-posts-empty]')).toBeNull();
    expect(el.querySelector('[data-profile-posts-more]')).not.toBeNull();
  });

  test('la dernière page lue, le vide filtré se DIT — sinon la tuile surmonterait du vide', async () => {
    seedPostsOnly(false);
    const el = await mount('kwame-mensah');
    act(() => (el.querySelector('[data-profile-filter="reels"]') as HTMLButtonElement).click());
    expect(el.querySelector('[data-profile-posts-more]')).toBeNull();
    expect(text(el.querySelector('[data-profile-posts-empty]'))).toContain('Aucun réel');
  });
});

/**
 * **LE BLOCAGE SE LIT PAR SUJET, SUR LE FIL DU PROFIL** (#7125).
 *
 * Il se DÉDUISAIT du panier `GET /blocks`, plafonné à cent lignes
 * (`BLOCKED_PAGE_SIZE`), qu'un effet DRAINAIT page par page jusqu'à y trouver
 * le sujet. Ce drainage fermait le trou de sécurité d'origine — au-delà de la
 * centième ligne, la fiche d'une personne bloquée s'ouvrait entière — mais il
 * laissait intact le défaut qui compte : **pendant le drainage, `blocked` vaut
 * `false`**, donc l'écran rend le contenu de cette personne ET lance sa requête
 * de publications, une page de panier après l'autre, jusqu'à la trouver.
 * Exposition transitoire, et N requêtes pour une question à une ligne.
 *
 * La passerelle sert désormais `blockedByViewer` avec `expand=relation`
 * (`routes/directory/person.ts`, `hasBlocked`) : la réponse arrive AVEC
 * l'identité, il n'y a plus de fenêtre à traverser, et l'écran ne s'abonne plus
 * du tout au panier.
 */
describe('le blocage, lu par SUJET', () => {
  /** `yann` est bloqué dans le corpus (`fixtures-friends.ts`). */
  const BLOCKED_ID = 'u-yann';

  test('un panier VIDE ne dément pas le fil : la carte de blocage est peinte, jamais « Bloquer »', async () => {
    /* La forme exacte d'un lecteur qui a bloqué plus de cent personnes : le
       sujet est ABSENT de ce que le panier a servi. */
    appQueryClient.setQueryData(BLOCKED_USERS_QUERY_KEY, {
      pages: [{ users: [], nextCursor: null }],
      pageParams: [null],
    });
    const el = await mount('yann.legoff');
    expect(el.querySelector('[data-profile-blocked]')).not.toBeNull();
    expect(el.querySelector('[data-profile-action="unblock"]')).not.toBeNull();
    expect(el.querySelector('[data-profile-action="block"]')).toBeNull();
    expect(el.querySelector('[data-profile-posts]')).toBeNull();
  });

  test('la carte est peinte sans qu’AUCUNE page de panier n’ait été servie', async () => {
    const el = await mount('yann.legoff');
    expect(el.querySelector('[data-profile-blocked]')).not.toBeNull();
    /* L'écran ne s'abonne plus au panier : sans observateur, TanStack ne crée
       même pas l'entrée — l'ABSENCE d'état est la preuve, là où un compteur de
       pages aurait mesuré le drainage plutôt que sa disparition. */
    expect(appQueryClient.getQueryState(BLOCKED_USERS_QUERY_KEY)).toBeUndefined();
  });

  /**
   * **LE DÉFAUT QUE LE DRAINAGE NE FERMAIT PAS** — mesuré sur la forme d'un
   * lecteur qui a bloqué plus de cent personnes : première page sans le sujet,
   * une suite annoncée. Le drainage finissait par trouver la personne et la
   * carte arrivait ; mais `dataUpdateCount` du listing de publications valait
   * **1** — le contenu d'une personne bloquée était parti sur le réseau
   * pendant la fenêtre, et le panier avait été tourné pour rien.
   */
  test('la requête de publications ne part JAMAIS — même là où le panier aurait été DRAINÉ', async () => {
    appQueryClient.setQueryData(BLOCKED_USERS_QUERY_KEY, {
      pages: [{ users: [], nextCursor: 'blocked:1' }],
      pageParams: [null],
    });
    const el = await mount('yann.legoff');
    expect(el.querySelector('[data-profile-blocked]')).not.toBeNull();
    expect(appQueryClient.getQueryState(authorPostsQueryKey(BLOCKED_ID))?.dataUpdateCount ?? 0).toBe(0);
    /* Et le panier n'a pas été TOURNÉ : la page semée est la seule. */
    expect(appQueryClient.getQueryData<{ readonly pages: readonly unknown[] }>(BLOCKED_USERS_QUERY_KEY)?.pages.length).toBe(1);
  });
});

/**
 * **L'ISSUE D'UN GESTE SE VOIT** (revue #7083, défaut majeur 3) — la région
 * `role="status"` de `/u/` était `sr-only` INCONDITIONNELLE, là où « Découvrir »
 * peignait une pastille sur les MÊMES clés et le MÊME hook. Un refus de la
 * passerelle défaisait l'état optimiste sans un mot pour un utilisateur voyant.
 */
describe('l’annonce d’un geste relationnel', () => {
  test('elle QUITTE `sr-only` — même loi que « Découvrir » (dimension 6)', async () => {
    const el = await mount('kwame-mensah');
    act(() => (el.querySelector('[data-profile-action="add"]') as HTMLButtonElement).click());
    await settle();
    const region = el.querySelector('[data-profile-announce]');
    expect(text(region)).toBe('Demande envoyée');
    expect(region?.getAttribute('class')).not.toBe('sr-only');
  });
});

/**
 * **« CHARGER PLUS » — SON EFFET, SON ANNONCE, SON FOCUS** (revue #7083,
 * défauts majeurs 4 et 6).
 */
describe('« Charger plus »', () => {
  test('il annonce ce qui est arrivé et rend le focus à la première carte NEUVE', async () => {
    const el = await mount('kwame-mensah');
    const more = el.querySelector('[data-profile-posts-more]') as HTMLButtonElement;
    more.focus();
    const before = el.querySelectorAll('[data-feed-card-id]').length;
    act(() => more.click());
    await settle();
    await settle();
    const cards = [...el.querySelectorAll('[data-feed-card-id]')];
    expect(cards.length).toBeGreaterThan(before);
    expect(text(el.querySelector('[data-profile-announce]'))).toBe(`Publications ajoutées : ${cards.length - before}`);
    /* Le bouton DISPARAÎT sur la dernière page : sans reprise, le focus
       retombait sur `document.body` et il fallait re-tabuler depuis le haut. */
    expect(document.activeElement).toBe(cards[before] ?? null);
  });

  test('hors ligne, le tap n’a AUCUN effet — et le geste est désarmé comme ses trois voisins', async () => {
    const el = await mount('kwame-mensah');
    const before = el.querySelectorAll('[data-feed-card-id]').length;
    await act(async () => setOnline(false));
    const more = el.querySelector('[data-profile-posts-more]') as HTMLButtonElement;
    expect(more.disabled).toBe(true);
    act(() => more.click());
    await settle();
    await settle();
    /* L'EFFET, pas l'attribut : la liste n'a pas bougé, et le bandeau dit
       pourquoi — jamais un contrôle qu'on touche sans rien obtenir. */
    expect(el.querySelectorAll('[data-feed-card-id]').length).toBe(before);
    expect(el.querySelector('[data-profile-offline]')).not.toBeNull();
  });
});

/**
 * **LES DEUX GESTES QUI MANQUAIENT À LA FICHE** (#7188).
 *
 * Le relevé d'ouverture avait trouvé la fiche SAINE — aucun contrôle inerte,
 * la loi 4 tenue partout, et même mieux que sur iOS (la tuile « Stories » y est
 * un bouton mort, ici un `<span>`). Ce qui manquait n'était donc pas à
 * réparer, mais à AJOUTER.
 */
describe('la fiche rend les gestes qui lui manquaient (#7188)', () => {
  /**
   * COMMENTER — le compteur retombait en `<span>` muet parce que l'hôte ne
   * passait pas `onComment` (`feed-post-card.tsx:154-162`) : conforme à la
   * loi 4, un bouton sans effet mentirait — mais la fonction MANQUAIT, alors
   * que le Flux la sert depuis toujours et que `/post/$post` est routé.
   *
   * Le témoin interroge le BOUTON plutôt que le handler : c'est l'effet qui
   * compte, et le dépôt a déjà payé une zone cliquable sans effet (cycle 123).
   */
  test('le compteur de commentaires d’une publication est un bouton', async () => {
    const el = await mount('kwame-mensah');

    expect(el.querySelector('[data-feed-gesture="comment"]')).not.toBe(null);
  });

  /**
   * SA PROPRE FICHE MÈNE À SON ÉDITION. Masquer les gestes relationnels sur soi
   * est juste — on ne s'ajoute pas en ami — mais rien n'était mis à la place :
   * aucun chemin vers `/me`, donc un cul-de-sac.
   */
  test('sur sa propre fiche, un chemin mène à l’édition', async () => {
    const el = await mount('vous');

    const lien = el.querySelector('[data-profile-self] a');
    expect(lien).not.toBe(null);
    expect(lien?.getAttribute('href')).toBe('/me');
    expect(text(lien)).toBe('Modifier mon profil');
  });

  /**
   * LE CONTRE-TÉMOIN — sans lui, on pourrait poser l'entrée d'édition sur
   * TOUTES les fiches, et proposer à chacun de modifier le profil d'un autre.
   */
  test('sur la fiche d’un tiers, aucune entrée d’édition', async () => {
    const el = await mount('kwame-mensah');

    expect(el.querySelector('[data-profile-self]')).toBe(null);
  });
});

/**
 * **LE BOUTON OUVRE VRAIMENT LA FEUILLE** (#7187).
 *
 * Les témoins du port (`lib/api/reports.test.ts`) prouvent que la RÈGLE est
 * juste ; les inventaires d'actions prouvent que le bouton EXISTE. Aucun des
 * deux ne prouve que le bouton OUVRE quelque chose — et c'est précisément la
 * distance que ce dépôt a payée cinq fois cette semaine : un mécanisme écrit,
 * testé, et que rien n'active.
 *
 * Ce témoin a été ajouté APRÈS coup, en relisant le lot : il manquait, et rien
 * ne l'aurait dit.
 */
describe('signaler ouvre la feuille des motifs (#7187)', () => {
  test('aucune feuille tant qu’on n’a pas demandé à signaler', async () => {
    const el = await mount('kwame-mensah');

    expect(el.querySelector('[data-report-reason]')).toBe(null);
  });

  test('le bouton « Signaler » la fait apparaître, avec les HUIT motifs', async () => {
    const el = await mount('kwame-mensah');

    const bouton = el.querySelector<HTMLButtonElement>('[data-profile-action="report"]');
    expect(bouton).not.toBe(null);
    await act(async () => bouton?.click());
    await settle();

    const motifs = [...document.querySelectorAll('[data-report-reason]')].map((n) =>
      n.getAttribute('data-report-reason'),
    );
    expect(motifs).toEqual([
      'spam',
      'inappropriate',
      'harassment',
      'violence',
      'hate_speech',
      'fake_profile',
      'impersonation',
      'other',
    ]);
  });

  /** ET ELLE EXPLIQUE CE QU'ELLE FAIT : une liste de motifs sans phrase laisse
      deviner à qui va le signalement, et ce qu'il déclenche. */
  test('elle dit à qui le signalement s’adresse', async () => {
    const el = await mount('kwame-mensah');

    await act(async () => el.querySelector<HTMLButtonElement>('[data-profile-action="report"]')?.click());
    await settle();

    expect(text(document.querySelector('[data-report-body]'))).toContain('modération');
  });
});
