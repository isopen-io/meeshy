import { InfiniteQueryObserver, QueryObserver, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { appPreferencesQueryOptions } from './app-preferences';
import { blockedUsersQueryOptions } from './blocks';
import { communitiesQueryOptions, communityConversationsQueryOptions, communityQueryOptions } from './communities';
import { fixtureCommunities } from './fixtures-communities';
import { FEED_POSTS } from './fixtures-feed';
import { friendRequestsQueryOptions } from './friend-requests';
import type { ApiResult, HttpTransport } from './http';
import { shareLinksQueryOptions } from './links';
import { myProfileQueryOptions, myStatsQueryOptions } from './profile';
import { postQueryOptions } from './publication-detail';
import { createAppQueryClient, type StorageLike } from './query-client';

/**
 * **LA FRAÎCHEUR DES FAMILLES QUASI-IMMUABLES** (#6974) — des témoins de
 * COMPORTEMENT, jamais de source.
 *
 * Un témoin qui lirait `staleTime: 300_000` dans la fabrique ne prouverait
 * RIEN : la valeur peut être posée au mauvais endroit de l'objet, écrasée par
 * l'appelant qui la respread, ou simplement pas consultée. Ce qui se mesure
 * ici est l'EFFET — un montage dans la fenêtre de fraîcheur ne déclenche AUCUN
 * appel réseau — et il se mesure sur le VRAI observateur TanStack
 * (`QueryObserver` / `InfiniteQueryObserver`, la machinerie que `useQuery` et
 * `useInfiniteQuery` instancient), à travers les VRAIES options de fabrique.
 *
 * Le cycle de chaque famille est le même, en trois temps :
 *
 * 1. **premier montage, cache vide** ⇒ un appel (le chargement initial) ;
 * 2. le cache VIEILLIT de 31 s — juste au-delà du `staleTime` par DÉFAUT de
 *    l'application (`query-client.ts:234`, 30 s) — puis on remonte : le
 *    compteur doit rester à 1. C'est l'assertion qui rougit sans le correctif,
 *    et la seule qui distingue « la fabrique déclare une fenêtre » de « le
 *    défaut de 30 s s'applique encore » ;
 * 3. le cache vieillit AU-DELÀ de la fenêtre déclarée, puis on remonte : un
 *    appel de plus. Elle borne la valeur PAR LE HAUT — un `staleTime: Infinity`
 *    posé par distraction ferait rougir ce troisième temps.
 *
 * Le vieillissement passe par `setQueryData(clé, identité, { updatedAt })` :
 * l'horloge de TanStack est `Date.now()`, et `updatedAt` est le SEUL levier
 * public qui la déplace sans mocker le temps global du process.
 *
 * Les ports tournent en source `fixtures` (la valeur de `bunfig.toml`), donc
 * sur leur VRAI `queryFn` : le compteur enveloppe l'appel réel, il ne le
 * remplace pas. Le transport réseau est une CHAUSSE-TRAPPE — si une famille
 * sortait de la branche fixtures, le témoin exploserait plutôt que de compter
 * un appel fantôme.
 */

const transportJamaisAppele: HttpTransport = Object.assign(
  () => {
    throw new Error('aucun appel réseau ne doit partir de ce témoin');
  },
  {
    request: (): Promise<ApiResult<never>> => {
      throw new Error('aucun appel réseau ne doit partir de ce témoin');
    },
  },
) as unknown as HttpTransport;

const deps = { source: 'fixtures' as const, transport: transportJamaisAppele };

function fakeStorage(): StorageLike {
  const raw = new Map<string, string>();
  return {
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => {
      raw.set(key, value);
    },
    removeItem: (key) => {
      raw.delete(key);
    },
  };
}

/** Le client RÉEL de l'application, defaults compris (`staleTime` 30 s,
 * `gcTime` 24 h) : c'est contre CE défaut que la fenêtre de chaque famille se
 * mesure. Le stockage est injecté, jamais `localStorage`. */
const banc = (nom: string): QueryClient => createAppQueryClient({ storage: fakeStorage(), buster: `0.0.0-test:${nom}` });

type Observateur = {
  subscribe(ecouteur: () => void): () => void;
  getCurrentResult(): { readonly isFetching: boolean; readonly data: unknown; readonly error: unknown };
};

const tour = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Un MONTAGE, puis un DÉMONTAGE — `subscribe` est ce que fait `useQuery` au
 * montage, et le retour de `subscribe` ce qu'il fait au démontage. Les deux
 * observateurs de TanStack partagent cette forme, d'où le type structurel.
 *
 * **L'attente est BORNÉE mais pas d'un seul tour** (mesuré) : les ports en
 * source `fixtures` chargent leur corpus par `import()` dynamique, dont le
 * PREMIER passage prend plus d'un tour de boucle. Se désabonner pendant le vol
 * ANNULE la requête (query-core revient à l'état d'avant), la donnée n'entre
 * jamais en cache, et le montage suivant refetche — le témoin rougissait alors
 * pour une raison qui n'a rien à voir avec `staleTime`, de façon dépendante du
 * poids du module de fixtures. On démonte donc quand le vol est POSÉ.
 */
const monteur = (creer: () => Observateur) => async (): Promise<void> => {
  const observateur = creer();
  const desabonner = observateur.subscribe(() => undefined);
  await tour();
  for (let tours = 0; tours < 200; tours += 1) {
    const resultat = observateur.getCurrentResult();
    if (!resultat.isFetching && (resultat.data !== undefined || resultat.error !== null)) break;
    await tour();
  }
  desabonner();
};

const vieillir = (client: QueryClient, cle: QueryKey, age: number): void => {
  client.setQueryData(cle, (donnee) => donnee, { updatedAt: Date.now() - age });
};

const CINQ_MINUTES = 5 * 60_000;
const TRENTE_MINUTES = 30 * 60_000;
/** 31 s : juste AU-DELÀ du `staleTime` par défaut de l'application. */
const AU_DELA_DU_DEFAUT = 31_000;

type Famille = {
  readonly nom: string;
  readonly fenetre: number;
  readonly client: QueryClient;
  readonly cle: QueryKey;
  readonly monter: () => Promise<void>;
  readonly appels: () => number;
};

function profilDeSoi(): Famille {
  const client = banc('profil');
  const options = myProfileQueryOptions(deps);
  let appels = 0;
  return {
    nom: 'profil de soi',
    fenetre: TRENTE_MINUTES,
    client,
    cle: options.queryKey,
    appels: () => appels,
    monter: monteur(
      () =>
        new QueryObserver(client, {
          ...options,
          queryFn: (contexte: { readonly signal?: AbortSignal }) => {
            appels += 1;
            return options.queryFn(contexte);
          },
        }),
    ),
  };
}

function statsDeSoi(): Famille {
  const client = banc('stats');
  const options = myStatsQueryOptions(deps);
  let appels = 0;
  return {
    nom: 'stats de soi',
    fenetre: CINQ_MINUTES,
    client,
    cle: options.queryKey,
    appels: () => appels,
    monter: monteur(
      () =>
        new QueryObserver(client, {
          ...options,
          queryFn: (contexte: { readonly signal?: AbortSignal }) => {
            appels += 1;
            return options.queryFn(contexte);
          },
        }),
    ),
  };
}

function preferences(): Famille {
  const client = banc('preferences');
  const options = appPreferencesQueryOptions(deps);
  let appels = 0;
  return {
    nom: 'préférences d’application',
    fenetre: TRENTE_MINUTES,
    client,
    cle: options.queryKey,
    appels: () => appels,
    monter: monteur(
      () =>
        new QueryObserver(client, {
          ...options,
          queryFn: (contexte: { readonly signal?: AbortSignal }) => {
            appels += 1;
            return options.queryFn(contexte);
          },
        }),
    ),
  };
}

function communauteDetail(): Famille {
  const client = banc('communaute');
  const premiere = fixtureCommunities('', 0).communities[0];
  if (premiere === undefined) throw new Error('le corpus des communautés est vide');
  const options = communityQueryOptions(deps, premiere.id);
  let appels = 0;
  return {
    nom: 'détail d’une communauté',
    fenetre: CINQ_MINUTES,
    client,
    cle: options.queryKey,
    appels: () => appels,
    monter: monteur(
      () =>
        new QueryObserver(client, {
          ...options,
          queryFn: (contexte: { readonly signal?: AbortSignal }) => {
            appels += 1;
            return options.queryFn(contexte);
          },
        }),
    ),
  };
}

function publicationDetail(): Famille {
  const client = banc('publication');
  const premiere = FEED_POSTS[0];
  if (premiere === undefined) throw new Error('le corpus du fil est vide');
  const options = postQueryOptions({ ...deps, postId: premiere.id });
  let appels = 0;
  return {
    nom: 'détail d’une publication',
    fenetre: CINQ_MINUTES,
    client,
    cle: options.queryKey,
    appels: () => appels,
    monter: monteur(
      () =>
        new QueryObserver(client, {
          ...options,
          queryFn: (contexte: { readonly signal: AbortSignal }) => {
            appels += 1;
            return options.queryFn(contexte);
          },
        }),
    ),
  };
}

function demandesRecues(): Famille {
  const client = banc('demandes');
  const options = friendRequestsQueryOptions(deps, 'received');
  let appels = 0;
  return {
    nom: 'demandes d’amitié (panier reçues)',
    fenetre: CINQ_MINUTES,
    client,
    cle: options.queryKey,
    appels: () => appels,
    monter: monteur(
      () =>
        new InfiniteQueryObserver(client, {
          ...options,
          queryFn: (contexte: { readonly pageParam: string | null; readonly signal?: AbortSignal }) => {
            appels += 1;
            return options.queryFn(contexte);
          },
        }),
    ),
  };
}

function bloques(): Famille {
  const client = banc('bloques');
  const options = blockedUsersQueryOptions(deps);
  let appels = 0;
  return {
    nom: 'bloqués',
    fenetre: CINQ_MINUTES,
    client,
    cle: options.queryKey,
    appels: () => appels,
    monter: monteur(
      () =>
        new InfiniteQueryObserver(client, {
          ...options,
          queryFn: (contexte: { readonly pageParam: string | null; readonly signal?: AbortSignal }) => {
            appels += 1;
            return options.queryFn(contexte);
          },
        }),
    ),
  };
}

function liensDePartage(): Famille {
  const client = banc('liens');
  const options = shareLinksQueryOptions(deps);
  let appels = 0;
  return {
    nom: 'liens de partage',
    fenetre: CINQ_MINUTES,
    client,
    cle: options.queryKey,
    appels: () => appels,
    monter: monteur(
      () =>
        new InfiniteQueryObserver(client, {
          ...options,
          queryFn: (contexte: { readonly pageParam: number; readonly signal?: AbortSignal }) => {
            appels += 1;
            return options.queryFn(contexte);
          },
        }),
    ),
  };
}

function communautesListe(): Famille {
  const client = banc('communautes');
  const options = communitiesQueryOptions(deps, '');
  let appels = 0;
  return {
    nom: 'communautés (liste)',
    fenetre: CINQ_MINUTES,
    client,
    cle: options.queryKey,
    appels: () => appels,
    monter: monteur(
      () =>
        new InfiniteQueryObserver(client, {
          ...options,
          queryFn: (contexte: { readonly pageParam: number; readonly signal?: AbortSignal }) => {
            appels += 1;
            return options.queryFn(contexte);
          },
        }),
    ),
  };
}

function communauteConversations(): Famille {
  const client = banc('communaute-conversations');
  const premiere = fixtureCommunities('', 0).communities[0];
  if (premiere === undefined) throw new Error('le corpus des communautés est vide');
  const options = communityConversationsQueryOptions(deps, premiere.id);
  let appels = 0;
  return {
    nom: 'conversations d’une communauté',
    fenetre: CINQ_MINUTES,
    client,
    cle: options.queryKey,
    appels: () => appels,
    monter: monteur(
      () =>
        new InfiniteQueryObserver(client, {
          ...options,
          queryFn: (contexte: { readonly pageParam: number; readonly signal?: AbortSignal }) => {
            appels += 1;
            return options.queryFn(contexte);
          },
        }),
    ),
  };
}

const FAMILLES: readonly (() => Famille)[] = [
  profilDeSoi,
  statsDeSoi,
  preferences,
  demandesRecues,
  bloques,
  liensDePartage,
  communautesListe,
  communauteDetail,
  communauteConversations,
  publicationDetail,
];

describe('la fraîcheur des familles quasi-immuables (#6974)', () => {
  for (const fabrique of FAMILLES) {
    test(`${fabrique().nom} — un remontage 31 s plus tard ne tire AUCUN appel, la fenêtre écoulée en tire un`, async () => {
      const famille = fabrique();

      await famille.monter();
      expect(famille.appels()).toBe(1);

      // DÉMONTÉ, puis REMONTÉ tout de suite : rien ne change.
      await famille.monter();
      expect(famille.appels()).toBe(1);

      // 31 s plus tard — le défaut de 30 s aurait refetché ici.
      vieillir(famille.client, famille.cle, AU_DELA_DU_DEFAUT);
      await famille.monter();
      expect(famille.appels()).toBe(1);

      // La fenêtre déclarée est ÉCOULÉE : la donnée se relit.
      vieillir(famille.client, famille.cle, famille.fenetre + 60_000);
      await famille.monter();
      expect(famille.appels()).toBe(2);
    });
  }
});

/**
 * **CE QUI REND UNE FENÊTRE INERTE** (#6974) — un appelant qui REPOSE
 * `staleTime` après avoir répandu la fabrique GAGNE : c'est l'ordre des clés
 * d'un littéral, rien d'autre. Trois sites du dépôt le font aujourd'hui, et
 * deux le font EXPRÈS (`query.ts#usePost` et `routes/community.tsx`, tous deux
 * à `staleTime: 0`, compensés par `initialData` — hors périmètre de #6974 par
 * décision). Ce témoin fixe le mécanisme pour qu'on ne le redécouvre pas : la
 * valeur d'une fabrique ne vaut que chez les appelants qui la LAISSENT.
 */
describe('un appelant qui repose staleTime écrase la fenêtre de la fabrique', () => {
  test('`staleTime: 0` posé APRÈS le répandage rend la fenêtre de la fabrique inerte', async () => {
    const client = banc('ecrasement');
    const options = myProfileQueryOptions(deps);
    let appels = 0;
    const monter = monteur(
      () =>
        new QueryObserver(client, {
          ...options,
          queryFn: (contexte: { readonly signal?: AbortSignal }) => {
            appels += 1;
            return options.queryFn(contexte);
          },
          staleTime: 0,
        }),
    );

    await monter();
    expect(appels).toBe(1);

    // Une seconde de retard suffit : la fenêtre de la fabrique n'est plus lue.
    vieillir(client, options.queryKey, 1_000);
    await monter();
    expect(appels).toBe(2);
  });
});

/**
 * **LE PLUS IMPATIENT GAGNE** (#6981) — et c'est pour ça qu'un seul site
 * suffisait à annuler la fenêtre de #6974.
 *
 * `usePendingFriendRequestCount` reposait `staleTime: 30_000` APRÈS avoir
 * répandu `friendRequestsQueryOptions`, et son observateur est monté sur
 * **neuf routes** (`lib/view/floating-gate.ts`). Or `query-core` ne fait
 * voter personne : `Query.onFocus()` refetche dès qu'UN SEUL observateur juge
 * la donnée périmée (`query.js:127-131` → `shouldFetchOn`).
 *
 * L'entrée étant INFINIE, ce refetch rejoue **toutes les pages chargées**, à
 * cent lignes la page. Un compte à 350 contacts en charge quatre, puis en
 * rejoue quatre à chaque focus de fenêtre, sur n'importe laquelle des neuf
 * routes.
 *
 * Le témoin monte donc DEUX observateurs sur la même clé — un « patient » aux
 * seules options de fabrique, un « pressé » qui rejoue exactement ce que le
 * site fautif faisait — et mesure l'effet à 31 s, la fenêtre où les deux
 * règles divergent. À 1 s comme à 6 min, elles rendent le même verdict.
 */
describe('deux observateurs sur une clé : le plus impatient décide (#6981)', () => {
  const observateurInfini = (client: QueryClient, surcharge: { readonly staleTime?: number } = {}) => {
    const options = friendRequestsQueryOptions(deps, 'received');
    return {
      options,
      creer: (compter: () => void) =>
        new InfiniteQueryObserver(client, {
          ...options,
          queryFn: (contexte: { readonly pageParam: string | null; readonly signal?: AbortSignal }) => {
            compter();
            return options.queryFn(contexte);
          },
          ...surcharge,
        }),
    };
  };

  test('un observateur PRESSÉ (staleTime 30 s) refetche pour tous — le défaut de #6981', async () => {
    const client = banc('impatient-avant');
    let appels = 0;
    const patient = observateurInfini(client);
    const presse = observateurInfini(client, { staleTime: 30_000 });

    await monteur(() => patient.creer(() => { appels += 1; }))();
    expect(appels).toBe(1);

    // 31 s : au-delà des 30 s du pressé, TRÈS en deçà des 5 min de la fabrique.
    vieillir(client, patient.options.queryKey, AU_DELA_DU_DEFAUT);
    await monteur(() => presse.creer(() => { appels += 1; }))();

    expect(appels).toBe(2);
  });

  test('sans la surcharge, les DEUX respectent la fenêtre de la fabrique — aucun appel', async () => {
    const client = banc('impatient-apres');
    let appels = 0;
    const premier = observateurInfini(client);
    const second = observateurInfini(client);

    await monteur(() => premier.creer(() => { appels += 1; }))();
    expect(appels).toBe(1);

    vieillir(client, premier.options.queryKey, AU_DELA_DU_DEFAUT);
    await monteur(() => second.creer(() => { appels += 1; }))();

    // C'est l'assertion que le site fautif faisait tomber, et la seule qui
    // sépare « la fabrique déclare 5 min » de « quelqu'un a reposé 30 s ».
    expect(appels).toBe(1);
  });

  test('la fenêtre reste BORNÉE par le haut — au-delà de 5 min, un appel de plus', async () => {
    // Sans ce troisième temps, retirer toute fraîcheur (`staleTime: Infinity`)
    // verdirait les deux précédents.
    const client = banc('impatient-borne');
    let appels = 0;
    const premier = observateurInfini(client);
    const second = observateurInfini(client);

    await monteur(() => premier.creer(() => { appels += 1; }))();
    vieillir(client, premier.options.queryKey, CINQ_MINUTES + 1_000);
    await monteur(() => second.creer(() => { appels += 1; }))();

    expect(appels).toBe(2);
  });
});
