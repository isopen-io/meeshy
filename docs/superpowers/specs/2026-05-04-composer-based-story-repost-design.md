# Composer-based Story Repost — Design Spec

**Date** : 2026-05-04
**Auteur** : Brainstorm session avec J. Charles N. M.
**Statut** : Draft prêt pour writing-plans
**Topic** : Permettre le repartage de stories via composer (édition) vers stories ET vers posts permanents avec embed read-only animé

## 1. Contexte et motivation

Actuellement le repartage d'une story dans Meeshy iOS est cassé sur deux dimensions :

1. **Sémantique mauvaise** : `PostService.repostPost()` côté gateway hardcode `type: PostType.POST` (ligne 751 de `services/gateway/src/services/PostService.ts`), donc reposter une story crée un post permanent au lieu d'une story éphémère. Le bug visuel : un repost de story devient un post statique sans animations/timeline/audio.
2. **Pas d'option éditoriale** : un seul bouton « Republier » qui fait un repost direct silencieux sans permettre d'ajouter du commentaire ou d'éditer le contenu.

Le brainstorm a abouti à un modèle où :
- Le **bouton « Partager »** (pile actions droite, icône `arrow.2.squarepath`) ouvre le `StoryComposerView` en mode édition d'un clone de la slide active.
- Le **menu kebab `...`** propose deux nouvelles options : « Republier en post » (direct) et « Éditer et republier en post » (composer).
- Tout le rendu réutilise les composants existants (`StoryComposerView`, `UnifiedPostComposer`, `StoryCanvasReaderView`) via préchargement intelligent — aucun nouveau composant ad-hoc.

