import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { Message } from '@/lib/api/types';
import type { Served } from '@/lib/api/prism';

import { ThreadMessageSheets, type ThreadMessageSheetsController } from './thread-sheets';

/** Bouchon du contrôleur ENTIER de `useMessageMenu` — seuls les champs que ce
 * composant lit varient par test ; le reste est un no-op typé, motif des
 * fixtures `as unknown as X` déjà en usage dans ce dépôt
 * (`lens-row-preview.test.tsx`). */
function controllerOf(overrides: Partial<ThreadMessageSheetsController>): ThreadMessageSheetsController {
  const base = {
    menuTarget: null,
    menuData: undefined,
    longPress: {},
    onCloseMenu: () => {},
    onMenuReact: () => {},
    onMenuAction: () => {},
    onPickLanguage: () => {},
    displayLanguageOf: () => undefined,
    myReactionsOf: () => undefined,
    selection: null,
    onRowTap: () => {},
    onEndSelection: () => {},
    onCopySelection: () => {},
    forwardIds: null,
    onForwardSelection: () => {},
    onForwardTo: () => {},
    onCloseForward: () => {},
    detailFor: null,
    setDetailFor: () => {},
    reactionSheetFor: null,
    setReactionSheetFor: () => {},
    servedOf: (): Served | undefined => undefined,
    starOf: () => null,
  };
  return { ...base, ...overrides } as unknown as ThreadMessageSheetsController;
}

function messageOf(overrides: Partial<Message> & { readonly id: string }): Message {
  return {
    conversationId: 'c-1',
    senderId: 'u-2',
    content: 'salut',
    originalLanguage: 'fr',
    translations: [{ id: 't1', messageId: 'm1', targetLanguage: 'en', translatedContent: 'hi', translationModel: 'basic', createdAt: new Date() }],
    createdAt: new Date('2026-09-24T10:00:00.000Z'),
    updatedAt: new Date('2026-09-24T10:00:00.000Z'),
    messageType: 'text',
    isViewOnce: false,
    reactionSummary: {},
    attachments: [
      { id: 'a1', fileName: 'photo.jpg', originalName: 'photo.jpg', fileUrl: 'https://x.test/photo.jpg', fileType: 'image', mimeType: 'image/jpeg', fileSize: 10 },
    ],
    ...overrides,
  } as unknown as Message;
}

describe('ThreadMessageSheets — les feuilles du message (#7429, extrait de routes/thread.tsx)', () => {
  test('rien de ciblé ⇒ rien de monté', () => {
    const html = renderToStaticMarkup(
      <ThreadMessageSheets
        messageMenu={controllerOf({})}
        messages={[]}
        readerLanguages={['fr']}
        readerLocale="fr-FR"
        conversationId="c-1"
        viewerId="v-1"
      />,
    );
    expect(html).toBe('');
  });

  test('la fiche d’un message ORDINAIRE porte une proposition de langue', () => {
    const m1 = messageOf({ id: 'm1', isViewOnce: false });
    const html = renderToStaticMarkup(
      <ThreadMessageSheets
        messageMenu={controllerOf({ detailFor: 'm1' })}
        messages={[m1]}
        readerLanguages={['en']}
        readerLocale="fr-FR"
        conversationId="c-1"
        viewerId="v-1"
      />,
    );
    // Langue originale (fr) proposée — `translationChoices` pousse toujours
    // la langue d'origine quand elle est connue.
    expect(html).toContain('Langues');
    expect(html).toContain('Français (original)');
  });

  test('la fiche d’une VUE UNIQUE (#7580) ne porte ni langue ni pièce — rien de son contenu', () => {
    const m1 = messageOf({ id: 'm1', isViewOnce: true });
    const html = renderToStaticMarkup(
      <ThreadMessageSheets
        messageMenu={controllerOf({ detailFor: 'm1' })}
        messages={[m1]}
        readerLanguages={['en']}
        readerLocale="fr-FR"
        conversationId="c-1"
        viewerId="v-1"
      />,
    );
    expect(html).not.toContain('Langues');
    expect(html).not.toContain('Français (original)');
    expect(html).not.toContain('photo.jpg');
  });

  test('un message ciblé qui a QUITTÉ le fil ne monte aucune feuille', () => {
    const html = renderToStaticMarkup(
      <ThreadMessageSheets
        messageMenu={controllerOf({ detailFor: 'ghost' })}
        messages={[]}
        readerLanguages={['fr']}
        readerLocale="fr-FR"
        conversationId="c-1"
        viewerId="v-1"
      />,
    );
    expect(html).toBe('');
  });
});
