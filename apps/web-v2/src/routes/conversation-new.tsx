import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Glyph } from '@/components/glyph';
import { Avatar } from '@/components/avatar';
import { httpTransport } from '@/lib/api/client';
import { apiConfig } from '@/lib/api/config';
import { createDirectConversation, CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import { searchUsers, type UserSearchResult } from '@/lib/api/users-search';
import { useOnline } from '@/lib/net/online';
import { initialsOf } from '@/lib/view/conversation';
import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import { Link, href, navigate } from '@/routes/route-table';

/**
 * **NOUVELLE CONVERSATION** (#5652, bloc D) — la tranche MINIMALE de
 * `NewConversationView` (`NewConversationView.swift`) : chercher un contact
 * (`GET /directory/people`, § 3.4), créer un DIRECT (`POST /conversations`,
 * § 3.5, idempotent côté serveur), ouvrir le fil. La création de GROUPE
 * reste hors lot (§ 0 de la spécification).
 *
 * QUATRE ÉTATS DESSINÉS, jamais un écran blanc (revue #5652) : l'invitation à
 * taper (moins de deux caractères), le vide motivé (« personne ne
 * correspond »), l'ÉCHEC de la recherche (`role="alert"` + « Réessayer », la
 * même forme que `ListError` de la Lentille) et l'ÉCHEC de la création. La
 * première forme livrée n'en dessinait que deux : une recherche en erreur
 * rendait `results.data === undefined`, donc la branche `.map` sur un tableau
 * vide — un écran BLANC qui ressemble à « personne ne correspond », c'est-à-dire
 * exactement la leçon « erreur avalée en VIDE = vide légitime » du dépôt.
 *
 * LA RECHERCHE EST AMORTIE (`SEARCH_DEBOUNCE_MS`) — la porte de la passerelle
 * est bornée à 30 recherches par minute et par appelant
 * (`routes/directory/people.ts`, `parAppelant`) plus un budget quotidien
 * (`SEARCH_BUDGET_EXCEEDED`) : une requête PAR FRAPPE épuisait ce budget en
 * une phrase tapée, et faisait clignoter la liste à chaque lettre.
 */

/** Le temps qu'une frappe se pose — jamais une requête par caractère. */
const SEARCH_DEBOUNCE_MS = 250;

/** Le minimum que la passerelle accepte (`q` `minLength: 2`) — sous ce seuil
 * elle rend 400, donc on ne l'appelle pas du tout. */
const MIN_QUERY_LENGTH = 2;

const deps = { source: apiConfig.source, transport: httpTransport };

export default function ConversationNewScreen() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [creationFailure, setCreationFailure] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const online = useOnline();
  const trimmed = debounced.trim();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useQuery({
    queryKey: ['users', 'search', trimmed],
    queryFn: async () => {
      const result = await searchUsers(deps, trimmed);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    enabled: trimmed.length >= MIN_QUERY_LENGTH,
  });

  const create = useMutation({
    mutationFn: (participantId: string) => createDirectConversation(deps, participantId),
    onSuccess: (result) => {
      /* UN ÉCHEC SE VOIT (revue #5652) — `createDirectConversation` rend un
         `ApiResult`, jamais une exception : sans cette branche, un clic sur un
         contact ne faisait RIEN du tout, ni navigation ni message. Un contrôle
         sans effet est le défaut que la loi 4 du dépôt interdit. */
      if (!result.ok) {
        setCreationFailure(
          online
            ? 'Impossible d’ouvrir cette conversation — réessayez dans un instant.'
            : 'Hors ligne — la conversation s’ouvrira à la reconnexion.',
        );
        return;
      }
      setCreationFailure(null);
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
      navigate(href('thread', { conversation: result.data.id }));
    },
    onError: () => {
      setCreationFailure('Impossible d’ouvrir cette conversation — réessayez dans un instant.');
    },
  });

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
            placeholder="Nom ou identifiant…"
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

      <ul className="flex-1 overflow-y-auto pb-safe">
        {trimmed.length < MIN_QUERY_LENGTH ? (
          <li className="px-4 py-6 text-center text-title" style={{ color: 'var(--color-ios-ink-2)' }}>
            Tapez au moins deux caractères pour chercher.
          </li>
        ) : results.isError ? (
          <li role="alert" className="grid justify-items-center gap-3 px-6 py-8 text-center">
            <span style={{ color: 'var(--color-error)' }}>
              <Glyph name="warningCircle" size={28} />
            </span>
            <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
              {online ? 'Recherche indisponible' : 'Hors ligne'}
            </p>
            <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              {online
                ? 'Réessayez dans un instant — personne n’a été ajouté.'
                : 'La recherche reprendra à la reconnexion.'}
            </p>
            <button
              type="button"
              onClick={() => void results.refetch()}
              className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
              style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
            >
              Réessayer
            </button>
          </li>
        ) : results.isPending ? null : results.data?.length === 0 ? (
          <li className="px-4 py-6 text-center text-title" style={{ color: 'var(--color-ios-ink-2)' }}>
            Personne ne correspond à « {trimmed} ».
          </li>
        ) : (
          (results.data ?? []).map((user: UserSearchResult) => (
            <li key={user.id}>
              <button
                type="button"
                disabled={create.isPending}
                onClick={() => create.mutate(user.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-50"
                style={{ minHeight: 44 }}
              >
                <Avatar initials={initialsOf(user.displayName ?? user.username)} color={colorForName(user.displayName ?? user.username)} size={40} />
                <span className="flex-1 truncate text-body font-medium" style={{ color: 'var(--color-ios-ink)' }}>
                  {user.displayName ?? user.username}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
