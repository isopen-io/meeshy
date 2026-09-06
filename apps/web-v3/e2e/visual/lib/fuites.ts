/**
 * LE VERDICT DE FUITE DU NAVIGATEUR DE ZONE (#5106, § 12.11.3 points 4 et 6) —
 * la promesse de l'étage 3 (« aucune fuite de listener ni de socket, mesuré
 * sur 20 navigations ») est ÉCRITE dans les doc-comments de
 * `lib/realtime/lifecycle.ts` et `navigateur.ts` depuis leur livraison ; elle
 * n'était mesurée nulle part. Ce module est l'INSTRUMENT qui la mesure — le
 * même patron que `lifecycle.ts` (§ 8.5) : la LOI vit ici, gagée sans
 * navigateur par `__tests__/fuites-gate.test.ts` ; `v3-navigateur-fuites.spec.ts`
 * n'est que la main qui l'applique à un vrai navigateur.
 *
 * CE MODULE N'EST PAS `lib/realtime/lifecycle.ts` NI `lib/realtime/
 * navigateur.ts`. Ceux-là POSENT et RETIRENT les écouteurs de l'application ;
 * celui-ci ne s'abonne à rien — il COMPTE, depuis l'extérieur, ce qu'un
 * script d'initialisation de page a observé.
 */

/** Le § 12.11.3 point 4 : « la mesure sur 20 navigations ». Opposé, jamais recopié en littéral. */
export const NAVIGATIONS = 20;

/**
 * 20 navigations = 10 allers-retours `/chats → fil → /chats` = 10 relevés
 * (un par retour sur `/chats`, § 9 Q4 de la spécification). Une série plus
 * courte ne prouve rien — c'est la même leçon que le gate `lifecycle.ts`
 * (§ 8.5) : « refuse de sortir vert sur zéro battement ».
 */
export const ALLERS_RETOURS = Math.floor(NAVIGATIONS / 2);

/**
 * Le plancher de non-vacuité EST le nombre d'allers-retours — un site UNIQUE
 * pour une seule arithmétique : le spec boucle `ALLERS_RETOURS` fois et pousse
 * un relevé par tour, donc une série plus courte que ce plancher dit qu'une
 * partie de la boucle n'a pas eu lieu. Recopier `Math.floor(NAVIGATIONS / 2)`
 * dans le spec en ferait une JUMELLE : baisser la boucle sans baisser le
 * plancher est précisément ce que cette garde doit attraper.
 */
const PLANCHER_DE_RELEVES = ALLERS_RETOURS;

/**
 * Un relevé pris à un retour sur `/chats` — après le premier aller-retour,
 * régime permanent établi (§ 9 Q4) : le premier relevé sert de BASELINE, pas
 * l'état du chargement initial.
 */
export type Releve = {
  /**
   * Écouteurs `window`/`document` actifs (hors `{ once }`) — `SOURCE_DU_COMPTEUR`.
   * Une valeur < 1 signale un compteur ABSENT, jamais une page sans écouteur :
   * le verdict la REFUSE (anti-inertie du compteur).
   */
  readonly ecouteurs: number;
  /**
   * `BroadcastChannel` ouverts et non fermés — `SOURCE_DU_COMPTEUR`. Zéro est
   * LÉGITIME (un écran sans canal) ; une valeur négative signale un compteur
   * absent et le verdict la refuse.
   */
  readonly canaux: number;
  /** Connexions socket.io vivantes, lues côté serveur (`BouchonSocket.connectes()` ou l'équivalent réel). */
  readonly socketsOuvertes: number;
};

export type Verdict = { readonly vert: true } | { readonly vert: false; readonly raison: string };

/**
 * Le verdict, sur l'INVARIANT — jamais sur un total d'implémentation. Un
 * socket qui ferme puis rouvre à chaque bascule (le comportement mesuré
 * aujourd'hui, § 1.2 point 4 de la spécification) reste vert ici ; le jour où
 * les deux écrans partageront un socket authentifié, ces mêmes assertions
 * resteront vertes (§ 9 Q1 de la spécification) — jamais un total de
 * connexions pinné, qui rougirait ce jour-là pour de mauvaises raisons.
 */
