/**
 * La table des routes REST du gateway — SOURCE UNIQUE du couple
 * (module, préfixe, identité) pour toute route qui ne demande RIEN de plus
 * qu'un montage Fastify simple (#4278).
 *
 * ## Le défaut structurel que cette table ferme
 *
 * `route-registration.ts` portait, au 2026-08-30 (avant ce lot), 65 actes
 * d'enregistrement écrits à la main sur 447 lignes — la liste des préfixes
 * était donc répartie sur tout le fichier au lieu d'être lisible d'un coup
 * d'œil, et c'est structurellement ce qui a permis les quatre défauts de
 * préfixe que #4277 a corrigés : rien n'obligeait un enregistrement à
 * déclarer son préfixe. `RouteRegistrationEntry.prefix`
 * est ici un champ REQUIS (pas de `?`) : une entrée qui l'omet ne COMPILE
 * PAS. Voir `src/__tests__/unit/routes/route-registration-table.test.ts`
 * pour la preuve — un `@ts-expect-error` qui devient inutilisé, donc rouge
 * sous ts-jest, dès que `prefix` (ou `module`, ou `name`) redevient
 * optionnel.
 *
 * ## Une SEULE convention d'adressage — jamais trois
 *
 * Avant ce lot, le fichier écrivait son préfixe de trois façons : un
 * littéral complet en dur (`{ prefix: '/api' }`), `API_PREFIX` seul, ou rien
 * du tout (préfixe vide par OMISSION de l'objet d'options). Les trois
 * adresses que ces formes produisaient restent légitimes — mais sous une
 * SEULE écriture désormais : un champ `prefix: string` TOUJOURS renseigné,
 * TOUJOURS posé de la même façon par la boucle de `registerAllRoutes`
 * (`{ prefix: entry.prefix }`). Un préfixe vide (`''`, l'alias racine de
 * #4277) reste possible — mais jamais IMPLICITE : l'entrée `voice-analysis-
 * legacy-alias` ci-dessous le dit en toutes lettres, en commentaire, à côté
 * de la valeur. Le seul préfixe littéral-en-dur restant (`'/api'`, l'alias
 * non versionné des pièces jointes) ne vit PAS ici : voir § suivant.
 *
 * ## Ce qui N'EST PAS dans cette table, et pourquoi
 *
 * Une liste explicite qui cache ses conventions derrière une boucle
 * générique est moins lisible qu'une liste qui les montre. Huit montages
 * ont besoin de PLUS qu'un `{ module, prefix }` et restent des appels
 * explicites dans `registerAllRoutes` (`route-registration.ts`), chacun avec
 * sa raison en commentaire au site :
 *
 *  - le bloc de TRADUCTION (`translationRoutes`, `translationBlockingRoutes`,
 *    `translationJobsRoutes`) : décore `translationService` /
 *    `messagingService` / `mentionService` sur le contexte encapsulé AVANT
 *    d'enregistrer trois sous-modules qui les lisent ;
 *  - `userDeletionsRoutes` et `registerTusRoutes` : prennent `basePath`, pas
 *    `prefix` — ces deux plugins calculent eux-mêmes leurs chemins absolus
 *    (le second en dérive le `Location` qu'il répond), et leur passer un
 *    `prefix` Fastify ADDITIONNERAIT les deux préfixages ;
 *  - `conversationRoutes` et `postRoutes` : enveloppés dans une fonction
 *    anonyme — pas par accident, mais parce que c'est CETTE forme anonyme
 *    que porte `route-manifest.json` (labels `anonyme~2`, 39 routes, et
 *    `anonyme~10`, 52 routes). Un appel direct au module nommé
 *    changerait le libellé qu'expose #4276 et ferait rougir
 *    `route-manifest-ratchet` sans qu'aucune route n'ait bougé — `postRoutes`
 *    décore en prime `orphanMediaCleanup` avant de s'exécuter ;
 *  - `attachmentRoutes` / `attachmentLegacyFileRoutes` : couple à risque
 *    (#4187, #4324 — le double montage des pièces jointes), sous témoin de
 *    régression DÉDIÉ qui relit `route-registration.ts` verbatim
 *    (`attachments-unversioned-mount.test.ts`) ; les y laisser explicites,
 *    inchangés, évite toute dérive de texte face à ce témoin ;
 *  - `voiceRoutesPlugin` : ses options (`audioTranslateService`) se
 *    calculent à l'enregistrement depuis la disponibilité du client ZMQ —
 *    une donnée de `deps`, pas une constante.
 *
 * ## Les trois collisions d'import DISPARAISSENT (critère 3)
 *
 * Deux paires de modules partagent LE MÊME nom de fonction à la source :
 * `invitationRoutes` (déclaré identiquement dans `routes/admin/invitations.ts`
 * ET `routes/invitations.ts`) et le bloc de traduction ci-dessus
 * (`translationRoutes` dans `routes/translation.ts` ET
 * `routes/translation-non-blocking.ts` — resté hors table, § précédent, mais
 * la même règle d'import s'y applique). Une troisième paire,
 * `messagesRoutes` (`admin/messages.ts`) / `messageRoutes`
 * (`messages.ts`), ne collisionne pas au sens JS (noms déjà distincts) mais
 * collisionnait en LECTURE — un singulier et un pluriel qu'on confond en
 * diagonale, exactement le biais qui a permis les défauts de préfixe de
 * #4277.
 *
 * Avant ce lot, la seule façon de compiler la première paire était un alias
 * `import { invitationRoutes as publicInvitationRoutes } from …` — un nom
 * INVENTÉ au site d'import, dont le choix devenait de facto la seule
 * identité lisible d'un lecteur pressé. Ici, chaque paire s'importe par
 * NAMESPACE (`import * as X from '...'`) : la fonction garde son nom réel
 * (`X.invitationRoutes`), aucun alias n'est à choisir pour compiler, et
 * l'identité qu'un lecteur retient est le champ `name` de la table — pas
 * l'alias que quelqu'un a dû inventer.
 */

