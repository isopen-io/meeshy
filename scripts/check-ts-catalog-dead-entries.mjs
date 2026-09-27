#!/usr/bin/env node
// Cliquet de dette du catalogue d'endpoints TypeScript (#5372, suite de #4889).
//
// LE DÉFAUT QU'IL FERME
//
// Même défaut que son jumeau Swift (`check-swift-catalog-dead-entries.mjs`),
// sur l'autre catalogue GÉNÉRÉ : `packages/shared/api/endpoints.ts` porte
// l'en-tête « GÉNÉRÉ, ne pas éditer à la main » et est régénéré depuis
// `services/gateway/route-manifest.json`
// (`cd packages/shared && npm run api-endpoints:generate`), protégé en plus
// par un cliquet de régénération
// (`packages/shared/api/__tests__/endpoints-manifest-ratchet.test.ts`) qui
// rougit à la moindre divergence avec une régénération fraîche. Un marqueur
// posé à la main sur une entrée serait donc écrasé OU rejeté par ce cliquet
// avant même la prochaine régénération — la dette « sans appelant » doit donc
// se garder à côté du catalogue, jamais dedans, exactement comme côté Swift.
//
// MÉTHODOLOGIE
//
// 1. Depuis #7716, chaque NAMESPACE du catalogue est un module généré
//    (`packages/shared/api/endpoints/<groupe>.ts`, nom de fichier = namespace
//    en kebab-case) et chaque ENTRÉE y est un `export const clé = …` — ou
//    `export { clé_ as clé }` quand la clé est un mot réservé (`me.export`).
//    `endpoints.ts` ne fait plus que les réunir dans `API_ENDPOINTS`, à côté
//    d'`API_PATH_TEMPLATES` et d'`API_PATH_METHODS` : les entrées se lisent
//    dans les modules, jamais dans l'index.
// 2. Un module généré porte une entrée par déclaration, sur une ligne ; les
//    commentaires qui citent un chemin ne commencent pas par `export` et ne
//    sont donc jamais pris pour des entrées.
// 3. Un APPELANT est une occurrence de `API_ENDPOINTS.namespace.entrée`, ou —
//    la forme du web depuis #7716 — `alias.entrée` dans un fichier qui importe
//    le module du groupe en espace de noms (`import * as alias from
//    '…/api/endpoints/<groupe>'`), dans l'arbre CLIENT (`apps/web`,
//    `packages/shared` hors les fichiers qui déclarent le catalogue), HORS
//    répertoires `__tests__` et fichiers `*.test.ts(x)` / `*.spec.ts(x)`.
// 4. Le compte de dette est le nombre d'entrées SANS AUCUNE occurrence ainsi
//    définie. Cliquet à DEUX SENS, comme `check-type-debt.sh` et son jumeau
//    Swift : régression si le compte DÉPASSE la référence, amélioration NON
//    ENREGISTRÉE si le compte baisse sans que la référence ne soit abaissée.
//
// COHÉRENCE AVEC #4889
//
// #4889 rapporte 444 entrées et 277 sans appelant — ce script mesure
// exactement les deux mêmes nombres. Ce n'est pas garanti par construction
// (son jumeau Swift diverge légèrement du comptage manuel de #4889, pour la
// raison écrite dans son propre en-tête) ; ici la méthodologie mécanique
// rejoint la mesure manuelle. La référence ci-dessous reste ancrée sur CE
// script, pas sur #4889 : c'est SA stabilité et son auto-test qui font
// foi pour la suite.
//
// --self-test : un monde synthétique (deux namespaces, quelques entrées, des
// appelants connus) prouve le comptage, puis le cliquet à deux sens, puis que
// le parseur sait borner l'objet API_ENDPOINTS sans déborder sur
// API_PATH_METHODS voisin (un faux négatif classique : compter des chemins
// littéraux comme des entrées de catalogue).
//
// EXCEPTIONS CONNUES (#5427)
//
// Quatre entrées mesurées en instruisant #5373 étaient des FAUX MORTS (trois
// depuis #7716 : `static.byFilename` a gagné un appelant par le catalogue) : la
// route est réellement appelée en production, mais jamais via
// `API_ENDPOINTS.ns.entrée` — la seule forme que ce script reconnaît comme
// appelant. Un marqueur manuel, documenté par cas et vérifié par grep avant
// écriture, est plus honnête qu'une heuristique qui devinerait un chemin
// (cf. le rejet symétrique dans `endpoint-literal-audit.ts`, § « une liste
// d'exemptions serait pire ») — et contrairement à une liste qui grossirait
// en silence, `applyKnownLiveExceptions` rougit si l'une d'elles cesse de
// correspondre à une entrée réellement morte (voir plus bas).
const KNOWN_LIVE_VIA_NON_STANDARD_REFERENCE = new Set([
  // `GET /api/v1/l/:token` — atteinte par NAVIGATION DIRECTE du navigateur
  // (lien partagé), jamais par un appel `fetch` typé. Chemin `/l/${token}`
  // écrit à la main dans plusieurs sites de composition de lien partageable :
  // `apps/web/lib/utils/link-parser.ts:116-117`,
  // `apps/web/components/chat/message-with-links.tsx`.
  'l.byToken',
  // `GET /api/v1/u/:username` — navigation directe via des liens `<Link
  // href={\`/u/${username}\`}>` écrits à la main dans des dizaines de sites
  // (profils, mentions), jamais via `API_ENDPOINTS.u.byUsername`. Exemples :
  // `apps/web/components/common/bubble-message/MessageNameDate.tsx`,
  // `apps/web/components/v2/MessageBubble.tsx`.
  'u.byUsername',
  // `PATCH`/`DELETE /api/v1/guest-sessions/me` — appelée en production par le
  // SDK iOS (`ShareLinkService` → `GuestSessionsEndpoint.me`), hors du périmètre
  // `SEARCH_ROOTS` de ce script (`apps/web`, `packages/shared`). Son appelant web
  // construisait le chemin à la main dans l'ancienne refonte v3, retirée du dépôt
  // depuis (#5994) : la route reste appelée, l'exception reste juste.
  'guestSessions.me',
]);

import { readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CATALOG_FILE = 'packages/shared/api/endpoints.ts';
const GROUPS_DIR = 'packages/shared/api/endpoints';

const SEARCH_ROOTS = ['apps/web', 'packages/shared'];

const EXCLUDED_DIR_NAMES = new Set(['__tests__', 'node_modules', '.next', 'dist', 'test-results']);
const TEST_FILE_RE = /\.(test|spec)\.tsx?$/;


const listSourceFiles = (absRoot, relRoot) => {
  const out = [];
  const walk = (absDir, relDir) => {
    let names;
    try {
      names = readdirSync(absDir);
    } catch {
      return;
    }
    for (const name of names) {
      if (EXCLUDED_DIR_NAMES.has(name)) continue;
      const absPath = join(absDir, name);
      const relPath = relDir ? `${relDir}/${name}` : name;
      const st = statSync(absPath);
      if (st.isDirectory()) {
        walk(absPath, relPath);
      } else if ((name.endsWith('.ts') || name.endsWith('.tsx')) && !TEST_FILE_RE.test(name)) {
        out.push(relPath);
      }
    }
  };
  walk(absRoot, relRoot);
  return out;
};

// Depuis #7716, chaque namespace est un MODULE généré
// (`packages/shared/api/endpoints/<groupe>.ts`) : une entrée par
// `export const clé =`, et `export { clé_ as clé };` pour une clé qui est un
// mot réservé (`me.export`). L'index `endpoints.ts` ne fait que les réunir
// dans `API_ENDPOINTS` — ce n'est plus là que les entrées se lisent.
const EXPORT_CONST_RE = /^export const ([A-Za-z_$][\w$]*) =/gm;
const EXPORT_ALIAS_RE = /^export \{ [A-Za-z_$][\w$]* as ([A-Za-z_$][\w$]*) \};$/gm;

export const parseGroupModule = (source) => [
  ...[...source.matchAll(EXPORT_CONST_RE)].map((m) => m[1]),
  ...[...source.matchAll(EXPORT_ALIAS_RE)].map((m) => m[1]),
];

/** `api-legacy-attachments.ts` → `apiLegacyAttachments` (inverse de `groupFileName`, build-catalog.ts). */
export const namespaceOfGroupFile = (fileName) =>
  fileName.replace(/\.ts$/, '').replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

// Un APPELANT a deux formes : `API_ENDPOINTS.ns.clé` (l'objet réuni), et —
// la forme du web depuis #7716 — un import du module de groupe en espace de
// noms (`import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin'`)
// suivi de `adminEndpoints.clé`. L'alias est lu dans l'import de CHAQUE
// fichier : aucun nom n'est imposé à l'appelant.
const GROUP_IMPORT_RE = /import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+['"][^'"]*api\/endpoints\/([a-z0-9-]+)(?:\.js)?['"]/g;
const escapeRe = (text) => text.replace(/[$]/g, '\\$&');

export const callersIn = (contents, nsNames) => {
  const viaIndex = [...contents.matchAll(new RegExp(`API_ENDPOINTS\\.(${nsNames.join('|')})\\.([A-Za-z_$][\\w$]*)`, 'g'))].map(
    (m) => `${m[1]}.${m[2]}`,
  );
  const viaGroups = [...contents.matchAll(GROUP_IMPORT_RE)].flatMap(([, alias, file]) =>
    [...contents.matchAll(new RegExp(`(?<![\\w$.])${escapeRe(alias)}\\.([A-Za-z_$][\\w$]*)`, 'g'))].map(
      (m) => `${namespaceOfGroupFile(file)}.${m[1]}`,
    ),
  );
  return [...viaIndex, ...viaGroups];
};

// La référence est ancrée sur CE script (voir méthodologie ci-dessus), pas sur
// le comptage manuel de #4889. Qui la baisse doit avoir mesuré une vraie
// baisse ; qui la relève documente ici pourquoi une entrée neuve est morte à
// la naissance.
//
// 277 → 276 (#5430) : `API_ENDPOINTS.admin.shareLinksByIdReveal` a reçu son
// premier appelant hors test — `apps/web/app/admin/share-links/page.tsx`,
// qui l'appelle désormais pour réparer les contrôles « Copier »/« Ouvrir ».
//
// 276 → 272 (#5427) : `l.byToken`, `static.byFilename`, `u.byUsername`,
// `guestSessions.me` retirées du compte de dette — quatre faux morts, voir
// `KNOWN_LIVE_VIA_NON_STANDARD_REFERENCE` ci-dessus.
//
// 272 → 269 (#5423) : les trois routes de sondage mortes (`conversation`,
// `detectLanguage`, `status`) sont retirées du catalogue avec leurs routes.
//
// 269 → 270 (#3690) : `users.meReferralCode` (`GET /users/me/referral-code`,
// nouvelle route) — morte à la naissance PAR CONSTRUCTION : le milestone
// « Parrainage attribué et boucles virales » sépare la route gateway (cette
// issue) de ses appelants clients, portés par les issues sœurs (#3691 web,
// et les équivalents iOS/Android). Le catalogue déclare la route avant que
// la première surface ne l'appelle — à retirer de ce compte le jour où l'une
// de ces issues câble un premier appelant.
//
// 270 → 271 (#3600) : `posts.byPostIdMediaByMediaIdExport`
// (`GET /posts/:postId/media/:mediaId/export`, export watermarké côté
// serveur) — morte à la naissance PAR CONSTRUCTION, même forme que
// `users.meReferralCode` ci-dessus : cette issue livre la route serveur
// (watermark sharp/ffmpeg, cache) et son exposition dans les catalogues
// générés ; l'appelant web (bouton d'export sur un média de post) est un
// travail d'écran séparé, à ouvrir en issue de suivi.
//
// 271 → 266 (#5424) : cinq entrées retirées du catalogue généré — quatre
// routes d'exploitation (`cleanup`, `stats`, `userStatus`, `test`) filtrées
// par `packages/shared/api/ops-only-routes.ts` (jamais destinées à un
// client), et `info` dont la route serveur elle-même a été retirée
// (`route-registration.ts`, périmée et sans appelant mesuré).
//
// 266 → 267 (#5547) : `me.engagement` (`GET /me/engagement`, écran de
// consultation « Progression ») — morte à la naissance PAR CONSTRUCTION,
// même forme que `users.meReferralCode` (#3690) ci-dessus : cette issue
// livre la route gateway (lecture des compteurs/paliers/streak, #5530) et
// son exposition dans les catalogues générés ; l'appelant web-v2 (l'écran
// « Progression ») est un travail d'écran séparé, pas encore ouvert — voir
// le corps de la PR qui livre cette route pour le détail du périmètre
// différé.
//
// 267 → 268 (#3635) : `me.terms` (`GET`/`PUT /me/terms`, signal + action de
// re-consentement CGU versionné) — morte à la naissance PAR CONSTRUCTION,
// même forme que `me.engagement` (#5547) ci-dessus : cette issue livre la
// route gateway et son exposition dans les catalogues générés ; l'écran de
// ré-acceptation (iOS/Android/web) qui l'appellera est un travail client à
// part, ouvert séparément (#5716).
//
// 268 → 269 (#5743) : `me.meeshMint` (`POST /me/meesh/mint`, la frappe d'une
// Meesh). La raison DIFFÈRE des deux précédentes, et c'est pourquoi elle est
// écrite plutôt que rangée sous « même forme que » : cette route A un appelant
// client — `mintMeesh` dans `apps/web/src/lib/api/engagement.ts` — mais il
// ne passe PAS par ce catalogue. La v3.1 n'importe `@meeshy/shared/api/endpoints`
// nulle part : ses 444 adresses se paieraient avant le premier pixel (D-14), et
// chaque kilo-octet y est mesuré par un gate. Elle adresse donc ses routes par
// un chemin littéral, ce qui rend MORTE au sens de ce cliquet toute entrée
// `me.*` qu'elle consomme — `me.engagement` l'est déjà pour exactement ce
// motif, et le sera tant que la v3.1 ne pourra pas importer un sous-ensemble
// du catalogue.
//
// Ce qu'il faudrait pour la ressusciter, et qui n'est pas de ce lot : un
// catalogue SCINDABLE, dont un client puisse tirer trois adresses sans en
// embarquer 444.
//
// 269 → 270 (#3954) : `posts.byPostIdObjectsByObjectIdResponses`
// (`POST`/`DELETE`/`GET /posts/:postId/objects/:objectId/responses`, table
// légère votes/réponses des stickers interactifs, O10) — morte à la
// naissance PAR CONSTRUCTION, même forme que `users.meReferralCode` (#3690)
// et `me.engagement` (#5547) ci-dessus : le kind `interactive` du canvas
// reste RÉSERVÉ au contrat (`RESERVED_KINDS`, #3953, non traité ici) — aucun
// client ne peut encore poser un tel sticker, donc aucun n'appelle ces
// routes. #3954 livre le contrat serveur et son exposition dans les
// catalogues générés ; les appelants (iOS/web/Android) sont le périmètre de
// #3953, une issue distincte.
//
// 270 → 276 (#4317) : `conversations.byConversationIdClearHistory`,
// `.byConversationIdRestoreForMe`, `messages.bulkDeleteForMe`,
// `.byMessageIdDeleteForMe`, `.byMessageIdRestoreForMe` et
// `user.deletedConversations` — six gestes utilisateur qui vivaient sous
// `/api` sans jamais avoir été versionnés migrent enfin sous `/api/v1`
// (adresse CANONIQUE, en plus de leur alias legacy déprécié). Mortes à la
// naissance PAR CONSTRUCTION, même forme que `usersByUserIdBan` (#5528,
// miroir Swift) ci-dessus : les trois clients continuent d'appeler l'adresse
// legacy — aucun n'a besoin de migrer dans l'immédiat, le retrait de l'alias
// restant gouverné par le compteur d'accès nul (#4275). Faire pointer un
// client vers la nouvelle adresse est un travail à part, pas ouvert par ce
// lot.
//
// 276 → 277 (#6280) : `posts.mediaByMediaIdCaptionTranslate`
// (`POST /posts/media/:mediaId/caption/translate`, traduction à la demande de
// la LÉGENDE d'un média — un contenu distinct du texte du post). Morte à la
// naissance DANS CE COMPTAGE, par construction : son appelant est le SDK iOS
// (`PostService.requestMediaCaptionTranslation`, catalogue Swift, où elle
// n'est pas morte), et ce script ne balaie que `apps/web` (legacy gelé) et
// `packages/shared` — pas `apps/web-v2`. Même forme que
// `posts.byPostIdTranslate`, déjà sans appelant ici pour la même raison.
// 277 → 278 (#6822) : `admin.usersByUserIdRestore`
// (`POST /admin/users/:userId/restore`, l'inverse du soft-delete). Morte à la
// naissance DANS CE COMPTAGE, même raison que les dizaines d'autres entrées
// `admin.usersByUserId*` déjà mortes ci-dessus : ce script ne balaie pas
// `apps/web-v2`, seul client de l'administration — voir la note sur
// `posts.mediaByMediaIdCaptionTranslate`. `restoreUser` existait côté
// service sans aucun appelant AVANT cette issue ; il en gagne un ici (la
// route), la console n'ayant pas encore d'action « restaurer ».
// 278 → 279 (#6861) : `admin.conversations`
// (`GET /admin/conversations`, le listing de l'instance au rang
// d'administration). Morte à la naissance DANS CE COMPTAGE, même raison que
// `admin.usersByUserIdRestore` juste au-dessus : ce script ne balaie que
// `apps/web` (legacy gelé) et `packages/shared`, jamais `apps/web-v2` — seul
// client de l'administration, et qui appelle cette route par son chemin
// littéral (`lib/api/admin-conversations.ts`, #6862).
//
// NOTE DE RÉSOLUTION : ce lot et #6822 ont relevé cette référence EN PARALLÈLE,
// chacun de 277 vers 278, pour des routes DIFFÉRENTES. Les deux valeurs étaient
// identiques par coïncidence, pas par accord. La valeur ci-dessous est MESURÉE
// sur l'arbre fusionné, jamais additionnée : additionner aurait donné 281 et
// fait rougir le cliquet dans l'AUTRE sens (amélioration non enregistrée), ce
// qu'un cliquet à deux sens sanctionne autant qu'une régression.
// 279 → 282 (#6851) : `admin.usersByUserIdSessions`,
// `admin.usersByUserIdSessionsBySessionId` et
// `admin.usersByUserIdSecurityEvents` — l'historique de connexion d'un membre
// (sessions listées, session révoquée, événements de sécurité). Mortes à la
// naissance DANS CE COMPTAGE, même raison que les dizaines d'autres entrées
// `admin.usersByUserId*` ci-dessus : ce script ne balaie que `apps/web`
// (legacy gelé) et `packages/shared`, jamais `apps/web-v2` — seul client de
// l'administration, et celui qui les appellera. La route est SERVIE et testée
// (`admin/user-sessions.test.ts`) ; c'est son écran qui reste à écrire.
//
// Valeur MESURÉE sur l'arbre fusionné avec le dev qui porte déjà #6861, comme
// la note de résolution ci-dessus l'impose — jamais additionnée.
// 282 → 284 (#7377) : `me.starredMessages` (`GET /me/starred-messages`) et
// `me.starredMessagesByMessageId` (`PUT`/`DELETE
// /me/starred-messages/:messageId`) — la liste et l'écriture du favori de
// message. Mortes à la naissance PAR CONSTRUCTION : #7377 livre la moitié
// SERVEUR seule, et les entrées sont GÉNÉRÉES depuis le manifeste au moment où
// la route est montée, avant qu'aucun client ne l'appelle. Leurs appelants
// sont suivis : #7378 (le geste web) et #7286 (l'écran web) côté `apps/web-v2`
// — que ce script ne balaie pas, voir la note sur
// `posts.mediaByMediaIdCaptionTranslate` —, et #7379 côté iOS (catalogue
// Swift). Valeur MESURÉE sur l'arbre fusionné avec le dev du 2026-09-21.
// 284 → 455 (#7668, 2026-09-24) : aucune entrée ajoutée — c'est le CLIENT qui
// est parti. `SEARCH_ROOTS` balayait le legacy `apps/web`, seul consommateur
// d'`API_ENDPOINTS` ; il a quitté le dépôt, et l'application qui a pris son
// chemin écrit ses adresses en littéraux (`path: '/api/v1/…'`) sans importer
// le catalogue. 455 entrées sur 459 n'ont donc plus d'appelant. Trancher entre
// « le web adopte le catalogue » et « le catalogue part » : #7716.
// 455 → 456 (#7729, 2026-09-24) : `me.onboarding`, générée depuis le manifeste
// quand #7756 a monté `GET|PATCH /me/onboarding`. Son client web
// (`feat/web-v2-onboarding-7729`, `lib/api/onboarding.ts`) écrit l'adresse en
// littéral, comme tout `apps/web` depuis #7668 : elle reste morte ici tant que
// #7716 n'a pas tranché, au même titre que les 455 précédentes.
// 456 → 457 (#7797, 2026-09-24) : l'entrée de `GET /links/:linkId/stats`,
// générée depuis le manifeste quand la passerelle a monté la route. Son client
// web (l'écran de détail d'un lien, développé en parallèle) écrit l'adresse en
// littéral comme tout `apps/web` : morte ici au même titre, jusqu'à #7716.
// 457 → 460 (#7873) : `admin.anonymousUsersByParticipantId`,
// `admin.usersByUserIdCommunities` et `admin.usersByUserIdVoiceProfile`,
// générées depuis `route-manifest.json`. L'espace d'administration web les
// appelle par adresse écrite, comme toutes ses lectures admin voisines déjà au
// compte (`admin.usersByUserIdActivity`, `admin.anonymousUsers`…) : ce lot
// n'ouvre pas la migration du web vers le catalogue. Valeur MESURÉE sur la
// branche du 2026-09-25.
// 460 → 463 (#7845, 2026-09-25) : `admin.usersByUserIdStats`,
// `admin.usersByUserIdPreferences` et `admin.usersByUserIdPreferencesByCategory`,
// générées depuis `route-manifest.json`. La page membre de l'espace
// d'administration web les appelle par adresse écrite, comme ses lectures
// admin voisines déjà au compte ; aucun écran d'administration iOS ne les
// appelle. Valeur MESURÉE sur la branche du 2026-09-25.
// 460 → 461 (#6937) : `app.shellVersion`, générée depuis `route-manifest.json`
// quand la passerelle a monté `GET /app/shell-version`. Son client
// (`apps/web/src/lib/app-update/shell-update.ts`) écrit l'adresse en littéral
// comme tout `apps/web`, et comme sa jumelle `app.minVersion`, déjà au compte :
// morte ici au même titre, jusqu'à #7716. Valeur MESURÉE sur la branche du
// 2026-09-25.
// Fusion #6937 + #7845 : les deux ajouts se cumulent. Valeur MESURÉE sur l'arbre fusionné du 2026-09-25.
// 464 → 467 (#7938) : `me.stickers`, `me.stickersByStickerId`,
// `me.stickersByStickerIdUse` — la bibliothèque « Mes stickers », entrées
// GÉNÉRÉES depuis `route-manifest.json`. Leur client
// (`apps/web/src/lib/api/stickers.ts`) écrit l'adresse en littéral comme tout
// `apps/web` : mortes ici au même titre que `me.starredMessages`, jusqu'à
// #7716. Valeur MESURÉE sur la branche du 2026-09-25 fusionnée avec `dev`.
// 467 → 470 (#7999) : `admin.conversationsByConversationId`,
// `admin.conversationsByConversationIdParticipantsByUserId` et
// `admin.conversationsByConversationIdParticipantsByUserIdRemove` — configurer
// une conversation, le rang et le retrait d'un de ses membres, sans en être
// membre. Leur client (`apps/web/src/lib/api/admin-conversation-settings.ts`)
// écrit l'adresse en littéral comme tout `apps/web` : mortes ici au même titre
// que leurs voisines admin, jusqu'à #7716. Valeur MESURÉE le 2026-09-26.
// 470 → 471 (#8083) : `auth.verificationStatus` — la route d'état de l'écran
// du code ; son client web écrit l'adresse en littéral, comme toutes les
// routes `auth.*` de `apps/web`. Valeur MESURÉE le 2026-09-26.
// 471 → 472 (#8101) : `contacts.resolve` — rapprocher les numéros et adresses
// d'une carte de visite partagée des comptes Meeshy ; son client web
// (`apps/web/src/lib/contact-card/resolve.ts`) écrit l'adresse en littéral,
// comme tout `apps/web`, jusqu'à #7716. Valeur MESURÉE le 2026-09-26.
// 472 → 474 (#8099) : `conversations.byIdCard` et `links.byIdentifierCard` —
// la carte de conversation ; son client web
// (`apps/web/src/lib/api/conversation-card.ts`) écrit les deux adresses en
// littéral, comme tout `apps/web`, jusqu'à #7716. Valeur MESURÉE le 2026-09-26.
// 474 → 475 (#8066) : `calls.historyByCallId` — effacer une ligne du journal
// d'appels ; son client web (`apps/web/src/lib/api/call-history-actions.ts`)
// écrit l'adresse en littéral, comme tout `apps/web`, jusqu'à #7716. Valeur
// MESURÉE le 2026-09-26.
// 475 → 476 (#8051) : `admin.usersByUserIdPasswordProposals` — les mots de
// passe proposés à un administrateur ; son client web
// (`apps/web/src/lib/api/admin-user-password.ts`) écrit l'adresse en
// littéral, comme tout `apps/web`, jusqu'à #7716. Valeur MESURÉE le 2026-09-27.
// 476 → 478 (#8217) : `admin.usersByUserIdProfileImageCandidates` et
// `admin.usersByUserIdProfileImagesByKind` — photo et bannière d'un membre
// posées par un administrateur ; leur client web
// (`apps/web/src/lib/api/admin-user-images.ts`) écrit les adresses en
// littéral, comme tout `apps/web`, jusqu'à #7716. Valeur MESURÉE le 2026-09-27
// (CI de dev rouge sur 7943044432, relevé fusionné sans le cliquet).
// 478 → 443 (#7716, lot admin) : le web appelle ces entrées par le module de
// groupe du catalogue au lieu d'écrire l'adresse. Valeur MESURÉE.
// 443 → 436 (#7716, lot appels) : le web appelle ces entrées par le module de
// groupe du catalogue au lieu d'écrire l'adresse. Valeur MESURÉE.
// 436 → 407 (#7716, lot authentification et compte) : le web appelle ces entrées par le module de
// groupe du catalogue au lieu d'écrire l'adresse. Valeur MESURÉE.
// 407 → 388 (#7716, lot profil et annuaire) : le web appelle ces entrées par le module de
// groupe du catalogue au lieu d'écrire l'adresse. Valeur MESURÉE.
// 388 → 371 (#7716, lot conversations et messages) : le web appelle ces entrées par le module de
// groupe du catalogue au lieu d'écrire l'adresse. Valeur MESURÉE.
// 371 → 364 (#7716, lot liens) : le web appelle ces entrées par le module de
// groupe du catalogue au lieu d'écrire l'adresse. Valeur MESURÉE.
// 364 → 344 (#7716, lot publications, stories et notifications) : le web appelle ces entrées par le module de
// groupe du catalogue au lieu d'écrire l'adresse. Valeur MESURÉE.
// 344 → 337 (#7716, lot médias et infrastructure) : le web appelle ces entrées par le module de
// groupe du catalogue au lieu d'écrire l'adresse. Valeur MESURÉE.
const BASELINE_DEAD_ENTRIES = 337;

export const readWorld = (root) => {
  const groupFiles = readdirSync(join(root, GROUPS_DIR)).filter((name) => name.endsWith('.ts')).sort();
  if (groupFiles.length === 0) throw new Error(`${GROUPS_DIR} : aucun module de groupe — le catalogue a changé de forme.`);
  const namespaces = groupFiles.map((name) => ({
    name: namespaceOfGroupFile(name),
    entries: parseGroupModule(readFileSync(join(root, GROUPS_DIR, name), 'utf8')),
  }));

  const searchFiles = SEARCH_ROOTS.flatMap((r) => listSourceFiles(join(root, r), r)).filter(
    (relPath) => relPath !== CATALOG_FILE && !relPath.startsWith(`${GROUPS_DIR}/`), // hors fichiers de déclaration
  );

  const nsNames = namespaces.map((n) => n.name);
  const usedPairs = new Set(searchFiles.flatMap((relPath) => callersIn(readFileSync(join(root, relPath), 'utf8'), nsNames)));

  return { namespaces, usedPairs };
};

export const deadEntries = (world) =>
  world.namespaces.flatMap((ns) =>
    ns.entries.filter((e) => !world.usedPairs.has(`${ns.name}.${e}`)).map((e) => `${ns.name}.${e}`),
  );

// Retire du compte de dette les faux morts PROUVÉS (#5427), et signale toute
// exception devenue STALE : une entrée listée qui n'apparaît plus dans le
// compte brut a soit regagné un appelant réel (l'exception est alors un
// bruit à retirer), soit disparu du catalogue (même remède). Une liste
// d'exceptions qui ne peut jamais rougir sur sa propre péremption est
// exactement la « liste qui se périme en silence » que #5427 refuse.
export const applyKnownLiveExceptions = (dead, exceptions) => {
  const deadSet = new Set(dead);
  const stale = [...exceptions].filter((e) => !deadSet.has(e));
  const filtered = dead.filter((e) => !exceptions.has(e));
  return { filtered, stale };
};

const RESULT = Object.freeze({ OK: 'ok', REGRESSION: 'regression', UNRECORDED_IMPROVEMENT: 'unrecorded-improvement' });

export const evaluateRatchet = (deadCount, baseline) => {
  if (deadCount > baseline) return RESULT.REGRESSION;
  if (deadCount < baseline) return RESULT.UNRECORDED_IMPROVEMENT;
  return RESULT.OK;
};

const selfTest = () => {
  const world = {
    namespaces: [
      { name: 'foo', entries: ['alive', 'dead1', 'dead2'] },
      { name: 'bar', entries: ['aliveToo'] },
    ],
    usedPairs: new Set(['foo.alive', 'bar.aliveToo']),
  };
  const dead = deadEntries(world);
  if (dead.length !== 2 || !dead.includes('foo.dead1') || !dead.includes('foo.dead2')) {
    console.error(`AVEUGLE : dead entries attendues [foo.dead1, foo.dead2], obtenu ${JSON.stringify(dead)}.`);
    return 1;
  }

  if (evaluateRatchet(2, 2) !== RESULT.OK) {
    console.error('AVEUGLE : un compte égal à la référence doit être OK.');
    return 1;
  }
  if (evaluateRatchet(3, 2) !== RESULT.REGRESSION) {
    console.error('AVEUGLE : une régression (+1 entrée morte) doit être détectée.');
    return 1;
  }
  if (evaluateRatchet(1, 2) !== RESULT.UNRECORDED_IMPROVEMENT) {
    console.error('AVEUGLE : une amélioration non enregistrée (-1) doit être détectée.');
    return 1;
  }

  // Le module ci-dessous imite la forme GÉNÉRÉE d'un groupe : une constante
  // par entrée, une fonction pour une entrée paramétrée, et l'alias d'une clé
  // qui est un mot réservé. Les commentaires portent des chemins : un parseur
  // qui les lirait compterait des entrées fantômes.
  const groupModule = [
    '/** GET /api/v1/admin/dashboard */',
    "export const dashboard = '/api/v1/admin/dashboard';",
    '',
    '/** GET /api/v1/admin/:id */',
    'export const byId = (id: string): string => `/api/v1/admin/${encodeURIComponent(id)}`;',
    '',
    '/** GET /api/v1/admin/export */',
    "const export_ = '/api/v1/admin/export';",
    'export { export_ as export };',
  ].join('\n');
  const entries = parseGroupModule(groupModule);
  const expected = ['dashboard', 'byId', 'export'];
  if (entries.length !== 3 || !expected.every((e) => entries.includes(e))) {
    console.error(`AVEUGLE : le parseur doit lire exactement ${JSON.stringify(expected)}, obtenu ${JSON.stringify(entries)}.`);
    return 1;
  }
  if (namespaceOfGroupFile('api-legacy-attachments.ts') !== 'apiLegacyAttachments' || namespaceOfGroupFile('me.ts') !== 'me') {
    console.error('AVEUGLE : le nom de fichier d’un groupe doit redonner son namespace (kebab → camel).');
    return 1;
  }

  // Les deux formes d'appel sont reconnues, l'alias est celui que CHAQUE
  // fichier choisit, et un membre homonyme d'un autre objet (`other.adminEndpoints.x`)
  // n'est pas un appel.
  const caller = [
    "import * as adminApi from '@meeshy/shared/api/endpoints/admin';",
    "import * as legacy from '../api/endpoints/api-legacy-attachments.js';",
    'const a = adminApi.byId(id);',
    'const b = legacy.fileByWildcard(path);',
    'const c = API_ENDPOINTS.auth.login;',
    'const d = other.adminApi.dashboard;',
  ].join('\n');
  const calls = callersIn(caller, ['admin', 'auth', 'apiLegacyAttachments']).sort();
  const expectedCalls = ['admin.byId', 'apiLegacyAttachments.fileByWildcard', 'auth.login'];
  if (JSON.stringify(calls) !== JSON.stringify(expectedCalls)) {
    console.error(`AVEUGLE : appelants attendus ${JSON.stringify(expectedCalls)}, obtenu ${JSON.stringify(calls)}.`);
    return 1;
  }

  // Une exception PROUVÉE retire l'entrée du compte, même si elle serait
  // "morte" au sens strict des appelants.
  const withException = applyKnownLiveExceptions(['foo.dead1', 'foo.dead2'], new Set(['foo.dead1']));
  if (withException.filtered.length !== 1 || withException.filtered[0] !== 'foo.dead2' || withException.stale.length !== 0) {
    console.error(`AVEUGLE : une exception valide doit retirer exactement l'entrée exceptée, obtenu ${JSON.stringify(withException)}.`);
    return 1;
  }

  // Une exception qui ne correspond plus à AUCUNE entrée morte (regagné un
  // appelant, ou retirée du catalogue) doit être signalée STALE, jamais
  // silencieusement ignorée.
  const withStale = applyKnownLiveExceptions(['foo.dead1'], new Set(['foo.dead1', 'foo.longGone']));
  if (withStale.stale.length !== 1 || withStale.stale[0] !== 'foo.longGone') {
    console.error(`AVEUGLE : une exception qui ne matche plus aucune entrée morte doit être signalée STALE, obtenu ${JSON.stringify(withStale)}.`);
    return 1;
  }

  console.log('self-test : 9/9 vérifications passées (comptage, cliquet à deux sens, lecture des modules de groupe, deux formes d’appelant, exceptions #5427).');
  return 0;
};

const main = () => {
  if (process.argv.includes('--self-test')) return selfTest();

  const world = readWorld(REPO_ROOT);
  const { filtered, stale } = applyKnownLiveExceptions(deadEntries(world), KNOWN_LIVE_VIA_NON_STANDARD_REFERENCE);

  if (stale.length > 0) {
    console.error(
      `EXCEPTION PÉRIMÉE (#5427) : ${stale.join(', ')} ne figure(nt) plus parmi les entrées sans appelant — ` +
        'a/ont regagné un appelant réel, ou disparu du catalogue. Retirez cette entrée de KNOWN_LIVE_VIA_NON_STANDARD_REFERENCE.',
    );
    return 1;
  }

  const dead = filtered.sort();
  const verdict = evaluateRatchet(dead.length, BASELINE_DEAD_ENTRIES);

  if (verdict === RESULT.OK) {
    console.log(
      `Catalogue TS : ${dead.length} entrée(s) sans appelant hors test, conforme à la référence (${BASELINE_DEAD_ENTRIES}).`,
    );
    return 0;
  }

  if (verdict === RESULT.REGRESSION) {
    const added = dead.length - BASELINE_DEAD_ENTRIES;
    console.error(
      `RÉGRESSION : ${dead.length} entrées de catalogue TS sans appelant hors test, ` +
        `${added} de plus que la référence (${BASELINE_DEAD_ENTRIES}).`,
    );
    console.error(
      'Une entrée qui a perdu son dernier appelant est une promesse que le code ne tient plus (#4889) : ' +
        'retirez-la, ou documentez pourquoi elle est prématurée et relevez BASELINE_DEAD_ENTRIES dans ce script.',
    );
    console.error(`Entrées mortes : ${dead.join(', ')}`);
    return 1;
  }

  console.error(
    `AMÉLIORATION NON ENREGISTRÉE : ${dead.length} entrées de catalogue TS sans appelant hors test, ` +
      `en dessous de la référence (${BASELINE_DEAD_ENTRIES}). Abaissez BASELINE_DEAD_ENTRIES à ${dead.length} dans ce script.`,
  );
  return 1;
};

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exit(main());
}
