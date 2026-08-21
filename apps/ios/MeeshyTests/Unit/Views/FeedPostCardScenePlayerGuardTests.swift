import XCTest
@testable import Meeshy

/// Gardes de câblage — Lot E, Task E3 (« La scène dans la carte »,
/// `MeeshyScenePlayer(.card)`).
///
/// Sept garanties de SOURCE, ancrées sur `FeedPostCard.swift` (§D lot E) :
/// 1. quand `post.storyEffects?.canvasV3 != nil`, la carte monte
///    `MeeshyScenePlayer(… mode: .card …)` — jamais `.reader` (le mode
///    `.card` verrouille déjà pause/muet/boucle côté SDK, `ScenePlayerConfig`,
///    B4 gelé) ;
/// 2. le Prisme Linguistique est câblé : `.preferredContentLanguages(…)`
///    reçoit les langues préférées du lecteur (`AuthManager.shared.currentUser?
///    .preferredContentLanguages`) — sans quoi `MeeshyScenePlayer` garde
///    `languages: []` et `StoryTextObject.resolvedText` rend inconditionnellement
///    le texte ORIGINAL de l'auteur (correctif rejet DoD rév. 15, constat 1) ;
/// 3. le player dérive sa hauteur du ratio 9:16 appliqué à sa largeur RÉELLE
///    (`.aspectRatio(9.0 / 16.0, contentMode: .fit)`, même patron que le
///    voisin `StoryRepostEmbedCell` qui rend le MÊME hôte dans le MÊME fil)
///    — jamais une hauteur en points figée sur la largeur MAXIMALE, qui
///    déforme la scène à toute largeur de carte réelle (correctif rejet DoD
///    rév. 15, constat 2) — et jamais un `GeometryReader` qui reboucle sa
///    propre mesure sur le layout (piège self-sizing distinct : bottom-up,
///    hôte UIKit *mesurant* sa propre taille — pas le cas ici, `.aspectRatio`
///    est top-down, le parent propose la taille) ;
/// 4. le tap route vers `onTapPost?(post)` — le MÊME callback que le reste
///    de la carte (texte, auteur), donc le plein écran EXISTANT
///    (PostDetailView) — jamais un nouveau `.fullScreenCover`/`.sheet`
///    dédié à la scène (« pas de nouveau viewer ») ;
/// 5. `isPlaying` est un `.constant(false)` figé — jamais un `@State` de
///    lecture basculable (recherche par MOTIF, pas par nom littéral — un
///    renommage ne doit pas pouvoir contourner la garde) : la carte de POST
///    naît en pause et le RESTE (surface NEUVE, revue Fable n°25 — le
///    mouvement vit dans la destination du tap, pas dans la carte), donc
///    aucun AVPlayer/décodage actif ici ;
/// 6. l'élément d'accessibilité de la scène est une FEUILLE activable
///    (`.accessibilityElement(children: .ignore)` + `.accessibilityLabel` +
///    `.accessibilityAction`) — jamais un CONTENEUR (`children: .contain`)
///    qui n'expose aucune action au lecteur d'écran malgré le trait bouton
///    promis (correctif rejet DoD rév. 15, constat 4).
final class FeedPostCardScenePlayerGuardTests: XCTestCase {

    private func source() throws -> String {
        try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/FeedPostCard.swift")
    }

    /// Le bloc de code entre deux marqueurs (le second exclu). `end == nil`
    /// borne jusqu'à la fin du fichier. Même convention que
    /// `MuteButtonExistenceGuardTests`.
    private func block(from start: String, to end: String?, in text: String) -> String {
        guard let startRange = text.range(of: start) else { return "" }
        let tail = text[startRange.upperBound...]
        guard let end, let endRange = tail.range(of: end) else { return String(tail) }
        return String(tail[..<endRange.lowerBound])
    }

    private func cardScenePlayerBlock(in text: String) throws -> String {
        let block = block(from: "private func cardScenePlayer(document:", to: "var body: some View {", in: text)
        if block.isEmpty {
            XCTFail("cardScenePlayer(document:) introuvable dans FeedPostCard.swift")
        }
        return block
    }

    /// Le bloc du SITE D'APPEL de `cardScenePlayer(document:)` dans `body`
    /// (les modificateurs d'accessibilité chaînés vivent LÀ, pas dans la
    /// fonction elle-même).
    private func cardSceneCallSiteBlock(in text: String) throws -> String {
        let block = block(
            from: "if let cardSceneDocument {",
            to: "} else if isStoryRepost",
            in: text
        )
        if block.isEmpty {
            XCTFail("Site d'appel de cardScenePlayer(document:) introuvable dans FeedPostCard.swift")
        }
        return block
    }

    // MARK: - 1. Mode .card, jamais .reader

