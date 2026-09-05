import type { IncomingMessage } from 'node:http';

import type { Identite } from './bouchon-socket';
import type { LienDeBouchon } from './bouchon-lien';
import { CONVERSATION_DU_LECTEUR, IDENTIFIANT_DU_LIEN_PARTAGE, LIEN_DU_FIL, MEMBRE } from './bouchon-monde';

/**
 * `GET /api/v1/links`, `POST /api/v1/links` ET `PATCH /api/v1/links/:linkId`
 * (issue #4933) — extrait de `bouchon-compte.ts` (#4170, bande 1000–1200 :
 * un fichier qui grandit encore se découpe AVANT d'ajouter, jamais après).
 *
 * `PATCH` COPIE LA LOI DE `loadShareLinkForManagement`
 * (`services/gateway/src/routes/links/management.ts:56-96`) — créateur OU
 * modérateur, jamais un booléen de propriété nu — et celle
 * d'`applyShareLinkUpdate` (`:100-146`) : seul `isActive === false` a un
 * effet, `isActive === true` ne rouvre rien de plus que le champ lui-même.
 * `mshy_lagos` (`LIEN_DU_FIL`) est l'état PARTAGÉ (`LienDeBouchon`) que
 * `bouchon-lien.ts` relit pour l'aperçu, la jonction et `/resolve` — le
 * fermer ICI le ferme PARTOUT, comme `revokeShareLinkGuests` le ferait pour
 * de vrai (leçon 422 : un bouchon copie une LOI, pas une réponse).
 */

type Reponse = (corps: unknown, statut?: number) => void;

/** Les champs de `createLinkSchema` que le bouchon accepte — recopiés du schéma. */
export const CHAMPS_DE_LIEN: readonly string[] = [
  'conversationId',
  'name',
  'description',
  'maxUses',
  'maxConcurrentUsers',
  'maxUniqueSessions',
  'expiresAt',
  'allowAnonymousMessages',
  'allowAnonymousFiles',
  'allowAnonymousImages',
  'allowViewHistory',
  'requireAccount',
  'requireNickname',
  'requireEmail',
  'requireBirthday',
  'allowedLanguages',
  'allowedIpRanges',
  'newConversation',
];

/** Les champs de `updateLinkSchema` (`routes/links/types.ts:65-80`) que `PATCH` accepte. */
const CHAMPS_DE_MISE_A_JOUR: readonly string[] = [
  'name',
  'description',
  'maxUses',
  'maxConcurrentUsers',
  'maxUniqueSessions',
  'expiresAt',
  'isActive',
  'allowAnonymousMessages',
  'allowAnonymousFiles',
  'allowAnonymousImages',
  'allowViewHistory',
  'requireAccount',
  'requireNickname',
  'requireEmail',
  'requireBirthday',
  'allowedCountries',
  'allowedLanguages',
  'allowedIpRanges',
];

/** Le compte SERVI par `?include=summary` pour le carnet de base — 17 actifs sur 30. */
const ACTIFS_DE_BASE = 17;

export type EtatDuCarnetDeBouchon = {
  readonly creanceDe: (requete: IncomingMessage) => Identite | null;
  readonly lecteurSansRien: boolean;
  readonly liensCrees: Record<string, unknown>[];
};

export type CarnetDeBouchon = {
  /** Retarde CHAQUE `PATCH` de `ms` — pour éprouver l'optimisme du module avant la réponse. */
  readonly retarde: (ms: number) => void;
  /** Change le CRÉATEUR d'un lien — `autre-compte` fait rendre 403, la police de `management.ts:79-93`. */
  readonly createdBy: (linkId: string, compte: string) => void;
  /** Simule un ADMIN qui a supprimé la ligne entre-temps (`admin.ts:443 DELETE`) — `PATCH` y rend 404. */
  readonly supprime: (linkId: string) => void;
  /**
   * REFUSE LA PROCHAINE CRÉATION (#5034) — un `POST /api/v1/links` unique
   * rend `statut` avec `motif`, puis le bouchon redevient nominal. Simule les
   * refus RÉELS de `mintConversationShareLink` (403 non-membre, 403 rang
   * insuffisant, 410 conversation close) sans avoir à les distinguer : le
   * critère de fin de `sheet:link` ne teste qu'UN refus générique (« refus 400
   * du bouchon »), et c'est ce que ce contrôle sert.
   */
  readonly refuseLaProchaineCreation: (motif: string, statut?: number) => void;
  /** Remet `retarde`/`createdBy`/`supprime`/`refuseLaProchaineCreation` ET `lien.actif` à leur état initial — à appeler entre deux témoins. */
  readonly remets: () => void;
};

