#!/usr/bin/env node
// Cliquet de dette du catalogue d'endpoints Swift (#5372, suite de #4889).
//
// LE DÉFAUT QU'IL FERME
//
// #4889 a mesuré qu'une entrée de catalogue client SANS APPELANT se compte
// comme un lecteur : un décideur qui cherche qui consomme un champ voit une
// déclaration `case foo(id: String)` dans `ConversationsEndpoint.swift` et
// GARDE, alors que rien ne l'appelle jamais. Le balayage mécanique de #4889 a
// trouvé 260 entrées Swift dans ce cas (sur 444 mesurées par ce script — la
// méthodologie de comptage diffère légèrement de celle de #4889, voir plus
// bas) — trop pour rester une classification ponctuelle : ce garde rend
// l'état visible en continu.
//
// CE QU'IL NE FAIT PAS
//
// Il ne classe AUCUNE entrée en « prématurée » ou « abandonnée » — c'est la
// décision produit de #4889/#5373, déjà instruite pour les cas connus. Il ne
// peut pas non plus MARQUER une entrée sans appelant : les fichiers de
// `Networking/Endpoints/` portent l'en-tête « GÉNÉRÉ — ne pas éditer à la
// main » et sont réécrits depuis `services/gateway/route-manifest.json`
// (`npm run ios-endpoints:generate`) — un commentaire posé à la main y serait
// écrasé au prochain régénération. Ce garde vit donc À CÔTÉ du catalogue,
// jamais dedans.
//
// MÉTHODOLOGIE
//
// 1. Chaque fichier de `Networking/Endpoints/*.swift` qui déclare
//    `public enum <Type>: MeeshyEndpoint` est un catalogue. Ses ENTRÉES sont
//    les cas DÉCLARÉS — `case foo` / `case foo(id: String)` — jamais les
//    branches du `switch self` qui calcule `path` : celles-ci s'écrivent
//    `case .foo(let id):`, avec un point, que le motif `^\s*case
//    [A-Za-z_]` ne peut pas matcher (un point n'est ni une lettre ni un tiret
//    bas). C'est cette asymétrie de syntaxe — jamais un exclude de plage de
//    lignes, fragile au moindre réagencement du fichier généré — qui sépare
//    la déclaration de son usage interne.
// 2. Un APPELANT est une occurrence de `TypeName.entryName` (le seul style
//    observé dans tout le dépôt : aucun site n'utilise le sucre `.entryName`
//    à type inféré pour ces catalogues — vérifié par grep avant d'écrire ce
//    garde) dans l'arbre CLIENT (SDK + app iOS + ses extensions), HORS :
//      - le fichier qui DÉCLARE ce type (une switch-arm ne compte jamais,
//        déjà exclue par le point ci-dessus, mais un doc-comment cité en
//        exemple dans le même fichier ne doit pas se compter lui-même) ;
//      - les répertoires de TESTS (`Tests/`, `MeeshyTests/`,
//        `MeeshyUIDeviceTests/`) — un appel qui n'existe que dans un test
//        n'est pas un lecteur de PRODUCTION, et c'est exactement le sens de
//        « hors test » dans #4889/#5372.
// 3. Le compte de dette est le nombre d'entrées SANS AUCUNE occurrence ainsi
//    définie. Un cliquet à DEUX SENS (miroir de `check-type-debt.sh`) : il
//    échoue si le compte DÉPASSE la référence enregistrée (régression — une
//    entrée de plus qu'on a cessé d'appeler sans le remarquer), et il échoue
//    aussi si le compte BAISSE sans que la référence ne soit abaissée dans le
//    MÊME commit (amélioration non enregistrée — le prochain qui régresse d'un
//    cran repasserait sous une référence perimée sans qu'aucun garde ne le
//    voie).
//
// POURQUOI LE COMPTE TOTAL DIFFÈRE DE #4889 (451 → 444 ici)
//
// #4889 rapporte 451 entrées, 260 sans appelant. Ce script en mesure 444. La
// méthodologie de #4889 n'est pas reproduite ligne à ligne dans cette issue —
// seul le RÉSULTAT y est cité — et une différence de 7 sur 451 (1,5 %) ne
// mérite pas une chasse rétroactive à l'algorithme exact d'une mesure
// manuelle. Ce qui compte pour un cliquet est que SA PROPRE mesure soit
// stable et auto-testée, pas qu'elle réplique au chiffre près un comptage
// dont la méthode précise n'est pas tracée. La référence ci-dessous est donc
// ancrée sur CE script, pas sur #4889.
//
// --self-test : construit un monde synthétique (deux types, quelques entrées,
// des appelants connus) et vérifie que le compte de dette qui en sort est
// EXACTEMENT celui attendu à la main — puis que le cliquet rougit sur une
// régression (+1 entrée morte) et sur une amélioration non enregistrée
// (-1 sans abaisser la référence). Un cliquet qui n'a jamais été vu échouer
// sur les deux formes de dérive n'est pas un garde (leçon de #5366/#4764).
//
// EXCEPTIONS CONNUES (#5427)
//
// #4889/#5372 comptent une entrée sans occurrence `TypeName.entry` comme
// morte. Trois cas mesurés en instruisant #5373 ne le sont pas : la route
// est réellement appelée en production, mais par un chemin qu'AUCUNE analyse
// du code source ne peut relier à l'énum — une URL COMPLÈTE rendue par le
// SERVEUR dans la charge utile et consommée telle quelle (`fileUrl`), jamais
// reconstruite ni citée en littéral nulle part dans l'arbre client. Élargir
// la recherche aux chemins littéraux (comme `endpoint-literal-audit.ts` le
// fait dans l'autre sens) ne fermerait donc RIEN ici : il n'existe aucun
// littéral à trouver. Un marqueur manuel, documenté par cas, est plus honnête
// qu'une heuristique qui devinerait un chemin absent du code (cf. le rejet
// symétrique dans `endpoint-literal-audit.ts`, § « une liste d'exemptions
// serait pire ») — cette liste-ci n'exempte PAS une régression future, elle
// retire des faux positifs déjà PROUVÉS, un par un, comme le fait déjà
// `BASELINE_DEAD_ENTRIES` pour chaque baisse mesurée.
//
// `LEndpoint.byToken` et `UEndpoint.byUsername` restent, eux, des entrées
// mortes CÔTÉ SWIFT (aucune occurrence, littérale ou non, dans
// `packages/MeeshySDK/Sources` ni `apps/ios/**` — vérifié par grep avant
// d'écrire cette liste) : leur appelant réel est le catalogue TS
// (`check-ts-catalog-dead-entries.mjs` porte leurs exceptions), pas iOS. Une
// route qu'iOS n'implémente pas n'est pas une entrée Swift vivante.
const KNOWN_LIVE_VIA_OPAQUE_SERVER_URL = new Set([
  // `GET /api/v1/static/:filename` : l'URL complète (`fileUrl`) est rendue
  // par le serveur dans la charge utile (stories, sons, pièces jointes) et
  // consommée directement par `URLSession` — jamais reconstruite via
  // `StaticEndpoint.byFilename`. Appelants réels (parmi d'autres) :
  // `StoryAudioSourceResolver.swift`, `StoryCanvasUIView+Audio.swift`.
  'StaticEndpoint.byFilename',
]);

import { readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CATALOG_DIR = 'packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints';

const SEARCH_ROOTS = [
  'packages/MeeshySDK/Sources',
  'apps/ios/Meeshy',
  'apps/ios/MeeshyNotificationExtension',
  'apps/ios/MeeshyShareExtension',
  'apps/ios/MeeshyWidgets',
];

const EXCLUDED_DIR_NAMES = new Set(['Tests', 'MeeshyTests', 'MeeshyUIDeviceTests']);

// La référence est ancrée sur CE script (voir méthodologie ci-dessus), pas sur
// le comptage manuel de #4889. Qui la baisse doit avoir mesuré une vraie
// baisse ; qui la relève documente ici pourquoi une entrée neuve est morte à
// la naissance (une porte posée pour un écran à venir, cf. #4889).
//
// 253 → 252 (#5427) : `StaticEndpoint.byFilename` retirée du compte de dette —
// faux mort, voir `KNOWN_LIVE_VIA_OPAQUE_SERVER_URL` ci-dessus.
//
// 252 → 249 (#5423) : `ConversationEndpoint`, `DetectLanguageEndpoint` et
// `StatusEndpoint` retirés du catalogue avec leurs trois routes de sondage
// mortes — les trois entrées disparaissent, elles ne se comptent plus.
//
// 249 → 250 (#3690) : `UsersEndpoint.meReferralCode` (nouvelle route
// `GET /users/me/referral-code`) — morte à la naissance PAR CONSTRUCTION,
// exactement comme son miroir côté catalogue TS
// (`check-ts-catalog-dead-entries.mjs`, même issue) : ses appelants Swift
// (écran de parrainage, partage du code) sont portés par les issues sœurs du
// même milestone, pas par celle-ci, qui ne livre que la route serveur et son
// exposition dans les catalogues générés.
//
// 250 → 251 (#3600) : `PostsEndpoint.byPostIdMediaByMediaIdExport` (nouvelle
// route `GET /posts/:postId/media/:mediaId/export`, export watermarké côté
// serveur) — morte à la naissance PAR CONSTRUCTION : cette issue ne livre que
// la route serveur (watermark sharp/ffmpeg, cache) et son exposition dans les
// catalogues générés. L'appel iOS (bouton d'export sur un média) est un
// travail client à part, à ouvrir en issue de suivi le jour où l'écran existe.
//
// 251 → 246 (#5424) : cinq fichiers d'énumération retirés (`CleanupEndpoint`,
// `StatsEndpoint`, `UserStatusEndpoint`, `TestEndpoint`, `InfoEndpoint`) —
// quatre routes d'exploitation filtrées par
// `packages/shared/api/ops-only-routes.ts`, et `/info` dont la route serveur
// elle-même a été retirée. Aucun des cinq n'avait d'appelant Swift hors test.
// 246 → 249 (#5528) : les trois routes de bannissement durable
// (`AdminEndpoint.usersByUserIdBan`, `.usersByUserIdBans`,
// `.usersByUserIdBansByBanIdLift`) — mortes à la naissance PAR CONSTRUCTION,
// même cas que `meReferralCode` (#3690) et `byPostIdMediaByMediaIdExport`
// (#3600) ci-dessus : #5528 ne livre que le modèle `Ban`, son journal d'audit
// et l'écran admin WEB. L'appelant Swift (écran de modération iOS) est un
// travail client à part, qui n'existe pas encore.
//
// Relevé par une session TIERCE, pas par celle qui a écrit #5528 : la fusion a
// laissé `dev` rouge sur deux gates successifs (le cliquet de dette de types,
// puis celui-ci, que le premier masquait), et corriger le premier seul aurait
// déplacé le rouge sans débloquer la ligne. Voir #5617.
//
// 249 → 250 (#5547) : `MeEndpoint.engagement` (nouvelle route
// `GET /me/engagement`, écran de consultation « Progression ») — morte à la
// naissance PAR CONSTRUCTION, même cas que `meReferralCode` (#3690) et
// `usersByUserIdBan` (#5528) ci-dessus : cette issue ne livre que la route
// gateway (lecture des compteurs/paliers/streak, #5530) et son exposition
// dans les catalogues générés. L'appelant Swift (l'écran « Progression »
// iOS) est un travail client à part, pas encore ouvert — voir le corps de
// la PR qui livre cette route pour le détail du périmètre différé.
//
// 250 → 251 (#3635) : `MeEndpoint.terms` (nouvelle route `GET /me/terms`,
// signal + action de re-consentement CGU versionné) — morte à la naissance
// PAR CONSTRUCTION, même cas que `meEngagement` (#5547) ci-dessus : cette
// issue ne livre que la route gateway (`GET`/`PUT /me/terms`) et son
// exposition dans les catalogues générés. L'écran de ré-acceptation
// iOS/Android/Web qui l'appellera est un travail client à part, ouvert
// séparément (#5716).
//
// 250 → 251 (#3954) : `PostsEndpoint.byPostIdObjectsByObjectIdResponses`
// (nouvelles routes `POST`/`DELETE`/`GET
// /posts/:postId/objects/:objectId/responses`, table légère votes/réponses
// des stickers interactifs, O10) — morte à la naissance PAR CONSTRUCTION,
// même cas que `MeEndpoint.terms` (#3635) ci-dessus : le kind `interactive`
// du canvas reste RÉSERVÉ au contrat (`RESERVED_KINDS`, #3953, non traité
// ici), donc aucun client ne peut encore poser un sticker interactif ni
// appeler ces routes. #3954 livre le contrat serveur et son exposition dans
// les catalogues générés ; l'appelant iOS (posé/lu depuis la scène) est le
// périmètre de #3953, une issue distincte.
//
// 251 → 257 (#4317) : `ConversationsEndpoint.byConversationIdClearHistory`,
// `.byConversationIdRestoreForMe`, `MessagesEndpoint.bulkDeleteForMe`,
// `.byMessageIdDeleteForMe`, `.byMessageIdRestoreForMe` et
// `UserEndpoint.deletedConversations` — six gestes utilisateur qui vivaient
// sous `/api` sans jamais avoir été versionnés migrent enfin sous `/api/v1`
// (route CANONIQUE, en plus de leur alias legacy déprécié). Mortes à la
// naissance PAR CONSTRUCTION, même cas que `usersByUserIdBan` (#5528)
// ci-dessus : les trois clients continuent d'appeler l'adresse legacy
// (`ApiLegacyConversationsEndpoint`/`ApiLegacyMessagesEndpoint` côté iOS) —
// aucun n'a besoin de migrer dans l'immédiat, le retrait de l'alias restant
// gouverné par le compteur d'accès nul (#4275). Faire pointer iOS vers la
// nouvelle adresse est un travail client à part, pas ouvert par ce lot.
// 255 → 256 (#6822) : `AdminEndpoint.usersByUserIdRestore`
// (`POST /admin/users/:userId/restore`). Morte à la naissance PAR
// CONSTRUCTION, même raison que les dizaines d'autres `AdminEndpoint.*`
// ci-dessus : l'administration n'a pas d'écran iOS, donc aucun de ses
// endpoints n'a jamais d'appelant Swift.
// 256 → 257 (#6861) : `AdminEndpoint.conversations`
// (`GET /admin/conversations`). Morte à la naissance PAR CONSTRUCTION, même
// raison que `usersByUserIdRestore` juste au-dessus : l'administration n'a pas
// d'écran iOS, donc aucun de ses endpoints n'a jamais d'appelant Swift. Et
// l'entrée est GÉNÉRÉE depuis `route-manifest.json` — la retirer est
// impossible, elle reviendrait à la prochaine régénération.
//
// NOTE DE RÉSOLUTION : voir son jumeau TS. Ce lot et #6822 ont relevé cette
// référence en parallèle vers la MÊME valeur (256) pour des routes
// différentes ; la valeur ci-dessous est MESURÉE sur l'arbre fusionné, jamais
// additionnée.
// 257 → 260 (#6851) : `AdminEndpoint.usersByUserIdSessions`,
// `AdminEndpoint.usersByUserIdSessionsBySessionId` et
// `AdminEndpoint.usersByUserIdSecurityEvents` — l'historique de connexion d'un
// membre. Mortes à la naissance PAR CONSTRUCTION, même raison que les dizaines
// d'autres `AdminEndpoint.*` ci-dessus : l'administration n'a pas d'écran iOS,
// donc aucun de ses endpoints n'a jamais d'appelant Swift. Et ces entrées sont
// GÉNÉRÉES depuis `route-manifest.json` — les retirer est impossible, elles
// reviendraient à la prochaine régénération.
//
// Valeur MESURÉE sur l'arbre fusionné avec le dev qui porte déjà #6861, comme
// la note de résolution ci-dessus l'impose — jamais additionnée.
// 260 → 262 (#7377) : `MeEndpoint.starredMessages` et
// `MeEndpoint.starredMessagesByMessageId` — la liste et l'écriture du favori de
// message. Mortes à la naissance PAR CONSTRUCTION : #7377 livre la moitié
// SERVEUR seule, et ces entrées sont GÉNÉRÉES depuis `route-manifest.json` au
// moment où la route est montée — les retirer est impossible, elles
// reviendraient à la prochaine régénération. Leur appelant Swift est #7379
// (`StarredMessagesStore` passe du stockage local au contrat serveur). Valeur
// MESURÉE sur l'arbre fusionné avec le dev du 2026-09-21.
// 262 → 263 (#7729) : `MeEndpoint.onboarding` — l'état du parcours
// d'accueil (`GET|PATCH /me/onboarding`). Morte à la naissance PAR
// CONSTRUCTION, même raison que #7377 : #7756 livre la moitié SERVEUR seule,
// l'entrée est GÉNÉRÉE depuis `route-manifest.json`. Son appelant Swift est le
// `OnboardingService` de `feat/ios-onboarding-7729`, qui annonce passer à
// `MeEndpoint.onboarding` dès qu'elle est générée. Valeur MESURÉE sur le dev du
// 2026-09-24.
// 263 → 262 (#7729) : `OnboardingService` (feat/ios-onboarding-7729) appelle
// désormais `MeEndpoint.onboarding` et retire son `OnboardingEndpoint` écrit à
// la main — l'entrée n'est plus morte. Valeur MESURÉE sur l'arbre fusionné avec
// le dev du 2026-09-24.
// 262 → 263 (#7797) : `LinksEndpoint.byLinkIdStats` — les statistiques d'un
// lien d'invitation (`GET /links/:linkId/stats`). Morte à la naissance PAR
// CONSTRUCTION, même raison que #7377 et #7729 : la PR passerelle livre la
// moitié SERVEUR seule, l'entrée est GÉNÉRÉE depuis `route-manifest.json`. Son
// appelant Swift est l'écran de détail du lien (`ShareLinkDetailView`, lot iOS
// de #7797, développé en parallèle) ; ce lot rabaisse la référence. Valeur
// MESURÉE en CI sur la branche du 2026-09-24.
// 263 → 262 (#7797) : `ShareLinkDetailView` appelle désormais
// `LinksEndpoint.byLinkIdStats` via `ShareLinkService.fetchLinkStats` (#7802)
// — l'entrée n'est plus morte. Valeur MESURÉE en CI sur la #7802 du 2026-09-24.
// 262 → 265 (#7873) : `AdminEndpoint.anonymousUsersByParticipantId`,
// `AdminEndpoint.usersByUserIdCommunities` et
// `AdminEndpoint.usersByUserIdVoiceProfile` — la fiche d'un anonyme, les
// communautés et le profil vocal d'un membre, lus par l'espace
// d'administration WEB. Mortes à la naissance PAR CONSTRUCTION, même raison
// que #7377 : l'entrée est GÉNÉRÉE depuis `route-manifest.json`, et l'espace
// d'administration iOS n'appelle aucune des lectures admin voisines
// (`usersByUserIdActivity`, `usersByUserIdSessions`… sont déjà au compte).
// Valeur MESURÉE en CI sur la branche du 2026-09-25.
// 265 → 268 (#7845) : `AdminEndpoint.usersByUserIdStats`,
// `AdminEndpoint.usersByUserIdPreferences` et
// `AdminEndpoint.usersByUserIdPreferencesByCategory` — les compteurs et les
// préférences (lecture, écriture) d'un membre, lus par la page membre de
// l'espace d'administration WEB. Mortes à la naissance PAR CONSTRUCTION, même
// raison que #7873 : l'entrée est GÉNÉRÉE depuis `route-manifest.json`, et
// l'espace d'administration iOS n'appelle aucune des lectures admin voisines.
// Valeur MESURÉE sur la branche du 2026-09-25.
// 265 → 266 (#6937) : `AppEndpoint.shellVersion` — la version publiée de la
// coque Capacitor de `apps/web` (`GET /app/shell-version`). Morte à la
// naissance PAR CONSTRUCTION et pour de bon : l'entrée est GÉNÉRÉE depuis
// `route-manifest.json`, et l'app iOS NATIVE n'est pas la coque — son annonce
// de version passe par la porte `minVersion` et l'App Store, jamais par cette
// route. Son appelant est TS (`apps/web/src/lib/app-update/shell-update.ts`).
// Fusion #6937 + #7845 : les deux ajouts se cumulent. Valeur MESURÉE sur l'arbre fusionné du 2026-09-25.
// 269 → 272 (#7938) : `MeEndpoint.stickers`, `.stickersByStickerId`,
// `.stickersByStickerIdUse` — la bibliothèque SERVEUR « Mes stickers »
// (`GET/POST /me/stickers`, `DELETE /me/stickers/:id`, `POST …/:id/use`).
// Mortes à la naissance PAR CONSTRUCTION : l'entrée est GÉNÉRÉE depuis
// `route-manifest.json`, et l'appelant iOS est le lot suivant de #7938
// (synchroniser `StickerLibraryStore`, aujourd'hui local, avec ces routes).
// Leur appelant actuel est TS (`apps/web/src/lib/api/stickers.ts`). Valeur
// MESURÉE sur la branche du 2026-09-25 fusionnée avec `dev`.
// 272 → 275 (#7999) : `AdminEndpoint.conversationsByConversationId`,
// `.conversationsByConversationIdParticipantsByUserId` et
// `.conversationsByConversationIdParticipantsByUserIdRemove` — GÉNÉRÉES depuis
// `route-manifest.json` ; leur seul appelant est la fiche d'administration WEB.
// Valeur MESURÉE le 2026-09-26.
// 275 → 276 → 275 (#8083) : `AuthEndpoint.verificationStatus`, générée par la
// phase passerelle avant son appelant, consommée par la phase iOS
// (`AuthService.emailVerificationStatus`).
// 275 → 277 (#8099) : `ConversationsEndpoint.byIdCard` et
// `LinksEndpoint.byIdentifierCard` — GÉNÉRÉES depuis `route-manifest.json` ;
// `ConversationCardService` (iOS) passe encore par l'enum écrit à la main
// `ConversationCardEndpoint`, dont l'en-tête annonce le retrait au profit de
// ces cas générés. Valeur MESURÉE le 2026-09-26.
// 277 → 278 (#8066) : `CallsEndpoint.historyByCallId` — `DELETE
// /api/v1/calls/history/:callId`, effacer une ligne du journal d'appels,
// GÉNÉRÉE depuis `route-manifest.json`. Le lot ne livre que le web ; l'app
// iOS n'efface pas encore une ligne de son journal. Valeur MESURÉE le 2026-09-26.
// 278 → 279 (#8051) : `AdminEndpoint.usersByUserIdPasswordProposals` — `POST
// /api/v1/admin/users/:userId/password-proposals`, les mots de passe proposés
// à un administrateur, GÉNÉRÉE depuis `route-manifest.json` ; seul le web
// d'administration l'appelle, comme ses voisines `AdminEndpoint`. Valeur
// MESURÉE le 2026-09-27.
// 278 → 280 (#8217) : `AdminEndpoint.usersByUserIdProfileImageCandidates` et
// `AdminEndpoint.usersByUserIdProfileImagesByKind` — `GET
// /api/v1/admin/users/:userId/profile-image-candidates` et `PUT
// /api/v1/admin/users/:userId/profile-images/:kind`, la photo et la bannière
// d'un membre posées par l'administration, GÉNÉRÉES depuis
// `route-manifest.json` ; seul le web d'administration les appelle, comme
// leurs voisines `AdminEndpoint`. Valeur MESURÉE le 2026-09-27.
// 280 → 281 (#8289) : `AdminEndpoint.usersByUserIdVerificationRequests` —
// `POST /api/v1/admin/users/:userId/verification-requests`, le renvoi par
// l'administration de la vérification d'un e-mail ou d'un téléphone, GÉNÉRÉE
// depuis `route-manifest.json` ; seul le web d'administration l'appelle, comme
// ses voisines `AdminEndpoint`. Valeur MESURÉE le 2026-09-27.
// 281 → 282 (#8302) : `ConversationsEndpoint.byIdMessagesAfterReadConsume` —
// `POST /api/v1/conversations/:id/messages/after-read/consume`, la flamme-œil
// consommée par le lecteur qui quitte la conversation, GÉNÉRÉE depuis
// `route-manifest.json`. Le web l'appelle déjà ; le lot iOS de la même
// milestone la consomme en parallèle et doit ramener cette valeur à 281.
// Valeur MESURÉE le 2026-09-27.
// 282 → 281 (#8303) : le lot iOS consomme `byIdMessagesAfterReadConsume`
// (`MessageService.consumeAfterRead`, rejoué par l'outbox). Valeur MESURÉE le
// 2026-09-27.
// 281 → 280 (#8365) : la garde de l'e-mail (`EmailVerificationGate`) lit ses
// routes dans le catalogue, dont `ConversationsEndpoint.byIdNewLink`, jamais
// appelée jusque-là. Valeur MESURÉE le 2026-09-27.
// 280 → 279 (#8438) : le retrait d'un participant d'appel appelle enfin
// `DELETE /calls/:callId/participants/:participantId` depuis le catalogue.
// Valeur MESURÉE le 2026-09-28.
// 279 -> 285 (#8876, 2026-09-30) : six entrées `AdminEndpoint` GÉNÉRÉES depuis
// `route-manifest.json` pour la vue de Dieu de l'administration —
// `.auditLogs`, `.trackingLinks`, `.trackingLinksByLinkId`, `.monitoring`,
// `.communitiesByCommunityId` et `.communitiesByCommunityIdMembers`. Leur seul
// appelant est la console d'administration WEB, comme leurs voisines
// `AdminEndpoint` ; iOS n'a pas d'écran d'administration. Valeur MESURÉE le
// 2026-09-30.
// 285 -> 286 (#8906, fusion de `dev` dans la vue de Dieu, 2026-09-30) :
// `AdminEndpoint.engagementScale` — le barème de points se règle depuis
// l'administration WEB (`/admin/engagement-scale`) ; iOS n'a pas d'écran
// d'administration du barème. Sa jumelle lecteur,
// `ConversationsEndpoint.byIdEngagement`, est appelée par
// `ConversationService.engagement(conversationId:)`. Les deux cliquets se
// lisent ici sur le résultat de la fusion (chacun 279 de son côté : 285 et
// 280), jamais sur l'un des deux parents. Valeur MESURÉE le 2026-09-30.
// 285 -> 292 (#9141, 2026-10-02) : les sept entrées `StickerPacksEndpoint`
// GÉNÉRÉES depuis `route-manifest.json` pour les packs de stickers tiers —
// `.root`, `.installed`, `.pending`, `.submissions`, `.bySlug`,
// `.bySlugInstall` et `.bySlugReview`. Mortes à la naissance PAR
// CONSTRUCTION : #9141 livre les routes gateway et la Boutique WEB ; les
// onglets par pack côté iOS sont un suivi à part, qui n'existe pas encore.
// Valeur MESURÉE le 2026-10-02.
// 289 -> 294 (#9399, 2026-10-05) : les cinq entrées `MeEndpoint.game*`
// (`.gameChestClaim`, `.gameFlameFreezes`, `.gameFlameRelight`,
// `.gameGuideSeen`, `.gameMissionsByMissionIdReroll`) GÉNÉRÉES depuis
// `route-manifest.json` en régénérant `MeEndpoint.swift` (le fichier était
// resté périmé après le lot du jeu, #9382). Mortes à la naissance PAR
// CONSTRUCTION, même motif que `StickerPacksEndpoint` ci-dessus : le jeu
// (chests, flamme, missions) est livré côté gateway et web ; aucun écran iOS
// ne les appelle encore. Valeur MESURÉE le 2026-10-05.
// 294 -> 308 (#9506, 2026-10-05) : quatorze entrées GÉNÉRÉES depuis
// `route-manifest.json` en régénérant `MeEndpoint.swift` et
// `UsersEndpoint.swift` (restés périmés après la vague 2 du jeu — ligues,
// duos, saisons, prestige, parrainage — #9225/#9230, #9504) :
// `MeEndpoint.gameDuoByDuoIdAbandon`, `.gameDuoByDuoIdAccept`,
// `.gameDuoInvite`, `.gameLeagueConsent`, `.gameLeagueFriends`,
// `.gameLeaguePseudonym`, `.gameLeagueWeek`, `.gamePrestige`, `.gamePrivacy`,
// `.gameSeasonSeal`, `.gameSeasonStepsByStepClaim`, `.gameShowcaseOrder`,
// `.gameVisibility`, et `UsersEndpoint.byUserIdGameShowcase`. Mortes à la
// naissance PAR CONSTRUCTION, même motif que les deux entrées ci-dessus : la
// vague 2 est livrée côté gateway ; aucun écran iOS ne les appelle encore.
// Valeur MESURÉE le 2026-10-05.
// 308 -> 309 (#9529, 2026-10-06) : `UsersEndpoint.byUserIdGame`
// (`GET /users/:userId/game`, le jeu d'un autre membre selon son réglage),
// GÉNÉRÉE depuis `route-manifest.json` par `e0a8b73588` (#9481), qui a livré
// la route gateway et régénéré `UsersEndpoint.swift` sans relever cette
// référence. Trouvée en comparant la liste triée de `fe1c386e6f` (308) à celle
// de la tête de `dev` (309) : une entrée de plus, aucune n'a regagné
// d'appelant. iOS APPELLE cette route (`GameService.fetchUserGame`,
// `ef03716ee9`), mais par `GameEndpoint.userGame` — le catalogue du jeu ÉCRIT
// À LA MAIN, qui encode l'identifiant avant de le poser dans le chemin
// (`GameIntegrationRoutes.userGamePath`, témoin `GameRoutesTests`) et déclare
// les refus typés (`rejectionPolicy == .structured`) ; l'entrée générée
// interpole l'identifiant brut et n'a pas cette politique, la lui substituer
// retirerait les deux. Même cas que `byUserIdGameShowcase` et les dix-huit
// `MeEndpoint.game*` ci-dessus, dont chacune a sa jumelle dans `GameEndpoint`.
// Elles ne reviendront au compte que le jour où `GameEndpoint` se retire au
// profit du catalogue généré, comme son en-tête l'annonce. Valeur MESURÉE le
// 2026-10-06.
// 309 -> 289 (#9535, 2026-10-07) : le jour annoncé ci-dessus est arrivé.
// `GameEndpoint` (le catalogue du jeu écrit à la main) est RETIRÉ ; `GameService`
// appelle le catalogue généré — dix-huit `MeEndpoint.game*` et les deux
// `UsersEndpoint.byUserIdGame*` reviennent au compte des entrées appelées, soit
// vingt de moins. Ce que la jumelle apportait que le générateur ne dit pas vit
// désormais dans `GameEndpointPolicy.swift` : les refus 409 typés
// (`rejectionPolicy == .structured`) et l'encodage des identifiants (fabriques
// `MeEndpoint.gameMissionReroll(missionId:)`, `.gameDuoAccept`, `.gameDuoAbandon`,
// `.gameSeasonClaim`, `UsersEndpoint.gameOf`, `.gameShowcaseOf`). `GameRoutesTests`
// compare les adresses du CATALOGUE à `GAME_ROUTES` et `GAME_INTEGRATION_ROUTES`.
// Valeur MESURÉE le 2026-10-07.
// 289 -> 291 (2026-10-08) : deux entrées SANS appelant, chacune pour une raison
// dite. `AttachmentsEndpoint.signedByTokenByWildcard` (#9600) n'aura JAMAIS
// d'appelant client : l'adresse signée par lecteur est SERVIE par la passerelle
// dans les charges (`fileUrl`, vignettes, variantes, pistes) et les clients la
// consomment telle quelle — c'est ce qui rend le lot rétrocompatible sans
// toucher aux clients. `MeEndpoint.securityEvents` (65d71ff793, correctif
// d'audit L2-4) est PRÉMATURÉE : les écrans Sécurité iOS et web ne l'appellent
// pas encore ; #9651 la branche et fera redescendre la référence d'un cran.
// Valeur MESURÉE le 2026-10-08.
// 291 -> 292 (#9927, 2026-10-10) : `MeEndpoint.birthDate` (`PUT /me/birth-date`),
// GÉNÉRÉE depuis `route-manifest.json` avec la route — PRÉMATURÉE : l'étape d'âge de
// l'onboarding iOS l'appellera avec #9929, qui ramène la référence à 291. Valeur
// MESURÉE le 2026-10-10.
//
// 292 -> 291 (#9929, 2026-10-10) : l'étape d'âge de l'onboarding iOS appelle
// désormais `MeEndpoint.birthDate` (`BirthDateService.setBirthDate`) — l'entrée
// n'est plus morte, comme annoncé ci-dessus. Valeur MESURÉE sur l'arbre fusionné
// avec `dev` du 2026-10-10.
// 291 -> 292 (#10000, 2026-10-10) : `WorldEndpoint.root` (`GET /api/v1/world`),
// GÉNÉRÉE depuis `route-manifest.json` par `916e564ac9` sans relever cette
// référence — la jumelle Swift de `world.root`. PRÉMATURÉE : aucune vue iOS ne
// lit encore l'entrée publique de World Wide. Valeur MESURÉE le 2026-10-10.
//
// 292 -> 294 (#9947, 2026-10-11) : `MeEndpoint.gameSeasonsByNumber` (`GET /me/game/seasons/:number`)
// et `MeEndpoint.gameLeagueWeeksByWeekKey` (`GET /me/game/league/weeks/:weekKey`), GÉNÉRÉES avec
// leurs routes — PRÉMATURÉES : les écrans iOS d'une saison passée ou future et d'une semaine
// passée les appelleront avec #10018, qui ramène la référence à 292. Valeur MESURÉE le 2026-10-11.
//
// 294 -> 292 (#10006, 2026-10-11) : `WorldEndpoint.root` a son appelant (`WorldService`,
// l'entrée invité de l'écran de connexion iOS), et une seconde entrée a trouvé le sien
// dans le même intervalle de dev. Valeur MESURÉE le 2026-10-11 (CI run 38110701717).
//
// 292 -> 290 (#10018, 2026-10-11) : `MeEndpoint.gameSeasonsByNumber` et
// `MeEndpoint.gameLeagueWeeksByWeekKey` ont leur appelant (`GameService.fetchSeasonArchive`,
// `GameService.fetchLeagueWeekArchive`, lus par les pages Saison et Ligue d'un lien du Jeu),
// comme annoncé au 292 -> 294. Valeur MESURÉE le 2026-10-11.
//
// 292 -> 293 (#10102, 2026-10-11) : `WorldEndpoint.participantsByParticipantId`
// (`GET /api/v1/world/participants/:participantId`, la fiche d'un participant de World
// Wide lue par l'équipe), GÉNÉRÉE avec sa route — PRÉMATURÉE : la vue iOS qui l'ouvre
// en touchant un auteur est #10125, qui ramène la référence à 292. Valeur MESURÉE le
// 2026-10-11.
//
// 293 -> 291 (2026-10-11) : les deux mouvements ci-dessus, partis chacun de 292, se sont
// croisés sur dev — #10018 (−2) et #10102 (+1) donnent 291, et non 293. Valeur MESURÉE
// le 2026-10-11 sur dev 33e24c995c (CI run 38133983531 rouge sur 293).
//
// 291 -> 295 (#10200, 2026-10-11) : `PacksEndpoint.gloryFrame`, `.gloryFrameBySlug`,
// `.gloryFrameBySlugInstall` et `.gloryFrameInstalled` (LP0 #10148, `/api/v1/packs/glory-frame`),
// GÉNÉRÉES avec leurs routes — PRÉMATURÉES : LP2 #10150 (« iOS installe des packs de tout
// domaine »), qui dépend explicitement de LP0, leur donnera leur appelant (`PackServiceProviding`)
// et ramènera la référence à 291. Valeur MESURÉE le 2026-10-11 sur dev 8a68ca00fe (CI run
// 38147814970 rouge sur 295).
// 295 -> 296 (#10157, 2026-10-11) : `PackAssetsEndpoint.byFile` (L5, `GET /api/v1/pack-assets/:file`, le magasin
// adressé par contenu des packs officiels), GÉNÉRÉE avec sa route — PRÉMATURÉE : LP2 #10150 lira
// couvertures, contrats et vignettes par cette adresse. Valeur MESURÉE le 2026-10-11 en local.
// 296 -> 290 (2026-10-11) : LP2 (6046fcc6cd, la Boutique des cadres dans Réglages ›
// Packs et téléchargements) donne leur appelant aux entrées de packs prématurées
// ci-dessus ; trois relèvements partis de bases différentes s'étaient croisés sur dev.
// Valeur MESURÉE le 2026-10-11 sur dev efee739ae5 (CI run 38160460790 rouge sur 296).
// 290 -> 293 (#10162, 2026-10-11) : `MeEndpoint.gameFramesAtmosphere`, `.gamePhotoMomentsInvitations` et
// `.gamePhotoMomentsPresented` (L10a), générées depuis le manifeste — PRÉMATURÉES : iOS les appellera par
// `GameRoutes.swift` et ses lots (L10b #10163, L18 #10174). Valeur MESURÉE le 2026-10-11 en local.
// 293 -> 301 (#10233, 2026-10-12) : les huit `AdminEndpoint.gameSeasons*` (`/api/v1/admin/game/seasons…` —
// lecture, édition, propositions de l'IA, validation, rejet, export `store.app_events`), générées depuis le
// manifeste — l'administration du calendrier des saisons n'a pas d'écran iOS (web seulement), même raison que les
// dizaines d'autres `AdminEndpoint.*` ci-dessus. `MeEndpoint.gameSeasonsCalendar` a, lui, son appelant
// (`GameEndpointPolicy.gameSeasonCalendar`). Valeur MESURÉE le 2026-10-12 en CI (run 38190033361 rouge sur 301).
// 301 -> 303 (#10315, 2026-10-12) : `AdminEndpoint.usersByUserIdPublications` et `…PublicationsModeration`
// (`/api/v1/admin/users/:userId/publications[/moderation]`) — la modération des publications d'un membre est un
// écran d'administration web, sans écran iOS, même raison que les autres `AdminEndpoint.*`. Valeur MESURÉE le
// 2026-10-12 en CI (run 38270055989 rouge sur 303) et en local.
// 303 -> 310 (#10392, #10394, #10396, 2026-10-13) : `AdminEndpoint.postsGestures`, `.postsByPostIdGestures`,
// `.reportsByReportIdAct`, `.commentsByCommentIdRemove` (gestes de publication et actes sur un signalement) et
// `.opsHostMetrics`, `.opsStatus`, `.opsByOperation` (l'écran Opérations : hôte en direct, sauvegarde, purge) —
// des écrans d'administration web, sans écran iOS, même raison que les autres `AdminEndpoint.*`. Valeur MESURÉE le
// 2026-10-13 en CI (run 38319791863 rouge sur 310) et en local.
// 310 -> 313 (#10483, #10499, 2026-10-13) : iOS compte désormais tout par `POST /social/events`
// (`SocialEndpoint.events` gagne son appelant, -1) et ses quatre anciennes portes de comptage perdent le leur (+4) :
// `PostsEndpoint.byPostIdView`, `.byPostIdImpression`, `.impressionsBatch`, `.engagementBatch`
// (`.byPostIdAnonymousView` et `.byPostIdDownloads` étaient déjà sans appelant iOS sur dev). Ces entrées ne se
// retirent PAS : la passerelle sert toujours ces routes aux ANCIENS clients (rétrocompatibilité stricte, #9223/#9231 —
// un ancien chemin ne se retire qu'à zéro usage mesuré), et le catalogue est généré depuis son manifeste. Ce ne sont
// pas des faux morts (#5427) : iOS ne les appelle vraiment plus. Valeur MESURÉE le 2026-10-13 en CI
// (run 38371153599 rouge sur 313) et en local (diff des entrées mortes origin/dev ↔ feat/social-events-v2).
// 313 -> 314 (#10559, 2026-10-13) : `AffiliateEndpoint.byTokenOg` (`GET /api/v1/affiliate/:token/og`) — la page
// d'aperçu Open Graph d'un lien d'affiliation, servie par la passerelle aux ROBOTS que Traefik trie par
// User-Agent (jumelle des aperçus `/chat/<lien>` et `/l/<jeton>`). Aucun client ne l'appelle jamais, iOS pas plus
// que le web : l'entrée existe parce que le catalogue est généré depuis le manifeste. Valeur MESURÉE le 2026-10-13
// en CI (run 38458186282 rouge sur 314).
// 314 -> 331 (#10631, #10632, 2026-10-15) : la régénération des énumérations Swift (cliquet
// `ios-endpoints-generated-ratchet` de `packages/shared`, rouge sur dev) inscrit les routes du décor de profil et
// des trois domaines de packs d'apparence : `MeEndpoint.profileDecor` et, dans `PacksEndpoint`, `shop` puis pour
// `wallpaper`, `banner` et `avatarRing` la liste, le détail, l'installation, l'achat et les installés (5 × 3).
// Le web les appelle déjà (vitrine unique, `lib/api/packs-shop.ts`) ; l'app iOS ne les branche pas encore —
// entrées PRÉMATURÉES, pas des faux morts (#5427). Valeur MESURÉE le 2026-10-15 en CI (Quality rouge sur
// afe92fecb1) et en local.
// 331 -> 315 (#10632, 2026-10-15) : la vitrine unique iOS (`PackShopService`, `PackService`) branche les routes
// d'apparence que la régénération venait d'inscrire — `PacksEndpoint.shop`, et pour les fonds, contours et
// bannières la liste, le détail, l'installation, l'achat et les installés. Valeur MESURÉE le 2026-10-15 en local
// sur 5109a0e737 (CI « Quality » rouge sur l'amélioration non enregistrée).
// 315 -> 314 (#10632, 2026-10-15) : `MeEndpoint.profileDecor` (`PUT /api/v1/me/profile-decor`) a son appelant
// iOS — `ProfileDecorService.update`, qui équipe un contour d'avatar ou une bannière depuis le profil. Valeur
// MESURÉE le 2026-10-15 en local sur e6ba10bab4.
// 314 -> 326 (#10709, 2026-10-15) : la relecture des vendeurs tiers d'apparence inscrit au catalogue, pour les
// fonds, les contours et les bannières, le contrat d'un pack en attente, son verdict de modération, la file des
// packs en attente et les propositions de l'auteur — 12 entrées. Prématurées : la passerelle les sert, aucun
// client n'a encore l'écran de modération ni de dépôt d'un pack vendeur (même relève au cliquet TS). Valeur
// MESURÉE le 2026-10-15 en local sur 79129ae28f.
// 326 -> 325 (2026-10-15) : une entrée de la vitrine gagne son appelant iOS (91e38008e2). Valeur MESURÉE en local
// sur e13e8be719.
// 325 -> 324 (2026-10-17) : une entrée du catalogue Swift a trouvé son appelant sur dev (lien de réinitialisation
// ouvert dans l'app, ceb0b1572a). Valeur MESURÉE en CI (Quality, run du 89160f284c) et en local sur origin/dev.
// 324 -> 325 (#11441, 2026-10-21) : `AdminEndpoint.opsContainers` (`GET /api/v1/admin/ops/containers`, les
// conteneurs Docker de l'environnement). Prématurée comme toutes les entrées `AdminEndpoint` : l'administration
// vit dans le web (`apps/web/src/lib/api/admin-ops-containers.ts` l'appelle), aucun écran iOS ne l'expose. Valeur
// MESURÉE le 2026-10-21 en local.
// 325 -> 323 (#11421, #11431, 2026-10-21) : MessagesEndpoint.byMessageIdDeleteForMe et
// MessagesEndpoint.bulkDeleteForMe trouvent leur appelant iOS — MessageService.hideForMe et le plan de sélection
// ForMeSelectionPlan (« Supprimer pour moi »). Valeur MESURÉE en CI (Quality, run 119150128073) et en local en
// diffant deadEntries() entre origin/dev et la branche de #11421, puis sur la fusion avec #11441 (325).
// 323 -> 322 (#11570, 2026-10-22) : un commit iOS de dev a retiré une entrée de catalogue sans appelant ;
// la référence suit l'amélioration. Valeur MESURÉE en CI (Quality, bun) et en local sur origin/dev.
// 322 -> 324 (#11510, #10162, 2026-10-22) : `AdminEndpoint.conversationsByConversationIdAttachments`
// (`GET /api/v1/admin/conversations/:conversationId/attachments`, les pièces d'une conversation en lecture
// souveraine, au curseur et par genre — le web l'appelle depuis l'onglet Médias de la lecture d'administration,
// `lib/api/admin-conversations.ts`, aucun écran iOS d'administration des conversations) et
// `MeEndpoint.gamePhotoMomentsKept` (`POST /api/v1/me/game/photo-moments/kept`, le signal « immortalisée »
// de D22(b), que le web émet et que le carnet iOS émettra dans son lot). Entrées PRÉMATURÉES, pas des faux
// morts (#5427). Valeur MESURÉE le 2026-10-22 en local, en diffant les entrées mortes entre origin/dev (322)
// et la fusion de la branche de #10167 avec origin/dev.
// 324 -> 325 (#11329, 2026-10-23) : `AttachmentsEndpoint.byAttachmentIdSubtitlesByLang`
// (`GET /api/v1/attachments/:attachmentId/subtitles/:lang`, la transcription servie en WebVTT dans la langue
// du lecteur). La passerelle la sert depuis S27 (#11329) ; iOS la lira par IL21, le web par W21, deux lots
// qui en dépendent et ne sont pas encore livrés. Entrée PRÉMATURÉE, pas un faux mort (#5427). Valeur MESURÉE
// le 2026-10-23 en local en diffant les entrées mortes entre origin/dev~60 (324) et origin/dev (325) : une
// seule entrée nouvelle, la même que côté TS.
const BASELINE_DEAD_ENTRIES = 325;

const CATALOG_ENUM_RE = /public enum ([A-Za-z0-9_]+)\s*:\s*MeeshyEndpoint\b/;
// Une déclaration de cas n'a jamais de point après `case` ; une branche de
// `switch self` en a toujours un (`case .foo(let x):`). C'est cette asymétrie
// de syntaxe qui distingue les deux, pas une position dans le fichier.
const CASE_DECL_RE = /^\s*case ([A-Za-z_][A-Za-z0-9_]*)/;
// Garde-fou contre un futur `case let .foo` (absent du dépôt aujourd'hui,
// vérifié par grep) : un mot-clé Swift ne peut pas être le nom d'un cas.
const SWIFT_KEYWORDS = new Set(['let', 'var', 'is', 'where', 'try']);

const listSwiftFiles = (absRoot, relRoot) => {
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
      } else if (name.endsWith('.swift')) {
        out.push(relPath);
      }
    }
  };
  walk(absRoot, relRoot);
  return out;
};

