# iOS — Refonte du profil utilisateur (UserProfileSheet)

Date : 2026-06-20
Statut : design validé (en attente revue spec)
Cibles : iOS (app + SDK MeeshyUI/MeeshySDK), gateway, packages/shared (Prisma)

## Contexte & problème

La feuille de profil d'un **autre** utilisateur (`UserProfileSheet`, SDK `MeeshyUI/Profile/`, ~1193 lignes)
empile aujourd'hui : bannière → avatar (point présence) → nom → @pseudo → texte « En ligne » → onglets
`Profil / Conversations / Stats` → contenu. Problèmes :

1. Le texte « En ligne » est redondant avec le point de présence sur l'avatar.
2. La bio et les détails ne sont pas regroupés dans une zone identité compacte sous le header.
3. Pas de header collapsible : la feuille ne se réduit pas en format épinglé au scroll.
4. Onglets inadaptés : pas d'onglet « Postes » de l'utilisateur ; « Stats » occupe un onglet entier ;
   actions (connexion / blocage) noyées dans l'onglet Profil ; pas de signalement ; pas de profil vocal.
5. Cache profil à TTL 1h → re-téléchargements fréquents ; pas de prolongation du TTL à la visite.
6. Les stats remontées ne sont pas fiables et doivent être corrigées.

## Objectifs

