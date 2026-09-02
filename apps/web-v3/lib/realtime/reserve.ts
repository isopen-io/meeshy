/**
 * LA RÉSERVE — ce que le fil garde dans le navigateur entre deux visites : la
 * file des envois HORS LIGNE (§ 7, « envois poussés dans offline-queue,
 * persistée ») et le brouillon par conversation.
 *
 * IndexedDB, et pas `localStorage` : le stockage clé-valeur synchrone n'a qu'UN
 * détenteur dans la v3 (`lib/api/guest-session.ts`, la garde de zone l'impose)
 * et il est réservé au jeton invité. Une file d'envois est une donnée
 * STRUCTURÉE, écrite depuis un module de participation qui ne doit jamais
 * bloquer le fil d'exécution pendant une frappe — IndexedDB est fait pour ça.
 *
 * `idb-keyval` aurait fait l'affaire ; il n'est pas une dépendance déclarée de
 * la v3, et ces soixante lignes ne réécrivent pas une bibliothèque — elles
 * n'ouvrent qu'un magasin et n'exposent que quatre verbes.
 *
 * Un navigateur sans IndexedDB (navigation privée qui la refuse, quota plein)
 * n'est pas une panne : la réserve retombe en MÉMOIRE, et la file ne survit
 * alors qu'à la page — dégradation assumée, jamais une exception.
 *
 * TOUTE CLÉ PORTE L'IDENTITÉ DU LECTEUR. Une réserve indexée par la seule
 * conversation ne survivait pas à un appareil partagé — le cas nominal en zone
 * rurale : un lecteur A qui écrit hors ligne puis se déconnecte laissait ses
 * messages en file, et le lecteur B qui ouvrait la même conversation les voyait
 * rejoués et EXPÉDIÉS sous SA créance, brouillon compris. La clé dit donc QUI
 * (`User.id` du membre, `Participant.id` de l'invité) avant de dire QUOI, et
 * l'ouverture PURGE ce qui appartient à une autre identité : ce qui reste
 * derrière une fois l'écran quitté ne part jamais sous un autre nom.
 */

const BASE = 'meeshy-v3';
const MAGASIN = 'reserve';

export type Reserve = {
  readonly lis: (cle: string) => Promise<unknown>;
  readonly ecris: (cle: string, valeur: unknown) => Promise<void>;
  readonly efface: (cle: string) => Promise<void>;
  readonly cles: (prefixe: string) => Promise<readonly string[]>;
};

const enMemoire = (): Reserve => {
  const carte = new Map<string, unknown>();
  return {
    lis: async (cle) => carte.get(cle),
    ecris: async (cle, valeur) => {
      carte.set(cle, valeur);
    },
    efface: async (cle) => {
      carte.delete(cle);
    },
    cles: async (prefixe) => [...carte.keys()].filter((cle) => cle.startsWith(prefixe)).sort(),
  };
};

const attend = <T,>(requete: IDBRequest<T>): Promise<T> =>
  new Promise((resoud, rejette) => {
    requete.onsuccess = () => resoud(requete.result);
    requete.onerror = () => rejette(requete.error ?? new Error('IndexedDB'));
  });

const ouvre = (): Promise<IDBDatabase> =>
  new Promise((resoud, rejette) => {
    const demande = indexedDB.open(BASE, 1);
    demande.onupgradeneeded = () => {
      demande.result.createObjectStore(MAGASIN);
    };
    demande.onsuccess = () => resoud(demande.result);
    demande.onerror = () => rejette(demande.error ?? new Error('IndexedDB'));
    demande.onblocked = () => rejette(new Error('IndexedDB bloquée'));
  });

const surIndexedDb = (base: IDBDatabase): Reserve => {
  const magasin = (mode: IDBTransactionMode): IDBObjectStore =>
    base.transaction(MAGASIN, mode).objectStore(MAGASIN);

  return {
    lis: (cle) => attend(magasin('readonly').get(cle)),
    ecris: async (cle, valeur) => {
      await attend(magasin('readwrite').put(valeur, cle));
    },
    efface: async (cle) => {
      await attend(magasin('readwrite').delete(cle));
    },
    cles: async (prefixe) =>
      (await attend(magasin('readonly').getAllKeys()))
        .filter((cle): cle is string => typeof cle === 'string' && cle.startsWith(prefixe))
        .sort(),
  };
};

/** La réserve, ouverte UNE fois ; toute erreur d'ouverture rend la réserve en mémoire. */
export const reserve = async (): Promise<Reserve> => {
  if (typeof indexedDB === 'undefined') return enMemoire();
  try {
    return surIndexedDb(await ouvre());
  } catch {
    return enMemoire();
  }
};

/** Les deux familles de la réserve — et rien d'autre n'y est écrit. */
const FAMILLES = ['file', 'brouillon'] as const;

/**
 * Les CLÉS d'un lecteur pour une conversation. `moi` est l'identité que le
 * document a servie ; sans elle, rien ne s'écrit (`null`) — une file sans
 * propriétaire est exactement ce que cette indexation interdit.
 */
export const clesDeLaReserve = ({ moi, conversation }: { readonly moi: string | null; readonly conversation: string }) =>
  moi === null
    ? null
    : {
        /** Le préfixe des envois en attente : chaque entrée y ajoute `<instant>:<clientMessageId>`. */
        file: `file:${moi}:${conversation}:`,
        brouillon: `brouillon:${moi}:${conversation}`,
      };

/**
 * PURGER ce qui n'est pas au lecteur qui ouvre — à l'ouverture, avant toute
 * relecture de la file. Le témoin est simple : après la purge, aucune clé de la
 * réserve ne porte une autre identité que la sienne.
 */
export const purgeLesAutres = async (r: Reserve, moi: string): Promise<void> => {
  const etrangeres = (
    await Promise.all(FAMILLES.map((famille) => r.cles(`${famille}:`).catch((): readonly string[] => [])))
  )
    .flat()
    .filter((cle) => !FAMILLES.some((famille) => cle.startsWith(`${famille}:${moi}:`)));
  await Promise.all(etrangeres.map((cle) => r.efface(cle).catch(() => undefined)));
};
