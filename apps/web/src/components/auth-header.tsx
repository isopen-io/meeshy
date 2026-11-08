import type { ComponentProps } from 'react';

import { translate } from '@/lib/i18n-catalog';
import { Link } from '@/routes/route-table';

import { BrandMark } from './brand-mark';
import { Glyph } from './glyph';
import { InterfaceLanguageSelect, useInterfaceLanguage } from './public-header';

type RouteTarget = ComponentProps<typeof Link>['to'];

/**
 * L'EN-TÊTE DES PAGES D'ACCÈS (#16452) — UN composant pour la connexion,
 * l'inscription, le lien par e-mail, le mot de passe oublié, le nouveau mot de
 * passe, la vérification d'e-mail et l'accueil. Aucune de ces pages ne porte
 * plus son propre en-tête (ni la croix de l'inscription, ni la barre titrée
 * des autres) : la même rangée, dans le même ordre, partout.
 *
 * 1. LE RETOUR `<` — il remplace la croix (D-72). Il REFERME (`replace`) vers
 *    l'écran que la page désigne, jamais `history.back()` : sur un lien
 *    profond ou un démarrage à froid, l'historique ne porte aucune page de
 *    l'application et le geste sortirait de Meeshy (revue de #5555, défaut 3).
 *    Le chevron se retourne en arabe (`rtl:-scale-x-100`) : il pointe vers
 *    le DÉBUT de la ligne, là d'où l'on vient.
 * 2. LA MARQUE — les trois traits SUIVIS du nom « Meeshy », un seul lien vers
 *    `/`. Le nom accessible (« Accueil de Meeshy ») contient le texte lu.
 * 3. LE SÉLECTEUR DE LANGUE — celui du site ; la coque installée le tait
 *    (porteur, 2026-10-14 : elle suit la langue de l'appareil).
 *
 * Le titre, quand l'écran en a un, ouvre le CONTENU sous la rangée.
 */
export function AuthHeader({
  back,
  backSearch,
  title,
  languageChoice = !__SHELL__,
}: {
  readonly back: RouteTarget;
  /** Ce que le retour TRANSMET à l'écran qu'il rouvre — l'invitation,
   * l'adresse déjà tapée (#8216). */
  readonly backSearch?: Readonly<Record<string, string | undefined>>;
  readonly title?: string;
  readonly languageChoice?: boolean;
}) {
  const language = useInterfaceLanguage();
  return (
    <>
      <header data-auth-header className="flex w-full shrink-0 items-center gap-1 px-2 pt-1">
        <Link
          to={back}
          {...(backSearch === undefined ? {} : { search: backSearch })}
          replace
          data-auth-back
          aria-label={translate(language, 'common.back')}
          className="grid shrink-0 place-items-center rounded-chip"
          style={{ minHeight: 44, minWidth: 44, color: 'var(--color-ios-ink-2)' }}
        >
          <Glyph name="caretLeft" size={22} className="rtl:-scale-x-100" />
        </Link>
        <Link
          to="home"
          data-auth-home
          aria-label={translate(language, 'publicHeader.home')}
          className="flex min-w-0 items-center gap-2 rounded-chip px-1"
          style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}
        >
          <BrandMark size={28} lineWidth={3} />
          <span className="text-title font-bold" translate="no">
            Meeshy
          </span>
        </Link>
        <span className="flex-1" />
        {languageChoice ? <InterfaceLanguageSelect language={language} /> : null}
      </header>
      {title === undefined ? null : (
        <h1 className="shrink-0 px-6 pt-2 text-center text-title font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {title}
        </h1>
      )}
    </>
  );
}
