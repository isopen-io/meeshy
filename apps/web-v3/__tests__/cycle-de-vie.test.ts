/**
 * Le cycle de vie de la v3 — issue #4447.
 *
 * `lib/realtime/lifecycle.ts` est le SEUL point d'écoute de
 * `visibilitychange`, `pageshow`/`pagehide{persisted}`, `online`/`offline`,
 * `storage` et du `BroadcastChannel` des invités (conception § 3.3, § 6.2).
 * Ce fichier prouve les sept transitions par leur COMPORTEMENT observable ; la
 * garde de zone (« aucun composant de `app/` ou `components/` n'attache ces
 * écouteurs ») est prouvée, elle, par `zone-cycle-de-vie.test.ts`.
 *
 * Trois assertions portent un gate du § 8.5 plutôt qu'un détail :
 *   — `visibilitychange:hidden` seul ⇒ ZÉRO requête, mutante ou non ;
 *   — un onglet caché ne bat JAMAIS, même quand le réseau revient ;
 *   — deux onglets sur le même lien ⇒ UN seul battement sur 10 minutes.
 *
 * Quatre familles de témoins sont nées de la revue croisée, et chacune garde un
 * défaut que la première livraison ne voyait pas :
 *   — l'élection SANS DÉPARTAGE (deux revendications qui se croisent ⇒ zéro
 *     porteur) : le canal de test sait DIFFÉRER ses livraisons, seule façon de
 *     rejouer l'asynchronie réelle de `BroadcastChannel` ;
 *   — le canal GLOBAL (un onglet du lien B faisait taire le lien A) : deux
 *     préfixes de jeton différents sont montés ensemble ;
 *   — l'état de DÉPART non dessiné (page chargée hors ligne, onglet monté
 *     caché) et le `masquage` avalé par le loquet réseau ;
 *   — la CADENCE remise à zéro à chaque bascule (l'usage mobile ne battait
 *     jamais) : les minuteries avancent À TRAVERS les bascules.
 *
 * `jsdom` n'implémente ni `BroadcastChannel` ni `navigator.sendBeacon` : les
 * deux sont posés ici en doublure, et l'absence du canal est elle-même un cas
 * de test (un navigateur sans canal doit dégrader, pas planter).
 */
import {
  canalDuLien,
  observeCycleDeVie,
  type Balise,
  type OptionsDuCycleDeVie,
  type TransitionDeCycle,
} from '../lib/realtime/lifecycle';

type EvenementDeCanal = { readonly data: unknown };
type EnVol = { readonly expediteur: CanalDeTest; readonly data: unknown };

const canaux = new Set<CanalDeTest>();
const enVol: EnVol[] = [];
let differe = false;

class CanalDeTest {
  public onmessage: ((evenement: EvenementDeCanal) => void) | null = null;

  public constructor(public readonly name: string) {
    canaux.add(this);
  }

  public postMessage(data: unknown): void {
    if (differe) {
      enVol.push({ expediteur: this, data });
      return;
    }
    this.livre(data);
  }

  public livre(data: unknown): void {
    canaux.forEach((autre) => {
      if (autre !== this && autre.name === this.name) autre.onmessage?.({ data });
    });
  }

  public close(): void {
    canaux.delete(this);
  }
}

/**
 * `BroadcastChannel.postMessage` est ASYNCHRONE dans un vrai navigateur : deux
 * onglets qui se revendiquent au même instant se posent chacun porteur AVANT de
 * recevoir la revendication de l'autre. Une livraison synchrone ordonne les
 * revendications par construction et ne peut donc pas voir le défaut. Ici les
 * messages restent EN VOL jusqu'à `livreLesMessagesEnVol()`, qui vide la file
 * jusqu'à ce que plus rien ne circule — rediffusions comprises.
 */
const enVolJusquA = (action: () => void): void => {
  differe = true;
  try {
    action();
  } finally {
    differe = false;
  }
};

const livreLesMessagesEnVol = (): void => {
  for (let tour = 0; enVol.length > 0 && tour < 20; tour += 1) {
    const lot = enVol.splice(0, enVol.length);
    lot.forEach(({ expediteur, data }) => expediteur.livre(data));
  }
};

const poseLeCanal = (): void => {
  Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, value: CanalDeTest });
};

const retireLeCanal = (): void => {
  Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, value: undefined });
};

const visibilite = (etat: DocumentVisibilityState): void => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => etat });
};

