import { useQuery } from '@tanstack/react-query';
import { memo, useState } from 'react';
import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';

import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import type { ConversationsDeps } from '@/lib/api/conversations';
import type { PersonSummary } from '@/lib/api/friend-requests';
import { relationLinksQueryOptions, type RelationDeps } from '@/lib/api/relations';
import { watchRealtime, type WatchRealtime } from '@/lib/api/watch-realtime';
import { translateCircles, type CirclesCatalogKey } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { cachedDirectWith } from '@/lib/mood/reply';
import { togetherStore, type TogetherInviteOutcome, type TogetherStoreApi } from '@/lib/together/together-live';
import { useTogetherClient } from '@/lib/together/use-together-client';
import { useCirclesCatalog } from '@/lib/use-circles-catalog';

import { BRAND, BRAND_FILL, FOCUS, INK, INK_2 } from './user-profile-style';

/**
 * **REGARDER OU ÉCOUTER ENSEMBLE, DEPUIS LA FICHE D'UN PROCHE** (#17055, sous-lot
 * web de #17011) — la fiche porte déjà les outils du cercle (Bring, talkie) : on y
 * choisit une vidéo ou un audio de NOTRE conversation directe, un toucher invite.
 *
 * - **Présent dès Proche** : le niveau vient du MÊME cache que la ligne du cercle
 *   (`GET /relations`). Sous Proche, rien. Le serveur rejuge à chaque invitation ;
 *   un `TOGETHER_NOT_ALLOWED` se dit d'une phrase neutre, jamais par sa raison.
 * - **Les médias** sont ceux de la galerie de la conversation, servie par la passerelle
 *   au seul membre, les plus récents d'abord.
 * - Sans conversation directe connue, ou sans média : une phrase qui invite à en
 *   envoyer un, jamais une liste vide.
 */

const LEVELS_WITH_TOGETHER: ReadonlySet<string> = new Set(['CLOSE', 'BLOOD']);
const SHOWN = 6;

const OUTCOME_NOTICE = {
  invited: 'together.outcome.invited',
  'not-allowed': 'together.outcome.notAllowed',
  'rate-limited': 'together.outcome.rateLimited',
  offline: 'together.outcome.offline',
  failed: 'together.outcome.failed',
} as const satisfies Readonly<Record<TogetherInviteOutcome, CirclesCatalogKey>>;

/** Une pièce telle que la galerie de la conversation la sert (`GET /conversations/:id/attachments`). */
export type ListedAttachment = {
  readonly id: string;
  readonly originalName: string;
  readonly mimeType: string;
  readonly createdAt?: string;
  readonly isViewOnce?: boolean;
  readonly isBlurred?: boolean;
  readonly isEncrypted?: boolean;
};

export type TogetherPiece = { readonly attachment: ListedAttachment; readonly media: 'video' | 'audio'; readonly at: number };

const mediaOf = (attachment: ListedAttachment): 'video' | 'audio' | null => {
  const mime = attachment.mimeType.toLowerCase();
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return null;
};

const isListed = (raw: unknown): raw is ListedAttachment => {
  const candidate = raw as Partial<ListedAttachment> | null;
  return typeof candidate === 'object' && candidate !== null && typeof candidate.id === 'string' && typeof candidate.originalName === 'string' && typeof candidate.mimeType === 'string';
};

/** Les vidéos et audios lisibles ensemble, les plus récents d'abord, dédoublonnés. */
export function togetherPieces(attachments: readonly ListedAttachment[]): readonly TogetherPiece[] {
  const seen = new Set<string>();
  return attachments
    .flatMap((attachment): readonly TogetherPiece[] => {
      const media = mediaOf(attachment);
      if (media === null || seen.has(attachment.id) || attachment.isViewOnce === true || attachment.isEncrypted === true) return [];
      seen.add(attachment.id);
      return [{ attachment, media, at: new Date(attachment.createdAt ?? 0).getTime() || 0 }];
    })
    .sort((left, right) => right.at - left.at)
    .slice(0, SHOWN);
}

