import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

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
    expect(titles).toEqual(['CONNEXION', 'PUBLICATIONS', 'STATISTIQUES']);
  });

  test('le bandeau porte les comptes SERVIS, et le listing les publications de CET auteur', async () => {
    const el = await mount('kwame-mensah');
    expect(text(el.querySelector('[data-profile-tile="postsCount"]'))).toContain('3');
    expect([...el.querySelectorAll('[data-feed-card-id]')].length).toBeGreaterThan(0);
  });

  test('la relation servie « aucune » offre Ajouter, Écrire, Bloquer', async () => {
    const el = await mount('kwame-mensah');
    expect(el.querySelector('[data-profile-relation]')?.getAttribute('data-profile-relation')).toBe('none');
    expect([...el.querySelectorAll('[data-profile-action]')].map((n) => n.getAttribute('data-profile-action'))).toEqual(['add', 'write', 'block']);
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
    ]);
    expect(text(el.querySelector('[data-profile-context]'))).toContain('Amina Diallo');
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
