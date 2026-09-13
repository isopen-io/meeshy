import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { TypingEntry } from '@/lib/api/typing-store';

import { TypingRosterCell } from './typing-roster-cell';

const entry = (userId: string, displayName: string): TypingEntry => ({ userId, displayName, expiresAt: 0 });

describe('TypingRosterCell (#6171, T10) — le roster ENTIER, jamais un seul frappeur', () => {
  test('aucun frappeur -> aucune cellule', () => {
    expect(renderToStaticMarkup(<TypingRosterCell typists={[]} accent="#5B4CFF" flat={false} />)).toBe('');
  });

  test('un frappeur, tenue bulles -> "<nom> écrit", UNE Avatar aux initiales du frappeur', () => {
    const html = renderToStaticMarkup(
      <TypingRosterCell typists={[entry('u-kwame', 'Kwame Mensah')]} accent="#5B4CFF" flat={false} />,
    );
    expect(html).toContain('Kwame Mensah écrit');
    expect(html).toContain('KM');
  });

  test('deux frappeurs, tenue bulles -> "<A> et <B> écrivent", l’avatar reste celui du MENEUR (premier apparu)', () => {
    const html = renderToStaticMarkup(
      <TypingRosterCell
        typists={[entry('u-kwame', 'Kwame Mensah'), entry('u-fatou', 'Fatou Bâ')]}
        accent="#5B4CFF"
        flat={false}
      />,
    );
    expect(html).toContain('Kwame Mensah et Fatou Bâ écrivent');
    expect(html).toContain('KM');
    expect(html).not.toContain('FB');
  });

  test('trois frappeurs et plus, tenue bulles -> "Plusieurs personnes écrivent"', () => {
    const html = renderToStaticMarkup(
      <TypingRosterCell
        typists={[entry('u-a', 'A A'), entry('u-b', 'B B'), entry('u-c', 'C C')]}
        accent="#5B4CFF"
        flat={false}
      />,
    );
    expect(html).toContain('Plusieurs personnes écrivent');
  });

  test('les trois points de frappe sont présents et masqués au lecteur d’écran', () => {
    const html = renderToStaticMarkup(
      <TypingRosterCell typists={[entry('u-kwame', 'Kwame Mensah')]} accent="#5B4CFF" flat={false} />,
    );
    expect(html).toContain('aria-hidden');
  });

  /**
   * AUCUNE RÉGION LIVE ICI (D-11, #6172) — témoin NÉGATIF qui garde la
   * décision (§9.1 de la spécification #6171) : la cellule est du texte
   * ordinaire, l'annonce vit ailleurs (`use-live-announcer.ts`).
   */
  test('aucun `aria-live` dans la cellule (D-11, #6172)', () => {
    const html = renderToStaticMarkup(
      <TypingRosterCell typists={[entry('u-kwame', 'Kwame Mensah')]} accent="#5B4CFF" flat={false} />,
    );
    expect(html).not.toContain('aria-live');
  });
});

/**
 * DEUX TENUES (revue-correction #6171, défaut 4) — miroir
 * `TypingIndicatorBubble(isFlat:)` (`MessageListViewController.swift:3137-
 * 3138`, `:3195-3213`) : rangée PLATE (Focal/Script, le mode PAR DÉFAUT D-7)
 * SANS capsule ni libellé visible ; mode Bulles = la capsule historique.
 * `targets/focal-script.md:553` est la cible citée par la revue.
 */
