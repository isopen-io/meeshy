import type { PublicContactAccount } from '@meeshy/shared/types/contact-card';
import { authorAccentColor } from '@meeshy/shared/utils/conversation-colors';

import { attachmentSrc } from '@/lib/api/media-url';
import { contactInitials, contactRelationView, type ContactAction } from '@/lib/contact-card/view';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { Avatar } from './avatar';

/**
 * **LE COMPTE MEESHY D'UNE CARTE DE VISITE** (#8101) — une seule écriture,
 * montée par la bulle (`compact` : avatar, nom, gestes) et par la fiche
 * (`full` : bannière, @pseudo, bio en plus). Les gestes viennent de
 * `contactRelationView` : ami ⇒ « Écrire » seul, soi ⇒ rien, demande en
 * attente ⇒ un ÉTAT dit en texte, jamais un bouton qui ne ferait rien.
 */
export function ContactAccountRow({
  account,
  language,
  variant,
  busy,
  onAction,
}: {
  readonly account: PublicContactAccount;
  readonly language: InterfaceLanguage;
  readonly variant: 'compact' | 'full';
  /** `action:userId` du geste en vol — ses boutons se désactivent, jamais ceux d'un autre compte. */
  readonly busy: string | null;
  readonly onAction: (action: ContactAction, account: PublicContactAccount) => void;
}) {
  const view = contactRelationView(account.relation);
  const accent = authorAccentColor(account.userId, account.displayName);
  const full = variant === 'full';

  return (
    <div className="flex flex-col gap-2" data-contact-account={account.userId}>
      {full && account.bannerUrl !== null ? (
        <img
          src={attachmentSrc(account.bannerUrl)}
          alt={translate(language, 'contactCard.banner', { name: account.displayName })}
          className="w-full rounded-card object-cover"
          style={{ height: 96 }}
          loading="lazy"
        />
      ) : null}
      <div className="flex items-center gap-3">
        <Avatar
          initials={contactInitials(account.displayName)}
          color={accent}
          size={full ? 48 : 32}
          name={translate(language, 'contactCard.avatar', { name: account.displayName })}
          {...(account.avatarUrl !== null ? { src: account.avatarUrl } : {})}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
            {account.displayName}
          </p>
          <p className="truncate text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
            @{account.username}
          </p>
        </div>
      </div>
      {full && account.bio !== null ? (
        <p className="text-secondary" style={{ color: 'var(--color-ios-ink)', whiteSpace: 'pre-line' }}>
          {account.bio}
        </p>
      ) : null}
      {view.state !== null ? (
        <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }} data-contact-state="">
          {translate(language, view.state)}
        </p>
      ) : null}
      {view.actions.length > 0 ? (
        <div className="flex gap-2">
          {view.actions.map((action) => {
            const primary = action === 'connect';
            return (
              <button
                key={action}
                type="button"
                data-contact-action={action}
                disabled={busy !== null && busy.endsWith(`:${account.userId}`)}
                onClick={(event) => {
                  event.stopPropagation();
                  onAction(action, account);
                }}
                className="flex-1 rounded-chip px-4 text-body font-semibold"
                style={{
                  minHeight: 44,
                  backgroundColor: primary ? 'var(--color-ios-brand)' : 'transparent',
                  color: primary ? 'white' : 'var(--color-ios-brand)',
                  border: primary ? '1px solid transparent' : '1px solid var(--color-ios-brand)',
                }}
              >
                {translate(language, action === 'connect' ? 'contactCard.connect' : 'contactCard.write')}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