export const ProfileTogetherRowView = memo(function ProfileTogetherRowView({
  language,
  name,
  pieces,
  onInvite,
}: {
  readonly language: InterfaceLanguage;
  readonly name: string;
  readonly pieces: readonly TogetherPiece[] | null;
  readonly onInvite: (piece: TogetherPiece) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div data-together-row="" className="grid gap-2 rounded-card px-3.5 py-3" style={{ backgroundColor: BRAND_FILL }}>
      <button
        type="button"
        data-together-open=""
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`grid place-items-center rounded-chip px-4 text-body font-bold ${FOCUS}`}
        style={{ minHeight: 52, color: BRAND, border: `1.5px solid ${BRAND}`, outlineColor: BRAND }}
      >
        <span>
          <span aria-hidden="true">🎬 </span>
          {translateCircles(language, 'together.row.title')}
        </span>
      </button>
      {open ? (
        pieces === null || pieces.length === 0 ? (
          <p data-together-empty="" className="text-caption" style={{ color: INK_2 }}>
            {translateCircles(language, 'together.row.empty')}
          </p>
        ) : (
          <>
            <p className="text-caption" style={{ color: INK_2 }}>
              {translateCircles(language, 'together.row.explain', { name })}
            </p>
            <ul className="grid gap-1">
              {pieces.map((piece) => (
                <li key={piece.attachment.id}>
                  <button
                    type="button"
                    data-together-piece={piece.attachment.id}
                    aria-label={translateCircles(language, 'together.row.invite.a11y', { name, file: piece.attachment.originalName })}
                    onClick={() => onInvite(piece)}
                    className={`flex w-full items-center gap-2 rounded-chip px-3 text-start text-body ${FOCUS}`}
                    style={{ minHeight: 44, color: INK, outlineColor: BRAND }}
                  >
                    <span aria-hidden="true">{piece.media === 'video' ? '🎬' : '🎧'}</span>
                    <span className="truncate">{piece.attachment.originalName}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )
      ) : null}
    </div>
  );
});

/**
 * Les vidéos et audios de la conversation directe, par la galerie que la passerelle
 * sert (`GET /conversations/:id/attachments?type=…`, membre seulement) : les plus
 * récents de chaque genre.
 */
async function loadDirectPieces(deps: ConversationsDeps, conversationId: string): Promise<readonly TogetherPiece[]> {
  if (deps.source !== 'gateway') return [];
  const listed = async (type: 'video' | 'audio'): Promise<readonly ListedAttachment[]> => {
    const result = await deps.transport.request<{ readonly attachments?: readonly unknown[] }>({
      method: 'GET',
      path: `${conversationsEndpoints.byConversationIdAttachments(conversationId)}?type=${type}&limit=${SHOWN}`,
    });
    return result.ok ? (result.data?.attachments ?? []).filter(isListed) : [];
  };
  const [videos, audios] = await Promise.all([listed('video'), listed('audio')]);
  return togetherPieces([...videos, ...audios]);
}

function useDirectPieces(deps: ConversationsDeps, conversationId: string | undefined): readonly TogetherPiece[] | null {
  const pieces = useQuery(
    {
      queryKey: ['together-pieces', conversationId ?? ''],
      queryFn: () => loadDirectPieces(deps, conversationId ?? ''),
      enabled: conversationId !== undefined,
      staleTime: 60_000,
    },
    appQueryClient,
  );
  return pieces.data ?? null;
}

export function ProfileTogetherRow({
  language,
  person,
  onNotice,
  deps = apiDeps,
  relationDeps = apiDeps,
  watch = watchRealtime,
  store = togetherStore,
}: {
  readonly language: InterfaceLanguage;
  readonly person: PersonSummary;
  readonly onNotice: (message: string, failed: boolean) => void;
  readonly deps?: ConversationsDeps;
  readonly relationDeps?: RelationDeps;
  readonly watch?: WatchRealtime;
  readonly store?: TogetherStoreApi;
}) {
  const ready = useCirclesCatalog(language);
  const links = useQuery(relationLinksQueryOptions(relationDeps), appQueryClient);
  const level = links.data?.find((candidate) => candidate.userId === person.id)?.effectiveLevel ?? null;
  const allowed = level !== null && LEVELS_WITH_TOGETHER.has(level);
  const conversationId = allowed ? cachedDirectWith(appQueryClient, person.id) : undefined;
  const pieces = useDirectPieces(deps, conversationId);
  const client = useTogetherClient({ watch, store, listen: false });

  if (!ready || !allowed) return null;
  const name = person.displayName ?? person.username;
  const invite = (piece: TogetherPiece): void => {
    if (conversationId === undefined) return;
    void client.invite({ toUserId: person.id, conversationId, attachmentId: piece.attachment.id }).then((outcome) => onNotice(translateCircles(language, OUTCOME_NOTICE[outcome], { name }), outcome !== 'invited'));
  };
  return <ProfileTogetherRowView language={language} name={name} pieces={pieces} onInvite={invite} />;
}
