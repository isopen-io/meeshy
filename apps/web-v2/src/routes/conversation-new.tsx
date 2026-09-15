import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from 'zustand/react';

import { Glyph } from '@/components/glyph';
import { Avatar } from '@/components/avatar';
import { createDirectConversation, CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import { flattenFriendRequests, friendRequestsQueryOptions, type PersonSummary } from '@/lib/api/friend-requests';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { searchUsers } from '@/lib/api/users-search';
import { resolveViewer } from '@/lib/api/viewer';
import { candidatesFor, friendsOf } from '@/lib/conversation-new/candidates';
import { CREATION_FAILED, creationOutcomeOf } from '@/lib/conversation-new/creation';
import { useOnline } from '@/lib/net/online';
import { coldStateOf, type ColdState } from '@/lib/view/cold-state';
import { initialsOf } from '@/lib/view/conversation';
import { useExhaustPages } from '@/lib/view/use-exhaust-pages';
import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import { Link, href, navigate } from '@/routes/route-table';

/**
 * **NOUVELLE CONVERSATION** (#5652, bloc D ; #6705) — la tranche de
 * `NewConversationView` (`NewConversationView.swift`) : les AMIS d'abord, puis
 * chercher au-delà (`GET /directory/people`, § 3.4), créer un DIRECT
 * (`POST /conversations`, § 3.5, idempotent côté serveur), ouvrir le fil. La
 * création de GROUPE reste hors lot (#6706).
 *
 * LES AMIS D'ABORD (#6705, directive porteur 2026-09-15 : « que ça charge ses
 * amis en premier en cache local »). Le panier des amitiés acceptées vit dans le
 * cache PERSISTÉ de TanStack Query (`api/query-client.ts`, restauré avant le
 * premier rendu) : l'écran peint les amis dès l'ouverture, sans frappe, et sans
 * aucune attente dès qu'un écran les a déjà chargés — la revalidation les
 * remplace en arrière-plan. La frappe les filtre localement, instantanément ; la
 * recherche globale ne vient qu'EN PLUS, dès deux caractères, et n'ajoute que ce
 * que les amis ne contiennent pas (`lib/conversation-new/candidates.ts`). Le
 * lecteur n'y figure jamais : la passerelle refuse un direct avec soi-même.
 *
 * ÉTATS DESSINÉS, jamais un écran blanc (revue #5652) : l'attente des amis
 * (seulement sur cache vide), leur échec ; puis, pendant une recherche, son
 * attente, son échec (`role="alert"` + « Réessayer », la même forme que
 * `ListError` de la Lentille), le vide motivé et l'échec de la création. Une
 * recherche en erreur rendait autrefois `results.data === undefined`, donc un
 * écran BLANC qui ressemble à « personne ne correspond » — la leçon « erreur
 * avalée en VIDE = vide légitime » du dépôt.
 *
 * LA RECHERCHE EST AMORTIE (`SEARCH_DEBOUNCE_MS`) — la porte de la passerelle
 * est bornée à 30 recherches par minute et par appelant
 * (`routes/directory/people.ts`, `parAppelant`) plus un budget quotidien
 * (`SEARCH_BUDGET_EXCEEDED`) : une requête PAR FRAPPE épuisait ce budget en
 * une phrase tapée, et faisait clignoter la liste à chaque lettre. Le filtre des
 * amis, lui, ne coûte rien : il suit chaque frappe.
 */

/** Le temps qu'une frappe se pose — jamais une requête par caractère. */
const SEARCH_DEBOUNCE_MS = 250;

/** Le minimum que la passerelle accepte (`q` `minLength: 2`) — sous ce seuil
 * elle rend 400, donc on ne l'appelle pas du tout. */
const MIN_QUERY_LENGTH = 2;

export default function ConversationNewScreen() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [creationFailure, setCreationFailure] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const online = useOnline();
  const session = useStore(sessionStore, (state) => state.session);
  const enabled = apiDeps.source === 'fixtures' || session.status === 'authenticated';
  const viewerId = resolveViewer({ source: apiDeps.source, session }).id ?? null;
  const trimmed = debounced.trim();
  const searching = trimmed.length >= MIN_QUERY_LENGTH;
  const typedEnough = query.trim().length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const accepted = useInfiniteQuery({ ...friendRequestsQueryOptions(apiDeps, 'accepted'), enabled }, appQueryClient);
  useExhaustPages(accepted, enabled);
  const friends = useMemo(
    () => friendsOf({ accepted: flattenFriendRequests(accepted.data), viewerId }),
    [accepted.data, viewerId],
  );

  const results = useQuery({
    queryKey: ['users', 'search', trimmed],
    queryFn: async () => {
      const result = await searchUsers(apiDeps, trimmed);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    enabled: searching,
  });

  const view = candidatesFor({ friends, query, searchResults: searching ? results.data : undefined, viewerId });

  const create = useMutation({
    mutationFn: (participantId: string) => createDirectConversation(apiDeps, participantId),
    onSuccess: (result) => {
      /* UN ÉCHEC SE VOIT (revue #5652) — sans cette lecture, un tap sur un
         contact ne faisait RIEN du tout, ni navigation ni message. Un contrôle
         sans effet est le défaut que la loi 4 du dépôt interdit. */
      const outcome = creationOutcomeOf({ result, online });
      if (outcome.kind === 'failure') {
        setCreationFailure(outcome.message);
        return;
      }
      setCreationFailure(null);
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
      navigate(href('thread', { conversation: outcome.conversationId }));
    },
    onError: () => {
      setCreationFailure(CREATION_FAILED);
    },
  });

  const pick = (participantId: string) => create.mutate(participantId);

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <header className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2">
        <Link
          to="list"
          aria-label="Retour"
          className="grid size-11 shrink-0 place-items-center rounded-chip"
          style={{ color: 'var(--color-ios-ink)' }}
        >
          <Glyph name="caretLeft" size={20} />
        </Link>
        <h1 className="flex-1 truncate text-title font-bold" style={{ color: 'var(--color-ios-ink)' }}>
          Nouvelle conversation
        </h1>
      </header>

      <div className="shrink-0 px-4 pb-2">
        <div className="flex items-center gap-2 rounded-[14px] px-4" style={{ minHeight: 44, backgroundColor: 'var(--color-ios-card)' }}>
          <Glyph name="magnifyingGlass" size={18} style={{ color: 'var(--color-ios-ink-3)' }} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Un ami, un nom, un identifiant…"
            aria-label="Rechercher un contact"
            className="w-full bg-transparent py-2 text-body outline-none"
            style={{ color: 'var(--color-ios-ink)' }}
          />
        </div>
      </div>

      {creationFailure === null ? null : (
        <p role="alert" className="shrink-0 px-4 pb-2 text-caption" style={{ color: 'var(--color-error)' }}>
          {creationFailure}
        </p>
      )}

      <div className="flex-1 overflow-y-auto pb-safe">
        <FriendsSection
          state={coldStateOf(accepted)}
          friends={view.friends}
          hasAnyFriend={friends.length > 0}
          filtering={query.trim() !== ''}
          typedEnough={typedEnough}
          disabled={create.isPending}
          onPick={pick}
          onRetry={() => void accepted.refetch()}
        />
        {searching ? (
          <OthersSection
            isError={results.isError}
            isPending={results.isPending}
            others={view.others}
            friendsShown={view.friends.length}
            term={trimmed}
            online={online}
            disabled={create.isPending}
            onPick={pick}
            onRetry={() => void results.refetch()}
          />
        ) : null}
      </div>
    </div>
  );
}