    func test_mountsMeeshyScenePlayer_inCardMode() throws {
        let text = try source()
        XCTAssertTrue(
            text.contains("MeeshyScenePlayer("),
            "La carte doit monter MeeshyScenePlayer quand le post porte un canvas v3 propre."
        )
        XCTAssertTrue(
            text.contains("mode: .card"),
            "Le mode passé DOIT être .card — jamais .reader (réservé au viewer story, E4)."
        )
    }

    func test_neverMountsReaderMode() throws {
        let text = try source()
        XCTAssertFalse(
            text.contains("mode: .reader"),
            "FeedPostCard ne doit JAMAIS monter le mode .reader — c'est le mode du viewer " +
            "story (E4), pas de la carte de post."
        )
    }

    func test_gatedOnOwnCanvasV3_notRepostCanvas() throws {
        let text = try source()
        XCTAssertTrue(
            text.contains("post.storyEffects?.canvasV3"),
            "La porte doit lire le storyEffects PROPRE du post — jamais celui d'un repost " +
            "(StoryRepostEmbedCell reste le chemin des reposts de story, hors périmètre E3)."
        )
    }

    // MARK: - 2. Prisme Linguistique câblé (correctif rejet DoD rév. 15, constat 1)

    func test_scenePlayer_appliesPreferredContentLanguages() throws {
        let text = try source()
        let block = try cardScenePlayerBlock(in: text)
        XCTAssertTrue(
            block.contains(".preferredContentLanguages("),
            "La scène de carte DOIT appeler .preferredContentLanguages(...) — sans quoi " +
            "MeeshyScenePlayer garde languages: [] et StoryTextObject.resolvedText rend " +
            "inconditionnellement le texte ORIGINAL de l'auteur, quelle que soit la langue du " +
            "lecteur (violation du Prisme Linguistique, « le prisme s'applique à TOUT le contenu »)."
        )
        XCTAssertTrue(
            block.contains("AuthManager.shared.currentUser?.preferredContentLanguages"),
            "La source des langues préférées doit être la MÊME que celle du voisin " +
            "StoryRepostEmbedCell (branche isStoryRepost, même fichier) — " +
            "AuthManager.shared.currentUser?.preferredContentLanguages — jamais une resolution " +
            "locale divergente ni une liste vide en dur."
        )
    }

    // MARK: - 3. Hauteur dérivée du ratio 9:16 sur la largeur RÉELLE (correctif rejet DoD rév. 15, constat 2)

    func test_scenePlayer_usesAspectRatioNineBySixteen() throws {
        let text = try source()
        let block = try cardScenePlayerBlock(in: text)
        XCTAssertTrue(
            block.contains(".aspectRatio(9.0 / 16.0, contentMode: .fit)"),
            "La scène de carte doit dériver sa hauteur du ratio 9:16 appliqué à la largeur " +
            "RÉELLEMENT proposée par le parent — même patron que le voisin StoryRepostEmbedCell " +
            "(même hôte StoryReaderRepresentable, même fil) — jamais une hauteur en points figée " +
            "sur la largeur MAXIMALE (420pt × 16/9 = 747pt), qui déforme la scène dès que la " +
            "largeur réelle de la carte (≈329pt sur iPhone 16 Pro, après le double padding " +
            "horizontal de 16pt) est inférieure au plafond."
        )
    }

    func test_scenePlayer_doesNotDeriveHeightFromMeasuredLayout() throws {
        let text = try source()
        let block = try cardScenePlayerBlock(in: text)
        XCTAssertFalse(
            block.contains("GeometryReader"),
            "cardScenePlayer ne doit pas mesurer sa propre taille via GeometryReader — " +
            ".aspectRatio est un modificateur TOP-DOWN (le parent propose la taille au enfant), " +
            "distinct du piège self-sizing BOTTOM-UP (un hôte qui mesure sa propre taille et la " +
            "reboucle sur le layout, famille du crash SIGTRAP _updateVisibleCellsNow documenté " +
            "par l'incident MessageListLayout.swift — SwiftUI-dans-cellule-UIKit, l'inverse du " +
            "cas présent, UIKit-dans-SwiftUI)."
        )
    }

    // MARK: - 4. Tap → plein écran EXISTANT, pas de nouveau viewer

    func test_tap_routesThroughExistingOnTapPost() throws {
        let text = try source()
        let block = try cardScenePlayerBlock(in: text)
        XCTAssertTrue(
            block.contains(".onTapGesture { onTapPost?(post) }"),
            "Le tap doit router vers onTapPost?(post) — le MÊME callback que le reste de la " +
            "carte (texte, auteur), donc le plein écran EXISTANT (PostDetailView), jamais un " +
            "nouveau viewer dédié."
        )
    }

    func test_noNewFullscreenCoverIntroducedForScene() throws {
        let text = try source()
        let fullscreenCoverCount = text.components(separatedBy: ".fullScreenCover(").count - 1
        XCTAssertEqual(
            fullscreenCoverCount, 2,
            "E3 ne doit introduire AUCUN nouveau `.fullScreenCover` — seuls les deux déjà " +
            "existants (position, galerie média) doivent rester : la scène route par " +
            "onTapPost?(post), pas par une présentation neuve."
        )
    }

