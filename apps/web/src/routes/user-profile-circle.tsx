import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { RelationLevel, RelationRequestLevel } from '@meeshy/shared/types/relation';
import { memo, useMemo, useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { apiDeps } from '@/lib/api/deps';
import { performSendRequest, type FriendActionOutcome } from '@/lib/api/friend-actions';
import { flattenFriendRequests, friendRequestsQueryOptions, type PersonSummary } from '@/lib/api/friend-requests';
import { appQueryClient } from '@/lib/api/query-client';
import { relationLinksQueryOptions, relationRaiseGateQueryOptions, type RelationDeps, type RelationLink } from '@/lib/api/relations';
import { translate } from '@/lib/i18n-catalog';
import { translateCircles, type CirclesCatalogKey } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { CIRCLE_LEVELS, demotionOf, pendingRaiseOf, progressSummary, raiseOffer, type Demotion } from '@/lib/relations/circles';
import { performLowerRelation } from '@/lib/relations/lower-relation';
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
 * - **Gérer le lien** (#14910) : « Promouvoir en X » SEULEMENT quand c'est
 *   possible (masqué, jamais grisé), puis, en dessous et en rouge, « Rétrograder
 *   en X » d'un cran, ou « Annuler le lien » à Connaissance — chacun derrière une
 *   confirmation qui dit le départ, l'arrivée, le silence et les 30 jours.
 *   Optimiste : le niveau change au geste, se défait sur un refus.
 */

const LEVEL_TINT: Readonly<Record<(typeof CIRCLE_LEVELS)[number], string>> = {
  BLOOD: 'var(--color-error)',
  CLOSE: 'var(--color-warning)',
  FRIEND: 'var(--color-success)',
  ACQUAINTANCE: 'var(--ios-info)',
};

const DANGER = 'var(--color-error)';

export const ProfileCircleRowView = memo(function ProfileCircleRowView({
  language,
  name,
  link,
  pendingLevel,
  raisable,
  now,
  onRaise,
  onLower,
}: {
  readonly language: InterfaceLanguage;
  readonly name: string;
  readonly link: RelationLink | null;
  readonly pendingLevel: RelationRequestLevel | null;
  /** La fiche offre-t-elle la montée ici ? `false` quand « Ajouter » en est déjà le geste. */
  readonly raisable: boolean;
  readonly now: Date;
  readonly onRaise: (target: RelationRequestLevel) => void;
  readonly onLower: (demotion: Demotion) => void;
}) {
  if (link === null) return null;
  const level = CIRCLE_LEVELS.find((candidate) => candidate === link.effectiveLevel);
  if (level === undefined) return null;
  const title = relationLevelLabel(language, level);
  const line = progressText(language, progressSummary(link, now));
  const offer = raiseOffer(link, now);
  const promote = offer.kind === 'available' ? PROMOTE[offer.target] : undefined;
  const demotion = demotionOf(link);
  return (
    <div className="grid gap-2">
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
        ) : raisable && offer.kind === 'available' && promote !== undefined ? (
          <button
            type="button"
            data-profile-circle-raise={offer.target}
            aria-label={translateCircles(language, promote.detail, { name })}
            onClick={() => onRaise(offer.target)}
            className={`grid shrink-0 place-items-center rounded-chip px-3 text-caption font-semibold text-ios-on-brand ${FOCUS}`}
            style={{ minHeight: 44, backgroundColor: BRAND_FILL, outlineColor: BRAND }}
          >
            {translateCircles(language, promote.label)}
          </button>
        ) : null}
      </div>
      {demotion === null ? null : (
        <button
          type="button"
          data-profile-circle-lower={demotion.kind}
          onClick={() => onLower(demotion)}
          className={`grid w-full place-items-center rounded-card px-4 text-body font-semibold ${FOCUS}`}
          style={{
            minHeight: 48,
            color: DANGER,
            border: `1.5px solid color-mix(in srgb, ${DANGER} 45%, transparent)`,
            outlineColor: DANGER,
          }}
        >
          {lowerLabel(language, demotion)}
        </button>
      )}
    </div>
  );
});

type WordingLabel = `circles.promote.${'friend' | 'close' | 'blood'}` | `circles.demote.${'close' | 'friend' | 'acquaintance'}`;
type WordingDetail = `circles.promote.${'friend' | 'close' | 'blood'}.a11y` | `circles.demote.${'close' | 'friend' | 'acquaintance'}.confirm.title`;
type Wording = { readonly label: WordingLabel & CirclesCatalogKey; readonly detail: WordingDetail & CirclesCatalogKey };

