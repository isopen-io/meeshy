import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';

import { SHARE_LIMITS } from '@meeshy/shared/utils/share-limits';

import type { ShareDestination } from '@/lib/api/social-events-v2-types';
import { translate } from '@/lib/i18n-catalog';
import { translateSendSheet, type SendSheetCatalogKey } from '@/lib/i18n-send-sheet-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { forwardDurationOptions } from '@/lib/send/forward-duration';
import type { SendQueue } from '@/lib/send/send-queue';
import { sendQueue } from '@/lib/send/send-queue-instance';
import { MAX_SEND_CAPTION, planSend, publishOffered, targetKeyOf, type PublishFormat, type SendGrouping, type SendPayload, type SendTarget } from '@/lib/send/send-sheet-plan';
import { failedKeysOf, pendingKeysOf, queuedKeysOf, type SendRun, type SendRunState, type SendSheetPorts } from '@/lib/send/send-sheet-run';
import type { SendSheetRequest } from '@/lib/send/send-sheet-store';
import { shareDestinationOf } from '@/lib/send/share-destination';
import { sharePlanOf } from '@/lib/send/share-entry';
import { studioSeedOfShare } from '@/lib/share-incoming/compose-from-share';
import { offerStudioSeedOf } from '@/lib/stories/studio-seed';
import { portailDuNavigateur } from '@/lib/view/invitation';
import { href, navigate } from '@/routes/route-table';

import { useSendSheetDirectory, type UseSendSheetDirectory } from './send-sheet-directory';
import { SendSheetFrame, type SendSheetFrameHandle } from './send-sheet-frame';
import {
  blockedReasonOf,
  newGroupTitleOf,
  planErrorMessageOf,
  previewOf,
  recipientRows,
  statusViewOf,
  titleKeyOf,
  withdrawnLineOf,
  withheldLineOf,
  type MessageRef,
  type RecipientRow,
} from './send-sheet-model';
import { ForwardDurationRow, PreviewCard, PUBLISH_ORDER, SectionTitle, StatusLine, type StatusEntry } from './send-sheet-parts';
import { ActionsZone, CreateGroupSwitch, GroupingToggle, OverLimitBanner, PieceStrip, ReasonLine, RecipientsZone, SelectedRow, type ActionButton } from './send-sheet-zones';
import { BUTTON } from './ui-chrome';

/**
 * L'ÉCRAN DE PARTAGE UNIQUE (#10948, planche `docs/product/partage-unique/`,
 * décisions D1–D15 du 2026-10-18) — UN écran pour tout ce qu'on envoie, qu'il
 * vienne d'une autre app (cible de partage PWA, intent Android) ou de Meeshy
 * (un message, une pièce, une publication, une story, un réel, un profil, une
 * invitation). Quatre zones, toujours dans cet ordre : CE QUI PART, CE QU'ON
 * PEUT EN FAIRE, À QUI, puis ENVOYER. Deux gestes au cas nominal : toucher un
 * récent, puis Envoyer.
 *
 * Il ne décide rien : `planShare` (`@meeshy/shared`, par `share-entry.ts`) dit
 * ce qui part, ce qui est retiré et pourquoi, ce qui se publie, les plafonds,
 * la durée d'une flamme et l'avertissement de chiffrement ; `planSend` en fait
 * des étapes ; la FILE durable (`send-queue.ts`) les joue — la feuille peut se
 * fermer, l'application aussi, rien ne se perd.
 */

/** Le temps de lire « Envoyé » avant que la feuille ne se retire. */
export const SEND_SHEET_SUCCESS_HOLD_MS = 1200;
const NOTICE_MS = 2500;

export type SendSheetPlatform = {
  readonly share?: (data: ShareData) => Promise<void>;
  readonly copy?: (text: string) => Promise<void>;
};

/** Le portail des invitations (#9023) : `navigator.share`, sinon le pont `MeeshyShare` de la coque Android ; la copie avec son repli. */
function browserPlatform(): SendSheetPlatform {
  const { share, copier } = portailDuNavigateur();
  return {
    ...(share === undefined ? {} : { share: (data: ShareData) => share({ title: data.title ?? '', text: data.text ?? '', url: data.url ?? '' }) }),
    ...(copier === undefined ? {} : { copy: copier }),
  };
}

type Say = (key: SendSheetCatalogKey, params?: Readonly<Record<string, string>>) => string;