export const parseCatalogSource = (source) => {
  const typeMatch = source.match(CATALOG_ENUM_RE);
  if (!typeMatch) return null;
  const entries = [];
  for (const line of source.split('\n')) {
    const m = line.match(CASE_DECL_RE);
    if (m && !SWIFT_KEYWORDS.has(m[1])) entries.push(m[1]);
  }
  return { typeName: typeMatch[1], entries };
};

export const readWorld = (root) => {
  const catalogAbsDir = join(root, CATALOG_DIR);
  const catalogFiles = readdirSync(catalogAbsDir).filter((f) => f.endsWith('.swift'));

  const catalogs = [];
  for (const file of catalogFiles) {
    const relPath = `${CATALOG_DIR}/${file}`;
    const source = readFileSync(join(root, relPath), 'utf8');
    const parsed = parseCatalogSource(source);
    if (parsed) catalogs.push({ ...parsed, declaredIn: relPath });
  }

  const searchFiles = SEARCH_ROOTS.flatMap((r) => listSwiftFiles(join(root, r), r));

  // Une passe unique sur chaque fichier, une alternation sur les types connus
  // — jamais une regex par entrée : 444 passes sur ~800 fichiers serait le
  // même travail refait 444 fois pour la même réponse.
  const typeNames = catalogs.map((c) => c.typeName);
  const callSiteRe = new RegExp(`\\b(${typeNames.join('|')})\\.([A-Za-z_][A-Za-z0-9_]*)\\b`, 'g');

  const usedPairs = new Set();
  for (const relPath of searchFiles) {
    const source = readFileSync(join(root, relPath), 'utf8');
    for (const match of source.matchAll(callSiteRe)) {
      const [, typeName] = match;
      const declaredIn = catalogs.find((c) => c.typeName === typeName)?.declaredIn;
      if (relPath === declaredIn) continue; // hors fichier de déclaration
      usedPairs.add(`${match[1]}.${match[2]}`);
    }
  }

  return { catalogs, usedPairs };
};

