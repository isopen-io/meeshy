import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';

import { translateSendSheet, type SendSheetCatalogKey } from '@/lib/i18n-send-sheet-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import {
  MAX_CONVERSATION_TARGETS,
  MAX_PUBLISH_CAPTION,
  planSend,
  publishOffered,
  type PublishFormat,
  type SendTarget,
} from '@/lib/send/send-sheet-plan';
import { createSendRun, failedKeysOf, type SendRun, type SendRunState, type SendSheetPorts } from '@/lib/send/send-sheet-run';
import type { SendSheetRequest } from '@/lib/send/send-sheet-store';
import { portailDuNavigateur } from '@/lib/view/invitation';

import { GlyphSvg } from './glyph';
import { SEND_SHEET_GLYPHS } from './glyphs-send-sheet';
import { useSendSheetDirectory, type UseSendSheetDirectory } from './send-sheet-directory';
import { SendSheetFrame, type SendSheetFrameHandle } from './send-sheet-frame';
import {
  planErrorMessageOf,
  previewOf,
  protectedFromPublishing,
  recipientRows,
  statusViewOf,
  type MessageRef,
  type RecipientRow,
} from './send-sheet-model';
import {
  PreviewCard,
  PUBLISH_ORDER,
  PublishChip,
  RecentTile,
  RecipientLine,
  SectionTitle,
  SelectedChip,
  StatusLine,
  type StatusEntry,
} from './send-sheet-parts';
import { BUTTON, GLYPH_SIZE } from './ui-chrome';

/**
 * LA FEUILLE D'ENVOI (#8884, directive porteur 2026-09-30) — UNE feuille pour
 * transférer un message, partager une publication, une pièce ou une image
 * venue d'ailleurs : on choisit UNE personne, PLUSIEURS, un GROUPE, ou l'on
 * PUBLIE en story, post ou réel, avec un message joint.
 *
 * Elle ne décide rien de ce qui part : `planSend` (le plan) et `createSendRun`
 * (le moteur, ports injectés) le font. Elle rend l'aperçu, la légende, les
 * pastilles « Publier » que le contenu admet, les destinataires (cache des
 * conversations, puis les personnes sans conversation), puis l'état de chaque
 * envoi — optimiste dès le geste, rejouable ligne par ligne.
 *
 * **Un envoi réussi se DIT puis se retire** : « Envoyé à N » dans la région
 * vivante, puis la feuille glisse hors de l'écran. Un échec la garde ouverte.
 */

/** Le temps de lire « Envoyé à N » avant que la feuille ne se retire. */
export const SEND_SHEET_SUCCESS_HOLD_MS = 1200;
const NOTICE_MS = 2500;

export type SendSheetPlatform = {
  readonly share?: (data: ShareData) => Promise<void>;
  readonly copy?: (text: string) => Promise<void>;
};

/** Le portail des invitations (#9023) : `navigator.share`, sinon le pont
 * `MeeshyShare` de la coque Android ; la copie avec son repli `execCommand`. */
function browserPlatform(): SendSheetPlatform {
  const { share, copier } = portailDuNavigateur();
  return {
    ...(share === undefined
      ? {}
      : { share: (data: ShareData) => share({ title: data.title ?? '', text: data.text ?? '', url: data.url ?? '' }) }),
    ...(copier === undefined ? {} : { copy: copier }),
  };
}

/** La signature d'IMPLÉMENTATION de `translateSendSheet` : la clé est calculée
 * ici (un état, une limite), donc son jeu de paramètres ne peut pas être
 * inféré — la fonction remplace ce qu'elle trouve et laisse le reste. */
type Say = (key: SendSheetCatalogKey, params?: Readonly<Record<string, string>>) => string;

const sayIn = (language: InterfaceLanguage): Say => {
  const translate = translateSendSheet as (l: InterfaceLanguage, k: SendSheetCatalogKey, p?: Readonly<Record<string, string>>) => string;
  return (key, params) => translate(language, key, params);
};

const sayRef = (say: Say, ref: MessageRef): string => say(ref.key, ref.count === undefined ? undefined : { count: String(ref.count) });

const PUBLISH_LABEL: Readonly<Record<PublishFormat, SendSheetCatalogKey>> = {
  STORY: 'sendSheet.publish.story',
  POST: 'sendSheet.publish.post',
  REEL: 'sendSheet.publish.reel',
};

const subscribeNothing = (): (() => void) => () => undefined;
const nothing = (): null => null;

function useRunState(run: SendRun | null): SendRunState | null {
  return useSyncExternalStore(run?.subscribe ?? subscribeNothing, run?.getState ?? nothing, run?.getState ?? nothing);
}

