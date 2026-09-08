import { baseDeLaPasserelle, DELAI_DE_REPONSE_MS } from './passerelle';

import type { Recuperateur } from './publication';

/**
 * CE QUE LES RÉGLAGES LISENT ET ÉCRIVENT — trois portes, pas une de plus.
 *
 * Chaque champ est copié du SCHÉMA qui le déclare, avec son fichier et sa
 * ligne : c'est la seule façon de savoir qu'un champ existe avant de le lire.
 *
 *   • `PATCH /users/me` — `routes/users/profile-updates.ts:41`, huit champs
 *     acceptés et pas un de plus. `email` et `phoneNumber` en sont
 *     explicitement EXCLUS (#4184) : ils demandent une preuve de possession
 *     et passent par `POST /users/me/change-email` / `change-phone`. La v3 ne
 *     les offre donc pas ici, plutôt que de les offrir et de se faire refuser.
 *   • `GET`/`DELETE /users/me/devices` — `routes/push-tokens.ts:355` et `:427`.
 *   • `PATCH /users/me/password` — `routes/users/profile-credentials.ts:32`.
 */

const objet = (valeur: unknown): Readonly<Record<string, unknown>> | null =>
  typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
    ? (valeur as Readonly<Record<string, unknown>>)
    : null;

const chaine = (valeur: unknown): string | null =>
  typeof valeur === 'string' && valeur.trim() !== '' ? valeur : null;

export type Appareil = {
  readonly id: string;
  readonly nom: string;
  readonly plateforme: string | null;
  readonly vuA: string | null;
};

export type Appareils =
  | { readonly genre: 'liste'; readonly appareils: readonly Appareil[] }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'panne' };

/**
 * UN APPAREIL SANS NOM SE NOMME PAR SA PLATEFORME, jamais par son
 * identifiant : `deviceId` est un jeton de push, illisible et sans valeur pour
 * qui lit la liste. `deviceName` est nullable au schéma — la garde est ici.
 */
const appareil = (brut: unknown): Appareil | null => {
  const source = objet(brut);
  const id = chaine(source?.id);
  if (source === null || id === null) return null;

  const plateforme = chaine(source.platform);
  return {
    id,
    nom: chaine(source.deviceName) ?? plateforme ?? 'Appareil',
    plateforme,
    vuA: chaine(source.lastUsedAt) ?? chaine(source.createdAt),
  };
};

const appel = async ({
  chemin,
  jeton,
  methode = 'GET',
  corps,
  base,
  recuperer,
}: {
  readonly chemin: string;
  readonly jeton: string;
  readonly methode?: string;
  readonly corps?: unknown;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Response> =>
  (recuperer ?? fetch)(`${base ?? baseDeLaPasserelle()}/api/v1${chemin}`, {
    method: methode,
    headers: {
      authorization: `Bearer ${jeton}`,
      ...(corps === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
    signal: AbortSignal.timeout(DELAI_DE_REPONSE_MS),
  });

export const appareilsDuLecteur = async ({
  jeton,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Appareils> => {
  try {
    const reponse = await appel({ chemin: '/users/me/devices', jeton, base, recuperer });
    if (reponse.status === 401) return { genre: 'session-expiree' };
    if (!reponse.ok) return { genre: 'panne' };

    const enveloppe = objet(await reponse.json());
    const brut = enveloppe?.data;
    return {
      genre: 'liste',
      appareils: Array.isArray(brut)
        ? brut.map(appareil).filter((piece): piece is Appareil => piece !== null)
        : [],
    };
  } catch {
    return { genre: 'panne' };
  }
};

export type Issue =
  | { readonly genre: 'fait' }
  | { readonly genre: 'refus'; readonly message: string; readonly statut: number }
  | { readonly genre: 'panne' };

/**
 * LE REFUS DE LA PASSERELLE EST RENDU TEL QUEL quand elle en donne un.
 *
 * `error.message` porte la raison — « Current password is incorrect », « Password
 * must be at least 8 characters » — et la RECOMPOSER côté client produirait une
 * seconde vérité qui divergerait au premier changement de règle. Ce qui est
 * traduit ici est le CADRE (« Votre mot de passe n'a pas été changé »), jamais
 * le motif.
 */
const issueDe = async (reponse: Response): Promise<Issue> => {
  if (reponse.ok) return { genre: 'fait' };
  if (reponse.status >= 500) return { genre: 'panne' };

  const enveloppe = objet(await reponse.json().catch(() => null));
  const message =
    chaine(objet(enveloppe?.error)?.message) ?? chaine(enveloppe?.error) ?? chaine(enveloppe?.message);

  return { genre: 'refus', message: message ?? '', statut: reponse.status };
};

/** Les huit champs que `PATCH /users/me` accepte — aucun autre ne part. */
export type ProfilAEcrire = {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly displayName?: string;
  readonly bio?: string;
  readonly systemLanguage?: string;
  readonly regionalLanguage?: string;
  readonly customDestinationLanguage?: string;
  readonly autoTranslateEnabled?: boolean;
};

export const ecrisLeProfil = async ({
  jeton,
  champs,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly champs: ProfilAEcrire;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Issue> => {
  try {
    return await issueDe(
      await appel({ chemin: '/users/me', jeton, methode: 'PATCH', corps: champs, base, recuperer }),
    );
  } catch {
    return { genre: 'panne' };
  }
};

export const changeLeMotDePasse = async ({
  jeton,
  actuel,
  nouveau,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly actuel: string;
  readonly nouveau: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Issue> => {
  try {
    return await issueDe(
      await appel({
        chemin: '/users/me/password',
        jeton,
        methode: 'PATCH',
        // Les noms sont ceux du schéma, pas les nôtres.
        corps: { currentPassword: actuel, newPassword: nouveau },
        base,
        recuperer,
      }),
    );
  } catch {
    return { genre: 'panne' };
  }
};

export const retireLAppareil = async ({
  jeton,
  id,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly id: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Issue> => {
  try {
    return await issueDe(
      await appel({
        chemin: `/users/me/devices/${encodeURIComponent(id)}`,
        jeton,
        methode: 'DELETE',
        base,
        recuperer,
      }),
    );
  } catch {
    return { genre: 'panne' };
  }
};
