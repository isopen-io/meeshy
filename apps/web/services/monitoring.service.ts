import { logger } from '@/utils/logger';
import { apiService } from './api.service';

/**
 * Le service que lit l'onglet de supervision de l'administration.
 *
 * ## Ce qui a changé, et pourquoi (#4219)
 *
 * Trois de ces appels — `/health/ready`, `/health/metrics`,
 * `/health/circuit-breakers` — visaient des adresses qui n'existaient NULLE
 * PART dans le gateway. Les sept autres visaient des routes réelles, et c'est
 * ce contraste qui rendait le défaut invisible à la lecture : le fichier avait
 * l'air cohérent. Les trois sondes sont désormais SERVIES
 * (`services/gateway/src/routes/health/`).
 *
 * Mais l'adresse n'était que la moitié du défaut. L'autre moitié est ici : les
 * trois fonctions LEVAIENT, et l'écran les rattrapait dans un `allSettled`
 * suivi d'un `if (status === 'fulfilled' && value?.data)`. Un échec y prend
 * exactement la même forme qu'une absence de données — l'écran se rendait
 * VIDE plutôt que CASSÉ, et c'est ce qui a caché trois routes manquantes
 * pendant toute la vie du fichier.
 *
 * D'où le type `Sonde<T>` : une sonde ne lève plus, elle REND son échec. Un
 * appelant ne peut plus confondre « rien à montrer » et « l'appel a échoué »,
 * parce que l'absence de données n'est plus représentable par la même valeur
 * que l'échec. La discipline est portée par le TYPE, pas par la vigilance du
 * lecteur.
 *
 * Les sept appels d'analyse (`/admin/analytics/*`) gardent leur contrat
 * historique (ils lèvent) : leur convertir la forme est un lot distinct, qui
 * touche les trois onglets et n'appartient pas à cette issue.
 */

/** Une sonde a réussi, et porte sa valeur. */
export type SondeOk<T> = { readonly etat: 'ok'; readonly valeur: T };

/**
 * Une sonde a échoué, et porte de quoi le DIRE. `raison` est un texte
 * technique destiné à un écran d'administration — pas un message traduit :
 * qui lit cette page veut le code HTTP ou le texte du transport, pas une
 * périphrase.
 */
export type SondeEchec = { readonly etat: 'echec'; readonly raison: string };

export type Sonde<T> = SondeOk<T> | SondeEchec;

/** Le verdict de la sonde S0 — son corps ENTIER, l'orchestrateur n'en lit pas plus. */
export type Disponibilite = { readonly status: 'ready' | 'not-ready' };

export type EtatDependance = {
  readonly status: 'up' | 'down';
  readonly latencyMs: number | null;
};

export type MetriquesProcessus = {
  readonly uptimeSeconds: number;
  readonly memory: { readonly heapUsed: number; readonly heapTotal: number; readonly rss: number };
  readonly database: EtatDependance;
  readonly redis: EtatDependance;
  readonly socketConnections: number;
};

export type Disjoncteur = {
  readonly name: string;
  readonly state: string;
  readonly failures: number;
  readonly successes: number;
  readonly totalRequests: number;
  readonly lastFailure: string | null;
};

// ─── Lecture d'une charge inconnue ──────────────────────────────────────────
// Le gateway a un contrat, mais un client qui LIT ne se protège pas avec le
// contrat de l'émetteur : il se protège avec ce qu'il fait d'une charge qui ne
// le respecte pas. Ces lecteurs rendent une valeur par défaut plutôt que de
// lever — une charge malformée doit dégrader un chiffre, jamais casser l'écran
// entier (c'est le même défaut, un cran plus bas, que celui qu'on corrige).

const champ = (source: unknown, cle: string): unknown =>
  typeof source === 'object' && source !== null ? (source as Record<string, unknown>)[cle] : undefined;

const nombre = (valeur: unknown, defaut = 0): number =>
  typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : defaut;

const nombreOuNul = (valeur: unknown): number | null =>
  typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : null;

const texte = (valeur: unknown, defaut: string): string =>
  typeof valeur === 'string' && valeur.length > 0 ? valeur : defaut;

const dependance = (source: unknown): EtatDependance => ({
  status: champ(source, 'status') === 'up' ? 'up' : 'down',
  latencyMs: nombreOuNul(champ(source, 'latencyMs')),
});

const raisonDe = (error: unknown): string =>
  error instanceof Error && error.message.length > 0 ? error.message : 'Erreur inconnue';

/**
 * DEUX enveloppes s'empilent sur ce chemin, et la lecture juste est
 * `response.data.data` :
 *
 * 1. la passerelle sert `{ success, data: <charge> }` (`sendSuccess`) ;
 * 2. `apiService.request` enveloppe le corps ENTIER dans `.data` et rend
 *    `{ success, data: <corps>, message }`.
 *
 * C'est le piège documenté pour les listes paginées (`services/paginated-list.ts`,
 * quatre pages d'administration tombées dessus), et il ne s'arrête pas aux
 * listes. Il est d'autant plus traître ici qu'un `apiService` MOQUÉ verrouille
 * la mauvaise forme aussi bien que la bonne : un test dont la fabrique rend
 * `{ data: charge }` passe au vert sur un code qui lit une enveloppe.
 * `__tests__/services/monitoring-envelope.test.ts` mesure donc les deux
 * enveloppes à travers le VRAI `apiService`, un `fetch` stubbé pour seule
 * frontière.
 */
