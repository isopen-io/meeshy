import type { PublicContactAccount } from '@meeshy/shared/types/contact-card';
import { authorAccentColor, colorForName } from '@meeshy/shared/utils/conversation-colors';

import { attachmentSrc } from '@/lib/api/media-url';
import { contactRelationView, type ContactAction } from '@/lib/contact-card/view';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';

import { Avatar } from './avatar';
import { PeerAvatar } from './peer-avatar';
import { ContactGameStripSlot } from './game-profile-slots';

/**
 * **LE VISAGE D'UNE CARTE DE VISITE** (#12571) — UN seul : la photo du compte
 * Meeshy principal quand il y en a un (sinon ses initiales), et, sans compte
 * associé, les initiales du nom du carnet. iOS (`ContactCardView`) ne montre
 * qu'un visage ; ici la bulle peignait un disque d'initiales PUIS la photo du
 * même compte juste dessous. La rangée du compte principal ne remonte donc plus
 * le sien (`showAvatar`).
 */
export function ContactFace({
  card,
  account,
  size,
  language,
}: {
  readonly card: { readonly formattedName: string };
  readonly account: PublicContactAccount | undefined;
  readonly size: number;
  readonly language: InterfaceLanguage;
}) {
  if (account === undefined) {
    return <Avatar initials={initialsOf(card.formattedName)} color={colorForName(card.formattedName)} size={size} />;
  }
  return (
    <PeerAvatar
      presenceKey={account.relation === 'self' ? undefined : account.userId}
      initials={initialsOf(account.displayName)}
      color={authorAccentColor(account.userId, account.displayName)}
      size={size}
      name={translate(language, 'contactCard.avatar', { name: account.displayName })}
      {...(account.avatarUrl !== null ? { src: account.avatarUrl } : {})}
    />
  );
}

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
  showAvatar = true,
}: {
  readonly showAvatar?: boolean;
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
        {showAvatar ? <ContactFace card={{ formattedName: account.displayName }} account={account} size={full ? 48 : 32} language={language} /> : null}
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
      {/* LE JEU DE CE COMPTE (#9481) — la vitrine, SI sa visibilité l'autorise : fermée, rien ne se dessine. Fiche complète seulement, jamais sur soi. */}
      {full && account.relation !== 'self' ? <ContactGameStripSlot userId={account.userId} enabled /> : null}
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
                  color: primary ? 'var(--color-ios-on-brand)' : 'var(--color-ios-brand)',
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
