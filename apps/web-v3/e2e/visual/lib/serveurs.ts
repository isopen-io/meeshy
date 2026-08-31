import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { AddressInfo, createServer as createSocketServer } from 'node:net';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { franchissementsReseau, mesurePage } from '../../../scripts/mesure-reseau.d.mts';

/**
 * Les deux serveurs que mesure la suite réseau — et la raison pour laquelle
 * elle en monte DEUX.
 *
 * Le livrable de `/l/:token` n'est pas une page : c'est un ORDRE d'appels
 * (résoudre, répondre, PUIS compter le clic). Un gate qui ne regarderait que le
 * navigateur ne verrait jamais la moitié serveur de cet ordre — c'est
 * exactement le défaut que la conception nomme « un correctif dont la valeur
 * n'atteint aucun lecteur » retourné : ici, la moitié invisible est celle qui
 * porte le critère. La passerelle de bouchon est donc un TÉMOIN, pas une
 * commodité : elle date chaque appel qu'elle reçoit.
 *
 * Elle tourne dans le processus du test, donc son horloge est celle des
 * événements CDP : c'est ce qui rend comparable « la 302 est partie » et « le
 * clic est arrivé ».
 */

/**
 * La racine du paquet, calculée avec `__dirname` et non `import.meta.url`.
 *
 * Playwright transpile ses fichiers en CommonJS : `import.meta` y jette
 * (« Cannot use 'import.meta' outside a module ») et le module entier cesse
 * de se charger — donc la suite entière sort en « aucun test trouvé », c'est-
 * à-dire en VERT sur une machine qui ne mesure rien. Le harnais reste donc en
 * CommonJS, comme le chargeur qui l'exécute.
 */
export const RACINE_V3 = join(__dirname, '..', '..', '..');

export type AppelRecu = {
  readonly methode: string;
  readonly chemin: string;
  readonly a: number;
  readonly corps: string;
  /**
   * Les en-têtes REÇUS.
   *
   * Ils sont journalisés pour une raison qui n'est pas de commodité : l'appel de
   * la v3 part SERVEUR-À-SERVEUR, donc l'adresse que la passerelle voit est
   * celle du conteneur — la même pour tous les visiteurs — à moins que l'identité
   * réseau ne VOYAGE. `allowedIpRanges` et `anonymousSession.ipAddress` en
   * dépendent entièrement, et rien d'autre dans cette chaîne ne peut l'attester.
   */
  readonly entetes: Readonly<Record<string, string>>;
};

export type PasserelleDeBouchon = {
  readonly base: string;
  readonly journal: readonly AppelRecu[];
  readonly oublie: () => void;
  /**
   * CE QUE LA PASSERELLE RÉPOND À PARTIR DE MAINTENANT.
   *
   * Les états qui comptent sur l'écran des droits sont des CHANGEMENTS survenus
   * APRÈS l'entrée : l'hôte retire un droit, le lien s'épuise, la place est
   * fermée, la passerelle se tait. Les jouer avec deux bouchons demanderait deux
   * serveurs Next par test (60 s d'attente chacun) et, surtout, un second
   * SERVEUR ne partagerait pas l'état du premier : ce qui doit changer est la
   * RÉPONSE, pas l'adresse. Le réglage est donc mutable, et le test dit à quel
   * moment le monde a changé.
   */
  readonly regle: (reglage: ReglageDeBouchon) => void;
  readonly ferme: () => Promise<void>;
};

/**
 * Ce que la porte d'ADMISSION répond — 201 par défaut, le refus qu'un test
 * demande sinon.
 *
 * Un bouchon qui ne saurait qu'admettre ne prouverait qu'une moitié de l'écran
 * `join`, et c'est justement l'autre que le critère de fin énumère : les sept
 * refus, chacun peint.
 */
export type ReponseDadmission = {
  readonly statut: number;
  readonly code: string;
  readonly suggestedNickname?: string;
};

/**
 * Ce que le 201 dit des DROITS de la place — les quatre booléens que
 * `participantConversationPayload` sert
 * (`services/gateway/src/routes/conversations/link-admission.ts`), sous leurs
 * noms de PASSERELLE.
 *
 * Ils sont ici, dans le bouchon, et pas dans le spec : le bouchon est le TÉMOIN
 * de ce que la passerelle répond, et c'est sa charge — pas une valeur recopiée
 * dans un test — qui doit ressembler à la production. Un spec qui poserait ses
 * propres noms de champs prouverait qu'il sait lire ce qu'il a lui-même écrit.
 *
 * `null` retire les quatre champs : c'est la charge d'une porte qui ne dit rien
 * des droits, et l'écran ne doit alors en fabriquer aucun.
 */
