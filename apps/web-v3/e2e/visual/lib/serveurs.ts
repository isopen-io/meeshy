import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { AddressInfo, createServer as createSocketServer } from 'node:net';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { franchissementsReseau, mesurePage } from '../../../scripts/mesure-reseau.d.mts';
import { APPAREILS_DU_BOUCHON, routesDuCompte } from './bouchon-compte';
import {
  placeDeLInvite,
  porteDeLHote,
  routesDuFil,
  SEUIL_DE_TROU,
  type EtatDuFilDeBouchon,
  type FilAnnexe,
  type PieceDeBouchon,
  type PlaceDeLInvite,
  type PorteDeLHote,
} from './bouchon-fil';
import { creanceSelonLaPasserelle, lienParDefaut, routesDuLien, type LienDeBouchon } from './bouchon-lien';
import {
  AUTRE_CONVERSATION,
  CONVERSATION_DU_LECTEUR,
  CONVERSATION_RICHE,
  INVITE,
  messagesInitiaux,
  messagesRiches,
  NOM_DU_LIEN,
  PRESENCES_INITIALES,
  REACTIONS_INITIALES,
  type MessageServi,
} from './bouchon-monde';
import { bouchonSocket, magasinDeReactions, type BouchonSocket, type Emission, type MagasinDeReactions } from './bouchon-socket';

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
 *
 * CE FICHIER MONTE, IL NE SERT PAS. Les routes vivent par famille, chacune
 * nommant l'émetteur qu'elle copie : le fil (`bouchon-fil.ts`), le lien
 * (`bouchon-lien.ts`), le compte (`bouchon-compte.ts`), le socket
 * (`bouchon-socket.ts`) ; le monde qu'elles servent (`bouchon-monde.ts`) est
 * ré-exporté ici pour que les specs gardent une seule porte d'entrée. L'état
 * — places, lien, messages, réactions, pièces, présences — est construit UNE
 * fois ici et passé PAR RÉFÉRENCE aux quatre familles : un spec qui règle
 * `passerelle.lien.actif = false` fait répondre l'aperçu, la jonction, le
 * battement ET la liste, comme la ligne `ConversationShareLink` le fait en
 * production (leçon 422).
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

export {
  AUTRE_CONVERSATION,
  CONVERSATION_DU_LECTEUR,
  CONVERSATION_RICHE,
  CREATEUR_DU_LIEN,
  DESCRIPTION_DU_LIEN,
  IDENTIFIANT_DU_LIEN_PARTAGE,
  INVITE,
  LIEN_DU_FIL,
  MEMBRE,
  messagesRiches,
  NOM_DU_LIEN,
  PAIR_ANGLOPHONE,
  PAIR_HISPANOPHONE,
  PISTE_TRADUITE,
  PRENOM_DU_LECTEUR,
  PSEUDO_DEJA_PRIS,
  PSEUDO_SUGGERE,
  type MessageServi,
} from './bouchon-monde';
export { lienParDefaut, type LienDeBouchon } from './bouchon-lien';

export type AppelRecu = {
  readonly methode: string;
  readonly chemin: string;
  readonly a: number;
  readonly corps: string;
  /** Le statut RENDU — ce qu'un critère de fin veut lire (« 201 observé ») ; `null` tant que la réponse n'est pas partie. */
  readonly statut: number | null;
};