import type { FastifyInstance } from 'fastify';
import { apiBasePath } from '@meeshy/shared/api/prefix';

import { authRoutes } from './auth';
import { passwordResetRoutes } from './password-reset';
import { twoFactorRoutes } from './two-factor';
import { magicLinkRoutes } from './magic-link';
import { linksRoutes } from './links';
import { syncRoutes } from './sync';
import { trackingLinksRoutes } from './tracking-links';
import { anonymousRoutes } from './anonymous';
import { communityRoutes } from './communities';
import { adminMePermissionsRoutes } from './admin/me-permissions';
import { dashboardRoutes } from './admin/dashboard';
import { userAdminRoutes } from './admin/users';
import { reportRoutes } from './admin/reports';
import { reportCreationRoutes } from './reports';
// Namespace — voir « Les trois collisions d'import DISPARAISSENT » ci-dessus.
import * as AdminInvitations from './admin/invitations';
import { analyticsRoutes } from './admin/analytics';
import { languagesRoutes } from './admin/languages';
import * as AdminMessages from './admin/messages';
import { registerContentRoutes } from './admin/content';
import { anonymousUsersAdminRoutes } from './admin/anonymous-users';
import { systemRankingsRoutes } from './admin/system-rankings';
import { broadcastRoutes } from './admin/broadcasts';
import { adminPostRoutes } from './admin/posts';
import { agentAdminRoutes } from './admin/agent';
import { agentTopicsRoutes } from './admin/agent-topics';
import { routeUsageAdminRoutes } from './admin/route-usage';
import { userRoutes } from './users';
import meRoutes from './me';
import { mePermissionsRoutes } from './me/permissions';
import { meCategoriesRoutes } from './me/categories';
import { accountDeletionRoutes } from './account-deletion';
import { directoryAvailabilityRoutes } from './directory/availability';
import { directoryPeopleRoutes } from './directory/people';
import { directoryPersonRoutes } from './directory/person';
import { directoryPresenceRoutes } from './directory/presence';
import { directoryBlocksRoutes } from './directory/blocks';
import { directoryFriendRequestsRoutes } from './directory/friend-requests';
import { directoryContactsRoutes } from './directory/contacts';
import { pushTokenRoutes } from './push-tokens';
import conversationPreferencesRoutes from './conversation-preferences';
import communityPreferencesRoutes from './community-preferences';
import conversationEncryptionRoutes from './conversation-encryption';
import signalProtocolRoutes from './signal-protocol';
import affiliateRoutes from './affiliate';
import { userStatsRoutes } from './user-stats';
import { maintenanceRoutes } from './maintenance';
// Namespace — voir « Les trois collisions d'import DISPARAISSENT » ci-dessus.
import * as MessagesModule from './messages';
import messageReadStatusRoutes from './message-read-status';
import { conversationReceiptsRoutes } from './conversations/receipts';
import mentionRoutes from './mentions';
import reactionRoutes from './reactions';
import { notificationRoutes } from './notifications';
import { friendRequestRoutes } from './friends';
// Namespace — voir « Les trois collisions d'import DISPARAISSENT » ci-dessus.
import * as PublicInvitations from './invitations';
import callRoutes from './calls';
import { voiceProfileRoutes } from './voice-profile';
import { voiceAnalysisRoutes, voiceAnalysisLegacyAliasRoutes } from './voice-analysis';
import { appRoutes } from './app';
import { healthProbeRoutes } from './health';