const bascule = (etat: DocumentVisibilityState): void => {
  visibilite(etat);
  document.dispatchEvent(new Event('visibilitychange'));
};

const enLigne = (valeur: boolean): void => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => valeur });
};

const transition = (nom: 'pageshow' | 'pagehide', persisted: boolean): void => {
  window.dispatchEvent(new PageTransitionEvent(nom, { persisted }));
};

const reseau = (nom: 'online' | 'offline'): void => {
  window.dispatchEvent(new Event(nom));
};

const stockage = (cle: string | null, valeur: string | null): void => {
  window.dispatchEvent(
    new StorageEvent('storage', { key: cle, newValue: valeur, storageArea: window.localStorage }),
  );
};

const CLE = 'meeshy.guest.LIEN-A';
const AUTRE_CLE = 'meeshy.guest.LIEN-B';

type Observation = { readonly vues: readonly TransitionDeCycle[]; readonly detache: () => void };

const observe = (partiel: Partial<OptionsDuCycleDeVie> = {}): Observation => {
  const vues: TransitionDeCycle[] = [];
  const detache = observeCycleDeVie({
    sur: (vue) => vues.push(vue),
    cleDuJeton: CLE,
    ...partiel,
  });
  return { vues, detache };
};

const requetes = (): { readonly total: () => number } => {
  const fetchStub = jest.fn();
  const beaconStub = jest.fn();
  const sendStub = jest.fn();
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchStub });
  Object.defineProperty(window.navigator, 'sendBeacon', { configurable: true, value: beaconStub });
  Object.defineProperty(XMLHttpRequest.prototype, 'send', { configurable: true, value: sendStub });
  return {
    total: () => fetchStub.mock.calls.length + beaconStub.mock.calls.length + sendStub.mock.calls.length,
  };
};

const balises = (): jest.Mock => {
  const beaconStub = jest.fn();
  Object.defineProperty(window.navigator, 'sendBeacon', { configurable: true, value: beaconStub });
  return beaconStub;
};

const TELEMETRIE: Balise = { url: '/api/v1/posts/42/anonymous-view', corps: '{}' };

/** Une revendication plus récente que toute revendication née dans ce document. */
const PRIORITAIRE = Number.MAX_SAFE_INTEGER;
/** Une revendication plus ancienne que toute revendication née dans ce document. */
const DEPASSEE = 1;

const revendication = (onglet: string, priorite: number, lien: string = CLE): unknown => ({
  type: 'revendication',
  onglet,
  lien,
  priorite,
});

const retrait = (onglet: string, lien: string = CLE): unknown => ({ type: 'retrait', onglet, lien });

const porteurFinal = (vues: readonly TransitionDeCycle[]): boolean =>
  vues.reduce<boolean>((acquis, vue) => (vue.type === 'porteur-du-battement' ? vue.porteur : acquis), false);

/** La priorité que l'onglet observé vient de DIFFUSER — la seule façon de la connaître du dehors. */
const prioriteDe = (recus: readonly unknown[]): number => {
  const revendications = recus.filter(
    (recu): recu is { readonly priorite: number } =>
      typeof recu === 'object' &&
      recu !== null &&
      'type' in recu &&
      recu.type === 'revendication' &&
      'priorite' in recu &&
      typeof recu.priorite === 'number',
  );
  const derniere = revendications.at(-1);
  if (derniere === undefined) throw new Error('aucune revendication diffusée');
  return derniere.priorite;
};

/**
 * Deux onglets réels partagent un canal MAIS PAS un document. Ici un seul
 * `window` sert tout le fichier : un second `observeCycleDeVie` recevrait
 * AUSSI les événements DOM du premier. Partout où le DOM interviendrait, le
 * second onglet est donc joué par le canal seul — c'est le seul montage qui
 * dise la vérité du cas E (§ 6.3).
 */
const voisinDeCanal = (cle: string = CLE): CanalDeTest => new CanalDeTest(canalDuLien(cle));

