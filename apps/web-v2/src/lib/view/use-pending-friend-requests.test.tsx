import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { friendRequestsQueryKey } from '@/lib/api/friend-requests';
import { appQueryClient } from '@/lib/api/query-client';

import { usePendingFriendRequestCount } from './use-pending-friend-requests';

/**
 * **L'OBSERVATEUR DE LA PASTILLE NE REPOSE PLUS SA PROPRE FENÊTRE** (#6981).
 *
 * ## Le défaut
 *
 * `usePendingFriendRequestCount` reposait `staleTime: 30_000` **après** avoir
 * répandu `friendRequestsQueryOptions`, dont #6974 avait porté la fenêtre à
 * cinq minutes. Le `staleTime` de la fabrique était donc **mort-né** sur ce
 * chemin — et ce chemin n'est pas marginal : cet observateur est monté sur
 * **neuf routes** (`lib/view/floating-gate.ts`).
 *
 * `query-core` ne fait voter personne : `Query.onFocus()` refetche dès qu'UN
 * SEUL observateur juge la donnée périmée (`query.js:127-131` →
 * `shouldFetchOn`). Le plus impatient gagne. Et comme l'entrée est INFINIE, ce
 * refetch rejoue **toutes les pages chargées**, séquentiellement, à cent
 * lignes la page : un compte à 350 contacts en charge quatre via
 * `useExhaustPages`, puis en rejoue quatre à chaque focus de fenêtre.
 *
 * ## Pourquoi ce témoin monte le VRAI hook
 *
 * Un témoin qui lirait la source ne prouverait rien, et un témoin qui monte
 * un `InfiniteQueryObserver` composé à la main prouverait seulement que
 * TanStack se comporte comme documenté — pas que CE site a cessé de surcharger.
 * L'issue le demande explicitement : « deux observateurs de la même clé, DONT
 * CELUI-CI ».
 *
 * ## Le rang mesuré, et pourquoi c'est le seul
 *
 * **31 secondes** : au-delà des 30 s que le site reposait, très en deçà des
 * 5 min de la fabrique. À 1 s comme à 6 min, les deux règles rendent le même
 * verdict — un témoin écrit là ne pourrait pas tomber.
 *
 * ## Le piège, payé en livrant #6974
 *
 * Se désabonner **pendant le vol** annule la requête : la donnée n'entre
 * jamais en cache, le montage suivant refetche, et le témoin rougit pour une
 * raison sans rapport avec `staleTime` — de façon dépendante du poids du
 * module de fixtures. Ce témoin ne vole donc JAMAIS : il SÈME le cache par
 * `setQueryData` avec son `updatedAt`, puis observe si le montage déclenche
 * un vol. Rien à attendre, rien à annuler.
 */

const CLE = friendRequestsQueryKey('received');

/** 31 s : au-delà des 30 s que le site reposait, très en deçà des 5 min de la fabrique. */
const AU_DELA_DES_TRENTE_SECONDES = 31_000;

/** Une page déjà en cache — la forme que `getNextPageParam` sait lire. */
const pageSemee = () => ({
  pages: [{ requests: [], count: 0, nextCursor: null }],
  pageParams: [null],
});

function Sonde() {
  const nombre = usePendingFriendRequestCount();
  return <span data-count={nombre} />;
}

let hote: HTMLDivElement;
let racine: Root;

describe('la pastille des demandes d’amitié respecte la fenêtre de la fabrique (#6981)', () => {
  beforeAll(() => {
    ensureHappyDomRegistered();
  });

  afterEach(() => {
    act(() => racine.unmount());
    hote.remove();
    appQueryClient.removeQueries({ queryKey: CLE });
  });

  afterAll(async () => {
    await releaseHappyDomIfRegistered();
  });

  const monterAvecCacheAgeDe = (age: number): void => {
    appQueryClient.setQueryData(CLE, pageSemee(), { updatedAt: Date.now() - age });
    hote = document.createElement('div');
    document.body.append(hote);
    racine = createRoot(hote);
    act(() => racine.render(<Sonde />));
  };

  const volEnCours = (): boolean => appQueryClient.getQueryState(CLE)?.fetchStatus === 'fetching';

  test('cache vieux de 31 s : AUCUN vol — la fenêtre de 5 min de la fabrique s’applique', () => {
    monterAvecCacheAgeDe(AU_DELA_DES_TRENTE_SECONDES);

    // C'est l'assertion qui rougit quand le site repose `staleTime: 30_000`,
    // et la seule qui sépare « la fabrique déclare 5 min » de « quelqu'un a
    // reposé 30 s par-dessus ».
    expect(volEnCours()).toBe(false);
  });

  test('cache vieux de 6 min : un vol — la fenêtre reste BORNÉE par le haut', () => {
    // Sans ce second temps, retirer toute fraîcheur (`staleTime: Infinity`)
    // verdirait le premier.
    monterAvecCacheAgeDe(6 * 60_000);

    expect(volEnCours()).toBe(true);
  });

  test('le compteur lit bien la page semée — sans quoi les deux témoins ci-dessus mesureraient une sonde MUETTE', () => {
    monterAvecCacheAgeDe(AU_DELA_DES_TRENTE_SECONDES);

    expect(hote.querySelector('span')?.getAttribute('data-count')).toBe('0');
  });
});
