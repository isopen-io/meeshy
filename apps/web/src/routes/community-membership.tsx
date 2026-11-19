import { useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { GlyphSvg } from '@/components/glyph';
import { COMMUNITIES_GLYPHS } from '@/components/glyphs-communities';
import { ROW_MENU_GLYPHS } from '@/components/glyphs-row-menu';
import type { MembershipAction } from '@/lib/communities/view';
import { translate } from '@/lib/i18n-catalog';
import { translateMembership, type CommunityMembershipCatalogKey } from '@/lib/i18n-community-membership-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **REJOINDRE OU QUITTER, SOUS LES COMPTEURS** (#6378) — miroir
 * `CommunityDetailView.actionsSection` : « Rejoindre » est un bouton de
 * marque ; « Quitter la communauté » une bande au texte rouge sur un voile
 * rouge (la forme iOS, et la seule qui tienne AA dans les deux schémas — même
 * raison que `ConfirmDialog`), confirmée avant de partir.
 *
 * La pièce est PURE (l'état de la confirmation mis à part) : `pending` grise le
 * geste le temps de la réponse, `failure` dit un refus sous le bouton, dans
 * la langue. Hors ligne, le geste reste visible mais inerte, et dit pourquoi.
 *
 * Une communauté qui valide chaque entrée (#19868) offre « Demander à
 * rejoindre » (`request`, même bouton de marque), puis « Demande envoyée »
 * (`requested`) : un ÉTAT, pas un contrôle (loi 4 — rien à presser), annoncé comme statut, qui dit qui doit
 * l'accepter — jamais un second envoi, jamais un faux « Quitter ».
 */

export type MembershipFailure = 'join' | 'refused' | 'cooldown' | 'leave' | 'offline';

const FAILURE_KEY = {
  join: 'community.membership.error',
  refused: 'community.membership.error.refused',
  cooldown: 'community.membership.error.cooldown',
  leave: 'community.membership.error',
  offline: 'community.membership.offline',
} as const satisfies Readonly<Record<MembershipFailure, CommunityMembershipCatalogKey>>;

const ERROR_INK = 'var(--color-error)';

const JOIN_STYLE = {
  backgroundColor: 'var(--ios-indigo-600)',
  color: 'var(--color-ios-on-brand)',
  minHeight: 48,
} as const;

const REQUESTED_STYLE = {
  color: 'var(--color-ios-ink-2)',
  backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 14%, transparent)',
  minHeight: 48,
} as const;

const LEAVE_STYLE = {
  color: ERROR_INK,
  backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
  minHeight: 44,
} as const;

export function CommunityMembershipAction({
  language,
  action,
  pending,
  online,
  failure,
  onJoin,
  onLeave,
}: {
  readonly language: InterfaceLanguage;
  readonly action: MembershipAction;
  readonly pending: boolean;
  readonly online: boolean;
  readonly failure: MembershipFailure | null;
  readonly onJoin: () => void;
  readonly onLeave: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (action === 'none') return null;
  const inert = pending || !online;
  const shownFailure = online ? failure : 'offline';

  return (
    <div className="grid gap-2" data-community-membership={action}>
      {action === 'join' || action === 'request' ? (
        <button
          type="button"
          data-community-join
          disabled={inert}
          aria-disabled={inert}
          aria-busy={pending}
          onClick={onJoin}
          className="flex w-full items-center justify-center gap-2 rounded-card text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ ...JOIN_STYLE, opacity: inert ? 0.55 : 1 }}
        >
          <GlyphSvg glyph={COMMUNITIES_GLYPHS.plusCircle} size={18} />
          {translateMembership(language, action === 'join' ? 'community.membership.join' : 'community.membership.request')}
        </button>
      ) : action === 'requested' ? (
        <div role="status" className="grid gap-1" data-community-join-requested>
          <p className="flex w-full items-center justify-center gap-2 rounded-card text-body font-semibold" style={REQUESTED_STYLE}>
            <GlyphSvg glyph={COMMUNITIES_GLYPHS.clock} size={18} />
            {translateMembership(language, 'community.membership.requested')}
          </p>
          <p className="text-center text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
            {translateMembership(language, 'community.membership.requested.hint')}
          </p>
        </div>
      ) : (
        <button
          type="button"
          data-community-leave
          disabled={inert}
          aria-disabled={inert}
          aria-busy={pending}
          onClick={() => setConfirming(true)}
          className="flex w-full items-center justify-center gap-2 rounded-chip text-body font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ ...LEAVE_STYLE, opacity: inert ? 0.55 : 1 }}
        >
          <GlyphSvg glyph={ROW_MENU_GLYPHS.signOut} size={18} className="rtl:-scale-x-100" />
          {translateMembership(language, 'community.membership.leave')}
        </button>
      )}
      {shownFailure === null ? null : (
        <p role={shownFailure === 'offline' ? 'status' : 'alert'} data-community-membership-failure={shownFailure} className="text-center text-caption" style={{ color: shownFailure === 'offline' ? undefined : ERROR_INK }}>
          {translateMembership(language, FAILURE_KEY[shownFailure])}
        </p>
      )}
      {confirming ? (
        <ConfirmDialog
          name="community-leave"
          title={translateMembership(language, 'community.membership.leave.confirm.title')}
          body={translateMembership(language, 'community.membership.leave.confirm.body')}
          cancelLabel={translate(language, 'common.cancel')}
          confirmLabel={translateMembership(language, 'community.membership.leave.confirm.action')}
          tone="destructive"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onLeave();
          }}
        />
      ) : null}
    </div>
  );
}
