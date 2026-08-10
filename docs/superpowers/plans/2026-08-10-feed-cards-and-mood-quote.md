# Cartes de feed et citation de mood — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le média d'une carte de post remplit enfin la carte au lieu de s'afficher en timbre-poste letterboxé, le fond d'une carte de réel suit la règle produit, et la citation d'un mood affiche l'auteur et sa date sur la ligne de titre au lieu d'écraser le contenu.

**Architecture:** Cinq corrections indépendantes tirées des lots 4 et 5 de la spec. Chaque calcul de mise en page sort en fonction **pure** testable sans rendu, sur le modèle de `reelCardHeight` (`ReelFeedLayout.swift`) qui existe déjà. La perte de l'auteur d'un mood traverse gateway puis iOS : le champ n'existe nulle part, il faut le produire avant de pouvoir le lire.

**Tech Stack:** Swift 6 / SwiftUI (app iOS + MeeshySDK), TypeScript strict + Jest (gateway), XCTest, Prisma/MongoDB.

**Spec:** `docs/superpowers/specs/2026-08-10-ipad-parity-and-immersive-cards-design.md` — lots 4 et 5, défauts 7, 8 et 9.

## Global Constraints

- **Pas d'édition manuelle de `apps/ios/Meeshy.xcodeproj/project.pbxproj`.** `apps/ios/project.yml` est la source de vérité ; tout nouveau `.swift` sous `Meeshy/` est auto-inclus par `xcodegen generate`. Ne jamais committer le churn d'une régénération locale — le dépôt a des sessions concurrentes.
- **PIÈGE — deux `postReplySnapshot.ts` homonymes.** `services/gateway/src/services/posts/postReplySnapshot.ts` est **du code mort** : aucun consommateur ne l'importe. Les trois consommateurs réels (`MessageProcessor.ts`, `MessageHandler.ts`, `routes/conversations/messages.ts`) importent tous `services/gateway/src/services/**messaging**/postReplySnapshot.ts`. La copie morte a ses propres tests, qui resteront verts si on édite le mauvais fichier. **La tâche 3 ne touche QUE la copie `messaging/`.** Ne pas supprimer la copie morte dans ce plan — hors périmètre, à traiter séparément.
- **Tests iOS : exécution sur le runtime 18.2.** Compile Xcode 26.1.1, run simulateur iOS 18.2 — les runtimes 18.5+/26.x crashent au teardown xctest et les baselines snapshot sont enregistrées sur 18.2.
- **Aucun `@ObservedObject` sur singleton ajouté** dans `FeedPostCard`, `ReelFeedCard` ou les sous-vues de bulle : ce sont des cellules de liste, la règle « Zero Unnecessary Re-render » s'applique. Entrées primitives, `Equatable` conservé.
- **Gateway : `sendSuccess()`/`sendError()`** depuis `utils/response.ts` pour toute réponse — aucune route n'est touchée ici, mais la règle tient si une tâche dérive.
- **Pas de trailer `Co-Authored-By`** dans les messages de commit.

---

## File Structure

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift` (modifier, après ~755) | `reelBackgroundMedia` — visuel de fond, distinct du média joué | 1 |
| `apps/ios/Meeshy/Features/Main/Views/ReelFeedCard.swift` (modifier, ~120 et ~208) | Affiche la couverture derrière un réel audio | 1 |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Models/FeedReelClassificationTests.swift` (modifier) | Verrouille fond ≠ lecture | 1 |
| `apps/ios/Meeshy/Features/Main/Views/FeedPostCardLayout.swift` (créer) | `postCardMediaHeight` pure + modifieur `fittedMediaHeight` | 2 |
| `apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift` (modifier) | Retire le cadre fixe 220, branche les deux cellules sur le modifieur | 2 |
| `apps/ios/MeeshyTests/Unit/Views/FeedPostCardLayoutTests.swift` (créer) | Bornes de hauteur du média de post | 2 |
| `services/gateway/src/services/messaging/postReplySnapshot.ts` (modifier) | Ajoute l'auteur au snapshot figé | 3 |
| `services/gateway/src/__tests__/unit/services/messaging/postReplySnapshot.test.ts` (modifier) | Capture + rétro-compatibilité de l'auteur | 3 |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift` (modifier, ~316 et ~739) | Décode `authorName`, le propage dans `uiReplyTo` | 4 |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Models/MoodReplyAuthorTests.swift` (créer) | L'auteur survit à l'écho serveur | 4 |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift` (modifier, 109-192 et 221-258) | Date sur la ligne de titre, contenu pleine largeur | 5 |
| `apps/ios/MeeshyTests/Unit/Views/BubbleMoodQuoteLayoutTests.swift` (créer) | Garde de composition de la citation mood | 5 |

Les tâches 1, 2 et 5 sont indépendantes entre elles. La tâche 4 **dépend** de la 3 : sans le champ produit côté gateway, il n'y a rien à décoder.

---

### Task 1: Fond d'une carte de réel sans casser la lecture

La règle produit veut « la vidéo parmi les médias, sinon le premier contenu » en
fond. Trois propriétés portent aujourd'hui l'ordre `vidéo > audio > image` :
`FeedPost.primaryReelMedia` (731), `FeedPost.primaryReelDisplayMedia` (750) et
`RepostContent.primaryReelMedia` (327).

**Ne PAS se contenter d'en réordonner une.** `ReelFeedCard.media` lit
`primaryReelDisplayMedia` et en dérive `kind` (ligne 144), qui pilote à la fois
le FOND, l'AUTOPLAY et l'action « Sauvegarder » (lignes 430-489). Un réel
`[image, audio]` — composition licite, `ReelComposition.qualifiesAsReel` accepte
un audio seul ou deux images — passerait de `kind == .audio` à
`kind == .imageOnly` : l'image s'afficherait, et **l'audio cesserait de jouer**.

