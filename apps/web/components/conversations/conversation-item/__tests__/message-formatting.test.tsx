import { render } from '@testing-library/react';
import { formatLastMessage } from '../message-formatting';

/**
 * Parité dark-mode : chaque icône de type de pièce jointe affichée dans
 * l'aperçu du dernier message (liste de conversations) doit fournir une
 * variante `dark:` afin de rester lisible sur fond sombre — au même titre
 * que les libellés de texte voisins (ExpandableMessageText).
 */

const renderPreview = (attachment: Record<string, unknown>) =>
  render(<>{formatLastMessage({ attachments: [attachment], content: '' })}</>);

const iconSpan = (container: HTMLElement) =>
  container.querySelector('span.inline-flex') as HTMLElement | null;

describe('formatLastMessage — parité dark-mode des icônes de pièce jointe', () => {
  it('image : text-blue-500 + variante sombre', () => {
    const { container } = renderPreview({ mimeType: 'image/png' });
    const span = iconSpan(container);
    expect(span?.className).toContain('text-blue-500');
    expect(span?.className).toContain('dark:text-blue-400');
  });

  it('vidéo : text-red-500 + variante sombre', () => {
    const { container } = renderPreview({ mimeType: 'video/mp4' });
    const span = iconSpan(container);
    expect(span?.className).toContain('text-red-500');
    expect(span?.className).toContain('dark:text-red-400');
  });

  it('audio : text-purple-500 + variante sombre', () => {
    const { container } = renderPreview({ mimeType: 'audio/mpeg' });
    const span = iconSpan(container);
    expect(span?.className).toContain('text-purple-500');
    expect(span?.className).toContain('dark:text-purple-400');
  });

  it('PDF : text-orange-500 + variante sombre', () => {
    const { container } = renderPreview({ mimeType: 'application/pdf' });
    const span = iconSpan(container);
    expect(span?.className).toContain('text-orange-500');
    expect(span?.className).toContain('dark:text-orange-400');
  });

  it('markdown : text-blue-500 + variante sombre', () => {
    const { container } = renderPreview({ mimeType: 'text/markdown', originalName: 'a.md' });
    const span = iconSpan(container);
    expect(span?.className).toContain('text-blue-500');
    expect(span?.className).toContain('dark:text-blue-400');
  });

  it('code : text-green-500 + variante sombre', () => {
    const { container } = renderPreview({ mimeType: 'application/javascript' });
    const span = iconSpan(container);
    expect(span?.className).toContain('text-green-500');
    expect(span?.className).toContain('dark:text-green-400');
  });

  it('générique : text-gray-500 + variante sombre', () => {
    const { container } = renderPreview({ mimeType: 'application/zip' });
    const span = iconSpan(container);
    expect(span?.className).toContain('text-gray-500');
    expect(span?.className).toContain('dark:text-gray-400');
  });
});

/**
 * Durée vidéo : au même titre que l'audio, une vidéo d'au moins une heure doit
 * factoriser la composante heures (`h:mm:ss.cc`) plutôt que déborder les minutes
 * (`mmm:ss.cc`). formatVideoDuration est testé via l'API publique formatLastMessage.
 */
describe('formatLastMessage — durée vidéo', () => {
  it('vidéo < 1h : format mm:ss.cc sans heures', () => {
    // 5 min 07 s 250 ms
    const { container } = renderPreview({ mimeType: 'video/mp4', duration: 5 * 60_000 + 7_000 + 250 });
    expect(container.textContent).toContain('5:07.25');
  });

  it('vidéo ≥ 1h : factorise les heures (h:mm:ss.cc)', () => {
    // 1 h 12 min 15 s 300 ms
    const { container } = renderPreview({ mimeType: 'video/mp4', duration: 3600_000 + 12 * 60_000 + 15_000 + 300 });
    expect(container.textContent).toContain('1:12:15.30');
    expect(container.textContent).not.toContain('72:15.30');
  });
});

/**
 * Cycle 61 — Prisme Linguistique de la ligne de liste.
 *
 * Le principe fondateur du produit dit que le prisme s'applique à TOUT le
 * contenu, previews comprises. La vue conversation traduit déjà ses messages
 * (`use-message-display`) ; la ligne de liste de la MÊME conversation
 * rendait le contenu brut de l'expéditeur. Un lecteur francophone lisait
 * « Hello » dans sa sidebar et « Bonjour » une fois le fil ouvert.
 *
 * La résolution appartient à `resolveLastMessagePreview` (`@meeshy/shared`),
 * jumeau de `MeeshyConversation.resolvedLastMessagePreview` côté iOS — ces
 * témoins vérifient le CÂBLAGE, pas la règle (épinglée côté shared).
 */
describe('formatLastMessage — Prisme Linguistique', () => {
  it("rend la traduction de la langue du lecteur plutôt que l'original", () => {
    const { container } = render(
      <>
        {formatLastMessage(
          { content: 'Hello', attachments: [] },
          {
            translations: { fr: 'Bonjour' },
            originalLanguage: 'en',
            preferredLanguages: ['fr'],
          }
        )}
      </>
    );
    expect(container.textContent).toBe('Bonjour');
  });

  it("rend l'original quand aucune langue du lecteur n'a de traduction", () => {
    // Règle #3 du Prisme : ne JAMAIS retomber sur une traduction quelconque.
    const { container } = render(
      <>
        {formatLastMessage(
          { content: 'Hello', attachments: [] },
          {
            translations: { es: 'Hola' },
            originalLanguage: 'en',
            preferredLanguages: ['fr', 'de'],
          }
        )}
      </>
    );
    expect(container.textContent).toBe('Hello');
  });

  it("rend l'original quand le message EST déjà dans une langue du lecteur", () => {
    const { container } = render(
      <>
        {formatLastMessage(
          { content: 'Bonjour', attachments: [] },
          {
            translations: { en: 'Hello' },
            originalLanguage: 'fr',
            preferredLanguages: ['fr'],
          }
        )}
      </>
    );
    expect(container.textContent).toBe('Bonjour');
  });

  it('reste inchangé sans options — les appelants historiques ne régressent pas', () => {
    const { container } = render(<>{formatLastMessage({ content: 'Hello', attachments: [] })}</>);
    expect(container.textContent).toBe('Hello');
  });

  it("n'altère pas l'aperçu d'une pièce jointe sans texte", () => {
    // Une pièce jointe sans contenu ne porte aucun texte à traduire : le
    // prisme ne doit pas court-circuiter la branche d'icône.
    const { container } = render(
      <>
        {formatLastMessage(
          { content: '', attachments: [{ mimeType: 'image/png' }] },
          {
            translations: { fr: 'Bonjour' },
            originalLanguage: 'en',
            preferredLanguages: ['fr'],
          }
        )}
      </>
    );
    expect(container.querySelector('span.inline-flex')).not.toBeNull();
    expect(container.textContent).not.toContain('Bonjour');
  });
});
