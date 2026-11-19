import { useQuery, type QueryClient } from '@tanstack/react-query';
import { memo, useEffect, useId, useState } from 'react';

import type { InactivityCheckSettings, InactivityDelayHours } from '@meeshy/shared/types/inactivity-check';

import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import {
  INACTIVITY_DELAY_CHOICES,
  WELLNESS_SETTINGS_QUERY_KEY,
  inactivityPersonSettingsQueryKey,
  loadInactivityPersonSettings,
  loadWellnessSettings,
  saveInactivityPersonSettings,
  saveWellnessSettings,
  type InactivityDeps,
  type InactivityPersonSettings,
} from '@/lib/api/inactivity';
import { appQueryClient } from '@/lib/api/query-client';
import { relationLinksQueryOptions } from '@/lib/api/relations';
import { translateInactivity, useInactivityCatalog } from '@/lib/i18n-inactivity-catalog';
import { inactivityDelayLabel, inactivityDetailOf, type InactivityDetail } from '@/lib/inactivity/inactivity-view';
import { useInactivityEntry } from '@/lib/inactivity/use-inactivity';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { coqueCourante } from '@/lib/native-shell';
import { mapsUrlOf } from '@/lib/view/message-body';

import { SwitchRow } from './conversation-settings-section';
import { GroupedSection, SECTION_INK, SECTION_INK_2 } from './grouped-section';
import { InactivityGlyph } from './inactivity-glyph';

/**
 * **LA VÉRIFICATION D'INACTIVITÉ DANS LA FICHE, LE PROFIL ET « MOI »** (#18738, TEL-02) — même forme que le
 * téléphone injoignable (`phone-reachability-panel.tsx`, #18737).
 *
 * - **Le détail** (« Aucune activité depuis 08:00 », à l'horloge du lecteur ; la dernière batterie et l'accès à la
 *   dernière position SEULEMENT s'ils sont servis) n'existe que pendant une alerte servie. Jamais un message.
 * - **« Prévenir si je ne réponds pas »** (fiche et profil d'un Sang) : accordé par défaut entre Sangs, retirable.
 *   Le serveur décide de ce qui est servi ; l'interface ne le présume pas.
 * - **Mon délai** (`/me`) : 6 h, 12 h, 24 h, ou « Désactivée » pour tous.
 *
 * Le niveau de la relation vient du MÊME cache que la ligne du cercle (`GET /relations`). Chaque réglage est
 * OPTIMISTE : il bascule au geste, revient en arrière si le serveur refuse, et le dit.
 */

type PanelDeps = { readonly deps?: InactivityDeps; readonly client?: QueryClient };

type SettingsProblemKey = 'inactivity.settings.failed' | 'inactivity.settings.offline';

const settingsFailure = (result: ApiResult<unknown>): SettingsProblemKey => (!result.ok && result.status === 0 ? 'inactivity.settings.offline' : 'inactivity.settings.failed');

/** Le cercle où l'alerte se partage : le Sang (`safety.inactivity`). */
const isBlood = (level: string | null): boolean => level === 'BLOOD';

function useRelationLevel(userId: string, deps: InactivityDeps, client: QueryClient): string | null {
  const links = useQuery(relationLinksQueryOptions(deps), client);
  return links.data?.find((candidate) => candidate.userId === userId)?.effectiveLevel ?? null;
}

function usePersonSettings(userId: string, deps: InactivityDeps, client: QueryClient, enabled: boolean) {
  const queryKey = inactivityPersonSettingsQueryKey(userId);
  const query = useQuery({ queryKey, enabled, queryFn: async ({ signal }) => unwrap(await loadInactivityPersonSettings(deps, userId, signal)) }, client);
  const [problem, setProblem] = useState<SettingsProblemKey | null>(null);
  const save = async (shared: boolean): Promise<void> => {
    const before = client.getQueryData<InactivityPersonSettings>(queryKey);
    if (before === undefined) return;
    setProblem(null);
    client.setQueryData<InactivityPersonSettings>(queryKey, { shared });
    const result = await saveInactivityPersonSettings(deps, userId, shared);
    if (result.ok) return void client.setQueryData<InactivityPersonSettings>(queryKey, result.data);
    client.setQueryData<InactivityPersonSettings>(queryKey, before);
    setProblem(settingsFailure(result));
  };
  return { settings: query.data ?? null, problem, save };
}

