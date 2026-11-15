import { BATTERY_RECEIVE_MODES, type BatteryReceiveMode } from '@meeshy/shared/types/battery-constants';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { memo, useEffect, useId, useState } from 'react';

import {
  BATTERY_EMITTER_SETTINGS_QUERY_KEY,
  batteryPersonSettingsQueryKey,
  loadBatteryEmitterSettings,
  loadBatteryPersonSettings,
  requestBatteryPull,
  saveBatteryEmitterSettings,
  saveBatteryPersonSettings,
  type BatteryDeps,
  type BatteryEmitterSettings,
  type BatteryPersonSettings,
  type BatteryPullOutcome,
} from '@/lib/api/battery';
import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { relationLinksQueryOptions } from '@/lib/api/relations';
import { useBatteryEntry } from '@/lib/battery/use-battery';
import { batteryDetailOf, type BatteryDetail } from '@/lib/battery/battery-view';
import { translateBattery, useBatteryCatalog, type BatteryCatalogKey } from '@/lib/i18n-battery-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { BatteryGlyph } from './battery-glyph';
import { SwitchRow } from './conversation-settings-section';
import { GroupedSection, SECTION_INK, SECTION_INK_2 } from './grouped-section';

/**
 * **LA BATTERIE D'UNE PERSONNE, DANS LA FICHE ET LE PROFIL** (#14147) — le web REÇOIT et AFFICHE : il n'émet
 * aucun relevé, et ses réglages le disent (`battery.webNote`).
 *
 * - **Le détail** (niveau, charge, économie d'énergie, autonomie estimée, âge du relevé) n'existe que pendant un
 *   épisode servi : hors épisode, ou après `battery:cleared`, il n'y a rien à montrer.
 * - **Ce que je reçois** (fiche d'un direct) : tout · notification si critique · pastille seulement · rien.
 * - **Ce que je partage** (profil de la personne) : proposé à un Proche, jamais pré-coché ; chez un Sang, partagé
 *   par défaut et retirable. Le serveur décide de l'état servi ; l'interface ne le présume pas.
 * - **« Demander un relevé »** n'existe que pour un Sang ; le serveur borne la cadence et le dit.
 * - **Mon partage global** (`/me`) : la coupure pour tous.
 *
 * Le niveau de la relation vient du MÊME cache que la ligne du cercle (`GET /relations`). Chaque réglage est
 * OPTIMISTE : il bascule au geste, revient en arrière si le serveur refuse, et le dit.
 */

type PanelDeps = { readonly deps?: BatteryDeps; readonly client?: QueryClient };

const BATTERY_LEVELS: ReadonlySet<string> = new Set(['CLOSE', 'BLOOD']);

/** La batterie se partage dès Proche, le relevé à la demande entre Sangs seulement. */
export const batteryOfferedAt = (level: string | null | undefined): boolean => level != null && BATTERY_LEVELS.has(level);

const PULL_NOTICE = {
  requested: 'battery.pull.sent',
  'too-soon': 'battery.pull.tooSoon',
  forbidden: 'battery.pull.forbidden',
  'rate-limited': 'battery.pull.rateLimited',
  offline: 'battery.pull.offline',
  failed: 'battery.pull.failed',
} as const satisfies Readonly<Record<BatteryPullOutcome, BatteryCatalogKey>>;

const RECEIVE_LABEL = {
  all: 'battery.receive.all',
  critical: 'battery.receive.critical',
  pill: 'battery.receive.pill',
  none: 'battery.receive.none',
} as const satisfies Readonly<Record<BatteryReceiveMode, BatteryCatalogKey>>;

const RECEIVE_HINT = {
  all: 'battery.receive.hint.all',
  critical: 'battery.receive.hint.critical',
  pill: 'battery.receive.hint.pill',
  none: 'battery.receive.hint.none',
} as const satisfies Readonly<Record<BatteryReceiveMode, BatteryCatalogKey>>;

type SettingsProblemKey = 'battery.settings.failed' | 'battery.settings.offline';

