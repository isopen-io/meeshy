import type { Recuperateur } from './compte';
import { baseDeLaPasserelle, DELAI_DE_REPONSE_MS } from './passerelle';

/**
 * `/settings/privacy` — L'EXPORT RGPD ET LA SUPPRESSION DE COMPTE, sur les
 * DEUX routes réelles, lues fichier et ligne (spécification § 2.4, § 2.5) :
 *
 *   • `GET /api/v1/me/export?format=&types=` — `services/gateway/src/routes/
 *     me/export.ts:52`, `preValidation: [fastify.authenticate]`. Rend
 *     TOUJOURS un JSON `{ success, data: {…} }`, quel que soit `format` (le
 *     champ `csv` s'AJOUTE au document JSON, il ne change pas
 *     `content-type`) — c'est cette route, et pas un fichier téléchargeable
 *     côté passerelle, que la v3 relaie en pièce jointe.
 *   • `POST /api/v1/me/account/deletion` — `routes/me/delete-account.ts:176`,
 *     la route CANONIQUE (#4183 ; `DELETE /me/delete-account` est sa
 *     devancière aux trois défauts documentés, à NE PAS employer). Corps
 *     STRICT `{ confirmationPhrase: 'SUPPRIMER MON COMPTE', currentPassword
 *     }`. Cinq refus NOMMÉS par leur `code` : 400 `INVALID_PASSWORD`,
 *     404 `ACCOUNT_NOT_FOUND`, 409 `NO_EMAIL`, 409 `ALREADY_PENDING`, 500.
 */

const enTetes = (jeton: string): Record<string, string> => ({ authorization: `Bearer ${jeton}` });

export type IssueDExport =
  | { readonly genre: 'fait'; readonly document: Readonly<Record<string, unknown>> }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'panne' };

export const exportDesDonnees = async ({
  jeton,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<IssueDExport> => {
  try {
    const reponse = await (recuperer ?? fetch)(
      `${base ?? baseDeLaPasserelle()}/api/v1/me/export?format=json&types=profile,messages,contacts`,
      { method: 'GET', headers: enTetes(jeton), signal: AbortSignal.timeout(DELAI_DE_REPONSE_MS) },
    );
    if (reponse.status === 401) return { genre: 'session-expiree' };
    if (!reponse.ok) return { genre: 'panne' };

    const enveloppe = (await reponse.json().catch(() => null)) as { readonly data?: unknown } | null;
    const document = enveloppe?.data;
    if (typeof document !== 'object' || document === null || Array.isArray(document)) return { genre: 'panne' };
    return { genre: 'fait', document: document as Readonly<Record<string, unknown>> };
  } catch {
    return { genre: 'panne' };
  }
};

/**
 * LES CINQ ISSUES DE LA SUPPRESSION — un `genre` par CODE, pas par statut
 * HTTP : l'écran distingue « mot de passe faux » de « déjà en cours », et un
 * simple `refus`/`statut` l'aurait obligé à relire le `code` une seconde
 * fois. `compte-introuvable` (404) n'a pas d'UI dédiée dans la cible — une
 * session valide sans compte est un bogue serveur, pas un chemin produit — et
 * se traite comme une panne au niveau de la porte.
 */
export type IssueDeSuppression =
  | { readonly genre: 'demandee' }
  | { readonly genre: 'mot-de-passe-invalide' }
  | { readonly genre: 'sans-email' }
  | { readonly genre: 'deja-en-cours' }
  | { readonly genre: 'compte-introuvable' }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'panne' };

const CODE_VERS_GENRE: Readonly<Record<string, IssueDeSuppression['genre']>> = {
  INVALID_PASSWORD: 'mot-de-passe-invalide',
  NO_EMAIL: 'sans-email',
  ALREADY_PENDING: 'deja-en-cours',
  ACCOUNT_NOT_FOUND: 'compte-introuvable',
};

export const demandeDeSuppression = async ({
  jeton,
  confirmationPhrase,
  motDePasse,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly confirmationPhrase: string;
  readonly motDePasse: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<IssueDeSuppression> => {
  try {
    const reponse = await (recuperer ?? fetch)(`${base ?? baseDeLaPasserelle()}/api/v1/me/account/deletion`, {
      method: 'POST',
      headers: { ...enTetes(jeton), 'content-type': 'application/json' },
      body: JSON.stringify({ confirmationPhrase, currentPassword: motDePasse }),
      signal: AbortSignal.timeout(DELAI_DE_REPONSE_MS),
    });

    if (reponse.ok) return { genre: 'demandee' };
    if (reponse.status === 401) return { genre: 'session-expiree' };
    if (reponse.status >= 500) return { genre: 'panne' };

    const enveloppe = (await reponse.json().catch(() => null)) as { readonly code?: unknown } | null;
    const code = typeof enveloppe?.code === 'string' ? enveloppe.code : null;
    return { genre: (code !== null ? CODE_VERS_GENRE[code] : undefined) ?? 'panne' };
  } catch {
    return { genre: 'panne' };
  }
};
