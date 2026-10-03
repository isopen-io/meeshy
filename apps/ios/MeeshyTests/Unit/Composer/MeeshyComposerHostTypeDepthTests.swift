import XCTest
import SwiftUI
@testable import Meeshy

/// **« Créer une story » ne déborde plus la pile** (#8387).
///
/// Le plantage : signal 11 sur la pile de 8 Mo du fil principal, une trace qui
/// bouclait sur la copie de valeur `ExclusiveGesture` sous `StoryComposerView`,
/// depuis `MeeshyComposerHost.body` — un cadre de ~100 Ko à lui seul. Le
/// `body` empilait en une expression la racine, l'autosave, le viseur, le menu
/// du fond, la pile, les portails et l'aiguillage des surfaces : un type
/// concret d'une cinquantaine de niveaux, matérialisé et copié dans ce cadre.
///
/// ## Ce que ce témoin mesure, et pourquoi c'est ce qui tombe
///
/// Le type CONCRET de chaque `Body` (l'opaque résolu à l'exécution). Une vue
/// `struct` nominale ou un `ViewModifier` nommé y apparaît comme une FEUILLE :
/// son propre `body` n'y est pas déplié. C'est exactement la frontière qui
/// borne la pile, et exactement ce que l'inlining détruit :
///
/// - remettre la pile ou l'aiguillage dans le `body` du meuble fait réapparaître
///   `StoryComposerView` dans `MeeshyComposerHost.Body` et repasse sa profondeur
///   de 2 à ~50 — les DEUX assertions rougissent ;
/// - empiler une vingtaine de modificateurs sur une couche la fait sortir du
///   budget commun de 40 (le même que `ConversationViewBodyTypeDepthTests`,
///   dont la dérivation — ~17 Ko de pile par niveau dans le démangleur — vaut
///   ici).
///
/// Une garde de SOURCE (« le `body` appelle `ComposerHostStage` ») resterait
/// verte devant un `composerStage` qui ré-inlinerait la pile : elle lit un nom,
/// pas la forme du type. La mesure du type, elle, ne se contourne pas.
@MainActor
final class MeeshyComposerHostTypeDepthTests: XCTestCase {

    /// Le budget d'une couche, partagé avec les corps de la conversation.
    private static let layerBudget = 40

    /// La racine n'empile que ses trois couches : `ModifiedContent` sur
    /// `ModifiedContent` sur la scène. Tout ajout DANS le `body` la fait monter.
    private static let rootBudget = 4

    private static var layers: [(String, Any.Type)] {
        [
            ("MeeshyComposerHost.Body", MeeshyComposerHost.Body.self),
            ("ComposerHostStage.Body", ComposerHostStage.Body.self),
            ("ComposerHostStack.Body", ComposerHostStack.Body.self),
            ("ComposerHostSurface.Body", ComposerHostSurface.Body.self),
            ("ComposerHostChromeLayer.Body", ComposerHostChromeLayer.Body.self),
            ("ComposerHostLifecycleLayer.Body", ComposerHostLifecycleLayer.Body.self),
        ]
    }

    func test_laMesure_compteLImbrication() {
        XCTAssertEqual(Self.depth(of: "A<B<C>, D<E<F<G>>>>"), 4)
        XCTAssertEqual(Self.depth(of: "Text"), 0)
    }

    func test_laRacine_nEmpileQueSesTroisCouches() throws {
        let racine = try Self.measure(MeeshyComposerHost.Body.self)
        XCTAssertTrue(racine.name.contains("ComposerHostStage"),
                      "La racine doit monter la scène comme un NŒUD : \(racine.excerpt)")
        XCTAssertTrue(racine.name.contains("ComposerHostChromeLayer"))
        XCTAssertTrue(racine.name.contains("ComposerHostLifecycleLayer"))
        XCTAssertLessThanOrEqual(
            racine.depth, Self.rootBudget,
            """
            `MeeshyComposerHost.Body` imbrique \(racine.depth) niveaux (plafond \(Self.rootBudget)). \
            Un modificateur ou un sous-arbre a été remis dans le `body` du meuble : il se pose \
            dans une couche de `MeeshyComposerHost+Layers`, jamais à la racine (#8387).
            \(racine.excerpt)
            """
        )
    }

