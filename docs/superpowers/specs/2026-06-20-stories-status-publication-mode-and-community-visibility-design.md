# Stories/Status — modes de publication + visibilité COMMUNITY fonctionnelle

**Date** : 2026-06-20
**Statut** : Design validé (brainstorming) — Incrément 1
**Périmètre** : gateway (backend) + iOS (SDK + MeeshyUI + app). Web composer = follow-up.

## 1. Contexte & problème

Les stories (`PostType.STORY`, éphémère 21h) et status (`PostType.STATUS`, éphémère 1h)
sont des `Post` portant un champ `visibility: PostVisibility`. Le surfacing gateway
(`PostFeedService.getStories` / `getStatuses`) filtre **déjà correctement** par visibilité :
une story `FRIENDS` ne remonte qu'aux contacts (amis acceptés ∪ partenaires de conversations
directes). Il n'y a **pas de fuite** côté serveur.

Le symptôme « tout remonte de manière inconditionnelle » vient de **deux causes UX/produit** :

1. Le composer story met `visibility = "PUBLIC"` par défaut et le choix est **enterré** dans
   le menu overflow « … » (`StoryComposerView.swift:805-817`, valeurs PUBLIC/FRIENDS/PRIVATE).
   Presque tout est donc publié en PUBLIC → tout remonte à tout le monde.
2. La valeur d'enum `COMMUNITY` existe (`PostVisibility`, schema `schema.prisma:2734`) mais
   n'est **implémentée nulle part** dans le filtrage : elle est ignorée (ou traitée comme
   FRIENDS) dans les 5 points d'application de visibilité.

## 2. Décisions (issues du brainstorming)

| Décision | Choix retenu |
|---|---|
| Diagnostic | Le surfacing gateway est correct ; le problème est le défaut PUBLIC + UX enterrée. |
| Modes exposés | **Set complet** des enums existants + rendre **COMMUNITY fonctionnel**. |
| Défaut de publication | **PUBLIC inchangé** (pas de changement de défaut). |
| EXCEPT/ONLY | Dépendent d'un picker d'utilisateurs **inexistant** (cassé même sur status). → **2 incréments**. |

### Sémantique COMMUNITY (nouvelle)