La correction sépare donc les deux responsabilités au lieu de les confondre : le
média JOUÉ garde son ordre actuel, un nouveau média de FOND porte la règle
visuelle. Un réel audio avec image de couverture affiche alors sa couverture ET
joue son audio — ce que ni l'ordre actuel ni un simple réordonnancement ne
donnent.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift` — ajout après `primaryReelDisplayMedia` (ligne 755)
- Modify: `apps/ios/Meeshy/Features/Main/Views/ReelFeedCard.swift:194-227` (branche `.audio` du fond)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/FeedReelClassificationTests.swift` (suite existante `FeedPostReelDisplayMediaTests`)

**Interfaces:**
- Consumes: `FeedPost.reelDisplayMedia: [FeedMedia]` (ligne 742) ; fabriques de test existantes `FeedMedia.image(color:)`, `.video(duration:color:)`, `.audio(duration:color:)` (production, `FeedModels.swift:91-105`) ; `FeedPost(author:type:content:media:mediaUrl:)`
- Produces: `FeedPost.reelBackgroundMedia: FeedMedia?` — vidéo, sinon première image, sinon `nil`
- **Inchangés** : `primaryReelMedia` et `primaryReelDisplayMedia`, et donc toutes les suites existantes qui les verrouillent

- [ ] **Step 1: Write the failing test**

Ajouter ces cas à la suite `FeedPostReelDisplayMediaTests` déjà présente dans
`FeedReelClassificationTests.swift` (elle a déjà la fabrique `post(type:media:)`
en tête de suite — la réutiliser, ne pas en créer une seconde). Le fichier est
en Swift Testing (`@Suite` / `@Test` / `#expect`), conformément à la convention
du dépôt pour les tests de modèles purs du SDK.

```swift
    @Test("le fond préfère la vidéo")
    func backgroundPrefersVideo() {
        let p = post(type: "REEL", media: [.image(), .audio(duration: 10), .video(duration: 20)])
        #expect(p.reelBackgroundMedia?.type == .video)
    }

    @Test("un réel audio avec couverture montre l'image, pas le dégradé")
    func backgroundPrefersImageOverAudio() {
        let p = post(type: "REEL", media: [.image(), .audio(duration: 10)])
        #expect(p.reelBackgroundMedia?.type == .image)
        // La LECTURE reste sur l'audio : le fond ne doit pas la détourner.
        #expect(p.primaryReelDisplayMedia?.type == .audio)
    }

    @Test("un réel audio sans image n'a pas de fond visuel")
    func backgroundNilForAudioOnly() {
        let p = post(type: "REEL", media: [.audio(duration: 10)])
        #expect(p.reelBackgroundMedia == nil)
    }

    @Test("le fond suit le repost quand le post extérieur est vide")
    func backgroundFollowsRepost() {
        var p = post(type: "REEL", media: [])
        p.repost = RepostContent(author: "Marie", content: "", type: "REEL",
                                 media: [.image(), .audio(duration: 4)])
        #expect(p.reelBackgroundMedia?.type == .image)
    }

    @Test("aucun média nulle part : pas de fond")
    func backgroundNilWhenEmpty() {
        #expect(post(type: "REEL", media: []).reelBackgroundMedia == nil)
    }
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro,OS=18.2' \
  -only-testing:MeeshySDKTests/FeedPostReelDisplayMediaTests -quiet
```

Attendu : ÉCHEC DE COMPILE — `value of type 'FeedPost' has no member 'reelBackgroundMedia'`.

- [ ] **Step 3: Write minimal implementation**

Dans `FeedModels.swift`, ajouter juste après `primaryReelDisplayMedia` (après la
ligne 755) :

```swift
    /// Média à afficher en FOND d'une surface réel : la vidéo si le post en
    /// porte une, sinon la première image. `nil` quand aucun visuel n'existe —
    /// l'appelant rend alors son propre fond (dégradé audio, couleur d'accent).
    ///
    /// Distinct de `primaryReelDisplayMedia`, qui désigne le média JOUÉ et
    /// préfère l'audio à l'image. Les confondre ferait taire un réel audio
    /// portant une image de couverture : son `kind` basculerait sur `.imageOnly`
    /// et l'autoplay ne le prendrait plus.
    var reelBackgroundMedia: FeedMedia? {
        let list = reelDisplayMedia
        if let video = list.first(where: { $0.type == .video }) { return video }
        return list.first(where: { $0.type == .image })
    }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro,OS=18.2' \
  -only-testing:MeeshySDKTests/FeedPostReelDisplayMediaTests -quiet
```

Attendu : toute la suite PASS, y compris les 5 cas préexistants — aucune
propriété existante n'a changé.

- [ ] **Step 5: Afficher la couverture derrière un réel audio**

Dans `ReelFeedCard.swift`, ajouter la propriété de fond à côté de `media`
(ligne 120) :

```swift
    /// Visuel de fond — distinct de `media`, qui porte le média JOUÉ.
    private var backgroundMedia: FeedMedia? { post.reelBackgroundMedia }
```

puis remplacer la branche `case .audio:` du `switch kind` (ligne 208) par :

```swift
        case .audio:
            // Un réel audio avec image de couverture montre sa couverture ; le
            // dégradé animé n'est le repli que lorsqu'il n'y a aucun visuel.
            if let cover = backgroundMedia,
               cover.thumbnailUrl != nil || cover.url != nil || cover.thumbHash != nil {
                ProgressiveCachedImage(
                    thumbHash: cover.thumbHash,
                    thumbnailUrl: cover.thumbnailUrl,
                    fullUrl: cover.url,
                    autoLoad: true
                ) {
                    Color(hex: cover.thumbnailColor)
                        .shimmer()
                }
                .aspectRatio(contentMode: .fill)
                .frame(width: width, height: height)
                .clipped()
            } else {
                ReelAudioBackdrop(accentHex: accentHex, isActive: isActive)
            }
```

- [ ] **Step 6: Vérifier la compile de l'app**

```bash
(cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate)
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
```

Attendu : compile verte. `kind` n'a pas changé : autoplay et « Sauvegarder »
continuent de viser le média joué.

- [ ] **Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Models/FeedReelClassificationTests.swift \
        apps/ios/Meeshy/Features/Main/Views/ReelFeedCard.swift
git commit -m "feat(reels): le fond d'un réel audio montre sa couverture

