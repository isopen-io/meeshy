import Foundation
import XCTest
@testable import Meeshy

/// Sur QUELLE forme les effets d'un message se posent.
///
/// `.messageEffects(...)` a vécu monté dans `ThemedMessageBubble`, sur
/// `BubbleStandardLayout(...)` — c'est-à-dire sur le `HStack` de RANGÉE, qui
/// contient l'avatar, la bulle, le strip de réactions et tout l'espace vide
/// jusqu'au bord de l'écran. Le liseré arc-en-ciel encadrait donc du vide sur
/// la moitié de sa longueur, et l'effet lisait comme un autocollant collé de
/// travers quel que soit son mouvement.
///
/// Rien ne rougissait : le plan de lecture était correct, les vues
/// compilaient, l'effet JOUAIT. Seul son périmètre était faux — un défaut
/// invisible à tout test qui ne regarde pas où le modifier est posé.
///
/// La garde est délibérément APPARIÉE : une garde purement négative (« le
/// modifier n'est plus dans `ThemedMessageBubble` ») passerait au vert le jour
/// où le motif recherché change de forme, en ayant perdu toute protection. Le
/// versant positif exige donc que le modifier soit RÉELLEMENT posé sur la
/// bulle — si lui rougit, la négative devient sans objet et les deux se
/// relisent ensemble.
final class BubbleEffectPerimeterSourceGuardTests: XCTestCase {

    private static let mountingModifier = ".messageEffects("

    private var bubbleRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Views
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
            .appendingPathComponent("Meeshy/Features/Main/Views")
    }

    /// Les deux fichiers DOCUMENTENT le déplacement en prose, et citent donc le
    /// modifier dans leurs commentaires. Sans dépouillement, le versant négatif
    /// rougirait sur sa propre explication.
    private func strippedSource(_ relativePath: String) throws -> String {
        let url = bubbleRoot.appendingPathComponent(relativePath)
        let raw = try String(contentsOf: url, encoding: .utf8)
        let stripped = AppSourceGuard.stripComments(raw)

        XCTAssertFalse(
            stripped.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            "Balayage vide pour \(relativePath) : le fichier a bougé, ou le dépouillement a tout mangé. "
            + "Un balayage vide ne doit jamais être indiscernable d'un succès."
        )
        return stripped
    }

    // MARK: - Versant positif — le modifier est posé sur la bulle

    func test_theBubbleItself_carriesTheMessageEffects() throws {
        let source = try strippedSource("Bubble/BubbleStandardLayout.swift")

        XCTAssertTrue(
            source.contains(Self.mountingModifier),
            "`BubbleStandardLayout` ne pose plus `\(Self.mountingModifier)`. "
            + "Les effets d'un message doivent être montés sur la BULLE — sur le `ZStack` "
            + "qui porte `contentStack`, dont la largeur est celle du contenu réel."
        )
    }

    /// Le cap de largeur (`bubbleMaxWidth`) est appliqué sur le `VStack` PARENT.
    /// Un modifier posé après lui hériterait de 275 pt même pour une bulle de
    /// trois mots — un contour à nouveau plus large que ce qu'il entoure.
    func test_theEffects_arePosedBeforeTheWidthCap() throws {
        let source = try strippedSource("Bubble/BubbleStandardLayout.swift")

        guard let mount = source.range(of: Self.mountingModifier),
              let cap = source.range(of: ".frame(maxWidth: DeviceLayout.bubbleMaxWidth") else {
            return XCTFail("Motif introuvable : le montage ou le cap de largeur a changé de forme — relire les deux.")
        }

        XCTAssertTrue(
            mount.lowerBound < cap.lowerBound,
            "`\(Self.mountingModifier)` est posé APRÈS le cap de largeur. Le contour reprendrait "
            + "toute la largeur du cap au lieu d'épouser la bulle."
        )
    }

    /// Les pastilles de réaction chevauchent volontairement le coin de la bulle.
    /// Si le liseré est posé après leur overlay, il leur passe par-dessus.
    func test_theEffects_arePosedBeforeTheReactionsOverlay() throws {
        let source = try strippedSource("Bubble/BubbleStandardLayout.swift")

        guard let mount = source.range(of: Self.mountingModifier),
              let reactions = source.range(of: ".overlay(alignment: isMe ? .bottomLeading : .bottomTrailing)") else {
            return XCTFail("Motif introuvable : le montage ou l'overlay de réactions a changé de forme — relire les deux.")
        }

        XCTAssertTrue(
            mount.lowerBound < reactions.lowerBound,
            "`\(Self.mountingModifier)` est posé APRÈS l'overlay de réactions : le liseré passerait "
            + "au-dessus des pastilles au lieu de rester sous elles."
        )
    }

    // MARK: - Versant négatif — la rangée ne les porte plus

    func test_theRow_noLongerCarriesTheMessageEffects() throws {
        let source = try strippedSource("ThemedMessageBubble.swift")

        XCTAssertFalse(
            source.contains(Self.mountingModifier),
            "`ThemedMessageBubble` repose `\(Self.mountingModifier)`. À ce niveau le modifier "
            + "s'applique au `HStack` de rangée de `BubbleStandardLayout` — avatar, bulle, réactions "
            + "et tout l'espace vide jusqu'au bord de l'écran. Le liseré arc-en-ciel y encadre du vide. "
            + "Le montage appartient à `BubbleStandardLayout`, sur le `ZStack` de contenu."
        )
    }
}
