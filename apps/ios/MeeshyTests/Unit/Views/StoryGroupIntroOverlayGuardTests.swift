import XCTest
@testable import Meeshy

/// Source-analysis guards pour l'unification de la carte de transition
/// inter-groupes : un SEUL rendu d'identité, `StoryAuthorIdentityCard`, partagé
/// par l'interstitiel (`StoryGroupIntroOverlay`, durée nominale fixe 500 ms) et par la
/// face entrante du cube (`NeighborGroupCubeFace`, qui révèle l'interlude AU
/// DOIGT depuis le 2026-07-25 — cf. le commentaire détaillé du test
/// correspondant pour le renversement de la règle du 2026-07-14).
/// `goBackToPreviousGroupFromIntro()`
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

    // MARK: - Durée fixe 500 ms

    /// Resserré de 2,2 s à 500 ms le 2026-08-20 (directive user : « les
    /// interludes doivent durer 500ms »). La garde porte sur la constante
    /// NOMINALE uniquement : le voile met un peu plus longtemps à disparaître
    /// pour de vrai (ses courbes de sortie sont préservées par choix
    /// utilisateur, cf. la doc de `groupIntroDuration`), et aucun test ne doit
    /// prétendre le contraire.
    func test_groupIntroDuration_isHalfASecond() throws {
        let viewerSource = try source("Meeshy/Features/Main/Views/StoryViewerView.swift")
        XCTAssertTrue(
            viewerSource.contains("static let groupIntroDuration: TimeInterval = 0.5"),
            "groupIntroDuration doit être fixé à 500 ms (directive user 2026-08-20)."
        )
    }

    // MARK: - Un seul RENDU d'identité : les deux surfaces passent par StoryAuthorIdentityCard

    /// RENVERSEMENT du 2026-07-25 (règle 4 de la navigation gestuelle : « le
    /// swipe doit afficher l'interlude du groupe suivant en mode cube, l'effet
    /// suit le geste »).
    ///
    /// De 2026-07-14 à 2026-07-25, ce test interdisait toute identité dans
    /// `NeighborGroupCubeFace` (`MeeshyAvatar` / `group.username` bannis) :
    /// à l'époque la face du cube et `StoryGroupIntroOverlay` avaient DEUX
    /// rendus distincts, et l'utilisateur voyait deux cartes quasi-identiques
    /// s'enchaîner. La face du cube révèle désormais l'interlude au doigt, donc
    /// l'interdiction est levée — mais la garantie « pas de double affichage »
    /// doit tenir autrement.
    ///
    /// Nouvelle invariante verrouillée ici : les DEUX surfaces délèguent leur
    /// identité à `StoryAuthorIdentityCard`. Un seul rendu, donc aucune
    /// divergence possible entre ce que le doigt révèle et ce que
    /// l'interstitiel prolonge — et aucune des deux ne peut ré-inliner son
    /// propre avatar/nom sans casser ce test.
    func test_bothIntroSurfaces_delegateIdentityToSharedCard() throws {
        // **L'UNITÉ, pas le fichier — parce que ce témoin garde une PRÉSENCE.**
        // `NeighborGroupCubeFace` vivait dans `+Canvas.swift` ; elle en est
        // sortie au #4474 pour rendre ce fichier à son budget, et ce témoin est
        // devenu rouge sur du code parfaitement juste : il cherchait la struct
        // là où elle n'était plus. Une garde qui nomme un FICHIER se périme au
        // premier découpage ; `AppSourceGuard.unit` globe `StoryViewerView+*`
        // et suit la struct où qu'elle aille dans l'unité.
        //
        // Ce raisonnement ne vaut PAS pour une garde de LIEU — celle qui
        // affirme « ceci n'est pas à tel endroit » : l'unité concatène et
        // efface justement la distinction qu'un tel témoin mesure.
        let unitSource = try AppSourceGuard.unit("Meeshy/Features/Main/Views/StoryViewerView.swift")
        let viewerSource = try source("Meeshy/Features/Main/Views/StoryViewerView.swift")

        let cubeFace = try body(of: "struct NeighborGroupCubeFace: View {", in: unitSource, closing: "\n}")
        let overlay = try body(
            of: "private struct StoryGroupIntroOverlay: View {", in: viewerSource, closing: "\n}"
        )

        XCTAssertTrue(
            cubeFace.contains("StoryAuthorIdentityCard("),
            "NeighborGroupCubeFace doit rendre l'identité via StoryAuthorIdentityCard " +
            "(interlude révélé au doigt, directive user 2026-07-25)."
        )
        XCTAssertTrue(
            overlay.contains("StoryAuthorIdentityCard("),
            "StoryGroupIntroOverlay doit rendre l'identité via StoryAuthorIdentityCard " +
            "— pas de rendu dupliqué qui divergerait de la face du cube."
        )
        for (name, block) in [("NeighborGroupCubeFace", cubeFace), ("StoryGroupIntroOverlay", overlay)] {
            XCTAssertFalse(
                block.contains("MeeshyAvatar("),
                "\(name) ne doit PAS ré-inliner d'avatar : StoryAuthorIdentityCard est le " +
                "SEUL rendu d'identité de la transition inter-groupes."
            )
        }
    }

    /// La montée de l'identité SUIT le geste : la face du cube dérive son
    /// opacité de l'avancement du drag, elle ne l'allume pas d'un coup.
    func test_neighborGroupCubeFace_identityOpacityFollowsGesture() throws {
        XCTAssertEqual(NeighborGroupCubeFace.identityOpacity(forProgress: 0), 0, accuracy: 0.001,
                       "Au repos, aucune identité — un micro-drag ne doit pas flasher un visage.")
        XCTAssertEqual(NeighborGroupCubeFace.identityOpacity(forProgress: 1), 1, accuracy: 0.001,
                       "À l'arête (90°), l'identité est pleine — l'interstitiel la prolonge sans saut.")
        let quarter = NeighborGroupCubeFace.identityOpacity(forProgress: 0.25)
        let half = NeighborGroupCubeFace.identityOpacity(forProgress: 0.4)
        XCTAssertGreaterThan(quarter, 0, "L'identité doit être partiellement révélée en cours de geste.")
        XCTAssertGreaterThan(half, quarter, "L'opacité doit croître avec l'avancement du doigt.")
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

    /// Depuis le 2026-07-26, le drag du lecteur (`unifiedDragGesture`) est monté
    /// en `.simultaneousGesture` sur un ANCÊTRE de cet overlay : les swipes
    /// restent donc actifs PENDANT l'interlude. Or un `SpatialTapGesture` se
    /// valide au relâchement quel que soit le déplacement parcouru — sans garde,
    /// un swipe de changement de groupe tirerait AUSSI le tap et l'utilisateur
    /// sauterait l'interlude en même temps qu'il change d'auteur.
    ///
    /// La garde est ancrée sur le COMPORTEMENT, pas sur le nom du drapeau ni sur
    /// la forme du `guard` : chaque branche de tap doit sortir tôt (`else
    /// { return }`) AVANT d'appeler quoi que ce soit, et l'overlay doit mesurer
    /// le déplacement lui-même (`SpatialTapGesture.Value` n'expose que
    /// `location`, jamais la distance parcourue — il faut un mouchard
    /// `DragGesture`).
    func test_storyGroupIntroOverlay_tapsAreGatedOnFingerMovement() throws {
        let viewerSource = try source("Meeshy/Features/Main/Views/StoryViewerView.swift")
        let overlay = try body(
            of: "private struct StoryGroupIntroOverlay: View {", in: viewerSource, closing: "\n}"
        )

        XCTAssertTrue(
            overlay.contains("DragGesture(minimumDistance: 0"),
            "L'overlay doit mesurer lui-même le déplacement du doigt : un SpatialTapGesture " +
            "ne connaît que sa position, jamais la distance parcourue."
        )

        guard let tapChain = overlay.range(of: "SpatialTapGesture(count: 2)") else {
            return XCTFail("chaîne de taps de l'interlude introuvable")
        }
        let handlers = overlay[tapChain.lowerBound...]
            .components(separatedBy: ".onEnded {")
            .dropFirst()
        XCTAssertEqual(handlers.count, 2, "L'interlude doit avoir exactement deux branches de tap (double, simple).")

        for handler in handlers {
            // Première action déclenchée par la branche, quelle qu'elle soit.
            let firstAction = [handler.range(of: "onSkip()"), handler.range(of: "onBack()")]
                .compactMap { $0?.lowerBound }
                .min()
            guard let firstAction else {
                return XCTFail("une branche de tap n'appelle aucune action")
            }
            XCTAssertTrue(
                String(handler[..<firstAction]).contains("else { return }"),
                "Chaque branche de tap doit rendre au drag parent un toucher QUI A BOUGÉ, " +
                "avant d'agir — sinon un swipe change de groupe ET saute l'interlude."
            )
        }
    }

    // MARK: - Badge de présence : règle 1/3/5, offline = AUCUN badge

    // Le badge vit désormais dans `StoryAuthorIdentityCard` (extraction du
    // 2026-07-25) — assertion inchangée, seul le fichier cible suit le rendu.
    func test_presenceBadge_rendersNothingWhenOffline() throws {
        let cardSource = try source("Meeshy/Features/Main/Views/StoryAuthorIdentityCard.swift")
        let block = try body(of: "private var presenceBadge: some View {", in: cardSource)
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
