import { useQuery, type QueryClient } from '@tanstack/react-query';
import { memo, useState } from 'react';

import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import {
  PHONE_CALL_EMITTER_SETTINGS_QUERY_KEY,
  loadPhoneCallEmitterSettings,
  loadPhoneCallPersonSettings,
  phoneCallPersonSettingsQueryKey,
  savePhoneCallEmitterSettings,
  savePhoneCallPersonSettings,
  type PhoneCallDeps,
  type PhoneCallPersonShare,
} from '@/lib/api/phone-call';
import { appQueryClient } from '@/lib/api/query-client';
import { relationLinksQueryOptions, relationRaiseGateQueryOptions } from '@/lib/api/relations';
import { translatePhoneCall, usePhoneCallCatalog } from '@/lib/i18n-phone-call-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { phoneCallHeadline } from '@/lib/phone-call/phone-call-view';
import { useMinuteClock, usePhoneCallState } from '@/lib/phone-call/use-phone-call';

import type { PhoneCallEmitterSettings } from '@meeshy/shared/types/phone-call';

import { SwitchRow } from './conversation-settings-section';
import { GroupedSection, SECTION_INK, SECTION_INK_2 } from './grouped-section';
import { PhoneCallGlyph } from './phone-call-glyph';

/**
 * **« EN APPEL » DANS LA FICHE, LE PROFIL ET « MOI »** (#18753, ACT-01) — même forme que la vérification d'inactivité
 * (`inactivity-panel.tsx`, #18738). Le web AFFICHE et RÈGLE : un navigateur ne voit pas les appels.
 *
 * - **Le détail** (« En appel depuis 12 min », puis « depuis 14:00 » à l'horloge du lecteur) n'existe que pendant un
 *   état servi et non expiré. Jamais avec qui. Jamais un message.
 * - **« Montrer que je suis en appel »** (fiche et profil) : chez un Sang, ou entre deux comptes de l'équipe (le niveau
 *   d'ACCÈS servi par `GET /relations/:userId`, #16623) ; accordé par défaut, retirable.
 * - **Mon partage** (`/me`) : « Montrer à mes Sangs que je suis en appel », pour tous à la fois.
 *
 * Chaque réglage est OPTIMISTE : il bascule au geste, revient en arrière si le serveur refuse, et le dit.
 */

type PanelDeps = { readonly deps?: PhoneCallDeps; readonly client?: QueryClient };

type SettingsProblemKey = 'call.settings.failed' | 'call.settings.offline';

const settingsFailure = (result: ApiResult<unknown>): SettingsProblemKey => (!result.ok && result.status === 0 ? 'call.settings.offline' : 'call.settings.failed');

/** Le cercle où « en appel » se partage (`device.call`) : le Sang, et l'équipe entre elle (niveau d'accès Sang). */
function useSharedAtBlood(userId: string, deps: PhoneCallDeps, client: QueryClient): boolean {
  const links = useQuery(relationLinksQueryOptions(deps), client);
  const linkedBlood = links.data?.find((candidate) => candidate.userId === userId)?.effectiveLevel === 'BLOOD';
  const gate = useQuery({ ...relationRaiseGateQueryOptions(deps, userId), enabled: links.isSuccess && !linkedBlood }, client);
  return linkedBlood || gate.data?.accessLevel === 'BLOOD';
}

function useOptimisticSetting<T>(client: QueryClient, queryKey: readonly unknown[], send: (next: T) => Promise<ApiResult<T>>) {
  const [problem, setProblem] = useState<SettingsProblemKey | null>(null);
  const save = async (next: T): Promise<void> => {
    const before = client.getQueryData<T>(queryKey);
    if (before === undefined) return;
    setProblem(null);
    client.setQueryData<T>(queryKey, next);
    const result = await send(next);
    if (result.ok) return void client.setQueryData<T>(queryKey, result.data);
    client.setQueryData<T>(queryKey, before);
    setProblem(settingsFailure(result));
  };
  return { problem, save };
}

function usePersonSettings(userId: string, deps: PhoneCallDeps, client: QueryClient, enabled: boolean) {
  const queryKey = phoneCallPersonSettingsQueryKey(userId);
  const query = useQuery({ queryKey, enabled, queryFn: async ({ signal }) => unwrap(await loadPhoneCallPersonSettings(deps, userId, signal)) }, client);
  const { problem, save } = useOptimisticSetting<PhoneCallPersonShare>(client, queryKey, ({ shared }) => savePhoneCallPersonSettings(deps, userId, shared));
  return { settings: query.data ?? null, problem, save: (shared: boolean) => save({ shared }) };
}

function useEmitterSettings(deps: PhoneCallDeps, client: QueryClient, enabled = true) {
  const queryKey = PHONE_CALL_EMITTER_SETTINGS_QUERY_KEY;
  const query = useQuery({ queryKey, enabled, queryFn: async ({ signal }) => unwrap(await loadPhoneCallEmitterSettings(deps, signal)) }, client);
  const { problem, save } = useOptimisticSetting<PhoneCallEmitterSettings>(client, queryKey, ({ sharingEnabled }) => savePhoneCallEmitterSettings(deps, sharingEnabled));
  return { settings: query.data ?? null, problem, save: (sharingEnabled: boolean) => save({ sharingEnabled }) };
}