describe('le site unique du cycle de vie', () => {
  beforeEach(() => {
    canaux.clear();
    enVol.length = 0;
    differe = false;
    poseLeCanal();
    visibilite('visible');
    enLigne(true);
  });

  describe('masquage — la transition qui ne doit RIEN faire partir', () => {
    it('annonce le masquage', () => {
      const { vues, detache } = observe();
      bascule('hidden');
      detache();

      expect(vues).toContainEqual({ type: 'masquage' });
    });

    it("n'émet AUCUNE requête quand l'onglet passe caché — le gate du § 8.5", () => {
      const journal = requetes();
      const { detache } = observe({ telemetrie: () => TELEMETRIE });
      bascule('hidden');
      detache();

      expect(journal.total()).toBe(0);
    });

    it('ne répète pas le masquage quand la visibilité ne change pas', () => {
      const { vues, detache } = observe();
      bascule('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      detache();

      expect(vues.filter((vue) => vue.type === 'masquage')).toHaveLength(1);
    });

    // Le loquet unique d'origine (`suspendu`) portait DEUX faits orthogonaux :
    // l'onglet caché et le réseau tombé. Une coupure posait le loquet, et la
    // bascule qui suivait se taisait — un consommateur qui arrête ses travaux
    // de fond sur `masquage` continuait donc d'appeler pendant que l'onglet
    // était caché, contre le gate « onglet caché ⇒ ZÉRO requête » (§ 8.5).
    it('annonce le masquage MÊME quand le réseau est déjà tombé', () => {
      const { vues, detache } = observe();
      reseau('offline');
      bascule('hidden');
      detache();

      expect(vues).toContainEqual({ type: 'masquage' });
    });
  });

  describe('reprise', () => {
    it('reprend au retour à l’écran', () => {
      const { vues, detache } = observe();
      bascule('hidden');
      bascule('visible');
      detache();

      expect(vues).toContainEqual({ type: 'reprise', cause: 'visible' });
    });

    it('ne reprend pas ce qui n’a pas été suspendu — aucune reprise en double', () => {
      const { vues, detache } = observe();
      bascule('hidden');
      bascule('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      detache();

      expect(vues.filter((vue) => vue.type === 'reprise')).toHaveLength(1);
    });

    it('traite un retour de bfcache comme un retour à l’écran', () => {
      const { vues, detache } = observe();
      transition('pagehide', true);
      transition('pageshow', true);
      detache();

      expect(vues).toContainEqual({ type: 'reprise', cause: 'bfcache' });
    });

    it('ignore le pageshow du premier chargement (persisted === false)', () => {
      const { vues, detache } = observe();
      bascule('hidden');
      transition('pageshow', false);
      detache();

      expect(vues.filter((vue) => vue.type === 'reprise')).toHaveLength(0);
    });

    it('ne reprend pas tant que l’onglet est caché — même quand le réseau revient', () => {
      const { vues, detache } = observe();
      bascule('hidden');
      reseau('offline');
      reseau('online');
      detache();

      expect(vues.filter((vue) => vue.type === 'reprise')).toHaveLength(0);
    });

    it('reprend une seule fois au retour à l’écran après une coupure réseau', () => {
      const { vues, detache } = observe();
      bascule('hidden');
      reseau('offline');
      reseau('online');
      bascule('visible');
      detache();

      expect(vues.filter((vue) => vue.type === 'reprise')).toEqual([{ type: 'reprise', cause: 'visible' }]);
    });

    // Le § 7 (« Hors-ligne total ») interdit tout appel tant que le réseau est
    // absent, et le consommateur d'une `reprise` appelle `refresh` + `/sync`
    // (§ 6.3 état C). Une reprise émise hors ligne ordonne donc précisément ce
    // que le document interdit — sur le trajet le plus banal du rôle premier :
    // un tunnel, une bascule d'application, un retour.
    it('ne reprend PAS tant que le réseau est absent — même quand l’onglet revient à l’écran', () => {
      const { vues, detache } = observe();
      reseau('offline');
      bascule('hidden');
      bascule('visible');
      detache();

      expect(vues.filter((vue) => vue.type === 'reprise')).toHaveLength(0);
    });

    it('reprend UNE fois, cause « reseau », quand le réseau revient sur un onglet redevenu visible', () => {
      const { vues, detache } = observe();
      reseau('offline');
      bascule('hidden');
      bascule('visible');
      reseau('online');
      detache();

      expect(vues.filter((vue) => vue.type === 'reprise')).toEqual([{ type: 'reprise', cause: 'reseau' }]);
    });

    // Deux faits indépendants, quatre ordres d'arrivée : l'état final ne doit
    // dépendre d'AUCUN d'eux.
    it.each([
      ['réseau puis visibilité', ['offline', 'hidden', 'online', 'visible']],
      ['visibilité puis réseau', ['hidden', 'offline', 'visible', 'online']],
      ['réseau puis visibilité, retour inversé', ['offline', 'hidden', 'visible', 'online']],
      ['visibilité puis réseau, retour inversé', ['hidden', 'offline', 'online', 'visible']],
    ] as const)('tient la paire masquage/reprise quel que soit l’ordre — %s', (_ordre, etapes) => {
      const { vues, detache } = observe();
      etapes.forEach((etape) => {
        if (etape === 'offline' || etape === 'online') reseau(etape);
        else bascule(etape);
      });
      detache();

      expect(vues.filter((vue) => vue.type === 'masquage')).toHaveLength(1);
      expect(vues.filter((vue) => vue.type === 'perte-du-reseau')).toHaveLength(1);
      expect(vues.filter((vue) => vue.type === 'reprise')).toHaveLength(1);
    });
  });

  describe('état de départ — ce qu’un onglet annonce AVANT tout événement', () => {
    // Le § 7 exige une « bannière sobre hors ligne en haut » sur le cas qu'il
    // nomme (page chargée sans réseau). Sans annonce au montage, elle n'est
    // jamais peinte : le module est le SEUL site qui a le droit de lire
    // `navigator.onLine`, donc le seul qui puisse le dire.
    it('une page chargée hors ligne annonce la perte du réseau', () => {
      enLigne(false);
      const { vues, detache } = observe();
      detache();

      expect(vues[0]).toEqual({ type: 'perte-du-reseau' });
    });

    it('une page montée dans un onglet caché annonce son masquage', () => {
      visibilite('hidden');
      const { vues, detache } = observe();
      detache();

      expect(vues).toEqual([{ type: 'masquage' }]);
    });

    it('une page nominale n’annonce que son élection', () => {
      const { vues, detache } = observe();
      detache();

      expect(vues).toEqual([{ type: 'porteur-du-battement', porteur: true }]);
    });

    it('un retour du réseau après un chargement hors ligne reprend, cause « reseau »', () => {
      enLigne(false);
      const { vues, detache } = observe();
      enLigne(true);
      reseau('online');
      detache();

      expect(vues).toContainEqual({ type: 'reprise', cause: 'reseau' });
      expect(vues.indexOf(vues.find((vue) => vue.type === 'perte-du-reseau') as TransitionDeCycle)).toBe(0);
    });
  });

  describe('gel de bfcache — pagehide{persisted:true}', () => {
    it('ne dit rien et n’envoie rien', () => {
      const journal = requetes();
      const { vues, detache } = observe({ telemetrie: () => TELEMETRIE });
      transition('pagehide', true);
      detache();

      expect(vues).toEqual([{ type: 'porteur-du-battement', porteur: true }]);
      expect(journal.total()).toBe(0);
    });
  });

  describe('réseau', () => {
    it('annonce la perte du réseau une seule fois', () => {
      const { vues, detache } = observe();
      reseau('offline');
      reseau('offline');
      detache();

      expect(vues.filter((vue) => vue.type === 'perte-du-reseau')).toHaveLength(1);
    });

    it('reprend au retour du réseau, une seule fois', () => {
      const { vues, detache } = observe();
      reseau('offline');
      reseau('online');
      reseau('online');
      detache();

      expect(vues.filter((vue) => vue.type === 'reprise')).toEqual([{ type: 'reprise', cause: 'reseau' }]);
    });
  });

  describe('storage — un onglet apprend qu’un autre a touché au jeton', () => {
    it('rapporte la clé et la valeur neuve du jeton', () => {
      const { vues, detache } = observe();
      stockage(CLE, 'jeton-2');
      detache();

      expect(vues).toContainEqual({ type: 'jeton-externe', cle: CLE, valeur: 'jeton-2' });
    });

    it('rapporte l’effacement du jeton', () => {
      const { vues, detache } = observe();
      stockage(CLE, null);
      detache();

      expect(vues).toContainEqual({ type: 'jeton-externe', cle: CLE, valeur: null });
    });

    it('rapporte un vidage complet du stockage (clé nulle)', () => {
      const { vues, detache } = observe();
      stockage(null, null);
      detache();

      expect(vues).toContainEqual({ type: 'jeton-externe', cle: null, valeur: null });
    });

    it('reste muet sur un autre magasin — le jeton vit dans localStorage', () => {
      const { vues, detache } = observe();
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: CLE,
          newValue: 'jeton-2',
          storageArea: window.sessionStorage,
        }),
      );
      detache();

      expect(vues.filter((vue) => vue.type === 'jeton-externe')).toHaveLength(0);
    });

    it('reste muet sur une clé étrangère au jeton — le thème n’est pas une session', () => {
      const { vues, detache } = observe();
      stockage('meeshy.theme', 'dark');
      detache();

      expect(vues.filter((vue) => vue.type === 'jeton-externe')).toHaveLength(0);
    });

    // Le jeton est rangé PAR LIEN (§ 6.3 état E) : le jeton du lien B n'est pas
    // une nouvelle du lien A.
    it('reste muet sur le jeton d’un AUTRE lien', () => {
      const { vues, detache } = observe();
      stockage(AUTRE_CLE, 'jeton-du-lien-B');
      detache();

      expect(vues.filter((vue) => vue.type === 'jeton-externe')).toHaveLength(0);
    });

    /**
     * Le témoin qui manquait, et le seul que la relation de PRÉFIXE exerce.
     *
     * `LIEN-A` / `LIEN-B` sont deux suffixes DISJOINTS : sur une telle paire,
     * `startsWith` et l'égalité rendent le même verdict, et le témoin
     * ci-dessus ne pouvait donc pas tomber. Or la clé se termine par le lien,
     * dont la forme réelle est un `identifier` CHOISI par l'hôte
     * (`schema.prisma:577-579`, exemples `mshy_meeshy-public`,
     * `mshy_support-link`) : rien n'interdit qu'un lien soit le préfixe d'un
     * autre. L'onglet de `mshy_support` recevait alors la VALEUR de
     * `mshy_support-link` — que `sessionDepuisLaValeur` rend en session
     * valide —, c'est-à-dire le jeton, le `participantId` et le pseudo
     * d'autrui.
     */
    it("reste muet sur le jeton d’un lien dont le sien est le PRÉFIXE — une clé n'a pas de sous-clé", () => {
      const court = 'meeshy.guest.mshy_support';
      const long = 'meeshy.guest.mshy_support-link';
      expect(long.startsWith(court)).toBe(true);

      const { vues, detache } = observe({ cleDuJeton: court });
      stockage(long, JSON.stringify({ jeton: 'JETON-DE-B', participantId: 'p-b', pseudo: 'Bob' }));
      detache();

      expect(vues.filter((vue) => vue.type === 'jeton-externe')).toHaveLength(0);
    });

    it("reste muet DANS L'AUTRE SENS — le lien long n'entend pas le court non plus", () => {
      const { vues, detache } = observe({ cleDuJeton: 'meeshy.guest.mshy_support-link' });
      stockage('meeshy.guest.mshy_support', 'jeton-du-lien-court');
      detache();

      expect(vues.filter((vue) => vue.type === 'jeton-externe')).toHaveLength(0);
    });
  });

  describe('destruction réelle du document — pagehide{persisted:false}', () => {
    it('annonce la destruction et envoie UNE seule balise de télémétrie', () => {
      const beacon = balises();
      const { vues, detache } = observe({ telemetrie: () => TELEMETRIE });
      transition('pagehide', false);
      transition('pagehide', false);
      detache();

      expect(vues.filter((vue) => vue.type === 'destruction')).toHaveLength(1);
      expect(beacon.mock.calls).toEqual([[TELEMETRIE.url, TELEMETRIE.corps]]);
    });

    it('n’envoie rien quand aucune télémétrie n’est fournie', () => {
      const beacon = balises();
      const { detache } = observe();
      transition('pagehide', false);
      detache();

      expect(beacon).not.toHaveBeenCalled();
    });

    it('REFUSE une balise qui viserait un départ — la place se libère côté serveur', () => {
      const beacon = balises();
      const { vues, detache } = observe({
        telemetrie: () => ({ url: '/api/v1/anonymous/leave', corps: '{}' }),
      });
      transition('pagehide', false);
      detache();

      expect(beacon).not.toHaveBeenCalled();
      expect(vues).toContainEqual({ type: 'destruction' });
    });

    it('annonce la destruction même dans un navigateur sans sendBeacon', () => {
      Object.defineProperty(window.navigator, 'sendBeacon', { configurable: true, value: undefined });
      const { vues, detache } = observe({ telemetrie: () => TELEMETRIE });
      transition('pagehide', false);
      detache();

      expect(vues).toContainEqual({ type: 'destruction' });
    });

    it('REFUSE une balise dont l’URL ne se lit pas — on ne poste pas ce qu’on ne sait pas lire', () => {
      const beacon = balises();
      const { detache } = observe({ telemetrie: () => ({ url: 'http://[', corps: '{}' }) });
      transition('pagehide', false);
      detache();

      expect(beacon).not.toHaveBeenCalled();
    });
  });

  describe('BroadcastChannel — un seul porteur du battement pour N onglets', () => {
    it('parle sur le canal DU LIEN, jamais sur un canal global', () => {
      const { detache } = observe();

      expect([...canaux].map((canal) => canal.name)).toEqual([canalDuLien(CLE)]);
      expect(canalDuLien(CLE)).not.toBe(canalDuLien(AUTRE_CLE));
      detache();
    });

    it('donne le battement au dernier onglet passé visible', () => {
      const premier = observe();
      const second = observe();

      expect(premier.vues).toEqual([
        { type: 'porteur-du-battement', porteur: true },
        { type: 'porteur-du-battement', porteur: false },
      ]);
      expect(second.vues).toEqual([{ type: 'porteur-du-battement', porteur: true }]);

      premier.detache();
      second.detache();
    });

    it('ne donne le battement à personne tant que l’onglet est caché', () => {
      visibilite('hidden');
      const { vues, detache } = observe();
      detache();

      expect(vues.filter((vue) => vue.type === 'porteur-du-battement')).toHaveLength(0);
    });

    it('rend le battement à un onglet visible quand le porteur se retire', () => {
      const voisin = voisinDeCanal();
      const { vues, detache } = observe();
      voisin.postMessage(revendication('autre', PRIORITAIRE));
      voisin.postMessage(retrait('autre'));
      detache();

      expect(vues).toEqual([
        { type: 'porteur-du-battement', porteur: true },
        { type: 'porteur-du-battement', porteur: false },
        { type: 'porteur-du-battement', porteur: true },
      ]);
    });

    it('ne reprend pas le battement quand un onglet caché apprend un retrait', () => {
      const voisin = voisinDeCanal();
      visibilite('hidden');
      const { vues, detache } = observe();
      voisin.postMessage(retrait('autre'));
      detache();

      expect(vues.filter((vue) => vue.type === 'porteur-du-battement')).toHaveLength(0);
    });

    it('ignore ses propres messages et tout message inconnu', () => {
      const voisin = voisinDeCanal();
      const { vues, detache } = observe({ onglet: 'moi' });
      voisin.postMessage(revendication('moi', PRIORITAIRE));
      voisin.postMessage({ type: 'inconnu', onglet: 'autre', lien: CLE, priorite: PRIORITAIRE });
      voisin.postMessage('bonjour');
      voisin.postMessage(null);
      voisin.postMessage({});
      voisin.postMessage({ type: 'revendication', onglet: 7, lien: CLE, priorite: PRIORITAIRE });
      voisin.postMessage({ type: 'revendication', onglet: 'autre', lien: CLE });
      voisin.postMessage({ type: 'revendication', onglet: 'autre', lien: CLE, priorite: 'tard' });
      detache();

      expect(vues).toEqual([{ type: 'porteur-du-battement', porteur: true }]);
    });

    // Le protocole d'origine cédait INCONDITIONNELLEMENT. Comme
    // `postMessage` est asynchrone, deux onglets qui se croisent se posaient
    // chacun porteur puis cédaient chacun : ZÉRO porteur, alors que le § 6.2
    // en exige UN. Le départage rend le survivant indépendant de l'ordre.
    it('reste porteur devant une revendication DÉPASSÉE — et la rediffuse pour forcer l’autre à céder', () => {
      const voisin = voisinDeCanal();
      const recus: unknown[] = [];
      const { vues, detache } = observe({ onglet: 'moi' });
      voisin.onmessage = (evenement) => recus.push(evenement.data);
      voisin.postMessage(revendication('autre', DEPASSEE));
      detache();

      expect(vues).toEqual([{ type: 'porteur-du-battement', porteur: true }]);
      expect(recus).toContainEqual(
        expect.objectContaining({ type: 'revendication', onglet: 'moi', lien: CLE }),
      );
    });

    it('cède devant une revendication PRIORITAIRE', () => {
      const voisin = voisinDeCanal();
      const { vues, detache } = observe({ onglet: 'moi' });
      voisin.postMessage(revendication('autre', PRIORITAIRE));
      detache();

      expect(vues).toEqual([
        { type: 'porteur-du-battement', porteur: true },
        { type: 'porteur-du-battement', porteur: false },
      ]);
    });

    it('deux revendications qui SE CROISENT laissent exactement UN porteur, jamais zéro', () => {
      let premier: Observation | null = null;
      let second: Observation | null = null;

      enVolJusquA(() => {
        premier = observe({ onglet: 'onglet-a' });
        second = observe({ onglet: 'onglet-b' });
      });
      livreLesMessagesEnVol();

      const a = premier as unknown as Observation;
      const b = second as unknown as Observation;
      const porteurs = [porteurFinal(a.vues), porteurFinal(b.vues)].filter(Boolean);

      a.detache();
      b.detache();

      expect(porteurs).toHaveLength(1);
    });

    // À priorité ÉGALE — deux onglets devenus visibles dans la même
    // milliseconde — le départage doit rester TOTAL, donc porter sur
    // l'identifiant d'onglet. Sans cela, l'égalité rouvre la double cession.
    it.each([
      ['un identifiant plus grand l’emporte', 'zzz', false],
      ['un identifiant plus petit perd', 'aaa', true],
    ] as const)('tranche une égalité de priorité par l’identifiant — %s', (_cas, etranger, reste) => {
      const voisin = voisinDeCanal();
      const recus: unknown[] = [];
      voisin.onmessage = (evenement) => recus.push(evenement.data);
      const { vues, detache } = observe({ onglet: 'moi' });
      voisin.postMessage(revendication(etranger, prioriteDe(recus)));
      detache();

      expect(porteurFinal(vues)).toBe(reste);
    });

    // Le canal d'élection était GLOBAL alors que le jeton est rangé par lien
    // (§ 6.3 état E). Un invité qui ouvre deux liens voyait donc l'onglet du
    // lien B faire taire celui du lien A — dont le bail n'était plus jamais
    // renouvelé, jusqu'au 401 de l'état F.
    it('deux liens DIFFÉRENTS ne se volent pas le battement', () => {
      const a = observe({ cleDuJeton: CLE, onglet: 'onglet-du-lien-A' });
      const b = observe({ cleDuJeton: AUTRE_CLE, onglet: 'onglet-du-lien-B' });

      expect(porteurFinal(a.vues)).toBe(true);
      expect(porteurFinal(b.vues)).toBe(true);

      a.detache();
      b.detache();
    });

    it('ignore une revendication qui porte un AUTRE lien, même arrivée sur son canal', () => {
      const voisin = voisinDeCanal();
      const { vues, detache } = observe({ onglet: 'moi' });
      voisin.postMessage(revendication('intrus', PRIORITAIRE, AUTRE_CLE));
      detache();

      expect(vues).toEqual([{ type: 'porteur-du-battement', porteur: true }]);
    });

    it('annonce son retrait quand le porteur quitte la page', () => {
      const voisin = voisinDeCanal();
      const recus: unknown[] = [];
      const { detache } = observe({ onglet: 'moi' });
      voisin.onmessage = (evenement) => recus.push(evenement.data);
      transition('pagehide', false);
      detache();

      expect(recus).toContainEqual({ type: 'retrait', onglet: 'moi', lien: CLE });
    });

    it('dégrade sans canal au lieu de planter', () => {
      retireLeCanal();
      const { vues, detache } = observe();
      detache();

      expect(vues).toEqual([{ type: 'porteur-du-battement', porteur: true }]);
      poseLeCanal();
    });
  });

  describe('battement — la cadence, jamais la requête', () => {
    const INTERVALLE = 600_000;

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('bat pendant que l’onglet est visible', () => {
      const battre = jest.fn();
      const { detache } = observe({ battement: { intervalleMs: INTERVALLE, battre } });
      jest.advanceTimersByTime(INTERVALLE);
      detache();

      expect(battre).toHaveBeenCalledTimes(1);
    });

    it('ne bat JAMAIS tant que l’onglet est caché', () => {
      const battre = jest.fn();
      const { detache } = observe({ battement: { intervalleMs: INTERVALLE, battre } });
      bascule('hidden');
      jest.advanceTimersByTime(INTERVALLE * 5);
      detache();

      expect(battre).not.toHaveBeenCalled();
    });

    it('ne bat pas hors ligne', () => {
      const battre = jest.fn();
      const { detache } = observe({ battement: { intervalleMs: INTERVALLE, battre } });
      reseau('offline');
      jest.advanceTimersByTime(INTERVALLE * 5);
      detache();

      expect(battre).not.toHaveBeenCalled();
    });

    it('deux onglets sur le même lien ⇒ UN seul battement sur 10 minutes', () => {
      const premier = jest.fn();
      const second = jest.fn();
      const a = observe({ battement: { intervalleMs: INTERVALLE, battre: premier } });
      const b = observe({ battement: { intervalleMs: INTERVALLE, battre: second } });
      jest.advanceTimersByTime(INTERVALLE);
      a.detache();
      b.detache();

      expect(premier.mock.calls.length + second.mock.calls.length).toBe(1);
    });

    // Le pendant du cas E, sur DEUX liens : un invité qui ouvre deux liens
    // partagés reçus dans deux fils. Chaque lien a son participant, donc son
    // `lastActiveAt` — et donc son battement. Sous un canal global, l'onglet du
    // lien B faisait taire celui du lien A : le bail du lien A n'était plus
    // jamais renouvelé et le balayage du § 6.4 le fauchait, jusqu'au 401 de
    // l'état F, sans qu'aucun onglet du lien A n'ait bougé.
    it('deux liens DIFFÉRENTS battent chacun pour SON participant', () => {
      const pourA = jest.fn();
      const pourB = jest.fn();
      const a = observe({
        cleDuJeton: CLE,
        onglet: 'onglet-du-lien-A',
        battement: { intervalleMs: INTERVALLE, battre: pourA },
      });
      const b = observe({
        cleDuJeton: AUTRE_CLE,
        onglet: 'onglet-du-lien-B',
        battement: { intervalleMs: INTERVALLE, battre: pourB },
      });
      jest.advanceTimersByTime(INTERVALLE * 5);
      a.detache();
      b.detache();

      expect(pourA).toHaveBeenCalledTimes(5);
      expect(pourB).toHaveBeenCalledTimes(5);
    });

    // La minuterie d'origine était DÉTRUITE puis RECRÉÉE à chaque bascule :
    // l'intervalle effectif n'était pas `intervalleMs` mais « `intervalleMs` de
    // visibilité ININTERROMPUE ». Avec la cadence du § 6.2 et le geste que le
    // même § qualifie de « geste même du rôle premier », le battement
    // n'atteignait JAMAIS son échéance — et la preuve de présence du § 6.4
    // n'était plus produite du tout.
    it('des bascules plus courtes que la cadence ne suppriment pas le battement', () => {
      const battre = jest.fn();
      const { detache } = observe({ battement: { intervalleMs: INTERVALLE, battre } });

      for (let cycle = 0; cycle < 10; cycle += 1) {
        jest.advanceTimersByTime(INTERVALLE * 0.4);
        bascule('hidden');
        jest.advanceTimersByTime(INTERVALLE * 0.1);
        bascule('visible');
      }
      detache();

      expect(battre.mock.calls.length).toBeGreaterThanOrEqual(4);
    });

    it('rattrape le battement dû dès le retour à l’écran, sans en inventer plusieurs', () => {
      const battre = jest.fn();
      const { detache } = observe({ battement: { intervalleMs: INTERVALLE, battre } });
      bascule('hidden');
      jest.advanceTimersByTime(INTERVALLE * 5);
      bascule('visible');
      jest.advanceTimersByTime(1);
      detache();

      expect(battre).toHaveBeenCalledTimes(1);
    });

    it('cesse de battre une fois détaché', () => {
      const battre = jest.fn();
      const { detache } = observe({ battement: { intervalleMs: INTERVALLE, battre } });
      detache();
      jest.advanceTimersByTime(INTERVALLE * 3);

      expect(battre).not.toHaveBeenCalled();
    });
  });

  describe('détachement', () => {
    it('retire tous les écouteurs', () => {
      const { vues, detache } = observe();
      detache();
      bascule('hidden');
      bascule('visible');
      reseau('offline');
      reseau('online');
      transition('pageshow', true);
      transition('pagehide', false);
      stockage(CLE, 'jeton-2');

      expect(vues.filter((vue) => vue.type !== 'porteur-du-battement')).toHaveLength(0);
    });

    it('ferme le canal', () => {
      const { detache } = observe();
      detache();

      expect(canaux.size).toBe(0);
    });
  });
});