const API_PREFIX = apiBasePath();

/**
 * Signature exacte que `FastifyInstance.register()` accepte pour son premier
 * argument — dérivée de Fastify plutôt que reconstruite à la main, pour ne
 * jamais diverger d'un type que ce module ne possède pas.
 */
export type RoutePlugin = Parameters<FastifyInstance['register']>[0];

/**
 * Une ligne de la table. Les TROIS champs sont REQUIS — voir § critère 2 en
 * tête de fichier : c'est ce `prefix: string` (pas `prefix?: string`) qui
 * rend structurellement impossible d'oublier un préfixe, plutôt que de
 * compter sur une revue pour le remarquer.
 */
export interface RouteRegistrationEntry {
  /** Identité canonique de la route — CE que `route-manifest.json` et un lecteur doivent retenir, jamais l'alias d'import. */
  readonly name: string;
  /** Toujours une chaîne explicite. Vide (`''`) uniquement quand un commentaire local le justifie. */
  readonly prefix: string;
  readonly module: RoutePlugin;
}

/**
 * 60 entrées (#4359 en a ajouté une, `me-categories` ; #4349 en ajoute une,
 * `conversation-receipts`), réparties en QUATRE segments plutôt qu'une liste
 * plate — et ce n'est pas une préférence de mise en page.
 *
 * ## Pourquoi quatre tables, et pas une
 *
 * `route-manifest/collect.ts` étiquette toute route captée sous un plugin
 * SANS NOM (`anonyme`) via un compteur GLOBAL, PARTAGÉ entre TOUTES les
 * fonctions anonymes de `registerAllRoutes` — y compris celles imbriquées
 * profondément à l'intérieur de modules que ce fichier ne voit jamais (ex.
 * les routeurs par catégorie de `routes/me/preferences/index.ts`, ou les
 * sous-routes de `routes/posts/index.ts`). Ce compteur incrémente dans
 * l'ORDRE D'EXÉCUTION réel, pas dans l'ordre du texte : déplacer une
 * entrée SIMPLE (donc NOMMÉE — `meRoutes`, par exemple) avant ou après un
 * des montages ANONYMES de `route-registration.ts` (traduction,
 * `conversationRoutes`, `postRoutes`) ne change RIEN à l'étiquette de
 * `meRoutes` elle-même, mais PEUT décaler celle de tout ce qui s'enregistre
 * anonymement À L'INTÉRIEUR de `meRoutes` — et donc rendre
 * `route-manifest-ratchet` rouge sans qu'aucune route n'ait bougé.
 *
 * Mesuré empiriquement pendant ce lot (pas seulement raisonné) : rassembler
 * les 57 entrées en UNE seule boucle placée après les huit montages
 * spéciaux a fait décaler `anonyme~9`/`anonyme~10` (`routes/me/preferences`
 * et `routes/posts`) exactement comme prévu. La seule façon de garder le
 * manifeste identique est de préserver la position RELATIVE de chaque
 * segment face aux montages spéciaux qui l'encadrent dans
 * `route-registration.ts` — d'où la coupe en quatre, nommées par leur
 * POSITION (« avant X ») et non par une famille métier : la coupure est une
 * contrainte de Fastify, pas une catégorie qu'un lecteur devrait chercher à
 * comprendre.
 *
 * `ROUTE_TABLE` reste exportée, concaténation ORDONNÉE des quatre — c'est
 * elle que documentent et testent les invariants globaux (unicité des
 * `name`, ordre `admin-invitations` avant `invitations`, décompte). Seul
 * `route-registration.ts` a besoin des quatre segments séparément.
 */

