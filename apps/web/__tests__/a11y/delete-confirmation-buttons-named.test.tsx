/**
 * Le témoin de COMPORTEMENT qui double le balayage de source.
 *
 * Le cliquet `icon-button-accessible-name` lit du TEXTE : il prouve qu'un
 * attribut est écrit, jamais qu'une technologie d'assistance entend quelque
 * chose. Celui-ci interroge l'arbre RENDU et calcule, pour chaque bouton, le
 * nom que l'accname servirait — son `aria-label` à défaut de son texte.
 *
 * La confirmation de suppression est le cas le plus cher de la classe : sa
 * variante compacte pose deux cercles de 48 px, l'un portant un `X`, l'autre un
 * `Check`. Sans nom, les deux s'annonçaient « bouton » — et l'un détruit le
 * message pendant que l'autre ferme la vue.
 *
 * La vue rend AUSSI une variante textuelle (« Annuler », « Supprimer
 * définitivement »), ce qui est voulu : deux dispositions, une par largeur. Le
 * témoin ne compte donc pas les boutons, il vérifie qu'AUCUN ne part anonyme —
 * c'est la propriété, et elle survit à un changement de disposition.
 */

import type React from 'react';
import { render, screen } from '@testing-library/react';
import { DeleteConfirmationView } from '@/components/common/bubble-message/DeleteConfirmationView';

// Le catalogue RÉEL de la locale, pas un double : ce témoin atteste aussi que
// les clés posées sur les boutons existent et rendent une phrase.
import deleteMessageFr from '@/locales/fr/deleteMessage.json';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (cle: string) => {
      const table = jest.requireActual('@/locales/fr/deleteMessage.json').deleteMessage as Record<string, unknown>;
      const valeur = table[cle];
      return typeof valeur === 'string' ? valeur : cle;
    },
    locale: 'fr',
  }),
}));

// Même double que le reste du dépôt (`MarkdownLightbox.test.tsx`) : `motion.div`
// rend un `<div>`, il ne disparaît pas — un double qui rend `null` ferait échouer
// ce témoin pour une raison qui n'a rien à voir avec l'accessibilité.
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
}));

/** Ce qu'un lecteur d'écran annonce : l'étiquette explicite, sinon le texte. */
const nomAccessible = (bouton: HTMLElement): string =>
  (bouton.getAttribute('aria-label') ?? bouton.textContent ?? '').trim();

const message = {
  id: 'msg-1',
  content: 'un message',
  senderId: 'u1',
  conversationId: 'c1',
  createdAt: new Date().toISOString(),
} as never;

describe('La confirmation de suppression nomme tous ses boutons', () => {
  beforeEach(() => {
    // La vue a DEUX dispositions et choisit sur `window.innerWidth`, lu dans un
    // effet au montage. C'est la MOBILE qui porte les deux cercles d'icônes —
    // sans cette largeur, le témoin rendait l'autre disposition et attestait un
    // `aria-label` déjà présent avant ce lot, donc il ne pouvait pas tomber.
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 });

    render(
      <DeleteConfirmationView
        message={message}
        isOwnMessage
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
  });

  it("aucun bouton ne s'annonce « bouton » et rien d'autre", () => {
    const anonymes = screen
      .getAllByRole('button')
      .filter((b) => nomAccessible(b) === '')
      .map((b) => b.outerHTML.slice(0, 80));

    expect(anonymes).toEqual([]);
  });

  it('les deux cercles disent ce qu\'ils font, et ne disent pas la même chose', () => {
    // Sans cette assertion, le témoin ci-dessus passerait sur une disposition
    // où plus aucun bouton ne serait une icône : il attesterait alors une
    // propriété que rien n'exerce.
    const etiquetes = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-label'));

    expect(etiquetes).toHaveLength(2);
    expect(etiquetes.map(nomAccessible)).toEqual([
      deleteMessageFr.deleteMessage.cancel,
      deleteMessageFr.deleteMessage.confirmDelete,
    ]);
    expect(etiquetes.every((b) => (b.textContent ?? '').trim() === '')).toBe(true);
  });
});
