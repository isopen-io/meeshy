import { useQueries, useQuery } from '@tanstack/react-query';

import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { apiDeps } from '@/lib/api/deps';
import { attachmentStatusDetailsQueryKey, fetchAttachmentStatusDetails, type AttachmentStatusRow } from '@/lib/api/attachments';
import { fetchMessageReceiptsPeople, messageReceiptsPeopleQueryKey, type ReceiptPersonRow } from '@/lib/api/receipts';
import type { Attachment } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';
import { attachmentDurationLabel, formatMediaTime } from '@/lib/view/media-transport';
import { time } from '@/lib/grouping';
import { kindOf } from '@/lib/view/message';
import {
  attachmentAggregateOf,
  playCountLabel,
  positionFraction,
  receiptCategoriesOf,
} from '@/lib/view/message-receipts';

import { Avatar } from './avatar';
import { Glyph } from './glyph';
import type { GlyphName } from './glyphs';

/**
 * LA FICHE « INFOS DU MESSAGE » (#7226, W7) — le CORPS que
 * `message-detail-sheet.tsx` monte pour un message ENVOYÉ (`delivery !==
 * null`, la même garde que la ligne « Envoyé » déjà là). Extrait dans son
 * propre fichier dès l'écriture (note de cadrage) : le critère à lui seul —
 * trois listes nominatives + une carte par pièce jointe avec ouvertures,
 * téléchargements, position et « Nx » — aurait fait franchir à
 * `message-detail-sheet.tsx` le budget de taille (CLAUDE.md) en un seul lot.
 *
 * DEUX REQUÊTES, un seul rendu :
 * - `GET /conversations/:id/receipts?detail=people` — la liste nominative
 *   (`receipts.ts`), catégorisée par `receiptCategoriesOf` (pure,
 *   `lib/view/message-receipts.ts`).
 * - `GET /attachments/:id/status-details` — UNE par pièce jointe du message
 *   (`useQueries`, la liste étant dynamique), invalidée en direct par
 *   `attachment-status:updated` (`api/socket.ts`).
 *
 * Disposition — `MessageViewsDetailView.swift`
 * (`apps/ios/Meeshy/Features/Main/Components/MessageDetail/`) : bandeau de
 * section, ligne « avatar + nom + horodatage/état », carte par pièce
 * (icône, nom, durée, agrégats, puis une ligne par consommateur avec badge
 * « Nx » et barre de progression). Réduite au vocabulaire de jetons déjà en
 * place dans `message-detail-sheet.tsx` (`--color-ios-ink*`), pas de
 * nouvelle palette.
 */