export const verdictDeFuite = (serie: readonly Releve[]): Verdict => {
  if (serie.length < PLANCHER_DE_RELEVES) {
    return {
      vert: false,
      raison: `vacuité — ${serie.length} relevé(s) pour un plancher de ${PLANCHER_DE_RELEVES} (${NAVIGATIONS} navigations = ${PLANCHER_DE_RELEVES} allers-retours)`,
    };
  }

  // ANTI-INERTIE DU COMPTEUR (revue 2026-09-06) — le premier trou du témoin, et
  // le plus silencieux : `compteEcouteurs`/`compteCanaux` du spec poussent `-1`
  // quand `window.__fuites` est ABSENT (script d'initialisation non installé,
  // injecté APRÈS `newPage`, ou périmètre du `addInitScript` perdu à un
  // changement de contexte). Une série de `-1` est PLATE : `dernier > premier`
  // est faux partout, et la moitié « listeners » du critère de fin sortait VERTE
  // sans avoir rien mesuré. MESURÉ avant correctif : dix relevés à
  // `{ ecouteurs: -1, canaux: -1, socketsOuvertes: 1 }` rendaient `{ vert: true }`.
  //
  // Le plancher est 1, jamais 0 : tout écran instrumenté de la zone pose au
  // moins les sept écouteurs `window`/`document` d'`observeCycleDeVie`
  // (`lib/realtime/lifecycle.ts`, `visibilitychange`/`pageshow`/`pagehide`/
  // `online`/`offline`/`storage`/`meeshy:zone-depart`) plus le `click` délégué
  // et le `popstate` du navigateur de zone. Un relevé à 0 dit que le compteur
  // n'a rien vu, jamais qu'une page ne fuit pas.
  const relevesSansCompteur = serie.filter((releve) => releve.ecouteurs < 1);
  if (relevesSansCompteur.length > 0) {
    return {
      vert: false,
      raison: `inertie du compteur — ${relevesSansCompteur.length} relevé(s) à moins d'UN écouteur window/document : \`window.__fuites\` n'a rien observé, le témoin ne mesure rien`,
    };
  }
  const relevesSansCanaux = serie.filter((releve) => releve.canaux < 0);
  if (relevesSansCanaux.length > 0) {
    return {
      vert: false,
      raison: `inertie du compteur — ${relevesSansCanaux.length} relevé(s) à un compte de canaux NÉGATIF : \`window.__fuites\` n'a rien observé`,
    };
  }

  // ANTI-INERTIE : une page qui ne se connecte JAMAIS ne sort pas verte —
  // la même leçon que le gate `lifecycle.ts`, appliquée à la socket plutôt
  // qu'au battement.
  const relevesSansSocket = serie.filter((releve) => releve.socketsOuvertes === 0);
  if (relevesSansSocket.length > 0) {
    return {
      vert: false,
      raison: `inertie — ${relevesSansSocket.length} relevé(s) sans AUCUNE socket ouverte : le témoin ne mesure rien`,
    };
  }

  const premier = serie[0];
  const dernier = serie[serie.length - 1];
  // Impossible en pratique : le plancher ci-dessus garantit `serie.length >= 1`.
  // `noUncheckedIndexedAccess` l'ignore — la garde satisfait le compilateur
  // sans jamais pouvoir se déclencher pour de vrai.
  if (premier === undefined || dernier === undefined) {
    return { vert: false, raison: 'série vide — impossible sous le plancher ci-dessus' };
  }

  if (dernier.ecouteurs > premier.ecouteurs) {
    return {
      vert: false,
      raison: `fuite d'écouteurs — ${premier.ecouteurs} au premier relevé, ${dernier.ecouteurs} au dernier (${serie.length} relevés)`,
    };
  }

  if (dernier.canaux > premier.canaux) {
    return {
      vert: false,
      raison: `fuite de canaux BroadcastChannel — ${premier.canaux} au premier relevé, ${dernier.canaux} au dernier`,
    };
  }

  if (dernier.socketsOuvertes !== 1) {
    return {
      vert: false,
      raison: `UNE seule connexion doit survivre — ${dernier.socketsOuvertes} constatée(s) au dernier relevé`,
    };
  }

  return { vert: true };
};

