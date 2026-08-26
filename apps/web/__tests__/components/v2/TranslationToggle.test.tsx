/**
 * `TranslationToggle` auto-résout la version affichée à partir de `userLanguage`.
 * La correspondance passait par `languageCode.startsWith(userLanguage)`, un préfixe
 * qui sur-matche (`fry` Frisian pour une préférence `fr`, `fil` Filipino pour `fi`)
 * et sous-matche (l'alias legacy `iw` ne matche pas `he`). SSOT :
 * normalizeLanguageForDedup (packages/shared/utils/language-normalize.ts).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TranslationToggle } from '@/components/v2/TranslationToggle';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

// Variante `inline` (défaut) : seul le contenu résolu (`displayedVersion.content`)
// est rendu ; les autres versions vivent dans un menu fermé par défaut. On isole
// ainsi ce que l'auto-résolution a réellement choisi.
const renderToggle = (props: Partial<React.ComponentProps<typeof TranslationToggle>>) =>
  render(
    <TranslationToggle
      originalContent="Hello"
      originalLanguage="en"
      {...props}
    />,
  );

describe('TranslationToggle — auto-résolution robuste à la forme du code', () => {
  it('sert une traduction région-taguée (fr-FR) pour une préférence fr', () => {
    renderToggle({
      translations: [{ languageCode: 'fr-FR', languageName: 'Français', content: 'Bonjour' }],
      userLanguage: 'fr',
    });
    expect(screen.getByText('Bonjour')).toBeInTheDocument();
  });

  it("ne sur-matche PAS le Frisian (fry) pour une préférence fr — montre l'original", () => {
    renderToggle({
      translations: [{ languageCode: 'fry', languageName: 'Frysk', content: 'Hallo' }],
      userLanguage: 'fr',
    });
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.queryByText('Hallo')).not.toBeInTheDocument();
  });

  it("ne sur-matche PAS le Filipino (fil) pour une préférence fi — montre l'original", () => {
    renderToggle({
      translations: [{ languageCode: 'fil', languageName: 'Filipino', content: 'Kumusta' }],
      userLanguage: 'fi',
    });
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.queryByText('Kumusta')).not.toBeInTheDocument();
  });

  it('résout un alias legacy (iw) pour une préférence he', () => {
    renderToggle({
      translations: [{ languageCode: 'iw', languageName: 'עברית', content: 'שלום' }],
      userLanguage: 'he',
    });
    expect(screen.getByText('שלום')).toBeInTheDocument();
  });
});

// Cycle 120 — le Prisme des POSTS est la 3e famille de résolveurs (aperçu de
// liste, audio, posts). iOS `APIPost.resolveTranslation` et Android
// `LanguageResolver.preferredTranslation` DESCENDENT la liste ordonnée des
// langues du lecteur ; le web ne recevait qu'un `userLanguage` unique (le rang
// 1) et ne servait donc jamais une traduction d'un rang inférieur quand le rang
// 1 manquait. Cas NOMINAL, pas limite : la règle 2 du Prisme fait entrer la
// locale appareil au rang 4, donc tout lecteur dont l'appareil n'est pas dans sa
// langue applicative a un prisme d'au moins deux langues.
describe('TranslationToggle — descend le prisme ORDONNÉ (parité iOS/Android)', () => {
  it('sert une traduction de rang inférieur quand le rang 1 manque', () => {
    // Prisme ['fr','en'] : pas de traduction fr, une traduction en existe.
    // iOS/Android servent l'anglais ; le web servait l'original.
    renderToggle({
      originalContent: 'Hola',
      originalLanguage: 'es',
      translations: [{ languageCode: 'en', languageName: 'English', content: 'Hi there' }],
      preferredLanguages: ['fr', 'en'],
    });
    expect(screen.getByText('Hi there')).toBeInTheDocument();
    expect(screen.queryByText('Hola')).not.toBeInTheDocument();
  });

  it('préfère le rang 1 au rang inférieur quand les deux sont disponibles', () => {
    renderToggle({
      originalContent: 'Hola',
      originalLanguage: 'es',
      translations: [
        { languageCode: 'en', languageName: 'English', content: 'Hi there' },
        { languageCode: 'fr', languageName: 'Français', content: 'Bonjour' },
      ],
      preferredLanguages: ['fr', 'en'],
    });
    expect(screen.getByText('Bonjour')).toBeInTheDocument();
    expect(screen.queryByText('Hi there')).not.toBeInTheDocument();
  });

  // Règle 3 du Prisme : la langue d'origine concourt à son RANG. Au rang 1 elle
  // gagne, même si une traduction d'un rang inférieur existe.
  it("laisse l'original gagner à son rang face à une traduction plus basse", () => {
    renderToggle({
      originalContent: 'Bonjour',
      originalLanguage: 'fr',
      translations: [{ languageCode: 'en', languageName: 'English', content: 'Hi there' }],
      preferredLanguages: ['fr', 'en'],
    });
    expect(screen.getByText('Bonjour')).toBeInTheDocument();
    expect(screen.queryByText('Hi there')).not.toBeInTheDocument();
  });

  // …et elle PERD quand elle occupe un rang inférieur à une traduction servie :
  // original anglais (rang 2), traduction française (rang 1) ⇒ « Bonjour ».
  it("ne laisse pas l'original court-circuiter depuis un rang inférieur", () => {
    renderToggle({
      originalContent: 'Hi there',
      originalLanguage: 'en',
      translations: [{ languageCode: 'fr', languageName: 'Français', content: 'Bonjour' }],
      preferredLanguages: ['fr', 'en'],
    });
    expect(screen.getByText('Bonjour')).toBeInTheDocument();
    expect(screen.queryByText('Hi there')).not.toBeInTheDocument();
  });

  it('retombe sur `userLanguage` (rang 1) quand `preferredLanguages` est absent', () => {
    // Rétrocompatibilité : les appelants non encore câblés gardent l'ancien
    // comportement à une langue.
    renderToggle({
      originalContent: 'Hola',
      originalLanguage: 'es',
      translations: [{ languageCode: 'en', languageName: 'English', content: 'Hi there' }],
      userLanguage: 'en',
    });
    expect(screen.getByText('Hi there')).toBeInTheDocument();
  });
});
