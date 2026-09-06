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
import { useUser } from '@/stores';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/services/admin.service', () => ({
  adminService: { getShareLinks: jest.fn() },
}));

jest.mock('@/services/api.service', () => ({
  apiService: { delete: jest.fn(), post: jest.fn() },
}));

jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/stores', () => ({
  useUser: jest.fn(),
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
        'shareLinks.copy': 'Copy',
        'shareLinks.open': 'Open',
        'shareLinks.revealError': 'Could not reveal the share link',
        'shareLinks.revealReasonTitle': 'Reason required',
        'shareLinks.revealReasonNotice': 'Revealing this link is a sovereign action: it will be recorded in the audit log.',
        'shareLinks.revealReasonLabel': 'Reason',
        'shareLinks.revealReasonPlaceholder': 'Reason for this reveal...',
        'shareLinks.revealReasonHint': 'Enter a reason of at least {min} characters.',
        'shareLinks.revealReasonTooShort': 'The reason must be at least {min} characters long.',
        'shareLinks.revealConfirm': 'Reveal',
        'shareLinks.revealCancel': 'Cancel',
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

// La vraie `Card` (`components/ui/card.tsx`) transmet TOUTES les props d'un
// `<div>`, `onClick` compris — `RevealReasonModal` en dépend pour empêcher un
// clic à l'intérieur de la carte de fermer la modale (`e.stopPropagation()`
// sur l'overlay). Un double qui ne recopie QUE `children` perd cette
// transmission en silence : la modale se refermait dès le premier clic sur
// son propre textarea (`user.type` clique la cible avant de taper).
jest.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <div {...props}>{children}</div>,
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
    (useUser as jest.Mock).mockReturnValue(null);
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

/**
 * #5299 — résidus mesurés par #4692 sur cette même liste.
 *
 * `identifier` et `linkId` (le secret de jointure) ne sont JAMAIS servis par
 * `GET /admin/share-links` (§ commentaire du `select`, `content-share-links.ts`) :
 * un lien sans `name` n'affichait plus rien du tout (point 3), et les actions
 * « Copier »/« Ouvrir », construites sur `shareLink.linkId`, copiaient/ouvraient
 * la chaîne littérale `"undefined"` sur CHAQUE ligne (point 4 — le type client
 * déclarait `linkId: string` alors que la passerelle ne le sert jamais ici).
 */
describe('Console d’administration — résidus de libellé et de type (#5299)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useUser as jest.Mock).mockReturnValue(null);
  });

  it('replie le libellé sur l’id de la ligne quand name/identifier/linkId sont tous absents', async () => {
    (adminService.getShareLinks as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        success: true,
        data: [{ ...shareLinkRow(), name: undefined }],
        pagination: { total: 1, limit: 20, offset: 0, hasMore: false },
      },
    });

    render(<AdminShareLinksPage />);

    await screen.findByText(LINK_ROW_ID);
  });

  // #5430 a remplacé la garde `shareLink.linkId &&` par une garde de RÔLE — un
  // admin non-BIGBOSS ne verrait de toute façon que des 403 sur le geste
  // souverain qui les rendrait utiles (§ « un contrôle voué au 403 ne se
  // propose pas »). Ce témoin reste vrai sous la nouvelle garde ; voir la
  // suite « #5430 » ci-dessous pour le cas BIGBOSS.
  it('ne rend ni « Copier » ni « Ouvrir » à un admin non-BIGBOSS', async () => {
    (adminService.getShareLinks as jest.Mock).mockResolvedValue(listResponse());

    render(<AdminShareLinksPage />);

    await screen.findByText('Public onboarding link');
    expect(screen.queryByText('Copy')).not.toBeInTheDocument();
    expect(screen.queryAllByText('Open')).toHaveLength(0);
  });
});

/**
 * #5430 — « Copier » et « Ouvrir » sont morts depuis #4157 : ils manipulaient
 * `shareLink.linkId`, qu'aucune liste ne sert plus (#5299/#4692). Décision
 * produit (issue, § « Critère de fin », option a) : l'admin RÉVÈLE l'URL
 * complète via le geste souverain déjà existant, audité,
 * `POST /admin/share-links/:id/reveal` — rang BIGBOSS seul
 * (`requireSovereign()`, `content-share-links.ts`), motif écrit ≥ 10
 * caractères.
 *
 * Conséquence directe (§ « un contrôle voué au 403 ne se propose pas ») :
 * les deux contrôles se gardent sur le RÔLE (`currentUser?.role ===
 * 'BIGBOSS'`), jamais sur `shareLink.linkId` — sans quoi ils resteraient
 * morts pour tout le monde, `linkId` n'étant jamais servi par la liste.
 *
 * Les témoins portent sur l'EFFET de bout en bout : le geste ouvre une
 * demande de motif, le motif court désactive la confirmation, la confirmation
 * appelle l'endpoint de révélation avec la RAISON, et c'est la valeur RÉVÉLÉE
 * (jamais `undefined`) qui est copiée / ouverte.
 */