export function MessageReceiptsSheet({
  conversationId,
  messageId,
  attachments,
}: {
  readonly conversationId: string;
  readonly messageId: string;
  readonly attachments: readonly Attachment[];
}) {
  const lang = currentInterfaceLanguage();

  const peopleQuery = useQuery({
    queryKey: messageReceiptsPeopleQueryKey(conversationId, messageId),
    queryFn: async () => {
      const result = await fetchMessageReceiptsPeople({ ...apiDeps, conversationId, messageId });
      if (!result.ok) throw new Error(result.error);
      return result.data.people;
    },
    staleTime: 0,
  });

  const attachmentQueries = useQueries({
    queries: attachments.map((attachment) => ({
      queryKey: attachmentStatusDetailsQueryKey(attachment.id),
      queryFn: async () => {
        const result = await fetchAttachmentStatusDetails({ ...apiDeps, attachmentId: attachment.id });
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      staleTime: 0,
    })),
  });

  return (
    <>
      <li className="px-4 pt-3 pb-1 text-mini font-semibold uppercase" style={{ color: 'var(--color-ios-ink-3)' }} data-message-receipts-title>
        {translate(lang, 'message-detail.info.title')}
      </li>

      {peopleQuery.isLoading ? (
        <li className="px-4 pb-3 text-body" style={{ color: 'var(--color-ios-ink-3)' }} data-message-receipts-loading>
          {translate(lang, 'message-detail.loading')}
        </li>
      ) : peopleQuery.isError ? (
        <li className="flex items-center gap-3 px-4 pb-3 text-body" style={{ color: 'var(--color-ios-ink-3)' }} data-message-receipts-error>
          <span className="flex-1">{translate(lang, 'message-detail.load-error')}</span>
          <button
            type="button"
            className="rounded-full px-3 font-semibold"
            style={{ minHeight: 44, color: 'var(--color-primary)' }}
            onClick={() => void peopleQuery.refetch()}
            data-message-receipts-retry
          >
            {translate(lang, 'message-detail.retry')}
          </button>
        </li>
      ) : (
        <ReceiptPeopleSections people={peopleQuery.data ?? []} lang={lang} />
      )}

      {attachments.map((attachment, index) => {
        const query = attachmentQueries[index];
        return (
          <AttachmentReceiptCard
            key={attachment.id}
            attachment={attachment}
            rows={query?.data ?? []}
            isLoading={query?.isLoading ?? false}
            lang={lang}
          />
        );
      })}
    </>
  );
}

function ReceiptPeopleSections({
  people,
  lang,
}: {
  readonly people: readonly ReceiptPersonRow[];
  readonly lang: InterfaceLanguage;
}) {
  const { readBy, receivedBy, notYet } = receiptCategoriesOf(people);
  // ORDRE iOS — `ViewsFilter.filters = [.sent, .delivered, .read, .notSeen]`
  // (`MessageViewsDetailView.swift:67`) : DISTRIBUÉ avant VU avant PAS VU.
  // C'est aussi l'ordre que le critère du lot énonce (« Reçu par / Vu par /
  // Pas encore »).
  return (
    <>
      <PersonSection
        title={translate(lang, 'message-detail.received-by')}
        empty={translate(lang, 'message-detail.received-by.empty')}
        people={receivedBy}
        glyph="check"
        tint="var(--color-ios-ink-3)"
        section="received-by"
        timeOf={(person) => (person.receivedAt === null ? null : time(person.receivedAt))}
      />
      <PersonSection
        title={translate(lang, 'message-detail.read-by')}
        empty={translate(lang, 'message-detail.read-by.empty')}
        people={readBy}
        glyph="checks"
        tint="var(--color-read)"
        section="read-by"
        timeOf={(person) => (person.readAt === null ? null : time(person.readAt))}
      />
      <PersonSection
        title={translate(lang, 'message-detail.not-yet')}
        empty={translate(lang, 'message-detail.not-yet.empty')}
        people={notYet}
        glyph={null}
        tint="var(--color-ios-ink-3)"
        section="not-yet"
        timeOf={() => null}
      />
    </>
  );
}

function PersonSection({
  title,
  empty,
  people,
  glyph,
  tint,
  section,
  timeOf,
}: {
  readonly title: string;
  readonly empty: string;
  readonly people: readonly ReceiptPersonRow[];
  readonly glyph: GlyphName | null;
  readonly tint: string;
  readonly section: 'read-by' | 'received-by' | 'not-yet';
  /**
   * L'HEURE DE CET ACCUSÉ (#7352, V4) — `receivedAt`/`readAt` sont SERVIS
   * par `fetchMessageReceiptsPeople` depuis toujours (`api/receipts.ts:99-
   * 106`), jamais RENDUS avant ce lot. `null` ⇒ rien peint (« Pas encore »
   * n'a ni l'un ni l'autre, `receiptCategoriesOf`) : chaque SECTION lit le
   * SEUL champ que sa catégorie affirme, jamais les deux — `time()`
   * (`lib/grouping.ts`), le même SSOT que l'horodatage de la bulle.
   */
  readonly timeOf: (person: ReceiptPersonRow) => string | null;
}) {
  return (
    <>
      <li
        className="px-4 pt-2 pb-1 text-mini font-semibold uppercase"
        style={{ color: 'var(--color-ios-ink-3)' }}
        data-message-receipts-section={section}
      >
        {title}
        {people.length > 0 ? <span style={{ color: tint }}> · {people.length}</span> : null}
      </li>
      {people.length === 0 ? (
        <li className="px-4 pb-2 text-caption" style={{ color: 'var(--color-ios-ink-3)' }} data-message-receipts-section-empty={section}>
          {empty}
        </li>
      ) : (
        people.map((person) => (
          <li
            key={person.participantId}
            className="flex items-center gap-2.5 px-4 text-body"
            style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}
            data-message-receipts-person={person.participantId}
          >
            <Avatar
              initials={initialsOf(person.displayName)}
              color={colorForName(person.displayName)}
              size={28}
              name={person.displayName}
              {...(person.avatar === null ? {} : { src: person.avatar })}
            />
            <span className="flex-1 truncate">{person.displayName}</span>
            {((personTime) =>
              personTime === null ? null : (
                <span className="text-mini" style={{ color: 'var(--color-ios-ink-3)' }} data-message-receipts-person-time>
                  {personTime}
                </span>
              ))(timeOf(person))}
            {glyph !== null ? <Glyph name={glyph} size={16} style={{ color: tint }} /> : null}
          </li>
        ))
      )}
    </>
  );
}

