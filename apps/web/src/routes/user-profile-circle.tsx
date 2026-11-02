import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { RelationRequestLevel } from '@meeshy/shared/types/relation';
import { memo, useMemo } from 'react';

import { apiDeps } from '@/lib/api/deps';
import { performSendRequest, type FriendActionOutcome } from '@/lib/api/friend-actions';
import { flattenFriendRequests, friendRequestsQueryOptions, type PersonSummary } from '@/lib/api/friend-requests';
import { appQueryClient } from '@/lib/api/query-client';
import { relationLinksQueryOptions, type RelationDeps, type RelationLink } from '@/lib/api/relations';
import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { CIRCLE_LEVELS, pendingRaiseOf, progressSummary, raiseOffer } from '@/lib/relations/circles';
import { relationLevelIcon, relationLevelLabel } from '@/lib/relations/level-labels';
import { useCirclesCatalog } from '@/lib/use-circles-catalog';
import { progressText } from '@/lib/relations/progress-text';
import { BRAND, BRAND_FILL, FOCUS, INK, INK_2 } from './user-profile-style';

/**
 * **LE CERCLE SUR LA FICHE D'UNE PERSONNE** (#13940) — miroir de
 * `ProfileCircleSection` + `ProfileCircleViewModel`
 * (`apps/ios/Meeshy/Features/Contacts/`, branche `lot/ui-profil-cercles-ios-13940`) :
 * le niveau COMMUN, ce qui manque pour monter, et « Demander X » quand la loi de
 * demande l'ouvre.
 *
 * - **Visible des deux seuls** : le niveau vient de `GET /relations`, que la
 *   passerelle ne sert qu'à l'appelant — le MÊME cache que « Mes cercles »,
 *   peint avant le réseau.
 * - **Rien n'est fabriqué** : sans lien servi, ou sous Connaissance, la ligne
 *   ne rend rien.
 * - **Optimiste** : « Demander » écrit la demande dans le panier des envoyées au
 *   tap (`performSendRequest`), qui dit « Demande envoyée · X » avant la
 *   passerelle et se défait sur un refus.
 * - **Une Connaissance aussi** (iOS ne la montre qu'aux contacts, dimension
 *   restante de #14415) : sa ligne dit le niveau, et « Ajouter » de la fiche
 *   reste son geste de montée — `raisable` évite d'en offrir un second.
 */

const LEVEL_TINT: Readonly<Record<(typeof CIRCLE_LEVELS)[number], string>> = {
  BLOOD: 'var(--color-error)',
  CLOSE: 'var(--color-warning)',
  FRIEND: 'var(--color-success)',
  ACQUAINTANCE: 'var(--ios-info)',
};

export const ProfileCircleRowView = memo(function ProfileCircleRowView({
  language,
  name,
  link,
  pendingLevel,
  raisable,
  now,
  onRaise,
}: {
  readonly language: InterfaceLanguage;
  readonly name: string;
  readonly link: RelationLink | null;
  readonly pendingLevel: RelationRequestLevel | null;
  /** La fiche offre-t-elle la montée ici ? `false` quand « Ajouter » en est déjà le geste. */
  readonly raisable: boolean;
  readonly now: Date;
  readonly onRaise: (target: RelationRequestLevel) => void;
}) {
  if (link === null) return null;
  const level = CIRCLE_LEVELS.find((candidate) => candidate === link.effectiveLevel);
  if (level === undefined) return null;
  const title = relationLevelLabel(language, level);
  const line = progressText(language, progressSummary(link, now));
  const offer = raiseOffer(link, now);
  return (
    <div
      data-profile-circle={level}
      className="flex items-center gap-3 rounded-card px-3.5 py-3"
      style={{ backgroundColor: `color-mix(in srgb, ${LEVEL_TINT[level]} 10%, transparent)` }}
    >
      <p className="grid min-w-0 flex-1 gap-0.5" aria-label={[title, line].filter((part): part is string => part !== null).join(', ')}>
        <span aria-hidden="true" className="text-body font-bold" style={{ color: INK }}>
          {relationLevelIcon(level)} {title}
        </span>
        {line === null ? null : (
          <span aria-hidden="true" data-profile-circle-progress className="text-caption" style={{ color: INK_2 }}>
            {line}
          </span>
        )}
      </p>
      {pendingLevel !== null ? (
        <span data-profile-circle-pending={pendingLevel} className="shrink-0 text-end text-caption font-semibold" style={{ color: INK_2 }}>
          {translateCircles(language, 'circles.pending', { level: relationLevelLabel(language, pendingLevel) })}
        </span>
      ) : raisable && offer.kind === 'available' ? (
        <button
          type="button"
          data-profile-circle-raise={offer.target}
          aria-label={translateCircles(language, 'circles.action.requestLabel', { level: relationLevelLabel(language, offer.target), name })}
          onClick={() => onRaise(offer.target)}
          className={`grid shrink-0 place-items-center rounded-chip px-3 text-caption font-semibold text-ios-on-brand ${FOCUS}`}
          style={{ minHeight: 44, backgroundColor: BRAND_FILL, outlineColor: BRAND }}
        >
          {translateCircles(language, 'circles.action.request', { level: relationLevelLabel(language, offer.target) })}
        </button>
      ) : null}
    </div>
  );
});

export function ProfileCircleRow({
  language,
  person,
  raisable,
  viewerId,
  now,
  onOutcome,
  deps = apiDeps,
}: {
  readonly language: InterfaceLanguage;
  readonly person: PersonSummary;
  readonly raisable: boolean;
  readonly viewerId: string | null;
  readonly now: Date;
  readonly onOutcome: (outcome: FriendActionOutcome) => void;
  readonly deps?: RelationDeps;
}) {
  const ready = useCirclesCatalog(language);
  const links = useQuery(relationLinksQueryOptions(deps), appQueryClient);
  const sent = useInfiniteQuery(friendRequestsQueryOptions(deps, 'sent'), appQueryClient);
  const link = useMemo(() => links.data?.find((candidate) => candidate.userId === person.id) ?? null, [links.data, person.id]);
  const pendingLevel = pendingRaiseOf(flattenFriendRequests(sent.data), person.id);
  const raise = (target: RelationRequestLevel): void => {
    void performSendRequest({
      person,
      targetLevel: target,
      deps: { ...deps, queryClient: appQueryClient, isOnline: () => navigator.onLine, viewerId: () => viewerId },
    }).then(onOutcome);
  };
  if (!ready) return null;
  return (
    <ProfileCircleRowView
      language={language}
      name={person.displayName ?? person.username}
      link={link}
      pendingLevel={pendingLevel}
      raisable={raisable}
      now={now}
      onRaise={raise}
    />
  );
}