const sayIn = (language: InterfaceLanguage): Say => {
  const translateAny = translateSendSheet as (l: InterfaceLanguage, k: SendSheetCatalogKey, p?: Readonly<Record<string, string>>) => string;
  return (key, params) => translateAny(language, key, params);
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

const SIZE_UNITS = [
  { unit: 'gigabyte', bytes: 1024 * 1024 * 1024, fractionDigits: 1 },
  { unit: 'megabyte', bytes: 1024 * 1024, fractionDigits: 0 },
  { unit: 'kilobyte', bytes: 1024, fractionDigits: 0 },
] as const;

/** Un poids dans la langue du lecteur (« 500 Mo », « 5 Go », « 5 GB ») — jamais une unité écrite en dur. */
export const sizeIn = (language: InterfaceLanguage, bytes: number): string => {
  const scale = SIZE_UNITS.find((candidate) => bytes >= candidate.bytes) ?? SIZE_UNITS[SIZE_UNITS.length - 1];
  const value = Math.max(1, bytes / scale.bytes);
  return new Intl.NumberFormat(language, { style: 'unit', unit: scale.unit, unitDisplay: 'short', maximumFractionDigits: scale.fractionDigits }).format(
    scale.fractionDigits === 0 ? Math.round(value) : value,
  );
};

/** Les textes que la sélection donne à copier (« Copier le texte ») — ceux que la loi a laissé lire. */
const copyableTextOf = (payload: SendPayload, kept: readonly string[]): string => {
  if (payload.kind === 'text') return [payload.text, payload.url ?? ''].filter((part) => part !== '').join('\n');
  if (payload.kind !== 'messages') return '';
  const keep = new Set(kept);
  return payload.exit.flatMap((message) => (keep.has(message.id) && (message.text ?? '').trim() !== '' ? [message.text ?? ''] : [])).join('\n\n');
};

const urlOf = (request: SendSheetRequest): string | undefined => {
  const { payload } = request;
  if (payload.kind === 'publication' || payload.kind === 'profile' || payload.kind === 'invitation') return payload.url;
  return request.moreOptions?.url ?? (payload.kind === 'text' ? payload.url : undefined);
};

const move = <T,>(list: readonly T[], index: number, by: -1 | 1): readonly T[] => {
  const target = index + by;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  if (item !== undefined) next.splice(target, 0, item);
  return next;
};

export function SendSheet({
  request,
  viewerId,
  language,
  contentLanguage,
  ports,
  useDirectory = useSendSheetDirectory,
  platform,
  queue = sendQueue,
  onClose,
}: {
  readonly request: SendSheetRequest;
  readonly viewerId: string;
  /** La langue d'INTERFACE — celle des libellés. */
  readonly language: InterfaceLanguage;
  /** La langue d'ORIGINE des messages que l'envoi compose (légende, lien). */
  readonly contentLanguage: string;
  readonly ports: SendSheetPorts;
  readonly useDirectory?: UseSendSheetDirectory;
  readonly platform?: SendSheetPlatform;
  /** La file durable — défaut : celle de l'application. */
  readonly queue?: SendQueue;
  readonly onClose: () => void;
}) {
  const say = useMemo(() => sayIn(language), [language]);
  const frame = useRef<SendSheetFrameHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const host = useMemo(() => platform ?? browserPlatform(), [platform]);

  const [payload, setPayload] = useState<SendPayload>(request.payload);
  const [query, setQuery] = useState('');
  const [caption, setCaption] = useState(request.caption ?? '');
  const [selected, setSelected] = useState<readonly RecipientRow[]>([]);
  const [publish, setPublish] = useState<readonly PublishFormat[]>([]);
  const [grouping, setGrouping] = useState<SendGrouping>('together');
  const [asGroup, setAsGroup] = useState(false);
  const [run, setRun] = useState<SendRun | null>(null);
  const [labels, setLabels] = useState<Readonly<Record<string, string>>>({});
  const [planError, setPlanError] = useState<MessageRef | null>(null);
  const [notice, setNotice] = useState('');
  const counted = useRef(false);
  const launched = useRef(false);

  const destinations = useMemo(
    (): readonly { readonly id: string; readonly encrypted?: boolean }[] => [
      ...selected.map((row) => ({ id: row.key, ...(row.encrypted ? { encrypted: true } : {}) })),
      ...publish.map((format) => ({ id: `publish:${format}` })),
    ],
    [selected, publish],
  );
  const plan = useMemo(() => sharePlanOf(payload, destinations), [payload, destinations]);
  const offered = useMemo(() => PUBLISH_ORDER.filter((format) => publishOffered(payload).includes(format)), [payload]);
  const flameBound = plan.flame?.maxDurationSeconds ?? null;
  const [duration, setDuration] = useState<number | null>(flameBound);
  const durationChoices = useMemo(
    () =>
      flameBound === null
        ? []
        : forwardDurationOptions(flameBound).map((option) => ({ seconds: option.seconds, label: option.displayKey === undefined ? option.label : translate(language, option.displayKey) })),
    [flameBound, language],
  );

  const directory = useDirectory({ viewerId, query });
  const rows = useMemo(
    () =>
      recipientRows({
        conversations: directory.conversations,
        friends: directory.friends,
        searchResults: directory.searchResults,
        viewerId,
        query,
        ...(directory.conversationResults === undefined ? {} : { conversationResults: directory.conversationResults }),
        ...(directory.communities === undefined ? {} : { communities: directory.communities }),
      }),
    [directory.conversations, directory.friends, directory.searchResults, directory.conversationResults, directory.communities, viewerId, query],
  );
  const runState = useRunState(run);
  const started = run !== null;

  const reportShared = (destination: ShareDestination): void => {
    if (counted.current) return;
    counted.current = true;
    request.onShared?.(destination);
  };

  const selectedKeys = useMemo(() => new Set(selected.map((row) => row.key)), [selected]);
  const count = selected.length + publish.length;
  const atCap = count >= SHARE_LIMITS.maxRecipients;
  const people = selected.filter((row) => row.target.kind === 'contact');
  const groupable = people.length >= 2;

  const toggle = useCallback((row: RecipientRow) => {
    setPlanError(null);
    setSelected((current) => {
      if (current.some((known) => known.key === row.key)) return current.filter((known) => known.key !== row.key);
      return current.length + publish.length >= SHARE_LIMITS.maxRecipients ? current : [...current, row];
    });
  }, [publish.length]);

  const togglePublish = (format: PublishFormat): void => {
    setPlanError(null);
    setPublish((current) => {
      if (current.includes(format)) return current.filter((known) => known !== format);
      return current.length + selected.length >= SHARE_LIMITS.maxRecipients ? current : [...current, format];
    });
  };

  const targetsOf = (): readonly SendTarget[] => {
    const group: readonly SendTarget[] =
      asGroup && groupable ? [{ kind: 'new-group', userIds: people.map((row) => (row.target.kind === 'contact' ? row.target.userId : '')), title: newGroupTitleOf(people) }] : [];
    const singles = selected.filter((row) => !(asGroup && groupable && row.target.kind === 'contact')).map((row) => row.target);
    return [...group, ...singles, ...publish.map((as): SendTarget => ({ kind: 'publish', as }))];
  };

  const send = (): void => {
    if (launched.current) return;
    const targets = targetsOf();
    const planned = planSend({ payload, targets, caption, viewerId, grouping, ...(duration === null ? {} : { forwardDuration: duration }) });
    if (!planned.ok) {
      setPlanError(planErrorMessageOf(planned.error));
      return;
    }
    launched.current = true;
    const names: Record<string, string> = {
      ...Object.fromEntries(selected.map((row) => [row.key, row.label])),
      ...Object.fromEntries(publish.map((format) => [`publish:${format}`, say(PUBLISH_LABEL[format])])),
      ...Object.fromEntries(targets.flatMap((target) => (target.kind === 'new-group' ? [[targetKeyOf(target), target.title]] : []))),
    };
    setLabels(names);
    setPlanError(null);
    const queued = queue.submit({ entries: planned.entries, payload: planned.payload, language: contentLanguage, labels: names, viewerId }, ports);
    setRun(queued.run);
  };

  const pending = runState === null ? 0 : pendingKeysOf(runState).length;
  const failed = runState === null ? 0 : failedKeysOf(runState).length;
  const queuedCount = runState === null ? 0 : queuedKeysOf(runState).length;
  useEffect(() => {
    if (runState === null || runState.phase !== 'done' || pending > 0 || failed > 0) return;
    setNotice(say('sendSheet.announce.sent', { count: String(runState.order.length) }));
    if (!counted.current) {
      counted.current = true;
      request.onShared?.(shareDestinationOf({ conversations: selected.length, publish }));
    }
    const timer = setTimeout(() => frame.current?.dismiss(), SEND_SHEET_SUCCESS_HOLD_MS);
    return () => clearTimeout(timer);
  }, [runState, pending, failed, say, request, selected.length, publish]);

  useEffect(() => {
    if (notice === '') return;
    const timer = setTimeout(() => setNotice(''), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const url = urlOf(request);
  const copy = (text: string, done: SendSheetCatalogKey, destination: ShareDestination | null): void => {
    if (host.copy === undefined || text === '') return;
    void host.copy(text).then(
      () => {
        setNotice(say(done));
        if (destination !== null) reportShared(destination);
      },
      () => undefined,
    );
  };
  const shareOut = (): void => {
    if (host.share !== undefined) {
      void host.share(url === undefined ? {} : { url }).then(() => reportShared('native_sheet'), () => undefined);
      return;
    }
    if (url !== undefined) copy(url, 'sendSheet.linkCopied', 'copy_link');
  };

  /* « MODIFIER DANS LE STUDIO » (#9286, D2) — l'action immédiate : la feuille se ferme, la légende suit. */
  const composeSeed = plan.actions.includes('studio') && request.intent === 'share' ? studioSeedOfShare(payload, caption) : null;
  const compose = (): void => {
    if (composeSeed === null) return;
    offerStudioSeedOf(composeSeed);
    onClose();
    navigate(href('postCompose'));
  };

  const actions = ((): readonly ActionButton[] => {
    const list: ActionButton[] = [];
    if (composeSeed !== null) list.push({ id: 'studio', label: say('sendSheet.compose'), glyph: 'studio', onPress: compose });
    const text = copyableTextOf(payload, plan.kept);
    if (plan.actions.includes('copy-text') && text !== '' && host.copy !== undefined) list.push({ id: 'copy-text', label: say('sendSheet.action.copyText'), glyph: 'copy', onPress: () => copy(text, 'sendSheet.textCopied', null) });
    if (plan.actions.includes('copy-link') && url !== undefined && host.copy !== undefined) list.push({ id: 'copy-link', label: say('sendSheet.copyLink'), glyph: 'copy', onPress: () => copy(url, 'sendSheet.linkCopied', 'copy_link') });
    if (plan.actions.includes('share-out') && (url !== undefined || request.moreOptions !== undefined)) list.push({ id: 'share-out', label: say('sendSheet.moreOptions'), glyph: 'share', onPress: shareOut });
    return list;
  })();

  const withheld = withheldLineOf(plan);
  const withdrawn = withdrawnLineOf(plan);
  const blocked = blockedReasonOf(plan);
  const files = payload.kind === 'files' ? payload.files : null;
  const overflowFrom = files === null ? 0 : files.length - plan.limits.trimCount;
  const warn = plan.encryption?.warnDestinationIds ?? [];
  const warnLine =
    warn.length === 0
      ? null
      : warn.length === 1
        ? say('sendSheet.encryption.warning', { name: selected.find((row) => row.key === warn[0])?.label ?? '' })
        : say('sendSheet.encryption.warningMany', { count: String(warn.length) });

  const editFiles = (next: readonly File[]): void => {
    setPlanError(null);
    if (next.length === 0) {
      frame.current?.dismiss();
      return;
    }
    setPayload({ kind: 'files', files: next });
  };

  const onCaptionKey = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  };

  const forward = plan.title === 'forward';
  const primaryLabel = ((): string => {
    if (plan.limits.trimCount > 0) return say('sendSheet.limit.removeToSend', { count: String(plan.limits.trimCount) });
    if (count === 0) return say(forward ? 'sendSheet.title.forward' : 'sendSheet.send');
    return say(forward ? 'sendSheet.forwardCount' : 'sendSheet.sendCount', { count: String(count) });
  })();

  const statusEntries = useMemo((): readonly StatusEntry[] => {
    if (runState === null) return [];
    const byKey = new Map(selected.map((row) => [row.key, row]));
    return runState.order.map((key) => {
      const row = byKey.get(key);
      const format = PUBLISH_ORDER.find((candidate) => key === `publish:${candidate}`);
      return { key, row, format, label: labels[key] ?? row?.label ?? key };
    });
  }, [runState, selected, labels]);
  const retryable = runState === null ? 0 : failedKeysOf(runState).filter((key) => statusViewOf(runState.statuses[key], true)?.retry === true).length + queuedCount;

  const sendFooter = (
    <div className="flex flex-col gap-2" data-send-zone="send-bar">
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
      <SelectedRow
        rows={selected}
        ariaLabel={say('sendSheet.selectedCount', { count: String(selected.length) })}
        chipLabel={(row) => say('sendSheet.row.select', { name: row.label })}
        onRemove={toggle}
      />
      {warnLine === null ? null : <ReasonLine tone="warning">{warnLine}</ReasonLine>}
      {groupable ? (
        <CreateGroupSwitch label={say('sendSheet.createGroup', { names: newGroupTitleOf(people) })} on={asGroup} disabled={started} onChange={setAsGroup} />
      ) : null}
      {plan.caption === null ? null : (
        <label className="block">
          <span className="sr-only">{say('sendSheet.caption.label')}</span>
          <textarea
            rows={1}
            value={caption}
            maxLength={MAX_SEND_CAPTION}
            readOnly={started}
            placeholder={say('sendSheet.caption.placeholder')}
            onInput={(event) => setCaption(event.currentTarget.value)}
            onKeyDown={onCaptionKey}
            className="send-sheet-caption block w-full rounded-field px-4 py-2.5 text-body outline-none"
            style={{ backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)' }}
          />
        </label>
      )}
      <div className="flex items-center gap-2">
        {plan.grouping === null ? null : (
          <GroupingToggle
            label={say('sendSheet.grouping.label')}
            together={say('sendSheet.grouping.together')}
            separate={say('sendSheet.grouping.separate')}
            value={grouping}
            disabled={started}
            onChange={setGrouping}
          />
        )}
        <button
          type="button"
          data-send-sheet-send=""
          disabled={count === 0 || plan.limits.trimCount > 0 || plan.blocked !== null}
          aria-label={count === 0 ? primaryLabel : say('sendSheet.sendTo', { count: String(count) })}
          onClick={send}
          className={`${BUTTON.primary} flex-1`}
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  );

  const statusFooter = (
    <div className="flex flex-col gap-2">
      <p role="status" aria-live="polite" className={notice === '' ? 'sr-only' : 'mx-auto w-fit rounded-chip px-4 py-2 text-caption font-semibold'} style={notice === '' ? undefined : { color: 'var(--color-ios-card)', backgroundColor: 'var(--color-ios-ink)' }}>
        {notice}
      </p>
      <div className="flex gap-2">
        {retryable > 0 && run !== null ? (
          <button type="button" data-send-retry-all="" onClick={() => void run.retryFailed()} className={`${BUTTON.secondary} flex-1`}>
            {say('sendSheet.state.retryAll')}
          </button>
        ) : null}
        <button type="button" data-send-sheet-close="" onClick={() => frame.current?.dismiss()} className={`${BUTTON.primary} flex-1`}>
          {say('sendSheet.state.close')}
        </button>
      </div>
    </div>
  );

  if (blocked !== null && !started) {
    return (
      <SendSheetFrame handleRef={frame} title={say(titleKeyOf(plan))} cancelLabel={say('sendSheet.cancel')} onClose={onClose}
        footer={<button type="button" onClick={() => frame.current?.dismiss()} className={`${BUTTON.primary} w-full`}>{say('sendSheet.blocked.ok')}</button>}>
        <div data-send-blocked="" className="px-6 py-8 text-center">
          <p className="text-title font-semibold" style={{ color: 'var(--color-ios-ink)' }}>{say('sendSheet.blocked.title')}</p>
          <p className="pt-2 text-body" style={{ color: 'var(--color-ios-ink-2)' }}>{say(blocked)}</p>
        </div>
      </SendSheetFrame>
    );
  }

  const preview = previewOf(payload, payload.kind === 'messages' ? plan.kept.length : undefined);
  const previewLabel = preview.label === undefined ? undefined : sayRef(say, preview.label);

  return (
    <SendSheetFrame
      handleRef={frame}
      title={say(titleKeyOf(plan))}
      cancelLabel={say('sendSheet.cancel')}
      onClose={onClose}
      initialFocus={searchRef}
      footer={started ? statusFooter : sendFooter}
    >
      <section data-send-zone="what-leaves" aria-label={say('sendSheet.section.whatLeaves')}>
        <SectionTitle>{files === null ? say('sendSheet.section.whatLeaves') : `${say('sendSheet.section.whatLeaves')} · ${files.length}`}</SectionTitle>
        {files === null ? (
          <div className="px-4">
            <PreviewCard payload={payload} view={preview} label={previewLabel} />
          </div>
        ) : (
          <PieceStrip
            files={files}
            sizeLabel={(bytes) => sizeIn(language, bytes)}
            overflowFrom={overflowFrom}
            disabled={started}
            labels={{
              name: (index, total) => say('sendSheet.piece.name', { index: String(index), count: String(total) }),
              remove: (name) => say('sendSheet.piece.remove', { name }),
              earlier: say('sendSheet.piece.earlier'),
              later: say('sendSheet.piece.later'),
            }}
            onRemove={(index) => editFiles(files.filter((_, at) => at !== index))}
            onMove={(index, by) => editFiles(move(files, index, by))}
          />
        )}
        {files !== null && plan.limits.trimCount > 0 && !started ? (
          <OverLimitBanner
            text={say('sendSheet.limit.banner', { files: String(files.length), size: sizeIn(language, plan.limits.bytes), maxFiles: String(SHARE_LIMITS.maxFiles), maxSize: sizeIn(language, SHARE_LIMITS.maxTotalBytes) })}
            trimLabel={say('sendSheet.limit.trim', { count: String(plan.limits.trimCount) })}
            onTrim={() => editFiles(files.slice(0, overflowFrom))}
          />
        ) : null}
        {withdrawn === null ? null : (
          <ReasonLine>{`${say(withdrawn.reason)} ${say('sendSheet.withdrawn.leaving', { count: String(withdrawn.leaving) })}`}</ReasonLine>
        )}
      </section>

      {flameBound === null || duration === null ? null : (
        <ForwardDurationRow
          name="send-sheet-duration"
          title={say('sendSheet.duration.title')}
          hint={say('sendSheet.duration.hint')}
          choices={durationChoices}
          value={duration}
          disabled={started}
          onChange={setDuration}
        />
      )}

      {started ? (
        <div className="pb-3 pt-2">
          {queuedCount > 0 ? <ReasonLine>{say('sendSheet.offline.banner')}</ReasonLine> : null}
          <ul>
            {statusEntries.map((entry) => {
              const view = statusViewOf(runState?.statuses[entry.key], true);
              return view === null ? null : (
                <StatusLine key={entry.key} entry={entry} view={view} statusLabel={say(view.label)} retryLabel={say('sendSheet.state.retry')} onRetry={() => void run?.retry(entry.key)} />
              );
            })}
          </ul>
        </div>
      ) : (
        <>
          <ActionsZone
            title={say('sendSheet.section.publish')}
            formats={offered}
            formatLabel={(format) => say(PUBLISH_LABEL[format])}
            chosen={publish}
            disabled={started}
            onToggle={togglePublish}
            actions={actions}
            reason={withheld === null ? null : say(withheld)}
          />
          <RecipientsZone
            labels={{
              search: say('sendSheet.search.label'),
              searchPlaceholder: say('sendSheet.search.placeholder'),
              recents: say('sendSheet.section.recent'),
              conversations: say('sendSheet.section.conversations'),
              people: say('sendSheet.section.people'),
              communities: say('sendSheet.section.communities'),
              select: (name) => say('sendSheet.row.select', { name }),
              detail: (row) => (row.detail === undefined ? undefined : sayRef(say, row.detail)),
              channels: (total) => say('sendSheet.community.channels', { count: String(total) }),
              emptyTitle: say('sendSheet.empty.title'),
              emptyHint: say('sendSheet.empty.hint'),
              noResult: say('sendSheet.empty'),
            }}
            query={query}
            onQuery={setQuery}
            searchRef={searchRef}
            rows={rows}
            loading={directory.loading}
            selectedKeys={selectedKeys}
            atCap={atCap}
            capLine={say('sendSheet.limit.recipients', { count: String(SHARE_LIMITS.maxRecipients) })}
            onToggle={toggle}
          />
        </>
      )}
    </SendSheetFrame>
  );
}