/** Avant `userDeletionsRoutes` (basePath) et le montage de `conversationRoutes`. */
export const ROUTE_TABLE_BEFORE_USER_DELETIONS: readonly RouteRegistrationEntry[] = [
  // ── Authentification ──────────────────────────────────────────────────
  { name: 'auth', prefix: `${API_PREFIX}/auth`, module: authRoutes },
  { name: 'auth-password-reset', prefix: `${API_PREFIX}/auth`, module: passwordResetRoutes },
  { name: 'auth-two-factor', prefix: `${API_PREFIX}/auth/2fa`, module: twoFactorRoutes },
  { name: 'auth-magic-link', prefix: `${API_PREFIX}/auth`, module: magicLinkRoutes },
] as const;

/** Après `conversationRoutes`, avant le couple `attachmentRoutes` / `attachmentLegacyFileRoutes`. */
export const ROUTE_TABLE_BEFORE_ATTACHMENTS: readonly RouteRegistrationEntry[] = [
  // ── Conversations, liens, communautés ────────────────────────────────
  { name: 'links', prefix: API_PREFIX, module: linksRoutes },
  { name: 'sync', prefix: API_PREFIX, module: syncRoutes },
  { name: 'tracking-links', prefix: API_PREFIX, module: trackingLinksRoutes },
  { name: 'anonymous-participation', prefix: API_PREFIX, module: anonymousRoutes },
  { name: 'communities', prefix: API_PREFIX, module: communityRoutes },

  // ── Administration ────────────────────────────────────────────────────
  { name: 'admin-me-permissions', prefix: `${API_PREFIX}/admin`, module: adminMePermissionsRoutes },
  { name: 'admin-dashboard', prefix: `${API_PREFIX}/admin`, module: dashboardRoutes },
  { name: 'admin-users', prefix: API_PREFIX, module: userAdminRoutes },
  { name: 'admin-reports', prefix: `${API_PREFIX}/admin/reports`, module: reportRoutes },
  { name: 'reports', prefix: `${API_PREFIX}/reports`, module: reportCreationRoutes },
  { name: 'admin-invitations', prefix: `${API_PREFIX}/admin/invitations`, module: AdminInvitations.invitationRoutes },
  { name: 'admin-analytics', prefix: `${API_PREFIX}/admin/analytics`, module: analyticsRoutes },
  { name: 'admin-languages', prefix: `${API_PREFIX}/admin/languages`, module: languagesRoutes },
  { name: 'admin-messages', prefix: `${API_PREFIX}/admin/messages`, module: AdminMessages.messagesRoutes },
  { name: 'admin-content', prefix: `${API_PREFIX}/admin`, module: registerContentRoutes },
  { name: 'admin-anonymous-users', prefix: `${API_PREFIX}/admin`, module: anonymousUsersAdminRoutes },
  { name: 'admin-rankings', prefix: `${API_PREFIX}/admin`, module: systemRankingsRoutes },
  { name: 'admin-broadcasts', prefix: `${API_PREFIX}/admin/broadcasts`, module: broadcastRoutes },
  { name: 'admin-posts', prefix: `${API_PREFIX}/admin`, module: adminPostRoutes },
  { name: 'admin-agent', prefix: `${API_PREFIX}/admin/agent`, module: agentAdminRoutes },
  { name: 'admin-agent-topics', prefix: `${API_PREFIX}/admin/agent`, module: agentTopicsRoutes },
  { name: 'admin-route-usage', prefix: `${API_PREFIX}/admin`, module: routeUsageAdminRoutes },

  // ── Utilisateur, annuaire ────────────────────────────────────────────
  { name: 'users', prefix: API_PREFIX, module: userRoutes },
  { name: 'me-preferences', prefix: `${API_PREFIX}/me`, module: meRoutes },
  { name: 'me-permissions', prefix: `${API_PREFIX}/me`, module: mePermissionsRoutes },
  // Cinq routes déplacées de `/me/preferences/categories` (#4359, suivi de
  // #4182) — même patron que `me-permissions` juste au-dessus : montage
  // AUTONOME au même préfixe, l'ancienne adresse restant servie comme alias
  // déprécié depuis `routes/me/preferences/categories.ts`.
  { name: 'me-categories', prefix: `${API_PREFIX}/me`, module: meCategoriesRoutes },
  { name: 'account-deletion', prefix: `${API_PREFIX}/account/deletion`, module: accountDeletionRoutes },
  { name: 'directory-availability', prefix: `${API_PREFIX}/directory`, module: directoryAvailabilityRoutes },
  { name: 'directory-people', prefix: `${API_PREFIX}/directory`, module: directoryPeopleRoutes },
  { name: 'directory-person', prefix: `${API_PREFIX}/directory`, module: directoryPersonRoutes },
  { name: 'directory-presence', prefix: `${API_PREFIX}/directory`, module: directoryPresenceRoutes },
  { name: 'directory-blocks', prefix: `${API_PREFIX}/directory`, module: directoryBlocksRoutes },
  { name: 'directory-friend-requests', prefix: `${API_PREFIX}/directory`, module: directoryFriendRequestsRoutes },
  { name: 'directory-contacts', prefix: `${API_PREFIX}/directory`, module: directoryContactsRoutes },

  // ── Préférences, préférences dérivées, sécurité applicative ──────────
  { name: 'push-tokens', prefix: API_PREFIX, module: pushTokenRoutes },
  { name: 'conversation-preferences', prefix: API_PREFIX, module: conversationPreferencesRoutes },
  { name: 'community-preferences', prefix: API_PREFIX, module: communityPreferencesRoutes },
  { name: 'conversation-encryption', prefix: API_PREFIX, module: conversationEncryptionRoutes },
  { name: 'signal-protocol', prefix: API_PREFIX, module: signalProtocolRoutes },
  { name: 'affiliate', prefix: API_PREFIX, module: affiliateRoutes },
  { name: 'user-stats', prefix: API_PREFIX, module: userStatsRoutes },
  { name: 'maintenance', prefix: API_PREFIX, module: maintenanceRoutes },

  // ── Messages ──────────────────────────────────────────────────────────
  { name: 'messages', prefix: API_PREFIX, module: MessagesModule.default },
  { name: 'message-read-status', prefix: API_PREFIX, module: messageReadStatusRoutes },
  // La COLLECTION unique d'accusés (#4349, suivi de #4179) : deux adresses,
  // `POST` et `GET /conversations/:conversationId/receipts`. Montage AUTONOME
  // au même préfixe que `message-read-status` juste au-dessus, dont les quatre
  // portes historiques sont devenues des adaptateurs de ce module — même patron
  // que `me-categories` face à `me-preferences` (#4359).
  { name: 'conversation-receipts', prefix: API_PREFIX, module: conversationReceiptsRoutes },
  { name: 'mentions', prefix: API_PREFIX, module: mentionRoutes },
] as const;

