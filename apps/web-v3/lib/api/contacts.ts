import { baseDeLaPasserelle } from './links';
import { DELAI_DE_REPONSE_MS } from './passerelle';

import type { Recuperateur } from './compte';

export type { Recuperateur };

/**
 * CE QUE L'ÉCRAN DES CONTACTS DEMANDE À LA PASSERELLE.
 *
 * DEUX APPELS, PAS TROIS. La cible (`cible/contacts.png`) dessine UNE liste où
 * cohabitent trois sortes de lignes : une demande REÇUE (« Accepter »), une
 * demande ENVOYÉE (« En attente ») et un contact ÉTABLI. Les deux premières
 * viennent de la même table, et `?direction=any` les rend ensemble
 * (`listerDemandes`, `routes/directory/friend-requests-core.ts:619-623` : `any`
 * ⇒ `OR: [{receiverId}, {senderId}]`). Le SENS se lit après coup, en comparant
 * `senderId` à l'identité du lecteur — un aller-retour de moins sur une 3G
 * rurale, pour une information que la charge porte déjà.
 *
 * LES ADRESSES SONT LES CANONIQUES, PAS LES ALIAS. `GET /friend-requests/received`
 * et `/sent` existent et fonctionnent, et leur schéma les déclare
 * `deprecated: true` en nommant leur remplaçante — elles servent une page par
 * RANG là où la canonique pagine par CURSEUR et partage le même gate de
 * présence (#4283). Écrire un client neuf contre un alias déprécié, c'est
 * naître avec une dette dont la date de fin est déjà écrite.
 *
 * LE CARNET EST FILTRÉ SUR `meeshy`, ET C'EST UNE RÈGLE DE CHARTE. Le
 * répertoire porte aussi les contacts SANS compte (`filter=invitable`), pour
 * lesquels la v3 n'a aucune surface d'invitation. Les rendre ferait une liste
 * de lignes qui ne mènent nulle part — la règle 7 dit qu'un contrôle sans effet
 * ne se rend pas. Le jour où l'invitation existe, le filtre s'ouvre ; pas
 * avant.
 *
 * LA PRÉSENCE EST RÉSOLUE PAR LE SERVEUR, ET CE MODULE NE LA FABRIQUE JAMAIS.
 * Les deux routes passent leur viewer à la loi partagée (`viewerFromRequest` →
 * `resolveForTargets`), et `applyPresenceVisibilityAsOffline` sert
 * `isOnline: false` / `lastActiveAt: null` à qui n'a pas le droit de savoir.
 * Une charge masquée est donc INDISCERNABLE d'une absence réelle — c'est voulu,
 * et c'est exactement ce que le client doit rendre : rien. La directive du
 * 2026-08-25 le dit dans l'autre sens (hors amitié acceptée, aucune présence
 * n'est servie), et une conséquence en découle qui a l'air d'un bug et n'en est
 * pas : **une demande EN ATTENTE ne porte jamais de présence**, puisque son
 * expéditeur n'est pas encore un ami.
 */

const DELAI_MS = DELAI_DE_REPONSE_MS;

const CHEMIN_DEMANDES = '/api/v1/directory/friend-requests';
const CHEMIN_CARNET = '/api/v1/directory/contacts';

const objet = (valeur: unknown): Readonly<Record<string, unknown>> | null =>
  typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
    ? (valeur as Readonly<Record<string, unknown>>)
    : null;

const chaine = (valeur: unknown): string | null =>
  typeof valeur === 'string' && valeur !== '' ? valeur : null;

/**
 * UNE PERSONNE, PROJETÉE. Les deux routes servent des formes VOISINES et non
 * identiques, et la projection les réunit sans rien inventer :
 *
 *   - une partie de demande sort par `demandeAvecPresenceSchema`
 *     (`routes/directory/friend-requests.ts:78`) — `userMinimalSchema` élargi
 *     LOCALEMENT de `firstName`, `lastName` et `lastActiveAt` ;
 *   - un profil rapproché sort par `matchedUserSchema`
 *     (`routes/users/contacts-schemas.ts:9-22`) — les mêmes champs, sans `type`
 *     ni `userId`.
 *
 * `langue` n'y figure NULLE PART, et c'est pourquoi la cible dit « @marta ·
 * espagnol » là où cet écran dira « @marta ». Aucune des deux routes ne charge
 * `systemLanguage` ; la lire exigerait un appel PAR LIGNE
 * (`GET /directory/people/:handle`), c'est-à-dire une liste de vingt contacts
 * payée vingt fois sur une 3G rurale — une lenteur, donc un bug. Et l'inventer
 * serait pire : une langue affichée est une promesse de Prisme.
 */
