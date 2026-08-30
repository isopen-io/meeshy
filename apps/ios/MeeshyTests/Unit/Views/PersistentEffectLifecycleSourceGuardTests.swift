import Foundation
import XCTest
@testable import Meeshy

/// **Une boucle qui démarre à l'affichage doit s'arrêter à la disparition.**
///
/// Les quatre effets persistants (`glow`, `pulse`, `rainbow`, `sparkle`)
/// démarraient leur animation dans un `onAppear` et n'en avaient AUCUN pour la
/// couper : une bulle défilée hors de la fenêtre continuait de re-rastériser
/// son ombre à chaque frame et de redessiner son `Canvas` à 10 Hz. Rien ne
/// rougissait — l'effet est correct tant qu'il est visible, et son coût ne se
/// lit qu'au profileur.
///
/// La garde est écrite en DEUX temps, parce qu'une garde de source qui ne
/// s'interroge que sur le fichier réel peut naître déjà verte sans qu'on le
/// sache :
/// 1. `stopMechanisms(in:)` est éprouvée sur des fragments LITTÉRAUX — un
///    fragment fautif (celui d'avant le correctif) doit rendre un ensemble
///    vide, sinon la garde ne mesure rien ;
/// 2. la même fonction est ensuite appliquée aux blocs réels du fichier.
///
/// Elle porte enfin un balayage GÉNÉRIQUE : tout bloc du fichier qui contient
/// une boucle infinie (`repeatForever`, `TimelineView`, `Animatable`) doit
/// porter un mécanisme d'arrêt. C'est lui qui attrapera l'effet persistant
/// écrit demain, que cette liste-ci ne connaît pas.
final class PersistentEffectLifecycleSourceGuardTests: XCTestCase {

    /// Les deux formes d'arrêt, qui ne sont pas interchangeables : un `@State`
    /// animé se réassigne hors transaction animée ; une HORLOGE se met en pause
    /// ou se démonte.
    enum StopMechanism: String, CaseIterable {
        /// `withTransaction(Transaction(animation: nil)) { flag = false }`
        case resetsStateWithoutAnimation
        /// `TimelineView(.animation(…, paused: …))`
        case pausesItsClock
        /// La couche animée n'est montée que tant que la vue est à l'écran.
        case unmountsWhileOffScreen
    }

    // MARK: - 1. La détection, éprouvée sur des fragments

    static func stopMechanisms(in block: String) -> Set<StopMechanism> {
        var found: Set<StopMechanism> = []
        if block.contains(".onDisappear"),
           block.contains("withTransaction(Transaction(animation: nil))") {
            found.insert(.resetsStateWithoutAnimation)
        }
        if block.contains("paused:") {
            found.insert(.pausesItsClock)
        }
        if block.contains(".onDisappear"), block.contains("isOnScreen") {
            found.insert(.unmountsWhileOffScreen)
        }
        return found
    }

    /// Le fragment d'AVANT le correctif — celui qui a tourné en production.
    /// S'il passait, la garde serait décorative.
    func test_theOldGlowFragment_showsNoStopMechanism() {
        let before = """
        .onAppear {
            withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) { glowing = true }
        }
        """
        XCTAssertTrue(Self.stopMechanisms(in: before).isEmpty,
                      "La détection accepte le code fautif : elle ne mesure rien.")
    }

    func test_anOnDisappearAlone_isNotEnough() {
        let halfFixed = """
        .onAppear { withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) { pulsing = true } }
        .onDisappear { pulsing = false }
        """
        XCTAssertTrue(
            Self.stopMechanisms(in: halfFixed).isEmpty,
            "Réassigner l'état DANS une transaction animée relance la boucle en sens inverse "
            + "au lieu de la couper — un `onDisappear` nu ne compte pas comme un arrêt."
        )
    }

    func test_theFixedFragments_areRecognised() {
        XCTAssertEqual(
            Self.stopMechanisms(in: ".onDisappear { withTransaction(Transaction(animation: nil)) { glowing = false } }"),
            [.resetsStateWithoutAnimation]
        )
        XCTAssertEqual(
            Self.stopMechanisms(in: "TimelineView(.animation(minimumInterval: 0.1, paused: !isOnScreen))"),
            [.pausesItsClock]
        )
    }

