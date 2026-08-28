/**
 * Le SECOND déclencheur, PÉRENNE, du double que les bulles rendent.
 *
 * Les trois routes du cycle 133 sont toutes ÉPHÉMÈRES : elles exigent que
 * l'onglet soit PRÉSENT pour entendre — un socket vivant ET `useSocketCacheSync`
 * monté (écrans de conversation seulement), un autre onglet du même navigateur,
 * ou le geste fait ici. Un onglet resté ouvert pendant une coupure n'entend
 * rien, et rien ne rejoue l'annonce manquée : le bloc reste périmé
 * indéfiniment (leçon 310).
 *
 * La connexion est ce second déclencheur — mais « pas connecté » ne veut pas
 * dire « décroché » : `connect()` émet un diagnostic `isConnected: false` sur
 * le chemin qui OUVRE la connexion. Un démarrage à froid le verrait donc comme
 * une coupure et paierait une relecture pour zéro fraîcheur.
 */

const onStatusChange = jest.fn();
const unsubscribe = jest.fn();

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    onStatusChange: (cb: (diag: unknown) => void) => onStatusChange(cb),
  },
}));

const rehydrateMirroredPreferences = jest.fn();

jest.mock('@/lib/preferences/mirrored-preference-categories', () => ({
  rehydrateMirroredPreferences: () => rehydrateMirroredPreferences(),
}));

const storeState = {
  isLoading: false,
  lastSyncedAt: null as string | null,
};

jest.mock('@/stores/user-preferences-store', () => ({
  useUserPreferencesStore: {
    getState: () => storeState,
  },
}));

import { startMirroredPreferenceRehydration } from '@/lib/preferences/preference-rehydration';

type StatusListener = (diag: { isConnected: boolean }) => void;

function start(): { emit: StatusListener; stop: () => void } {
  const stop = startMirroredPreferenceRehydration();
  const emit = onStatusChange.mock.calls[0][0] as StatusListener;
  return { emit, stop };
}

/** L'état nominal après un démarrage réussi : la lecture initiale a abouti. */
function hydrated() {
  storeState.isLoading = false;
  storeState.lastSyncedAt = '2026-08-28T10:00:00.000Z';
}

describe('startMirroredPreferenceRehydration', () => {
  beforeEach(() => {
    onStatusChange.mockReset().mockReturnValue(unsubscribe);
    unsubscribe.mockReset();
    rehydrateMirroredPreferences.mockReset();
    storeState.isLoading = false;
    storeState.lastSyncedAt = null;
  });

  it('relit après une connexion qui suit un DÉCROCHAGE', () => {
    hydrated();
    const { emit } = start();

    emit({ isConnected: true });
    emit({ isConnected: false });
    emit({ isConnected: true });

    expect(rehydrateMirroredPreferences).toHaveBeenCalledTimes(1);
  });

  it('ne relit RIEN au démarrage à froid nominal', () => {
    // `connect()` émet `isConnected: false` sur le chemin qui OUVRE la
    // connexion : une première tentative n'est pas un décrochage, et
    // `initialize()` vient de tout lire. Relire ici serait une requête de plus
    // pour zéro fraîcheur de plus.
    hydrated();
    const { emit } = start();

    emit({ isConnected: false });
    emit({ isConnected: true });

    expect(rehydrateMirroredPreferences).not.toHaveBeenCalled();
  });

  it("relit à la première connexion quand AUCUNE passe d'hydratation n'a eu lieu", () => {
    // `initialize()` sort avant de lire quand il n'y a pas de jeton au montage.
    // Un jeton qui arrive ensuite trouve un store qui n'a lu personne : sans
    // cette clause, rien ne le remplirait avant un décrochage, qui peut ne
    // jamais venir.
    storeState.lastSyncedAt = null;
    const { emit } = start();

    emit({ isConnected: false });
    emit({ isConnected: true });

    expect(rehydrateMirroredPreferences).toHaveBeenCalledTimes(1);
  });

  it("ne double PAS une hydratation déjà en vol", () => {
    storeState.isLoading = true;
    storeState.lastSyncedAt = null;
    const { emit } = start();

    emit({ isConnected: true });

    expect(rehydrateMirroredPreferences).not.toHaveBeenCalled();
  });

  it('garde le rattrapage DÛ quand la connexion tombe pendant une hydratation', () => {
    // Un saut motivé par `isLoading` ne consomme pas le décrochage : sinon une
    // coupure survenue pendant le démarrage resterait sans rattrapage.
    hydrated();
    const { emit } = start();
    emit({ isConnected: true });
    emit({ isConnected: false });

    storeState.isLoading = true;
    emit({ isConnected: true });
    expect(rehydrateMirroredPreferences).not.toHaveBeenCalled();

    storeState.isLoading = false;
    emit({ isConnected: true });
    expect(rehydrateMirroredPreferences).toHaveBeenCalledTimes(1);
  });

  it('ne relit pas DEUX fois pour un seul décrochage', () => {
    hydrated();
    const { emit } = start();
    emit({ isConnected: true });
    emit({ isConnected: false });
    emit({ isConnected: true });

    hydrated();
    emit({ isConnected: true });

    expect(rehydrateMirroredPreferences).toHaveBeenCalledTimes(1);
  });

  it('rend la désinscription du socket', () => {
    const { stop } = start();

    stop();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('ignore un diagnostic sans drapeau de connexion', () => {
    hydrated();
    const { emit } = start();

    expect(() => (emit as (d: unknown) => void)(undefined)).not.toThrow();
    expect(rehydrateMirroredPreferences).not.toHaveBeenCalled();
  });
});