Hors scope de ce spec :
- **P0 (autre cycle)** : fix du bouton « Répondre » manquant (callback `onReplyToStory` non câblé sur 3 call sites), ajout du flag `targetType` à `repostPost`, durée story 5→10s configurable.
- **P2 (autre cycle)** : commentaires nested (réponses aux commentaires d'une story).

## 2. Décisions produit (issues du brainstorm)

| Sujet | Décision |
|-------|----------|
| Modèle d'édition composer story | **Deep clone éditable** de la slide active. L'utilisateur peut tout modifier librement. |
| Multi-slides composer story | **Slide active uniquement**. L'utilisateur peut ajouter d'autres slides ensuite via le composer. |
| Badge "Reposté de @author" composer story | **Fixe non éditable** (sticker locked dans le canvas). |
| Format composer post | **Story embed complet read-only** (animations + timeline + audio + effets) + zone texte libre. |
| Survie expiration story originale | **Snapshot indépendant** : médias dupliqués vers nouveau CDN, le post survit à l'expiration de la story originale. |
| Multi-slides post embed | **Slide active uniquement**. |
| Chaîne de reposts | **Double attribution** : `repostOfId` (intermédiaire) + `originalRepostOfId` (auteur racine). Badge "Reposté de @intermediaire • Original par @auteur" dans le rendu. |
| Réactions/commentaires repost vs original | **Totalement séparés**. Chaque repost a ses propres compteurs. |
| Principe d'implémentation | **Réutilisation intelligente** des ViewModels et composants existants — zéro nouveau composant ad-hoc. |
| Modèle de données du post avec story embed | **Approche I (= III avec type POST)** : `Post` avec `type: POST` + champs `media[]`, `storyEffects`, `audioUrl` remplis par le snapshot. Aucun nouveau champ DB sauf `originalRepostOfId`. Discriminateur de rendu via `post.repostOf?.type === STORY`. |

## 3. Architecture & data model

### 3.1 Backend (gateway + Prisma)

**Modifications schema** (`packages/shared/prisma/schema.prisma`) :
- Ajout d'un champ `originalRepostOfId String?` sur le modèle `Post`, avec index pour requêtes de chaîne.
- Aucun autre champ DB ajouté.

**Modifications PostService** (`services/gateway/src/services/PostService.ts`) :

```typescript
async repostPost(
  originalId: string,
  userId: string,
  opts: {
    targetType?: PostType,
    content?: string,
    isQuote?: boolean,
  } = {}
): Promise<Post | null>
```

Comportement :
- Default `targetType = original.type` (préserve la sémantique : repost d'un POST → POST, repost d'une STORY via composer story → STORY).
- Si `targetType === POST` ET `original.type === STORY` :
  - Dupliquer `original.media[]` vers de nouvelles URLs CDN (snapshot des binaires).
  - Copier `original.storyEffects`, `original.audioUrl` (audio dupliqué aussi vers nouveau CDN), `original.backgroundColor`.
  - Le post résultant a `type: POST`, mais conserve les champs story → le rendu détecte cette combinaison via `repostOf.type === STORY`.
- Si `targetType === STORY` :
  - Calcul `expiresAt: now + 21h` (logique story standard).
  - Snapshot médias identique.
- Calcul automatique de `originalRepostOfId` :
  - Si `original.repostOfId` est null → `originalRepostOfId = original.id`.
  - Sinon → `originalRepostOfId = original.originalRepostOfId ?? original.repostOfId` (flatten transitif vers la racine).
- Validation : si `original.visibility !== PUBLIC` → throw `403 Forbidden`.
- Validation : si `original.deletedAt` ou `original.expiresAt < now` → throw `404 Not Found`.

**MediaService** (extraction probable depuis `PostService` ou nouveau fichier) :

```typescript
async duplicateMedia(originalUrl: string): Promise<string>
```
- Télécharge le binaire depuis l'URL CDN actuelle.
- Réuploade vers un nouveau path CDN dédié au post snapshot.
- Retourne la nouvelle URL.
- Rollback : si une duplication échoue à mi-chemin, supprimer toutes les ressources déjà dupliquées dans la session.

**Route handler** (`services/gateway/src/routes/posts.ts` ou équivalent) :
- `POST /posts/:id/repost` accepte dans le body : `{ targetType?: 'POST' | 'STORY', content?: string, isQuote?: boolean }`.
- Backwards-compatible : si `targetType` absent, comportement = avant (mais avec le bug fixé via le default `original.type`).

**Création de stories en repost-en-story (Flux 1)** :
- Réutilise l'endpoint existant `POST /posts` (création standard) avec `type: STORY` et `repostOfId: <storyOriginalId>`.
- Le calcul de `originalRepostOfId` se fait aussi côté `createPost` (pas seulement `repostPost`) pour les cas où le composer publie directement.

### 3.2 iOS SDK — modèles

**`packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift`** :
- Ajout `originalRepostOfId: String?` sur `APIPost`.
- `APIRepostOf` enrichi pour exposer `type: PostType` (probablement déjà présent — à vérifier) et `originalAuthor: APIAuthor?`.

**`packages/MeeshySDK/Sources/MeeshySDK/Networking/PostService.swift`** :

```swift
public func repost(
    postId: String,
    targetType: PostType? = nil,
    content: String? = nil,
    isQuote: Bool = false
) async throws -> APIPost
```

### 3.3 iOS SDK — viewmodels (réutilisation, zéro nouveau composant)

**`StoryComposerViewModel`** (`packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift`) :

Ajout d'un init secondaire :

```swift
init(repostingFrom original: APIPost, currentSlide: StoryItem)
```

Comportement :
- `slides = [clonedSlide]` où `clonedSlide` est construit depuis `currentSlide` :
  - Médias téléchargés depuis URLs originales et préchargés dans `slideImages`.
  - `effects` copiés.
  - `backgroundColor` copié.
  - `backgroundTransform` copié.
  - Audio copié si présent.
- Sticker `RepostBadgeStickerElement` (text element avec flag `isLocked: true`) ajouté au canvas en position bas-centre, contenu : "Reposté de @\(original.author.username)".
- Champs internes `repostOfId: String?` et `originalRepostOfId: String?` initialisés depuis `original.id` et `original.originalRepostOfId ?? original.id`.

L'API publique de publication (méthode existante) propage ces deux IDs au payload de création de la story.

**`UnifiedPostComposer`** (`packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift`) :

Ajout d'un init secondaire :

```swift
public init(
    repostingFrom original: APIPost,
    currentSlide: StoryItem,
    onPublishRepost: @escaping (String, APIPost, StoryItem) -> Void,
    onDismiss: @escaping () -> Void
)
```

Comportement :
- Mode "repost" actif : variable interne `private let repostSource: (post: APIPost, slide: StoryItem)?`.
- Quand `repostSource != nil` :
  - Le slot image attachée est masqué (`if repostSource == nil { imageSlotView }`).
  - Un nouveau bloc affiché : `StoryCanvasReaderView(slide: repostSource.slide)` rendu en taille contrainte (~70% largeur écran, ratio 9:16).
  - L'embed est read-only : tap = pause/play, pas d'édition possible.
  - Le champ texte reste pleinement éditable.
  - Le sélecteur de type (post/story) est masqué (le mode est forcé à `.post`).
- À la publication, `onPublishRepost(content, original, currentSlide)` est invoqué — le caller orchestre l'appel `PostService.repost(targetType: .post, content: content)`.

**`StoryCanvasReaderView`** (`packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift`) :
- Vérifier que le composant accepte un input qui contient `media + storyEffects + audioUrl + backgroundColor` et le rejoue avec timeline + animations + audio.
- À l'audit : si l'input actuel est un `StoryItem`, ajouter un init secondaire qui prend un `APIPost` (pour le rendu feed) et un autre qui prend un `StorySlide` (pour le composer post embed).
- Probablement déjà compatible — minimaliser les changements.

### 3.4 iOS app — rendu feed (cellule post)

Dans la cellule post du feed (composant à localiser : `PostDetailView` ou `FeedPostRow` dans `apps/ios/Meeshy/Features/Main/Views/`) :

```swift
if post.type == .post && post.repostOf?.type == .story {
    // Repost-de-story rendu comme story embed
    VStack {
        if let content = post.content, !content.isEmpty {
            Text(content)
        }
        StoryCanvasReaderView(post: post)
            .frame(maxWidth: .infinity)
            .aspectRatio(9/16, contentMode: .fit)
    }
} else {
    NormalPostContent(post)
}
```

Header de cellule :
- Si `originalRepostOfId != repostOfId` (chaîne avec intermédiaire) :
  - Ligne 1 : "Reposté de @\(repostOf.author.username)"
  - Ligne 2 : "Original par @\(originalAuthor.username)"
- Sinon (repost direct de l'auteur original) :
  - "Reposté de @\(repostOf.author.username)"

Tap sur l'embed → ouvre `StoryViewerView` plein écran avec la story embed.

## 4. Flux utilisateur détaillés

### 4.1 Flux 1 — Republier en story (composer édition)

**Trigger** : Bouton « Partager » de la pile actions droite dans `StoryViewerView.swift:573-579`.

```
1. Tap bouton « Partager »
2. Pause du timer du viewer (story actuelle figée, pas de progress)
3. Présentation .fullScreenCover du StoryComposerView, init :
   StoryComposerView(repostingFrom: currentStory, currentSlide: currentSlide)
4. StoryComposerViewModel précharge :
   - slides = [clonedSlide] avec médias téléchargés et effects copiés
   - Sticker "Reposté de @author" locked en position bas-centre
5. L'utilisateur édite librement (déplacer, ajouter, modifier)
   sauf le sticker badge qui reste fixe et non-supprimable
6. Tap "Publier" :
   - Upload médias clonés (dédupliqués vers nouveau CDN si modifiés)
   - POST /posts {
       type: STORY,
       repostOfId: <storyOriginalId>,
       originalRepostOfId: <calculé>,
       content: <texte du composer>,
       media: [...],
       storyEffects: {...},
       backgroundColor: "#...",
       audioUrl: <si présent>
     }
7. Dismiss composer + viewer original  →  retour au feed/tray
8. Toast "Story repartagée"
```

### 4.2 Flux 2 — Republier en post direct (sans composer)

**Trigger** : Menu kebab `...` → nouvel item « Republier en post ».

```
1. Tap "Republier en post" dans le menu kebab
2. Appel direct à PostService.repost :
   POST /posts/:storyId/repost
   body: { targetType: "POST" }
3. Backend :
   - Trouve original (la story, type STORY)
   - Crée nouveau Post :
       type: POST
       authorId: currentUser.id
       repostOfId: storyId
       originalRepostOfId: <calculé via flatten>
       media: <duplique original.media vers nouveau CDN>
       storyEffects: <copie>
       audioUrl: <duplique vers nouveau CDN>
       backgroundColor: <copie>
       content: null
       isQuote: false
4. Réponse 200 → toast "Republié dans ton feed"
5. Le viewer reste ouvert (l'utilisateur peut continuer à parcourir
   les stories suivantes)
```

### 4.3 Flux 3 — Éditer et republier en post (composer)

**Trigger** : Menu kebab `...` → nouvel item « Éditer et republier en post ».

```
1. Tap "Éditer et republier en post"
2. Pause du timer du viewer
3. Présentation .fullScreenCover du UnifiedPostComposer, init :
   UnifiedPostComposer(
     repostingFrom: currentStory,
     currentSlide: currentSlide,
     onPublishRepost: { content, story, slide in
       // appel PostService.repost(targetType: .post, content: content)
     },
     onDismiss: { ... }
   )
4. Composer affiche :
   - Sélecteur de type masqué (forcé à .post)
   - Champ texte vide en haut, focus
   - Embed story en dessous via StoryCanvasReaderView(slide: currentSlide)
     (read-only, joue la slide avec animations/timeline/audio)
   - Slot image standard masqué
5. L'utilisateur tape son commentaire libre
6. Tap "Publier" :
   - POST /posts/:storyId/repost
     body: { targetType: "POST", content: <texte>, isQuote: false }
   - Backend identique au Flux 2 mais avec content non-null
7. Dismiss composer + viewer  →  retour au feed
8. Toast "Publié"
```

### 4.4 Flux 4 — Affichage repost-en-post dans le feed

```
1. Cellule de feed reçoit un Post p
2. Branchement de rendu :
   if p.type == .post && p.repostOf?.type == .story:
       → StoryCanvasReaderView(post: p) en aspect 9:16
       → Texte de p.content au-dessus si non-null
       → Header double attribution :
         "Reposté de @\(p.repostOf.author.username)"
         + "Original par @\(p.originalAuthor.username)"
           (le second ligne s'affiche si originalRepostOfId != repostOfId)
   else if p.type == .post:
       → NormalPostCell(p)

3. Comportement embed dans le feed :
   - Auto-play (sans son par défaut, conforme aux conventions feed)
   - Tap = unmute + plein écran via StoryViewerView (réutilisé)
   - Long press = options (copier lien, signaler)
```

### 4.5 Flux 5 — Affichage repost-en-story dans le tray

```
1. StoryTrayView affiche les groupes de stories
2. Le repost-en-story de l'utilisateur apparaît dans son propre groupe
   (visualisation : story normale type STORY)
3. StoryViewerView affiche la slide cloné + sticker
   "Reposté de @author" intégré (le sticker fait partie des éléments
   du canvas, donc rendu naturellement par StoryCanvasReaderView)
4. Le viewer du repost montre une option "Voir profil de @author"
   qui ouvre le profil de l'auteur original via originalRepostOfId
```

## 5. Composants & boundaries

### 5.1 Backend — fichiers à toucher

| Fichier | Modification |
|---------|--------------|
| `packages/shared/prisma/schema.prisma` | Ajout `originalRepostOfId String?` sur `Post`, index sur ce champ. |
| `services/gateway/src/services/PostService.ts` | Refacto `repostPost(originalId, userId, opts)` avec `targetType`/`content`/`isQuote` ; calcul `originalRepostOfId` ; snapshot médias quand STORY→POST. |
| `services/gateway/src/services/MediaService.ts` (ou helper dans PostService) | Helper `duplicateMedia(originalUrl): newUrl` avec rollback. |
| `services/gateway/src/routes/posts.ts` (ou équivalent) | Route `POST /posts/:id/repost` accepte `targetType`/`content`/`isQuote` dans le body. |
| `services/gateway/src/__tests__/unit/PostService.test.ts` | Tests : repost STORY→POST snapshot médias, calcul `originalRepostOfId` chaîne, repost STORY→STORY (créé via composer, endpoint `/posts` standard). |

### 5.2 iOS SDK — fichiers à toucher

| Fichier | Modification |
|---------|--------------|
| `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift` | Ajout `originalRepostOfId: String?` sur `APIPost`. Vérifier `APIRepostOf.type: PostType`. |
| `packages/MeeshySDK/Sources/MeeshySDK/Networking/PostService.swift` | Méthode `repost(postId, targetType?, content?)`. |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift` | Init `init(repostingFrom:currentSlide:)` ; sticker badge locked ; propagation IDs. |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` | Aucune modification visuelle — tout passe par le ViewModel préchargé. Vérifier que le sticker locked est bien rendu non-déplaçable par les `CanvasElementModifiers`. |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift` | Init `init(repostingFrom:currentSlide:onPublishRepost:onDismiss:)` ; mode repost (slot image masqué + embed story). |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift` | Audit : init prenant `APIPost` pour rendu feed, init prenant `StorySlide` pour composer post embed. Probablement déjà compatible. |

### 5.3 iOS app (apps/ios) — fichiers à toucher

| Fichier | Modification |
|---------|--------------|
| `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` | Bouton « Partager » droite (ligne 573-579) → ouvre `StoryComposerView(repostingFrom:currentSlide:)`. Suppression de l'appel direct à `reshareStory()`. |
| `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` | Menu kebab (ligne 1252-1271) : retirer ancien "Republier", ajouter "Republier en post" (Flux 2) et "Éditer et republier en post" (Flux 3). |
| `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift` | Suppression de `reshareStory()` (remplacé). Ajout `repostAsPostDirect(currentStory)` qui appelle `PostService.repost(targetType: .post)`. |
| `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift` (ou cellule feed équivalente) | Branchement de rendu : si `post.type == .post && post.repostOf?.type == .story` → `StoryCanvasReaderView` ; ajout du header double-attribution. |

### 5.4 Frontière fonctionnelle

```
┌───────────────────────────────────────────┐
│ apps/ios — orchestration                  │
│  StoryViewerView (3 points d'entrée)      │
│   ├─ « Partager » → StoryComposerView     │
│   ├─ « Republier en post » → backend      │
│   └─ « Éditer & republier » → PostComposer│
└──────────────┬────────────────────────────┘
               │
┌──────────────▼────────────────────────────┐
│ MeeshySDK — composants réutilisés         │
│  StoryComposerView (init repost)          │
│   └─ StoryComposerViewModel (préchargé)   │
│  UnifiedPostComposer (init repost)        │
│   └─ StoryCanvasReaderView (embed)        │
│  PostService.repost(targetType, content)  │
└──────────────┬────────────────────────────┘
               │
┌──────────────▼────────────────────────────┐
│ Gateway — endpoint repostPost             │
│  - Snapshot médias (duplicate to CDN)     │
│  - Calcul originalRepostOfId              │
│  - Création Post avec champs adaptés      │
└──────────────┬────────────────────────────┘
               │
┌──────────────▼────────────────────────────┐
│ Prisma + MongoDB                          │
│  Post + champs existants + nouveau        │
│  originalRepostOfId                       │
└───────────────────────────────────────────┘
```

## 6. Error handling & edge cases

| # | Scénario | Comportement |
|---|----------|--------------|
| 1 | Story originale supprimée pendant le repost | Backend `404`. iOS toast "La story originale n'est plus disponible. Ton brouillon a été conservé." Le composer reste affiché, l'utilisateur peut publier en post normal sans repost (`repostOfId` retiré). |
| 2 | Story expirée pendant le repost | Backend `404`. Mêmes règles que cas 1. |
| 3 | Snapshot upload partiellement échoué | Backend rollback (supprime médias dupliqués déjà créés), retourne `500 - Media snapshot failed`. iOS toast retry-able. Pas de Post partiel créé. |
| 4 | Connexion perdue pendant la publication | Composer reste affiché, indicateur de progression masqué, toast d'erreur retry-able. Contenu préservé via `StoryDraft` existant. Pas de file offline (cohérent avec politique stories actuelle). |
| 5 | Repost de sa propre story | Boutons « Partager » et items kebab repost masqués (`isOwnStory == true`). Le menu kebab montre uniquement « Supprimer » (déjà implémenté). |
| 6 | Repost d'une chaîne déjà cassée | Le snapshot indépendant garantit l'affichage. `originalRepostOfId` reste valide même si l'original X est supprimé (le username dans le snapshot reste). Tap sur "Original par @Bob" ouvre le profil (toujours valide), pas la story X. |
| 7 | Visibilité non-publique de l'original | Backend `403 - Cannot repost private content`. iOS masque les options de repost si `currentStory.visibility != .public`. |
| 8 | Story avec traduction multi-langue | Composer importe `originalLanguage` + `content` original. Traductions **régénérées** à la publication par le pipeline NLLB-200 (cohérent avec Prisme Linguistique). |
| 9 | Story avec audio TTS en cours de génération | Composer attend max 5s. Si pas prêt → clone sans audio + toast informatif "L'audio n'a pas pu être inclus". |
| 10 | Sticker badge "Reposté de @author" et changement de username | Sticker textuellement figé dans le snapshot (pas de référence dynamique). Cohérent avec snapshot indépendant. |
| 11 | Limites de stockage / abus | Hors scope MVP. Quota global utilisateur en place. Optimisation future possible : déduplication par hash de média. |
| 12 | Utilisateur anonyme | Boutons et items kebab repost masqués pour `currentUser == nil || currentUser.isAnonymous`. |

## 7. Testing strategy

### 7.1 Backend — tests unitaires (Jest)

**`PostService.repostPost.test.ts`** (étendre tests existants à ligne 547-600) :

- `repost STORY → POST snapshot dupliques médias vers nouveau CDN` (Q4.1)
- `repost STORY → POST copie storyEffects et audioUrl`
- `repost STORY → POST avec content non-null devient un quote`
- `repost STORY → POST avec content null reste repost simple`
- `repost calcule originalRepostOfId = original.id quand original.repostOfId est null` (Q5)
- `repost calcule originalRepostOfId = original.originalRepostOfId quand chaîne existe` (Q5 flatten)
- `repost retourne 404 si original supprimé` (edge case 1)
- `repost retourne 404 si original expiré` (edge case 2)
- `repost retourne 403 si visibility != PUBLIC` (edge case 7)
- `repost rollback médias dupliqués si une duplication échoue` (edge case 3)
- `repost rejette utilisateur anonyme` (edge case 12)

**`MediaService.duplicateMedia.test.ts`** (nouveau si extracted) :
- `duplicateMedia copie le binaire vers nouvelle URL`
- `duplicateMedia retourne new URL avec même type MIME et taille`
- `duplicateMedia rollback si échec partiel`

### 7.2 iOS SDK — tests unitaires (XCTest)

**`StoryComposerViewModelRepostTests.swift`** (nouveau, `packages/MeeshySDK/Tests/MeeshyUITests`) :
- `test_initRepostingFrom_clonesActiveSlideOnly` (Q2)
- `test_initRepostingFrom_addsLockedAuthorBadgeSticker` (Q3)
- `test_initRepostingFrom_propagatesRepostOfIdToPublishPayload` (Q5)
- `test_initRepostingFrom_propagatesOriginalRepostOfIdWhenChained` (Q5)
- `test_lockedBadgeSticker_cannotBeMovedOrDeleted` (Q3)
- `test_initRepostingFrom_clonesEffectsAndTransformations` (Q1)
- `test_initRepostingFrom_preloadsImagesFromOriginalUrls` (Q1)

**`UnifiedPostComposerRepostTests.swift`** (nouveau) :
- `test_init_repostingFrom_hidesImageAttachmentSlot`
- `test_init_repostingFrom_showsStoryCanvasReaderViewWithSnapshot`
- `test_publish_callbackReceivesRepostOfIdAndOriginalRepostOfId`
- `test_textContentEditable_embedNotInteractive` (Q4)

**`PostServiceRepostTests.swift`** (étendre existant, `packages/MeeshySDK/Tests/MeeshySDKTests/Services`) :
- `test_repost_targetTypePost_sendsCorrectBody`
- `test_repost_targetTypePost_withContent_sendsContent` (Flux 3)
- `test_decoded_APIPost_hasOriginalRepostOfIdField`

### 7.3 iOS app — tests unitaires

**`StoryViewerViewModelMenuTests.swift`** (nouveau, `apps/ios/MeeshyTests/Unit/ViewModels`) :
- `test_kebabMenu_showsRepublierEnPostItemForForeignStory` (Flux 2)
- `test_kebabMenu_showsEditerEtRepublierEnPostItemForForeignStory` (Flux 3)
- `test_kebabMenu_hidesRepostItemsForOwnStory` (edge case 5)
- `test_kebabMenu_hidesRepostItemsForNonPublicStory` (edge case 7)
- `test_shareButtonRightPile_opensStoryComposerViewWithRepostingFrom` (Flux 1)
- `test_repostAsPostDirect_showsErrorToastOn404` (edge case 1)

### 7.4 iOS app — tests d'intégration

**`StoryRepostFlowTests.swift`** (nouveau, `apps/ios/MeeshyTests/Integration`) :
- `test_flux1_endToEnd_tapPartager_composerOpens_publish_toast`
- `test_flux2_endToEnd_kebabRepublierEnPost_toast`
- `test_flux3_endToEnd_kebabEditerEtRepublier_composerOpens_publish_toast`
- `test_flow4_feedReceivesRepostViaSocket_cellRendersCorrectly`

### 7.5 Couverture targets

- Backend `PostService.repostPost` : **100% des branches** (chaîne, types, snapshot, erreurs)
- iOS SDK composer init repost : **100% des branches** (slide cloné, sticker, propagation IDs)
- Edge cases 1-12 : tous couverts par au moins 1 test

### 7.6 Ordonnancement TDD

1. **Backend first** : RED tests `PostService.repostPost`, GREEN, REFACTOR.
2. **SDK ensuite** : RED tests `StoryComposerViewModel.init(repostingFrom:)` et `UnifiedPostComposer` mode repost, GREEN, REFACTOR.
3. **App iOS dernière** : RED tests menu/boutons et cellule feed, GREEN, REFACTOR.
4. **Intégration** : tests e2e pour valider le câblage complet.

Chaque commit ajoute ≤1 fichier de tests + son implémentation. Pas de bundle.

## 8. Hors scope

Travaux liés mais traités dans des spécifications séparées :

- **P0 immédiat** (autre cycle, voir tasks #1-#6 du board) :
  - Fix bouton « Répondre » manquant sur 3 call sites de `StoryViewerContainer`.
  - Durée d'affichage des stories 5→10s + préparation config user.
- **P2** (autre cycle, task #10 du board) :
  - Réponses aux commentaires d'une story (nested replies, parent-comment-id).

## 9. Open questions / future work

- **Déduplication des médias snapshot par hash** : optimisation stockage future si l'usage du repost devient massif (hors MVP).
- **Profile attribution dynamique** : actuellement le sticker badge "Reposté de @author" est figé textuellement. Si on veut une référence dynamique au profil (toujours à jour), il faudrait stocker `authorId` séparément et résoudre le username au rendu. Trade-off à discuter en P3.
- **Engagement métadonnées** : compteur "Vu via les reposts de @Alice" sur le post original (Q6 mentionné comme évolution). Hors scope MVP.
- **Repost en story d'un POST classique** : aujourd'hui non couvert. Le bouton « Partager » du `StoryViewerView` n'apparaît que dans le viewer story. Si on veut permettre "transformer un post en story" via `PostDetailView`, c'est un nouveau spec.
