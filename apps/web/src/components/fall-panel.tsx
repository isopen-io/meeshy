import { useQuery, type QueryClient } from '@tanstack/react-query';
import { memo, useState } from 'react';

import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { fallPersonSettingsQueryKey, loadFallPersonSettings, saveFallPersonSettings, type FallDeps, type FallPersonShare } from '@/lib/api/fall';
import type { ApiResult } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { relationLinksQueryOptions } from '@/lib/api/relations';
import { fallDetailOf, type FallDetail } from '@/lib/fall/fall-view';
import { useFallClock, useFallEntry } from '@/lib/fall/use-fall';
import { translateFall, useFallCatalog } from '@/lib/i18n-fall-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { coqueCourante } from '@/lib/native-shell';
import { mapsUrlOf } from '@/lib/view/message-body';

import { SwitchRow } from './conversation-settings-section';
import { FallGlyph } from './fall-glyph';
import { SETTINGS_GLYPHS } from './glyphs-settings';
import { GroupedSection, SECTION_INK, SECTION_INK_2 } from './grouped-section';
import { InfoNoted } from './info-hint';

/**
 * **LA CHUTE DÉTECTÉE DANS LA FICHE, LE PROFIL ET « MOI »** (#18748, SAN-01) — même forme que la vérification
 * d'inactivité (`inactivity-panel.tsx`, #18738).
 *
 * - **Le détail** (« Chute détectée à 16:42 », à l'horloge du lecteur ; la dernière batterie et l'accès à la dernière
 *   position SEULEMENT s'ils sont servis) n'existe que pendant un épisode servi et non expiré. Jamais un message.
 * - **« Prévenir si ma montre détecte une chute »** (fiche et profil d'un Sang) : accordé par défaut entre Sangs une
 *   fois mon accord donné sur l'iPhone, retirable. Le serveur décide de ce qui est servi ; l'interface ne le présume pas.
 * - **« Moi »** : une ligne qui dit d'où vient la détection — une Apple Watch, réglée depuis l'app iPhone (un (i)). Le web ne
 *   recueille aucun accord (donnée de santé, art. 9 RGPD : l'accord se donne là où la donnée naît).
 *
 * Le niveau de la relation vient du MÊME cache que la ligne du cercle (`GET /relations`). Le réglage est OPTIMISTE :
 * il bascule au geste, revient en arrière si le serveur refuse, et le dit.
 */

type PanelDeps = { readonly deps?: FallDeps; readonly client?: QueryClient };

type SettingsProblemKey = 'fall.settings.failed' | 'fall.settings.offline';

const settingsFailure = (result: ApiResult<unknown>): SettingsProblemKey => (!result.ok && result.status === 0 ? 'fall.settings.offline' : 'fall.settings.failed');

/** Le cercle où la chute se partage : le Sang (`health.fall`). */
const isBlood = (level: string | null): boolean => level === 'BLOOD';

function useRelationLevel(userId: string, deps: FallDeps, client: QueryClient): string | null {
  const links = useQuery(relationLinksQueryOptions(deps), client);
  return links.data?.find((candidate) => candidate.userId === userId)?.effectiveLevel ?? null;
}

function usePersonSettings(userId: string, deps: FallDeps, client: QueryClient, enabled: boolean) {
  const queryKey = fallPersonSettingsQueryKey(userId);
  const query = useQuery({ queryKey, enabled, queryFn: async ({ signal }) => unwrap(await loadFallPersonSettings(deps, userId, signal)) }, client);
  const [problem, setProblem] = useState<SettingsProblemKey | null>(null);
  const save = async (shared: boolean): Promise<void> => {
    const before = client.getQueryData<FallPersonShare>(queryKey);
    if (before === undefined) return;
    setProblem(null);
    client.setQueryData<FallPersonShare>(queryKey, { shared });
    const result = await saveFallPersonSettings(deps, userId, shared);
    if (result.ok) return void client.setQueryData<FallPersonShare>(queryKey, result.data);
    client.setQueryData<FallPersonShare>(queryKey, before);
    setProblem(settingsFailure(result));
  };
  return { settings: query.data ?? null, problem, save };
}

