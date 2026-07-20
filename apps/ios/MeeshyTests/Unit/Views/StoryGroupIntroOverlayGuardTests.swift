import XCTest
@testable import Meeshy

/// Source-analysis guards pour l'unification de la carte de transition
/// inter-groupes (directive user 2026-07-14) : une SEULE vue d'identité
/// (`StoryGroupIntroOverlay`, durée fixe 2,6 s), `NeighborGroupCubeFace`
/// n'affiche plus jamais d'identité pendant le drag (sinon deux cartes
/// quasi-identiques s'enchaînaient). `goBackToPreviousGroupFromIntro()`
/// (tap gauche sur l'intro) et `StoryGroupIntroOverlay`/`NeighborGroupCubeFace`
/// sont couplés à `@State` SwiftUI ou n'ont pas de dépendances injectables —
/// non instanciables proprement en test (même limite documentée dans
/// `StoryViewerReactionFlowTests.swift`). Pattern déjà établi dans ce repo
/// pour ce cas : garde par analyse de source, cf.
/// `ConversationMenuSystemDesignGuardTests.swift` /
/// `StoryViewerScenePhasePauseGuardTests.swift`.
@MainActor
final class StoryGroupIntroOverlayGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Isole le corps d'une déclaration entre sa signature et la fermeture de
    /// bloc correspondante (recherche naïve de la prochaine ligne `    }` /
    /// `}` au bon niveau d'indentation — suffisant ici, les corps ciblés ne
    /// contiennent pas d'accolade fermante isolée à la même profondeur).
    private func body(of declaration: String, in source: String, closing: String = "\n    }") throws -> String {
        guard let declRange = source.range(of: declaration) else {
            XCTFail("\(declaration) introuvable")
            return ""
        }
        guard let closeRange = source.range(of: closing, range: declRange.upperBound..<source.endIndex) else {
            XCTFail("Fermeture de \(declaration) introuvable")
            return ""
        }
        return String(source[declRange.upperBound..<closeRange.lowerBound])
    }

    // MARK: - Durée fixe 2,6 s

    func test_groupIntroDuration_is2Point6Seconds() throws {
        let viewerSource = try source("Meeshy/Features/Main/Views/StoryViewerView.swift")
        XCTAssertTrue(
            viewerSource.contains("static let groupIntroDuration: TimeInterval = 2.6"),
            "groupIntroDuration doit être fixé à 2,6 s (directive user 2026-07-14)."
        )
    }

    // MARK: - Une seule vue d'identité : NeighborGroupCubeFace n'affiche plus l'avatar/nom

    func test_neighborGroupCubeFace_containsNoIdentityBlock() throws {
        let canvasSource = try source("Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift")
        let block = try body(of: "struct NeighborGroupCubeFace: View {", in: canvasSource, closing: "\n}")
        XCTAssertFalse(
            block.contains("MeeshyAvatar"),
            "NeighborGroupCubeFace ne doit plus afficher d'avatar — StoryGroupIntroOverlay " +
            "est désormais la SEULE carte d'identité de la transition inter-groupes."
        )
        XCTAssertFalse(
            block.contains("group.username"),
            "NeighborGroupCubeFace ne doit plus afficher de nom — idem."
        )
    }

    // MARK: - Tap gauche sur l'intro = retour au groupe précédent (pas la story précédente)

    func test_goBackToPreviousGroupFromIntro_usesGroupTransition_notStoryIndexCheck() throws {
        let viewerSource = try source("Meeshy/Features/Main/Views/StoryViewerView.swift")
        let block = try body(
            of: "func goBackToPreviousGroupFromIntro() {", in: viewerSource, closing: "\n    }"
        )
        XCTAssertTrue(
            block.contains("groupTransition(forward: false)"),
            "goBackToPreviousGroupFromIntro doit réutiliser groupTransition(forward:false) " +
            "(même animation que goToPrevious() côté groupe)."
        )
        XCTAssertTrue(
            block.contains("currentGroupIndex -= 1"),
            "goBackToPreviousGroupFromIntro doit décrémenter currentGroupIndex."
        )
        XCTAssertFalse(
            block.contains("currentStoryIndex > 0"),
            "Le tap gauche sur l'intro doit TOUJOURS annuler le switch de groupe — jamais " +
            "reculer d'une story dans le nouveau groupe (contrairement à goToPrevious())."
        )
    }

    // MARK: - Gestes composés sur StoryGroupIntroOverlay

    func test_storyGroupIntroOverlay_hasOnBackAndDoubleTapGestures() throws {
        let viewerSource = try source("Meeshy/Features/Main/Views/StoryViewerView.swift")
        let block = try body(
            of: "private struct StoryGroupIntroOverlay: View {", in: viewerSource, closing: "\n}"
        )
        XCTAssertTrue(block.contains("let onBack: () -> Void"),
                      "StoryGroupIntroOverlay doit exposer onBack (tap gauche).")
        XCTAssertTrue(block.contains("SpatialTapGesture(count: 2)"),
                      "Le double-tap (n'importe où → premier slide) doit être câblé.")
        XCTAssertTrue(block.contains("exclusively(before:"),
                      "Le double-tap doit être prioritaire sur le tap simple (sinon il ne fire jamais).")
    }

    // MARK: - Badge de présence : règle 1/3/5, offline = AUCUN badge

    func test_presenceBadge_rendersNothingWhenOffline() throws {
        let viewerSource = try source("Meeshy/Features/Main/Views/StoryViewerView.swift")
        let block = try body(of: "private var presenceBadge: some View {", in: viewerSource)
        XCTAssertTrue(
            block.contains("state.showsIndicator"),
            "Le badge de présence de l'intro doit gater sur showsIndicator : " +
            "au-delà de 5 min (offline), AUCUN badge — jamais de dot gris « Hors ligne »."
        )
    }

    func test_accessibilitySummary_omitsPresenceWhenOffline() throws {
        let viewerSource = try source("Meeshy/Features/Main/Views/StoryViewerView.swift")
        let block = try body(of: "private var accessibilitySummary: String {", in: viewerSource)
        XCTAssertTrue(
            block.contains("showsIndicator"),
            "VoiceOver doit suivre la même règle que le badge visuel : présence " +
            "annoncée seulement quand un indicateur est affiché (online/away/idle)."
        )
    }
}