function useWellnessSettings(deps: InactivityDeps, client: QueryClient) {
  const queryKey = WELLNESS_SETTINGS_QUERY_KEY;
  const query = useQuery({ queryKey, queryFn: async ({ signal }) => unwrap(await loadWellnessSettings(deps, signal)) }, client);
  const [problem, setProblem] = useState<SettingsProblemKey | null>(null);
  const save = async (delayHours: InactivityDelayHours | null): Promise<void> => {
    const before = client.getQueryData<InactivityCheckSettings>(queryKey);
    if (before === undefined) return;
    setProblem(null);
    client.setQueryData<InactivityCheckSettings>(queryKey, { delayHours });
    const result = await saveWellnessSettings(deps, delayHours);
    if (result.ok) return void client.setQueryData<InactivityCheckSettings>(queryKey, result.data);
    client.setQueryData<InactivityCheckSettings>(queryKey, before);
    setProblem(settingsFailure(result));
  };
  return { settings: query.data ?? null, problem, save };
}

/** L'heure qui fait passer « 08:00 » à « mardi 08:00 » à minuit : une minute suffit. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export const InactivityDetailCard = memo(function InactivityDetailCard({ detail }: { readonly detail: InactivityDetail }) {
  const position = detail.position;
  return (
    <div data-inactivity-detail="" role="group" aria-label={detail.headline} className="flex items-start gap-3 px-3 py-3">
      <span className="pt-0.5" style={{ color: 'var(--color-error)' }}>
        <InactivityGlyph responded={false} size={24} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body font-semibold" style={{ color: SECTION_INK }}>
          {detail.headline}
        </span>
        {detail.battery === null ? null : (
          <span data-inactivity-battery="" className="text-caption" style={{ color: SECTION_INK_2 }}>
            {detail.battery}
          </span>
        )}
        {position === null ? null : (
          <a
            data-inactivity-map=""
            href={mapsUrlOf({ latitude: position.latitude, longitude: position.longitude, name: null, address: null }, { platform: coqueCourante()?.getPlatform?.() })}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-caption font-semibold underline focus-visible:outline-2"
            style={{ minHeight: 44, color: 'var(--color-ios-brand)' }}
          >
            {position.label}
          </a>
        )}
      </span>
    </div>
  );
});

function DetailOf({ userId, language, client }: { readonly userId: string; readonly language: InterfaceLanguage; readonly client: QueryClient }) {
  const entry = useInactivityEntry(userId, client);
  const now = useMinuteClock();
  if (entry === null) return null;
  return <InactivityDetailCard detail={inactivityDetailOf(entry, language, { now })} />;
}

function SettingsProblem({ language, problem }: { readonly language: InterfaceLanguage; readonly problem: SettingsProblemKey | null }) {
  return (
    <span data-inactivity-settings-problem={problem ?? ''} role="alert" className="px-3 text-caption" style={{ color: 'var(--color-error)' }}>
      {problem === null ? '' : translateInactivity(language, problem)}
    </span>
  );
}

/** Le détail pendant une alerte servie, et l'interrupteur chez un Sang : le corps commun de la fiche et du profil. */
function usePersonInactivity(userId: string, language: InterfaceLanguage, deps: InactivityDeps, client: QueryClient) {
  const entry = useInactivityEntry(userId, client);
  const level = useRelationLevel(userId, deps, client);
  const blood = isBlood(level);
  const ready = useInactivityCatalog(language, entry !== null || blood);
  const { settings, problem, save } = usePersonSettings(userId, deps, client, blood);
  return { shown: ready && (entry !== null || blood), blood, settings, problem, save };
}