const corpsServi = (reponse: unknown): unknown => champ(champ(reponse, 'data'), 'data');

/**
 * Le seul endroit où une sonde attrape. Le journal reste — la page d'admin
 * n'est pas le seul lecteur d'un incident — mais l'erreur ne DISPARAÎT plus
 * dans le journal : elle ressort en valeur.
 */
async function sonder<T>(nom: string, appel: () => Promise<unknown>, lire: (charge: unknown) => T): Promise<Sonde<T>> {
  try {
    const reponse = await appel();
    return { etat: 'ok', valeur: lire(corpsServi(reponse)) };
  } catch (error) {
    logger.error('[Monitoring]', `Sonde ${nom} en échec`, { error });
    return { etat: 'echec', raison: raisonDe(error) };
  }
}

export const monitoringService = {
  async getRealtime() {
    try {
      const response = await apiService.get('/admin/analytics/realtime');
      return response;
    } catch (error) {
      logger.error('[Monitoring]', 'Error fetching realtime data', { error });
      throw error;
    }
  },

  /**
   * S0 côté serveur : la MÊME sonde que celle qu'appelle l'orchestrateur, sans
   * jeton et sans rien apprendre de l'infrastructure. L'écran la lit pour
   * afficher exactement le verdict qui décide de la rotation en production —
   * pas une seconde vérité reconstituée à partir des métriques.
   */
  async getReadiness(): Promise<Sonde<Disponibilite>> {
    return sonder('/health/ready', () => apiService.get('/health/ready'), (charge) => ({
      status: champ(charge, 'status') === 'ready' ? 'ready' : 'not-ready',
    }));
  },

  /** S5 : métriques de PROCESSUS — distinctes de `/admin/analytics/*`, qui porte du produit. */
  async getProcessMetrics(): Promise<Sonde<MetriquesProcessus>> {
    return sonder('/health/metrics', () => apiService.get('/health/metrics'), (charge) => ({
      uptimeSeconds: nombre(champ(charge, 'uptimeSeconds')),
      memory: {
        heapUsed: nombre(champ(champ(charge, 'memory'), 'heapUsed')),
        heapTotal: nombre(champ(champ(charge, 'memory'), 'heapTotal')),
        rss: nombre(champ(champ(charge, 'memory'), 'rss')),
      },
      database: dependance(champ(charge, 'database')),
      redis: dependance(champ(charge, 'redis')),
      socketConnections: nombre(champ(charge, 'socketConnections')),
    }));
  },

  /** S5 : l'état des disjoncteurs, tel que le registre du gateway le tient. */
  async getCircuitBreakers(): Promise<Sonde<readonly Disjoncteur[]>> {
    return sonder('/health/circuit-breakers', () => apiService.get('/health/circuit-breakers'), (charge) => {
      if (!Array.isArray(charge)) return [];
      return charge.map((ligne: unknown, index: number) => ({
        name: texte(champ(ligne, 'name'), `Service ${index + 1}`),
        state: texte(champ(ligne, 'state'), 'unknown'),
        failures: nombre(champ(ligne, 'failures')),
        successes: nombre(champ(ligne, 'successes')),
        totalRequests: nombre(champ(ligne, 'totalRequests')),
        lastFailure: typeof champ(ligne, 'lastFailure') === 'string' ? (champ(ligne, 'lastFailure') as string) : null,
      }));
    });
  },

  async getKpis(period: '7d' | '30d' | '90d' = '7d') {
    try {
      const response = await apiService.get('/admin/analytics/kpis', { period });
      return response;
    } catch (error) {
      logger.error('[Monitoring]', 'Error fetching KPIs', { error });
      throw error;
    }
  },
  async getVolumeTimeline() {
    try {
      const response = await apiService.get('/admin/analytics/volume-timeline');
      return response;
    } catch (error) {
      logger.error('[Monitoring]', 'Error fetching volume timeline', { error });
      throw error;
    }
  },
  async getLanguageDistribution() {
    try {
      const response = await apiService.get('/admin/analytics/language-distribution');
      return response;
    } catch (error) {
      logger.error('[Monitoring]', 'Error fetching language distribution', { error });
      throw error;
    }
  },
  async getUserDistribution() {
    try {
      const response = await apiService.get('/admin/analytics/user-distribution');
      return response;
    } catch (error) {
      logger.error('[Monitoring]', 'Error fetching user distribution', { error });
      throw error;
    }
  },
  async getHourlyActivity() {
    try {
      const response = await apiService.get('/admin/analytics/hourly-activity');
      return response;
    } catch (error) {
      logger.error('[Monitoring]', 'Error fetching hourly activity', { error });
      throw error;
    }
  },
  async getMessageTypes(period: '24h' | '7d' | '30d' = '7d') {
    try {
      const response = await apiService.get('/admin/analytics/message-types', { period });
      return response;
    } catch (error) {
      logger.error('[Monitoring]', 'Error fetching message types', { error });
      throw error;
    }
  },
};
