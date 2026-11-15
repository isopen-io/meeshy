import { useQuery, type QueryClient } from '@tanstack/react-query';
import { memo, useEffect, useState } from 'react';

import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import {
  PHONE_REACHABILITY_EMITTER_SETTINGS_QUERY_KEY,
  loadPhoneReachabilityEmitterSettings,
  loadPhoneReachabilityPersonSettings,
  phoneReachabilityPersonSettingsQueryKey,
  savePhoneReachabilityEmitterSettings,
  savePhoneReachabilityPersonSettings,
  type PhoneReachabilityDeps,
  type PhoneReachabilityEmitterSettings,
  type PhoneReachabilityPersonSettings,
} from '@/lib/api/phone-reachability';
import { appQueryClient } from '@/lib/api/query-client';
import { relationLinksQueryOptions } from '@/lib/api/relations';
import { translatePhoneReachability, usePhoneReachabilityCatalog } from '@/lib/i18n-phone-reachability-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { phoneReachabilityDetailOf, type PhoneReachabilityDetail } from '@/lib/phone-reachability/phone-reachability-view';
import { usePhoneReachabilityEntry } from '@/lib/phone-reachability/use-phone-reachability';
import { safeLocalStorage, type SafeStorage } from '@/lib/storage';

import { SwitchRow } from './conversation-settings-section';
import { SETTINGS_GLYPHS } from './glyphs-settings';
import { GroupedSection, SECTION_INK, SECTION_INK_2 } from './grouped-section';
import { PhoneReachabilityGlyph } from './phone-reachability-glyph';

/**
 * **LE TÉLÉPHONE INJOIGNABLE D'UNE PERSONNE, DANS LA FICHE ET LE PROFIL** (#18737, TEL-01) — même forme que la
 * batterie (`battery-panel.tsx`, #14147). Le web REÇOIT et AFFICHE : il ne répond à aucune sonde, et ses réglages
 * le disent (`phone.webNote`).
 *
 * - **Le détail** (« Téléphone injoignable depuis 14:10 », à l'horloge du lecteur, et la cause probable) n'existe
 *   que pendant un état servi : dans la fiche d'un direct et dans le profil de la personne.
 * - **Ce que je partage** (profil d'un Proche ou d'un Sang) : proposé à un Proche UNE fois, case non cochée ; chez
 *   un Sang, actif par défaut et retirable. Le serveur décide de l'état servi ; l'interface ne le présume pas.
 * - **Mon réglage global** (`/me`) : prévenir mes Proches, ou personne.
 *
 * Le niveau de la relation vient du MÊME cache que la ligne du cercle (`GET /relations`). Chaque réglage est
 * OPTIMISTE : il bascule au geste, revient en arrière si le serveur refuse, et le dit.
 */

type PanelDeps = { readonly deps?: PhoneReachabilityDeps; readonly client?: QueryClient };

const OFFERED_LEVELS: ReadonlySet<string> = new Set(['CLOSE', 'BLOOD']);

export const phoneReachabilityOfferedAt = (level: string | null | undefined): boolean => level != null && OFFERED_LEVELS.has(level);

type SettingsProblemKey = 'phone.settings.failed' | 'phone.settings.offline';

const settingsFailure = (result: ApiResult<unknown>): SettingsProblemKey => (!result.ok && result.status === 0 ? 'phone.settings.offline' : 'phone.settings.failed');

function useRelationLevel(userId: string, deps: PhoneReachabilityDeps, client: QueryClient): string | null {
  const links = useQuery(relationLinksQueryOptions(deps), client);
  return links.data?.find((candidate) => candidate.userId === userId)?.effectiveLevel ?? null;
}

function usePersonSettings(userId: string, deps: PhoneReachabilityDeps, client: QueryClient, enabled: boolean) {
  const queryKey = phoneReachabilityPersonSettingsQueryKey(userId);
  const query = useQuery({ queryKey, enabled, queryFn: async ({ signal }) => unwrap(await loadPhoneReachabilityPersonSettings(deps, userId, signal)) }, client);
  const [problem, setProblem] = useState<SettingsProblemKey | null>(null);
  const save = async (shared: boolean): Promise<void> => {
    const before = client.getQueryData<PhoneReachabilityPersonSettings>(queryKey);
    if (before === undefined) return;
    setProblem(null);
    client.setQueryData<PhoneReachabilityPersonSettings>(queryKey, { shared });
    const result = await savePhoneReachabilityPersonSettings(deps, userId, shared);
    if (result.ok) return void client.setQueryData<PhoneReachabilityPersonSettings>(queryKey, result.data);
    client.setQueryData<PhoneReachabilityPersonSettings>(queryKey, before);
    setProblem(settingsFailure(result));
  };
  return { settings: query.data ?? null, problem, save };
}