export type DroitsServis = {
  readonly canSendMessages: boolean;
  readonly canSendFiles: boolean;
  readonly canSendImages: boolean;
  readonly allowViewHistory: boolean;
};

export const DROITS_SERVIS: DroitsServis = {
  canSendMessages: true,
  canSendFiles: true,
  canSendImages: true,
  allowViewHistory: true,
};

export const NOM_DU_LIEN = 'Équipe Lagos';
export const DESCRIPTION_DU_LIEN = 'Le canal des opérations de terrain.';
/** La clé CANONIQUE que le serveur rend — celle qui indexe la place (§ 6.1 point 2 bis). */
export const CLE_DU_LIEN = 'mshy_lagos';
export const ECHEANCE_DU_LIEN = '2026-08-12T00:00:00.000Z';
export const LANGUES_PARLEES: readonly string[] = ['en', 'fr', 'yo'];
/** Servi par l'aperçu, JAMAIS attendu dans le HTML : c'est le témoin de la fuite du § 5.1. */
export const CREATEUR_DU_LIEN = 'ibrahim-le-createur';

const json = (reponse: ServerResponse, corps: unknown): void => {
  reponse.writeHead(200, { 'content-type': 'application/json' });
  reponse.end(JSON.stringify(corps));
};

const corpsDe = async (requete: IncomingMessage): Promise<string> => {
  const morceaux: Buffer[] = [];
  for await (const morceau of requete) morceaux.push(Buffer.from(morceau));
  return Buffer.concat(morceaux).toString('utf8');
};

/**
 * Le TYPE que la passerelle déclare pour un média (`image | video | audio |
 * document | text`), déduit de son type MIME comme le fait
 * `ACCEPTED_MIME_TYPES`. Le bouchon en a besoin pour honorer `type=` ; l'écran,
 * lui, ne connaît que ses quatre FAMILLES et n'a pas à savoir que la passerelle
 * en sépare cinq.
 */
const typeDuMime = (mimeType: string): string => {
  const famille = mimeType.toLowerCase().split('/')[0] ?? '';
  if (famille === 'image' || famille === 'video' || famille === 'audio') return famille;
  return famille === 'text' ? 'text' : 'document';
};

const portLibre = async (): Promise<number> =>
  new Promise((resoud) => {
    const sonde = createSocketServer();
    sonde.listen(0, '127.0.0.1', () => {
      const { port } = sonde.address() as AddressInfo;
      sonde.close(() => resoud(port));
    });
  });

const ecoute = (serveur: Server, port: number): Promise<void> =>
  new Promise((resoud) => serveur.listen(port, '127.0.0.1', () => resoud()));

/**
 * La passerelle de bouchon : trois routes, celles que `/l/:token` connaît.
 * `cibleActive` permet à un test de fermer le lien sans changer de serveur.
 */
/**
 * TROIS CHAÎNES, PARCE QUE LA PRODUCTION EN PRODUIT TROIS — et une seule d'entre
 * elles bouge les deux portes.
 *
 * Un jeton `/l/:token` est soit un `ConversationShareLink` (invitation), soit un
 * `TrackingLink` (story, réel, post, humeur, lien externe : tout le § P0). Ce
 * sont deux modèles disjoints, et `GET /anonymous/link/:identifier` n'en connaît
 * qu'un : il rend 404 sur un jeton de tracking, TOUJOURS. Un bouchon qui
 * refuserait « des deux côtés » pour tout jeton raconterait donc une chaîne que
 * la production ne produit jamais — et c'est exactement ce qui a laissé passer
 * un écran servant « Indéterminé » à la moitié du produit.
 *
 *   • `refusParJeton` — une INVITATION close : `resolve` la dit `isActive:false`
 *     et l'aperçu NOMME le refus par un 410. Les deux portes parlent.
 *   • `trackingFermeParJeton` — un lien de TRACKING clos : `resolve` le dit
 *     `isActive:false` avec son `expiresAt` (la valeur du dictionnaire), et
 *     l'aperçu rend 404. Une seule porte parle, et c'est la seule qui répond aux
 *     deux familles.
 *   • `inconnus` — un jeton que la passerelle ne trouve pas : les deux portes
 *     rendent 404, et rien ne doit être NOMMÉ (§ 5.1, oracle d'énumération).
 */
