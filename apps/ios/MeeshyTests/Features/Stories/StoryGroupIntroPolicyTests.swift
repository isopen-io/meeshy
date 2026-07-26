import XCTest
@testable import Meeshy

/// Directive user 2026-07-25 : « maintenir les interludes partout pour faire
/// SIMPLE ». L'interstitiel d'identité s'affiche donc à l'ouverture du viewer
/// comme à chaque changement de groupe, en avant comme en arrière, y compris sur
/// mes propres stories — les deux exceptions précédentes produisaient un
/// comportement à trous.
final class StoryGroupIntroPolicyTests: XCTestCase {

    func test_shouldPresent_whenGroupHasAStory_isTrue() {
        XCTAssertTrue(
            StoryGroupIntroPolicy.shouldPresent(isPreviewMode: false, hasEntryStory: true))
    }

    /// Un groupe dont toutes les stories sont vues ET expirées n'a rien à
    /// annoncer : l'interlude serait suivi d'un écran vide.
    func test_shouldPresent_withoutDisplayableStory_isFalse() {
        XCTAssertFalse(
            StoryGroupIntroPolicy.shouldPresent(isPreviewMode: false, hasEntryStory: false))
    }

    /// La preview du composer montre le rendu d'un brouillon : aucune identité
    /// d'auteur à annoncer, et l'auteur est déjà devant son propre écran.
    func test_shouldPresent_inPreviewMode_isFalse() {
        XCTAssertFalse(
            StoryGroupIntroPolicy.shouldPresent(isPreviewMode: true, hasEntryStory: true))
    }

    /// Garde de la simplification : la règle ne doit plus dépendre de l'identité
    /// de l'auteur. Si quelqu'un réintroduit un test « est-ce moi ? », le
    /// comportement redevient inégal selon le groupe.
    func test_shouldPresent_doesNotDependOnAuthorIdentity() throws {
        let source = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()   // Stories
                .deletingLastPathComponent()   // Features
                .deletingLastPathComponent()   // MeeshyTests
                .deletingLastPathComponent()   // ios
                .appendingPathComponent("Meeshy/Features/Main/Views/StoryViewerView.swift"),
            encoding: .utf8
        )
        guard let range = source.range(of: "func presentGroupIntroIfNeeded() {") else {
            return XCTFail("presentGroupIntroIfNeeded introuvable")
        }
        let body = String(source[range.lowerBound...].prefix(500))

        XCTAssertFalse(
            body.contains("AuthManager.shared.currentUser?.id"),
            "l'interlude ne doit plus être filtré sur l'identité de l'auteur")
    }

    /// L'interlude doit aussi ouvrir la session, pas seulement les changements
    /// de groupe : sinon la toute première story n'en a jamais.
    func test_viewerPresentsIntroOnAppear() throws {
        let source = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("Meeshy/Features/Main/Views/StoryViewerView.swift"),
            encoding: .utf8
        )
        guard let onAppear = source.range(of: ".onAppear {"),
              let onChange = source.range(of: ".adaptiveOnChange(of: currentGroupIndex)") else {
            return XCTFail("structure du viewer inattendue")
        }
        let appearBlock = String(source[onAppear.lowerBound..<onChange.lowerBound])

        XCTAssertTrue(appearBlock.contains("presentGroupIntroIfNeeded()"),
                      "l'ouverture du viewer doit présenter l'interlude")
    }
}

// MARK: - Centrage de la carte d'identité

/// Le bloc identité sortait par la gauche (mesuré −227 pt le 2026-07-25 :
/// avatar et nom coupés au bord de l'écran). Cause : la bannière `scaledToFill`
/// vivait dans le MÊME ZStack que l'identité et lui imposait sa taille
/// intrinsèque, si bien que l'identité était centrée sur un espace plus large
/// que l'écran. Un fond en `.background` ne participe jamais au dimensionnement.
final class StoryAuthorIdentityCardLayoutTests: XCTestCase {