function useEmitterSettings(deps: PhoneReachabilityDeps, client: QueryClient) {
  const queryKey = PHONE_REACHABILITY_EMITTER_SETTINGS_QUERY_KEY;
  const query = useQuery({ queryKey, queryFn: async ({ signal }) => unwrap(await loadPhoneReachabilityEmitterSettings(deps, signal)) }, client);
  const [problem, setProblem] = useState<SettingsProblemKey | null>(null);
  const save = async (sharingEnabled: boolean): Promise<void> => {
    const before = client.getQueryData<PhoneReachabilityEmitterSettings>(queryKey);
    if (before === undefined) return;
    setProblem(null);
    client.setQueryData<PhoneReachabilityEmitterSettings>(queryKey, { sharingEnabled });
    const result = await savePhoneReachabilityEmitterSettings(deps, sharingEnabled);
    if (result.ok) return void client.setQueryData<PhoneReachabilityEmitterSettings>(queryKey, result.data);
    client.setQueryData<PhoneReachabilityEmitterSettings>(queryKey, before);
    setProblem(settingsFailure(result));
  };
  return { settings: query.data ?? null, problem, save };
}

/** L'heure qui fait passer « 14:10 » à « hier 14:10 » à minuit : une minute suffit. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export const PhoneReachabilityDetailCard = memo(function PhoneReachabilityDetailCard({ detail }: { readonly detail: PhoneReachabilityDetail }) {
  return (
    <div data-phone-reachability-detail="" role="group" aria-label={detail.headline} className="flex items-start gap-3 px-3 py-3">
      <span className="pt-0.5" style={{ color: 'var(--color-error)' }}>
        <PhoneReachabilityGlyph reachable={false} size={24} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body font-semibold" style={{ color: SECTION_INK }}>
          {detail.headline}
        </span>
        {detail.cause === null ? null : (
          <span data-phone-reachability-cause="" className="text-caption" style={{ color: SECTION_INK_2 }}>
            {detail.cause}
          </span>
        )}
      </span>
    </div>
  );
});

function DetailOf({ userId, language, client }: { readonly userId: string; readonly language: InterfaceLanguage; readonly client: QueryClient }) {
  const entry = usePhoneReachabilityEntry(userId, client);
  const now = useMinuteClock();
  if (entry === null) return null;
  return <PhoneReachabilityDetailCard detail={phoneReachabilityDetailOf(entry, language, { now })} />;
}

function SettingsProblem({ language, problem }: { readonly language: InterfaceLanguage; readonly problem: SettingsProblemKey | null }) {
  return (
    <span data-phone-reachability-settings-problem={problem ?? ''} role="alert" className="px-3 text-caption" style={{ color: 'var(--color-error)' }}>
      {problem === null ? '' : translatePhoneReachability(language, problem)}
    </span>
  );
}

/**
 * La section « Téléphone » de la fiche d'un DIRECT : n'existe que pendant un état servi — un téléphone qui répond
 * ne s'y dit pas. Le serveur ne sert l'état qu'aux Proches et aux Sangs autorisés.
 */
export function ConversationPhoneReachabilitySection({ userId, language, client = appQueryClient }: { readonly userId: string; readonly language: InterfaceLanguage; readonly client?: QueryClient }) {
  const entry = usePhoneReachabilityEntry(userId, client);
  const ready = usePhoneReachabilityCatalog(language, entry !== null);
  if (entry === null || !ready) return null;
  return (
    <div className="px-4 pb-6" data-conversation-phone-reachability="">
      <GroupedSection id="conversation-phone-reachability" title={translatePhoneReachability(language, 'phone.detail.title')} icon={<PhoneReachabilityGlyph reachable={false} size={18} />}>
        <DetailOf userId={userId} language={language} client={client} />
      </GroupedSection>
    </div>
  );
}

const consentKey = (viewerId: string, peerId: string): string => `meeshy.phoneReachability.consentOffered.${viewerId}.${peerId}`;

function useConsentMemory(viewerId: string | null | undefined, peerId: string, storage: SafeStorage) {
  const read = (): boolean => {
    if (viewerId == null) return true;
    try {
      return storage.getItem(consentKey(viewerId, peerId)) === '1';
    } catch {
      return true;
    }
  };
  const [offered, setOffered] = useState(read);
  const markOffered = (): void => {
    setOffered(true);
    if (viewerId == null) return;
    try {
      storage.setItem(consentKey(viewerId, peerId), '1');
    } catch {
      /* la proposition ne reviendra pas pendant cette visite */
    }
  };
  return { offered, markOffered };
}