const jetonDuChemin = (chemin: string): string =>
  decodeURIComponent(chemin.split('?')[0]?.split('/').filter(Boolean).pop() ?? '');

/**
 * Ce que la porte de la PLACE — `POST /anonymous/refresh` — répond.
 *
 * Elle est distincte de l'aperçu du lien, et c'est tout le sujet de l'écran des
 * droits : une place et un lien ne meurent pas ensemble. Le bouchon doit donc
 * pouvoir dire « le lien est mort mais la place tient » (410 à l'aperçu, 200
 * ici) et l'inverse (200 à l'aperçu, 401 ici) — deux chaînes que la production
 * produit, et qu'aucun bouchon à une seule porte ne peut jouer.
 *
 *   • `statut: 200` — nominal ; les droits servis sont ceux de `droits`, sauf
 *     `droitsRelus`, qui joue l'hôte qui a CHANGÉ les droits depuis l'entrée ;
 *   • `statut: 401` — état F ; `410` + `code` — état G ;
 *   • `muette: true` — la passerelle ne répond pas du tout (§ 7).
 */
export type ReponseDeRevalidation = {
  readonly statut?: number;
  readonly code?: string;
  readonly droitsRelus?: DroitsServis | null;
  readonly muette?: boolean;
};

/** La langue que le 201 et le 200 rendent quand la demande n'en porte pas. */
export const LANGUE_SERVIE = 'yo';

/**
 * UN MESSAGE, tel que la passerelle le sert — noms de PASSERELLE, jamais ceux
 * de l'écran.
 *
 * `translations` voyage en TABLEAU (`transformTranslationsToArray`,
 * `services/gateway/src/utils/translation-transformer.ts`) : un bouchon qui le
 * servirait en carte prouverait que l'écran sait lire ce que le bouchon a
 * inventé, pas ce que la production envoie. C'est exactement le dépouillement
 * que `carteDesTraductions` fait, et c'est lui qu'on veut exercer.
 */
export type MessageDeBouchon = {
  readonly id: string;
  readonly senderId: string;
  readonly content: string;
  readonly originalLanguage: string;
  readonly translations?: readonly { readonly targetLanguage: string; readonly translatedContent: string }[];
  readonly createdAt: string;
  readonly auteur?: string;
  /**
   * L'auteur est SANS COMPTE. La passerelle le dit par `sender.type`
   * (`Participant.type`, `buildMessageListSelect`) — jamais par un `user` nul,
   * qu'une projection plus pauvre rendrait aussi. C'est ce champ que l'écran
   * lit pour poser le fantôme et le mot « anonyme » de la cible.
   */
  readonly anonyme?: boolean;
};

/** Ce que `POST /conversations/:id/messages` répond — 201 admis quand rien n'est dit. */
export type ReponseDEnvoi = {
  readonly statut?: number;
  readonly code?: string;
};

/** Ce que `GET /sync` rend — le rattrapage du § 6.3 C et le `hasGap` du § 7. */
export type ReponseDeRattrapage = {
  readonly ajoutes?: readonly MessageDeBouchon[];
  /** `hasGap` — le gap de SÉQUENCE. Structurellement faux pour un invité en production. */
  readonly lacune?: boolean;
  /**
   * `truncated` / `hasMore` SANS `nextCursor` — la fenêtre n'est pas couverte et
   * la passerelle ne dit pas où reprendre. C'est le SEUL déclencheur du
   * séparateur « des messages manquent ici » qu'un invité puisse rencontrer en
   * production (`hasGap` exigerait un curseur de séquence que les sessions
   * anonymes n'ont pas), et c'est donc lui que la recette doit jouer.
   */
  readonly tronque?: boolean;
};

/**
 * UNE PIÈCE JOINTE, telle que `GET /conversations/:id/attachments` la sert —
 * noms de PASSERELLE, jamais ceux de l'écran.
 *
 * `transcription` et `translations` sont les DEUX colonnes `Json` de
 * `MessageAttachment`, servies dans leur forme de production :
 * `{ text, language }` pour la première, une CARTE `langue → { transcription,
 * url, format }` pour la seconde. Le dépouillement que l'écran fait
 * (`transcriptTranslationTexts` et sa jumelle pour le médium) n'a de sens que
 * s'il travaille sur cette forme-là : un bouchon qui servirait déjà une carte
 * `langue → texte` prouverait que l'écran sait lire ce que le bouchon a
 * inventé.
 */