export type Personne = {
  readonly id: string;
  readonly nom: string;
  readonly pseudonyme: string | null;
  /** Servi UNIQUEMENT quand la loi de présence l'autorise — jamais reconstitué. */
  readonly enLigne: boolean;
  readonly vuA: string | null;
};

const SANS_NOM = 'Contact';

const personne = (brut: Readonly<Record<string, unknown>> | null): Personne | null => {
  if (brut === null) return null;
  const id = chaine(brut.id);
  if (id === null) return null;

  const pseudonyme = chaine(brut.username);

  return {
    id,
    nom: chaine(brut.displayName) ?? pseudonyme ?? SANS_NOM,
    pseudonyme,
    enLigne: brut.isOnline === true,
    vuA: chaine(brut.lastActiveAt),
  };
};

export type Demande = {
  readonly id: string;
  /** Qui a demandé. Lu sur `senderId`, jamais sur l'ordre des champs. */
  readonly sens: 'recue' | 'envoyee';
  /** L'AUTRE partie — celle que le lecteur regarde. */
  readonly personne: Personne;
  readonly creeeA: string | null;
};

export type Contact = {
  /** L'identifiant de la LIGNE DE CARNET, pas celui du compte. */
  readonly id: string;
  readonly nom: string;
  readonly personne: Personne;
};

export type Carnet =
  | {
      readonly genre: 'liste';
      readonly demandesRecues: readonly Demande[];
      readonly demandesEnvoyees: readonly Demande[];
      readonly contacts: readonly Contact[];
    }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'panne' };

