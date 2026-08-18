/**
 * Le fantôme devant le nom d'un auteur sans compte.
 *
 * La branche `<Ghost />` de `MessageNameDate` existait depuis longtemps —
 * écrite, stylée, jamais rendue : elle était gardée par `const isAnonymous =
 * false`. Un littéral, pas une déduction. La donnée qui l'aurait allumée
 * n'arrivait pas jusqu'ici : `Participant.type` était chargé et mappé côté
 * gateway, puis retiré à la sérialisation faute d'être déclaré dans
 * `userMinimalSchema`.
 *
 * Ce fichier verrouille les deux moitiés de la règle. Le fantôme marque ceux
 * qui n'ont pas de compte, et LUI SEUL le dit : un compte dont le pseudo
 * commence par `ano_` n'en porte pas. Le préfixe est lisible, il n'est pas une
 * preuve — c'est précisément pourquoi la décision se prend sur `type`.
 *
 * Second effet, moins visible mais aussi cassé : le nom d'un auteur sans compte
 * était rendu en `<Link href="/u/{username}">`. Ce profil n'existe pas — un
 * anonyme n'a pas de page `/u/`. Le lien menait au vide.
 *
 * Le fantôme se cherche par `data-testid="ghost-icon"` et non par la classe
 * `.lucide-ghost` : `__mocks__/lucide-react.js` remplace toute la bibliothèque
 * par des `<svg data-testid="{nom}-icon">`, la classe réelle n'existe pas ici.
 */

import { render, screen } from '@testing-library/react';
import { MessageNameDate } from '../MessageNameDate';

jest.mock('@/stores/language-store', () => ({
  useCurrentInterfaceLanguage: () => 'fr',
}));

const t = (key: string) => key;

const senderWith = (overrides: Record<string, unknown>) => ({
  id: 'p1',
  username: 'ano_bob_sm123',
  displayName: 'ano_bob_sm123',
  ...overrides,
});

const renderRow = (sender: Record<string, unknown>) =>
  render(
    <MessageNameDate
      message={{ createdAt: new Date('2026-08-18T10:00:00Z'), sender: sender as never }}
      isOwnMessage={false}
      t={t}
    />
  );

describe('MessageNameDate — marquage des auteurs sans compte', () => {
  it('affiche le fantôme pour un auteur `type: "anonymous"`', () => {
    const { container } = renderRow(senderWith({ type: 'anonymous' }));

    expect(container.querySelector('[data-testid="ghost-icon"]')).not.toBeNull();
  });

  it('n’affiche AUCUN fantôme pour un compte, fût-il nommé `ano_bob_sm123`', () => {
    const { container } = renderRow(senderWith({ type: 'user' }));

    expect(container.querySelector('[data-testid="ghost-icon"]')).toBeNull();
  });

  it('accepte le repli `isMeeshyer` des routes de lien', () => {
    const { container } = renderRow(senderWith({ isMeeshyer: false }));

    expect(container.querySelector('[data-testid="ghost-icon"]')).not.toBeNull();
  });

  it('ne marque personne quand le discriminant manque', () => {
    const { container } = renderRow(senderWith({}));

    expect(container.querySelector('[data-testid="ghost-icon"]')).toBeNull();
  });

  it('ne propose pas de page profil `/u/` à un auteur sans compte — elle n’existe pas', () => {
    const { container } = renderRow(senderWith({ type: 'anonymous' }));

    expect(container.querySelector('a[href^="/u/"]')).toBeNull();
  });

  it('CONTRE-ÉPREUVE — un compte garde son lien profil', () => {
    const { container } = renderRow(senderWith({ type: 'user', username: 'alice' }));

    expect(container.querySelector('a[href="/u/alice"]')).not.toBeNull();
  });

  it('affiche le nom dans les deux cas', () => {
    renderRow(senderWith({ type: 'anonymous' }));

    expect(screen.getByText('ano_bob_sm123')).toBeTruthy();
  });
});

// ─── Même littéral mort dans la citation ─────────────────────────────────────
//
// `MessageReplyPreview` portait sa propre copie du défaut : `const
// isReplyAnonymous = false`, gardant une branche `<Ghost />` identique. Sans
// elle, citer un auteur sans compte effaçait le marqueur — et proposait un lien
// `/u/{pseudo}` vers une page qui n'existe pas.

import { MessageReplyPreview } from '../MessageReplyPreview';

const renderReply = (sender: Record<string, unknown>) =>
  render(
    <MessageReplyPreview
      replyTo={{
        id: 'm1',
        content: 'Bonjour',
        createdAt: new Date('2026-08-18T10:00:00Z'),
        sender: sender as never,
      }}
      replyToContent="Bonjour"
      isOwnMessage={false}
      t={t}
    />
  );

describe('MessageReplyPreview — marquage de l’auteur cité', () => {
  it('affiche le fantôme quand l’auteur cité n’a pas de compte', () => {
    const { container } = renderReply(senderWith({ type: 'anonymous' }));

    expect(container.querySelector('[data-testid="ghost-icon"]')).not.toBeNull();
  });

  it('n’en affiche pas pour un compte nommé `ano_bob_sm123`', () => {
    const { container } = renderReply(senderWith({ type: 'user' }));

    expect(container.querySelector('[data-testid="ghost-icon"]')).toBeNull();
  });

  it('ne propose pas de page profil `/u/` pour un auteur cité sans compte', () => {
    const { container } = renderReply(senderWith({ type: 'anonymous' }));

    expect(container.querySelector('a[href^="/u/"]')).toBeNull();
  });
});
