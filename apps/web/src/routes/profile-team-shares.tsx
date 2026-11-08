import { useQuery } from '@tanstack/react-query';
import { isPlatformTeam } from '@meeshy/shared/types/role-types';

import { adminIdentityQueryOptions } from '@/lib/api/admin';
import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import {
  decodeReceptionSettings,
  loadReceptionSettings,
  personSettingsQueryKey,
  setPersonSetting,
  TEAM_SHARES,
  type PersonSettingsDeps,
  type ReceptionSettings,
  type TeamShare,
} from '@/lib/relations/person-settings';
import { useCirclesCatalog } from '@/lib/use-circles-catalog';

/**
 * **LA FICHE D'UN COLLÈGUE DE L'ÉQUIPE** (#16864, décision porteur 2026-11-08) —
 * entre deux comptes MODERATOR, ADMIN ou BIGBOSS, toutes les features de cercle
 * s'ouvrent SANS lien : le titre que j'écoute et les trois partages de position
 * s'accordent ici, d'un geste, et se retirent de même (`PUT
 * /relations/:userId/settings`, #16642). Refusés par défaut.
 *
 * Les interrupteurs n'existent que pour une PAIRE d'équipe : le serveur juge la
 * paire (il refuse toute autre en 400), le client ne montre donc que ce qu'il
 * accepte. Le rôle du lecteur vient de `GET /me/permissions` (la session ne le
 * projette pas, délibérément) ; tant qu'il manque, ou s'il est refusé, rien
 * n'apparaît — fail-closed, jamais un clignotement. Libellés et détails : ceux
 * du rituel du Sang, qui offre les mêmes quatre partages.
 *
 * Optimiste : coché au geste, rendu à l'état d'avant sur un refus, qui se dit.
 * Le cache de la fiche (`personSettingsQueryKey`) est celui des réglages de
 * réception : une seule lecture, un seul état.
 */

type ShareSpec = {
  readonly label: `circles.ritual.consent.${'listeningTitle' | 'locationLive' | 'locationHistory' | 'locationProximity'}`;
  readonly detail: `circles.ritual.consent.${'listeningTitle' | 'locationLive' | 'locationHistory' | 'locationProximity'}.detail`;
};

const SPECS: Readonly<Record<TeamShare, ShareSpec>> = {
  listeningTitleShared: { label: 'circles.ritual.consent.listeningTitle', detail: 'circles.ritual.consent.listeningTitle.detail' },
  locationShared: { label: 'circles.ritual.consent.locationLive', detail: 'circles.ritual.consent.locationLive.detail' },
  locationHistoryShared: { label: 'circles.ritual.consent.locationHistory', detail: 'circles.ritual.consent.locationHistory.detail' },
  proximityShared: { label: 'circles.ritual.consent.locationProximity', detail: 'circles.ritual.consent.locationProximity.detail' },
};

/** Deux comptes de l'équipe, et eux seuls : `isPlatformTeam` est l'unique définition. */
export const isTeamPair = (viewerRole: string | null | undefined, targetRole: string | null | undefined): boolean =>
  isPlatformTeam(viewerRole) && isPlatformTeam(targetRole);

export function ProfileTeamShares({
  language,
  person,
  targetRole,
  onNotice,
  deps = apiDeps,
}: {
  readonly language: InterfaceLanguage;
  readonly person: { readonly id: string; readonly username: string; readonly displayName: string | null };
  readonly targetRole: string | null | undefined;
  readonly onNotice: (message: string) => void;
  readonly deps?: PersonSettingsDeps;
}) {
  const ready = useCirclesCatalog(language);
  const viewer = useQuery(adminIdentityQueryOptions(deps), appQueryClient);
  const opens = isTeamPair(viewer.data?.role, targetRole);
  const key = personSettingsQueryKey(person.id);
  const settings = useQuery(
    {
      queryKey: key,
      staleTime: 30_000,
      enabled: opens,
      queryFn: async ({ signal }: { readonly signal?: AbortSignal }) => unwrap(await loadReceptionSettings(deps, person.id, signal)),
    },
    appQueryClient,
  );
  if (!ready || !opens) return null;

  const set = async (share: TeamShare, next: boolean): Promise<void> => {
    await appQueryClient.cancelQueries({ queryKey: key });
    appQueryClient.setQueryData<ReceptionSettings>(key, (before) => ({ ...decodeReceptionSettings(before), [share]: next }));
    const result = await setPersonSetting(deps, person.id, share, next);
    if (result.ok) {
      appQueryClient.setQueryData(key, result.data);
      return;
    }
    appQueryClient.setQueryData<ReceptionSettings>(key, (current) => ({ ...decodeReceptionSettings(current), [share]: !next }));
    onNotice(translateCircles(language, 'circles.team.failed'));
  };

  const name = person.displayName ?? person.username;
  const headingId = `profile-team-shares-${person.id}`;
  return (
    <section role="group" aria-labelledby={headingId} data-profile-team-shares={person.id} className="grid gap-1 px-4 py-2">
      <h3 id={headingId} className="text-body font-bold">
        {translateCircles(language, 'circles.team.title', { name })}
      </h3>
      {TEAM_SHARES.map((share) => {
        const spec = SPECS[share];
        const detailId = `${headingId}-${share}`;
        return (
          <label key={share} className="flex items-center gap-3" style={{ minHeight: 44 }}>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="text-body">{translateCircles(language, spec.label)}</span>
              <span id={detailId} className="text-caption opacity-70">
                {translateCircles(language, spec.detail)}
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              data-team-share={share}
              checked={settings.data?.[share] ?? false}
              aria-describedby={detailId}
              onChange={(event) => void set(share, event.currentTarget.checked)}
              className="size-5"
            />
          </label>
        );
      })}
    </section>
  );
}