    /// Le corps de `body`, commentaires RETIRÉS : sans ce filtrage, une garde
    /// qui interdit `.position(` ou `GeometryReader` se déclenche sur le
    /// commentaire qui explique justement pourquoi on ne les utilise plus.
    private func bodyCode() throws -> String {
        let code = try source()
        guard let body = code.range(of: "var body: some View {"),
              let end = code.range(of: "private var avatarColorFallbackGradient") else {
            throw XCTSkip("structure de StoryAuthorIdentityCard inattendue")
        }
        return String(code[body.lowerBound..<end.lowerBound])
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    private func source() throws -> String {
        try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()   // Stories
                .deletingLastPathComponent()   // Features
                .deletingLastPathComponent()   // MeeshyTests
                .deletingLastPathComponent()   // ios
                .appendingPathComponent("Meeshy/Features/Main/Views/StoryAuthorIdentityCard.swift"),
            encoding: .utf8
        )
    }

    func test_body_keepsBannerOutOfTheLayout() throws {
        let bodyBlock = try bodyCode()

        XCTAssertTrue(bodyBlock.contains(".background {"),
                      "la bannière doit être un fond, pas un frère de layout")
        XCTAssertFalse(bodyBlock.contains("ZStack {"),
                       "un ZStack laisserait la bannière scaledToFill dicter la taille et décentrer l'identité")
        XCTAssertTrue(bodyBlock.contains("identityContent"),
                      "l'identité doit rester la vue principale, celle qui dimensionne")
    }

    /// Le centrage ne doit plus dépendre d'une géométrie mesurée : c'est ce
    /// calcul qui dérivait.
    func test_body_centersWithoutMeasuredGeometry() throws {
        let bodyBlock = try bodyCode()

        XCTAssertFalse(bodyBlock.contains(".position(x:"),
                       "le centrage ne doit plus passer par un .position() calculé")
        XCTAssertFalse(bodyBlock.contains("GeometryReader"),
                       "le centrage ne doit plus dépendre d'une géométrie mesurée")
        XCTAssertTrue(bodyBlock.contains("frame(maxWidth: .infinity, maxHeight: .infinity)"),
                      "l'identité se centre en occupant tout l'espace proposé")
    }
}

// MARK: - Sortie de l'interlude

/// Directive user 2026-07-25 : « la manière dont l'interlude disparaît dépend de
/// comment le premier slide a configuré son apparition ». Un fondu générique
/// suivi d'une entrée sans rapport casse le mouvement.
final class StoryGroupIntroDismissAnimationTests: XCTestCase {

    /// Les deux entrées à ressort doivent sortir avec le même élan, sinon le
    /// slide rattrape un voile encore en train de partir.
    func test_dismissAnimation_springOpenings_shareTheSameSpring() {
        XCTAssertEqual(StoryGroupIntroPolicy.dismissAnimation(for: .zoom),
                       StoryGroupIntroPolicy.dismissAnimation(for: .slide))
    }

    /// La révélation circulaire est la plus longue des entrées : sa sortie ne
    /// peut pas être aussi brève qu'un fondu.
    func test_dismissAnimation_revealDiffersFromFade() {
        XCTAssertNotEqual(StoryGroupIntroPolicy.dismissAnimation(for: .reveal),
                          StoryGroupIntroPolicy.dismissAnimation(for: .fade))
    }

    /// Sans transition configurée, on retombe sur le fondu — le défaut du modèle.
    func test_dismissAnimation_withoutOpening_matchesFade() {
        XCTAssertEqual(StoryGroupIntroPolicy.dismissAnimation(for: nil),
                       StoryGroupIntroPolicy.dismissAnimation(for: .fade))
    }

    /// Garde : la sortie doit LIRE la transition du slide, pas rester figée.
    func test_dismissGroupIntro_readsTheSlideOpening() throws {
        let source = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("Meeshy/Features/Main/Views/StoryViewerView.swift"),
            encoding: .utf8
        )
        // Ancré sur le NOM + la parenthèse ouvrante, pas sur la signature
        // complète : la garde protège un comportement (« la sortie lit la
        // transition du slide »), pas une liste de paramètres. Épingler
        // « dismissGroupIntro() { » la faisait tomber au premier paramètre
        // ajouté — ce qui s'est produit avec `revealing:` le 2026-07-26, et
        // l'échec accusait un comportement intact.
        guard let range = source.range(of: "private func dismissGroupIntro(") else {
            return XCTFail("dismissGroupIntro introuvable")
        }
        let body = String(source[range.lowerBound...].prefix(600))

        XCTAssertTrue(body.contains("storyEffects?.opening"),
                      "la sortie doit être dérivée de la transition d'ouverture du slide")
    }
}
