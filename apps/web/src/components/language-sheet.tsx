import { useState } from 'react';

import { SUPPORTED_LANGUAGES } from '@meeshy/shared/utils/languages';

import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { Glyph } from './glyph';
import { Sheet, SheetEmpty } from './sheet';

/**
 * LA FEUILLE DE CHOIX DE LA LANGUE LUE (#5555, E8) — miroir du `languageSheet`
 * de `SignupView.swift:290-310` (`LanguageSelector`), sur la liste PARTAGÉE
 * `SUPPORTED_LANGUAGES` (`@meeshy/shared/utils/languages`) : aucune seconde
 * table de langues écrite pour cet écran.
 *
 * `lang={code}` SUR CHAQUE NOM NATIF (correction de revue, défaut 7) — la
 * page est en français, ces 83 lignes ne le sont pas : sans l'attribut, un
 * lecteur d'écran francophone prononce « Deutsch », « 日本語 » et « العربية »
 * avec les règles du français. La règle du chantier — `lang="xx"` sur tout
 * nœud rendu dans une langue différente du document — s'applique ici comme au
 * contenu que descend le Prisme.
 *
 * `title`/`selected` (#5828, § Étape 4) — RÉUTILISÉE telle quelle par le
 * composeur (« Langue d'écriture », `selected` = la valeur COURANTE de la
 * pastille), jamais une jumelle : le critère de fin de #5828 l'exige
 * explicitement (« réutiliser, jamais une seconde feuille »). L'inscription
 * ne passe ni l'un ni l'autre — le titre par défaut vient alors du catalogue
 * d'interface (`languageSheet.title.read`, #6328), plus jamais un littéral
 * français fixe.
 *
 * RECHERCHE ET ÉTAT VIDE (#6328) — parlent la langue d'INTERFACE
 * (`currentInterfaceLanguage()`), jamais celle du contenu : ce sont des
 * libellés SYSTÈME de la feuille, distincts du Prisme de contenu que cette
 * feuille sert à choisir.
 */
export function LanguageSheet({
  title,
  selected,
  onSelect,
  onClose,
}: {
  title?: string;
  selected?: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  const language = currentInterfaceLanguage();
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();
  const filtered =
    needle === ''
      ? SUPPORTED_LANGUAGES
      : SUPPORTED_LANGUAGES.filter(
          (lang) =>
            lang.name.toLowerCase().includes(needle) ||
            (lang.nativeName ?? '').toLowerCase().includes(needle) ||
            lang.code.toLowerCase().includes(needle),
        );

  return (
    <Sheet
      title={title ?? translate(language, 'languageSheet.title.read')}
      searchLabel={translate(language, 'languageSheet.search')}
      searchPlaceholder={translate(language, 'languageSheet.search')}
      search={search}
      onSearchChange={setSearch}
      onClose={onClose}
    >
      {filtered.map((lang) => {
        const isSelected = lang.code === selected;
        return (
          <li key={lang.code}>
            <button
              type="button"
              onClick={() => onSelect(lang.code)}
              aria-current={isSelected ? 'true' : undefined}
              className="flex w-full items-center gap-3 px-4 text-left"
              style={{ minHeight: 44 }}
            >
              <span aria-hidden="true">{lang.flag}</span>
              <span className="flex-1 text-body" lang={lang.code} style={{ color: 'var(--color-ios-ink)' }}>
                {lang.nativeName ?? lang.name}
              </span>
              <span className="text-title" style={{ color: 'var(--color-ios-ink-2)' }}>
                {lang.code}
              </span>
              {isSelected ? <Glyph name="check" size={16} style={{ color: 'var(--accent)' }} /> : null}
            </button>
          </li>
        );
      })}
      {filtered.length === 0 ? (
        <SheetEmpty label={translate(language, 'languageSheet.empty', { search })} />
      ) : null}
    </Sheet>
  );
}
