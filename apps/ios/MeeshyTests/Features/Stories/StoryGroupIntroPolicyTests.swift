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

    // MARK: - Recouvrement révélation / sortie du voile

    /// L'attente est écourtée du recouvrement : sur 2,2 s nominales, le retrait
    /// du voile — et l'apparition du slide qui part avec lui — s'amorce à 2,0 s.
    /// NB : on ne teste QUE l'instant de déclenchement. La disparition effective
    /// du voile est plus tardive (courbes de `dismissAnimation` préservées par
    /// choix utilisateur) et n'est volontairement épinglée nulle part.
    func test_holdDuration_advancesTheRevealByTheOverlap() {
        XCTAssertEqual(StoryGroupIntroPolicy.holdDuration(total: 2.2), 2.0, accuracy: 0.0001)
    }

    /// Un interlude plus court que le recouvrement ne doit PAS produire une
    /// attente négative : `Task.sleep` s'y comporterait de travers. On révèle
    /// immédiatement.
    func test_holdDuration_neverGoesNegative() {
        XCTAssertEqual(StoryGroupIntroPolicy.holdDuration(total: 0.1), 0)
        XCTAssertEqual(StoryGroupIntroPolicy.holdDuration(total: 0), 0)
    }

    // MARK: - Courbes de sortie du voile

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

// MARK: - Mouchard de déplacement de l'interlude (anti tap+swipe)

/// `StoryGroupIntroOverlay` réserve ses taps (skip / retour-groupe) aux touchers
/// IMMOBILES : le drag du lecteur couvre l'interlude, et les `SpatialTapGesture`
/// se valident au touch-up quel que soit le déplacement — sans garde, un swipe
/// changeait de groupe ET sautait l'interlude d'un seul geste.
///
/// Le drapeau qui porte cette garde (`didMoveDuringTouch`) est COLLANT par
/// conception. Il lui faut donc des purges, et elles ne peuvent pas vivre dans
/// le `.onEnded` du mouchard : le drag conclut parfois AVANT les
/// `SpatialTapGesture`, purger là annulerait la garde et ferait revenir le
/// double-déclenchement. Ces gardes de source vérifient les deux invariants.
/// Vue et état sont privés (`@State` d'une `struct` de fichier) : injouables en
/// XCTest, seul le source les atteste.
final class StoryGroupIntroTouchGuardTests: XCTestCase {

    private func overlaySource() throws -> String {
        let source = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("Meeshy/Features/Main/Views/StoryViewerView.swift"),
            encoding: .utf8
        )
        guard let start = source.range(of: "private struct StoryGroupIntroOverlay") else {
            throw XCTSkip("StoryGroupIntroOverlay introuvable — structure du viewer inattendue")
        }
        // Commentaires retirés : la prose de cette vue cite les motifs interdits.
        return String(source[start.lowerBound...])
            .components(separatedBy: "\n")
            .map { line -> String in
                guard let marker = line.range(of: "//") else { return line }
                return String(line[..<marker.lowerBound])
            }
            .joined(separator: "\n")
    }

    /// LA PURGE N'EST PAS DANS LE RELÂCHEMENT DU MOUCHARD.
    func test_moveSnoop_doesNotResetTheFlagOnEnded() throws {
        let code = try overlaySource()
        guard let snoop = code.range(of: "DragGesture(minimumDistance: 0, coordinateSpace: .local)") else {
            return XCTFail("mouchard de déplacement introuvable")
        }
        let tail = String(code[snoop.upperBound...].prefix(900))
        XCTAssertFalse(
            tail.contains(".onEnded"),
            "Purger au relâchement du mouchard annule la garde quand le drag conclut " +
            "avant les SpatialTapGesture : le swipe recommiterait tap ET changement de groupe."
        )
    }

    /// LE DRAPEAU A DES FILETS DE PURGE HORS DU GESTE.
    ///
    /// Sans eux, un toucher qui ne délivre jamais son tick d'ouverture (événements
    /// coalescés d'un flick rapide, recognizer reconstruit) laisse le drapeau collé
    /// et AVALE le toucher suivant : tap de skip ou de retour-groupe inerte pendant
    /// tout l'interlude.
    func test_moveFlag_hasPurgeNetsOutsideTheGesture() throws {
        let code = try overlaySource()
        XCTAssertTrue(
            code.contains(".onAppear { didMoveDuringTouch = false }"),
            "chaque interlude doit repartir d'un mouchard neuf"
        )
        XCTAssertTrue(
            code.contains("adaptiveOnChange(of: gestureResetToken)"),
            "le jeton de purge du viewer couvre les chemins où SwiftUI n'a délivré aucune fin de geste"
        )
        XCTAssertTrue(
            code.contains("trackedTouchOrigin != value.startLocation"),
            "l'ouverture d'un toucher doit être reconnue à son origine, et pas seulement " +
            "au tick à translation nulle — ce tick-là n'est pas garanti"
        )
    }
}
