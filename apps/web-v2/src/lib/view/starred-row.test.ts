import { describe, expect, test } from 'bun:test';

import type { StarredMessageItem } from '@meeshy/shared/types/message-star';
import { conversationAccentPalette } from '@meeshy/shared/utils/conversation-colors';

import { starredRowModel } from './starred-row';

/**
 * **UNE LIGNE DE L'ÉCRAN DES MESSAGES FAVORIS** (#7286) — miroir de `StarredRow`
 * (`apps/ios/Meeshy/Features/Main/Views/StarredMessagesView.swift`) : l'auteur,
 * la date du message, l'extrait (quatre lignes au plus, à l'écran), le nom de la
 * conversation, et la barre à la couleur d'ACCENT de la conversation.
 *
 * L'extrait est servi dans la langue du LECTEUR, par le résolveur du dépôt
 * (`served()`, qui descend `resolvePrismTranslation`) — jamais `translations[0]`.
 */

const item = (patch: {
  readonly message?: Partial<StarredMessageItem['message']>;
  readonly sender?: StarredMessageItem['sender'];
  readonly conversation?: Partial<StarredMessageItem['conversation']>;
} = {}): StarredMessageItem => ({
  id: 'star-1',
  starredAt: '2026-09-22T09:00:00.000Z',
  message: {
    id: 'm1',
    conversationId: 'c-1',
    messageType: 'text',
    createdAt: '2026-09-21T08:30:00.000Z',
    editedAt: null,
    isProtected: false,
    content: 'Le déploiement est terminé.',
    originalLanguage: 'fr',
    translations: [],
    attachments: [],
    ...patch.message,
  },
  sender: patch.sender === undefined ? { id: 'p-1', userId: 'u-1', displayName: 'Amina Diallo', avatar: null, username: 'amina' } : patch.sender,
  conversation: { id: 'c-1', identifier: 'equipe', type: 'group', name: 'Équipe déploiement', avatar: null, ...patch.conversation },
});

const tr = (targetLanguage: string, translatedContent: string) => ({ id: `t-${targetLanguage}`, messageId: 'm1', targetLanguage, translatedContent });

describe('starredRowModel — l’extrait suit le Prisme du lecteur', () => {
  /**
   * TÉMOIN DE RANG 2 (leçon 261) : au rang 1, un résolveur qui s'arrêterait au
   * premier rang et la loi juste rendent le même verdict. Lecteur `['es','en']`,
   * message français traduit en anglais et en allemand : l'espagnol (rang 1)
   * n'a pas de traduction, l'anglais (rang 2) en a une ⇒ l'anglais, jamais
   * l'allemand (`translations[0]`), jamais l'original.
   */
  test('RANG 2 : lecteur [es, en], message fr traduit en de puis en ⇒ l’anglais, jamais translations[0]', () => {
    const model = starredRowModel(
      item({ message: { translations: [tr('de', 'Die Bereitstellung ist abgeschlossen.'), tr('en', 'The deployment is done.')] } }),
      { preferredLanguages: ['es', 'en'], locale: 'es-ES' },
    );
    expect(model.excerpt).toEqual({ kind: 'text', text: 'The deployment is done.', language: 'en' });
  });

  test('la langue d’origine concourt à SON rang : lecteur [fr, en], message fr ⇒ l’original', () => {
    const model = starredRowModel(item({ message: { translations: [tr('en', 'The deployment is done.')] } }), {
      preferredLanguages: ['fr', 'en'],
      locale: 'fr-FR',
    });
    expect(model.excerpt).toEqual({ kind: 'text', text: 'Le déploiement est terminé.', language: 'fr' });
  });

  test('aucune traduction dans le prisme ⇒ l’original, jamais la première traduction venue', () => {
    const model = starredRowModel(item({ message: { translations: [tr('de', 'Die Bereitstellung ist abgeschlossen.')] } }), {
      preferredLanguages: ['es'],
      locale: 'es-ES',
    });
    expect(model.excerpt).toEqual({ kind: 'text', text: 'Le déploiement est terminé.', language: 'fr' });
  });
});

