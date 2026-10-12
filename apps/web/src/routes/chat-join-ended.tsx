import { useId, useState } from 'react';

import type { GuestAccessEnd } from '@/lib/api/guest-access-end';
import { translateInvite } from '@/lib/i18n-invite-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { conversationLinkOfPath } from '@/lib/links/conversation-link';
import { internalPathOf } from '@/lib/links/internal-link';
import { publicWebOrigin } from '@/lib/links/public-origin';
import { INK, INK_2, INVITE_ACTION_BACKGROUND, INVITE_ACTION_FLOOR, INVITE_CARD_STYLE } from '@/routes/chat-join-parts';
import { Link } from '@/routes/route-table';

/**
 * **L'ACCÈS DE L'INVITÉ EST FINI, ET LA PAGE DE SON LIEN LE DIT** (#10442) —
 * `/chat/:link?ended=expired|revoked`, où l'appareil ramène l'invité dont la
 * passerelle a refusé la session (`lib/api/guest-access-end.ts`). Deux sorties :
 * coller un NOUVEAU lien d'invitation, ou revenir à l'accueil.
 */

const TITLE_KEY = {
  expired: 'invite.ended.expired.title',
  revoked: 'invite.ended.revoked.title',
} as const satisfies Readonly<Record<GuestAccessEnd, string>>;

const SHARE_LINK_KEY = /^[A-Za-z0-9_-]{3,}$/u;

/** L'adresse `/chat/<lien>` qu'un texte collé désigne : une adresse Meeshy de
 * partage (`/chat/…`, `/join/…`, sur un hôte Meeshy), un chemin, ou la clé
 * seule. Un hôte étranger n'est jamais suivi. */
export function invitationPathOf(raw: string, origins: readonly string[]): string | null {
  const value = raw.trim();
  if (value === '') return null;
  const isShare = (path: string): boolean => conversationLinkOfPath(path)?.kind === 'share-link';
  const path = value.startsWith('/') ? value : internalPathOf(value, { origins, isAppPath: isShare });
  const target = path === null ? null : conversationLinkOfPath(path);
  if (target !== null && target.kind === 'share-link') return `/chat/${encodeURIComponent(target.identifier)}`;
  return SHARE_LINK_KEY.test(value) ? `/chat/${value}` : null;
}

const pageOrigins = (): readonly string[] => (typeof window === 'undefined' ? [] : [publicWebOrigin(window.location.origin), window.location.origin]);

export function GuestAccessEndedNotice({
  language,
  ended,
  onOpen,
}: {
  readonly language: InterfaceLanguage;
  readonly ended: GuestAccessEnd;
  readonly onOpen: (path: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  const submit = (): void => {
    const path = invitationPathOf(draft, pageOrigins());
    if (path === null) {
      setInvalid(true);
      return;
    }
    onOpen(path);
  };

  return (
    <section role="alert" data-guest-access-ended={ended} className="grid w-full gap-4 rounded-hero p-5" style={INVITE_CARD_STYLE}>
      <h1 className="text-center text-title font-bold" style={{ color: INK }}>
        {translateInvite(language, TITLE_KEY[ended])}
      </h1>
      <form
        className="grid gap-2"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor={id} className="text-center text-body" style={{ color: INK_2 }}>
          {translateInvite(language, 'invite.ended.body')}
        </label>
        <input
          id={id}
          name="invitation"
          data-guest-ended-link
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-invalid` : undefined}
          value={draft}
          placeholder="https://meeshy.me/chat/…"
          onInput={(event) => {
            setDraft(event.currentTarget.value);
            setInvalid(false);
          }}
          className="w-full rounded-field bg-transparent px-3 text-body focus-visible:outline-2"
          style={{ minHeight: 44, color: INK, outlineColor: 'var(--color-ios-brand)', border: '1.5px solid color-mix(in srgb, var(--ios-indigo-400) 45%, transparent)' }}
        />
        {invalid ? (
          <p id={`${id}-invalid`} className="text-caption" style={{ color: 'var(--color-danger)' }}>
            {translateInvite(language, 'invite.refusal.not-found')}
          </p>
        ) : null}
        <button
          type="submit"
          data-guest-ended-join
          className="grid w-full place-items-center rounded-bubble px-6 text-body font-extrabold text-ios-on-brand focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ minHeight: 54, backgroundColor: INVITE_ACTION_FLOOR, backgroundImage: INVITE_ACTION_BACKGROUND, outlineColor: 'var(--color-ios-brand)' }}
        >
          {translateInvite(language, 'invite.ended.join')}
        </button>
      </form>
      <Link to="list" data-guest-ended-home className="grid w-full place-items-center rounded-field px-6 font-semibold" style={{ minHeight: 44, color: INK_2 }}>
        {translateInvite(language, 'invite.home')}
      </Link>
    </section>
  );
}
