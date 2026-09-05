/**
 * La console d'administration FERME un lien de partage (#3734).
 *
 * `handleDeleteLink` portait un TODO (`page.tsx:156`) : la confirmation
 * s'ouvrait, le toast de succès s'affichait, la liste se rechargeait — et
 * **aucun appel n'était émis**. Le contrôle existait sans avoir d'effet, ce qui
 * est pire qu'un bouton absent : il ATTESTE une suppression qui n'a pas eu
 * lieu, et l'administrateur ne rouvre pas une page qui vient de lui dire oui.
 *
 * Les témoins portent donc sur l'EFFET (l'appel émis, à la bonne adresse, avec
 * l'identifiant de la ligne) et sur la VÉRACITÉ du retour (pas de toast de
 * succès quand la passerelle refuse), jamais sur le seul rendu du bouton.
 *
 * L'adresse est `DELETE /admin/share-links/:id` et l'identifiant est
 * `ConversationShareLink.id` — jamais `linkId`, que `GET /admin/share-links`
 * ne sert plus depuis #4157 (le secret de jointure ne se distribue pas en
 * liste) : sur cette page, `shareLink.linkId` est `undefined`.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { adminService } from '@/services/admin.service';
import { apiService } from '@/services/api.service';
import { API_ENDPOINTS } from '@meeshy/shared/api/endpoints';
import { toast } from 'sonner';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/services/admin.service', () => ({
  adminService: { getShareLinks: jest.fn() },
}));

jest.mock('@/services/api.service', () => ({
  apiService: { delete: jest.fn() },
}));

jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const dict: Record<string, string> = {
        'shareLinks.delete': 'Delete',
        'shareLinks.deleteTitle': 'Close this share link?',
        'shareLinks.deleteDescription': 'Guests will lose access immediately.',
        'shareLinks.deleteConfirm': 'Close the link',
        'shareLinks.deleteSuccess': 'Share link closed',
        'shareLinks.deleteError': 'Could not close the share link',
        'shareLinks.loading': 'Loading…',
      };
      const template = dict[key] ?? key;
      return params
        ? template.replace(/\{(\w+)\}/g, (_: string, k: string) => String(params[k] ?? `{${k}}`))
        : template;
    },
    locale: 'en',
  }),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('@/components/admin/AdminLayout', () => {
  return function MockAdminLayout({ children }: { children: React.ReactNode }) {
    return <div data-testid="admin-layout">{children}</div>;
  };
});

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className }: any) => (
    <button onClick={onClick} disabled={disabled} className={className}>{children}</button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/select', () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => <div onClick={onClick} role="menuitem">{children}</div>,
}));

/** Le vrai `ConfirmDialog` monte un `Dialog` Radix : ce double garde le GESTE. */
jest.mock('@/components/admin/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, onConfirm, title, confirmText }: any) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <button onClick={onConfirm}>{confirmText}</button>
      </div>
    ) : null,
}));

import AdminShareLinksPage from '@/app/admin/share-links/page';

const LINK_ROW_ID = '507f1f77bcf86cd799439033';

function shareLinkRow() {
  return {
    id: LINK_ROW_ID,
    name: 'Public onboarding link',
    currentUses: 3,
    currentConcurrentUsers: 0,
    isActive: true,
    allowAnonymousMessages: true,
    allowAnonymousFiles: false,
    allowAnonymousImages: false,
    createdAt: '2026-08-01T10:00:00.000Z',
    creator: { id: 'u1', username: 'alice', displayName: 'Alice' },
    conversation: { id: 'c1', title: 'Onboarding', type: 'group' },
  };
}

function listResponse() {
  return {
    success: true,
    data: { success: true, data: [shareLinkRow()], pagination: { total: 1, limit: 20, offset: 0, hasMore: false } },
  };
}

/** Ouvre la page, déclenche « Delete » puis confirme. */
async function closeTheLink() {
  const user = userEvent.setup();
  render(<AdminShareLinksPage />);
  const deleteButtons = await screen.findAllByText('Delete');
  await user.click(deleteButtons[0]);
  const confirm = await screen.findByText('Close the link');
  await user.click(confirm);
}

describe('Console d’administration — fermer un lien de partage (#3734)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (adminService.getShareLinks as jest.Mock).mockResolvedValue(listResponse());
    (apiService.delete as jest.Mock).mockResolvedValue({ success: true, data: { success: true, data: { id: LINK_ROW_ID, isActive: false } } });
  });

  it('appelle DELETE /admin/share-links/:id avec l’identifiant de la LIGNE', async () => {
    await closeTheLink();

    await waitFor(() => expect(apiService.delete).toHaveBeenCalledTimes(1));
    // Attendu DÉRIVÉ du catalogue, jamais réécrit à la main. Ce témoin épinglait
    // `/admin/share-links/${id}` — le chemin nu — et il est tombé le jour où la
    // page est passée par `API_ENDPOINTS` (le préfixe `/api/v1` apparaît alors
    // dans l'appel). Réécrire le littéral aurait recréé la JUMELLE que
    // `api-path-literal-guard` existe pour interdire : deux endroits énonçant
    // le même chemin, dont un seul suit le catalogue. En dérivant, le témoin
    // vérifie ce qui compte — que la page passe bien par la source unique et
    // avec l'identifiant de la LIGNE — et il ne peut plus dériver d'elle.
    expect(apiService.delete).toHaveBeenCalledWith(API_ENDPOINTS.admin.shareLinksById(LINK_ROW_ID));
  });

  it('confirme à l’administrateur et RELIT la liste — la ligne fermée doit disparaître', async () => {
    await closeTheLink();

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Share link closed'));
    expect(adminService.getShareLinks).toHaveBeenCalledTimes(2);
  });

  it('n’ANNONCE PAS un succès que la passerelle a refusé', async () => {
    (apiService.delete as jest.Mock).mockRejectedValue(new Error('403'));

    await closeTheLink();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not close the share link'));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('n’émet AUCUN appel tant que la confirmation n’est pas donnée', async () => {
    const user = userEvent.setup();
    render(<AdminShareLinksPage />);

    const deleteButtons = await screen.findAllByText('Delete');
    await user.click(deleteButtons[0]);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(apiService.delete).not.toHaveBeenCalled();
  });
});