function FriendsSection(props: {
  readonly state: ColdState;
  readonly friends: readonly PersonSummary[];
  readonly hasAnyFriend: boolean;
  readonly filtering: boolean;
  readonly typedEnough: boolean;
  readonly disabled: boolean;
  readonly onPick: (participantId: string) => void;
  readonly onRetry: () => void;
}) {
  /* LE SQUELETTE N'EXISTE QUE SUR CACHE VIDE — `coldStateOf` rend `ready` dès
     que le cache persisté porte le panier, même périmé : aucune attente n'est
     peinte devant des amis déjà connus. */
  if (props.state === 'loading') {
    return (
      <p aria-live="polite" className="px-4 py-6 text-center text-title" style={{ color: 'var(--color-ios-ink-3)' }}>
        Chargement de vos amis…
      </p>
    );
  }
  if (props.state === 'offline' || props.state === 'error') {
    return (
      <div role="alert" className="grid justify-items-center gap-3 px-6 py-6 text-center">
        <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {props.state === 'offline' ? 'Hors ligne' : 'Vos amis sont indisponibles'}
        </p>
        <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {props.state === 'offline'
            ? 'Vos amis s’afficheront à la reconnexion.'
            : 'Réessayez, ou cherchez quelqu’un par son nom.'}
        </p>
        {props.state === 'error' ? <RetryButton onRetry={props.onRetry} /> : null}
      </div>
    );
  }
  if (!props.hasAnyFriend) {
    return props.filtering ? null : (
      <p className="px-4 py-6 text-center text-title" style={{ color: 'var(--color-ios-ink-2)' }}>
        Aucun ami pour l’instant — tapez au moins deux caractères pour chercher quelqu’un.
      </p>
    );
  }
  if (props.friends.length === 0) {
    return props.typedEnough ? null : (
      <p className="px-4 py-4 text-center text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
        Aucun ami ne correspond — tapez au moins deux caractères pour chercher au-delà.
      </p>
    );
  }
  return (
    <section aria-labelledby="nouvelle-conversation-amis">
      <h2 id="nouvelle-conversation-amis" className="px-4 pt-3 pb-1 text-caption font-semibold" style={{ color: 'var(--color-ios-ink-3)' }}>
        Vos amis
      </h2>
      <ul>
        {props.friends.map((person) => (
          <PersonRow key={person.id} person={person} disabled={props.disabled} onPick={props.onPick} />
        ))}
      </ul>
    </section>
  );
}