const settingsFailure = (result: ApiResult<unknown>): SettingsProblemKey => (!result.ok && result.status === 0 ? 'battery.settings.offline' : 'battery.settings.failed');

function useRelationLevel(userId: string, deps: BatteryDeps, client: QueryClient): string | null {
  const links = useQuery(relationLinksQueryOptions(deps), client);
  return links.data?.find((candidate) => candidate.userId === userId)?.effectiveLevel ?? null;
}

function usePersonSettings(userId: string, deps: BatteryDeps, client: QueryClient, enabled: boolean) {
  const queryKey = batteryPersonSettingsQueryKey(userId);
  const query = useQuery(
    { queryKey, enabled, queryFn: async ({ signal }) => unwrap(await loadBatteryPersonSettings(deps, userId, signal)) },
    client,
  );
  const [problem, setProblem] = useState<SettingsProblemKey | null>(null);
  const save = async (update: { readonly shared: boolean } | { readonly receive: BatteryReceiveMode }): Promise<void> => {
    const before = client.getQueryData<BatteryPersonSettings>(queryKey);
    if (before === undefined) return;
    setProblem(null);
    client.setQueryData<BatteryPersonSettings>(queryKey, { ...before, ...update });
    const result = await saveBatteryPersonSettings(deps, userId, update);
    if (result.ok) return void client.setQueryData<BatteryPersonSettings>(queryKey, result.data);
    client.setQueryData<BatteryPersonSettings>(queryKey, before);
    setProblem(settingsFailure(result));
  };
  return { settings: query.data ?? null, problem, save };
}

function useEmitterSettings(deps: BatteryDeps, client: QueryClient) {
  const query = useQuery(
    { queryKey: BATTERY_EMITTER_SETTINGS_QUERY_KEY, queryFn: async ({ signal }) => unwrap(await loadBatteryEmitterSettings(deps, signal)) },
    client,
  );
  const [problem, setProblem] = useState<SettingsProblemKey | null>(null);
  const save = async (sharingEnabled: boolean): Promise<void> => {
    const before = client.getQueryData<BatteryEmitterSettings>(BATTERY_EMITTER_SETTINGS_QUERY_KEY);
    if (before === undefined) return;
    setProblem(null);
    client.setQueryData<BatteryEmitterSettings>(BATTERY_EMITTER_SETTINGS_QUERY_KEY, { sharingEnabled });
    const result = await saveBatteryEmitterSettings(deps, sharingEnabled);
    if (result.ok) return void client.setQueryData<BatteryEmitterSettings>(BATTERY_EMITTER_SETTINGS_QUERY_KEY, result.data);
    client.setQueryData<BatteryEmitterSettings>(BATTERY_EMITTER_SETTINGS_QUERY_KEY, before);
    setProblem(settingsFailure(result));
  };
  return { settings: query.data ?? null, problem, save };
}

