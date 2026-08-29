/**
 * #4170 critère 4/8 — `apps/web/app/links/page.tsx` est le point le plus
 * VISIBLE de la refonte côté web : `GET /links/my-links` → `GET /links`
 * (forme de réponse inchangée, juste l'adresse et `?expand=conversation`),
 * `/toggle`/`/extend` → `PATCH /links/:linkId` générique. Une régression sur
 * l'une des trois adresses casse silencieusement TOUTE la page pour TOUT
 * utilisateur — c'est ce que ces témoins protègent, pas le rendu complet de
 * la page (hors de portée raisonnable pour une migration d'adresses : cette
 * page a une dizaine de dépendances lourdes, toutes bouchonnées ci-dessous
 * en stubs minces, dans le même esprit que `conversation-links-section.test.tsx`).
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import LinksPage from '../../../app/links/page';
import { authManager } from '@/services/auth-manager.service';

jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/layout/Footer', () => ({ Footer: () => null }));
jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}));
jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));
jest.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: 'fr' }),
}));
// `ExpandableLinkCard` expose `onToggle`/`onExtend` par des boutons — le
// stub les rend fidèlement pour que `fireEvent.click` les déclenche, sans
// tirer les dépendances réelles du composant (dropdown, icônes, popovers).
jest.mock('@/components/links/expandable-link-card', () => ({
  ExpandableLinkCard: ({ link, onToggle, onExtend }: any) => (
    <div>
      <span>{link.name}</span>
      <button onClick={() => onToggle(link)}>toggle-{link.linkId}</button>
      <button onClick={() => onExtend(link, 7)}>extend-{link.linkId}</button>
    </div>
  ),
}));
jest.mock('@/components/links/expandable-tracking-link-card', () => ({
  ExpandableTrackingLinkCard: () => null,
}));
jest.mock('@/components/links/link-edit-modal', () => ({ LinkEditModal: () => null }));
jest.mock('@/components/conversations/create-link-modal', () => ({ CreateLinkModalV2: () => null }));
jest.mock('@/components/links/create-tracking-link-modal', () => ({ CreateTrackingLinkModal: () => null }));
jest.mock('@/components/links/edit-tracking-link-modal', () => ({ EditTrackingLinkModal: () => null }));
jest.mock('@/components/conversations/create-conversation-modal', () => ({ CreateConversationModal: () => null }));
jest.mock('@/lib/clipboard', () => ({ copyToClipboard: jest.fn().mockResolvedValue({ success: true }) }));
jest.mock('@/stores', () => ({ useUser: () => null }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/services/tracking-links', () => ({
  deleteTrackingLink: jest.fn(),
  deactivateTrackingLink: jest.fn(),
}));
jest.mock('@/services/auth-manager.service', () => ({
  authManager: { getAuthToken: jest.fn(() => 'mock-token') },
}));
jest.mock('@/lib/conversations/share-link-url', () => ({
  buildShareLinkUrl: (linkId: string) => `https://meeshy.me/chat/${linkId}`,
}));
jest.mock('@/lib/config', () => ({
  buildApiUrl: (endpoint: string) => `http://localhost:3000${endpoint}`,
}));

const mockLink = {
  id: 'link-1',
  linkId: 'mshy_abc123',
  identifier: 'abc123',
  conversationId: 'conv-1',
  name: 'Mon lien',
  currentUses: 3,
  currentConcurrentUsers: 0,
  isActive: true,
  allowAnonymousMessages: true,
  allowAnonymousFiles: false,
  allowAnonymousImages: true,
  createdAt: new Date().toISOString(),
  conversation: { id: 'conv-1', title: 'Ma conversation', type: 'group', description: null },
};

function mockFetchSequence(shareLinksBody: unknown) {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/tracking-links/')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { trackingLinks: [] }, pagination: { hasMore: false } }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(shareLinksBody),
    });
  });
}

describe('LinksPage — adresses migrées par #4170', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    (authManager.getAuthToken as jest.Mock).mockReturnValue('mock-token');
  });

  it('charge la liste via GET /links (?expand=conversation), jamais /links/my-links', async () => {
    mockFetchSequence({ data: [mockLink], pagination: { hasMore: false } });

    render(<LinksPage />);

    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls.map((c) => c[0] as string);
      const shareLinksCall = calls.find((u) => u.includes('/api/links'));
      expect(shareLinksCall).toBeDefined();
      expect(shareLinksCall).toContain('/api/links?limit=');
      expect(shareLinksCall).toContain('expand=conversation');
      expect(shareLinksCall).not.toContain('/my-links');
    });
  });

  it('handleToggleActive appelle PATCH /api/links/:linkId, jamais /toggle', async () => {
    mockFetchSequence({ data: [mockLink], pagination: { hasMore: false } });
    render(<LinksPage />);

    await waitFor(() => expect(screen.getByText('Mon lien')).toBeInTheDocument());

    fireEvent.click(screen.getByText(`toggle-${mockLink.linkId}`));

    await waitFor(() => {
      const toggleCall = (global.fetch as jest.Mock).mock.calls.find(
        (c) => c[1]?.method === 'PATCH' && (c[0] as string).includes(mockLink.linkId)
      );
      expect(toggleCall).toBeDefined();
      expect(toggleCall![0]).toBe(`http://localhost:3000/api/links/${mockLink.linkId}`);
      expect(toggleCall![0]).not.toContain('/toggle');
      expect(JSON.parse(toggleCall![1].body)).toEqual({ isActive: false });
    });
  });

  it('handleExtendDuration appelle PATCH /api/links/:linkId, jamais /extend', async () => {
    mockFetchSequence({ data: [mockLink], pagination: { hasMore: false } });
    render(<LinksPage />);

    await waitFor(() => expect(screen.getByText('Mon lien')).toBeInTheDocument());

    fireEvent.click(screen.getByText(`extend-${mockLink.linkId}`));

    await waitFor(() => {
      const extendCall = (global.fetch as jest.Mock).mock.calls.find(
        (c) => c[1]?.method === 'PATCH' && (c[0] as string).includes(mockLink.linkId)
      );
      expect(extendCall).toBeDefined();
      expect(extendCall![0]).toBe(`http://localhost:3000/api/links/${mockLink.linkId}`);
      expect(extendCall![0]).not.toContain('/extend');
      expect(JSON.parse(extendCall![1].body)).toHaveProperty('expiresAt');
    });
  });
});