function OthersSection(props: {
  readonly isError: boolean;
  readonly isPending: boolean;
  readonly others: readonly PersonSummary[];
  readonly friendsShown: number;
  readonly term: string;
  readonly online: boolean;
  readonly disabled: boolean;
  readonly onPick: (participantId: string) => void;
  readonly onRetry: () => void;
}) {
  return (
    <section aria-labelledby="nouvelle-conversation-autres">
      <h2 id="nouvelle-conversation-autres" className="px-4 pt-3 pb-1 text-caption font-semibold" style={{ color: 'var(--color-ios-ink-3)' }}>
        Autres personnes
      </h2>
      <ul>
        {props.isError ? (
          <li role="alert" className="grid justify-items-center gap-3 px-6 py-8 text-center">
            <span style={{ color: 'var(--color-error)' }}>
              <Glyph name="warningCircle" size={28} />
            </span>
            <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
              {props.online ? 'Recherche indisponible' : 'Hors ligne'}
            </p>
            <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              {props.online
                ? 'Réessayez dans un instant — personne n’a été ajouté.'
                : 'La recherche reprendra à la reconnexion.'}
            </p>
            <RetryButton onRetry={props.onRetry} />
          </li>
        ) : props.isPending ? (
          /*
            LE TEMPS DE LA RECHERCHE EST UN ÉTAT (revue #5652) — la politique de
            reprise du dépôt (`shouldRetry`, `api/query-client.ts`) retente DEUX
            fois un échec non-refus, avec un délai qui double : ~10 s MESURÉES
            entre la frappe et l'alerte quand la passerelle ne répond pas. Un
            texte, pas un spinner : une recherche neuve n'a pas de cache.
          */
          <li aria-live="polite" className="px-4 py-6 text-center text-title" style={{ color: 'var(--color-ios-ink-3)' }}>
            Recherche en cours…
          </li>
        ) : props.others.length === 0 ? (
          props.friendsShown === 0 ? (
            <li className="px-4 py-6 text-center text-title" style={{ color: 'var(--color-ios-ink-2)' }}>
              Personne ne correspond à « {props.term} ».
            </li>
          ) : null
        ) : (
          props.others.map((person) => (
            <PersonRow key={person.id} person={person} disabled={props.disabled} onPick={props.onPick} />
          ))
        )}
      </ul>
    </section>
  );
}

function PersonRow(props: {
  readonly person: PersonSummary;
  readonly disabled: boolean;
  readonly onPick: (participantId: string) => void;
}) {
  const name = props.person.displayName ?? props.person.username;
  return (
    <li>
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => props.onPick(props.person.id)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-50"
        style={{ minHeight: 44 }}
      >
        <Avatar initials={initialsOf(name)} color={colorForName(name)} size={40} />
        <span className="flex-1 truncate text-body font-medium" style={{ color: 'var(--color-ios-ink)' }}>
          {name}
        </span>
      </button>
    </li>
  );
}

function RetryButton(props: { readonly onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onRetry}
      className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
      style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
    >
      Réessayer
    </button>
  );
}
