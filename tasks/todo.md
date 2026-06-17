# Partage de réel — affichage + re-partage + édition (iOS d'abord)

> Source : rapport 2026-06-17. Bugs signalés par l'utilisateur sur le partage de réels.

## Diagnostic (vérifié dans le code)

| # | Symptôme | Cause racine | Preuve |
|---|----------|--------------|--------|
| 1 | Carte du réel partagé **vide** | `FeedPostCard.repostView()` n'affiche que `Text(repost.content)`, vide pour un réel (le contenu d'un réel vit dans `media` + `storyEffects`, pas `content`). Seuls les reposts de STORY ont un rendu riche (`StoryRepostEmbedCell`). | `FeedPostCard.swift:514-576`, `:262-277` ; `StoryRepostEmbedCell.swift` |
| 2 | Re-partage d'un partage → **affiche/référence vide** | Le bouton « Repartager » envoie `post.id` (poste intermédiaire B, type POST sans média propre). Le gateway pose `repostOfId = B`, et `repostOfInclude` **n'hydrate qu'un niveau** (pas de récursion) → la carte montre B vide. `originalRepostOfId` pointe pourtant déjà sur le réel racine. | `FeedPostCard.swift:676` ; `PostService.ts:1093-1095` ; `postIncludes.ts:119-135` |
| 3 | **Logo Réel disparaît** dans le Feed | Le Feed fait `if post.isReel → ReelFeedCard` (logo Réel haut-droit), sinon `FeedPostCard`. Un partage de réel est de **type POST** → pas de logo. | `FeedView.swift:630-633` ; `ReelFeedCard.swift:178` |
| 4 | Édition : pas de choix langue / type | `UpdatePostSchema` n'inclut ni `originalLanguage` ni `type` (immuables). `EditPostSheet` = texte seul. SDK `update()` = `content/visibility/moodEmoji`. | `PostService.ts:452-457` ; `EditPostSheet.swift:16-18` ; `PostService.swift:27` |

**Backend OK** : `repostOfInclude` hydrate déjà content, media, storyEffects, audioUrl, author. Les fixes 1/3 sont 100 % côté client.

## Décisions produit (validées par l'utilisateur)
1. **Plateforme** : iOS d'abord (web = lot 4 en suivi).
2. **Re-partage** : toujours résoudre vers le **réel original** (racine via `originalRepostOfId`).
3. **Carte de partage** : **aperçu réel riche** (vidéo + play + logo Réel + auteur + légende + compteurs), réutilise le style `ReelFeedCard`. Tap → détail du réel.
4. **Édition** : langue → **re-traduction** (pipeline ZMQ existant) ; type éditable **POST↔RÉEL**.

---