Le fond et la lecture partageaient primaryReelDisplayMedia, qui préfère
l'audio à l'image. Un réel audio portant une couverture affichait donc le
dégradé animé au lieu de son image.

reelBackgroundMedia porte la règle VISUELLE (vidéo, sinon première image) ;
primaryReelDisplayMedia garde la règle de LECTURE. Les réordonner ensemble
aurait fait basculer kind sur .imageOnly et coupé l'autoplay audio."
```
---

### Task 2: Hauteur du média d'une carte de post

`mediaPreview` impose `.frame(height: 220)` par-dessus `FeedVideoMediaCell`, dont la hauteur propre vaut `largeur / ratio` (≈ 1,6 × largeur pour un portrait). Les deux se contredisent : le lecteur se replie au centre et un clip vertical s'affiche en timbre-poste letterboxé.

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/FeedPostCardLayout.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift:15-18` (cadre fixe), `:282-301` (`imageMediaView`), `:387-441` (`FeedVideoMediaCell` + `FeedVideoWidthKey`)
- Test: `apps/ios/MeeshyTests/Unit/Views/FeedPostCardLayoutTests.swift`

**Interfaces:**
- Consumes: `FeedMedia.width: Int?`, `FeedMedia.height: Int?`
- Produces:
  - `func postCardMediaHeight(mediaWidth: Int?, mediaHeight: Int?, cardWidth: CGFloat, maxTallRatio: CGFloat = 1.4, minRatio: CGFloat = 0.75) -> CGFloat`
  - `extension View { func fittedMediaHeight(mediaWidth: Int?, mediaHeight: Int?) -> some View }`
  - `struct FeedMediaWidthKey: PreferenceKey`

- [ ] **Step 1: Write the failing test**

Créer `apps/ios/MeeshyTests/Unit/Views/FeedPostCardLayoutTests.swift` :

```swift
import XCTest
import CoreGraphics
@testable import Meeshy

final class FeedPostCardLayoutTests: XCTestCase {

    private let cardWidth: CGFloat = 400

    func test_postCardMediaHeight_portrait_isCappedAtMaxTallRatio() {
        // 9:16 → ratio h/w = 1.78, au-dessus du plafond 1.4.
        // C'est LE cas cassé aujourd'hui : le clip vertical letterboxait.
        let h = postCardMediaHeight(mediaWidth: 1080, mediaHeight: 1920, cardWidth: cardWidth)
        XCTAssertEqual(h, 560) // 400 × 1.4
    }

    func test_postCardMediaHeight_landscape_isFlooredAtMinRatio() {
        // 16:9 → ratio h/w = 0.5625, sous le plancher 0.75.
        let h = postCardMediaHeight(mediaWidth: 1920, mediaHeight: 1080, cardWidth: cardWidth)
        XCTAssertEqual(h, 300) // 400 × 0.75
    }

    func test_postCardMediaHeight_squareIsInsideBounds_usesSourceRatio() {
        let h = postCardMediaHeight(mediaWidth: 1000, mediaHeight: 1000, cardWidth: cardWidth)
        XCTAssertEqual(h, 400) // 400 × 1.0
    }

    func test_postCardMediaHeight_fourFive_usesSourceRatio() {
        // 4:5 → 1.25, dans les bornes : ni rogné ni étiré.
        let h = postCardMediaHeight(mediaWidth: 1080, mediaHeight: 1350, cardWidth: cardWidth)
        XCTAssertEqual(h, 500) // 400 × 1.25
    }

    func test_postCardMediaHeight_unknownDimensions_fallsBackToMinRatio() {
        XCTAssertEqual(postCardMediaHeight(mediaWidth: nil, mediaHeight: nil, cardWidth: cardWidth), 300)
    }

    func test_postCardMediaHeight_zeroDimensions_fallsBackToMinRatio() {
        XCTAssertEqual(postCardMediaHeight(mediaWidth: 0, mediaHeight: 0, cardWidth: cardWidth), 300)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
(cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate)
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
```

Attendu : ÉCHEC DE COMPILE — `cannot find 'postCardMediaHeight' in scope`. C'est le rouge attendu ; ne pas chercher plus loin.

- [ ] **Step 3: Write minimal implementation**

Créer `apps/ios/Meeshy/Features/Main/Views/FeedPostCardLayout.swift` :

```swift
import SwiftUI

// MARK: - Hauteur du média d'une carte de post
//
// Pendant de `reelCardHeight` (ReelFeedLayout.swift) pour les cartes de POST,
// qui ne sont PAS immersives : le texte est affiché, puis le média.
//
// Le média occupe toute la largeur de la carte ; sa hauteur dérive du ratio
// source, bornée. Sans plafond, un clip vertical avale la colonne et le feed
// cesse d'être parcourable ; sans plancher, un panorama dégénère en filet.
//
// Convention de ratio IDENTIQUE à `reelCardHeight` : `hauteur / largeur`.

/// Hauteur du média d'une carte de post, en points.
/// Dimensions source absentes ou nulles → repli sur le plancher (`minRatio`),
/// cohérent avec l'ancien défaut 16:9 du lecteur vidéo, lui aussi sous plancher.
func postCardMediaHeight(
    mediaWidth: Int?,
    mediaHeight: Int?,
    cardWidth: CGFloat,
    maxTallRatio: CGFloat = 1.4,
    minRatio: CGFloat = 0.75
) -> CGFloat {
    guard let w = mediaWidth, let h = mediaHeight, w > 0, h > 0 else {
        return (cardWidth * minRatio).rounded()
    }
    let ratio = CGFloat(h) / CGFloat(w)
    return (cardWidth * min(max(ratio, minRatio), maxTallRatio)).rounded()
}

// MARK: - Application de cette hauteur à une vue média

/// Largeur réellement offerte au média, publiée par le fond de la vue.
struct FeedMediaWidthKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

/// Impose au média la hauteur dérivée de son ratio, la largeur restant libre.
///
/// La largeur est mesurée par un `GeometryReader` en `.background` — jamais en
/// conteneur : un reader qui enveloppe la vue détournerait la mise en page et
/// laisserait la largeur devenir la dimension libre, exactement ce qui faisait
/// s'effondrer les clips verticaux avant cette correction.
private struct FittedMediaHeight: ViewModifier {
    let mediaWidth: Int?
    let mediaHeight: Int?

    @State private var measuredWidth: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .frame(maxWidth: .infinity)
            .frame(height: measuredWidth > 0
                   ? postCardMediaHeight(mediaWidth: mediaWidth, mediaHeight: mediaHeight, cardWidth: measuredWidth)
                   : nil)
            .background(
                GeometryReader { geo in
                    Color.clear.preference(key: FeedMediaWidthKey.self, value: geo.size.width)
                }
            )
            .onPreferenceChange(FeedMediaWidthKey.self) { width in
                if width > 0, abs(width - measuredWidth) > 0.5 { measuredWidth = width }
            }
    }
}

extension View {
    /// Cadre le média à la largeur de la carte, hauteur dérivée du ratio source.
    func fittedMediaHeight(mediaWidth: Int?, mediaHeight: Int?) -> some View {
        modifier(FittedMediaHeight(mediaWidth: mediaWidth, mediaHeight: mediaHeight))
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
(cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate)
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=iPhone 16 Pro,OS=18.2" \
  -only-testing:MeeshyTests/FeedPostCardLayoutTests -derivedDataPath apps/ios/Build
```

