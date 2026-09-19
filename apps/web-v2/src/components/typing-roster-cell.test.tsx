import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { TypingEntry } from '@/lib/api/typing-store';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { TypingRosterCell } from './typing-roster-cell';

const entry = (userId: string, displayName: string): TypingEntry => ({ userId, displayName, expiresAt: 0 });

/**
 * LA CELLULE DE FRAPPE DANS LA LANGUE D'INTERFACE (#6206) — le libellé exposé
 * au lecteur d'écran vient du catalogue de la langue résolue.
 */
describe('TypingRosterCell — le libellé suit la langue d’interface', () => {
  beforeAll(async () => {
    ensureHappyDomRegistered();
    await loadInterfaceCatalog('en');
  });

  afterAll(async () => {
    document.documentElement.lang = 'fr';
    await releaseHappyDomIfRegistered();
  });

  test('en : un et deux frappeurs se disent en anglais, dans les deux tenues', () => {
    document.documentElement.lang = 'en';
    const one = renderToStaticMarkup(
      <TypingRosterCell typists={[entry('u-kwame', 'Kwame Mensah')]} accent="#5B4CFF" flat />,
    );
    const two = renderToStaticMarkup(
      <TypingRosterCell
        typists={[entry('u-kwame', 'Kwame Mensah'), entry('u-fatou', 'Fatou Bâ')]}
        accent="#5B4CFF"
        flat={false}
      />,
    );
    expect(one).toContain('aria-label="Kwame Mensah is typing"');
    expect(two).toContain('>Kwame Mensah and Fatou Bâ are typing<');
  });
});

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

/**
 * LE VISAGE DU MENEUR PORTE SA PHOTO (#6985, point 2).
 *
 * `TypingEntry` ne porte aucun avatar — **et la charge serveur non plus** :
 * `typing:start` sert `userId` / `username` / `displayName`. Élargir
 * l'événement aurait dupliqué l'information à chaque frappe de chaque
 * personne, alors qu'elle est DÉJÀ en cache côté client.
 *
 * L'hôte résout donc, et remet un résolveur. Pourquoi une FONCTION et pas la
 * liste des participants : le meneur est élu DANS la cellule (`typingLead`,
 * le premier apparu) — l'hôte ne sait pas de qui il s'agit, et le lui faire
 * calculer dupliquerait l'élection. Mesuré avant de trancher : la cellule
 * n'est pas `memo`-isée, donc l'identité instable d'une fonction en prop ne
 * coûte rien ici.
 */
describe('TypingRosterCell — le visage du meneur porte sa photo (#6985)', () => {
  const avatarDe = (userId: string) => (userId === 'u-kwame' ? 'https://static.meeshy.me/u/i/kwame.jpg' : undefined);

  test('tenue plate : la pastille du meneur rend son <img>, jamais ses seules initiales', () => {
    const html = renderToStaticMarkup(
      <TypingRosterCell typists={[entry('u-kwame', 'Kwame Mensah')]} accent="#5B4CFF" flat avatarOf={avatarDe} />,
    );

    expect(html).toContain('kwame.jpg');
  });

  test('tenue bulles : la même photo, la cellule ne sert pas deux visages du même frappeur', () => {
    const html = renderToStaticMarkup(
      <TypingRosterCell typists={[entry('u-kwame', 'Kwame Mensah')]} accent="#5B4CFF" flat={false} avatarOf={avatarDe} />,
    );

    expect(html).toContain('kwame.jpg');
  });

  test('le MENEUR seul, jamais le second : deux frappeurs, une seule photo — celle du premier apparu', () => {
    // `typingLead` élit le premier apparu, et la cellule ne multiplie pas ses
    // avatars. Sans ce témoin, un résolveur appelé sur le mauvais frappeur
    // resterait invisible.
    const html = renderToStaticMarkup(
      <TypingRosterCell
        typists={[entry('u-amina', 'Amina Diallo'), entry('u-kwame', 'Kwame Mensah')]}
        accent="#5B4CFF"
        flat
        avatarOf={(userId) => (userId === 'u-amina' ? 'amina.jpg' : 'kwame.jpg')}
      />,
    );

    expect(html).toContain('amina.jpg');
    expect(html).not.toContain('kwame.jpg');
  });

  test('sans résolveur, la cellule rend ses initiales — aucun <img> fabriqué', () => {
    const html = renderToStaticMarkup(
      <TypingRosterCell typists={[entry('u-kwame', 'Kwame Mensah')]} accent="#5B4CFF" flat />,
    );

    expect(html).not.toContain('<img');
  });

  test('un frappeur SANS photo ne rend aucun <img> — jamais un src vide, qui recharge la page', () => {
    const html = renderToStaticMarkup(
      <TypingRosterCell typists={[entry('u-ghost', 'Inconnu')]} accent="#5B4CFF" flat avatarOf={avatarDe} />,
    );

    expect(html).not.toContain('<img');
  });
});