export type MediaDeBouchon = {
  readonly id: string;
  readonly fileName: string;
  readonly originalName?: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly fileUrl: string;
  readonly duration?: number;
  readonly createdAt: string;
  readonly transcription?: { readonly text: string; readonly language: string };
  readonly translations?: Readonly<
    Record<
      string,
      { readonly transcription: string; readonly url?: string; readonly format?: string }
    >
  >;
};

export type ReglageDeBouchon = {
  readonly actif?: boolean;
  /** La première page du fil, servie au RENDU SERVEUR (§ 6.3 B, cache-first). */
  readonly messages?: readonly MessageDeBouchon[];
  /** Ce que la GALERIE sert — `GET /conversations/:id/attachments` (écran `media`). */
  readonly medias?: readonly MediaDeBouchon[];
  /** Ce que cette même porte répond — 200 quand rien n'est dit. */
  readonly galerie?: ReponseDEnvoi;
  readonly envoi?: ReponseDEnvoi;
  /**
   * Ce que `GET /conversations/:id/messages` répond — 200 quand rien n'est dit.
   * Un refus ici n'est PAS un fil vide : c'est ce que l'écran doit distinguer.
   */
  readonly lecture?: ReponseDEnvoi;
  readonly rattrapage?: ReponseDeRattrapage;
  readonly refusParJeton?: Readonly<Record<string, string>>;
  /** Jeton de tracking clos → son `expiresAt` ISO, ou `null` s'il n'en a pas. */
  readonly trackingFermeParJeton?: Readonly<Record<string, string | null>>;
  readonly inconnus?: readonly string[];
  /** Ce que `POST /anonymous/join/:linkId` répond — 201 admis quand rien n'est dit. */
  readonly admission?: ReponseDadmission;
  /** Les droits que le 201 sert — les quatre par défaut, `null` pour n'en servir aucun. */
  readonly droits?: DroitsServis | null;
  /** Ce que `POST /anonymous/refresh` répond — 200 nominal quand rien n'est dit. */
  readonly revalidation?: ReponseDeRevalidation;
  /** Ce que l'aperçu déclare du lien, en plus de son nom : `requireAccount`, langues admises… */
  readonly lien?: Readonly<Record<string, unknown>>;
};

