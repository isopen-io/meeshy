/**
 * L'onglet santé de la supervision DESSINE l'échec d'une sonde (#4219).
 *
 * Ce que l'absence de cet état coûtait : les trois sondes de santé visaient des
 * adresses qui n'existaient nulle part dans le gateway. Elles levaient à chaque
 * chargement, et l'écran les rattrapait dans un `Promise.allSettled` suivi d'un
 * `if (status === 'fulfilled' && value?.data)`. Un échec y prenait exactement la
 * même forme qu'une absence de données : la carte des disjoncteurs affichait
 * « tous les circuits sont opérationnels » — un cœur VERT — au-dessus d'un appel
 * qui n'avait jamais abouti. L'écran avait l'air vide, pas cassé, et c'est ce
 * qui a permis à trois routes absentes de survivre.
 *
 * Ces témoins mesurent donc la DISCRIMINATION, pas la présence d'un panneau :
 * chacun oppose un cas « rien à montrer » au cas « l'appel a échoué » sur la
 * même surface.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: 'fr',
    currentLanguage: 'fr',
    isLoading: false,
  }),
}));

jest.mock('@/components/admin/AdminLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/services/monitoring.service', () => ({
  monitoringService: {
    getRealtime: jest.fn(),
    getReadiness: jest.fn(),
    getProcessMetrics: jest.fn(),
    getCircuitBreakers: jest.fn(),
    getHourlyActivity: jest.fn(),
    getKpis: jest.fn(),
    getVolumeTimeline: jest.fn(),
    getLanguageDistribution: jest.fn(),
    getUserDistribution: jest.fn(),
    getMessageTypes: jest.fn(),
  },
}));

import MonitoringPage from '@/app/admin/monitoring/page';
import { monitoringService } from '@/services/monitoring.service';

const service = monitoringService as jest.Mocked<typeof monitoringService>;

const METRIQUES_SAINES = {
  etat: 'ok' as const,
  valeur: {
    uptimeSeconds: 100,
    memory: { heapUsed: 40, heapTotal: 100, rss: 200 },
    database: { status: 'up' as const, latencyMs: 12 },
    redis: { status: 'up' as const, latencyMs: 3 },
    socketConnections: 7,
  },
};

function armerSondes(surcharges: Partial<Record<'readiness' | 'metrics' | 'breakers', unknown>> = {}) {
  service.getRealtime.mockResolvedValue({ data: {} } as never);
  service.getHourlyActivity.mockResolvedValue({ data: [] } as never);
  service.getReadiness.mockResolvedValue(
    (surcharges.readiness ?? { etat: 'ok', valeur: { status: 'ready' } }) as never
  );
  service.getProcessMetrics.mockResolvedValue((surcharges.metrics ?? METRIQUES_SAINES) as never);
  service.getCircuitBreakers.mockResolvedValue((surcharges.breakers ?? { etat: 'ok', valeur: [] }) as never);
}

/** Monte la page et bascule sur l'onglet santé — c'est là que vivent les sondes. */
async function ouvrirOngletSante() {
  const utilisateur = userEvent.setup();
  render(<MonitoringPage />);
  await utilisateur.click(await screen.findByRole('tab', { name: /monitoring\.tabs\.health/ }));
  await waitFor(() => expect(service.getCircuitBreakers).toHaveBeenCalled());
  return utilisateur;
}

beforeEach(() => jest.clearAllMocks());