    // MARK: - 5. Née en pause, et le RESTE — aucun AVPlayer/décodage actif dans la carte

    func test_isPlaying_isConstantFalse_neverToggled() throws {
        let text = try source()
        let block = try cardScenePlayerBlock(in: text)
        XCTAssertTrue(
            block.contains("isPlaying: .constant(false)"),
            "isPlaying doit être un .constant(false) figé — la carte ne joue JAMAIS " +
            "localement, le mouvement vit dans la destination du tap (revue Fable n°25)."
        )
    }

    /// Garde par MOTIF (pas par nom littéral) : aucun `@State` dont le nom mêle
    /// « scene »/« Scene » et « play »/« Play » ne doit exister dans le fichier —
    /// renommer `cardSceneIsPlaying` en `isCardScenePlaying`, `cardScenePlaying`,
    /// ou toute autre variante ne doit PAS pouvoir passer sous cette garde
    /// (correctif rejet DoD rév. 15, constat 5a).
    func test_noLocalPlaybackStateIntroducedForCardScene() throws {
        let text = try source()
        let regex = try NSRegularExpression(pattern: "@State[^\\n]*scene[^\\n]*play", options: [.caseInsensitive])
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        let matches = regex.matches(in: text, options: [], range: range)
            .map { (text as NSString).substring(with: $0.range) }
        XCTAssertTrue(
            matches.isEmpty,
            "Aucun état local de lecture ne doit exister pour la scène de carte — isPlaying " +
            "reste un .constant(false) figé, jamais un @State basculable qu'un futur commit " +
            "pourrait faire dériver (recherché par MOTIF « scene…play », insensible à la casse " +
            "et au nom exact, pas par égalité littérale) : \(matches)."
        )
    }

    func test_noDirectAVPlayerConstructionInCard() throws {
        let text = try source()
        XCTAssertFalse(
            text.contains("AVPlayer("),
            "La carte ne doit jamais construire son propre AVPlayer — MeeshyScenePlayer(.card) " +
            "est le SEUL chemin de lecture, et il naît en pause/muet par construction (SDK)."
        )
    }

    // MARK: - 6. Accessibilité : feuille activable, pas un conteneur muet (correctif rejet DoD rév. 15, constat 4)

    func test_callSite_usesLeafAccessibilityElement_notContainer() throws {
        let text = try source()
        let block = try cardSceneCallSiteBlock(in: text)
        XCTAssertTrue(
            block.contains(".accessibilityElement(children: .ignore)"),
            "La scène doit être un ÉLÉMENT d'accessibilité FEUILLE (children: .ignore) — même " +
            "patron que le voisin StoryRepostEmbedCell — pas un CONTENEUR (children: .contain) " +
            "qui n'expose lui-même aucune action au lecteur d'écran."
        )
        XCTAssertFalse(
            block.contains(".accessibilityElement(children: .contain)"),
            "La scène ne doit plus utiliser children: .contain : combiné à " +
            ".accessibilityAddTraits(.isButton) sans .accessibilityAction, l'élément s'annonce " +
            "bouton mais n'expose aucune action de lecteur d'écran déclenchable."
        )
    }

    func test_callSite_hasAccessibilityLabel() throws {
        let text = try source()
        let block = try cardSceneCallSiteBlock(in: text)
        XCTAssertTrue(
            block.contains(".accessibilityLabel("),
            "La scène doit porter un accessibilityLabel qui l'identifie — un conteneur .ignore " +
            "sans label n'annonce rien au lecteur d'écran."
        )
    }

    func test_callSite_hasAccessibilityAction_matchingOnTapPost() throws {
        let text = try source()
        let block = try cardSceneCallSiteBlock(in: text)
        XCTAssertTrue(
            block.contains(".accessibilityAction { onTapPost?(post) }"),
            "L'activation VoiceOver doit atteindre onTapPost?(post) — le MÊME patron déjà " +
            "utilisé ailleurs dans ce fichier (.accessibilityHint + .accessibilityAction, lignes " +
            "385-386 et 402-403) pour exactement ce besoin, jamais un .onTapGesture seul que " +
            "VoiceOver ne peut pas déclencher."
        )
    }

    // MARK: - Non-régression E1/E2 : l'accent de chrome reste l'accent du post

    func test_scenePlayer_usesPostAccentColor_notBadgeAccent() throws {
        let text = try source()
        let block = try cardScenePlayerBlock(in: text)
        XCTAssertTrue(
            block.contains("accentColorHex: accentColor"),
            "Le player doit recevoir l'accent déterministe du post (revue totale C8), pas " +
            "l'accent AA du badge son (backgroundSoundAccentHex, réservé à BackgroundSoundBadge)."
        )
    }
}
