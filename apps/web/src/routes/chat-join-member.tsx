import { useEffect, useState } from 'react';

import type { ConversationCard } from '@meeshy/shared/types/conversation-card';

import { ConfirmDialog } from '@/components/confirm-dialog';
import type { ApiResult } from '@/lib/api/http';
import { translateInvite } from '@/lib/i18n-invite-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { INVITE_ACTION_BACKGROUND, INVITE_ACTION_FLOOR, INVITE_OUTLINE_BUTTON, INVITE_OUTLINE_STYLE, isolated } from '@/routes/chat-join-parts';
import { Link } from '@/routes/route-table';

/**
 * UN MEMBRE QUI ROUVRE L'ADRESSE D'INVITATION (#10282).
 *
 * L'invitation se lit par `GET /anonymous/link/:id`, aveugle au compte : elle
 * ne dit pas si le lecteur fait déjà partie de la conversation. La CARTE du
 * lien (`GET /links/:id/card`, celle des bulles — #8099) le dit, et elle ne sert
 * rien de plus que ce que le lien autorise déjà. Un membre y lit donc les deux
 * gestes de la carte de bulle et d'iOS (`ShareLinkEntryResolver`) : OUVRIR la
 * conversation, ou la QUITTER — jamais « Rejoindre » ce qu'il a rejoint.
 *
 * Seul un compte connecté hors `?mode=anonymous` la lit : un visiteur n'a pas
 * d'adhésion à dire, et un compte qui a choisi l'anonyme a choisi la porte
 * d'invité.
 *
 * **CACHE D'ABORD** : une carte déjà vue dans une bulle peint ses gestes sans
 * attendre. Sans elle, l'action ATTEND la lecture — ni « Rejoindre » puis
 * « Ouvrir », ni l'inverse. Une lecture qui échoue retombe sur Rejoindre : la
 * jonction d'un membre existant le mène de toute façon à son fil.
 */

export type Membership =
  | { readonly kind: 'checking' }
  | { readonly kind: 'member'; readonly conversationId: string }
  | { readonly kind: 'guest' };

export type MembershipDeps = {
  /** La carte du lien déjà en cache (`conversation-cards`) — `undefined` : jamais lue. */
  readonly cachedCard: (link: string) => ConversationCard | null | undefined;
  readonly loadCard: (link: string, signal: AbortSignal) => Promise<ApiResult<ConversationCard | null>>;
  /** Quitter — la route existante `POST /conversations/:id/leave`. */
  readonly leave: (conversationId: string) => Promise<ApiResult<unknown>>;
  /** Ce qui suit un départ réussi : la carte et la liste ne comptent plus la conversation. */
  readonly left: (link: string, conversationId: string) => void;
};

const CHECKING: Membership = { kind: 'checking' };
const GUEST: Membership = { kind: 'guest' };

/** `null` : la carte n'a jamais été lue — rien à en dire. */
export function membershipOfCard(card: ConversationCard | null | undefined): Membership | null {
  if (card === undefined) return null;
  return card !== null && card.viewer.isMember && card.conversationId !== null ? { kind: 'member', conversationId: card.conversationId } : GUEST;
}

export function useLinkMembership({ link, deps, active, online }: { readonly link: string; readonly deps: MembershipDeps; readonly active: boolean; readonly online: boolean }) {
  const [membership, setMembership] = useState<Membership>(() => (active ? (membershipOfCard(deps.cachedCard(link)) ?? CHECKING) : GUEST));
  const [leaving, setLeaving] = useState(false);
  const [leaveFailed, setLeaveFailed] = useState(false);

  useEffect(() => {
    if (!active) {
      setMembership(GUEST);
      return undefined;
    }
    /* Hors ligne, rien ne se lit : une adhésion inconnue retombe sur Rejoindre,
       qui attend lui-même le réseau. */
    if (!online) {
      setMembership((current) => (current.kind === 'checking' ? GUEST : current));
      return undefined;
    }
    const controller = new AbortController();
    void deps.loadCard(link, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setMembership((current) => (result.ok ? (membershipOfCard(result.data) ?? GUEST) : current.kind === 'checking' ? GUEST : current));
    });
    return () => controller.abort();
  }, [active, deps, link, online]);

  /* OPTIMISTE : Rejoindre revient dès le geste, inerte le temps du départ ; un
     refus rend Ouvrir et Quitter, et le dit. */
  async function leave() {
    if (membership.kind !== 'member' || leaving) return;
    const { conversationId } = membership;
    setLeaveFailed(false);
    setLeaving(true);
    setMembership(GUEST);
    const result = await deps.leave(conversationId);
    setLeaving(false);
    if (!result.ok) {
      setMembership({ kind: 'member', conversationId });
      setLeaveFailed(true);
      return;
    }
    deps.left(link, conversationId);
  }

  return { membership, leaving, leaveFailed, leave } as const;
}

/** L'action qui attend la carte — la place du bouton, sans libellé qui changerait. */
export function MembershipPending() {
  return (
    <div
      data-invite-member-pending
      aria-busy="true"
      className="w-full rounded-bubble"
      style={{ minHeight: 54, backgroundColor: INVITE_ACTION_FLOOR, backgroundImage: INVITE_ACTION_BACKGROUND, opacity: 0.35 }}
    />
  );
}

export function MemberActions({
  language,
  title,
  conversationId,
  failed,
  onLeave,
}: {
  readonly language: InterfaceLanguage;
  readonly title: string;
  readonly conversationId: string;
  readonly failed: boolean;
  readonly onLeave: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="grid w-full gap-2">
      <Link
        to="thread"
        params={{ conversation: conversationId }}
        data-invite-member-open
        className="grid w-full place-items-center rounded-bubble text-body font-extrabold text-ios-on-brand focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ minHeight: 54, backgroundColor: INVITE_ACTION_FLOOR, backgroundImage: INVITE_ACTION_BACKGROUND, outlineColor: 'var(--color-ios-brand)' }}
      >
        {translateInvite(language, 'invite.member.open')}
      </Link>
      <button type="button" data-invite-member-leave onClick={() => setConfirming(true)} className={INVITE_OUTLINE_BUTTON} style={{ ...INVITE_OUTLINE_STYLE, color: 'var(--color-error)' }}>
        {translateInvite(language, 'invite.member.leave')}
      </button>
      {failed ? (
        <p data-invite-member-error role="alert" className="text-center text-caption" style={{ color: 'var(--color-error)' }}>
          {translateInvite(language, 'invite.member.leave.error')}
        </p>
      ) : null}
      {confirming ? (
        <ConfirmDialog
          name="invite-member-leave"
          title={translateInvite(language, 'invite.member.leave.confirm.title', { name: isolated(title) })}
          body={translateInvite(language, 'invite.member.leave.confirm.body')}
          cancelLabel={translateInvite(language, 'invite.member.cancel')}
          confirmLabel={translateInvite(language, 'invite.member.leave')}
          tone="destructive"
          onConfirm={() => {
            setConfirming(false);
            onLeave();
          }}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}