- Header restructuré (bio + détails entre bannière et l'ancien « En ligne », « En ligne » supprimé),
  compact, **collapsible** : au scroll, il se réduit à `bannière fine + avatar + nom + @pseudo`,
  avec la **barre d'onglets épinglée**.
- Trois onglets **i18n + a11y** : **Postes**, **Conversations**, **Détails**.
- Onglet **Détails** = bio, langues, pays (si dispo), profil vocal public (si dispo), actions
  (demander connexion / bloquer / signaler), + bande **stats compacte** fiabilisée.
- Profil vocal **public** : support backend complet (flag + endpoint de lecture) + UI.
- Cache **1 mois** avec **prolongation à chaque visite** (touch), affichage instantané depuis cache,
  revalidation SWR silencieuse légère + pull-to-refresh, **jamais** de re-téléchargement des images
  déjà en cache.
- Continuité du design existant (accentColor par conversation/utilisateur, verre, typo).

Hors scope : refonte du profil **de l'utilisateur courant** (ProfileView) ; ranking/feed global ;
toute fonctionnalité non listée.

## Décisions produit (validées)

- **Profil vocal** : backend complet + UI (flag public + endpoint de lecture publique).
- **Stats** : pas d'onglet dédié ; résumé compact en bas de Détails ; pipeline stats fiabilisé.
- **Cache** : SWR silencieux par visite + pull-to-refresh (pas de re-DL d'images), TTL 30 j, touch à la visite.

## Principe de réutilisation (contrainte FERME)

Demande explicite : **réutiliser au maximum l'existant, créer le minimum.** Avant toute nouvelle classe /
service / vue / endpoint, inventorier l'existant et le réutiliser/généraliser. En pratique :
- **Postes** : rendre via `FeedPostCard` existant (injecté), réutiliser le modèle `FeedPost` + sa conversion,
  et le **même câblage like/repost/bookmark/share** que le feed (mêmes callbacks), pas de logique parallèle.
  Si une orchestration de liste de posts existe (state, pagination), la réutiliser/factoriser plutôt que dupliquer.
- **Infos profil** : réutiliser `ProfileSheetUser`/`MeeshyUser`, `LanguageDisplay`, les pills/chips existants,
  `AudioPlayerView`, les boutons d'action existants, `FriendshipCache`, `BlockService`, `ReportService`.
- **Backend vocal** : enrichir `buildPublicProfile()` + `PATCH /users/profile` (cf. §Profil vocal), pas de route neuve.
- **Scroll/collapse** : réutiliser `trackScrollContentOffset`/`ScrollOffsetPreferenceKey` (+ `CollapsibleHeader`
  comme référence/brique si applicable), pas de nouveau tracker.
- Nouveaux fichiers UNIQUEMENT pour la décomposition (lisibilité) ; pas de réimplémentation de briques existantes.

## Inventaire réutilisé (déjà existant — ne pas réécrire)

| Besoin | Existant | Chemin |
| --- | --- | --- |
| Posts d'un user | `PostService.getUserPosts(userId:cursor:limit:)` → `GET /posts/user/:userId` (ACL serveur) | `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift:266` |
| Rendu d'un post | `FeedPostCard` (riche : traductions, médias, likes/reposts) — **app-side** | `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift` |
| Conversations partagées | `ConversationService.listSharedWith(userId:)` | SDK Services |
| Connexion | `FriendService.sendFriendRequest/respond/deleteRequest` + `FriendshipCache` | SDK Services |
| Blocage | `BlockService.blockUser/unblockUser/isBlocked` | SDK Services |
| Signalement | `ReportService.reportUser(userId:reportType:reason:)` → `POST /admin/reports` | SDK Services |
| Lecteur audio | `AudioPlayerView` + `AudioPlaybackManager` | `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift` |
| Scroll offset | `trackScrollContentOffset` (iOS 18+) / `ScrollOffsetPreferenceKey` (16-17) | `MeeshyUI/Navigation/ScrollOffsetTracking.swift` |
| onChange adaptatif | `adaptiveOnChange` | `MeeshyUI/Compatibility/AdaptiveOnChange.swift` |
| Cache (SWR) | `CacheCoordinator` stores `.profiles/.feed/.conversations/.stats/.images`, `CacheResult<T>` | `MeeshySDK/Cache/*` |
| Stats | `UserService.getUserStats(userId:)` → `UserStats` ; gateway stats route | SDK + gateway |
| Profil vocal (soi) | `UserVoiceModel` (1/user, `referenceAudioUrl`), routes `/voice-profile/*` | `packages/shared/prisma/schema.prisma:2466` ; `services/gateway/src/routes/voice-profile.ts` |

Faits cache importants : pas de modèle `VoiceProfile`/`VoiceSample` séparés (voix dans `UserVoiceModel`,
échantillon = `referenceAudioUrl`). Images : policy `mediaImages` TTL 1 an, keyées par URL → jamais re-DL.
Le cache GRDB a `touchKey()` (LRU only) mais **ne sait pas** prolonger `lastFetchedAt` → à construire.

## Architecture

### Placement & décomposition

`UserProfileSheet` reste dans le SDK (continuité, call-sites préservés) mais est décomposé pour réduire
la taille et clarifier les responsabilités :

- `UserProfileSheet.swift` — container : présentation, état partagé, header collapse, barre d'onglets, switch.
- `ProfileCollapsibleHeader.swift` — header étendu ↔ replié (interpolation par `progress`).
- `ProfilePostsTab.swift` — liste paginée (rendu injecté, cf. ci-dessous).
- `ProfileConversationsTab.swift` — conversations partagées (restylé).
- `ProfileDetailsTab.swift` — bio, langues, pays, vocal, actions, bande stats.

### Contrainte SDK ↔ app (rendu des posts)

Le SDK **ne peut pas** importer `FeedPostCard` (app-side). L'onglet Postes expose donc un
`@ViewBuilder` injecté `postRow: (FeedPost) -> AnyView` (ou un type opaque via wrapper), fourni par
l'app qui branche le vrai `FeedPostCard`. Fallback SDK minimal si non injecté. Conforme à la règle de
pureté SDK (paramètres opaques, agnostique → SDK). Les call-sites passent par un init/convenience app-side
unique (`apps/ios/.../UserProfileSheet+App.swift` ou wrapper) qui injecte le rendu une fois.

### Header collapsible (technique)

`ScrollView { LazyVStack(pinnedViews: .sectionHeaders) { GrandHeader ; Section(header: BarreOnglets) { ContenuOnglet } } }`
- La barre d'onglets se fige nativement (section header pinned).
- Un overlay « barre compacte » (petit avatar + nom + @pseudo) apparaît en fondu selon `progress`,
  calculé depuis l'offset lu par `trackScrollContentOffset` (iOS 18+) avec fallback préférence (16-17).
- Éviter `.onPreferenceChange` seul (figé iOS 18+) ; éviter pièges safe area (lire vrais window insets si besoin).
- `progress` est une **fonction pure** testable : `headerProgress(offset:) -> CGFloat` (0…1 sur ~60–120 pt).
- Feuille présentée en `.large` (+ `.medium` conservé) pour la course de scroll ; drag indicator visible.

### Header — contenu

Étendu (haut → bas) : bannière (cover) ; avatar chevauchant + **point présence** (« En ligne » texte supprimé) ;
nom (gras) + @pseudo ; **bloc détails compact** (bio 1–2 lignes tronquées + ligne de chips :
drapeaux langues, drapeau pays si dispo, mood emoji). Replié : `bannière teintée fine + petit avatar + nom + @pseudo`.

### Onglets (i18n + a11y)

Enum `ProfileTab { posts, conversations, details }` avec titres localisés (5 langues) + SF Symbols.
A11y : chaque onglet `accessibilityAddTraits(.isButton [+ .isSelected])`, `accessibilityLabel` localisé,
ordre VoiceOver header → onglets → contenu.

#### Onglet Postes
- Fetch `PostService.getUserPosts(userId:)`, cache `.feed` keyé `user:<id>` (cf. cache).
- Rendu via `FeedPostCard` injecté ; pagination (curseur) au scroll ; pull-to-refresh ; empty state soigné.

#### Onglet Conversations
- `ConversationService.listSharedWith(userId:)`, restylé en continuité, cache `.conversations` keyé `shared:<id>`.

#### Onglet Détails
- Bio complète ; pills langues (système + régionale) ; pays si `registrationCountry`.
- **Profil vocal** (si public) : `AudioPlayerView` jouant `referenceAudioUrl` ; masqué sinon.
- **Actions** : Demander connexion (états send/pending-sent/pending-received/connected) ; Bloquer ;
  **Signaler** (feuille de motifs mappés à l'enum gateway : `spam, inappropriate, harassment, violence,
  hate_speech, fake_profile, impersonation, other`).
- **Bande stats compacte** (membre depuis + compteurs clés) — fiabilisée (cf. §Stats).

## Profil vocal — backend complet (approche « réutilisation maximale »)

Décision : **ne pas créer d'endpoint dédié**. On enrichit les chemins **déjà existants** (lecture du profil
public + mise à jour du profil) avec le minimum de surface neuve. Une seule requête, un seul cache.

### Prisma (`packages/shared/prisma/schema.prisma`, `UserVoiceModel`)
- Ajout unique : `voicePublicAt DateTime?` (convention : nullable DateTime = flag + horodatage ; pas de booléen).
- Colocalisé sur `UserVoiceModel` car `referenceAudioUrl` y est ; un user sans voix ne peut être public.
- `pnpm prisma generate` (shared) requis ; pas de migration SQL (MongoDB).

### Gateway — réutiliser l'existant
- **Lecture** : enrichir le helper **`buildPublicProfile()`** + les routes publiques existantes
  `GET /users/:id` et `GET /u/:username`. Quand `UserVoiceModel.voicePublicAt != null` **et** demandeur
  non bloqué, ajouter au DTO : `voicePublic: true`, `voiceSampleUrl` (= `referenceAudioUrl`),
  `voiceSampleDurationMs` (= `totalDurationMs`), `voiceQuality?`. Sinon champs absents/`voicePublic: false`.
  **Déclarer ces champs au response schema Fastify** (sinon strippés). `voiceSampleUrl` servi tel quel
  (même mécanisme que les attachments — confirmer qu'il est jouable, sinon route download existante).
- **Toggle (soi)** : réutiliser **`PATCH /users/profile`** (route de réglages déjà existante) en lui
  ajoutant `voicePublic?: boolean` → set/clear `UserVoiceModel.voicePublicAt`. **Pas de nouvelle route.**
- ACL : ne jamais exposer la voix d'un user non public ni d'un bloquant.

### iOS — réutiliser les modèles existants
- Ajouter champs optionnels `voicePublic`, `voiceSampleUrl`, `voiceSampleDurationMs`, `voiceQuality?`
  sur `MeeshyUser` + propagation `ProfileSheetUser` (et leur factory `from MeeshyUser`).
- Onglet Détails : lit ces champs **directement depuis le profil déjà fetché + caché** (`.profiles`,
  TTL 30 j) → **aucun appel réseau supplémentaire**, affichage conditionnel via `AudioPlayerView`.
- `VoiceProfileManageView` (app) : toggle « Rendre mon profil vocal public » câblé sur le **chemin de mise
  à jour de profil existant** (`UserService.updateProfile` / équivalent), pas de nouveau service.

## Stats — fiabilisation

- Audit gateway `getUserStats` ↔ iOS `UserStats` : vérifier calcul (membre depuis, nb messages, nb traductions,
  langues) et **mapping** (piège : Fastify strippe les champs non déclarés au response schema → handler doit
  `.map()` vers la forme déclarée). Corriger si bug (TDD : test Jest gateway sur la forme + valeurs).
- Affichage : bande compacte en bas de Détails (pas d'onglet). Cache `.stats` (TTL existant 6h conservé).

## Cache — 1 mois + touch à la visite

- **Policies** : `userProfiles`, feed-d'un-user, convos-partagées-d'un-user → **TTL 30 j**
  (`CachePolicy(ttl: .days(30), staleTTL: …)`). Stats inchangées (6h).
- **Nouveau building block SDK** : `GRDBCacheStore.touch(for key:)` → `lastFetchedAt = now` (L1 + métadonnées L2),
  exposé via `CacheCoordinator`. Pur, testable, agnostique (reste SDK).
- **À l'ouverture du profil** : lire cache (affichage instantané, zéro spinner si données présentes) →
  `touch` (prolonge à 30 j même sans MAJ) → revalidation SWR **silencieuse** légère (JSON only) →
  merge des deltas. Images : keyées URL, TTL 1 an → **jamais re-DL**.
- **Pull-to-refresh** : force le refetch réseau (seule autre voie). Événements socket continuent d'invalider/mettre à jour.

## i18n & a11y

- Clés `Localizable.xcstrings` (5 langues : fr/en + 3 existantes) pour : titres onglets, labels actions,
  motifs de signalement, libellés stats, libellés vocal. `defaultValue` + entrée `en` obligatoires
  (piège connu : clé sans `en` → rendu brut, fallback devRegion=en).
- A11y : onglets boutons + `.isSelected` ; header replié annoncé ; lecteur vocal labellisé ;
  contrôles d'action avec labels explicites.

## Tests (TDD)

- **iOS (XCTest)** : `headerProgress(offset:)` (pur) ; résolution affichage langues ; affichage conditionnel
  vocal (public/non) ; cache `touch` prolonge le TTL (lecture après touch = `.fresh`) ; mapping `UserStats`.
- **Gateway (Jest)** : `GET /users/:id/voice-profile` (public vs non-public vs bloqué) ;
  `PATCH /voice-profile/visibility` ; correction stats (forme + valeurs).
- **SDK** : `GRDBCacheStore.touch` (unit).

## Gates & rollout

- `tsc` gateway 0 erreur (sur fichiers touchés) + `./apps/ios/meeshy.sh build` OK + Jest gateway concerné vert.
- Worktree partagé : commits **sélectifs** par pathspec, jamais `--amend`, jamais `reset --hard`.
- Shared rebuild (`pnpm --filter @meeshy/shared build` / prisma generate) avant build gateway.
- Déploiement = push main → CI (pas d'e2e local). Profil vocal public = rollout backend d'abord (UI dégrade
  proprement si endpoint absent), puis iOS.

## Risques

- Header collapse + LazyVStack pinned dans une sheet `.large` : valider sur device (simu OK mais collapse à confirmer).
- Injection du rendu posts : bien couvrir tous les call-sites (RootView, PostDetailView, …) via le wrapper app unique.
- `referenceAudioUrl` : confirmer qu'il est jouable directement (sinon route de download gateway).
- Cache 30 j : la revalidation SWR par visite doit être réellement légère (pas de cascade de fetch).