`COMMUNITY` = la story/status est visible par **tout membre actif d'une communauté commune à
l'auteur** (l'union des co-membres de toutes les communautés auxquelles l'auteur appartient).
C'est un cran de visibilité **entre PUBLIC et FRIENDS** (plus large que les contacts directs,
plus restreint que public). Pas de ciblage d'une communauté précise → `Post.communityId` reste
`null` (distinct d'un post publié *dans* une communauté via `getCommunityFeed`).

## 3. Objectifs / Non-objectifs

### Incrément 1 (ce spec)
- Rendre `COMMUNITY` fonctionnel de bout en bout côté gateway (5 points d'application).
- Exposer le choix de mode dans le **header bar** du composer story via un menu contextuel
  adaptatif (verre liquide natif iOS 26, repli `.ultraThinMaterial`).
- Modes exposés dans les composers : **PUBLIC, Communautés, Contacts, Privé** (les *tiers* sans
  sélection d'utilisateurs).
- Aligner le picker status sur la même enum partagée + ajouter Communautés.
- `EXCEPT` / `ONLY` **masqués** des composers (la valeur d'enum reste définie pour le
  décodage/back-compat, mais n'est pas proposée tant que le picker n'existe pas).
- **Corriger le trou d'ACL** de `getCommunityFeed` : un non-membre ne doit voir que les posts
  `PUBLIC` d'une communauté, jamais ses posts `COMMUNITY` (embarqué ici pour ne pas l'oublier).

### Non-objectifs (Incrément 2 — spec séparé)
- `AudienceUserPickerView` réutilisable (recherche + multi-select façon `NewConversationView`)
  réparant `EXCEPT`/`ONLY` pour story **et** status.
- Composer web (la story/status web suit le même gateway ; l'UI web est un follow-up).
- Ciblage d'une communauté précise pour une story (`communityId` non-null) — YAGNI.
- Changement du défaut PUBLIC.

## 4. Architecture

```
iOS StoryComposerView (MeeshyUI)  ── header picker (adaptiveGlass) ──┐
iOS StatusComposerView (app)      ── horizontal picker ──────────────┤
        │ utilise PostVisibility (SDK core) + Presentation (MeeshyUI) │
        ▼ createStory(visibility:) / setStatus(visibility:)          │
   POST /posts { type, visibility }                                  │
        ▼                                                            │
services/gateway                                                     │
   PostFeedService.getStories/getStatuses ── buildVisibilityFilter ──┤ ← +COMMUNITY
   canUserViewPost (reactions)                                       │ ← +COMMUNITY
   SocialEventsHandler.getVisibilityFilteredRecipients (broadcast)   │ ← +COMMUNITY
   StoryTextObjectTranslationService.resolveBroadcastRecipients      │ ← +COMMUNITY
   PostService.buildVisibilityFilter (détail post)                   │ ← +COMMUNITY
   PostFeedService.getCommunityFeed (fix ACL membre/non-membre)      ┘ ← +ACL
        │ tous via helper unique
        ▼
   posts/communityVisibility.ts
     getCommunityCoMemberIds(prisma, userId, cache?) : string[]
     doUsersShareCommunity(prisma, a, b) : boolean
     isActiveCommunityMember(prisma, userId, communityId) : boolean
        ▼
   CommunityMember(userId, communityId, isActive)
```

## 5. Composant — Gateway : helper communauté

**Nouveau fichier** : `services/gateway/src/services/posts/communityVisibility.ts`

Deux fonctions pures (miroir du pattern `getDirectConversationContactIds`,
`PostFeedService.ts:764-795`) :

- `getCommunityCoMemberIds(prisma, userId, cache?) : Promise<string[]>`
  - Étape 1 : `communityMember.findMany({ where: { userId, isActive: true }, select: { communityId: true } })`.
  - Étape 2 : si ≥1 communauté → `communityMember.findMany({ where: { communityId: { in: communityIds }, userId: { not: userId }, isActive: true }, select: { userId: true } })`.
  - Retour : `[...new Set(...)]`. Cache optionnel `feed:comembers:{userId}`, TTL = `FEED_SOCIAL_CACHE_TTL` (300s), même politique de cohérence éventuelle que amis/contacts (pas d'invalidation explicite — staleness 5 min assumée, identique à l'existant).
  - `catch → []` (dégradation sûre, comme les helpers voisins).

- `doUsersShareCommunity(prisma, a, b) : Promise<boolean>`
  - Pour le check unitaire d'un post (évite de matérialiser toute la liste de co-membres).
  - `findMany` communautés de `a` (actives) → `findFirst` membership active de `b` dans ces `communityId`.
  - `catch → false`.

- `isActiveCommunityMember(prisma, userId, communityId) : Promise<boolean>`
  - `findFirst({ where: { userId, communityId, isActive: true }, select: { id: true } }) !== null`.
  - Utilisé par le fix ACL de `getCommunityFeed` (point 6).
  - `catch → false`.

### Points d'application (les 5 + 1)

1. **`PostFeedService.buildVisibilityFilter`** (`PostFeedService.ts:752`) — utilisé par
   `getStories` (l.221), `getStatuses` (l.275), `getReels` (l.384).
   Signature passe à `buildVisibilityFilter(viewerId, friendIds, communityCoMemberIds)`.
   Ajout au `OR` : `{ visibility: PostVisibility.COMMUNITY, authorId: { in: communityCoMemberIds } }`.
   `getStories`/`getStatuses`/`getReels` résolvent `getCommunityCoMemberIds(this.prisma, userId, this.cache)`
   en parallèle des amis/contacts (ajout au `Promise.all` existant).

2. **`PostService.buildVisibilityFilter`** (`PostService.ts:487`) — utilisé par `getPostById`
   (l.435), `recordView` (l.926), `recordAnonymousOpen` (l.982). Même ajout au `OR` ;
   résout les co-membres pour le `viewerUserId` (no-op si `viewerUserId` absent → PUBLIC seul).

3. **`canUserViewPost`** (`posts/postVisibility.ts:25`) — ajouter
   `case PostVisibility.COMMUNITY: return doUsersShareCommunity(prisma, post.authorId, userId)`.

4. **`SocialEventsHandler.getVisibilityFilteredRecipients`** (`SocialEventsHandler.ts:134`) —
   ajouter `case 'COMMUNITY': return getCommunityCoMemberIds(this.prisma, authorId)`.
   (Côté auteur : ses co-membres = destinataires.) Retirer COMMUNITY du `default → friendIds`.

5. **`StoryTextObjectTranslationService.resolveBroadcastRecipients`** (`StoryTextObjectTranslationService.ts:122`) —
   brancher COMMUNITY sur `getCommunityCoMemberIds(this.prisma, authorId)` (union avec l'auteur),
   au lieu du repli amis.

6. **`PostFeedService.getCommunityFeed`** (`PostFeedService.ts:637`) — fix ACL embarqué.
   Aujourd'hui hard-code `visibility: { in: ['PUBLIC','COMMUNITY'] }` **sans vérifier
   l'appartenance du viewer** (trou d'ACL : n'importe quel authentifié voit les posts COMMUNITY
   d'une communauté). Correction : résoudre `isActiveCommunityMember(this.prisma, viewerUserId,
   communityId)` ; si **membre** → `{ in: ['PUBLIC','COMMUNITY'] }` ; si **non-membre** (ou
   `viewerUserId` absent) → `visibility: 'PUBLIC'` seul. Concerne les posts permanents
   (POST/REEL) du feed de communauté, distinct du surfacing stories/status.

## 6. Composant — iOS : enum partagée

**Nouveau** `PostVisibility` (SDK core, `packages/MeeshySDK/Sources/MeeshySDK/Models/PostVisibility.swift`) :
```
public enum PostVisibility: String, CaseIterable, Sendable, Codable {
    case `public`  = "PUBLIC"
    case community = "COMMUNITY"
    case friends   = "FRIENDS"
    case except    = "EXCEPT"
    case only      = "ONLY"
    case `private` = "PRIVATE"

    public var requiresUserSelection: Bool { self == .except || self == .only }
}
```
`nonisolated` par défaut (SDK core). Sert au build de requête (`createStory(visibility:)`) et au
décodage (`APIPost.visibility`).

**Nouveau** `PostVisibility+Presentation` (MeeshyUI,
`packages/MeeshySDK/Sources/MeeshyUI/Story/PostVisibilityPresentation.swift`) — concerns UI :
- `var label: String` (localisé) — Public / Communautés / Contacts / Sauf… / Seulement… / Privé.
  Le libellé `FRIENDS` est **harmonisé sur « Contacts »** partout (le status affichait « Amis »).
- `var icon: String` (SF Symbol) — `globe` / `person.3.fill` / `person.2.fill` /
  `person.fill.xmark` / `person.fill.checkmark` / `lock.fill`.
- `static let composerSelectableCases: [PostVisibility]` (Incrément 1) =
  `[.public, .community, .friends, .private]` (exclut `.except`/`.only` jusqu'au picker).

Gotchas connus à respecter : `String(localized:)` avec clés `StaticString`, types purs sous
MeeshyUI `defaultIsolation(MainActor)` → membres `nonisolated` si appelés hors MainActor ;
remplacer l'enum local `StatusVisibility` (`StatusComposerView.swift:5-28`).

## 7. Composant — iOS : picker header story

`StoryComposerView` (`MeeshyUI/Story/StoryComposerView.swift`), `topBar` (l.694-714) :
- Ajouter un **bouton capsule** entre la bande de slides et le bouton « Publier », affichant
  l'icône + label court du mode courant, modifié `.adaptiveGlass(in: Capsule(), tint:)`
  (pattern `ContextActionMenu.swift:177` : verre liquide natif iOS 26, repli `.ultraThinMaterial`).
- Le bouton porte un `Menu` SwiftUI listant `PostVisibility.composerSelectableCases` avec
  checkmark sur le mode actif (le `Menu` natif obtient le liquid glass automatiquement sur iOS 26).
- **Retirer** le sous-menu visibility de l'overflow « … » (l.805-817) — anti-doublon.
- Le mode choisi alimente `upload.visibility` → `postService.createStory(visibility:)`
  (`StoryViewModel.swift:957`).

## 8. Composant — iOS : alignement status

`StatusComposerView` (app) : picker horizontal (l.261-297) itère désormais
`PostVisibility.composerSelectableCases` (donc Communautés apparaît, EXCEPT/ONLY disparaissent
jusqu'à l'incrément 2). `selectedVisibility` devient `PostVisibility`. Le bloc
`visibilityUserIds` (l.237) reste conditionnel `requiresUserSelection` (no-op tant que les modes
sont masqués). Aucune régression : EXCEPT/ONLY étaient déjà cassés (envoyaient `[]`).

## 9. Flux de données

**Publication** : user choisit le mode (header story / picker status) →
`createStory/setStatus(visibility: mode.rawValue)` → `POST /posts { type, visibility }` →
`PostService.createPost` persiste `visibility` → broadcast via
`getVisibilityFilteredRecipients` (COMMUNITY = co-membres de l'auteur).

**Surfacing** : `GET /posts/feed/stories` → `getStories(viewer)` résout
amis ∪ contacts-DM **et** co-membres-communauté → `buildVisibilityFilter` matche
`COMMUNITY si auteur ∈ co-membres-du-viewer`. Symétrie auteur/viewer garantie (A ∈ coMembers(V)
⟺ V ∈ coMembers(A)).

## 10. Edge cases

- Auteur sans communauté publie COMMUNITY → co-membres = ∅ → visible seulement par l'auteur
  (comportement attendu : personne d'autre ne partage de communauté).
- Membership `isActive=false` / `leftAt` non-null → exclus des deux côtés.
- Viewer non authentifié → `buildVisibilityFilter` renvoie PUBLIC seul (COMMUNITY non exposé).
- Communauté à très gros effectif → `authorId: { in: [...] }` peut être large ; acceptable au
  même titre que `friendIds` (cache 300s). Limite assumée de la fondation.
- Story COMMUNITY repostée → suit la visibilité du repost (inchangé).

## 11. Tests (TDD — RED→GREEN)

### Gateway (jest)
- `communityVisibility.test.ts` : `getCommunityCoMemberIds` (co-membres dédupliqués, exclut self,
  exclut inactifs, ∅ si aucune communauté) ; `doUsersShareCommunity` (true/false symétrique).
- `PostFeedService` : story COMMUNITY **visible** par un co-membre, **invisible** par un
  non-co-membre, **visible** par l'auteur ; n'altère pas PUBLIC/FRIENDS.
- `canUserViewPost` : COMMUNITY true/false.
- `SocialEventsHandler` : recipients COMMUNITY = co-membres (pas friends).
- `getCommunityFeed` (fix ACL) : **membre** voit PUBLIC + COMMUNITY ; **non-membre** voit
  PUBLIC seul ; `isActiveCommunityMember` true/false.

### iOS (XCTest)
- `PostVisibility` : `rawValue` ↔ case, `requiresUserSelection`, `composerSelectableCases`
  n'inclut ni except ni only.
- Presentation : label/icon non vides pour chaque case.
- Composer wiring : choisir un mode met à jour la valeur envoyée à `createStory`.

## 12. Vérification (gate)
- `tsc` gateway 0 erreur (sur fichiers touchés) + `jest` gateway vert.
- `./apps/ios/meeshy.sh build` OK.
- Pas de test e2e local (simu sur prod). Commit sélectif (WIP d'autres chantiers dans le tree).

## 13. Suivi (Incrément 2)
Spec séparé : `AudienceUserPickerView` (sheet recherche + multi-select via `UserService.search()`,
pattern `NewConversationView`) ; réactiver `.except`/`.only` dans `composerSelectableCases` ;
brancher la sélection sur story **et** status ; tests du picker.
