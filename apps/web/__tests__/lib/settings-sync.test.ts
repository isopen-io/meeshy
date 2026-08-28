/**
 * `settings-sync` porte DEUX des trois routes par lesquelles un changement de
 * préférence user-level est annoncé à l'onglet courant :
 *
 * - `handleSyncMessage` — l'annonce venue d'un AUTRE onglet ;
 * - `broadcastPreferenceUpdate` — celle de l'onglet COURANT, appelée par
 *   `usePreferences` à chaque écriture réussie. `BroadcastChannel` ne se
 *   délivre jamais à l'émetteur : sans cet appel, l'écran de réglages
 *   changeait le serveur et les autres onglets, et laissait le double du
 *   sien périmé.
 *
 * Les deux doivent invalider la clé React Query ET relire le double Zustand que
 * les bulles rendent.
 */

const refreshMirroredPreferenceCategory = jest.fn();

jest.mock('@/lib/preferences/mirrored-preference-categories', () => ({
  refreshMirroredPreferenceCategory: (category: string) =>
    refreshMirroredPreferenceCategory(category),
}));

type Listener = ((event: { data: unknown }) => void) | null;

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  onmessage: Listener = null;
  readonly posted: unknown[] = [];
  closed = false;

  constructor(public readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(data: unknown): void {
    this.posted.push(data);
  }

  close(): void {
    this.closed = true;
  }
}

const loadModule = async () => {
  jest.resetModules();
  return import('@/lib/settings-sync');
};

const invalidateQueries = jest.fn();
const queryClient = { invalidateQueries } as never;

describe('settings-sync — les deux routes locales d\'une annonce de catégorie', () => {
  beforeEach(() => {
    FakeBroadcastChannel.instances = [];
    refreshMirroredPreferenceCategory.mockClear();
    invalidateQueries.mockClear();
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = FakeBroadcastChannel;
  });

  afterEach(() => {
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
  });

  it("relit le double quand un AUTRE onglet annonce la catégorie", async () => {
    const { initSettingsSync } = await loadModule();
    initSettingsSync(queryClient);

    const channel = FakeBroadcastChannel.instances[0];
    channel.onmessage?.({ data: { type: 'preferences-updated', category: 'privacy' } });

    expect(refreshMirroredPreferenceCategory).toHaveBeenCalledWith('privacy');
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("ne relit rien quand l'autre onglet annonce l'utilisateur, pas une catégorie", async () => {
    const { initSettingsSync } = await loadModule();
    initSettingsSync(queryClient);

    FakeBroadcastChannel.instances[0].onmessage?.({ data: { type: 'user-updated' } });

    expect(refreshMirroredPreferenceCategory).not.toHaveBeenCalled();
  });

  it("relit le double pour l'écriture de l'onglet COURANT, que le canal ne lui renverra pas", async () => {
    const { broadcastPreferenceUpdate } = await loadModule();

    broadcastPreferenceUpdate('privacy');

    expect(refreshMirroredPreferenceCategory).toHaveBeenCalledWith('privacy');
    expect(FakeBroadcastChannel.instances[0].posted).toEqual([
      { type: 'preferences-updated', category: 'privacy' },
    ]);
  });

  it('relit le double même sans BroadcastChannel dans ce navigateur', async () => {
    // La relecture du double n'est pas un effet de bord de la diffusion
    // inter-onglets : elle est due à l'onglet courant, canal ou pas.
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
    const { broadcastPreferenceUpdate } = await loadModule();

    expect(() => broadcastPreferenceUpdate('privacy')).not.toThrow();
    expect(refreshMirroredPreferenceCategory).toHaveBeenCalledWith('privacy');
  });

  it("n'attend pas `initSettingsSync` pour relire le double de l'onglet courant", async () => {
    // `handleSyncMessage` sort tôt sans `queryClientRef` ; la relecture du
    // double, elle, ne dépend d'aucun client React Query.
    const { broadcastPreferenceUpdate } = await loadModule();

    broadcastPreferenceUpdate('privacy');

    expect(refreshMirroredPreferenceCategory).toHaveBeenCalledTimes(1);
  });
});