export const deadEntries = (world) =>
  world.catalogs.flatMap((c) =>
    c.entries.filter((e) => !world.usedPairs.has(`${c.typeName}.${e}`)).map((e) => `${c.typeName}.${e}`),
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
    catalogs: [
      { typeName: 'FooEndpoint', entries: ['alive', 'dead1', 'dead2'], declaredIn: 'Foo.swift' },
      { typeName: 'BarEndpoint', entries: ['aliveToo'], declaredIn: 'Bar.swift' },
    ],
    usedPairs: new Set(['FooEndpoint.alive', 'BarEndpoint.aliveToo']),
  };
  const dead = deadEntries(world);
  if (dead.length !== 2 || !dead.includes('FooEndpoint.dead1') || !dead.includes('FooEndpoint.dead2')) {
    console.error(`AVEUGLE : dead entries attendues [FooEndpoint.dead1, FooEndpoint.dead2], obtenu ${JSON.stringify(dead)}.`);
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

  // Vérifie aussi que le parseur ne confond pas déclaration et switch-arm sur
  // un fragment réel de la forme générée.
  const fragment = [
    'public enum SampleEndpoint: MeeshyEndpoint, Sendable {',
    '    case root',
    '    case byId(id: String)',
    '',
    '    public var path: String {',
    '        switch self {',
    '        case .root: return "/api/v1/sample"',
    '        case .byId(let id): return "/api/v1/sample/\\(id)"',
    '        }',
    '    }',
    '}',
  ].join('\n');
  const parsed = parseCatalogSource(fragment);
  if (!parsed || parsed.typeName !== 'SampleEndpoint' || parsed.entries.length !== 2 || !parsed.entries.includes('root') || !parsed.entries.includes('byId')) {
    console.error(`AVEUGLE : le parseur doit lire exactement [root, byId], obtenu ${JSON.stringify(parsed)}.`);
    return 1;
  }

  // Une exception PROUVÉE retire l'entrée du compte, même si elle serait
  // "morte" au sens strict des appelants.
  const withException = applyKnownLiveExceptions(['FooEndpoint.dead1', 'FooEndpoint.dead2'], new Set(['FooEndpoint.dead1']));
  if (withException.filtered.length !== 1 || withException.filtered[0] !== 'FooEndpoint.dead2' || withException.stale.length !== 0) {
    console.error(`AVEUGLE : une exception valide doit retirer exactement l'entrée exceptée, obtenu ${JSON.stringify(withException)}.`);
    return 1;
  }

  // Une exception qui ne correspond plus à AUCUNE entrée morte (regagné un
  // appelant, ou retirée du catalogue) doit être signalée STALE, jamais
  // silencieusement ignorée.
  const withStale = applyKnownLiveExceptions(['FooEndpoint.dead1'], new Set(['FooEndpoint.dead1', 'FooEndpoint.longGone']));
  if (withStale.stale.length !== 1 || withStale.stale[0] !== 'FooEndpoint.longGone') {
    console.error(`AVEUGLE : une exception qui ne matche plus aucune entrée morte doit être signalée STALE, obtenu ${JSON.stringify(withStale)}.`);
    return 1;
  }

  console.log('self-test : 8/8 vérifications passées (comptage, cliquet à deux sens, parseur déclaration≠switch-arm, exceptions #5427).');
  return 0;
};