/** L'heure qui fait vieillir « relevé il y a X min » : une minute suffit, la fiche ne compte pas les secondes. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export const BatteryDetailCard = memo(function BatteryDetailCard({ detail, level, charging }: { readonly detail: BatteryDetail; readonly level: number; readonly charging: boolean }) {
  return (
    <div data-battery-detail={detail.tone} role="group" aria-label={detail.headline} className="flex items-start gap-3 px-3 py-3">
      <span className="pt-1">
        <BatteryGlyph level={level} tone={detail.tone} charging={charging} width={30} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body font-semibold" style={{ color: SECTION_INK }}>
          {detail.headline} · {detail.level}
        </span>
        {detail.lines.map((line) => (
          <span key={line} className="text-caption" style={{ color: SECTION_INK_2 }}>
            {line}
          </span>
        ))}
      </span>
    </div>
  );
});

function PullButton({ language, name, userId, deps }: { readonly language: InterfaceLanguage; readonly name: string; readonly userId: string; readonly deps: BatteryDeps }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<BatteryPullOutcome | null>(null);
  const onPull = async (): Promise<void> => {
    setBusy(true);
    setNotice(null);
    const outcome = await requestBatteryPull(deps, userId);
    setBusy(false);
    setNotice(outcome);
  };
  return (
    <div className="grid gap-1 px-3 py-2">
      <button
        type="button"
        data-battery-pull=""
        disabled={busy}
        aria-busy={busy}
        onClick={() => void onPull()}
        className="grid place-items-center rounded-chip px-3 text-body font-semibold transition-transform focus-visible:outline-2 active:scale-[0.98]"
        style={{ minHeight: 44, color: 'var(--color-ios-brand)', backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 10%, transparent)', opacity: busy ? 0.6 : 1 }}
      >
        {translateBattery(language, 'battery.pull.action')}
      </button>
      <span data-battery-pull-notice={notice ?? ''} role="status" className="text-caption" style={{ color: SECTION_INK_2 }}>
        {notice === null ? '' : notice === 'requested' ? translateBattery(language, 'battery.pull.sent', { name }) : translateBattery(language, PULL_NOTICE[notice])}
      </span>
    </div>
  );
}

function SettingsProblem({ language, problem }: { readonly language: InterfaceLanguage; readonly problem: SettingsProblemKey | null }) {
  return (
    <span data-battery-settings-problem={problem ?? ''} role="alert" className="px-3 text-caption" style={{ color: 'var(--color-error)' }}>
      {problem === null ? '' : translateBattery(language, problem)}
    </span>
  );
}

export const BatteryReceiveChoices = memo(function BatteryReceiveChoices({
  language,
  name,
  value,
  onChange,
}: {
  readonly language: InterfaceLanguage;
  readonly name: string;
  readonly value: BatteryReceiveMode;
  readonly onChange: (mode: BatteryReceiveMode) => void;
}) {
  const group = useId();
  return (
    <fieldset data-battery-receive={value} className="grid gap-1 px-3 py-2">
      <legend className="text-caption" style={{ color: SECTION_INK_2 }}>
        {translateBattery(language, 'battery.receive.explain', { name })}
      </legend>
      {BATTERY_RECEIVE_MODES.map((mode) => (
        <label key={mode} className="flex cursor-pointer items-start gap-3 py-1.5" style={{ minHeight: 44 }}>
          <input type="radio" name={group} value={mode} checked={mode === value} onChange={() => onChange(mode)} data-battery-receive-mode={mode} className="mt-1 size-5 shrink-0 accent-[var(--accent)]" />
          <span className="flex min-w-0 flex-col">
            <span className="text-body font-medium" style={{ color: SECTION_INK }}>
              {translateBattery(language, RECEIVE_LABEL[mode])}
            </span>
            <span className="text-caption" style={{ color: SECTION_INK_2 }}>
              {translateBattery(language, RECEIVE_HINT[mode])}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
});

function DetailOf({ userId, language, client }: { readonly userId: string; readonly language: InterfaceLanguage; readonly client: QueryClient }) {
  const entry = useBatteryEntry(userId, client);
  const now = useMinuteClock();
  if (entry === null) return null;
  return <BatteryDetailCard detail={batteryDetailOf(entry, language, now)} level={entry.level} charging={entry.charging} />;
}

/**
 * La section « Batterie » de la fiche d'un DIRECT : le détail pendant un épisode, le relevé à la demande entre
 * Sangs, et ce que je reçois de sa batterie. Sous Proche, rien.
 */