export function SendSheet({
  request,
  viewerId,
  language,
  contentLanguage,
  ports,
  useDirectory = useSendSheetDirectory,
  platform,
  onClose,
}: {
  readonly request: SendSheetRequest;
  readonly viewerId: string;
  /** La langue d'INTERFACE — celle des libellés. */
  readonly language: InterfaceLanguage;
  /** La langue d'ORIGINE des messages que l'envoi compose (légende, lien). */
  readonly contentLanguage: string;
  readonly ports: SendSheetPorts;
  /** Le répertoire des destinataires — défaut : les caches de l'application. */
  readonly useDirectory?: UseSendSheetDirectory;
  readonly platform?: SendSheetPlatform;
  readonly onClose: () => void;
}) {
  const { payload } = request;
  const say = useMemo(() => sayIn(language), [language]);
  const frame = useRef<SendSheetFrameHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const publishTitleId = useId();
  const [query, setQuery] = useState('');
  const [caption, setCaption] = useState('');
  const [selected, setSelected] = useState<readonly RecipientRow[]>([]);
  const [publish, setPublish] = useState<readonly PublishFormat[]>([]);
  const [run, setRun] = useState<SendRun | null>(null);
  const [planError, setPlanError] = useState<MessageRef | null>(null);
  const [notice, setNotice] = useState('');
  const host = useMemo(() => platform ?? browserPlatform(), [platform]);
  const counted = useRef(false);
  /* Le verrou du départ est SYNCHRONE : `run` n'est lu qu'au rendu suivant, et
     deux clics dans la même tâche lanceraient deux moteurs — deux envois. */
  const launched = useRef(false);
  const reportShared = (): void => {
    if (counted.current) return;
    counted.current = true;
    request.onShared?.();
  };

  const directory = useDirectory({ viewerId, query });
  const rows = useMemo(
    () => recipientRows({ conversations: directory.conversations, friends: directory.friends, searchResults: directory.searchResults, viewerId, query }),
    [directory.conversations, directory.friends, directory.searchResults, viewerId, query],
  );
  const offered = useMemo(() => {
    const allowed = publishOffered(payload);
    return PUBLISH_ORDER.filter((format) => allowed.includes(format));
  }, [payload]);
  const preview = useMemo(() => previewOf(payload), [payload]);
  const runState = useRunState(run);
  const started = run !== null;

  const [initialFocus] = useState(() =>
    directory.conversations.length === 0 && directory.friends.length === 0 && !directory.loading ? captionRef : searchRef,
  );

  const selectedKeys = useMemo(() => new Set(selected.map((row) => row.key)), [selected]);
  const atCap = selected.length >= MAX_CONVERSATION_TARGETS;
  const count = selected.length + publish.length;

  const toggle = useCallback((row: RecipientRow) => {
    setPlanError(null);
    setSelected((current) => {
      if (current.some((known) => known.key === row.key)) return current.filter((known) => known.key !== row.key);
      return current.length >= MAX_CONVERSATION_TARGETS ? current : [...current, row];
    });
  }, []);

  const togglePublish = (format: PublishFormat): void => {
    setPlanError(null);
    setPublish((current) => (current.includes(format) ? current.filter((known) => known !== format) : [...current, format]));
  };

  const send = (): void => {
    if (launched.current) return;
    const targets: readonly SendTarget[] = [...selected.map((row) => row.target), ...publish.map((as): SendTarget => ({ kind: 'publish', as }))];
    const plan = planSend({ payload, targets, caption, viewerId });
    if (!plan.ok) {
      setPlanError(planErrorMessageOf(plan.error));
      return;
    }
    launched.current = true;
    const next = createSendRun({ entries: plan.entries, payload, language: contentLanguage, ports });
    setPlanError(null);
    setRun(next);
    void next.start();
  };

  useEffect(() => {
    if (runState === null || runState.phase !== 'done' || failedKeysOf(runState).length > 0) return;
    setNotice(say('sendSheet.announce.sent', { count: String(runState.order.length) }));
    if (!counted.current) {
      counted.current = true;
      request.onShared?.();
    }
    const timer = setTimeout(() => frame.current?.dismiss(), SEND_SHEET_SUCCESS_HOLD_MS);
    return () => clearTimeout(timer);
  }, [runState, say, request]);

  const waitingNetwork =
    runState !== null && runState.order.some((key) => {
      const status = runState.statuses[key];
      return status?.state === 'failed' && status.failure.kind === 'offline';
    });
  useEffect(() => {
    if (run === null || !waitingNetwork || typeof window === 'undefined') return;
    const resume = () => void run.retryFailed();
    window.addEventListener('online', resume);
    return () => window.removeEventListener('online', resume);
  }, [run, waitingNetwork]);

  useEffect(() => {
    if (notice === '') return;
    const timer = setTimeout(() => setNotice(''), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const url = request.moreOptions?.url;
  const copyLink = (): void => {
    if (url === undefined || host.copy === undefined) return;
    void host.copy(url).then(
      () => {
        setNotice(say('sendSheet.linkCopied'));
        reportShared();
      },
      () => undefined,
    );
  };
  const moreOptions = (): void => {
    if (host.share !== undefined) {
      void host.share(url === undefined ? {} : { url }).then(reportShared, () => undefined);
      return;
    }
    copyLink();
  };

  const entries = useMemo((): readonly StatusEntry[] => {
    if (runState === null) return [];
    const byKey = new Map(selected.map((row) => [row.key, row]));
    return runState.order.map((key) => {
      const row = byKey.get(key);
      const format = PUBLISH_ORDER.find((candidate) => key === `publish:${candidate}`);
      return { key, row, format, label: row?.label ?? (format === undefined ? key : say(PUBLISH_LABEL[format])) };
    });
  }, [runState, selected, say]);

  const failed = runState === null ? 0 : failedKeysOf(runState).length;
  const running = runState !== null && (runState.phase !== 'done' || runState.order.some((key) => runState.statuses[key]?.state === 'sending'));

  const primary = ((): { readonly label: string; readonly disabled: boolean; readonly onPress: () => void } => {
    if (run === null) {
      return { label: count === 0 ? say('sendSheet.send') : say('sendSheet.sendCount', { count: String(count) }), disabled: count === 0, onPress: send };
    }
    if (running || runState === null) return { label: say('sendSheet.state.sending'), disabled: true, onPress: () => undefined };
    if (failed > 0) return { label: say('sendSheet.state.retry'), disabled: false, onPress: () => void run.retryFailed() };
    return { label: say('sendSheet.state.sent'), disabled: true, onPress: () => undefined };
  })();

  const footer = (
    <div className="flex flex-col gap-2">
      <p
        role="status"
        aria-live="polite"
        className={notice === '' ? 'sr-only' : 'mx-auto w-fit max-w-full rounded-chip px-4 py-2 text-center text-caption font-semibold'}
        style={notice === '' ? undefined : { color: 'var(--color-ios-card)', backgroundColor: 'var(--color-ios-ink)' }}
      >
        {notice}
      </p>
      {planError === null ? null : (
        <p role="alert" className="text-center text-caption font-medium" style={{ color: 'var(--color-error)' }}>
          {sayRef(say, planError)}
        </p>
      )}
      {request.moreOptions === undefined || started ? null : (
        <div className="flex gap-2">
          <button type="button" onClick={moreOptions} className={`${BUTTON.secondary} flex-1`}>
            <GlyphSvg glyph={SEND_SHEET_GLYPHS.shareNetwork} size={GLYPH_SIZE.md} />
            {say('sendSheet.moreOptions')}
          </button>
          {url === undefined || host.copy === undefined ? null : (
            <button type="button" onClick={copyLink} className={`${BUTTON.secondary} flex-1`}>
              <GlyphSvg glyph={SEND_SHEET_GLYPHS.copy} size={GLYPH_SIZE.md} />
              {say('sendSheet.copyLink')}
            </button>
          )}
        </div>
      )}
      <button type="button" data-send-sheet-send="" disabled={primary.disabled} onClick={primary.onPress} className={`${BUTTON.primary} w-full`}>
        {primary.label}
      </button>
    </div>
  );

  const previewLabel = preview.label === undefined ? undefined : sayRef(say, preview.label);

  return (
    <SendSheetFrame
      handleRef={frame}
      title={say(request.intent === 'forward' ? 'sendSheet.title.forward' : 'sendSheet.title.share')}
      cancelLabel={say('sendSheet.cancel')}
      onClose={onClose}
      initialFocus={initialFocus}
      footer={footer}
    >
      <div className="flex flex-col gap-3 px-4 pt-2">
        <PreviewCard payload={payload} view={preview} label={previewLabel} />
        <label className="block">
          <span className="sr-only">{say('sendSheet.caption.label')}</span>
          <textarea
            ref={captionRef}
            rows={1}
            value={caption}
            maxLength={MAX_PUBLISH_CAPTION}
            readOnly={started}
            placeholder={say('sendSheet.caption.placeholder')}
            onInput={(event) => setCaption(event.currentTarget.value)}
            className="send-sheet-caption block w-full rounded-field px-4 py-2.5 text-body outline-none"
            style={{ backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)' }}
          />
        </label>
      </div>

      {offered.length > 0 ? (
        <section aria-labelledby={publishTitleId}>
          <SectionTitle id={publishTitleId}>{say('sendSheet.section.publish')}</SectionTitle>
          <div className="flex flex-wrap gap-2 px-4">
            {offered.map((format) => (
              <PublishChip
                key={format}
                format={format}
                label={say(PUBLISH_LABEL[format])}
                on={publish.includes(format)}
                disabled={started}
                onToggle={() => togglePublish(format)}
              />
            ))}
          </div>
        </section>
      ) : protectedFromPublishing(payload) ? (
        <p className="px-4 pt-3 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {say('sendSheet.protected')}
        </p>
      ) : null}

      {started ? (
        <ul className="pb-3 pt-2">
          {entries.map((entry) => {
            const view = statusViewOf(runState?.statuses[entry.key], true);
            return view === null ? null : (
              <StatusLine
                key={entry.key}
                entry={entry}
                view={view}
                statusLabel={say(view.label)}
                retryLabel={say('sendSheet.state.retry')}
                onRetry={() => void run?.retry(entry.key)}
              />
            );
          })}
        </ul>
      ) : (
        <Picker
          say={say}
          query={query}
          onQuery={setQuery}
          searchRef={searchRef}
          rows={rows}
          loading={directory.loading}
          selected={selected}
          selectedKeys={selectedKeys}
          atCap={atCap}
          onToggle={toggle}
        />
      )}
    </SendSheetFrame>
  );
}

function Picker({
  say,
  query,
  onQuery,
  searchRef,
  rows,
  loading,
  selected,
  selectedKeys,
  atCap,
  onToggle,
}: {
  readonly say: Say;
  readonly query: string;
  readonly onQuery: (value: string) => void;
  readonly searchRef: RefObject<HTMLInputElement | null>;
  readonly rows: ReturnType<typeof recipientRows>;
  readonly loading: boolean;
  readonly selected: readonly RecipientRow[];
  readonly selectedKeys: ReadonlySet<string>;
  readonly atCap: boolean;
  readonly onToggle: (row: RecipientRow) => void;
}) {
  const recentId = useId();
  const conversationsId = useId();
  const peopleId = useId();
  const inert = (row: RecipientRow): boolean => atCap && !selectedKeys.has(row.key);
  const selectLabel = (row: RecipientRow): string => say('sendSheet.row.select', { name: row.label });
  const empty = rows.conversations.length === 0 && rows.people.length === 0;

  return (
    <div className="pb-3">
      <div className="px-4 pt-3">
        <input
          ref={searchRef}
          type="search"
          value={query}
          onInput={(event) => onQuery(event.currentTarget.value)}
          aria-label={say('sendSheet.search.label')}
          placeholder={say('sendSheet.search.placeholder')}
          className="block min-h-11 w-full rounded-field px-4 text-body outline-none"
          style={{ backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)' }}
        />
      </div>

      {selected.length === 0 ? null : (
        <ul aria-label={say('sendSheet.selectedCount', { count: String(selected.length) })} className="flex flex-wrap gap-2 px-4 pt-3">
          {selected.map((row) => (
            <SelectedChip key={row.key} row={row} ariaLabel={selectLabel(row)} onRemove={() => onToggle(row)} />
          ))}
        </ul>
      )}

      {atCap ? (
        <p className="px-4 pt-2 text-caption font-medium" style={{ color: 'var(--color-ios-ink-2)' }}>
          {say('sendSheet.limit.recipients', { count: String(MAX_CONVERSATION_TARGETS) })}
        </p>
      ) : null}

      {query.trim() === '' && rows.recents.length > 0 ? (
        <section aria-labelledby={recentId}>
          <SectionTitle id={recentId}>{say('sendSheet.section.recent')}</SectionTitle>
          <ul className="send-sheet-recents flex gap-2 overflow-x-auto px-3">
            {rows.recents.map((row) => (
              <RecentTile
                key={row.key}
                row={row}
                on={selectedKeys.has(row.key)}
                inert={inert(row)}
                ariaLabel={selectLabel(row)}
                onToggle={() => onToggle(row)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {rows.conversations.length === 0 ? null : (
        <section aria-labelledby={conversationsId}>
          <SectionTitle id={conversationsId}>{say('sendSheet.section.conversations')}</SectionTitle>
          <ul>
            {rows.conversations.map((row) => (
              <RecipientLine key={row.key} row={row} on={selectedKeys.has(row.key)} inert={inert(row)} onToggle={() => onToggle(row)} />
            ))}
          </ul>
        </section>
      )}

      {rows.people.length === 0 ? null : (
        <section aria-labelledby={peopleId}>
          <SectionTitle id={peopleId}>{say('sendSheet.section.people')}</SectionTitle>
          <ul>
            {rows.people.map((row) => (
              <RecipientLine key={row.key} row={row} on={selectedKeys.has(row.key)} inert={inert(row)} onToggle={() => onToggle(row)} />
            ))}
          </ul>
        </section>
      )}

      {empty ? (
        <p aria-busy={loading ? true : undefined} className="px-4 py-6 text-center text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
          {loading && query.trim() === '' ? '…' : say('sendSheet.empty')}
        </p>
      ) : null}
    </div>
  );
}