/** Après `registerTusRoutes` (basePath), avant `voiceRoutesPlugin`. */
export const ROUTE_TABLE_BEFORE_VOICE_PLUGIN: readonly RouteRegistrationEntry[] = [
  { name: 'reactions', prefix: API_PREFIX, module: reactionRoutes },
  { name: 'notifications', prefix: API_PREFIX, module: notificationRoutes },
  { name: 'friend-requests', prefix: API_PREFIX, module: friendRequestRoutes },
  { name: 'invitations', prefix: API_PREFIX, module: PublicInvitations.invitationRoutes },
  // ── Appels, voix ──────────────────────────────────────────────────────
  { name: 'calls', prefix: API_PREFIX, module: callRoutes },
  { name: 'voice-profile', prefix: `${API_PREFIX}/voice/profile`, module: voiceProfileRoutes },
  { name: 'voice-analysis', prefix: API_PREFIX, module: voiceAnalysisRoutes },
  {
    name: 'voice-analysis-legacy-alias',
    // Vide et EXPLICITE : c'est l'alias RACINE déprécié de #4277 critère 1
    // (cinq routes vivaient hors `/api/v1` par défaut d'adressage ; l'alias
    // les sert désormais sciemment, avec ses propres en-têtes de
    // dépréciation posés PAR LE MODULE — voir `voiceAnalysisLegacyAliasRoutes`
    // dans `routes/voice-analysis.ts`). Avant ce lot, cette route ne recevait
    // AUCUN objet d'options ; `prefix: ''` est la même adresse, dite au lieu
    // d'être sous-entendue.
    //
    // ── La conséquence de PÉRIMÈTRE, assumée (#4367 critère 1) ────────────
    //
    // Ce qui précède motive l'ADRESSE. Il ne dit rien de ce que cette adresse
    // NE REÇOIT PAS, et c'est la moitié qui manquait : les trois en-têtes
    // `Deprecation` / `Sunset` / `Link` s'adressent à un CLIENT — aucune règle
    // de proxy, de WAF ou de journalisation ne les lit. Une telle règle s'ancre
    // sur un PRÉFIXE DE CHEMIN. Ces cinq adresses (`GET|POST
    // /attachments/:attachmentId/analysis`, `POST /attachments/batch/analysis`,
    // `GET|POST /voice/analysis`) sont donc hors de TOUTE règle ancrée sur
    // `/api`, et le rester jusqu'au retrait du 2027-02-25 INCLUS : un alias
    // déprécié est servi jusqu'à son `sunset`, la dépréciation ne le retire
    // pas du périmètre, elle annonce sa fin.
    //
    // L'alias N'EST PAS déplacé sous `/api` pour autant — ce serait retirer
    // aux appelants, avant l'échéance, l'adresse qu'on vient de leur promettre
    // de servir jusque-là.
    //
    // Mesuré au 2026-08-30, et c'est ce qui rend la conséquence tolérable
    // AUJOURD'HUI : aucune règle vivante n'est ainsi ancrée sur le chemin
    // d'accès de production. Prod et staging routent par HÔTE
    // (`Host(gate.meeshy.me)` / `Host(gate.staging.meeshy.me)` →
    // `gateway:3000`, TOUS chemins, `infrastructure/docker/compose/
    // docker-compose.{prod,staging}.yml`) : il n'y a pas de porte `/api` à
    // franchir, ce qui explique le `200` observé sur staging. Les `handle
    // /api/*` du `Caddyfile` et les `location /api/` des quatre confs nginx qui
    // relaient vers la passerelle (`default.conf`, `dev.conf`,
    // `production.conf`, `ssl-optimized.conf`) décrivent une topologie
    // mono-hôte que ce dépôt ne déploie pas : Caddy n'est référencé par aucun
    // compose, trois de ces confs sont sur la liste de suppression de
    // `scripts/cleanup-production.sh` et la quatrième n'est référencée nulle
    // part ; seul `static-files.conf` est monté, et il ne relaie rien vers la
    // passerelle. Le seul ancrage `/api` VIVANT du dépôt est le routeur
    // LAN de développement `gateway-ip` (`docker-compose.local.yml`,
    // `Host(192.168.1.171) && PathPrefix('/api')`) : sous lui, ces cinq
    // adresses tombent chez `frontend-ip` — l'illustration exacte de la
    // conséquence décrite ici.
    //
    // La conséquence porte donc sur ce qui viendrait APRÈS — et, déjà,
    // sur une règle INTERNE : les 57 entrées de `ROUTES_SURVEILLEES`
    // (`services/route-usage.service.ts`, #4275) commencent TOUTES par
    // `/api/v1/`, et un témoin le fige. Le compteur d'accès compte bien ces
    // cinq adresses dans sa table brute, mais ne les MATÉRIALISE pas dans la
    // portée `watched` que sert la route S5 — soit le mécanisme même censé
    // gouverner leur retrait. Toute règle ancrée sur `/api` — quota, WAF,
    // journal d'API, catalogue — doit donc nommer ces cinq chemins
    // explicitement jusqu'au `sunset`. Le témoin
    // `__tests__/route-manifest/unprefixed-mounts.ts` tient cette décision et
    // rougit si un module rejoint la racine sans la sienne.
    prefix: '',
    module: voiceAnalysisLegacyAliasRoutes,
  },
] as const;