export const passerelleDeBouchon = async (
  options?: ReglageDeBouchon,
): Promise<PasserelleDeBouchon> => {
  const journal: AppelRecu[] = [];
  let reglage: ReglageDeBouchon = options ?? {};

  const actif = (): boolean => reglage.actif ?? true;
  const refus = (): Readonly<Record<string, string>> => reglage.refusParJeton ?? {};
  const tracking = (): Readonly<Record<string, string | null>> => reglage.trackingFermeParJeton ?? {};
  const inconnus = (): readonly string[] => reglage.inconnus ?? [];
  const admission = (): ReponseDadmission | null => reglage.admission ?? null;
  const droits = (): DroitsServis | null =>
    reglage.droits === undefined ? DROITS_SERVIS : reglage.droits;
  const revalidation = (): ReponseDeRevalidation => reglage.revalidation ?? {};
  const declare = (): Readonly<Record<string, unknown>> => reglage.lien ?? {};
  const messages = (): readonly MessageDeBouchon[] => reglage.messages ?? [];
  const medias = (): readonly MediaDeBouchon[] => reglage.medias ?? [];
  const envoi = (): ReponseDEnvoi => reglage.envoi ?? {};
  const rattrapage = (): ReponseDeRattrapage => reglage.rattrapage ?? {};

  /**
   * La forme que le fil sert, `sender` compris : `messageDepuis` cherche le nom
   * dans `sender.displayName` puis dans `sender.user`, exactement comme la
   * passerelle le compose (`syncMessageSchema`). Un bouchon plat ferait passer
   * un écran incapable de nommer ses auteurs.
   */
  const messageServi = (message: MessageDeBouchon): Readonly<Record<string, unknown>> => ({
    id: message.id,
    conversationId: 'conversation-1',
    senderId: message.senderId,
    content: message.content,
    originalLanguage: message.originalLanguage,
    translations: message.translations ?? [],
    createdAt: message.createdAt,
    updatedAt: message.createdAt,
    sender: {
      id: message.senderId,
      displayName: message.auteur ?? message.senderId,
      type: message.anonyme === true ? 'anonymous' : 'member',
      user: null,
    },
  });

  /**
   * `languages=` — l'opt-in de bande passante que la passerelle offre (« only
   * these languages are serialized in BOTH text and audio translations »). Le
   * bouchon l'APPLIQUE plutôt que de l'ignorer : un bouchon qui servirait tout
   * quel que soit le paramètre ferait passer un écran qui ne le demande pas.
   */
  const filtreLesLangues = (
    servi: Readonly<Record<string, unknown>>,
    chemin: string,
  ): Readonly<Record<string, unknown>> => {
    const demandees = new URL(chemin, 'https://bouchon.invalid').searchParams.get('languages');
    if (demandees === null) return servi;

    const retenues = new Set(demandees.split(',').map((langue) => langue.trim().toLowerCase()));
    const traductions = Array.isArray(servi.translations) ? servi.translations : [];

    return {
      ...servi,
      translations: traductions.filter(
        (traduction) =>
          typeof traduction === 'object' &&
          traduction !== null &&
          retenues.has(String((traduction as Record<string, unknown>).targetLanguage).toLowerCase()),
      ),
    };
  };

  /**
   * La langue que le visiteur a DÉCLARÉE au formulaire, rendue telle que la
   * passerelle la rend (`participant.language`). Le bouchon la relit du CORPS du
   * POST plutôt que de poser une constante : c'est le rang 1 du Prisme d'un
   * lecteur anonyme, et un bouchon qui l'inventerait prouverait qu'il sait lire
   * ce qu'il a lui-même écrit.
   */
  const langueDemandee = (corps: string): string => {
    try {
      const decode: unknown = JSON.parse(corps);
      const valeur =
        typeof decode === 'object' && decode !== null
          ? (decode as Record<string, unknown>).language
          : null;
      return typeof valeur === 'string' && valeur !== '' ? valeur : LANGUE_SERVIE;
    } catch {
      return LANGUE_SERVIE;
    }
  };

  /** La forme `participantConversationPayload`, partagée par le 201 et le 200. */
  const placeServie = (
    langue: string,
    servis: DroitsServis | null,
  ): Readonly<Record<string, unknown>> => ({
    participant: {
      id: 'participant-1',
      username: 'tolu',
      displayName: 'tolu',
      language: langue,
      ...(servis === null
        ? {}
        : {
            canSendMessages: servis.canSendMessages,
            canSendFiles: servis.canSendFiles,
            canSendImages: servis.canSendImages,
          }),
    },
    conversation: {
      id: 'conversation-1',
      title: NOM_DU_LIEN,
      ...(servis === null ? {} : { allowViewHistory: servis.allowViewHistory }),
    },
  });
  const introuvable = (reponse: ServerResponse): void => {
    reponse.writeHead(404, { 'content-type': 'application/json' });
    reponse.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
  };

  const serveur = createServer(async (requete, reponse) => {
    const chemin = requete.url ?? '';

    /**
     * LE PRÉ-VOL CORS — et pourquoi il n'est pas une commodité de harnais.
     *
     * En production, la zone v3 et la passerelle sont deux ORIGINES : le
     * navigateur d'un invité appelle `gate.meeshy.me` depuis `meeshy.me`, et la
     * passerelle déclare ses origines (`CORS_ORIGINS`, § 4.6). L'îlot du fil
     * bat, rattrape et envoie DEPUIS LE NAVIGATEUR, avec un en-tête
     * `x-session-token` — un en-tête non simple, donc un pré-vol obligatoire.
     * Un bouchon qui ne le servirait pas ferait échouer chaque appel client
     * pour une raison qui n'existe pas en production.
     */
    if (requete.method === 'OPTIONS') {
      reponse.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type,x-session-token,accept',
        'access-control-max-age': '600',
      });
      reponse.end();
      return;
    }
    reponse.setHeader('access-control-allow-origin', '*');

    const corps = requete.method === 'POST' ? await corpsDe(requete) : '';
    journal.push({
      methode: requete.method ?? 'GET',
      chemin,
      a: Date.now(),
      corps,
      entetes: Object.fromEntries(
        Object.entries(requete.headers).flatMap(([nom, valeur]) =>
          typeof valeur === 'string' ? [[nom.toLowerCase(), valeur]] : [],
        ),
      ),
    });

    if (chemin.includes('/anonymous/refresh')) {
      // La passerelle MUETTE : la connexion se ferme sans réponse. C'est ce que
      // le § 7 appelle une coupure, et ce n'est PAS un refus.
      const relecture = revalidation();
      if (relecture.muette === true) {
        reponse.destroy();
        return;
      }

      const statut = relecture.statut ?? 200;
      if (statut !== 200) {
        reponse.writeHead(statut, { 'content-type': 'application/json' });
        reponse.end(
          JSON.stringify({ success: false, error: relecture.code ?? 'UNAUTHORIZED', message: 'refus' }),
        );
        return;
      }

      const servis = relecture.droitsRelus === undefined ? droits() : relecture.droitsRelus;
      json(reponse, { success: true, data: placeServie(LANGUE_SERVIE, servis) });
      return;
    }

    /**
     * LE RATTRAPAGE (§ 6.3 C). Il rend la forme EXACTE de `GET /sync` —
     * `collections.messages.added` et `hasGap` —, jamais une liste plate : c'est
     * l'enveloppe que `routes/sync/index.ts` déclare, et un bouchon plus simple
     * ferait passer un client incapable de lire la vraie.
     */
    if (chemin.startsWith('/api/v1/sync')) {
      const delta = rattrapage();
      json(reponse, {
        success: true,
        data: {
          checkpoint: new Date().toISOString(),
          checkpointSeq: 1,
          collections: {
            messages: {
              added: (delta.ajoutes ?? []).map(messageServi),
              modified: [],
              deleted: [],
            },
          },
          hasMore: delta.tronque === true,
          nextCursor: null,
          hasGap: delta.lacune === true,
          gapAction: delta.lacune === true ? 'full_resync_required' : null,
        },
      });
      return;
    }

    /**
     * LA GALERIE. Le bouchon APPLIQUE le filtre `type=` plutôt que de l'ignorer,
     * pour la raison qui vaut déjà pour `languages=` : un bouchon qui servirait
     * tout quel que soit le paramètre ferait passer un écran qui ne le demande
     * pas — et la puce « Fichiers », qui interroge DEUX types, ne prouverait
     * plus rien.
     */
    if (chemin.includes('/attachments')) {
      const refusDeLaGalerie = reglage.galerie ?? {};
      if (refusDeLaGalerie.statut !== undefined && refusDeLaGalerie.statut !== 200) {
        reponse.writeHead(refusDeLaGalerie.statut, { 'content-type': 'application/json' });
        reponse.end(JSON.stringify({ success: false, error: refusDeLaGalerie.code ?? 'REFUSED' }));
        return;
      }

      const demande = new URL(chemin, 'https://bouchon.invalid').searchParams.get('type');

      json(reponse, {
        success: true,
        data: {
          attachments: medias().filter((media) => demande === null || typeDuMime(media.mimeType) === demande),
        },
      });
      return;
    }

    if (chemin.includes('/messages')) {
      if (requete.method === 'GET') {
        const refusDeLecture = reglage.lecture ?? {};
        if (refusDeLecture.statut !== undefined && refusDeLecture.statut !== 200) {
          reponse.writeHead(refusDeLecture.statut, { 'content-type': 'application/json' });
          reponse.end(JSON.stringify({ success: false, error: refusDeLecture.code ?? 'REFUSED' }));
          return;
        }
        json(reponse, {
          success: true,
          data: {
            messages: messages().map((message) => filtreLesLangues(messageServi(message), chemin)),
          },
        });
        return;
      }

      const refus = envoi();
      if (refus.statut !== undefined && refus.statut !== 201) {
        reponse.writeHead(refus.statut, { 'content-type': 'application/json' });
        reponse.end(JSON.stringify({ success: false, error: refus.code ?? 'REFUSED' }));
        return;
      }

      const ecrit = ((): string => {
        try {
          const decode: unknown = JSON.parse(corps);
          const valeur =
            typeof decode === 'object' && decode !== null
              ? (decode as Record<string, unknown>).content
              : null;
          return typeof valeur === 'string' ? valeur : '';
        } catch {
          return '';
        }
      })();

      reponse.writeHead(201, { 'content-type': 'application/json' });
      reponse.end(
        JSON.stringify({
          success: true,
          data: messageServi({
            id: `servi-${journal.filter((appel) => appel.methode === 'POST' && appel.chemin.includes('/messages')).length}`,
            senderId: 'participant-1',
            content: ecrit,
            originalLanguage: 'fr',
            createdAt: new Date().toISOString(),
            auteur: 'tolu',
          }),
        }),
      );
      return;
    }

    if (chemin.includes('/anonymous/leave')) {
      json(reponse, { success: true, data: { message: 'Session fermee avec succes' } });
      return;
    }

    if (chemin.includes('/resolve')) {
      const jeton = jetonDuChemin(chemin.replace('/resolve', ''));
      if (inconnus().includes(jeton)) {
        introuvable(reponse);
        return;
      }

      const echeance = tracking()[jeton];
      if (echeance !== undefined) {
        json(reponse, {
          success: true,
          data: {
            kind: 'tracking',
            targetType: 'STORY',
            targetId: 'story-interne',
            originalUrl: null,
            isActive: false,
            expiresAt: echeance,
          },
        });
        return;
      }

      json(reponse, {
        success: true,
        data: {
          kind: 'conversation',
          targetType: 'CONVERSATION',
          targetId: 'conv-interne',
          originalUrl: null,
          isActive: refus()[jeton] === undefined && actif(),
          expiresAt: null,
        },
      });
      return;
    }

    if (chemin.includes('/anonymous/join/')) {
      const refusDadmission = admission();
      if (refusDadmission !== null) {
        reponse.writeHead(refusDadmission.statut, { 'content-type': 'application/json' });
        reponse.end(
          JSON.stringify({
            success: false,
            error: refusDadmission.code,
            message: 'refus',
            ...(refusDadmission.suggestedNickname === undefined
              ? {}
              : { suggestedNickname: refusDadmission.suggestedNickname }),
          }),
        );
        return;
      }

      reponse.writeHead(201, { 'content-type': 'application/json' });
      reponse.end(
        JSON.stringify({
          success: true,
          data: {
            sessionToken: 'jeton-de-bouchon',
            ...placeServie(langueDemandee(corps), droits()),
            linkId: CLE_DU_LIEN,
            id: '507f1f77bcf86cd799439011',
          },
        }),
      );
      return;
    }

    if (chemin.includes('/anonymous/link/')) {
      const jeton = jetonDuChemin(chemin);
      // La porte que la production n'ouvre QUE pour une invitation.
      if (inconnus().includes(jeton) || tracking()[jeton] !== undefined) {
        introuvable(reponse);
        return;
      }

      const code = refus()[jeton];
      if (code !== undefined) {
        reponse.writeHead(410, { 'content-type': 'application/json' });
        reponse.end(JSON.stringify({ success: false, error: code, message: 'refus' }));
        return;
      }

      json(reponse, {
        success: true,
        data: {
          id: '507f1f77bcf86cd799439011',
          linkId: CLE_DU_LIEN,
          name: NOM_DU_LIEN,
          description: DESCRIPTION_DU_LIEN,
          expiresAt: ECHEANCE_DU_LIEN,
          maxUses: 20,
          currentUses: 6,
          requireAccount: false,
          requireNickname: true,
          requireEmail: false,
          requireBirthday: false,
          allowedLanguages: [],
          creator: { id: 'u1', username: CREATEUR_DU_LIEN, email: `${CREATEUR_DU_LIEN}@example.com` },
          conversation: { id: 'c1', title: NOM_DU_LIEN, description: DESCRIPTION_DU_LIEN },
          stats: { totalParticipants: 9, spokenLanguages: LANGUES_PARLEES },
          ...declare(),
        },
      });
      return;
    }

    json(reponse, { success: true, data: { clickId: 'clic-1' } });
  });

  const port = await portLibre();
  await ecoute(serveur, port);

  return {
    base: `http://127.0.0.1:${port}`,
    journal,
    oublie: () => {
      journal.length = 0;
    },
    regle: (suite: ReglageDeBouchon) => {
      reglage = { ...reglage, ...suite };
    },
    ferme: () => new Promise((resoud) => serveur.close(() => resoud())),
  };
};

