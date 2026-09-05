/**
 * @jest-environment jsdom
 *
 * Témoin de #4497 — `DocumentSettings.tsx` appelait `usePreferences('accessibility')`.
 * `accessibility` n'est pas une catégorie de préférences : les sept réelles sont
 * `application`, `audio`, `document`, `message`, `notification`, `privacy`, `video`
 * (`services/gateway/src/routes/me/preferences/preference-registry.ts`), et
 * `preference-selection.ts` rejette toute catégorie inconnue en 400
 * `UNKNOWN_CATEGORY`. Les dix interrupteurs du panneau appartiennent tous à
 * `document` (chaque clé lue/écrite est un champ booléen de
 * `DocumentPreferenceSchema`, `packages/shared/types/preferences/document.ts`).
 *
 * Chaque assertion de persistance porte sur ce que le SERVEUR REÇOIT
 * (`apiService.patch`) ou sur ce qui est RELU dans le cache React Query après
 * son succès — jamais sur l'état local du composant : le cache optimiste de
 * `usePreferences` (`onMutate`) rend l'interrupteur vert dès le clic, qu'il
 * persiste ou non. Un témoin qui lirait `switch.checked` juste après le clic
 * passerait pour la mauvaise raison, y compris sur l'ancienne catégorie fautive.
 *
 * Pas de témoin de ROLLBACK ici (délibéré) : `updateMutation.onError`
 * (`hooks/use-preferences.ts`) lit son 4e paramètre comme `{previousData}`,
 * alors que la signature réelle de `@tanstack/query-core` 5.101.4 y passe un
 * `MutationFunctionContext` — c'est le 3e paramètre (`onMutateResult`) qui
 * porte `{previousData}`. Mesuré : le rollback ne s'exécute JAMAIS, sur les
 * SEPT catégories, pas seulement `document`. Défaut réel, mais indépendant du
 * nom de catégorie et hors du territoire de #4497 (six autres panneaux
 * partagent le même hook) — signalé au rapport, pas corrigé ici.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DocumentSettings } from '@/components/settings/DocumentSettings';
import { queryKeys } from '@/lib/react-query/query-keys';

const mockGet = jest.fn();
const mockPatch = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
  },
}));

jest.mock('@/lib/settings-sync', () => ({
  broadcastPreferenceUpdate: jest.fn(),
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}));

jest.mock('@/hooks/use-accessibility', () => ({
  useReducedMotion: () => false,
}));

const SERVER_DOCUMENT_PREFERENCES = {
  autoDownloadEnabled: true,
  autoDownloadOnWifi: true,
  autoDownloadMaxSize: 10,
  inlinePreviewEnabled: true,
  previewPdfEnabled: true,
  previewImagesEnabled: true,
  previewVideosEnabled: true,
  storageQuota: 5000,
  autoDeleteOldFiles: false,
  fileRetentionDays: 90,
  compressImagesOnUpload: false,
  imageCompressionQuality: 85,
  allowedFileTypes: ['image/*'],
  scanFilesForMalware: true,
  allowExternalLinks: true,
} as const;

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
}

function renderWithClient(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <DocumentSettings />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue({
    success: true,
    data: { success: true, data: { document: SERVER_DOCUMENT_PREFERENCES } },
  });
});

describe('DocumentSettings — catégorie de préférences (#4497)', () => {
  it("lit ses préférences sous la catégorie 'document', jamais 'accessibility'", async () => {
    renderWithClient(makeQueryClient());

    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    expect(mockGet).toHaveBeenCalledWith('/api/v1/me/preferences', { categories: 'document' });
  });

  it('rend les dix interrupteurs sans erreur — les dix appartiennent à `document`', async () => {
    renderWithClient(makeQueryClient());

    const switches = await screen.findAllByRole('switch');
    expect(switches).toHaveLength(10);
  });

  it("persiste un interrupteur en écrivant sous 'document' — assertion sur ce que le SERVEUR REÇOIT", async () => {
    mockPatch.mockResolvedValue({
      success: true,
      data: {
        success: true,
        data: { document: { ...SERVER_DOCUMENT_PREFERENCES, scanFilesForMalware: false } },
      },
    });

    renderWithClient(makeQueryClient());

    const scanSwitch = await screen.findByLabelText(/analyser les fichiers/i);
    await userEvent.click(scanSwitch);

    await waitFor(() => expect(mockPatch).toHaveBeenCalled());

    // Ce que le serveur reçoit, littéralement : endpoint unifié + corps sous
    // la clé `document` — jamais `accessibility`.
    expect(mockPatch).toHaveBeenCalledWith('/api/v1/me/preferences', {
      document: { scanFilesForMalware: false },
    });
  });

  it("relit la valeur CONFIRMÉE PAR LE SERVEUR après la mutation — pas seulement l'état optimiste local", async () => {
    mockPatch.mockResolvedValue({
      success: true,
      data: {
        success: true,
        data: { document: { ...SERVER_DOCUMENT_PREFERENCES, scanFilesForMalware: false } },
      },
    });

    const queryClient = makeQueryClient();
    renderWithClient(queryClient);

    const scanSwitch = await screen.findByLabelText(/analyser les fichiers/i);
    await userEvent.click(scanSwitch);

    await waitFor(() => expect(mockPatch).toHaveBeenCalled());

    // Ce qui est RELU dans le cache React Query une fois le serveur répondu
    // (`onSuccess` → `setQueryData`), pas une lecture de `switch.checked` —
    // que le seul `onMutate` optimiste suffirait à faire passer.
    await waitFor(() => {
      const cached = queryClient.getQueryData(queryKeys.preferences.category('document')) as
        | { scanFilesForMalware?: boolean }
        | undefined;
      expect(cached?.scanFilesForMalware).toBe(false);
    });
  });

  it("n'écrit jamais sous la clé 'accessibility'", async () => {
    mockPatch.mockResolvedValue({
      success: true,
      data: { success: true, data: { document: SERVER_DOCUMENT_PREFERENCES } },
    });

    renderWithClient(makeQueryClient());

    const scanSwitch = await screen.findByLabelText(/analyser les fichiers/i);
    await userEvent.click(scanSwitch);

    await waitFor(() => expect(mockPatch).toHaveBeenCalled());

    const [, body] = mockPatch.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).not.toHaveProperty('accessibility');
    expect(body).toHaveProperty('document');
  });
});