describe('TypingRosterCell — tenue PLATE (Focal/Script) vs tenue BULLES (#6171, défaut 4)', () => {
  /**
   * `rounded-chip` N'EST PAS LE BON SIGNAL — `Avatar` l'emploie DÉJÀ pour
   * la forme de son insigne d'initiales, dans les DEUX tenues (mesuré : un
   * premier jet de ce témoin plantait sur l'avatar, pas sur la capsule). Le
   * signal propre à la capsule DE FRAPPE est `text-time` (le libellé
   * visible, présent dans la SEULE tenue bulles) : sa présence/absence
   * distingue les deux tenues sans dépendre d'une classe partagée.
   */
  test('tenue plate : AUCUN libellé visible — pastille + points seuls', () => {
    const html = renderToStaticMarkup(
      <TypingRosterCell
        typists={[entry('u-kwame', 'Kwame Mensah'), entry('u-fatou', 'Fatou Bâ')]}
        accent="#5B4CFF"
        flat={true}
      />,
    );
    expect(html).not.toContain('text-time');
    expect(html).not.toContain('>Kwame Mensah et Fatou Bâ écrivent<');
    expect(html).toContain('KM');
  });

  test('tenue bulles : la capsule ET le libellé visible sont présents', () => {
    const html = renderToStaticMarkup(
      <TypingRosterCell
        typists={[entry('u-kwame', 'Kwame Mensah'), entry('u-fatou', 'Fatou Bâ')]}
        accent="#5B4CFF"
        flat={false}
      />,
    );
    expect(html).toContain('text-time');
    expect(html).toContain('>Kwame Mensah et Fatou Bâ écrivent<');
  });

  test('les DEUX tenues portent le libellé sur `data-typing-label`, quel que soit ce qui est VISIBLE', () => {
    const flatHtml = renderToStaticMarkup(
      <TypingRosterCell typists={[entry('u-kwame', 'Kwame Mensah')]} accent="#5B4CFF" flat={true} />,
    );
    const bubblesHtml = renderToStaticMarkup(
      <TypingRosterCell typists={[entry('u-kwame', 'Kwame Mensah')]} accent="#5B4CFF" flat={false} />,
    );
    expect(flatHtml).toContain('data-typing-label="Kwame Mensah écrit"');
    expect(bubblesHtml).toContain('data-typing-label="Kwame Mensah écrit"');
  });

  /**
   * LE NOM EST EXPOSÉ, PAS SEULEMENT CALCULÉ (revue-correction, défaut
   * majeur 1) — `data-typing-label` prouve que le libellé est CALCULÉ ;
   * seul un rôle qui AUTORISE le nommage (ARIA 1.2 interdit `aria-label`
   * sur `generic`) prouve qu'il est EXPOSÉ à un lecteur d'écran, dans tous
   * les moteurs et pas seulement ceux qui tolèrent le nommage d'un rôle
   * interdit (Chromium l'exposait, NVDA/Firefox pas garanti). Le témoin
   * asserte donc `role="img"` ET `aria-label` sur LE MÊME nœud racine —
   * miroir de `.accessibilityElement(children: .combine)` +
   * `.accessibilityLabel(label)` posés ENSEMBLE par iOS
   * (`MessageListViewController.swift:3241-3242`).
   */
  test('tenue plate : le libellé est EXPOSÉ (role="img" + aria-label sur le même nœud), pas seulement calculé', () => {
    const html = renderToStaticMarkup(
      <TypingRosterCell
        typists={[entry('u-kwame', 'Kwame Mensah'), entry('u-fatou', 'Fatou Bâ')]}
        accent="#5B4CFF"
        flat={true}
      />,
    );
    const root = /<div\b[^>]*data-typing-cell[^>]*>/.exec(html)?.[0] ?? '';
    expect(root).toContain('role="img"');
    expect(root).toContain('aria-label="Kwame Mensah et Fatou Bâ écrivent"');
  });

  test('tenue bulles : le libellé est aussi EXPOSÉ par role="img" + aria-label, en plus du texte visible', () => {
    const html = renderToStaticMarkup(
      <TypingRosterCell typists={[entry('u-kwame', 'Kwame Mensah')]} accent="#5B4CFF" flat={false} />,
    );
    const root = /<div\b[^>]*data-typing-cell[^>]*>/.exec(html)?.[0] ?? '';
    expect(root).toContain('role="img"');
    expect(root).toContain('aria-label="Kwame Mensah écrit"');
  });
});