export type ServeurV3 = {
  readonly base: string;
  readonly ferme: () => Promise<void>;
};

const attend = async (url: string, jusqua: number): Promise<void> => {
  for (;;) {
    const vivant = await fetch(url)
      .then((r) => r.ok)
      .catch(() => false);
    if (vivant) return;
    if (Date.now() > jusqua) throw new Error(`le serveur de la v3 n'a pas démarré : ${url}`);
    await new Promise((resoud) => setTimeout(resoud, 250));
  }
};

/**
 * Le serveur de la v3, tel que la production le lance — l'artefact de `next
 * build`, pas le mode développement, dont les octets et les requêtes n'ont
 * rien à voir avec ceux du § 8.3.
 *
 * L'absence de build est une ERREUR, jamais un test ignoré : une mesure dont le
 * prérequis manque doit se voir (§ 9.2), et un `skip` la rendrait verte.
 */
export const serveurDeLaV3 = async (passerelle: string): Promise<ServeurV3> => {
  if (!existsSync(join(RACINE_V3, '.next', 'app-build-manifest.json'))) {
    throw new Error("apps/web-v3 n'est pas construit — lancer d'abord `cd apps/web-v3 && bun run build`");
  }

  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  /**
   * Le binaire LOCAL, jamais `npx`.
   *
   * `npx next start` met DEUX processus entre le harnais et le serveur (`npm
   * exec`, puis un `sh -c`) : le `SIGTERM` de `ferme()` tue le premier et laisse
   * le serveur ORPHELIN. Mesuré sur cette suite — 34 tests montent chacun leur
   * chaîne, donc jusqu'à 34 serveurs Next survivants à ~100 Mo pièce ; la
   * machine finit par les faire tomber en « Test timeout of 120000ms », c'est-à-
   * dire en échec qui n'accuse pas le code testé. Un `detached` + kill de groupe
   * marcherait aussi ; prendre le binaire du paquet est plus simple et supprime
   * les deux intermédiaires plutôt que de les contourner.
   */
  const enfant: ChildProcess = spawn(
    join(RACINE_V3, 'node_modules', '.bin', 'next'),
    ['start', '-p', String(port), '-H', '127.0.0.1'],
    {
      cwd: RACINE_V3,
      env: {
        ...process.env,
        MEESHY_GATEWAY_URL: passerelle,
        // L'origine que le NAVIGATEUR doit joindre pour un média :
        // `fileUrl` est un CHEMIN, et c'est cette base-là que la
        // projection lui donne (`adresseDuMedia`). Dans le harnais les
        // deux valent la même machine ; en production, non.
        NEXT_PUBLIC_API_URL: passerelle,
        // L'URL canonique que les OG annoncent : derrière Traefik l'en-tête
        // `Host` interne n'est pas l'origine publique, et une carte d'aperçu
        // est mise en cache PAR URL (§ 5.4).
        NEXT_PUBLIC_FRONTEND_URL: base,
        NODE_ENV: 'production',
      },
      stdio: 'ignore',
    },
  );

  await attend(`${base}/healthz`, Date.now() + 60_000);

  return {
    base,
    ferme: () =>
      new Promise((resoud) => {
        if (enfant.exitCode !== null || enfant.signalCode !== null) {
          resoud();
          return;
        }
        enfant.once('exit', () => resoud());
        enfant.kill('SIGTERM');
      }),
  };
};

