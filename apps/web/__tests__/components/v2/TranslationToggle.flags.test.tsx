/**
 * Le Prisme, rendu VISIBLE sans être bavard : sous un contenu déjà servi dans la
 * langue du lecteur, une rangée de DRAPEAUX dit dans quelle langue on lit et
 * permet d'en changer d'un geste.
 *
 * Deux défauts sont fixés ici.
 *
 * 1. `showContent={false}` était IGNORÉ par la variante `block` : elle rendait
 *    toujours `displayedVersion.content`. `PostDetail` la montait ainsi puis
 *    rendait SON propre `PostContentText` — le lecteur voyait le texte DEUX
 *    fois, une fois traduit et une fois en version originale, l'un sous l'autre.
 *
 * 2. Les autres langues n'étaient atteignables que par une zone « parchemin »
 *    qui recopiait un extrait de chaque traduction, plafonnée à trois. Elle
 *    coûtait la moitié de l'écran pour dire ce qu'un drapeau dit d'un coup —
 *    et au-delà de trois langues, les suivantes étaient tout simplement
 *    inatteignables.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TranslationToggle } from '@/components/v2/TranslationToggle';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

const TRANSLATIONS = [
  { languageCode: 'fr', languageName: 'Français', content: 'Bonjour' },
  { languageCode: 'es', languageName: 'Español', content: 'Hola' },
  { languageCode: 'de', languageName: 'Deutsch', content: 'Hallo' },
  { languageCode: 'pt', languageName: 'Português', content: 'Olá' },
];

const renderFlags = (props: Partial<React.ComponentProps<typeof TranslationToggle>> = {}) =>
  render(
    <TranslationToggle
      originalContent="Hello"
      originalLanguage="en"
      originalLanguageName="English"
      translations={TRANSLATIONS}
      userLanguage="fr"
      variant="flags"
      {...props}
    />,
  );

describe('TranslationToggle — variante « drapeaux »', () => {
  it("sert le contenu dans la langue du lecteur, jamais l'original quand une traduction existe", () => {
    renderFlags();

    expect(screen.getByTestId('translation-flags-content')).toHaveTextContent('Bonjour');
    expect(screen.queryByText('Hello')).not.toBeInTheDocument();
  });

  it('offre UN drapeau par langue servie, original compris — aucune n’est hors d’atteinte', () => {
    renderFlags();

    // 4 traductions + l'original = 5, là où le parchemin plafonnait à 3.
    expect(screen.getAllByTestId(/^translation-flag-/)).toHaveLength(5);
    expect(screen.getByTestId('translation-flag-en')).toBeInTheDocument();
  });

  it('marque la langue affichée comme sélectionnée, et elle seule', () => {
    renderFlags();

    expect(screen.getByTestId('translation-flag-fr')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('translation-flag-es')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('translation-flag-en')).toHaveAttribute('aria-pressed', 'false');
  });

  it("nomme la langue affichée SOUS le contenu — un drapeau seul n'est pas un nom", () => {
    renderFlags();

    expect(screen.getByTestId('translation-flags-current')).toHaveTextContent('Français');
  });

  it('change la langue affichée au clic sur un drapeau', () => {
    renderFlags();

    fireEvent.click(screen.getByTestId('translation-flag-es'));

    expect(screen.getByTestId('translation-flags-content')).toHaveTextContent('Hola');
    expect(screen.getByTestId('translation-flag-es')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('translation-flags-current')).toHaveTextContent('Español');
  });

  it("revient à l'original par son drapeau, et le dit", () => {
    renderFlags();

    fireEvent.click(screen.getByTestId('translation-flag-en'));

    expect(screen.getByTestId('translation-flags-content')).toHaveTextContent('Hello');
    expect(screen.getByTestId('translation-flags-current')).toHaveTextContent('English');
  });

  it("n'affiche AUCUNE rangée quand le contenu n'existe que dans une langue", () => {
    renderFlags({ translations: [] });

    expect(screen.queryByTestId(/^translation-flag-/)).not.toBeInTheDocument();
    expect(screen.getByTestId('translation-flags-content')).toHaveTextContent('Hello');
  });

  it("laisse l'hôte rendre le texte quand il le demande — sinon il est rendu DEUX fois", () => {
    renderFlags({ showContent: false });

    expect(screen.queryByTestId('translation-flags-content')).not.toBeInTheDocument();
    // La rangée, elle, reste : c'est tout l'intérêt d'un indicateur nu.
    expect(screen.getByTestId('translation-flag-fr')).toBeInTheDocument();
  });

  it('signale la langue choisie à son hôte, pour que le texte servi soit le même', () => {
    const onChange = jest.fn();
    renderFlags({ onDisplayedChange: onChange });

    expect(onChange).toHaveBeenCalledWith({ languageCode: 'fr', content: 'Bonjour', isOriginal: false });

    fireEvent.click(screen.getByTestId('translation-flag-en'));

    expect(onChange).toHaveBeenLastCalledWith({ languageCode: 'en', content: 'Hello', isOriginal: true });
  });
});

describe('TranslationToggle — la variante `block` respecte showContent', () => {
  it("ne rend PAS le texte quand l'hôte le rend lui-même", () => {
    render(
      <TranslationToggle
        originalContent="Hello"
        originalLanguage="en"
        translations={[{ languageCode: 'fr', languageName: 'Français', content: 'Bonjour' }]}
        userLanguage="fr"
        variant="block"
        showContent={false}
      />,
    );

    expect(screen.queryByText('Bonjour')).not.toBeInTheDocument();
  });
});