describe('Onglet santé — l\'échec d\'une sonde a son propre dessin', () => {
  it('ne dessine AUCUN panneau d\'erreur quand les trois sondes répondent', async () => {
    armerSondes();
    await ouvrirOngletSante();
    await waitFor(() => expect(screen.getByText('monitoring.health.allCircuitsOk')).toBeInTheDocument());
    expect(screen.queryByTestId('probe-error')).not.toBeInTheDocument();
  });

  it('dessine l\'erreur de la sonde des disjoncteurs À LA PLACE de « tous les circuits sont opérationnels »', async () => {
    // Le cœur du défaut : ces deux situations partageaient un dessin. Le témoin
    // vérifie les DEUX moitiés — le panneau apparaît ET le message rassurant
    // disparaît. Sans la seconde assertion, un correctif qui empile les deux
    // passerait, et l'écran continuerait de dire « tout va bien ».
    armerSondes({ breakers: { etat: 'echec', raison: 'Erreur serveur (404)' } });
    await ouvrirOngletSante();

    await waitFor(() => expect(screen.getByTestId('probe-error')).toBeInTheDocument());
    expect(screen.getByText('Erreur serveur (404)')).toBeInTheDocument();
    expect(screen.queryByText('monitoring.health.allCircuitsOk')).not.toBeInTheDocument();
  });

  it('dessine l\'erreur de la sonde de métriques À LA PLACE des trois cartes', async () => {
    // Une latence de 0 ms et un tas à 0 % ne sont pas « pas de données » : ce
    // sont des chiffres FAUX, et ils avaient l'air d'un service au repos.
    armerSondes({ metrics: { etat: 'echec', raison: 'Erreur serveur (403)' } });
    await ouvrirOngletSante();

    await waitFor(() => expect(screen.getByTestId('probe-error')).toBeInTheDocument());
    expect(screen.getByText('Erreur serveur (403)')).toBeInTheDocument();
    expect(screen.queryByText('monitoring.health.dbTitle')).not.toBeInTheDocument();
    expect(screen.queryByText('monitoring.health.memoryTitle')).not.toBeInTheDocument();
  });

  it('marque la pastille de disponibilité en ROUGE quand la sonde S0 échoue, jamais en vert', async () => {
    // La pastille lit la MÊME sonde que l'orchestrateur. Un échec ne doit pas
    // pouvoir se lire comme « opérationnel » : c'est la forme la plus coûteuse
    // du défaut, un écran cassé qui affirme que tout va bien.
    armerSondes({ readiness: { etat: 'echec', raison: 'Erreur serveur (503)' } });
    await ouvrirOngletSante();

    const pastille = await screen.findByTestId('readiness-badge');
    expect(pastille).toHaveTextContent('monitoring.errorHealth');
    expect(pastille.className).toContain('text-red-600');
  });

  it('dit « erreur » plutôt qu\'« opérationnel » quand la sonde S0 rend « not-ready »', async () => {
    armerSondes({ readiness: { etat: 'ok', valeur: { status: 'not-ready' } } });
    await ouvrirOngletSante();

    const pastille = await screen.findByTestId('readiness-badge');
    expect(pastille).toHaveTextContent('monitoring.health.error');
  });

  it('rejoue les trois sondes quand on actionne le bouton du panneau d\'erreur', async () => {
    // Un état d'erreur sans sortie est une impasse : le panneau porte l'action
    // qui le fait disparaître.
    armerSondes({ breakers: { etat: 'echec', raison: 'Erreur serveur (500)' } });
    const utilisateur = await ouvrirOngletSante();
    await waitFor(() => expect(screen.getByTestId('probe-error')).toBeInTheDocument());

    service.getCircuitBreakers.mockResolvedValue({ etat: 'ok', valeur: [] } as never);
    await utilisateur.click(screen.getByTestId('probe-error').querySelector('button') as HTMLButtonElement);

    await waitFor(() => expect(screen.queryByTestId('probe-error')).not.toBeInTheDocument());
    expect(screen.getByText('monitoring.health.allCircuitsOk')).toBeInTheDocument();
  });

  it('sert la table des disjoncteurs telle que le registre la donne', async () => {
    armerSondes({
      breakers: {
        etat: 'ok',
        valeur: [{ name: 'cacheStore', state: 'OPEN', failures: 3, successes: 0, totalRequests: 9, lastFailure: '2026-08-29T10:00:00.000Z' }],
      },
    });
    await ouvrirOngletSante();

    await waitFor(() => expect(screen.getByText('cacheStore')).toBeInTheDocument());
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.queryByText('monitoring.health.allCircuitsOk')).not.toBeInTheDocument();
  });
});

describe('Onglet temps réel — la vignette des connexions ne ment pas', () => {
  it('retire la vignette et dessine l\'erreur quand la sonde de métriques échoue', async () => {
    // Afficher « 0 connexion » sur une sonde en échec, c'est publier un chiffre
    // faux — indiscernable d'un service désert.
    armerSondes({ metrics: { etat: 'echec', raison: 'Erreur serveur (404)' } });
    render(<MonitoringPage />);

    await waitFor(() => expect(screen.getByTestId('probe-error')).toBeInTheDocument());
    expect(screen.queryByText('monitoring.realtime.socketConnections')).not.toBeInTheDocument();
    expect(screen.getByText('Erreur serveur (404)')).toBeInTheDocument();
  });

  it('dessine la vignette quand la sonde répond', async () => {
    armerSondes();
    render(<MonitoringPage />);

    await waitFor(() => expect(screen.getByText('monitoring.realtime.socketConnections')).toBeInTheDocument());
    expect(screen.queryByTestId('probe-error')).not.toBeInTheDocument();
  });
});