const PROMOTE: Readonly<Partial<Record<RelationLevel, Wording>>> = {
  FRIEND: { label: 'circles.promote.friend', detail: 'circles.promote.friend.a11y' },
  CLOSE: { label: 'circles.promote.close', detail: 'circles.promote.close.a11y' },
  BLOOD: { label: 'circles.promote.blood', detail: 'circles.promote.blood.a11y' },
};

const DEMOTE: Readonly<Partial<Record<RelationLevel, Wording>>> = {
  CLOSE: { label: 'circles.demote.close', detail: 'circles.demote.close.confirm.title' },
  FRIEND: { label: 'circles.demote.friend', detail: 'circles.demote.friend.confirm.title' },
  ACQUAINTANCE: { label: 'circles.demote.acquaintance', detail: 'circles.demote.acquaintance.confirm.title' },
};

function lowerLabel(language: InterfaceLanguage, demotion: Demotion): string {
  const wording = demotion.kind === 'demote' ? DEMOTE[demotion.to] : undefined;
  return translateCircles(language, wording === undefined ? 'circles.action.unlink' : wording.label);
}

function LowerConfirm({
  language,
  name,
  demotion,
  onConfirm,
  onCancel,
}: {
  readonly language: InterfaceLanguage;
  readonly name: string;
  readonly demotion: Demotion;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const from = relationLevelLabel(language, demotion.from);
  const unlink = demotion.kind === 'unlink';
  const to = relationLevelLabel(language, demotion.to);
  const wording = demotion.kind === 'demote' ? DEMOTE[demotion.to] : undefined;
  return (
    <ConfirmDialog
      name={unlink ? 'circle-unlink' : 'circle-demote'}
      title={wording === undefined ? translateCircles(language, 'circles.unlink.confirm.title', { name }) : translateCircles(language, wording.detail, { name })}
      body={unlink ? translateCircles(language, 'circles.unlink.confirm.body', { name }) : translateCircles(language, 'circles.demote.confirm.body', { name, from, to })}
      cancelLabel={translate(language, 'common.cancel')}
      confirmLabel={lowerLabel(language, demotion)}
      tone="destructive"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

export function ProfileCircleRow({
  language,
  person,
  raisable,
  viewerId,
  now,
  onOutcome,
  onNotice,
  deps = apiDeps,
}: {
  readonly language: InterfaceLanguage;
  readonly person: PersonSummary;
  readonly raisable: boolean;
  readonly viewerId: string | null;
  readonly now: Date;
  readonly onOutcome: (outcome: FriendActionOutcome) => void;
  /** Ce qu'un échec de rétrogradation dit, après avoir rendu le niveau d'avant (#14910). */
  readonly onNotice: (message: string) => void;
  readonly deps?: RelationDeps;
}) {
  const ready = useCirclesCatalog(language);
  const links = useQuery(relationLinksQueryOptions(deps), appQueryClient);
  const gate = useQuery(relationRaiseGateQueryOptions(deps, person.id), appQueryClient);
  const sent = useInfiniteQuery(friendRequestsQueryOptions(deps, 'sent'), appQueryClient);
  const [confirming, setConfirming] = useState<Demotion | null>(null);
  const served = useMemo(() => links.data?.find((candidate) => candidate.userId === person.id) ?? null, [links.data, person.id]);
  const canRaise = gate.data?.canRaise ?? null;
  const blockedUntil = gate.data?.raiseBlockedUntil ?? null;
  const link = useMemo(
    () =>
      served === null
        ? null
        : {
            ...served,
            ...(canRaise === null ? {} : { canRaise }),
            ...(blockedUntil === null ? {} : { raiseBlockedUntil: blockedUntil }),
          },
    [served, canRaise, blockedUntil],
  );
  const pendingLevel = pendingRaiseOf(flattenFriendRequests(sent.data), person.id);
  const raise = (target: RelationRequestLevel): void => {
    void performSendRequest({
      person,
      targetLevel: target,
      deps: { ...deps, queryClient: appQueryClient, isOnline: () => navigator.onLine, viewerId: () => viewerId },
    }).then(onOutcome);
  };
  const lower = (demotion: Demotion): void => {
    setConfirming(null);
    void performLowerRelation({ userId: person.id, level: demotion.to, deps: { ...deps, queryClient: appQueryClient } }).then((outcome) => {
      if (outcome === 'failed') onNotice(translateCircles(language, 'circles.notice.lowerFailed'));
    });
  };
  if (!ready) return null;
  return (
    <>
      <ProfileCircleRowView
        language={language}
        name={person.displayName ?? person.username}
        link={link}
        pendingLevel={pendingLevel}
        raisable={raisable}
        now={now}
        onRaise={raise}
        onLower={setConfirming}
      />
      {confirming === null ? null : (
        <LowerConfirm
          language={language}
          name={person.displayName ?? person.username}
          demotion={confirming}
          onConfirm={() => lower(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  );
}