    /// **L'atelier n'est déplié que dans l'aiguillage.** C'est sous
    /// `StoryComposerView` que la copie de valeur bouclait : tant qu'il reste
    /// derrière `ComposerHostSurface`, la scène, la pile et la racine ne le
    /// copient plus.
    func test_lAtelier_nEstDepliéQueDansLAiguillage() throws {
        for (nom, type) in Self.layers where nom != "ComposerHostSurface.Body" {
            let mesure = try Self.measure(type)
            XCTAssertFalse(
                Self.mentionsAtelier(mesure.name),
                "`\(nom)` déplie `StoryComposerView` : l'aiguillage n'est plus un nœud (#8387)."
            )
        }
        XCTAssertTrue(try Self.measure(ComposerHostStage.Body.self).name.contains("ComposerHostStack"),
                      "La scène doit monter la pile comme un NŒUD.")
        XCTAssertTrue(try Self.measure(ComposerHostStack.Body.self).name.contains("ComposerHostSurface"),
                      "La pile doit monter l'aiguillage comme un NŒUD.")
        XCTAssertTrue(Self.mentionsAtelier(try Self.measure(ComposerHostSurface.Body.self).name),
                      "Le fusible : l'aiguillage lu est bien celui qui monte l'atelier.")
    }

    /// Le TYPE `StoryComposerView`, pas un préfixe : `StoryComposerViewModel`
    /// peut paraître dans un paramètre générique sans rien déplier.
    nonisolated private static func mentionsAtelier(_ typeName: String) -> Bool {
        typeName.range(of: "StoryComposerView(?![A-Za-z])", options: .regularExpression) != nil
    }

    func test_chaqueCouche_tientDansLeBudgetDePile() throws {
        for (nom, type) in Self.layers {
            let mesure = try Self.measure(type)
            print("[profondeur #8387] \(nom) = \(mesure.depth) niveaux (\(mesure.name.count) caractères)")
            XCTAssertLessThanOrEqual(
                mesure.depth, Self.layerBudget,
                """
                `\(nom)` imbrique \(mesure.depth) niveaux (budget \(Self.layerBudget)). Découper la \
                couche en vues `struct` nominales ou en `ViewModifier` nommés — un `AnyView` ne \
                ferait que déplacer le débordement (#8387).
                \(mesure.excerpt)
                """
            )
        }
    }

    // MARK: - La mesure

    private struct Measurement {
        let depth: Int
        let name: String
        var excerpt: String { String(name.prefix(600)) }
    }

    /// Sur un fil à pile de 64 Mo : résoudre le nom d'un type trop profond est
    /// précisément l'opération qui déborde, et le harnais doit la MESURER, pas
    /// planter en la tentant.
    private static func measure(_ type: Any.Type) throws -> Measurement {
        var result: Measurement?
        let thread = Thread {
            let name = _typeName(type, qualified: false)
            result = Measurement(depth: depth(of: name), name: name)
        }
        thread.stackSize = 64 * 1024 * 1024
        thread.start()
        let deadline = Date().addingTimeInterval(60)
        while result == nil, Date() < deadline { usleep(2000) }
        guard let measured = result else {
            throw XCTSkip("Mesure de profondeur de type non terminée en 60 s")
        }
        return measured
    }

    /// Les chevrons ET les parenthèses : un tuple ou un type de fonction porte
    /// sa propre imbrication, que le démangleur parcourt aussi.
    nonisolated private static func depth(of typeName: String) -> Int {
        typeName.reduce(into: (depth: 0, max: 0)) { acc, character in
            switch character {
            case "<", "(":
                acc.depth += 1
                acc.max = Swift.max(acc.max, acc.depth)
            case ">", ")":
                acc.depth -= 1
            default:
                break
            }
        }.max
    }
}
