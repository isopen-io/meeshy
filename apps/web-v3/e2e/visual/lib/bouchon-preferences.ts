import type { DocumentPreference, NotificationPreference, PrivacyPreference } from '@meeshy/shared/types/preferences';

import { MEMBRE } from './bouchon-monde';

type Reponse = (corps: unknown, statut?: number) => void;

/**
 * EXTRAIT de `bouchon-compte.ts` (revue du travail `reglages-details`,
 * 2026-09-06) : trois routes du compte ATTENDAIENT déjà là-bas
 * (`GET`/`PATCH /api/v1/me/preferences`, TROIS catégories) et deux routes
 * RGPD leur MANQUAIENT (`GET /api/v1/me/export`, `POST /api/v1/me/account/
 * deletion`) — les ajouter sur place aurait porté `bouchon-compte.ts` à
 * ~1190 lignes, à la limite du plafond dur de 1200. Ce fichier tient
 * ensemble les CINQ routes du même sous-système (préférences + RGPD) : un
 * territoire cohérent, sous le seuil de 1000.
 *
 * Appelé DEPUIS `routesDuCompte` (`bouchon-compte.ts`), APRÈS sa garde
 * d'authentification (porteur `Bearer` exigé, membre vérifié) — ce module ne
 * la rejoue pas, exactement comme `serviParLAnnuaire` ne rejoue pas la
 * sienne pour les routes qui en ont besoin.
 */

export const MOT_DE_PASSE_DU_BOUCHON = 'mot-de-passe-actuel';

/**
 * L'ÉTAT INITIAL DES PRÉFÉRENCES DE NOTIFICATION (#4899) — amorcé aux défauts
 * IMPORTÉS de `@meeshy/shared/types/preferences` (jamais recopiés, § « la
 * passerelle de bouchon MIME la passerelle réelle »), `reactionEnabled`
 * éteint pour que le document GET s'oppose, dès la première ouverture, à un
 * client qui afficherait « Activé » partout par défaut local.
 *
 * UN `import()` DYNAMIQUE, PAS UN `import` STATIQUE — `@meeshy/shared` est
 * publié en ESM PUR (`"type": "module"`, `dist/**\/*.js`), et le harnais de
 * Playwright transpile chaque spec `.ts` en CommonJS avant de l'exécuter : un
 * `require()` transitif sur un module qui n'écrit que des `export` ÉCHOUE
 * (« require() of ES Module … not supported », mesuré au premier lancement de
 * `v3-notif-prefs.spec.ts`). `import()` reste un VRAI import dynamique même
 * depuis un module transpilé en CommonJS — Node le résout nativement — et
 * Jest, qui EXCLUT `/e2e/` de son périmètre (`jest.config.mjs`), n'est de
 * toute façon jamais témoin de ce fichier.
 */
export const notificationPrefsDeBouchon = async (): Promise<NotificationPreference> => {
  const { NOTIFICATION_PREFERENCE_DEFAULTS } = await import('@meeshy/shared/types/preferences');
  return { ...NOTIFICATION_PREFERENCE_DEFAULTS, reactionEnabled: false };
};

/** `/settings/privacy` (travail `reglages-details`) — les défauts DU SCHÉMA, jamais recopiés. */
export const privacyPrefsDeBouchon = async (): Promise<PrivacyPreference> => {
  const { PRIVACY_PREFERENCE_DEFAULTS } = await import('@meeshy/shared/types/preferences');
  return { ...PRIVACY_PREFERENCE_DEFAULTS };
};

/** `/settings/media/document` — `autoDownloadEnabled` naît FAUX, comme le schéma le déclare. */
export const documentPrefsDeBouchon = async (): Promise<DocumentPreference> => {
  const { DOCUMENT_PREFERENCE_DEFAULTS } = await import('@meeshy/shared/types/preferences');
  return { ...DOCUMENT_PREFERENCE_DEFAULTS };
};

/**
 * L'ÉTAT PILOTABLE DE LA SUPPRESSION DE COMPTE — les DEUX refus 409 que
 * `POST /api/v1/me/account/deletion` sert d'après l'état du COMPTE, jamais
 * d'après ce qui est posté (`routes/me/delete-account.ts:340-360`) : un
 * compte sans e-mail, ou une demande déjà ouverte. Le mot de passe, lui,
 * n'est jamais un état du bouchon — il se compare à `MOT_DE_PASSE_DU_BOUCHON`,
 * la même constante que `PATCH /users/me/password`.
 */
