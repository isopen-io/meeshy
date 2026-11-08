import { useQuery } from '@tanstack/react-query';
import { isPlatformTeam } from '@meeshy/shared/types/role-types';

import { adminIdentityQueryOptions } from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { TEAM_SHARES, type PersonSettingsDeps, type TeamShare } from '@/lib/relations/person-settings';
import { useCirclesCatalog } from '@/lib/use-circles-catalog';
import { PersonSettingSwitch } from '@/routes/circle-reception-block';

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
 * Le rôle du lecteur ne se demande que face à un collègue : la fiche d'un
 * utilisateur ordinaire ne coûte aucune lecture de plus.
 *
 * L'interrupteur est celui des réglages de réception (`PersonSettingSwitch`) :
 * une seule lecture, un seul état, la même mécanique optimiste. Hors ligne,
 * l'état servi se lit, le geste ne s'offre pas.
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
  online,
  onNotice,
  deps = apiDeps,
}: {
  readonly language: InterfaceLanguage;
  readonly person: { readonly id: string; readonly username: string; readonly displayName: string | null };
  readonly targetRole: string | null | undefined;
  readonly online: boolean;
  readonly onNotice: (message: string) => void;
  readonly deps?: PersonSettingsDeps;
}) {
  const ready = useCirclesCatalog(language);
  const colleague = isPlatformTeam(targetRole);
  const viewer = useQuery({ ...adminIdentityQueryOptions(deps), enabled: colleague }, appQueryClient);
  if (!ready || !isTeamPair(viewer.data?.role, targetRole)) return null;

  const name = person.displayName ?? person.username;
  const headingId = `profile-team-shares-${person.id}`;
  const failed = translateCircles(language, 'circles.team.failed');
  return (
    <section role="group" aria-labelledby={headingId} data-profile-team-shares={person.id} className="grid gap-1 px-4 py-2">
      <h3 id={headingId} className="text-body font-bold">
        {translateCircles(language, 'circles.team.title', { name })}
      </h3>
      {TEAM_SHARES.map((share) => (
        <PersonSettingSwitch
          key={share}
          userId={person.id}
          field={share}
          copy={{ label: translateCircles(language, SPECS[share].label), detail: translateCircles(language, SPECS[share].detail), failed }}
          marker={{ 'data-team-share': share }}
          disabled={!online}
          onNotice={onNotice}
          deps={deps}
        />
      ))}
    </section>
  );
}
