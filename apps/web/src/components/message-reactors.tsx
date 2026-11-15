import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import { fetchMessageReactors, messageReactorsQueryKey, type Reactor, type ReactorGroup } from '@/lib/api/reactors';
import { translate } from '@/lib/i18n-catalog';
import { translateMessagePieces } from '@/lib/i18n-message-pieces-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';
import { hasServerMessageId } from '@/lib/view/message-receipts';

import { Avatar } from './avatar';
import { Sheet } from './sheet';

/**
 * « QUI A RÉAGI » (#10583) — la liste nominative que « Plus… » range sous
 * « Réactions », et que l'appui long (ou le clic droit) sur une pilule ouvre
 * seule. Miroir de la feuille de réactions d'iOS
 * (`BubbleReactionsOverlay.onShowReactions`).
 *
 * CACHE-FIRST, EN DEUX TEMPS :
 * - les COMPTES viennent de `Message.reactionSummary`, déjà en mémoire et tenu
 *   par le temps réel : ils se peignent au premier rendu, sans requête ;
 * - les NOMS viennent de `GET /reactions/:messageId` (`api/reactors.ts`). Une
 *   réponse déjà en cache s'affiche aussitôt et se revalide en silence ;
 *   sinon une ligne d'attente tient leur place SOUS les comptes.
 *
 * LES COMPTES FONT FOI. Un emoji que le fil ne compte plus n'a pas de ligne,
 * même si une réponse en cache le nomme encore ; des comptes qui changent
 * pendant que la liste est ouverte relancent la lecture des noms.
 *
 * RIEN N'EST FABRIQUÉ : un réacteur que la passerelle ne nomme pas n'a pas de
 * ligne (le compte dit qu'il existe), et un refus se dit sans rien inventer.
 * Un message encore optimiste n'existe pas côté serveur : aucune requête
 * (`hasServerMessageId`, la garde des accusés nominatifs).
 */
export type ReactorsFetcher = (messageId: string, signal: AbortSignal) => Promise<ApiResult<readonly ReactorGroup[]>>;

const fetchFromGateway: ReactorsFetcher = (messageId, signal) => fetchMessageReactors({ ...apiDeps, messageId, signal });

const NO_GROUPS: readonly ReactorGroup[] = [];

type ReactorsProps = {
  readonly messageId: string;
  /** `reactionEntries(message.reactionSummary)` — connus avant toute requête. */
  readonly reactions: readonly (readonly [string, number])[];
  readonly fetchReactors?: ReactorsFetcher;
};

export function MessageReactors({ messageId, reactions, fetchReactors = fetchFromGateway }: ReactorsProps) {
  const language = currentInterfaceLanguage();
  const query = useQuery({
    queryKey: messageReactorsQueryKey(messageId),
    queryFn: async ({ signal }) => {
      const result = await fetchReactors(messageId, signal);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    enabled: hasServerMessageId(messageId) && reactions.length > 0,
    staleTime: 0,
    retry: false,
  });

  const counted = reactions.map(([emoji, count]) => `${emoji}${count}`).join('|');
  const lastCounted = useRef(counted);
  const { refetch } = query;
  useEffect(() => {
    if (lastCounted.current === counted) return;
    lastCounted.current = counted;
    if (hasServerMessageId(messageId) && counted !== '') void refetch();
  }, [counted, messageId, refetch]);

  const groups = query.data ?? NO_GROUPS;
  const namedBy = (emoji: string): readonly Reactor[] => groups.find((group) => group.emoji === emoji)?.reactors ?? [];
  const waiting = query.data === undefined && query.isFetching;
  const failed = query.data === undefined && query.isError;

  return (
    <>
      {reactions.map(([emoji, count]) => (
        <ReactorGroupRows key={emoji} emoji={emoji} count={count} reactors={namedBy(emoji)} />
      ))}
      {waiting ? (
        <li role="status" className="px-4 pb-2 text-caption" style={{ color: 'var(--color-ios-ink-3)' }} data-message-reactors-loading>
          {translate(language, 'message-detail.loading')}
        </li>
      ) : null}
      {failed ? (
        <li role="alert" className="flex items-center gap-3 px-4 pb-2 text-caption" style={{ color: 'var(--color-ios-ink-3)' }} data-message-reactors-error>
          <span className="flex-1">{translate(language, 'message-detail.load-error')}</span>
          <button
            type="button"
            className="rounded-full px-3 font-semibold"
            style={{ minHeight: 44, color: 'var(--color-primary)' }}
            onClick={() => void refetch()}
            data-message-reactors-retry
          >
            {translate(language, 'message-detail.retry')}
          </button>
        </li>
      ) : null}
    </>
  );
}

function ReactorGroupRows({ emoji, count, reactors }: { readonly emoji: string; readonly count: number; readonly reactors: readonly Reactor[] }) {
  return (
    <>
      <li
        className="flex items-center gap-2.5 px-4 text-body"
        style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}
        data-message-reactors-group={emoji}
      >
        <span aria-hidden>{emoji}</span>
        <span data-message-reactors-count>{count}</span>
      </li>
      {reactors.map((reactor, index) => (
        <li
          key={`${index}-${reactor.name}`}
          className="flex items-center gap-2.5 py-1 ps-10 pe-4 text-body"
          style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}
          data-message-reactor={emoji}
        >
          <Avatar
            initials={initialsOf(reactor.name)}
            color={colorForName(reactor.name)}
            size={28}
            name={reactor.name}
            {...(reactor.avatar === null ? {} : { src: reactor.avatar })}
          />
          <span className="flex-1 truncate" dir="auto" data-message-reactor-name>
            {reactor.name}
          </span>
          <span aria-hidden>{emoji}</span>
        </li>
      ))}
    </>
  );
}

/**
 * LA FEUILLE SEULE — ouverte depuis une pilule. Son seul état propre est le
 * VIDE : la dernière réaction retirée pendant qu'elle est ouverte ne laisse
 * pas une feuille blanche. Son libellé vit dans le catalogue du fil, que
 * l'hôte charge avec la feuille (`thread-sheets.tsx`).
 */
export function MessageReactorsSheet({ onClose, ...list }: ReactorsProps & { readonly onClose: () => void }) {
  const language = currentInterfaceLanguage();
  return (
    <Sheet title={translate(language, 'message.detail.reactions')} onClose={onClose} dialogData={{ 'data-message-reactors-sheet': list.messageId }}>
      {list.reactions.length === 0 ? (
        <li className="px-4 py-6 text-center text-body" style={{ color: 'var(--color-ios-ink-3)' }} data-message-reactors-empty>
          {translateMessagePieces(language, 'message.reactors.empty')}
        </li>
      ) : (
        <MessageReactors {...list} />
      )}
    </Sheet>
  );
}