function AttachmentReceiptCard({
  attachment,
  rows,
  isLoading,
  lang,
}: {
  readonly attachment: Attachment;
  readonly rows: readonly AttachmentStatusRow[];
  readonly isLoading: boolean;
  readonly lang: InterfaceLanguage;
}) {
  const kind = kindOf(attachment);
  const { opens, downloads } = attachmentAggregateOf(rows);
  const name = attachment.title !== undefined && attachment.title.length > 0 ? attachment.title : attachment.originalName;
  const durationLabel = attachmentDurationLabel(attachment.duration);
  const isTimebased = kind === 'audio' || kind === 'video';
  const kindGlyph: GlyphName = kind === 'audio' ? 'microphone' : kind === 'video' ? 'fillPlay' : kind === 'image' ? 'image' : 'file';

  return (
    <li className="px-4 py-2" data-message-receipts-attachment={attachment.id}>
      <div className="rounded-2xl p-3" style={{ backgroundColor: 'var(--color-ios-card)', border: '1px solid var(--color-hairline)' }}>
        <div className="flex items-center gap-2.5">
          <Glyph name={kindGlyph} size={18} style={{ color: 'var(--color-primary)' }} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-caption font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
              {name}
            </p>
            {durationLabel !== null ? (
              <p className="text-mini" style={{ color: 'var(--color-ios-ink-3)' }}>
                {durationLabel}
              </p>
            ) : null}
          </div>
        </div>

        {isLoading ? (
          <p className="pt-2 text-mini" style={{ color: 'var(--color-ios-ink-3)' }}>
            {translate(lang, 'message-detail.loading')}
          </p>
        ) : (
          <>
            {opens > 0 || downloads > 0 ? (
              <div className="flex flex-wrap gap-3 pt-2 text-mini" style={{ color: 'var(--color-ios-ink-3)' }}>
                {opens > 0 ? <span>{translate(lang, opens === 1 ? 'message-detail.attachment.opens.one' : 'message-detail.attachment.opens.other', { count: String(opens) })}</span> : null}
                {downloads > 0 ? (
                  <span>{translate(lang, downloads === 1 ? 'message-detail.attachment.downloads.one' : 'message-detail.attachment.downloads.other', { count: String(downloads) })}</span>
                ) : null}
              </div>
            ) : null}

            {isTimebased && rows.length === 0 ? (
              <p className="pt-2 text-mini" style={{ color: 'var(--color-ios-ink-3)' }}>
                {translate(lang, kind === 'audio' ? 'message-detail.attachment.listen.empty' : 'message-detail.attachment.watch.empty')}
              </p>
            ) : null}

            {isTimebased
              ? rows.map((row) => <PlaybackRow key={row.participantId} row={row} kind={kind} durationMs={attachment.duration} lang={lang} />)
              : null}
          </>
        )}
      </div>
    </li>
  );
}

function PlaybackRow({
  row,
  kind,
  durationMs,
  lang,
}: {
  readonly row: AttachmentStatusRow;
  readonly kind: 'audio' | 'video';
  readonly durationMs: number | undefined;
  readonly lang: InterfaceLanguage;
}) {
  const complete = kind === 'audio' ? row.listenedComplete : row.watchedComplete;
  const positionMs = kind === 'audio' ? row.lastPlayPositionMs : row.lastWatchPositionMs;
  const count = kind === 'audio' ? row.listenCount : row.watchCount;
  const fraction = positionFraction({ positionMs, complete, ...(durationMs !== undefined ? { durationMs } : {}) });
  const playCount = playCountLabel(count);
  const positionLabel = positionMs !== null && positionMs > 0 ? formatMediaTime(positionMs / 1000) : null;

  return (
    <div className="flex items-center gap-2 pt-2" data-message-receipts-playback={row.participantId}>
      <Avatar
        initials={initialsOf(row.username)}
        color={colorForName(row.username)}
        size={24}
        name={row.username}
        {...(row.avatar === null || row.avatar === undefined ? {} : { src: row.avatar })}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-mini" style={{ color: 'var(--color-ios-ink)' }}>
          {row.username}
        </p>
        {!complete && fraction > 0 ? (
          <div
            className="mt-1 h-1 rounded-full"
            style={{ backgroundColor: 'var(--color-hairline)' }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(fraction * 100)}
            aria-label={row.username}
            {...(positionLabel === null
              ? {}
              : {
                  'aria-valuetext': translate(
                    lang,
                    kind === 'audio' ? 'message-detail.attachment.listened-until' : 'message-detail.attachment.watched-until',
                    { time: positionLabel },
                  ),
                })}
          >
            <div className="h-1 rounded-full" style={{ width: `${fraction * 100}%`, backgroundColor: 'var(--color-primary)' }} />
          </div>
        ) : null}
      </div>
      {playCount !== null ? (
        <span className="text-mini" style={{ color: 'var(--color-ios-ink-3)' }}>
          {playCount}
        </span>
      ) : null}
      {complete ? (
        <Glyph name="check" size={14} style={{ color: 'var(--color-read)' }} title={translate(lang, 'message-detail.attachment.complete')} />
      ) : positionLabel !== null ? (
        <span className="text-mini" style={{ color: 'var(--color-ios-ink-3)' }}>
          {translate(lang, kind === 'audio' ? 'message-detail.attachment.listened-until' : 'message-detail.attachment.watched-until', { time: positionLabel })}
        </span>
      ) : null}
    </div>
  );
}