## Lot 1 — Affichage carte de partage de réel (fixe bugs 1 + 3) · iOS
- [ ] **Créer `ReelRepostEmbedCell.swift`** (`apps/ios/Meeshy/Features/Main/Views/`), calqué sur `StoryRepostEmbedCell` : attribution « Repartagé de @auteur » + aperçu réel riche (poster vidéo + bouton play + **logo Réel** glyphe haut-droit + légende `storyEffects.text`/`content` + compteurs ❤/💬). Inputs primitifs/value (`FeedPost`, `preferredContentLanguages`). Tap → `onTapRepost?(repost.id)` (détail réel).
- [ ] **Ajouter `isReelRepost`** dans `FeedPostCard` (miroir de `isStoryRepost`) : `repost?.type == "REEL"`. Brancher dans le `else` (`FeedPostCard.swift:262-277`) : `if isStoryRepost {…} else if isReelRepost { ReelRepostEmbedCell(…) } else { repostView(…) }`.
- [ ] **Réutilisation max** : factoriser le glyphe « logo Réel » de `ReelFeedCard.swift:178` en sous-vue partagée si trivial, sinon dupliquer le seul glyphe (pas tout le card autoplay).
- [ ] **Tests** : snapshot `ReelRepostEmbedCell` (réel avec/​sans légende) ; test pur `FeedPostCard.isReelRepost` (REEL vs STORY vs POST). RED→GREEN.
- [ ] `./apps/ios/meeshy.sh build` vert + smoke simulateur (partage direct d'un réel affiche la carte riche + logo).

## Lot 2 — Re-partage résout la racine (fixe bug 2) · iOS
- [ ] **Résoudre l'ID racine à l'émission** : au call site du bouton « Repartager » (`FeedPostCard.swift:676` → `onRepost?(post.id)`), passer l'ID racine quand le poste est déjà un partage : `let shareTargetId = post.repost.map { $0.originalRepostOfId ?? $0.id } ?? post.id`. Ainsi `repostOfId` pointe directement sur le réel → carte hydratée correctement (réutilise le Lot 1).
- [ ] Vérifier que `RepostContent.originalRepostOfId` est bien mappé (déjà confirmé `FeedModels.swift:199`).
- [ ] **Tests** : `FeedViewModelTests` — repost d'un partage appelle `postService.repost(postId:)` avec l'ID racine (mock `MockPostService` call-count + `lastRepostPostId`). RED→GREEN.
- [ ] Smoke : re-partager un partage de réel affiche le réel (pas une carte vide), une seule fois.

## Lot 3 — Édition : langue (re-traduction) + type POST↔RÉEL
### 3a. Gateway
- [ ] **Étendre `UpdatePostSchema`** (`services/gateway/src/routes/posts/types.ts:200-211`) : `originalLanguage?: string`, `type?: 'POST'|'REEL'` (Zod enum restreint).
- [ ] **`PostService.updatePost`** (`PostService.ts:452`) : accepter `originalLanguage?`, `type?`. Si `type` change → recalculer `expiresAt` via `computeExpiresAt(type)` (REEL a une expiry, `PostService.ts:29`). Garde-fou : type ∈ {POST,REEL} uniquement ; refus si le poste est un repost/story (préserver l'invariant). Auteur-only déjà en place.
- [ ] **Re-traduction** : si `originalLanguage` change (et `content` présent), réutiliser le chemin ZMQ existant (`translateToMultipleLanguages` + handler `translations.${lang}`, `PostService.ts:242-318`) — purger les `translations` périmées puis ré-émettre la requête avec la nouvelle source. Extraire le bloc create en méthode privée réutilisable si nécessaire.
- [ ] **Tests gateway (jest)** : updatePost change type→recalcule expiresAt ; change langue→déclenche traduction (mock ZMQ) + purge translations ; rejette type invalide ; rejette non-auteur ; rejette édition type sur un repost.

### 3b. SDK iOS
- [ ] **Étendre `PostServiceProviding.update` + impl** (`PostService.swift:27`, `:214`) : ajouter `originalLanguage: String? = nil`, `type: String? = nil` au body. Pas de breaking change (defaults nil).
- [ ] **Tests SDK** : `update(...)` sérialise `originalLanguage`/`type` dans le payload quand fournis ; les omet sinon.

### 3c. iOS UI
- [ ] **`EditPostSheet`** : remplacer `onSave: (String) async` par un draft `onSave: (EditPostDraft) async` (`content`, `language`, `type`). Ajouter picker langue (réutiliser `LanguagePickerSheet`/`ProfileLanguagePickerSheet`) + picker type (segmenté POST/RÉEL). Pré-remplir depuis le poste. Garder TextEditor + compteur.
- [ ] **`PostDetailViewModel.updatePost`** (`:399`) : signature `updatePost(content:language:type:)`, optimistic update + appel SDK étendu, rollback sur échec.
- [ ] **Tests ViewModel** : `updatePost` transmet language+type au service (mock) ; rollback sur erreur.
- [ ] Smoke : éditer un poste → changer langue (re-traduction visible) + basculer POST↔RÉEL (re-dispatch carte/Feed).

## Lot 4 — Parité Web (suivi, hors scope immédiat)
- [ ] `PostCard.tsx` : rendre `post.repostOf` (contenu/média/auteur) ; carte de partage de réel ; logo/badge réel.
- [ ] `feeds/page.tsx:558` : passer `repostOf` au lieu de `post.content`/`post.media` pour les reposts.
- [ ] `PostEditor.tsx` : pickers langue + type.

---

## Garde-fous / pièges connus
- iOS xcodeproj classique (objectVersion 63) : tout nouveau `.swift` = 4 entrées pbxproj + 2 UUIDs (cf. `feedback_ios_classic_pbxproj`). `ReelRepostEmbedCell.swift` à câbler.
- Leaf views Feed : pas d'`@ObservedObject` sur singletons (cellules recyclées). Inputs `let`/primitifs.
- `EditPostSheet.onSave` change de signature → mettre à jour TOUS les call sites (`PostDetailView.swift`).
- TDD strict : RED avant GREEN à chaque lot. `./apps/ios/meeshy.sh test` (scheme MeeshySDK-Package pour SDK) avant commit.
- Commits isolés par lot, sans trailer Co-Authored-By.

## Review — LOTS 1-3 LIVRÉS & VÉRIFIÉS (2026-06-17, iOS)

### Lot 1 — Carte de partage de réel + logo (bugs 1 + 3)
- SDK `RepostContent.isReel` + `primaryReelMedia` (miroir `FeedPost`).
- Nouvelle vue `ReelRepostEmbedCell.swift` : poster + play + badge/logo Réel + auteur + légende + ❤.
- `FeedPostCard.isReelRepost` + branche dispatch (`if isStoryRepost … else if isReelRepost { ReelRepostEmbedCell } else …`).
- pbxproj câblé (UUIDs `RREMB…`).
- ✅ Build succeeded ; SDK `RepostContent reel classification` 5/5.

### Lot 2 — Re-partage résout la racine (bug 2)
- `FeedViewModel.resolveRepostTargetId` : un re-partage d'un partage cible le réel racine (`originalRepostOfId ?? repost.id`).
- ✅ `FeedViewModelTests` repost résolution 4/4 (direct, chaîné, original inchangé).

### Lot 3 — Édition : langue (re-traduction) + type POST↔RÉEL
- Gateway : `UpdatePostSchema` (+`originalLanguage`,`type` POST|REEL) ; `updatePost` (garde-fous 422 : repost, STORY/STATUS, REEL sans média ; re-traduction ZMQ source explicite ; purge translations) ; route 422 surfacée ; `triggerStoryTextTranslation(sourceLanguageOverride)`.
- SDK : `PostService.update(originalLanguage:type:)` + `UpdatePostRequest`.
- iOS : `EditPostSheet` v2 (picker langue `ProfileLanguagePickerSheet` + segmented POST/RÉEL conditionnel) → `EditPostDraft` ; `FeedViewModel`/`PostDetailViewModel.updatePost(content:language:type:)` ; 3 call-sites alignés.
- ✅ Gateway typecheck clean + jest `updatePost` 9/9 ; iOS build + `FeedViewModelTests` updatePost 2/2 ; SDK UITests compile 1/1.

### Vérification globale
- `./apps/ios/meeshy.sh build` : succeeded.
- iOS tests : 98 (FeedViewModel 77+2, PostDetailViewModel) 0 échec ; SDK 5+1.
- Gateway : `tsc --noEmit` 0 erreur ; jest PostService updatePost 9/9.

### Reste
- **Smoke device/simu** : rendu visuel `ReelRepostEmbedCell` + pickers `EditPostSheet` (pas d'infra snapshot dans le target app).
- **Lot 4 (web)** : `PostCard.tsx` ignore `repostOf` — à porter (différé, iOS-first).
- Non commité (en attente d'accord user).