const main = () => {
  if (process.argv.includes('--self-test')) return selfTest();

  const world = readWorld(REPO_ROOT);
  const { filtered, stale } = applyKnownLiveExceptions(deadEntries(world), KNOWN_LIVE_VIA_OPAQUE_SERVER_URL);

  if (stale.length > 0) {
    console.error(
      `EXCEPTION PÉRIMÉE (#5427) : ${stale.join(', ')} ne figure(nt) plus parmi les entrées sans appelant — ` +
        'a/ont regagné un appelant réel, ou disparu du catalogue. Retirez cette entrée de KNOWN_LIVE_VIA_OPAQUE_SERVER_URL.',
    );
    return 1;
  }

  const dead = filtered.sort();
  const verdict = evaluateRatchet(dead.length, BASELINE_DEAD_ENTRIES);

  if (verdict === RESULT.OK) {
    console.log(
      `Catalogue Swift : ${dead.length} entrée(s) sans appelant hors test, conforme à la référence (${BASELINE_DEAD_ENTRIES}).`,
    );
    return 0;
  }

  if (verdict === RESULT.REGRESSION) {
    const added = dead.length - BASELINE_DEAD_ENTRIES;
    console.error(
      `RÉGRESSION : ${dead.length} entrées de catalogue Swift sans appelant hors test, ` +
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
    `AMÉLIORATION NON ENREGISTRÉE : ${dead.length} entrées de catalogue Swift sans appelant hors test, ` +
      `en dessous de la référence (${BASELINE_DEAD_ENTRIES}). Abaissez BASELINE_DEAD_ENTRIES à ${dead.length} dans ce script.`,
  );
  return 1;
};

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exit(main());
}
