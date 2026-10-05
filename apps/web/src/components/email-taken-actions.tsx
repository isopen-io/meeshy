import type { EmailOwner } from '@/lib/api/email-owner';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { Link } from '@/routes/route-table';

import { Avatar } from './avatar';
import { GlyphSvg } from './glyph';
import { AUTH_GLYPHS } from './glyphs-auth';

/**
 * L'ADRESSE EST DÉJÀ UTILISÉE — CE QU'ON PEUT FAIRE, EN UN GESTE (#8216).
 *
 * L'inscription n'offrait qu'un lien « Se connecter » qui ouvrait la connexion
 * avec l'adresse VIDE : retaper, puis demander le lien — quatre gestes, et une
 * occasion de se tromper d'adresse et de créer un second compte.
 *
 * Quand la passerelle sert le détenteur MASQUÉ (`emailOwner`, #8214), l'écran
 * demande « Est-ce vous ? » : « C'est moi » récupère le compte par le lien
 * (l'hôte monte `MagicLinkPanel` en `sendOnMount`, jamais une seconde machine),
 * « Ce n'est pas moi » renvoie la même inscription en revendiquant l'adresse —
 * le code envoyé décidera. Sans lui (ancienne passerelle), la récupération
 * seule. « Mot de passe oublié ? » reste à côté, l'adresse préremplie.
 * Miroir iOS : `SignupView.emailTakenActions`.
 */
export function EmailTakenActions({
  email,
  owner,
  language,
  linkClassName,
  isClaiming,
  onSendLink,
  onClaim,
}: {
  readonly email: string;
  readonly owner: EmailOwner | null;
  readonly language: InterfaceLanguage;
  /** L'encre des actions en texte de l'hôte — un pas de rampe par schéma. */
  readonly linkClassName: string;
  readonly isClaiming: boolean;
  readonly onSendLink: () => void;
  readonly onClaim: () => void;
}) {
  const forgotPassword = (
    <Link
      to="forgotPassword"
      search={{ email }}
      className="inline-flex items-center text-caption font-medium"
      style={{ minHeight: 44, color: 'var(--color-ios-ink-2)' }}
    >
      {translate(language, 'signup.emailTaken.forgotPassword')}
    </Link>
  );
  const sendLink = (label: string) => (
    <button
      type="button"
      onClick={onSendLink}
      className={`inline-flex items-center gap-1.5 text-caption font-semibold ${linkClassName}`}
      style={{ minHeight: 44 }}
    >
      <GlyphSvg glyph={AUTH_GLYPHS.magicWand} size={16} />
      {label}
    </button>
  );

  if (owner === null) {
    return (
      <div className="flex flex-wrap items-center gap-x-5" data-signup-email-taken>
        {sendLink(translate(language, 'signup.emailTaken.sendLink'))}
        {forgotPassword}
      </div>
    );
  }

  return (
    <div
      className="grid gap-2 rounded-field p-3"
      style={{ backgroundColor: 'var(--color-ios-card)' }}
      data-signup-email-taken
      data-signup-email-owner
    >
      <p className="text-caption font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(language, 'signup.emailTaken.isItYou')}
      </p>
      <div className="flex items-center gap-3">
        <Avatar
          initials={owner.maskedDisplayName.slice(0, 1).toUpperCase()}
          color="var(--color-ios-brand)"
          size={40}
          {...(owner.avatar !== null ? { src: owner.avatar } : {})}
        />
        <div className="grid min-w-0">
          <span className="truncate text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
            {owner.maskedDisplayName}
          </span>
          <span className="truncate text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
            @{owner.maskedUsername}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5">
        {sendLink(translate(language, 'signup.emailTaken.itsMe'))}
        {forgotPassword}
      </div>
      <button
        type="button"
        onClick={onClaim}
        disabled={isClaiming}
        aria-busy={isClaiming}
        aria-describedby="signup-email-claim-note"
        className="inline-flex items-center justify-self-start text-caption font-semibold"
        style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}
      >
        {translate(language, 'signup.emailTaken.notMe')}
      </button>
      <p id="signup-email-claim-note" className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, 'signup.emailTaken.notMeNote')}
      </p>
    </div>
  );
}