/**
 * LE SCRIPT D'INITIALISATION — injecté par `context.addInitScript(SOURCE_DU_COMPTEUR)`
 * AVANT tout script de la page, donc avant que `navigateur.ts`, `lifecycle.ts`
 * ou le module de participation ne posent leur premier écouteur.
 *
 * PÉRIMÈTRE (§ 9 Q3 de la spécification) : `window` et `document` UNIQUEMENT.
 * Les écouteurs posés sur un élément DU DOCUMENT (une ligne de la liste, un
 * `<dialog>`, `ctx.p.liste`) meurent avec le swap de `<main>` que le
 * navigateur de zone opère à chaque traversée — les compter rendrait le
 * témoin dépendant du DOM de CHAQUE écran, sans attraper une fuite de PLUS :
 * un écouteur d'élément qui survivrait à son élément survivrait au swap tout
 * autant qu'un écouteur qu'on n'aurait pas compté ici, puisque l'élément
 * lui-même a été détaché. `{ once: true }` est exclu pour la raison inverse :
 * un tel écouteur se retire tout seul à son déclenchement, SANS jamais
 * appeler `removeEventListener` — le compter grossirait le total à chaque
 * pose, jamais à son retrait, ce qu'aucune navigation ne corrigerait.
 *
 * La CLÉ d'un écouteur est (cible, type, capture, identité du listener) — la
 * même clé que `addEventListener`/`removeEventListener` utilisent pour
 * dédupliquer : poser deux fois le MÊME triplet ne compte qu'UNE fois, comme
 * le ferait le navigateur lui-même.
 *
 * Expose `window.__fuites = { ecouteurs(): number, canaux(): number }`, lu
 * par `page.evaluate` dans le spec.
 */
export const SOURCE_DU_COMPTEUR = `(() => {
  if (window.__fuites) return;

  const cibleSuivie = (cible) => cible === window || cible === document;

  const normaliseCapture = (options) => {
    if (typeof options === 'boolean') return options;
    if (options && typeof options === 'object') return options.capture === true;
    return false;
  };

  const estUneFois = (options) =>
    typeof options === 'object' && options !== null && options.once === true;

  const AJOUT_ORIGINAL = EventTarget.prototype.addEventListener;
  const RETRAIT_ORIGINAL = EventTarget.prototype.removeEventListener;
  const parCible = new WeakMap();
  let totalEcouteurs = 0;

  EventTarget.prototype.addEventListener = function (type, ecouteur, options) {
    if (cibleSuivie(this) && ecouteur != null && !estUneFois(options)) {
      const cle = type + '|' + normaliseCapture(options);
      let parType = parCible.get(this);
      if (!parType) {
        parType = new Map();
        parCible.set(this, parType);
      }
      let ensemble = parType.get(cle);
      if (!ensemble) {
        ensemble = new Set();
        parType.set(cle, ensemble);
      }
      if (!ensemble.has(ecouteur)) {
        ensemble.add(ecouteur);
        totalEcouteurs += 1;
      }
    }
    return AJOUT_ORIGINAL.call(this, type, ecouteur, options);
  };

  EventTarget.prototype.removeEventListener = function (type, ecouteur, options) {
    if (cibleSuivie(this) && ecouteur != null) {
      const cle = type + '|' + normaliseCapture(options);
      const parType = parCible.get(this);
      const ensemble = parType ? parType.get(cle) : undefined;
      if (ensemble && ensemble.has(ecouteur)) {
        ensemble.delete(ecouteur);
        totalEcouteurs -= 1;
      }
    }
    return RETRAIT_ORIGINAL.call(this, type, ecouteur, options);
  };

  const canauxOuverts = new Set();
  const CanalOriginal = window.BroadcastChannel;
  if (typeof CanalOriginal === 'function') {
    window.BroadcastChannel = function (nom) {
      const instance = new CanalOriginal(nom);
      canauxOuverts.add(instance);
      const fermetureOriginale = instance.close.bind(instance);
      instance.close = function () {
        canauxOuverts.delete(instance);
        return fermetureOriginale();
      };
      return instance;
    };
    window.BroadcastChannel.prototype = CanalOriginal.prototype;
  }

  window.__fuites = {
    ecouteurs: () => totalEcouteurs,
    canaux: () => canauxOuverts.size,
  };
})();`;