Attendu : 6 tests PASS.

- [ ] **Step 5: Brancher la cellule vidéo sur le modifieur**

Dans `FeedPostCard+Media.swift`, remplacer intégralement `FeedVideoMediaCell` et `FeedVideoWidthKey` (lignes 387 à 441) par :

```swift
// MARK: - Feed video cell (remplit la largeur de la carte, hauteur au ratio)

/// Vidéo d'une carte de post. La hauteur vient de `fittedMediaHeight` — la
/// largeur n'est JAMAIS la dimension libre, sinon un clip portrait s'effondre
/// et se centre en letterbox (le défaut corrigé le 2026-08-10 : un
/// `.frame(height: 220)` posé par `mediaPreview` écrasait le calcul local).
private struct FeedVideoMediaCell: View {
    let media: FeedMedia
    let accentColor: String
    let onExpand: () -> Void

    var body: some View {
        let attachment = media.toMessageAttachment()
        VideoAvailabilityResolver(attachment: attachment, autoDownload: true) { availability, onDownload in
            MeeshyVideoPlayer(
                attachment: attachment,
                style: .inline,
                controls: .inlineDefault,
                accentColor: accentColor,
                frame: .card,
                availability: availability,
                performance: .inline,
                onDownload: onDownload,
                onExpand: onExpand
            )
        }
        .fittedMediaHeight(mediaWidth: media.width, mediaHeight: media.height)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
```

- [ ] **Step 6: Brancher la cellule image sur le modifieur**

Dans le même fichier, remplacer `imageMediaView` (lignes 282-301) par :

```swift
    func imageMediaView(_ media: FeedMedia) -> some View {
        ProgressiveCachedImage(
            thumbHash: media.thumbHash,
            thumbnailUrl: media.thumbnailUrl,
            fullUrl: media.url,
            autoLoad: true
        ) {
            Color(hex: media.thumbnailColor)
                .shimmer()
        }
        // Pas de ratio explicite : l'image remplit le cadre que
        // `fittedMediaHeight` lui donne, et le débord est rogné.
        .aspectRatio(contentMode: .fill)
        .fittedMediaHeight(mediaWidth: media.width, mediaHeight: media.height)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .onTapGesture { openFullscreen(media) }
    }
```

- [ ] **Step 7: Retirer le cadre fixe qui écrasait le calcul**

Dans le même fichier, remplacer le bloc `count == 1` de `mediaPreview` (lignes 15-18) par :

```swift
        if count == 1, let media = mediaList.first {
            // Aucun cadre de hauteur ici : image et vidéo portent la leur via
            // `fittedMediaHeight`. Le `.frame(height: 220)` qui vivait ici
            // écrasait ce calcul et letterboxait les clips verticaux.
            // L'audio et les documents restent compacts et s'auto-dimensionnent.
            singleMediaView(media)
                .contentShape(RoundedRectangle(cornerRadius: 12))
        } else if count == 2 {
```

- [ ] **Step 8: Vérifier la compile et la suite complète des vues**

```bash
(cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate)
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=iPhone 16 Pro,OS=18.2" \
  -only-testing:MeeshyTests/FeedPostCardLayoutTests -derivedDataPath apps/ios/Build
```

Attendu : compile verte, 6 tests PASS. `mediaIsCompact` n'est plus lu par `mediaPreview` mais reste utilisé ailleurs dans le fichier — si le compilateur signale qu'il devient inutilisé, **ne pas le supprimer** sans vérifier ses autres appelants par `grep -rn "mediaIsCompact" apps/ios`.

- [ ] **Step 9: Vérification visuelle sur simulateur iPad**

```bash
xcrun simctl boot 2A57216B-AF65-4CF8-AFB4-9E35DC9C1E5B 2>/dev/null; open -a Simulator
./apps/ios/meeshy.sh build --ipad
xcrun simctl install 2A57216B-AF65-4CF8-AFB4-9E35DC9C1E5B \
  apps/ios/Build/Products/Debug-iphonesimulator/Meeshy.app
xcrun simctl launch 2A57216B-AF65-4CF8-AFB4-9E35DC9C1E5B me.meeshy.app
sleep 10
xcrun simctl io 2A57216B-AF65-4CF8-AFB4-9E35DC9C1E5B screenshot /tmp/feed-after.png
```

Ouvrir `/tmp/feed-after.png` et vérifier sur la colonne Feed : le clip vertical de « Belva Tano » remplit la largeur de la carte, sans bandes noires latérales ni miniature centrée. Comparer à la capture d'origine du 2026-08-10.

- [ ] **Step 10: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FeedPostCardLayout.swift \
        apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift \
        apps/ios/MeeshyTests/Unit/Views/FeedPostCardLayoutTests.swift
git commit -m "fix(ios): le média d'une carte de post remplit la carte