export const carnetDeBouchon = (lien: LienDeBouchon): CarnetDeBouchon & {
  readonly retardMs: () => number;
  readonly createdByDe: (linkId: string) => string;
  readonly estSupprime: (linkId: string) => boolean;
  readonly refusCreationEnAttente: () => { readonly motif: string; readonly statut: number } | null;
  readonly consommeLeRefusDeCreation: () => void;
} => {
  let retard = 0;
  const proprietaires = new Map<string, string>([[LIEN_DU_FIL, MEMBRE.id]]);
  const supprimes = new Set<string>();
  let refusCreation: { readonly motif: string; readonly statut: number } | null = null;

  return {
    retarde: (ms) => {
      retard = ms;
    },
    createdBy: (linkId, compte) => {
      proprietaires.set(linkId, compte);
    },
    supprime: (linkId) => {
      supprimes.add(linkId);
    },
    refuseLaProchaineCreation: (motif, statut = 400) => {
      refusCreation = { motif, statut };
    },
    remets: () => {
      retard = 0;
      proprietaires.clear();
      proprietaires.set(LIEN_DU_FIL, MEMBRE.id);
      supprimes.clear();
      refusCreation = null;
      lien.actif = true;
    },
    retardMs: () => retard,
    createdByDe: (linkId) => proprietaires.get(linkId) ?? MEMBRE.id,
    estSupprime: (linkId) => supprimes.has(linkId),
    refusCreationEnAttente: () => refusCreation,
    // Un SEUL POST est refusé — sans cette consommation, un témoin qui
    // rejouerait la création après un refus resterait bloqué en refus.
    consommeLeRefusDeCreation: () => {
      refusCreation = null;
    },
  };
};

const attend = (ms: number): Promise<void> => new Promise((resoud) => setTimeout(resoud, ms));