export function ConversationBatterySection({
  userId,
  name,
  language,
  deps = apiDeps,
  client = appQueryClient,
}: { readonly userId: string; readonly name: string; readonly language: InterfaceLanguage } & PanelDeps) {
  const level = useRelationLevel(userId, deps, client);
  const offered = batteryOfferedAt(level);
  const ready = useBatteryCatalog(language, offered);
  const { settings, problem, save } = usePersonSettings(userId, deps, client, offered);
  if (!offered || !ready) return null;
  return (
    <div className="px-4 pb-6" data-conversation-battery={level ?? ''}>
      <GroupedSection id="conversation-battery" title={translateBattery(language, 'battery.receive.title', { name })} icon={<BatteryGlyph level={60} tone="low" charging={false} width={18} ink="currentColor" />}>
        <DetailOf userId={userId} language={language} client={client} />
        {level === 'BLOOD' ? <PullButton language={language} name={name} userId={userId} deps={deps} /> : null}
        {settings === null ? null : <BatteryReceiveChoices language={language} name={name} value={settings.receive} onChange={(receive) => void save({ receive })} />}
        <SettingsProblem language={language} problem={problem} />
      </GroupedSection>
    </div>
  );
}

/**
 * La rangée « Batterie » du PROFIL d'un Proche ou d'un Sang : le détail, le relevé (Sang), et le partage de MA
 * batterie avec cette personne — proposé à un Proche sans être coché, partagé par défaut avec un Sang.
 */
export function ProfileBatteryRow({
  language,
  person,
  deps = apiDeps,
  client = appQueryClient,
}: { readonly language: InterfaceLanguage; readonly person: { readonly id: string; readonly username: string; readonly displayName?: string | null } } & PanelDeps) {
  const level = useRelationLevel(person.id, deps, client);
  const offered = batteryOfferedAt(level);
  const ready = useBatteryCatalog(language, offered);
  const { settings, problem, save } = usePersonSettings(person.id, deps, client, offered);
  const emitter = useEmitterSettings(deps, client);
  if (!offered || !ready) return null;
  const name = person.displayName ?? person.username;
  return (
    <div data-profile-battery={level ?? ''} className="grid gap-1 rounded-card" style={{ backgroundColor: 'var(--color-ios-card)' }}>
      <DetailOf userId={person.id} language={language} client={client} />
      {level === 'BLOOD' ? <PullButton language={language} name={name} userId={person.id} deps={deps} /> : null}
      {settings === null ? null : (
        <SwitchRow
          label={translateBattery(language, 'battery.share.title', { name })}
          hint={level === 'BLOOD' ? translateBattery(language, 'battery.share.explainBlood') : translateBattery(language, 'battery.share.explainClose', { name })}
          checked={settings.shared}
          onChange={(shared) => void save({ shared })}
          marker="data-battery-share"
        />
      )}
      {emitter.settings?.sharingEnabled === false ? (
        <span data-battery-global-off="" className="px-3 text-caption" style={{ color: SECTION_INK_2 }}>
          {translateBattery(language, 'battery.share.globalOff')}
        </span>
      ) : null}
      <SettingsProblem language={language} problem={problem} />
      <span data-battery-web-note="" className="px-3 pb-2 text-caption" style={{ color: SECTION_INK_2 }}>
        {translateBattery(language, 'battery.webNote')}
      </span>
    </div>
  );
}

/** Mon partage GLOBAL (`/me`) : la coupure pour tous, et ce que ce navigateur ne fait pas. */
export function MeBatterySection({ language, deps = apiDeps, client = appQueryClient }: { readonly language: InterfaceLanguage } & PanelDeps) {
  const ready = useBatteryCatalog(language);
  const { settings, problem, save } = useEmitterSettings(deps, client);
  if (!ready) return null;
  return (
    <GroupedSection id="me-battery" title={translateBattery(language, 'battery.detail.title')} icon={<BatteryGlyph level={60} tone="low" charging={false} width={18} ink="currentColor" />}>
      {settings === null ? null : (
        <SwitchRow
          label={translateBattery(language, 'battery.global.title')}
          hint={translateBattery(language, 'battery.global.explain')}
          checked={settings.sharingEnabled}
          onChange={(on) => void save(on)}
          marker="data-battery-global"
        />
      )}
      <SettingsProblem language={language} problem={problem} />
      <span data-battery-web-note="" className="px-3 pb-2 text-caption" style={{ color: SECTION_INK_2 }}>
        {translateBattery(language, 'battery.webNote')}
      </span>
    </GroupedSection>
  );
}
