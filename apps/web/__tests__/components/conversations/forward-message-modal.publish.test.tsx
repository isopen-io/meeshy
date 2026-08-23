/**
 * La feuille de partage ne mène pas qu'à des conversations.
 *
 * Un média reçu qu'on veut републier obligeait à l'enregistrer, ouvrir le
 * composeur, le re-téléverser — un aller-retour complet pour un fichier qui
 * n'avait pas bougé du stockage. La feuille offre donc, à côté des
 * conversations, les destinations publiques.
 *
 * Le format ne se choisit pas deux fois : il DÉCOULE du média (image → post,
 * vidéo ou son → réel). Seule la story se demande, parce qu'elle expire.
 *
 * Et publier ce que l'appareil vient de CAPTURER se confirme : transférer une
 * photo à un ami et la publier à un fil entier sont deux gestes que cette même
 * feuille rend voisins, alors qu'une photo sortie de la caméra n'a encore été
 * vue par personne.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ForwardMessageModal } from '@/components/conversations/forward-message-modal';
import type { Conversation, Message } from '@meeshy/shared/types';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown> | string) =>
      typeof params === 'string' ? params : key,
    locale: 'fr',
    setLocale: jest.fn(),
    isLoading: false,
    currentLanguage: 'fr',
    tArray: jest.fn(() => []),
  }),
}));

jest.mock('@/stores', () => ({ useUser: () => ({ id: 'user-1', username: 'moi' }) }));
jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { sendMessage: jest.fn(() => Promise.resolve({ success: true })) },
}));

const mockPublish = jest.fn();
jest.mock('@/services/posts.service', () => ({
  postsService: { publishAttachment: (...a: unknown[]) => mockPublish(...a) },
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('sonner', () => ({
  toast: { success: (...a: unknown[]) => mockToastSuccess(...a), error: (...a: unknown[]) => mockToastError(...a) },
}));
jest.mock('use-debounce', () => ({ useDebounce: (v: unknown) => [v] }));
jest.mock('@/hooks/v2/use-friend-requests-v2', () => ({ useFriendRequestsV2: () => ({ connected: [] }) }));
jest.mock('@/services/contacts-directory.service', () => ({
  contactsDirectoryService: { list: jest.fn(() => Promise.resolve({ contacts: [], hasMore: false })) },
}));
jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    searchConversations: jest.fn(() => Promise.resolve([])),
    createConversation: jest.fn(() => Promise.resolve({ id: 'unused' })),
  },
}));
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('@/components/ui/input', () => ({ Input: (props: any) => <input {...props} /> }));
jest.mock('@/components/ui/button', () => ({ Button: ({ children, ...r }: any) => <button {...r}>{children}</button> }));

const conversation = { id: 'conv-a', title: 'Équipe', type: 'group', participants: [] } as unknown as Conversation;

const messageWith = (attachment: Record<string, unknown> | null): Message =>
  ({
    id: 'msg-1',
    content: 'regarde',
    conversationId: 'conv-src',
    originalLanguage: 'fr',
    senderId: 'user-2',
    isViewOnce: false,
    attachments: attachment ? [attachment] : [],
  }) as unknown as Message;

const renderWith = (attachment: Record<string, unknown> | null, extra: Record<string, unknown> = {}) =>
  render(
    <ForwardMessageModal
      isOpen
      onClose={jest.fn()}
      message={messageWith(attachment)}
      sourceConversationId="conv-src"
      conversations={[conversation]}
      {...extra}
    />,
  );

const IMAGE = { id: 'att-1', mimeType: 'image/jpeg' };
const VIDEO = { id: 'att-2', mimeType: 'video/mp4' };
const AUDIO = { id: 'att-3', mimeType: 'audio/mpeg' };
const PDF = { id: 'att-4', mimeType: 'application/pdf' };

describe('ForwardMessageModal — publier au lieu de transférer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPublish.mockResolvedValue({ success: true, data: { id: 'post-1' } });
  });

  it("n'offre AUCUNE destination publique pour un message sans pièce jointe", () => {
    renderWith(null);
    expect(screen.queryByTestId('forward-publish-post')).not.toBeInTheDocument();
    expect(screen.queryByTestId('forward-publish-story')).not.toBeInTheDocument();
  });

  it("n'offre RIEN pour un document — le fil ne sait pas le rendre", () => {
    renderWith(PDF);
    expect(screen.queryByTestId('forward-publish-post')).not.toBeInTheDocument();
    expect(screen.queryByTestId('forward-publish-story')).not.toBeInTheDocument();
  });

  it('offre POST et STORY pour une image', () => {
    renderWith(IMAGE);
    expect(screen.getByTestId('forward-publish-post')).toBeInTheDocument();
    expect(screen.getByTestId('forward-publish-story')).toBeInTheDocument();
    expect(screen.queryByTestId('forward-publish-reel')).not.toBeInTheDocument();
  });

  it('offre REEL et STORY pour une vidéo comme pour un son', () => {
    const { unmount } = renderWith(VIDEO);
    expect(screen.getByTestId('forward-publish-reel')).toBeInTheDocument();
    expect(screen.getByTestId('forward-publish-story')).toBeInTheDocument();
    unmount();

    renderWith(AUDIO);
    expect(screen.getByTestId('forward-publish-reel')).toBeInTheDocument();
  });

  it("publie l'image en POST, et porte le mot d'accompagnement", async () => {
    renderWith(IMAGE);

    fireEvent.change(screen.getByTestId('forward-note'), { target: { value: 'ma legende' } });
    fireEvent.click(screen.getByTestId('forward-publish-post'));

    await waitFor(() => expect(mockPublish).toHaveBeenCalledTimes(1));
    expect(mockPublish).toHaveBeenCalledWith(
      expect.objectContaining({ attachmentId: 'att-1', target: 'POST', content: 'ma legende' }),
    );
  });

  it('publie la vidéo en REEL', async () => {
    renderWith(VIDEO);

    fireEvent.click(screen.getByTestId('forward-publish-reel'));

    await waitFor(() => expect(mockPublish).toHaveBeenCalledTimes(1));
    expect(mockPublish).toHaveBeenCalledWith(expect.objectContaining({ target: 'REEL' }));
  });

  it('publie en STORY quand la story est demandée', async () => {
    renderWith(IMAGE);

    fireEvent.click(screen.getByTestId('forward-publish-story'));

    await waitFor(() => expect(mockPublish).toHaveBeenCalledTimes(1));
    expect(mockPublish).toHaveBeenCalledWith(expect.objectContaining({ target: 'STORY' }));
  });
});

describe('ForwardMessageModal — publier une CAPTURE se confirme', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPublish.mockResolvedValue({ success: true, data: { id: 'post-1' } });
  });

  it("ne publie PAS au premier geste quand le média sort de l'appareil", () => {
    renderWith({ ...IMAGE, capturedInApp: true });

    fireEvent.click(screen.getByTestId('forward-publish-post'));

    expect(mockPublish).not.toHaveBeenCalled();
    expect(screen.getByTestId('forward-publish-confirm')).toBeInTheDocument();
  });

  it('publie après confirmation, en déclarant la provenance', async () => {
    renderWith({ ...IMAGE, capturedInApp: true });

    fireEvent.click(screen.getByTestId('forward-publish-post'));
    fireEvent.click(screen.getByTestId('forward-publish-confirm'));

    await waitFor(() => expect(mockPublish).toHaveBeenCalledTimes(1));
    expect(mockPublish).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'POST', capturedInApp: true }),
    );
  });

  it('renonce sans rien publier quand la confirmation est refusée', () => {
    renderWith({ ...IMAGE, capturedInApp: true });

    fireEvent.click(screen.getByTestId('forward-publish-post'));
    fireEvent.click(screen.getByTestId('forward-publish-cancel'));

    expect(mockPublish).not.toHaveBeenCalled();
    expect(screen.queryByTestId('forward-publish-confirm')).not.toBeInTheDocument();
  });

  it("ne demande RIEN pour un média venu de la galerie : il a déjà été vu", async () => {
    renderWith({ ...IMAGE, capturedInApp: false });

    fireEvent.click(screen.getByTestId('forward-publish-post'));

    await waitFor(() => expect(mockPublish).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('forward-publish-confirm')).not.toBeInTheDocument();
  });
});
