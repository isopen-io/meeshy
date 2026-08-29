/**
 * Le DOUBLE que les surfaces de messagerie lisent doit apprendre ce que
 * l'annonce de catégorie dit.
 *
 * `user-preferences-store` (Zustand) tient un double du bloc `privacy` —
 * `showReadReceipts`, `showLastSeen`, `showOnlineStatus`… — et ce double est
 * celui que les bulles rendent (`DeliveryIndicator`, `FocalRow`,
 * `BubbleMessageNormalView`). L'écran de réglages, lui, écrit par React Query.
 * Sans ce site, les trois annonces d'un changement de catégorie (la diffusion
 * socket d'un autre appareil, le `BroadcastChannel` d'un autre onglet, et le
 * PATCH de l'onglet courant) n'atteignaient QUE le jumeau React Query, que
 * personne ne lit hors de l'écran de réglages.
 */

const syncPrivacy = jest.fn().mockResolvedValue(undefined);
const syncEncryption = jest.fn().mockResolvedValue(undefined);
const syncNotifications = jest.fn().mockResolvedValue(undefined);

jest.mock('@/stores/user-preferences-store', () => ({
  useUserPreferencesStore: {
    getState: () => ({ syncPrivacy, syncEncryption, syncNotifications }),
  },
}));

let writeInFlight = false;

jest.mock('@/lib/preferences/preference-write-lock', () => ({
  isPreferenceWriteInFlight: () => writeInFlight,
}));

import {
  refreshMirroredPreferenceCategory,
  rehydrateMirroredPreferences,
} from '@/lib/preferences/mirrored-preference-categories';

describe('refreshMirroredPreferenceCategory', () => {
  beforeEach(() => {
    syncPrivacy.mockClear().mockResolvedValue(undefined);
    syncEncryption.mockClear().mockResolvedValue(undefined);
    syncNotifications.mockClear();
    writeInFlight = false;
  });

  it('relit le bloc privacy quand la catégorie privacy est annoncée', () => {
    refreshMirroredPreferenceCategory('privacy');

    expect(syncPrivacy).toHaveBeenCalledTimes(1);
  });

  it('relit aussi le bloc encryption, projection du MÊME endpoint privacy', () => {
    // `syncEncryption` lit `/me/preferences/privacy` : les deux blocs sont deux
    // projections d'une seule ligne, donc une annonce `privacy` périme les deux.
    refreshMirroredPreferenceCategory('privacy');

    expect(syncEncryption).toHaveBeenCalledTimes(1);
  });

  it('ne relit rien pour une catégorie dont aucune surface ne lit le double', () => {
    // Les six autres catégories sont lues par React Query, à la demande, par
    // l'écran qui les affiche : leur donner une relecture ici serait une
    // requête de plus pour zéro fraîcheur de plus.
    (['audio', 'video', 'message', 'document', 'application', 'notification'] as const).forEach(
      (category) => refreshMirroredPreferenceCategory(category)
    );

    expect(syncPrivacy).not.toHaveBeenCalled();
    expect(syncEncryption).not.toHaveBeenCalled();
    expect(syncNotifications).not.toHaveBeenCalled();
  });

  it('ignore un nom de catégorie inconnu sans lever', () => {
    // La charge vient du fil : un nom que ce client ne connaît pas ne doit pas
    // faire tomber le gestionnaire d'événement qui l'a routé.
    expect(() => refreshMirroredPreferenceCategory('brand-new-category')).not.toThrow();
    expect(syncPrivacy).not.toHaveBeenCalled();
  });

  it("n'entraîne aucun rejet non capturé quand une relecture échoue", async () => {
    // Un échec de relecture laisse la dernière valeur connue en place — une
    // panne réseau n'est pas la preuve que l'utilisateur a changé d'avis.
    const rejection = new Error('offline');
    syncPrivacy.mockRejectedValue(rejection);
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);

    refreshMirroredPreferenceCategory('privacy');
    await new Promise((resolve) => setTimeout(resolve, 0));

    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('SAUTE la relecture tant qu\'une écriture optimiste est en vol', () => {
    // Le veto vit sur la RELECTURE, pas sur son déclencheur : les deux chemins
    // — l'annonce et le rattrapage de reconnexion — le partagent donc d'un seul
    // site. Sauter laisse la valeur locale, qui est celle que l'utilisateur
    // vient de poser ; relire rendrait l'ancienne et défairait son geste.
    writeInFlight = true;

    refreshMirroredPreferenceCategory('privacy');

    expect(syncPrivacy).not.toHaveBeenCalled();
    expect(syncEncryption).not.toHaveBeenCalled();
  });
});

describe('rehydrateMirroredPreferences', () => {
  beforeEach(() => {
    syncPrivacy.mockClear().mockResolvedValue(undefined);
    syncEncryption.mockClear().mockResolvedValue(undefined);
    syncNotifications.mockClear();
    writeInFlight = false;
  });

  it('relit TOUTES les catégories doublées', () => {
    // Le rattrapage ne sait pas quelle annonce a été manquée pendant la
    // coupure : il relit donc tout ce qui est doublé.
    rehydrateMirroredPreferences();

    expect(syncPrivacy).toHaveBeenCalledTimes(1);
    expect(syncEncryption).toHaveBeenCalledTimes(1);
  });

  it('ne relit rien qui ne soit pas doublé', () => {
    rehydrateMirroredPreferences();

    expect(syncNotifications).not.toHaveBeenCalled();
  });

  it('respecte le MÊME veto que la relecture par annonce', () => {
    writeInFlight = true;

    rehydrateMirroredPreferences();

    expect(syncPrivacy).not.toHaveBeenCalled();
  });
});