    // MARK: - 2. Le fichier réel

    private func source() throws -> String {
        AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Components/MessageEffectModifiers.swift")
        )
    }

    /// Le bloc d'un type, borné par la prochaine déclaration de haut niveau —
    /// jamais par un `prefix(n)`, qui se décale au premier commentaire ajouté.
    private func block(_ declaration: String, in source: String) throws -> String {
        let start = try XCTUnwrap(source.range(of: declaration),
                                  "`\(declaration)` a disparu ou changé de nom — la garde ne vise plus rien.")
        let rest = source[start.upperBound...]
        let boundaries = ["\nstruct ", "\nprivate struct ", "\nextension ", "\nfinal class ", "\n// MARK: -"]
        let end = boundaries.compactMap { rest.range(of: $0)?.lowerBound }.min() ?? rest.endIndex
        return String(source[start.lowerBound..<end])
    }

    func test_everyPersistentEffect_stopsWhenItsMessageLeavesTheScreen() throws {
        let source = try source()

        for (declaration, expected) in [
            ("struct GlowEffect", StopMechanism.resetsStateWithoutAnimation),
            ("struct PulseEffect", .resetsStateWithoutAnimation),
            ("struct RainbowEffect", .unmountsWhileOffScreen),
            ("struct SparkleEffect", .pausesItsClock)
        ] {
            let mechanisms = Self.stopMechanisms(in: try block(declaration, in: source))
            XCTAssertTrue(
                mechanisms.contains(expected),
                "\(declaration) n'a plus de mécanisme d'arrêt `\(expected.rawValue)` : "
                + "son animation survit à la sortie d'écran de son message, et tourne pour des pixels "
                + "que personne ne voit. Mécanismes trouvés : \(mechanisms.map(\.rawValue).sorted())."
            )
        }
    }

    /// La comète est `Animatable` : SwiftUI rappelle son `body` à la fréquence
    /// d'affichage TANT QU'ELLE EST MONTÉE. Remettre sa phase à zéro ne
    /// l'arrête pas — d'où l'exigence, ici, sur son montage conditionnel.
    func test_theCometLayer_isMountedOnlyWhileOnScreen() throws {
        let block = try block("struct RainbowEffect", in: try source())
        XCTAssertTrue(
            block.contains("if animated, isOnScreen {"),
            "La couche comète n'est plus conditionnée à la présence à l'écran : "
            + "une couche `Animatable` montée redessine à 60/120 Hz, quoi qu'on fasse de son état."
        )
    }

    // MARK: - 3. Le balayage générique — l'effet écrit demain

    /// Ce que la liste ci-dessus ne peut pas connaître : un effet persistant
    /// AJOUTÉ plus tard. La règle ne nomme donc plus les effets, elle nomme le
    /// symptôme — une boucle sans fin dans un bloc sans arrêt.
    func test_noBlockRunsAnEndlessLoopWithoutAWayToStopIt() throws {
        let source = try source()
        let endless = ["repeatForever", "TimelineView(", ": View, Animatable"]

        var offenders: [String] = []
        var scanned = 0
        for declaration in source.components(separatedBy: "\nstruct ").dropFirst() {
            guard let name = declaration.split(whereSeparator: { $0 == ":" || $0 == " " }).first else { continue }
            let body = try block("struct \(name)", in: source)
            guard endless.contains(where: body.contains) else { continue }
            scanned += 1
            if Self.stopMechanisms(in: body).isEmpty { offenders.append(String(name)) }
        }

        XCTAssertGreaterThanOrEqual(
            scanned, 4,
            "Balayage trop maigre : les quatre effets persistants connus doivent au moins y figurer. "
            + "Un balayage vide ne doit jamais être indiscernable d'un succès."
        )
        XCTAssertTrue(
            offenders.isEmpty,
            "Boucle sans fin sans mécanisme d'arrêt dans : \(offenders.sorted().joined(separator: ", ")). "
            + "Un effet qui démarre à l'affichage doit s'arrêter à la disparition."
        )
    }
}