describe('Console d’administration — révéler un lien pour Copier/Ouvrir (#5430)', () => {
  const REVEALED_LINK_ID = 'mshy_abc123';

  beforeEach(() => {
    jest.clearAllMocks();
    (adminService.getShareLinks as jest.Mock).mockResolvedValue(listResponse());
    (apiService.post as jest.Mock).mockResolvedValue({
      success: true,
      data: { success: true, data: { id: LINK_ROW_ID, linkId: REVEALED_LINK_ID, identifier: 'onboarding' } },
    });
  });

  it('ne propose « Copier »/« Ouvrir » à AUCUN admin non-BIGBOSS, même ADMIN', async () => {
    (useUser as jest.Mock).mockReturnValue({ id: 'u9', role: 'ADMIN' });

    render(<AdminShareLinksPage />);

    await screen.findByText('Public onboarding link');
    expect(screen.queryByText('Copy')).not.toBeInTheDocument();
    expect(screen.queryAllByText('Open')).toHaveLength(0);
  });

  it('propose « Copier » et « Ouvrir » à un BIGBOSS malgré `linkId` absent de la liste', async () => {
    (useUser as jest.Mock).mockReturnValue({ id: 'u1', role: 'BIGBOSS' });

    render(<AdminShareLinksPage />);

    await screen.findByText('Public onboarding link');
    expect(screen.getAllByText('Copy').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Open').length).toBeGreaterThan(0);
  });

  it('n’émet AUCUN appel de révélation tant que le motif n’est pas confirmé', async () => {
    (useUser as jest.Mock).mockReturnValue({ id: 'u1', role: 'BIGBOSS' });
    const user = userEvent.setup();
    render(<AdminShareLinksPage />);

    await user.click((await screen.findAllByText('Copy'))[0]);

    expect(await screen.findByText('Reason required')).toBeInTheDocument();
    expect(apiService.post).not.toHaveBeenCalled();
  });

  it('désactive la confirmation tant que le motif fait moins de 10 caractères', async () => {
    (useUser as jest.Mock).mockReturnValue({ id: 'u1', role: 'BIGBOSS' });
    const user = userEvent.setup();
    render(<AdminShareLinksPage />);

    await user.click((await screen.findAllByText('Copy'))[0]);
    const textarea = await screen.findByPlaceholderText('Reason for this reveal...');
    await user.type(textarea, 'trop bref');

    const confirm = screen.getByText('Reveal');
    expect(confirm).toBeDisabled();
    expect(apiService.post).not.toHaveBeenCalled();
  });

  it('« Copier » révèle puis copie la valeur RÉVÉLÉE (jamais `undefined`)', async () => {
    (useUser as jest.Mock).mockReturnValue({ id: 'u1', role: 'BIGBOSS' });
    const { copyToClipboard } = jest.requireMock('@/lib/clipboard') as { copyToClipboard: jest.Mock };
    const user = userEvent.setup();
    render(<AdminShareLinksPage />);

    await user.click((await screen.findAllByText('Copy'))[0]);
    const textarea = await screen.findByPlaceholderText('Reason for this reveal...');
    await user.type(textarea, 'audit de routine');
    await user.click(screen.getByText('Reveal'));

    await waitFor(() => expect(apiService.post).toHaveBeenCalledTimes(1));
    expect(apiService.post).toHaveBeenCalledWith(
      API_ENDPOINTS.admin.shareLinksByIdReveal(LINK_ROW_ID),
      { reason: 'audit de routine' }
    );
    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith(REVEALED_LINK_ID));
  });

  it('« Ouvrir » révèle puis ouvre l’URL trackée avec la valeur RÉVÉLÉE', async () => {
    (useUser as jest.Mock).mockReturnValue({ id: 'u1', role: 'BIGBOSS' });
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup();
    render(<AdminShareLinksPage />);

    await user.click((await screen.findAllByText('Open'))[0]);
    const textarea = await screen.findByPlaceholderText('Reason for this reveal...');
    await user.type(textarea, 'audit de routine');
    await user.click(screen.getByText('Reveal'));

    await waitFor(() => expect(apiService.post).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(`/tracked/${REVEALED_LINK_ID}`, '_blank', 'noopener,noreferrer')
    );

    openSpy.mockRestore();
  });

  it('n’ANNONCE PAS un succès quand la révélation souveraine est refusée', async () => {
    (useUser as jest.Mock).mockReturnValue({ id: 'u1', role: 'BIGBOSS' });
    (apiService.post as jest.Mock).mockRejectedValue(new Error('403'));
    const { copyToClipboard } = jest.requireMock('@/lib/clipboard') as { copyToClipboard: jest.Mock };
    const user = userEvent.setup();
    render(<AdminShareLinksPage />);

    await user.click((await screen.findAllByText('Copy'))[0]);
    const textarea = await screen.findByPlaceholderText('Reason for this reveal...');
    await user.type(textarea, 'audit de routine');
    await user.click(screen.getByText('Reveal'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not reveal the share link'));
    expect(copyToClipboard).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