/** Le corps, en OCTETS : un téléversement multipart ne se relit pas en texte. */
const corpsDe = async (requete: IncomingMessage): Promise<Buffer> => {
  const morceaux: Buffer[] = [];
  for await (const morceau of requete) morceaux.push(Buffer.from(morceau));
  return Buffer.concat(morceaux);
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

export type PasserelleDeBouchon = {
  readonly base: string;
  readonly journal: readonly AppelRecu[];
  readonly oublie: () => void;
  readonly ferme: () => Promise<void>;
  /** Le socket, monté sur le même serveur — et sa porte de test. */
  readonly socket: BouchonSocket;
  /** Les sessions invitées dont la place est ACTIVE : en retirer une, c'est `isActive:false` en base (état F). */
  readonly placesActives: Set<string>;
  /**
   * Les sessions que le serveur a RÉVOQUÉES (`revokeShareLinkGuests`) : la ligne existe,
   * `isActive:false` — le middleware rend 410 `GUEST_ACCESS_REVOKED` sur toute porte
   * `authOptional`, là où un jeton inventé retombe en visiteur (`middleware/auth.ts:561`, `:758-772`).
   */
  readonly sessionsRevoquees: Set<string>;
  /**
   * Le lien de partage, ÉTAT MUTABLE que les specs règlent : `actif: false` fait répondre
   * 410 au battement et à la liste (état G), `LINK_INACTIVE` à l'aperçu et `LINK_EXPIRED` à
   * la jonction ; chaque champ produit le refus que la passerelle produirait.
   */
  readonly lien: LienDeBouchon;
  /**
   * La place de l'invité en TROIS couches (`bouchon-fil.ts` › `PlaceDeLInvite`) : les `allow*`
   * du lien (`place.lien`, ce que l'hôte règle sur le lien), l'instantané du join que le
   * battement rend, le delta de l'hôte. Un spec règle le LIEN (`reinitialise({ … })`) — jamais
   * une réponse (leçon 422).
   */
  readonly place: PlaceDeLInvite;
  /** L'hôte, qui change les droits d'un invité après le join — `PATCH …/participants/:id/rights`, et son événement. */
  readonly hote: PorteDeLHote;
  /** L'invité que la place désigne ; `nom` est le pseudo POSTÉ à la jonction, comme `displayName` en base. */
  readonly invite: { readonly id: string; nom: string };
  /**
   * Le curseur GLOBAL du compte du membre (`sequenceService.currentSeq`) — ce
   * que `/sync` compare au `seq` annoncé (`routes/sync/index.ts:274-279`).
   * `creuseUnTrou` l'avance au-delà de `GAP_THRESHOLD` : le prochain `/sync`
   * d'un MEMBRE qui annonce son `seq` rend `hasGap` — jamais celui d'un invité,
   * dont le curseur vaut 0 par la loi du serveur (§ 7).
   */
  readonly sync: { curseur: number; conversations: Readonly<Record<string, unknown>>[] };
  readonly creuseUnTrou: () => void;
  /**
   * Les préférences du lecteur PAR conversation, telles que
   * `PUT /user-preferences/conversations/:id` les écrit et que `GET
   * /conversations` les RESERT dans `userPreferences[0]` — l'état partagé que
   * la ligne `UserConversationPreferences` tient en base.
   *
   * Exposée pour la même raison que `lien` et `sync` : un spec qui vient d'en
   * poser une doit pouvoir remettre le monde d'aplomb pour le suivant. La
   * passerelle NE FILTRE PAS sur `isArchived` — c'est au client de le faire
   * (voir `bouchon-compte.ts`), et c'est ce que la suite mesure.
   */
  readonly preferences: Map<string, { isMuted?: boolean; isArchived?: boolean }>;
  /**
   * Les conversations que le lecteur a masquées pour lui — `DELETE
   * …/delete-for-me`, une porte à SENS UNIQUE que la passerelle applique bien,
   * elle, dans son `whereClause` (`core-list.ts:176-190`). Exposée pour la
   * remettre d'aplomb : un spec qui franchit cette porte la ferme pour TOUS
   * ceux qui le suivent, et un témoin voisin devient rouge pour une raison qui
   * n'est pas la sienne (mesuré).
   */
  readonly masquees: Set<string>;
  /** Les réactions, l'état ABSOLU partagé par la route et par le socket. */
  readonly reactions: MagasinDeReactions;
  /** Les pièces téléversées, par identifiant — servies par `GET /attachments/file/*`. */
  readonly pieces: ReadonlyMap<string, PieceDeBouchon>;
  /**
   * Une pièce DÉPOSÉE par un autre — ce qu'un `POST /attachments/upload` d'un
   * pair aurait laissé —, servie par `GET /attachments/file/*` ; ce que
   * `attachmentServi` en rend s'attache à un message.
   */
  readonly deposeUnePiece: (piece: { readonly nom: string; readonly type: string; readonly octets: Buffer; readonly dureeMs?: number }) => PieceDeBouchon;
  /**
   * La présence des pairs, telle que `connectedUsers` la tient — projetée par
   * la fiche de conversation (`isOnline`, gardée par la visibilité), par
   * `presence:snapshot` et par `user:status` (`bouchon-socket.ts`). Un spec la
   * remet d'aplomb par `reinitialise`.
   */
  readonly presences: Map<string, boolean> & { readonly reinitialise: () => void };
  /** Un message qui ARRIVE pendant que le lecteur n'est pas là — servi par la liste ET par `/sync`, jamais par le socket. */
  readonly ajouteUnMessage: (message: MessageServi) => void;
  readonly messages: () => readonly MessageServi[];
};

export const passerelleDeBouchon = async (options?: {
  readonly actif?: boolean;
  readonly refusParJeton?: Readonly<Record<string, string>>;
  /** Jeton de tracking clos → son `expiresAt` ISO, ou `null` s'il n'en a pas. */
  readonly trackingFermeParJeton?: Readonly<Record<string, string | null>>;
  readonly inconnus?: readonly string[];
  /**
   * Le lecteur connecté n'a NI conversation NI lien — l'état vide du tableau de
   * bord, celui qu'un compte neuf voit en premier et qu'un bouchon toujours
   * garni ne fait jamais visiter.
   */
  readonly lecteurSansRien?: boolean;
}): Promise<PasserelleDeBouchon> => {
  const journal: AppelRecu[] = [];
  const conversationId = CONVERSATION_DU_LECTEUR.id;
  const placesActives = new Set<string>([INVITE.session]);
  const sessionsRevoquees = new Set<string>();
  const lien = lienParDefaut();
  const place = placeDeLInvite();
  const invite = { id: INVITE.id, nom: INVITE.nom, session: INVITE.session, place };
  const sync = { curseur: 0, conversations: [] as Readonly<Record<string, unknown>>[] };
  const reactions = magasinDeReactions(REACTIONS_INITIALES);
  const pieces = new Map<string, PieceDeBouchon>();
  const presences = Object.assign(new Map<string, boolean>(PRESENCES_INITIALES), {
    reinitialise: (): void => {
      presences.clear();
      PRESENCES_INITIALES.forEach(([userId, isOnline]) => presences.set(userId, isOnline));
    },
  });
  const messages: MessageServi[] = messagesInitiaux(conversationId);
  const ajouteUnMessage = (message: MessageServi): void => {
    messages.push(message);
  };
  let compteur = 100;
  const identifiants = { suivant: () => `m${(compteur += 1)}` };

  /** La créance, lue comme `createAuthContext` la lit (`bouchon-lien.ts` › `creanceSelonLaPasserelle`). */
  const creanceDe = (requete: IncomingMessage) => creanceSelonLaPasserelle(requete, placesActives);

  /**
   * Le SECOND fil — les six formes de `cible/rich.png`, à leur PROPRE adresse
   * (`/chats/fil-riche`, le jeton que `jetons-de-vues.json` déclare pour la vue
   * `rich`). Elles vivaient jusqu'ici dans l'instance éphémère d'un seul spec,
   * donc hors de portée de `compare-rendu.js`, qui interroge cette passerelle.
   */
  const filsAnnexes = new Map<string, FilAnnexe>([
    [
      CONVERSATION_RICHE.id,
      { id: CONVERSATION_RICHE.id, titre: CONVERSATION_RICHE.titre, membres: CONVERSATION_RICHE.membres, messages: messagesRiches(CONVERSATION_RICHE.id) },
    ],
  ]);

  const etatDuFil: EtatDuFilDeBouchon = {
    conversationId,
    filsAnnexes,
    titre: NOM_DU_LIEN,
    placesActives,
    lien,
    sync,
    reactions,
    pieces,
    identifiants,
    invite,
    messages: () => messages,
    ajouteUnMessage,
    presences,
    membres: CONVERSATION_DU_LECTEUR.membres,
    socket: () => bouchon,
    creanceDe,
  };
  const duFil = routesDuFil(etatDuFil);
  const duLien = routesDuLien({
    conversationId,
    lien,
    placesActives,
    sessionsRevoquees,
    invite,
    messages: () => messages,
    creanceDe,
    jetons: {
      actif: options?.actif ?? true,
      refusParJeton: options?.refusParJeton ?? {},
      trackingFermeParJeton: options?.trackingFermeParJeton ?? {},
      inconnus: options?.inconnus ?? [],
    },
  });
  const preferences = new Map<string, { isMuted?: boolean; isArchived?: boolean }>();
  const masquees = new Set<string>();
  const profil: Record<string, string> = {};
  const appareils = APPAREILS_DU_BOUCHON.map((appareil) => ({ ...appareil }));
  const duCompte = routesDuCompte({
    creanceDe,
    lecteurSansRien: options?.lecteurSansRien ?? false,
    preferences,
    masquees,
    profil,
    appareils,
  });

  const serveur = createServer(async (requete, reponse) => {
    const chemin = requete.url ?? '';
    /**
     * CORS, comme `server.ts:404-410` de la passerelle : `@fastify/cors` avec
     * `credentials: true`, l'origine RÉFLÉCHIE quand `config/cors-origins.ts`
     * l'admet, les méthodes de `config/cors-methods.ts`, et les en-têtes
     * demandés par le préflight réfléchis (le défaut de `@fastify/cors`) —
     * `x-session-token` et `authorization` compris. Le module de participation
     * parle à la passerelle depuis une AUTRE origine que le document ; sans ces
     * en-têtes, chaque `fetch` du navigateur est bloqué et le bouchon raconte
     * une chaîne que la production ne produit pas (mesuré : `/sync`, `refresh`
     * et le repli REST rendus « -1 », d'où cinq cas du § 6.5 rouges à tort).
     */
    const origine = requete.headers.origin;
    if (typeof origine === 'string') {
      reponse.setHeader('access-control-allow-origin', origine);
      reponse.setHeader('access-control-allow-credentials', 'true');
      reponse.setHeader('vary', 'Origin');
    }
    if (requete.method === 'OPTIONS') {
      reponse.writeHead(204, {
        'access-control-allow-methods': 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        'access-control-allow-headers': String(requete.headers['access-control-request-headers'] ?? 'content-type'),
        'access-control-max-age': '600',
      });
      reponse.end();
      return;
    }
    // PUT et DELETE portent eux aussi un corps : `PUT /user-preferences/…`
    // envoie les champs à changer, et le lire ici est ce qui permet au bouchon
    // de TENIR l'état que la passerelle tient (leçon : un bouchon qui répond
    // 200 sans écrire fait passer un client qui n'a rien changé).
    const avecCorps = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(requete.method ?? 'GET');
    const octets = avecCorps ? await corpsDe(requete) : Buffer.alloc(0);
    const appel: { -readonly [K in keyof AppelRecu]: AppelRecu[K] } = { methode: requete.method ?? 'GET', chemin, a: Date.now(), corps: octets.toString('utf8'), statut: null };
    journal.push(appel);
    const ecrisLEnTete = reponse.writeHead.bind(reponse);
    reponse.writeHead = ((statut: number, ...reste: unknown[]) => {
      appel.statut = statut;
      return (ecrisLEnTete as (...args: unknown[]) => ServerResponse)(statut, ...reste);
    }) as typeof reponse.writeHead;
    const url = new URL(chemin, 'http://bouchon');
    const json = (corps: unknown, statut = 200): void => {
      reponse.writeHead(statut, { 'content-type': 'application/json' });
      reponse.end(JSON.stringify(corps));
    };
    const erreur = (statut: number, code: string, message: string, extra: Record<string, unknown> = {}): void => {
      reponse.writeHead(statut, { 'content-type': 'application/json' });
      reponse.end(JSON.stringify({ success: false, error: code, message, ...extra }));
    };

    // L'ORDRE est celui des chemins les plus PRÉCIS d'abord : le fil (`/conversations/:id…`) avant
    // le compte (`/conversations` nu), le lien (`/links/:key/members`, `/links/:identifier`) avant
    // le compte (`/links` nu) — comme Fastify les distingue par leur route, pas par un préfixe.
    if (await duFil({ requete, reponse, url, corps: octets, json, erreur })) return;
    if (await duLien({ requete, url, corps: octets, json, erreur })) return;
    if (duCompte({ requete, url, corps: octets, json })) return;

    json({ success: true, data: { clickId: 'clic-1' } });
  });

  const bouchon = bouchonSocket({
    serveur,
    placesActives,
    identifiants,
    reactions,
    presences,
    // Les rooms que `_joinUserConversations` joint à l'authentification : les
    // deux conversations que `GET /conversations` sert au membre, et le fil
    // riche. Sans elles, la LISTE n'entendrait aucune frappe.
    conversationsDuMembre: [conversationId, AUTRE_CONVERSATION.id, CONVERSATION_RICHE.id],
  });

  const port = await portLibre();
  await ecoute(serveur, port);

  return {
    base: `http://127.0.0.1:${port}`,
    journal,
    oublie: () => {
      journal.length = 0;
      (bouchon.recus as Emission[]).splice(0, bouchon.recus.length);
    },
    ferme: async () => {
      await bouchon.ferme();
      await new Promise<void>((resoud) => serveur.close(() => resoud()));
    },
    socket: bouchon,
    placesActives,
    sessionsRevoquees,
    place,
    hote: porteDeLHote(etatDuFil),
    invite,
    lien,
    sync,
    creuseUnTrou: () => {
      sync.curseur += SEUIL_DE_TROU + 1;
    },
    preferences,
    masquees,
    reactions,
    pieces,
    deposeUnePiece: ({ nom, type, octets, dureeMs }) => {
      const id = `a${identifiants.suivant().slice(1)}`;
      const piece: PieceDeBouchon = {
        id,
        fileUrl: `/api/v1/attachments/file/${id}/${encodeURIComponent(nom)}`,
        originalName: nom,
        mimeType: type,
        fileSize: octets.length,
        octets,
        duration: dureeMs ?? null,
      };
      pieces.set(id, piece);
      return piece;
    },
    presences,
    ajouteUnMessage,
    messages: () => messages,
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
  const enfant: ChildProcess = spawn(
    'npx',
    ['next', 'start', '-p', String(port), '-H', '127.0.0.1'],
    {
      cwd: RACINE_V3,
      env: {
        ...process.env,
        MEESHY_GATEWAY_URL: passerelle,
        // Le module de participation parle à la passerelle depuis le NAVIGATEUR :
        // ici le bouchon est joignable à la même adresse des deux côtés.
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