mediaPreview imposait .frame(height: 220) par-dessus FeedVideoMediaCell,
dont la hauteur propre vaut largeur/ratio. Les deux se contredisaient : le
lecteur se repliait au centre et un clip vertical s'affichait en
timbre-poste letterboxé.

La hauteur sort en fonction pure postCardMediaHeight, bornée entre 0,75x et
1,4x la largeur, appliquée par le modifieur fittedMediaHeight que partagent
image et vidéo. Même convention de ratio que reelCardHeight."
```

---

### Task 3: Auteur du mood dans le snapshot gateway

Le snapshot figé `PostReplyTo` ne porte **aucun champ auteur**. Le nom n'existe que dans la référence optimiste locale de l'app et se perd au premier écho serveur : la citation retombe alors sur le libellé générique « Humeur ».

**Rappel du piège :** éditer `services/gateway/src/services/**messaging**/postReplySnapshot.ts`. La copie sous `services/posts/` est morte et ses tests resteront verts.

**Files:**
- Modify: `services/gateway/src/services/messaging/postReplySnapshot.ts`
- Test: `services/gateway/src/__tests__/unit/services/messaging/postReplySnapshot.test.ts`

**Interfaces:**
- Consumes: modèle Prisma `Post` — relation `author User @relation("UserPosts", fields: [authorId], references: [id])`, champs `User.username: String` et `User.displayName: String?`
- Produces:
  - `PostReplySnapshotablePost` gagne `author: { id: string; username: string; displayName: string | null } | null`
  - `PostReplyTo` gagne `authorId: string | null` et `authorName: string`
  - `POST_REPLY_SNAPSHOT_SELECT` gagne `author: { select: { id: true, username: true, displayName: true } }`

- [ ] **Step 1: Write the failing test**

Ajouter à la fin de `services/gateway/src/__tests__/unit/services/messaging/postReplySnapshot.test.ts`. Modifier d'abord la fabrique `makePost` existante (elle est en tête de fichier) pour y ajouter l'auteur par défaut :

```ts
    author: { id: 'user-1', username: 'btano', displayName: 'Belva Tano' },
```

puis ajouter les cas :

```ts
describe('buildPostReplyTo — auteur du post cité', () => {
  it('gèle le nom d’affichage de l’auteur', () => {
    const snap = buildPostReplyTo(makePost({ type: 'STATUS', moodEmoji: '❤️' }));
    expect(snap.authorId).toBe('user-1');
    expect(snap.authorName).toBe('Belva Tano');
  });

  it('retombe sur le username quand displayName est absent', () => {
    const snap = buildPostReplyTo(
      makePost({ author: { id: 'user-2', username: 'wnh', displayName: null } })
    );
    expect(snap.authorName).toBe('wnh');
  });

  it('retombe sur le username quand displayName est vide', () => {
    const snap = buildPostReplyTo(
      makePost({ author: { id: 'user-3', username: 'jdoe', displayName: '   ' } })
    );
    expect(snap.authorName).toBe('jdoe');
  });

  it('tolère un post sans auteur chargé', () => {
    const snap = buildPostReplyTo(makePost({ author: null }));
    expect(snap.authorId).toBeNull();
    expect(snap.authorName).toBe('');
  });
});