export const PhoneCallDetailCard = memo(function PhoneCallDetailCard({ headline }: { readonly headline: string }) {
  return (
    <div data-phone-call-detail="" role="group" aria-label={headline} className="flex items-center gap-3 px-3 py-3">
      <span style={{ color: 'var(--color-ok)' }}>
        <PhoneCallGlyph active size={24} />
      </span>
      <span className="text-body font-semibold" style={{ color: SECTION_INK }}>
        {headline}
      </span>
    </div>
  );
});

function DetailOf({ userId, language, client }: { readonly userId: string; readonly language: InterfaceLanguage; readonly client: QueryClient }) {
  const now = Math.max(useMinuteClock(), Date.now());
  const state = usePhoneCallState(userId, now, client);
  if (state === null) return null;
  return <PhoneCallDetailCard headline={phoneCallHeadline(state, language, { now })} />;
}

function SettingsProblem({ language, problem }: { readonly language: InterfaceLanguage; readonly problem: SettingsProblemKey | null }) {
  return (
    <span data-phone-call-settings-problem={problem ?? ''} role="alert" className="px-3 text-caption" style={{ color: 'var(--color-error)' }}>
      {problem === null ? '' : translatePhoneCall(language, problem)}
    </span>
  );
}

/** Le détail pendant un état servi, et l'interrupteur chez un Sang ou dans l'équipe : le corps commun de la fiche et du profil. */
function usePersonPhoneCall(userId: string, language: InterfaceLanguage, deps: PhoneCallDeps, client: QueryClient) {
  const state = usePhoneCallState(userId, Date.now(), client);
  const offered = useSharedAtBlood(userId, deps, client);
  const ready = usePhoneCallCatalog(language, state !== null || offered);
  const person = usePersonSettings(userId, deps, client, offered);
  const emitter = useEmitterSettings(deps, client, offered);
  return { shown: ready && (state !== null || offered), offered, ...person, globalOff: emitter.settings?.sharingEnabled === false };
}

function PersonBody({ userId, name, language, client, person }: { readonly userId: string; readonly name: string; readonly language: InterfaceLanguage; readonly client: QueryClient; readonly person: ReturnType<typeof usePersonPhoneCall> }) {
  return (
    <>
      <DetailOf userId={userId} language={language} client={client} />
      {!person.offered || person.settings === null ? null : (
        <SwitchRow
          label={translatePhoneCall(language, 'call.share.title')}
          hint={translatePhoneCall(language, 'call.share.explain', { name })}
          checked={person.settings.shared}
          onChange={(shared) => void person.save(shared)}
          marker="data-phone-call-share"
        />
      )}
      {person.offered && person.globalOff ? (
        <span data-phone-call-global-off="" className="px-3 text-caption" style={{ color: SECTION_INK_2 }}>
          {translatePhoneCall(language, 'call.share.globalOff')}
        </span>
      ) : null}
      <SettingsProblem language={language} problem={person.problem} />
    </>
  );
}

/** La section « En appel » de la fiche d'un DIRECT : l'état servi, et l'interrupteur chez un Sang. Ni l'un ni l'autre : rien. */
export function ConversationPhoneCallSection({
  userId,
  name,
  language,
  deps = apiDeps,
  client = appQueryClient,
}: { readonly userId: string; readonly name: string; readonly language: InterfaceLanguage } & PanelDeps) {
  const person = usePersonPhoneCall(userId, language, deps, client);
  if (!person.shown) return null;
  return (
    <div className="px-4 pb-6" data-conversation-phone-call="">
      <GroupedSection id="conversation-phone-call" title={translatePhoneCall(language, 'call.detail.title')} icon={<PhoneCallGlyph active size={18} />}>
        <PersonBody userId={userId} name={name} language={language} client={client} person={person} />
      </GroupedSection>
    </div>
  );
}

/** La rangée « En appel » du PROFIL d'un Sang (ou d'un compte de l'équipe) : l'état servi, et l'interrupteur. */
export function ProfilePhoneCallRow({
  language,
  person,
  deps = apiDeps,
  client = appQueryClient,
}: {
  readonly language: InterfaceLanguage;
  readonly person: { readonly id: string; readonly username: string; readonly displayName?: string | null };
} & PanelDeps) {
  const state = usePersonPhoneCall(person.id, language, deps, client);
  if (!state.shown) return null;
  return (
    <div data-profile-phone-call="" className="grid gap-1 rounded-card" style={{ backgroundColor: 'var(--color-ios-card)' }}>
      <PersonBody userId={person.id} name={person.displayName ?? person.username} language={language} client={client} person={state} />
    </div>
  );
}

/**
 * Mon partage (`/me`), en une ligne : il se range dans la carte « Mon téléphone » (`MeBatterySection`), si bien que
 * `/me` ne gagne ni titre ni question. Couper ici efface l'état chez tous mes Sangs et ferme la collecte.
 */
export function MePhoneCallRow({ language, deps = apiDeps, client = appQueryClient }: { readonly language: InterfaceLanguage } & PanelDeps) {
  const ready = usePhoneCallCatalog(language);
  const { settings, problem, save } = useEmitterSettings(deps, client);
  if (!ready || settings === null) return null;
  return (
    <>
      <SwitchRow label={translatePhoneCall(language, 'call.global.short')} checked={settings.sharingEnabled} onChange={(on) => void save(on)} marker="data-phone-call-global" />
      <SettingsProblem language={language} problem={problem} />
    </>
  );
}