export const FallDetailCard = memo(function FallDetailCard({ detail }: { readonly detail: FallDetail }) {
  const position = detail.position;
  return (
    <div data-fall-detail="" role="group" aria-label={detail.headline} className="flex items-start gap-3 px-3 py-3">
      <span className="pt-0.5" style={{ color: 'var(--color-error)' }}>
        <FallGlyph responded={false} size={24} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body font-semibold" style={{ color: SECTION_INK }}>
          {detail.headline}
        </span>
        {detail.battery === null ? null : (
          <span data-fall-battery="" className="text-caption" style={{ color: SECTION_INK_2 }}>
            {detail.battery}
          </span>
        )}
        {position === null ? null : (
          <a
            data-fall-map=""
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
  const now = useFallClock();
  const entry = useFallEntry(userId, now, client);
  if (entry === null) return null;
  return <FallDetailCard detail={fallDetailOf(entry, language, { now })} />;
}

function SettingsProblem({ language, problem }: { readonly language: InterfaceLanguage; readonly problem: SettingsProblemKey | null }) {
  return (
    <span data-fall-settings-problem={problem ?? ''} role="alert" className="px-3 text-caption" style={{ color: 'var(--color-error)' }}>
      {problem === null ? '' : translateFall(language, problem)}
    </span>
  );
}

/** Le détail pendant un épisode servi, et l'interrupteur chez un Sang : le corps commun de la fiche et du profil. */
function usePersonFall(userId: string, language: InterfaceLanguage, deps: FallDeps, client: QueryClient) {
  const entry = useFallEntry(userId, useFallClock(), client);
  const blood = isBlood(useRelationLevel(userId, deps, client));
  const ready = useFallCatalog(language, entry !== null || blood);
  const { settings, problem, save } = usePersonSettings(userId, deps, client, blood);
  return { shown: ready && (entry !== null || blood), blood, settings, problem, save };
}

function PersonBody({ userId, name, language, client, person }: { readonly userId: string; readonly name: string; readonly language: InterfaceLanguage; readonly client: QueryClient; readonly person: ReturnType<typeof usePersonFall> }) {
  return (
    <>
      <DetailOf userId={userId} language={language} client={client} />
      {!person.blood || person.settings === null ? null : (
        <SwitchRow
          label={translateFall(language, 'fall.share.title')}
          hint={translateFall(language, 'fall.share.explain', { name })}
          checked={person.settings.shared}
          onChange={(shared) => void person.save(shared)}
          marker="data-fall-share"
        />
      )}
      <SettingsProblem language={language} problem={person.problem} />
    </>
  );
}

/** La section « Chute détectée » de la fiche d'un DIRECT : l'épisode servi, et l'interrupteur chez un Sang. Ni l'un ni l'autre : rien. */
export function ConversationFallSection({
  userId,
  name,
  language,
  deps = apiDeps,
  client = appQueryClient,
}: { readonly userId: string; readonly name: string; readonly language: InterfaceLanguage } & PanelDeps) {
  const person = usePersonFall(userId, language, deps, client);
  if (!person.shown) return null;
  return (
    <div className="px-4 pb-6" data-conversation-fall="">
      <GroupedSection id="conversation-fall" title={translateFall(language, 'fall.detail.title')} icon={<FallGlyph responded={false} size={18} />}>
        <PersonBody userId={userId} name={name} language={language} client={client} person={person} />
      </GroupedSection>
    </div>
  );
}

/** La rangée « Chute détectée » du PROFIL d'un Sang : l'épisode servi, et l'interrupteur. */
export function ProfileFallRow({
  language,
  person,
  deps = apiDeps,
  client = appQueryClient,
}: {
  readonly language: InterfaceLanguage;
  readonly person: { readonly id: string; readonly username: string; readonly displayName?: string | null };
} & PanelDeps) {
  const state = usePersonFall(person.id, language, deps, client);
  if (!state.shown) return null;
  return (
    <div data-profile-fall="" className="grid gap-1 rounded-card" style={{ backgroundColor: 'var(--color-ios-card)' }}>
      <PersonBody userId={person.id} name={person.displayName ?? person.username} language={language} client={client} person={state} />
    </div>
  );
}

/**
 * « Détection de chute » dans « Mon téléphone » (`/me`) : une ligne, sa source (« Apple Watch ») et un (i) qui dit
 * où l'accord se donne — l'app iPhone, qui seule lit la montre. Aucun réglage ici, aucune requête.
 */
export function MeFallRow({ language }: { readonly language: InterfaceLanguage }) {
  const ready = useFallCatalog(language);
  if (!ready) return null;
  return (
    <InfoNoted note={{ label: translateFall(language, 'fall.me.question'), text: translateFall(language, 'fall.me.explain'), glyph: SETTINGS_GLYPHS.info }}>
      <div data-me-fall="" className="flex items-center justify-between gap-3 px-3 py-2" style={{ minHeight: 52 }}>
        <span data-me-fall-title="" className="text-body font-medium" style={{ color: 'var(--color-ios-ink)' }}>
          {translateFall(language, 'fall.me.title')}
        </span>
        <span data-me-fall-source="" className="text-body" style={{ color: SECTION_INK_2 }}>
          {translateFall(language, 'fall.me.source')}
        </span>
      </div>
    </InfoNoted>
  );
}