export const routesDuCarnet =
  (etat: EtatDuCarnetDeBouchon, lien: LienDeBouchon, carnet: ReturnType<typeof carnetDeBouchon>) =>
  async ({
    requete,
    url,
    corps,
    json,
  }: {
    readonly requete: IncomingMessage;
    readonly url: URL;
    readonly corps: Buffer;
    readonly json: Reponse;
  }): Promise<boolean> => {
    const chemin = url.pathname;
    if (!chemin.startsWith('/api/v1/links')) return false;

    const porteur = requete.headers.authorization ?? '';
    if (!porteur.startsWith('Bearer ')) {
      json({ error: 'Authentication required', code: 'AUTH_REQUIRED' }, 401);
      return true;
    }
    if (etat.creanceDe(requete)?.genre !== 'membre') {
      json({ error: 'Invalid JWT token', code: 'AUTH_FAILED' }, 401);
      return true;
    }

    /**
     * `PATCH /api/v1/links/:linkId` — la SEULE écriture de ce lot. Elle
     * rejette AVANT tout le corps un lien introuvable (404) ou dont le porteur
     * n'est ni créateur ni modérateur (403), exactement l'ordre de
     * `loadShareLinkForManagement`.
     */
    const misAJour = /^\/api\/v1\/links\/([^/]+)$/.exec(chemin);
    if (misAJour !== null && requete.method === 'PATCH') {
      const linkId = decodeURIComponent(misAJour[1] ?? '');
      if (carnet.retardMs() > 0) await attend(carnet.retardMs());

      const cree = etat.liensCrees.find((ligne) => ligne.linkId === linkId);
      if (carnet.estSupprime(linkId) || (linkId !== LIEN_DU_FIL && cree === undefined)) {
        json({ success: false, error: 'Lien de partage non trouvé', message: 'Lien de partage non trouvé' }, 404);
        return true;
      }
      if (carnet.createdByDe(linkId) !== MEMBRE.id) {
        json(
          { success: false, error: 'Permissions insuffisantes pour modifier ce lien', message: 'Permissions insuffisantes pour modifier ce lien' },
          403,
        );
        return true;
      }

      const soumis = JSON.parse(corps.toString('utf8') || '{}') as Record<string, unknown>;
      const inconnus = Object.keys(soumis).filter((champ) => !CHAMPS_DE_MISE_A_JOUR.includes(champ));
      if (inconnus.length > 0) {
        json({ success: false, error: 'Données invalides', message: 'Données invalides' }, 400);
        return true;
      }

      if (typeof soumis.isActive === 'boolean') {
        if (linkId === LIEN_DU_FIL) lien.actif = soumis.isActive;
        if (cree !== undefined) cree.isActive = soumis.isActive;
      }

      json({ success: true, data: { linkId, isActive: soumis.isActive ?? true }, message: 'Lien mis à jour avec succès' });
      return true;
    }

    /**
     * `POST /api/v1/links` (`routes/links/creation.ts:29`) — la création d'un
     * lien de partage. Le bouchon REFUSE tout champ que `createLinkSchema` ne
     * déclare pas, plutôt que de l'ignorer.
     */
    if (chemin === '/api/v1/links' && requete.method === 'POST') {
      const soumis = JSON.parse(corps.toString('utf8') || '{}') as Record<string, unknown>;
      const inconnus = Object.keys(soumis).filter((champ) => !CHAMPS_DE_LIEN.includes(champ));
      if (inconnus.length > 0) {
        json({ success: false, error: { message: `Unsupported field: ${inconnus.join(', ')}` } }, 400);
        return true;
      }

      // LE REFUS ARMÉ (#5034, `carnet.refuseLaProchaineCreation`) — vérifié
      // AVANT toute branche, exactement comme la passerelle réelle rendrait
      // 403/410 avant d'écrire quoi que ce soit.
      const refus = carnet.refusCreationEnAttente();
      if (refus !== null) {
        carnet.consommeLeRefusDeCreation();
        json({ success: false, error: { message: refus.motif } }, refus.statut);
        return true;
      }

      // `conversationId` (#5034, § 12.10.5) — LA BRANCHE « lien depuis le fil »
      // de `mintConversationShareLink` (`routes/links/utils/share-link-mint.ts:
      // 150-212`) : une conversation EXISTANTE, résolue par id ou identifiant
      // lisible, jamais une conversation neuve.
      const conversationId = soumis.conversationId;
      if (typeof conversationId === 'string') {
        if (conversationId !== CONVERSATION_DU_LECTEUR.id) {
          json({ success: false, error: { message: 'Conversation non trouvée' } }, 404);
          return true;
        }
        const linkId = `mshy_cree_${etat.liensCrees.length + 1}`;
        etat.liensCrees.push({
          id: `lc${etat.liensCrees.length + 1}`,
          linkId,
          identifier: linkId,
          name: typeof soumis.name === 'string' && soumis.name !== '' ? soumis.name : CONVERSATION_DU_LECTEUR.titre,
          isActive: true,
          currentUses: 0,
          maxUses: typeof soumis.maxUses === 'number' ? soumis.maxUses : null,
          expiresAt: typeof soumis.expiresAt === 'string' ? soumis.expiresAt : null,
          conversation: { id: CONVERSATION_DU_LECTEUR.id, title: CONVERSATION_DU_LECTEUR.titre, type: 'group' },
        });
        json({ success: true, data: { linkId, conversationId: CONVERSATION_DU_LECTEUR.id } }, 201);
        return true;
      }

      const titre = (soumis.newConversation as { title?: string } | undefined)?.title;
      if (typeof titre !== 'string' || titre.trim() === '') {
        json({ success: false, error: { message: 'Le titre de la conversation est requis' } }, 400);
        return true;
      }
      const linkId = `mshy_cree_${etat.liensCrees.length + 1}`;
      etat.liensCrees.push({
        id: `lc${etat.liensCrees.length + 1}`,
        linkId,
        identifier: linkId,
        name: typeof soumis.name === 'string' && soumis.name !== '' ? soumis.name : titre,
        isActive: true,
        currentUses: 0,
        maxUses: typeof soumis.maxUses === 'number' ? soumis.maxUses : null,
        expiresAt: typeof soumis.expiresAt === 'string' ? soumis.expiresAt : null,
        conversation: null,
      });
      json({ success: true, data: { linkId, conversationId: `c${etat.liensCrees.length}` } }, 201);
      return true;
    }

    /**
     * `GET /api/v1/links?expand=conversation&include=summary` (`routes/links/
     * user.ts:314`), ET `GET /api/v1/links?q=` (`:513-521`, #5171) — le groupe
     * « Liens » de `/search` : MÊME route, un `q` de plus, jamais une seconde.
     * Le filtre COPIE la loi réelle — `contains` insensible à la casse sur
     * `name` OU `identifier` — et la pagination sert la forme OFFSET RÉELLE
     * (`createPaginationMeta`, `services/gateway/src/utils/response.ts:254`) :
     * `{ total, offset, limit, hasMore }`, `total` compté AVEC le filtre.
     */
    if (chemin === '/api/v1/links' && (requete.method ?? 'GET') === 'GET') {
      const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
      const correspond = (l: Readonly<Record<string, unknown>>): boolean =>
        q === '' ||
        String(l.name ?? '').toLowerCase().includes(q) ||
        String(l.identifier ?? '').toLowerCase().includes(q);
      const pagine = (liste: readonly Readonly<Record<string, unknown>>[]) => ({
        total: liste.length,
        offset: 0,
        limit: liste.length,
        hasMore: false,
      });

      if (etat.lecteurSansRien) {
        const filtres = etat.liensCrees.filter(correspond);
        json({ success: true, data: filtres, pagination: pagine(filtres) });
        return true;
      }

      const tous = [
        // LES LIENS CRÉÉS EN TÊTE : c'est là que le lecteur les cherche, et
        // c'est ce qui rend la création VISIBLE au témoin.
        ...etat.liensCrees,
        {
          id: 'l1',
          linkId: LIEN_DU_FIL,
          identifier: IDENTIFIANT_DU_LIEN_PARTAGE,
          name: 'Ops Lagos',
          // MUTABLE : le MÊME `lien.actif` que l'aperçu, la jonction et
          // `/resolve` relisent — révoquer ce lien le ferme PARTOUT.
          isActive: lien.actif,
          currentUses: 12,
          maxUses: null,
          expiresAt: null,
          conversation: { id: CONVERSATION_DU_LECTEUR.id, title: CONVERSATION_DU_LECTEUR.titre, type: 'group' },
        },
        // Un lien FERMÉ, avec sa capacité et son échéance : c'est la ligne que
        // le tableau de bord ÉCARTE et que l'écran `/links` doit garder.
        {
          id: 'l2',
          linkId: 'mshy_demo',
          identifier: 'demo-sept',
          name: 'Démo septembre',
          isActive: false,
          currentUses: 3,
          maxUses: 10,
          expiresAt: '2026-12-31T12:00:00.000Z',
          conversation: null,
        },
      ];
      const filtres = tous.filter(correspond);
      json({
        success: true,
        data: filtres,
        pagination: pagine(filtres),
        // `meta.summary` — les agrégats de TOUT le carnet. `activeLinks` se
        // DÉCRÉMENTE quand `mshy_lagos` ferme : c'est le compte que le § 12.10.4
        // exige SERVI, jamais recompté sur la page.
        meta: { summary: { totalLinks: 30, activeLinks: ACTIFS_DE_BASE - (lien.actif ? 0 : 1), totalUses: 400 } },
      });
      return true;
    }

    return false;
  };
