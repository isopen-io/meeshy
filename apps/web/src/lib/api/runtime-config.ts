/**
 * **LA CONFIGURATION DU DÉPLOIEMENT, LUE COMME UNE DONNÉE** (#18988).
 *
 * L'entrypoint du conteneur (`docker/runtime-config.sh`, #10208) écrit
 * `/config.json` depuis `MEESHY_API_URL` / `MEESHY_WEB_URL`. L'application la
 * lit ici et la DÉCODE : ce qu'elle porte ne peut plus rien exécuter, et ce
 * qui n'a pas sa forme est ignoré.
 *
 * Elle était un script CLASSIQUE et bloquant (`<script src="/config.js">`),
 * servi par le service worker depuis un seau que tout script de l'origine
 * peut réécrire. Mesuré dans Chromium (contre-analyse du 2026-11-17, WEBX-01) :
 * une seule exécution de code y déposait un `/config.js` piégé, qui
 * s'exécutait ensuite dans la PAGE à chaque chargement, détournait toute l'API
 * — socket et annuaire de clés compris — et se réécrivait après chaque
 * revalidation. Corriger la faille d'origine ne l'effaçait pas.
 *
 * Deux règles tiennent la donnée hors d'atteinte d'un tel script :
 *  - aucun seau du service worker ne la garde (`vite/pwa.ts` n'a plus de
 *    route pour elle, `public/sw-retired-caches.js` purge l'ancien seau) :
 *    c'est le cache HTTP du navigateur, que nginx règle et qu'aucun script
 *    n'écrit, qui la rend instantanée au démarrage suivant ;
 *  - toute panne — réseau coupé, 404, JSON illisible — vaut « rien de
 *    déclaré » : la passerelle se déduit alors de l'hôte de la page
 *    (`resolveApiConfig`), exactement comme avant #10208.
 *
 * POURQUOI UNE LECTURE SYNCHRONE. `apiConfig` est lu à l'ÉVALUATION des
 * modules (le transport HTTP se construit à l'import, `client.ts`) ; c'est ce
 * qui faisait de `config.js` un script bloquant. Une attente de module
 * (`await` au niveau du module) rend asynchrones tous les modules qui en
 * dépendent, et la construction découpait alors le socle : mesuré, la
 * première peinture passait de 98,5 Ko en 24 requêtes à 120,3 Ko en 72. La
 * lecture synchrone garde le graphe intact et coûte ce que coûtait le script
 * bloquant ; le `prefetch` que pose la construction la fait partir en
 * parallèle du bundle (un `preload` ne sert pas une requête synchrone :
 * Chromium le refuse et le dit — mesuré, le `prefetch` est repris, une
 * seule requête et aucun avertissement).
 *
 * Pas de Zod ici, et c'est délibéré : ce module est dans la PREMIÈRE PEINTURE,
 * où le chunk `zod` (~19 Ko) n'entre pas (`budgets.json › first_paint`). Le
 * décodeur ne garde que deux chaînes ; leur GRAMMAIRE d'origine est jugée par
 * `resolveApiConfig`, le même filtre que l'entrypoint (`is_origin`).
 */
import type { RuntimeConfig } from './config';

export const RUNTIME_CONFIG_PATH = '/config.json';

/** La part de `XMLHttpRequest` que la lecture emploie — un témoin la remplace. */
export type RuntimeConfigRequest = {
  readonly open: (method: 'GET', url: string, async: false) => void;
  readonly send: () => void;
  readonly status: number;
  readonly responseText: string;
};

const isRecord = (raw: unknown): raw is Readonly<Record<string, unknown>> => typeof raw === 'object' && raw !== null && !Array.isArray(raw);

const stringField = <K extends keyof RuntimeConfig>(source: Readonly<Record<string, unknown>>, key: K): Partial<Record<K, string>> => {
  const value = source[key];
  return typeof value === 'string' ? ({ [key]: value } as Partial<Record<K, string>>) : {};
};

export function decodeRuntimeConfig(raw: unknown): RuntimeConfig {
  if (!isRecord(raw)) return {};
  return { ...stringField(raw, 'apiUrl'), ...stringField(raw, 'webUrl') };
}

export function readRuntimeConfig(request: () => RuntimeConfigRequest): RuntimeConfig {
  try {
    const xhr = request();
    xhr.open('GET', RUNTIME_CONFIG_PATH, false);
    xhr.send();
    return xhr.status === 200 ? decodeRuntimeConfig(JSON.parse(xhr.responseText)) : {};
  } catch {
    return {};
  }
}

/**
 * LE PRÉCHARGEMENT que pose la construction du web nu (`vite.config.ts`) : la
 * configuration part dès le document, EN PARALLÈLE du bundle, au lieu
 * d'attendre que `config.ts` s'évalue — la lecture synchrone reprend alors la
 * réponse (ou l'attend) au lieu de payer son propre aller-retour sur le
 * chemin critique d'un démarrage à froid.
 */
export function withRuntimeConfigPrefetch(html: string): string {
  return html.replace('</head>', `<link rel="prefetch" href="${RUNTIME_CONFIG_PATH}" /></head>`);
}