function PersonBody({ userId, name, language, client, person }: { readonly userId: string; readonly name: string; readonly language: InterfaceLanguage; readonly client: QueryClient; readonly person: ReturnType<typeof usePersonInactivity> }) {
  return (
    <>
      <DetailOf userId={userId} language={language} client={client} />
      {!person.blood || person.settings === null ? null : (
        <SwitchRow
          label={translateInactivity(language, 'inactivity.share.title')}
          hint={translateInactivity(language, 'inactivity.share.explain', { name })}
          checked={person.settings.shared}
          onChange={(shared) => void person.save(shared)}
          marker="data-inactivity-share"
        />
      )}
      <SettingsProblem language={language} problem={person.problem} />
    </>
  );
}

/**
 * La section « Inactivité » de la fiche d'un DIRECT : l'alerte servie, et « Prévenir si je ne réponds pas » chez un
 * Sang. Ni l'une ni l'autre : rien.
 */
export function ConversationInactivitySection({
  userId,
  name,
  language,
  deps = apiDeps,
  client = appQueryClient,
}: { readonly userId: string; readonly name: string; readonly language: InterfaceLanguage } & PanelDeps) {
  const person = usePersonInactivity(userId, language, deps, client);
  if (!person.shown) return null;
  return (
    <div className="px-4 pb-6" data-conversation-inactivity="">
      <GroupedSection id="conversation-inactivity" title={translateInactivity(language, 'inactivity.detail.title')} icon={<InactivityGlyph responded={false} size={18} />}>
        <PersonBody userId={userId} name={name} language={language} client={client} person={person} />
      </GroupedSection>
    </div>
  );
}

/** La rangée « Inactivité » du PROFIL d'un Sang : l'alerte servie, et « Prévenir si je ne réponds pas ». */
export function ProfileInactivityRow({
  language,
  person,
  deps = apiDeps,
  client = appQueryClient,
}: {
  readonly language: InterfaceLanguage;
  readonly person: { readonly id: string; readonly username: string; readonly displayName?: string | null };
} & PanelDeps) {
  const state = usePersonInactivity(person.id, language, deps, client);
  if (!state.shown) return null;
  return (
    <div data-profile-inactivity="" className="grid gap-1 rounded-card" style={{ backgroundColor: 'var(--color-ios-card)' }}>
      <PersonBody userId={person.id} name={person.displayName ?? person.username} language={language} client={client} person={state} />
    </div>
  );
}

const OFF = 'off';

const delayOf = (value: string): InactivityDelayHours | null => INACTIVITY_DELAY_CHOICES.find((choice) => String(choice) === value) ?? null;

/**
 * Mon délai (`/me`), en une ligne : « Vérification d'inactivité » et un sélecteur — 6 h, 12 h, 24 h ou « Désactivée ».
 * Il se range dans la carte « Mon téléphone » (`MeBatterySection`), si bien que `/me` ne gagne ni titre ni question.
 */
export function MeInactivityRow({ language, deps = apiDeps, client = appQueryClient }: { readonly language: InterfaceLanguage } & PanelDeps) {
  const ready = useInactivityCatalog(language);
  const { settings, problem, save } = useWellnessSettings(deps, client);
  const selectId = useId();
  if (!ready || settings === null) return null;
  return (
    <>
      <div className="flex items-center justify-between gap-3 px-3 py-2" style={{ minHeight: 52 }}>
        <label htmlFor={selectId} className="text-body font-medium" style={{ color: 'var(--color-ios-ink)' }}>
          {translateInactivity(language, 'inactivity.global.title')}
        </label>
        <select
          id={selectId}
          data-inactivity-delay=""
          value={settings.delayHours === null ? OFF : String(settings.delayHours)}
          onChange={(event) => void save(delayOf(event.currentTarget.value))}
          className="rounded-chip bg-transparent px-2 text-body focus-visible:outline-2"
          style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}
        >
          {INACTIVITY_DELAY_CHOICES.map((choice) => (
            <option key={choice} value={String(choice)}>
              {inactivityDelayLabel(language, choice)}
            </option>
          ))}
          <option value={OFF}>{inactivityDelayLabel(language, null)}</option>
        </select>
      </div>
      <SettingsProblem language={language} problem={problem} />
    </>
  );
}
