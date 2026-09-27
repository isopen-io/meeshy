import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { Link } from '@/routes/route-table';

import { GlyphSvg } from './glyph';
import { AUTH_GLYPHS } from './glyphs-auth';

/**
 * L'ADRESSE EST DÉJÀ UTILISÉE — CE QU'ON PEUT FAIRE, EN UN GESTE (#8216).
 *
 * L'inscription n'offrait qu'un lien « Se connecter » qui ouvrait la connexion
 * avec l'adresse VIDE : retaper, puis demander le lien — quatre gestes, et une
 * occasion de se tromper d'adresse et de créer un second compte. Le premier
 * contrôle envoie le code et le lien à l'adresse SAISIE (l'hôte monte
 * `MagicLinkPanel` en `sendOnMount`, jamais une seconde machine) ; le second
 * mène au mot de passe oublié, l'adresse préremplie. Miroir iOS :
 * `SignupView.emailTakenActions`.
 */
export function EmailTakenActions({
  email,
  language,
  linkClassName,
  onSendLink,
}: {
  readonly email: string;
  readonly language: InterfaceLanguage;
  /** L'encre des actions en texte de l'hôte — un pas de rampe par schéma. */
  readonly linkClassName: string;
  readonly onSendLink: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5" data-signup-email-taken>
      <button
        type="button"
        onClick={onSendLink}
        className={`inline-flex items-center gap-1.5 text-caption font-semibold ${linkClassName}`}
        style={{ minHeight: 44 }}
      >
        <GlyphSvg glyph={AUTH_GLYPHS.magicWand} size={16} />
        {translate(language, 'signup.emailTaken.sendLink')}
      </button>
      <Link
        to="forgotPassword"
        search={{ email }}
        className="inline-flex items-center text-caption font-medium"
        style={{ minHeight: 44, color: 'var(--color-ios-ink-2)' }}
      >
        {translate(language, 'signup.emailTaken.forgotPassword')}
      </Link>
    </div>
  );
}