const demande = async (
  url: string,
  jeton: string,
  recuperer: Recuperateur | undefined,
  options: RequestInit = {},
): Promise<Response | null> =>
  (recuperer ?? ((u, o) => fetch(u, o)))(url, {
    headers: { accept: 'application/json', authorization: `Bearer ${jeton}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(DELAI_MS),
    ...options,
  }).catch(() => null);

type Issue<T> = { readonly ok: T } | { readonly refus: 'session-expiree' | 'panne' };

const lire = async (
  url: string,
  jeton: string,
  recuperer: Recuperateur | undefined,
): Promise<Issue<readonly Readonly<Record<string, unknown>>[]>> => {
  const reponse = await demande(url, jeton, recuperer);
  if (reponse === null) return { refus: 'panne' };
  if (reponse.status === 401) return { refus: 'session-expiree' };

  const enveloppe = objet(await reponse.json().catch(() => null));
  if (enveloppe?.success !== true) return { refus: 'panne' };

  const brutes = Array.isArray(enveloppe.data) ? enveloppe.data : [];
  return {
    ok: brutes
      .map((ligne) => objet(ligne))
      .filter((ligne): ligne is Readonly<Record<string, unknown>> => ligne !== null),
  };
};

/**
 * LE SENS D'UNE DEMANDE SE LIT SUR `senderId`, ET L'AUTRE PARTIE S'EN DÉDUIT.
 *
 * La charge porte TOUJOURS `sender` ET `receiver` (`INCLUDE_PARTIES`,
 * `friend-requests-core.ts:51`), quelle que soit la direction demandée :
 * choisir « celui qui n'est pas moi » est donc la seule lecture juste. Prendre
 * `sender` parce qu'on a demandé `direction=received` marcherait jusqu'au jour
 * où l'on demande `any` — c'est-à-dire aujourd'hui.
 *
 * SANS IDENTITÉ, AUCUNE DEMANDE N'EST CLASSÉE. Rendre `null` plutôt que de
 * deviner : une demande reçue rendue comme envoyée offrirait un bouton
 * « Accepter » sur sa propre demande, que la passerelle refuserait — un
 * contrôle qui ment.
 */
const versDemande = (
  brut: Readonly<Record<string, unknown>>,
  moiId: string,
): Demande | null => {
  const id = chaine(brut.id);
  const expediteur = chaine(brut.senderId);
  if (id === null || expediteur === null) return null;

  const envoyee = expediteur === moiId;
  const autre = personne(objet(envoyee ? brut.receiver : brut.sender));
  if (autre === null) return null;

  return { id, sens: envoyee ? 'envoyee' : 'recue', personne: autre, creeeA: chaine(brut.createdAt) };
};

const versContact = (brut: Readonly<Record<string, unknown>>): Contact | null => {
  const id = chaine(brut.id);
  const compte = personne(objet(brut.matchedUser));
  if (id === null || compte === null) return null;

  // `displayName` est celui du CARNET — le nom que le lecteur a écrit dans son
  // téléphone — et il prime sur celui du compte : c'est sous ce nom-là qu'il
  // cherche la personne. Le compte reprend la main quand la ligne n'en porte
  // pas.
  return { id, nom: chaine(brut.displayName) ?? compte.nom, personne: compte };
};

/**
 * LE CARNET DU LECTEUR — les deux appels, en PARALLÈLE.
 *
 * `limit` est passé explicitement sur les deux : leurs défauts diffèrent (50
 * pour le carnet, `LIMITE_DEFAUT_DEMANDES` pour les demandes) et un client qui
 * ne les nomme pas laisse deux handlers décider de sa page. La valeur est une
 * décision de COÛT — de quoi remplir l'écran d'un pouce sans faire payer une 3G
 * rurale pour ce qu'elle ne montrera pas.
 *
 * UNE PANNE PARTIELLE EST UNE PANNE. Si l'un des deux appels échoue, l'écran ne
 * sert pas la moitié qui a répondu : une liste amputée en silence ferait croire
 * à un carnet vide, ce qui est un mensonge plus coûteux qu'une page de panne.
 * Un 401 sur l'un ou l'autre renvoie se connecter.
 */
export const carnetDuLecteur = async ({
  jeton,
  moiId,
  limite = 40,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly moiId: string;
  readonly limite?: number;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Carnet> => {
  const racine = base ?? baseDeLaPasserelle();

  const [demandes, carnet] = await Promise.all([
    lire(
      `${racine}${CHEMIN_DEMANDES}?direction=any&status=pending&limit=${limite}`,
      jeton,
      recuperer,
    ),
    lire(`${racine}${CHEMIN_CARNET}?filter=meeshy&limit=${limite}`, jeton, recuperer),
  ]);

  if ('refus' in demandes) return { genre: demandes.refus };
  if ('refus' in carnet) return { genre: carnet.refus };

  const toutes = demandes.ok
    .map((brut) => versDemande(brut, moiId))
    .filter((d): d is Demande => d !== null);

  return {
    genre: 'liste',
    demandesRecues: toutes.filter((d) => d.sens === 'recue'),
    demandesEnvoyees: toutes.filter((d) => d.sens === 'envoyee'),
    contacts: carnet.ok.map(versContact).filter((c): c is Contact => c !== null),
  };
};

/**
 * `PATCH /directory/friend-requests/:id` — répondre à une demande.
 *
 * QUATRE GESTES EXISTENT (`accept`, `reject`, `cancel`, `dismiss`) ; cet écran
 * en expose DEUX, ceux que la cible dessine. `cancel` (retirer sa propre
 * demande) et `dismiss` (écarter une demande refusée) sont des gestes réels
 * qu'aucune ligne de la cible ne porte — les câbler sans les dessiner ferait
 * une surface que personne ne trouve.
 *
 * L'ISSUE A TROIS ÉTATS, comme partout ailleurs dans la v3 : un 401 renvoie se
 * connecter (une session qui a expiré pendant la lecture de la liste est le cas
 * nominal), une panne le DIT, et le succès re-sert la liste — que la passerelle
 * vient de changer.
 */
export type Geste = 'accepter' | 'refuser';

const ACTION_DE_LA_PASSERELLE: Readonly<Record<Geste, string>> = {
  accepter: 'accept',
  refuser: 'reject',
};

export type IssueDuGeste = 'faite' | 'session-expiree' | 'panne';

export const repondreALaDemande = async ({
  jeton,
  demandeId,
  geste,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly demandeId: string;
  readonly geste: Geste;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<IssueDuGeste> => {
  const url = `${base ?? baseDeLaPasserelle()}${CHEMIN_DEMANDES}/${encodeURIComponent(demandeId)}`;
  const reponse = await demande(url, jeton, recuperer, {
    method: 'PATCH',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${jeton}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action: ACTION_DE_LA_PASSERELLE[geste] }),
  });

  if (reponse === null) return 'panne';
  if (reponse.status === 401) return 'session-expiree';

  const enveloppe = objet(await reponse.json().catch(() => null));
  return enveloppe?.success === true ? 'faite' : 'panne';
};
