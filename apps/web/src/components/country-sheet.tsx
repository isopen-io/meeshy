import { useState } from 'react';

import { COUNTRIES, countryName, type Country } from '@/lib/countries';

import { Sheet, SheetEmpty } from './sheet';

/**
 * LA FEUILLE DE CHOIX DU PAYS (#5555, E8) — miroir de `SignupCountrySheet`
 * (`SignupView.swift:487-536`) : liste recherchable (nom, indicatif, ISO),
 * rangées 44 px, sélection = fermeture.
 *
 * Le comportement MODAL (piège de focus, Échap, inertie du fond) vit dans
 * `Sheet` — voir son doc-comment : il n'est pas recopié ici, et sa jumelle
 * `LanguageSheet` le partage.
 */
export function CountrySheet({ onSelect, onClose }: { onSelect: (country: Country) => void; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const locale = typeof document === 'object' ? document.documentElement.lang || 'fr' : 'fr';

  const needle = search.trim().toLowerCase();
  const filtered =
    needle === ''
      ? COUNTRIES
      : COUNTRIES.filter(
          (country) =>
            countryName(country, locale).toLowerCase().includes(needle) ||
            country.dialCode.includes(needle) ||
            country.id.toLowerCase().includes(needle),
        );

  return (
    <Sheet
      title="Pays"
      searchLabel="Rechercher un pays"
      searchPlaceholder="Rechercher un pays"
      search={search}
      onSearchChange={setSearch}
      onClose={onClose}
    >
      {filtered.map((country) => (
        <li key={country.id}>
          <button
            type="button"
            onClick={() => onSelect(country)}
            className="flex w-full items-center gap-3 px-4 text-left"
            style={{ minHeight: 44 }}
          >
            <span aria-hidden="true">{country.flag}</span>
            <span className="flex-1 text-body" style={{ color: 'var(--color-ios-ink)' }}>
              {countryName(country, locale)}
            </span>
            <span className="text-title" style={{ color: 'var(--color-ios-ink-2)' }}>
              {country.dialCode}
            </span>
          </button>
        </li>
      ))}
      {filtered.length === 0 ? <SheetEmpty label={`Aucun pays ne correspond à « ${search} ».`} /> : null}
    </Sheet>
  );
}