export type EtatDeSuppressionDeBouchon = {
  readonly dejaEnCours: boolean;
  readonly sansEmail: boolean;
};

export const suppressionDeBouchon = (options?: {
  readonly dejaEnCours?: boolean;
  readonly sansEmail?: boolean;
}): EtatDeSuppressionDeBouchon => ({
  dejaEnCours: options?.dejaEnCours ?? false,
  sansEmail: options?.sansEmail ?? false,
});

export type EtatDesPreferencesDuCompte = {
  readonly notificationPrefs: NotificationPreference;
  readonly privacyPrefs: PrivacyPreference;
  readonly documentPrefs: DocumentPreference;
  /** Relu pour composer `data.profile` de l'export — le MÊME magasin que `PATCH /users/me`. */
  readonly profil: Readonly<Record<string, string>>;
  readonly suppression: EtatDeSuppressionDeBouchon;
};

/**
 * `GET`/`PATCH /api/v1/me/preferences`, `GET /api/v1/me/export` et
 * `POST /api/v1/me/account/deletion` — les CINQ routes, dans l'ordre où la
 * spécification les cite (§ 2.4, § 2.5).
 */
export const routesDesPreferencesDuCompte =
  (etat: EtatDesPreferencesDuCompte) =>
  ({
    requete,
    url,
    corps,
    json,
  }: {
    readonly requete: { readonly method?: string | null };
    readonly url: URL;
    readonly corps: Buffer;
    readonly json: Reponse;
  }): boolean => {
    const chemin = url.pathname;
    const methode = requete.method ?? 'GET';

    /**
     * `GET`/`PATCH /api/v1/me/preferences` — TROIS catégories du COMPTE,
     * copiées sur `services/gateway/src/routes/me/preferences/
     * unified-routes.ts:150,229` : `notification` (#4899, TREIZE bascules et
     * plus), `privacy` et `document` (travail `reglages-details`, ce lot).
     * `GET` sert `{ success, data: { <categorie>: {…complet…} } }`, filtré
     * par `?categories=` ; `PATCH` FUSIONNE (`mode=merge`, le seul que la v3
     * envoie — jamais `replace`) les clés soumises sur le document que le
     * bouchon TIENT — un 200 qui n'écrirait rien ferait passer un client qui
     * n'a rien changé (même loi que `boite.litTout()`). Une catégorie hors de
     * cette table est 400 `UNKNOWN_CATEGORY` ; une clé absente du schéma, ou
     * d'un type qui ne concorde pas avec son défaut, est 400
     * `VALIDATION_ERROR` — la MÊME distinction que la passerelle réelle
     * (`unified-routes.ts:308,441`).
     */
    const MAGASIN_DES_PREFERENCES: Readonly<Record<string, Record<string, unknown>>> = {
      notification: etat.notificationPrefs as unknown as Record<string, unknown>,
      privacy: etat.privacyPrefs as unknown as Record<string, unknown>,
      document: etat.documentPrefs as unknown as Record<string, unknown>,
    };

    if (chemin === '/api/v1/me/preferences' && methode === 'GET') {
      // `?categories=` SÉLECTIONNE : la passerelle ne sert que les catégories
      // nommées, et sert TOUT quand rien n'est nommé (`unified-routes.ts:206`,
      // `parsed.selection.categories`, dont l'ETag hache le RÉSULTAT — « il
      // varie avec `categories` », `:210`). Le bouchon ne connaît que les
      // TROIS catégories du magasin — il les omet donc quand la sélection ne
      // les nomme pas, plutôt que de les servir quoi qu'on demande : sans
      // cela, un client qui aurait perdu son `?categories=` resterait vert
      // ici et vide en production.
      const demandees = url.searchParams.get('categories');
      const noms = demandees === null ? Object.keys(MAGASIN_DES_PREFERENCES) : demandees.split(',');
      const data = Object.fromEntries(
        noms.filter((nom) => nom in MAGASIN_DES_PREFERENCES).map((nom) => [nom, MAGASIN_DES_PREFERENCES[nom]]),
      );
      json({ success: true, data });
      return true;
    }
    if (chemin === '/api/v1/me/preferences' && methode === 'PATCH') {
      const soumis = JSON.parse(corps.toString('utf8') || '{}') as Record<string, unknown>;
      const categories = Object.keys(soumis);
      const categorieInconnue = categories.find((categorie) => !(categorie in MAGASIN_DES_PREFERENCES));
      if (categorieInconnue !== undefined) {
        json({ success: false, error: 'UNKNOWN_CATEGORY', message: `Unknown preference category '${categorieInconnue}'` }, 400);
        return true;
      }

      for (const categorie of categories) {
        const bloc = soumis[categorie];
        if (typeof bloc !== 'object' || bloc === null || Array.isArray(bloc)) {
          json({ success: false, error: 'VALIDATION_ERROR', message: 'Body must be an object keyed by preference category' }, 400);
          return true;
        }

        const document = MAGASIN_DES_PREFERENCES[categorie] as Record<string, unknown>;
        const soumises = bloc as Record<string, unknown>;
        const cleInvalide = Object.keys(soumises).find(
          (cle) => !(cle in document) || typeof soumises[cle] !== typeof document[cle],
        );
        if (cleInvalide !== undefined) {
          json(
            {
              success: false,
              error: 'VALIDATION_ERROR',
              message: `Unknown field '${cleInvalide}'`,
              details: { issues: [{ path: [cleInvalide], message: 'Unrecognized field' }] },
            },
            400,
          );
          return true;
        }

        Object.assign(document, soumises);
      }

      json({
        success: true,
        data: Object.fromEntries(categories.map((categorie) => [categorie, MAGASIN_DES_PREFERENCES[categorie]])),
      });
      return true;
    }

    /**
     * `GET /api/v1/me/export` — `services/gateway/src/routes/me/export.ts:52`,
     * `preValidation: [fastify.authenticate]`. Rend TOUJOURS un JSON
     * `{ success, data: {…} }`, quel que soit `?format=` (`export.ts:79-96` :
     * `csv` s'AJOUTE au document, il ne change pas `content-type`) — c'est
     * `app/connecte/reglages-details-porte.ts` qui transforme ce document en
     * pièce jointe téléchargeable, jamais cette route. Le bouchon sert les
     * TROIS types demandés (`profile`, `messages`, `contacts`, `export.ts:14`)
     * — vide pour les deux derniers, la v3 ne lisant que les clés du
     * document, jamais un total qu'elle recalculerait.
     */
    if (chemin === '/api/v1/me/export' && methode === 'GET') {
      const format = url.searchParams.get('format') ?? 'json';
      const demandes = url.searchParams.get('types');
      const requestedTypes = demandes === null ? ['profile', 'messages', 'contacts'] : demandes.split(',');
      json({
        success: true,
        data: {
          exportDate: new Date().toISOString(),
          format,
          requestedTypes,
          profile: { id: MEMBRE.id, displayName: MEMBRE.nom, ...etat.profil },
          messages: [],
          messagesCount: 0,
          contacts: [],
          contactsCount: 0,
        },
      });
      return true;
    }

    /**
     * `POST /api/v1/me/account/deletion` — `routes/me/delete-account.ts:176`,
     * la route CANONIQUE (#4183). Corps STRICT `{ confirmationPhrase,
     * currentPassword }`. Les CINQ refus nommés par leur `code` — 400
     * `INVALID_PASSWORD`, 404 `ACCOUNT_NOT_FOUND` (aucune UI dédiée dans la
     * cible, le bouchon ne le simule pas), 409 `NO_EMAIL`, 409
     * `ALREADY_PENDING`, 500 — portés à la RACINE de l'enveloppe, comme
     * `sendError` l'étale (`services/gateway/src/utils/response.ts:82`),
     * jamais sous `error`.
     */
    if (chemin === '/api/v1/me/account/deletion' && methode === 'POST') {
      const soumis = ((): Record<string, unknown> => {
        try {
          return JSON.parse(corps.toString('utf8')) as Record<string, unknown>;
        } catch {
          return {};
        }
      })();

      if (soumis.currentPassword !== MOT_DE_PASSE_DU_BOUCHON) {
        json({ success: false, error: 'Mot de passe incorrect', code: 'INVALID_PASSWORD' }, 400);
        return true;
      }
      if (etat.suppression.sansEmail) {
        json(
          {
            success: false,
            error: 'Aucune adresse e-mail n’est associée à ce compte : la suppression ne peut pas être confirmée.',
            code: 'NO_EMAIL',
          },
          409,
        );
        return true;
      }
      if (etat.suppression.dejaEnCours) {
        json({ success: false, error: 'Une demande de suppression est déjà en cours', code: 'ALREADY_PENDING' }, 409);
        return true;
      }

      json({
        success: true,
        data: {
          message: 'Un e-mail de confirmation a été envoyé à votre adresse',
          tokenExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        },
      });
      return true;
    }

    return false;
  };