function ConsentOffer({ language, name, onAnswer }: { readonly language: InterfaceLanguage; readonly name: string; readonly onAnswer: (shared: boolean) => void }) {
  const [checked, setChecked] = useState(false);
  return (
    <div data-phone-reachability-consent="" role="group" aria-label={translatePhoneReachability(language, 'phone.consent.title', { name })} className="m-2 grid gap-2 rounded-card px-3 py-3" style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 8%, transparent)' }}>
      <span className="text-body font-semibold" style={{ color: SECTION_INK }}>
        {translatePhoneReachability(language, 'phone.consent.title', { name })}
      </span>
      <span className="text-caption" style={{ color: SECTION_INK_2 }}>
        {translatePhoneReachability(language, 'phone.consent.body', { name })}
      </span>
      <label className="flex cursor-pointer items-center gap-3" style={{ minHeight: 44 }}>
        <input type="checkbox" data-phone-reachability-consent-checkbox="" checked={checked} onChange={(event) => setChecked(event.currentTarget.checked)} className="size-5 shrink-0 accent-[var(--color-ios-brand)]" />
        <span className="text-body" style={{ color: SECTION_INK }}>
          {translatePhoneReachability(language, 'phone.share.title', { name })}
        </span>
      </label>
      <button
        type="button"
        data-phone-reachability-consent-confirm=""
        onClick={() => onAnswer(checked)}
        className="grid place-items-center rounded-chip px-3 text-body font-semibold transition-transform focus-visible:outline-2 active:scale-[0.98]"
        style={{ minHeight: 44, color: 'var(--color-ios-on-brand, #fff)', backgroundColor: 'var(--color-ios-brand)' }}
      >
        {translatePhoneReachability(language, 'phone.consent.confirm')}
      </button>
    </div>
  );
}

/**
 * La rangée « Téléphone » du PROFIL d'un Proche ou d'un Sang : le détail pendant un état servi, et « Prévenir {name}
 * si mon téléphone est injoignable » — proposé à un Proche sans être coché, actif par défaut chez un Sang.
 */
export function ProfilePhoneReachabilityRow({
  language,
  person,
  viewerId,
  storage = safeLocalStorage(),
  deps = apiDeps,
  client = appQueryClient,
}: {
  readonly language: InterfaceLanguage;
  readonly person: { readonly id: string; readonly username: string; readonly displayName?: string | null };
  readonly viewerId?: string | null;
  readonly storage?: SafeStorage;
} & PanelDeps) {
  const level = useRelationLevel(person.id, deps, client);
  const offered = phoneReachabilityOfferedAt(level);
  const ready = usePhoneReachabilityCatalog(language, offered);
  const { settings, problem, save } = usePersonSettings(person.id, deps, client, offered);
  const emitter = useEmitterSettings(deps, client);
  const consent = useConsentMemory(viewerId, person.id, storage);
  if (!offered || !ready) return null;
  const name = person.displayName ?? person.username;
  const proposes = level === 'CLOSE' && settings !== null && !settings.shared && emitter.settings?.sharingEnabled === true && !consent.offered;
  const answerConsent = (shared: boolean): void => {
    consent.markOffered();
    if (shared) void save(true);
  };
  return (
    <div data-profile-phone-reachability={level ?? ''} className="grid gap-1 rounded-card" style={{ backgroundColor: 'var(--color-ios-card)' }}>
      <DetailOf userId={person.id} language={language} client={client} />
      {proposes ? <ConsentOffer language={language} name={name} onAnswer={answerConsent} /> : null}
      {settings === null || proposes ? null : (
        <SwitchRow
          label={translatePhoneReachability(language, 'phone.share.title', { name })}
          hint={level === 'BLOOD' ? translatePhoneReachability(language, 'phone.share.explainBlood') : translatePhoneReachability(language, 'phone.share.explainClose', { name })}
          checked={settings.shared}
          onChange={(shared) => void save(shared)}
          marker="data-phone-reachability-share"
        />
      )}
      {emitter.settings?.sharingEnabled === false ? (
        <span data-phone-reachability-global-off="" className="px-3 text-caption" style={{ color: SECTION_INK_2 }}>
          {translatePhoneReachability(language, 'phone.share.globalOff')}
        </span>
      ) : null}
      <SettingsProblem language={language} problem={problem} />
      <span data-phone-reachability-web-note="" className="px-3 pb-2 text-caption" style={{ color: SECTION_INK_2 }}>
        {translatePhoneReachability(language, 'phone.webNote')}
      </span>
    </div>
  );
}

/** Mon réglage GLOBAL (`/me`) : prévenir mes Proches si mon téléphone est injoignable, ou personne. */
export function MePhoneReachabilitySection({ language, deps = apiDeps, client = appQueryClient }: { readonly language: InterfaceLanguage } & PanelDeps) {
  const ready = usePhoneReachabilityCatalog(language);
  const { settings, problem, save } = useEmitterSettings(deps, client);
  if (!ready) return null;
  return (
    <GroupedSection
      id="me-phone-reachability"
      title={translatePhoneReachability(language, 'phone.detail.title')}
      icon={<PhoneReachabilityGlyph reachable={false} size={18} />}
      note={{
        label: translatePhoneReachability(language, 'phone.global.question'),
        text: `${translatePhoneReachability(language, 'phone.global.explain')} ${translatePhoneReachability(language, 'phone.webNote')}`,
        glyph: SETTINGS_GLYPHS.info,
      }}
    >
      {settings === null ? null : (
        <SwitchRow label={translatePhoneReachability(language, 'phone.global.title')} checked={settings.sharingEnabled} onChange={(on) => void save(on)} marker="data-phone-reachability-global" />
      )}
      <SettingsProblem language={language} problem={problem} />
    </GroupedSection>
  );
}