describe('normalizePostReplyTo — rétro-compatibilité', () => {
  it('accepte un snapshot ANCIEN sans champ auteur sans l’invalider', () => {
    // Les messages déjà en base n'ont pas ces champs. Les rejeter ferait
    // disparaître toutes les citations existantes.
    const legacy = normalizePostReplyTo({
      id: 'post-9',
      type: 'STATUS',
      moodEmoji: '😴',
      previewText: 'en forme',
      thumbnailUrl: null,
      reactionCount: 0,
      commentCount: 0,
      shareCount: 0,
      createdAt: '2026-06-14T10:00:00.000Z',
    });
    expect(legacy).not.toBeNull();
    expect(legacy!.id).toBe('post-9');
    expect(legacy!.authorId).toBeNull();
    expect(legacy!.authorName).toBe('');
  });

  it('relit l’auteur d’un snapshot récent', () => {
    const fresh = normalizePostReplyTo({
      id: 'post-10',
      authorId: 'user-1',
      authorName: 'Belva Tano',
    });
    expect(fresh!.authorId).toBe('user-1');
    expect(fresh!.authorName).toBe('Belva Tano');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway
bun run test -- src/__tests__/unit/services/messaging/postReplySnapshot.test.ts
```

Attendu : échec de compilation TypeScript sur `author` (propriété inconnue de `PostReplySnapshotablePost`) et sur `snap.authorId` / `snap.authorName` (inconnus de `PostReplyTo`).

- [ ] **Step 3: Write minimal implementation**

Dans `services/gateway/src/services/messaging/postReplySnapshot.ts` :

3a. Ajouter l'auteur au type d'entrée, après `media` :

```ts
export type PostReplySnapshotablePost = {
  id: string;
  type: string;
  content: string | null;
  moodEmoji: string | null;
  reactionCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  createdAt: Date;
  media: ReadonlyArray<{ thumbnailUrl: string | null }>;
  /** Auteur du post cité. `null` tolère un appelant qui ne l'a pas chargé. */
  author: { id: string; username: string; displayName: string | null } | null;
};
```

3b. Ajouter les deux champs à la forme servie au client, après `createdAt` :

```ts
  /** Identifiant de l'auteur du post cité, figé. `null` sur snapshot legacy. */
  authorId: string | null;
  /**
   * Nom d'affichage de l'auteur, figé. Chaîne vide sur snapshot legacy — le
   * client retombe alors sur son libellé générique (« Humeur »).
   */
  authorName: string;
```

3c. Ajouter le résolveur pur, juste après `const PREVIEW_MAX = 80;` :

```ts
/**
 * Nom affiché pour l'auteur d'un post cité.
 *
 * `displayName ?? username` — même convention que `messageMentions.ts:148`,
 * avec en plus le rejet des `displayName` blancs, qui produiraient une citation
 * au titre vide.
 */
function resolveAuthorName(
  author: PostReplySnapshotablePost['author']
): string {
  if (!author) return '';
  const display = (author.displayName ?? '').trim();
  return display.length > 0 ? display : author.username;
}
```

3d. Renseigner les deux champs dans `buildPostReplyTo`, après `createdAt` :

```ts
    createdAt: post.createdAt.toISOString(),
    authorId: post.author?.id ?? null,
    authorName: resolveAuthorName(post.author),
```

3e. Charger la relation dans `POST_REPLY_SNAPSHOT_SELECT`, après `media` :

```ts
  author: { select: { id: true, username: true, displayName: true } },
```

3f. Relire les deux champs dans `normalizePostReplyTo`, après `createdAt` — **sans jamais invalider** un snapshot qui ne les porte pas :

```ts
    authorId: typeof s.authorId === 'string' ? s.authorId : null,
    authorName: typeof s.authorName === 'string' ? s.authorName : '',
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway
bun run test -- src/__tests__/unit/services/messaging/postReplySnapshot.test.ts
```

Attendu : toute la suite PASS, y compris les cas préexistants.

- [ ] **Step 5: Vérifier qu'aucun appelant ne casse**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/shared && npx prisma generate --generator client && cd -
cd /Users/smpceo/Documents/v2_meeshy/services/gateway && bun run type-check
```

Attendu : aucune erreur. `capturePostReplyTo` (`MessageProcessor.ts:951`) passe déjà `POST_REPLY_SNAPSHOT_SELECT` à Prisma — la relation `author` s'y ajoute sans changer son code. Si `type-check` signale un appelant de `buildPostReplyTo` qui ne fournit pas `author`, lui passer `author: null` plutôt que d'assouplir le type.

- [ ] **Step 6: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add services/gateway/src/services/messaging/postReplySnapshot.ts \
        services/gateway/src/__tests__/unit/services/messaging/postReplySnapshot.test.ts
git commit -m "fix(gateway): fige l'auteur dans le snapshot d'un post cité

PostReplyTo ne portait aucun champ auteur. Le nom n'existait que dans la
référence optimiste du client et se perdait au premier écho serveur : la
citation d'un mood retombait sur le libellé générique « Humeur ».

normalizePostReplyTo tolère les snapshots déjà persistés sans ces champs —
les rejeter ferait disparaître toutes les citations existantes."
```

---

### Task 4: Décodage iOS de l'auteur du mood

**Dépend de la tâche 3** : sans le champ produit côté gateway, il n'y a rien à décoder.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift:316-340` (`APIPostReplyTarget`), `:739-759` (`uiReplyTo`)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/MoodReplyAuthorTests.swift`

**Interfaces:**
- Consumes: `PostReplyTo.authorName` produit par la tâche 3
- Produces: `APIPostReplyTarget.authorName: String?` ; `APIMessage.uiReplyTo` renseigne `ReplyReference.authorName` au lieu de la chaîne vide

- [ ] **Step 1: Write the failing test**

Créer `packages/MeeshySDK/Tests/MeeshySDKTests/Models/MoodReplyAuthorTests.swift`.

La construction d'un `APIMessage` complet est déjà résolue dans
`APIMessageToMessageTests.swift` : sa fabrique privée
`makeAPIMessage(id:conversationId:senderId:content:createdAt:extraFields:)` bâtit
le dictionnaire minimal (`id`, `conversationId`, `senderId`, `content`,
`createdAt`, `updatedAt`), y fusionne `extraFields`, puis décode avec
`dateDecodingStrategy = .iso8601`. On reprend ce motif à l'identique — un
`postReplyTo` passé en `extraFields` — plutôt que d'écrire un second JSON à la
main.

```swift
import XCTest
@testable import MeeshySDK

final class MoodReplyAuthorTests: XCTestCase {

    /// Même motif que `APIMessageToMessageTests.makeAPIMessage` : dictionnaire
    /// minimal + `extraFields`, décodé en `.iso8601`.
    private func makeMoodReply(authorName: String?) -> APIMessage {
        var postReplyTo: [String: Any] = [
            "id": "post-1",
            "type": "STATUS",
            "moodEmoji": "❤️",
            "previewText": "My heart as no else can do",
            "reactionCount": 0,
            "commentCount": 0,
            "shareCount": 0,
            "createdAt": "2026-08-10T14:43:00Z",
            "authorId": "user-1",
        ]
        if let authorName { postReplyTo["authorName"] = authorName }

        let now = ISO8601DateFormatter().string(from: Date())
        let json: [String: Any] = [
            "id": "msg-1",
            "conversationId": "conv-1",
            "senderId": "me",
            "content": "Oh je comprends",
            "createdAt": now,
            "updatedAt": now,
            "postReplyTo": postReplyTo,
        ]
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(APIMessage.self, from: data)
    }

    func test_moodReply_carriesAuthorName_fromServerSnapshot() {
        let reply = makeMoodReply(authorName: "Belva Tano").uiReplyTo
        XCTAssertEqual(reply?.moodEmoji, "❤️")
        XCTAssertEqual(reply?.authorName, "Belva Tano")
    }

    func test_moodReply_legacySnapshotWithoutAuthor_keepsEmptyName() {
        // Snapshot d'avant la correction : pas d'auteur. La citation doit
        // rester valide — le repli « Humeur » du titre reprend la main.
        let reply = makeMoodReply(authorName: nil).uiReplyTo
        XCTAssertNotNil(reply)
        XCTAssertEqual(reply?.moodEmoji, "❤️")
        XCTAssertEqual(reply?.authorName, "")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro,OS=18.2' \
  -only-testing:MeeshySDKTests/MoodReplyAuthorTests -quiet
```

Attendu : `test_moodReply_carriesAuthorName_fromServerSnapshot` ÉCHOUE — obtenu `""`, attendu `"Belva Tano"`.

- [ ] **Step 3: Write minimal implementation**

3a. Dans `APIPostReplyTarget`, ajouter la propriété après `moodEmoji` :

```swift
    /// Nom d'affichage de l'auteur du post cité, figé par le gateway.
    /// `nil` sur un snapshot antérieur au 2026-08-10 — le rendu retombe alors
    /// sur le libellé générique de la citation.
    public let authorName: String?
```

3b. Ajouter la clé au `CodingKeys` du même type :

```swift
    private enum CodingKeys: String, CodingKey {
        case id, type, reactionCount, commentCount, shareCount, createdAt, thumbnailUrl, previewText, moodEmoji, authorName
    }
```

3c. Décoder la clé dans `init(from:)`, à côté de `moodEmoji` :

```swift
        authorName = try c.decodeIfPresent(String.self, forKey: .authorName)
```

3d. Dans `uiReplyTo`, brancher la branche mood (ligne ~742) sur ce nom :

```swift
                if let emoji = target.moodEmoji {
                    return ReplyReference(
                        messageId: target.id,
                        // Le nom vient du snapshot serveur. Vide sur un snapshot
                        // legacy : `quotedTitle` retombe alors sur « Humeur »,
                        // filet et non cas nominal.
                        authorName: target.authorName ?? "",
                        previewText: target.previewText,
                        isStoryReply: true,
                        storyPublishedAt: target.createdAt,
                        moodEmoji: emoji
                    )
                }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro,OS=18.2' \
  -only-testing:MeeshySDKTests/MoodReplyAuthorTests -quiet
```

Attendu : 2 tests PASS.

- [ ] **Step 5: Vérifier la non-régression du décodage des messages**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro,OS=18.2' \
  -only-testing:MeeshySDKTests/APIMessageToMessageTests -quiet
```

Attendu : PASS. `authorName` est optionnel, aucun payload existant ne casse.

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Models/MoodReplyAuthorTests.swift
git commit -m "fix(sdk): la citation d'un mood conserve son auteur

uiReplyTo construisait la référence mood avec authorName vide, d'où le titre
générique « Humeur » dès le premier écho serveur. Le nom est désormais lu
depuis le snapshot postReplyTo. Le repli reste en place pour les snapshots
antérieurs au champ."
```

---

### Task 5: Date du mood sur la ligne de titre

`BubbleMoodReplyPreview` empile emoji, date relative, puce et contenu dans un seul `HStack`. La date consomme la largeur qui manque ensuite au contenu, coupé à 2 lignes.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift:115-121` (ligne de titre), `:221-258` (`BubbleMoodReplyPreview`)
- Test: `apps/ios/MeeshyTests/Unit/Views/BubbleMoodQuoteLayoutTests.swift`

**Interfaces:**
- Consumes: `ReplyReference.moodEmoji: String?`, `.storyPublishedAt: Date?`, `.previewText: String`, `.authorName: String` (renseigné par la tâche 4)
- Produces: aucune API nouvelle — recomposition interne

- [ ] **Step 1: Write the failing test**

Créer `apps/ios/MeeshyTests/Unit/Views/BubbleMoodQuoteLayoutTests.swift`. C'est une garde de SOURCE, ancrée sur la composition — la mise en page SwiftUI n'est pas décidable autrement sans snapshot. Elle lit le code en ayant **retiré les commentaires**, sans quoi une mention en commentaire la ferait passer à tort.

```swift
import XCTest

/// Garde de composition de la citation d'un mood.
///
/// La date doit vivre sur la LIGNE DE TITRE, pas dans la ligne de contenu :
/// dans l'aperçu elle consommait la largeur du contenu, qui se coupait.
final class BubbleMoodQuoteLayoutTests: XCTestCase {

    private func sourceWithoutComments() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift")
        let raw = try String(contentsOf: url, encoding: .utf8)
        return raw
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> String in
                guard let range = line.range(of: "//") else { return String(line) }
                return String(line[line.startIndex..<range.lowerBound])
            }
            .joined(separator: "\n")
    }

    private func body(of structName: String, in source: String) throws -> String {
        guard let start = source.range(of: "struct \(structName)") else {
            XCTFail("struct \(structName) introuvable"); return ""
        }
        let rest = source[start.lowerBound...]
        guard let next = rest.range(of: "\nstruct ", range: rest.index(rest.startIndex, offsetBy: 1)..<rest.endIndex) else {
            return String(rest)
        }
        return String(rest[rest.startIndex..<next.lowerBound])
    }

    func test_moodPreview_doesNotRenderTheDate() throws {
        let preview = try body(of: "BubbleMoodReplyPreview", in: sourceWithoutComments())
        XCTAssertFalse(
            preview.contains("storyPublishedAt"),
            "La date ne doit plus être rendue par BubbleMoodReplyPreview — elle appartient à la ligne de titre"
        )
    }

    func test_moodPreview_allowsMoreThanTwoLinesOfContent() throws {
        let preview = try body(of: "BubbleMoodReplyPreview", in: sourceWithoutComments())
        XCTAssertTrue(
            preview.contains("lineLimit(3)"),
            "Le contenu du mood récupère la largeur libérée par la date : 3 lignes"
        )
    }

    func test_quotedReply_rendersTheMoodDateOnTheTitleRow() throws {
        let source = try sourceWithoutComments()
        let quoted = try body(of: "BubbleQuotedReply", in: source)
        XCTAssertTrue(
            quoted.contains("moodDateLabel"),
            "La ligne de titre de BubbleQuotedReply doit porter la date du mood"
        )
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
(cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate)
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=iPhone 16 Pro,OS=18.2" \
  -only-testing:MeeshyTests/BubbleMoodQuoteLayoutTests -derivedDataPath apps/ios/Build
```

Attendu : les 3 tests ÉCHOUENT. Si `test_quotedReply_rendersTheMoodDateOnTheTitleRow` échoue avec « struct introuvable », vérifier le chemin calculé par `#filePath` avant de continuer.

- [ ] **Step 3: Déplacer la date sur la ligne de titre**

Dans `BubbleQuotedReply.swift`, remplacer le bloc `VStack(alignment: .leading, spacing: 2)` qui commence ligne 116 par :

```swift
                VStack(alignment: .leading, spacing: 2) {
                    // Titre + date du mood sur la MÊME ligne : dans l'aperçu, la
                    // date vivait avec le contenu et lui mangeait sa largeur, ce
                    // qui le coupait à mi-phrase.
                    HStack(spacing: 6) {
                        Text(quotedTitle)
                            .font(.caption.weight(.bold))
                            .foregroundColor(nameColor)
                            .lineLimit(1)

                        moodDateLabel(previewColor: previewColor)

                        Spacer(minLength: 0)
                    }

                    if reply.moodEmoji != nil {
                        BubbleMoodReplyPreview(reply: reply, previewColor: previewColor)
                    } else if reply.isStoryReply {
                        BubbleStoryReplyPreview(reply: reply, previewColor: previewColor)
                    } else {
```

Le reste du `else` (bloc pièce jointe, lignes 127-153) est inchangé.

- [ ] **Step 4: Ajouter le libellé de date**

Toujours dans `BubbleQuotedReply`, ajouter cette méthode juste au-dessus de `var body: some View` (ligne 97) :

```swift
    /// Date de publication du mood cité, rendue sur la ligne de titre.
    /// Vide pour toute citation qui n'est pas un mood : les citations de
    /// message et de story gardent leur composition d'origine.
    @ViewBuilder
    private func moodDateLabel(previewColor: Color) -> some View {
        if reply.moodEmoji != nil, let date = reply.storyPublishedAt {
            Text(date, style: .relative)
                .font(.caption2)
                .foregroundColor(previewColor.opacity(0.8))
                .lineLimit(1)
                .layoutPriority(-1)
        }
    }
```

- [ ] **Step 5: Réduire l'aperçu du mood à l'emoji et au contenu**

Remplacer le `body` de `BubbleMoodReplyPreview` (lignes 232-257) par :

```swift
    var body: some View {
        HStack(alignment: .top, spacing: 5) {
            if let emoji = reply.moodEmoji {
                Text(emoji)
                    .font(.footnote)
            }

            if !reply.previewText.isEmpty {
                Text(reply.previewText)
                    .font(.caption)
                    .foregroundColor(previewColor)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
```

`storyPublishedAt` reste dans le `==` d'`Equatable` du type : la date pilote toujours le rendu de la ligne de titre, et l'oublier ferait manquer une invalidation.

- [ ] **Step 6: Run tests to verify they pass**

```bash
(cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate)
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=iPhone 16 Pro,OS=18.2" \
  -only-testing:MeeshyTests/BubbleMoodQuoteLayoutTests -derivedDataPath apps/ios/Build
```

Attendu : 3 tests PASS.

- [ ] **Step 7: Vérifier la non-régression des autres citations**

```bash
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=iPhone 16 Pro,OS=18.2" \
  -only-testing:MeeshyTests -derivedDataPath apps/ios/Build 2>&1 | tail -30
```

Attendu : aucune régression sur les suites de bulle. Une citation de message ou de story n'affiche pas de date sur sa ligne de titre — `moodDateLabel` est gardé par `reply.moodEmoji != nil`.

- [ ] **Step 8: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift \
        apps/ios/MeeshyTests/Unit/Views/BubbleMoodQuoteLayoutTests.swift
git commit -m "fix(ios): la date d'un mood cité passe sur la ligne de titre

BubbleMoodReplyPreview empilait emoji, date, puce et contenu dans un seul
HStack : la date mangeait la largeur du contenu, coupé à 2 lignes. La date
rejoint le titre, le contenu récupère toute la largeur et 3 lignes."
```

---

## Vérification de bout en bout

Une fois les cinq tâches livrées :

- [ ] **Suite complète iOS**

```bash
cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh test
```

Attendu : phases 0 à 3 vertes. La phase 3 laisse l'app connectée au compte de test — c'est normal, ne jamais y ajouter de logout.

- [ ] **Suite complète gateway**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/shared && npx prisma generate --generator client && bun run build && cd -
cd /Users/smpceo/Documents/v2_meeshy/services/gateway && bun run test
```

Attendu : 249/249 suites vertes.

- [ ] **Vérification manuelle de la citation de mood**

Sur simulateur, répondre à un mood depuis la bulle de statut, puis **tuer et relancer l'app** pour forcer un rechargement depuis le serveur. La citation doit afficher le nom de l'auteur et sa date sur la ligne de titre — pas « Humeur ». C'est le rechargement qui prouve la correction : sans lui, on ne voit que la référence optimiste locale, qui n'a jamais été cassée.

- [ ] **Nettoyer les artefacts de régénération**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git checkout -- apps/ios/Meeshy.xcodeproj/project.pbxproj apps/ios/Package.resolved 2>/dev/null || true
git status --short
```

`xcodegen generate` réécrit `project.pbxproj` et la résolution SPM réécrit `Package.resolved`. Ce sont des artefacts : ne jamais committer ce churn depuis une vérification locale — le dépôt a des sessions concurrentes et un pbxproj régénéré publie le travail en cours d'autrui.

---

## Écart assumé par rapport à la spec

La spec demande des **snapshots** enregistrés sur 18.2 pour la carte de post
(vidéo verticale, image paysage), la carte de réel et la citation de mood à
contenu long. Ce plan ne les inclut pas et s'appuie sur les fonctions pures
(tâches 1, 2), les gardes de composition (tâche 5) et les deux vérifications
visuelles manuelles.

Raison : enregistrer de nouvelles baselines exige le script de capture du dépôt,
dont l'échec est silencieux, et la moindre dérive de locale du simulateur rougit
~70 baselines existantes. Mêler cela à cinq corrections de fond rendrait tout
échec illisible. À traiter en lot dédié, une fois ces corrections vertes.

## Plans suivants

Ce plan ne couvre que les lots 4 et 5 de la spec. Restent, dans cet ordre :

1. **Lot 0 — hôte d'overlay au niveau fenêtre.** Bloquant pour les lots 1 à 3 : il déplace l'endroit où vivent les overlays.
2. **Lot 1 — orientation** (déverrouillage global + verrou portrait compté).
3. **Lot 2 — surfaces en classe `regular`** (`CollapsibleHeader`, login, onboarding).
4. **Lot 3 — affordances iPad** (survol, clavier, focus, glisser-déposer).
