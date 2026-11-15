import XCTest
@testable import Meeshy

/// **Garde source — `CometPillModifier` (réaction qui atterrit) doit
/// respecter Reduce Motion.**
///
/// `startCometLanding()` joue un zoom 2.6x + un tremblement de ~0.6s à
/// chaque nouvelle réaction : sans garde, un utilisateur qui a activé
/// « Réduire les animations » (système ou override in-app) subit ce
/// mouvement à chaque réaction, malgré son réglage. Reduce Motion a DEUX
/// interrupteurs — `\.accessibilityReduceMotion` (système) et
/// `\.meeshyForceReduceMotion` (override in-app, composé par un OU via
/// `MeeshyMotion.shouldReduce`) — et un modifier qui n'en lit qu'un, ou
/// aucun, se comporte juste par accident (voir `ReduceMotion.swift`).
///
/// Cette garde lit la SOURCE, bornée sur la tranche `struct
/// CometPillModifier` (déclaration + corps, jusqu'au prochain `struct` ou
/// `enum` de premier niveau) — pas le fichier entier, pour qu'un autre type
/// du même fichier qui citerait `accessibilityReduceMotion` dans un
/// commentaire ne fasse pas passer la garde à tort.
final class CometPillReduceMotionGuardTests: XCTestCase {

    private var overlaySource: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Bubble
            .deletingLastPathComponent()  // Views
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
            .appendingPathComponent("Meeshy/Features/Main/Views/Bubble/BubbleReactionsOverlay.swift")
    }

    private func strippedSource() throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: overlaySource, encoding: .utf8))
    }

    /// Borne la tranche sur le TYPE — un déplacement de code ailleurs dans le
    /// fichier ne fait pas pourrir la garde, tant que le modifier garde son
    /// nom.
    private func cometPillModifierBlock() throws -> String {
        let source = try strippedSource()
        let start = try XCTUnwrap(
            source.range(of: "struct CometPillModifier"),
            "`CometPillModifier` a disparu ou changé de nom — la garde ne vise plus rien."
        )
        let rest = source[start.upperBound...]
        // Prochaine déclaration de type de premier niveau après le modifier
        // (le gate `ReactionAnimationGate` qui le suit dans ce fichier).
        //
        // La borne est OBLIGATOIRE : à défaut, la tranche s'étendrait
        // jusqu'à la fin du fichier et les assertions pourraient passer sur
        // du texte appartenant à un autre type — une garde qui verdit pour
        // la mauvaise raison est pire que pas de garde.
        let end = try XCTUnwrap(
            rest.range(of: "\nenum ReactionAnimationGate"),
            "Borne de fin introuvable : `ReactionAnimationGate` a disparu ou changé de nom — repointer la fenêtre."
        )
        return String(source[start.lowerBound..<end.lowerBound])
    }

    func test_cometPillModifier_readsBothReduceMotionSwitches() throws {
        let block = try cometPillModifierBlock()

        XCTAssertTrue(
            block.contains("accessibilityReduceMotion"),
            "CometPillModifier ne lit plus le réglage système Reduce Motion : la comète rejouerait pour tout le monde."
        )
        XCTAssertTrue(
            block.contains("meeshyForceReduceMotion"),
            "CometPillModifier ne lit plus l'override in-app Reduce Motion — deuxième interrupteur manquant."
        )
        XCTAssertTrue(
            block.contains("MeeshyMotion.shouldReduce"),
            "Les deux interrupteurs doivent se composer par la règle partagée `MeeshyMotion.shouldReduce`, pas une réécriture locale."
        )
    }

    /// Sous Reduce Motion, `startCometLanding()` (le zoom + le tremblement)
    /// ne doit JAMAIS être invoqué — le `onAppear` doit court-circuiter
    /// avant l'appel.
    func test_onAppear_guardsStartCometLanding_behindReduceMotion() throws {
        let block = try cometPillModifierBlock()

        guard let onAppearRange = block.range(of: ".onAppear {") else {
            XCTFail("`.onAppear` introuvable dans CometPillModifier — la garde ne vise plus le bon site.")
            return
        }
        let onAppearBody = String(block[onAppearRange.lowerBound...])

        guard let reduceMotionGuardRange = onAppearBody.range(of: "guard !reduceMotion") else {
            XCTFail("`.onAppear` ne garde plus `startCometLanding()` derrière `reduceMotion` — la comète rejouerait sous Reduce Motion.")
            return
        }
        guard let startCallRange = onAppearBody.range(of: "startCometLanding()") else {
            XCTFail("`startCometLanding()` n'est plus appelé depuis `.onAppear`.")
            return
        }

        XCTAssertTrue(
            reduceMotionGuardRange.lowerBound < startCallRange.lowerBound,
            "`startCometLanding()` doit être APRÈS le `guard !reduceMotion` — sinon la comète part avant que le garde-fou joue."
        )
    }
}