/** Le gate de budget, lancé tel que le critère de fin l'écrit. */
export const budgetDeBundle = (): string =>
  execFileSync('node', ['scripts/check-bundle-budget.mjs'], {
    cwd: RACINE_V3,
    encoding: 'utf8',
  });

/**
 * `scripts/mesure-reseau.mjs`, chargé DYNAMIQUEMENT.
 *
 * Playwright transpile ses specs en CommonJS : un `import` statique du module
 * ESM le ferait passer par la même transformation, et `import.meta` y explose
 * (« Cannot use 'import.meta' outside a module »). L'import dynamique d'une URL
 * calculée passe, lui, par le chargeur ESM de Node.
 *
 * Ce détour existe pour ne PAS réécrire l'arithmétique des plafonds dans le
 * spec : la comparaison à `budgets.json` reste au site unique du § 9.2, sans
 * quoi le gate et son rapport diraient un jour deux choses différentes. La MESURE
 * elle-même — session CDP, écoute des trois événements réseau, bloc `VITALS` —
 * y reste aussi : `mesurePage` est projetée ici pour que le spec l'APPELLE, et
 * la seule chose qu'il en surcharge est l'agent (§ `mesurePage`).
 *
 * Les signatures ne sont pas RECOPIÉES mais reprises par `typeof` du fichier de
 * déclarations du module : une projection recopiée est une jumelle qui dérive au
 * premier paramètre ajouté.
 */
export type MesureReseau = {
  readonly mesurePage: typeof mesurePage;
  readonly franchissementsReseau: typeof franchissementsReseau;
};

export const chargeMesureReseau = async (): Promise<MesureReseau> => {
  const url = pathToFileURL(join(RACINE_V3, 'scripts', 'mesure-reseau.mjs')).href;
  return (await import(url)) as unknown as MesureReseau;
};