describe('starredRowModel — un message protégé est un placeholder, rien n’est inventé', () => {
  test('`isProtected` ⇒ extrait « protégé », sans texte', () => {
    const model = starredRowModel(
      item({ message: { isProtected: true, content: null, originalLanguage: null, translations: [], attachments: [] } }),
      { preferredLanguages: ['fr'], locale: 'fr-FR' },
    );
    expect(model.excerpt).toEqual({ kind: 'protected' });
  });

  test('même si une charge fautive portait encore un texte, un placeholder ne le montre pas', () => {
    const model = starredRowModel(item({ message: { isProtected: true, content: 'secret 4817' } }), { preferredLanguages: ['fr'], locale: 'fr-FR' });
    expect(model.excerpt).toEqual({ kind: 'protected' });
  });
});

describe('starredRowModel — un message sans texte dit ce qu’il porte', () => {
  test('une photo seule ⇒ « Photo », et le compte des autres pièces', () => {
    const model = starredRowModel(
      item({
        message: {
          content: '',
          messageType: 'image',
          attachments: [
            { id: 'a1', mimeType: 'image/jpeg', fileUrl: 'https://x/1.jpg', thumbnailUrl: null, isMasked: false },
            { id: 'a2', mimeType: 'image/png', fileUrl: 'https://x/2.png', thumbnailUrl: null, isMasked: false },
          ],
        },
      }),
      { preferredLanguages: ['fr'], locale: 'fr-FR' },
    );
    expect(model.excerpt).toEqual({ kind: 'media', media: 'image', extra: 1 });
  });

  test('ni texte ni pièce ⇒ un état dit, jamais une ligne vide', () => {
    const model = starredRowModel(item({ message: { content: '', messageType: 'location' } }), { preferredLanguages: ['fr'], locale: 'fr-FR' });
    expect(model.excerpt).toEqual({ kind: 'empty' });
  });
});

describe('starredRowModel — l’auteur, la date, la conversation, l’accent', () => {
  test('les champs de la ligne iOS', () => {
    const model = starredRowModel(item(), { preferredLanguages: ['fr'], locale: 'fr-FR' });
    expect(model.messageId).toBe('m1');
    expect(model.conversationId).toBe('c-1');
    expect(model.author).toBe('Amina Diallo');
    expect(model.conversationName).toBe('Équipe déploiement');
    expect(model.sentAt).toBe('2026-09-21T08:30:00.000Z');
    expect(model.dateLabel).toBe(
      new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
        new Date('2026-09-21T08:30:00.000Z'),
      ),
    );
  });

  test('l’accent est celui de la conversation, calculé par la loi partagée (le type y entre, jamais une couleur écrite ici)', () => {
    const groupe = starredRowModel(item(), { preferredLanguages: ['fr'], locale: 'fr-FR' });
    const directe = starredRowModel(item({ conversation: { type: 'direct' } }), { preferredLanguages: ['fr'], locale: 'fr-FR' });
    expect(groupe.accent).toBe(conversationAccentPalette({ name: 'Équipe déploiement', type: 'group' }).primary);
    expect(directe.accent).not.toBe(groupe.accent);
  });

  test('un auteur sans nom retombe sur son identifiant, puis sur `null` (l’écran dit « Utilisateur »)', () => {
    expect(
      starredRowModel(item({ sender: { id: 'p', userId: 'u', displayName: null, avatar: null, username: 'kwame' } }), {
        preferredLanguages: ['fr'],
        locale: 'fr-FR',
      }).author,
    ).toBe('kwame');
    expect(starredRowModel(item({ sender: null }), { preferredLanguages: ['fr'], locale: 'fr-FR' }).author).toBeNull();
  });

  test('une conversation sans nom se nomme par son identifiant', () => {
    expect(starredRowModel(item({ conversation: { name: null } }), { preferredLanguages: ['fr'], locale: 'fr-FR' }).conversationName).toBe('equipe');
  });
});