/** Après `postRoutes`, jusqu'à la fin de `registerAllRoutes`. */
export const ROUTE_TABLE_AFTER_POSTS: readonly RouteRegistrationEntry[] = [
  // ── Amorçage applicatif, diagnostics ─────────────────────────────────
  { name: 'app-bootstrap', prefix: API_PREFIX, module: appRoutes },
  { name: 'health-probes', prefix: `${API_PREFIX}/health`, module: healthProbeRoutes },
] as const;

/**
 * Concaténation ORDONNÉE des quatre segments — voir le commentaire au-dessus
 * de `ROUTE_TABLE_BEFORE_USER_DELETIONS` pour pourquoi ils sont séparés dans
 * `route-registration.ts`. C'est CETTE constante que les témoins et la
 * documentation consultent : l'ordre relatif de ses 60 entrées entre elles
 * est identique à celui dans lequel `registerAllRoutes` les enregistre
 * réellement (les quatre segments, mis bout à bout, plus les huit montages
 * spéciaux qui les séparent et qui n'y figurent pas).
 */
export const ROUTE_TABLE: readonly RouteRegistrationEntry[] = [
  ...ROUTE_TABLE_BEFORE_USER_DELETIONS,
  ...ROUTE_TABLE_BEFORE_ATTACHMENTS,
  ...ROUTE_TABLE_BEFORE_VOICE_PLUGIN,
  ...ROUTE_TABLE_AFTER_POSTS,
] as const;
