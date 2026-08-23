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
