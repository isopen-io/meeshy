import XCTest
@testable import Meeshy

/// **Un MODE de lecture peut avoir plusieurs chemins de rendu, et la protection
/// doit tenir sur TOUS** (#7508, relevé en recette staging le 2026-09-23).
///
/// `ReadingModeProtectionChromeGuardTests` interroge UN fichier par mode —
/// `ReadingModeProtectionChrome.rendererPath(for:)`. Pour le mode Bulles, ce
/// fichier est `BubbleStandardLayout.swift`. Or `ThemedMessageBubble` aiguille
/// AVANT lui :
///
/// ```swift
/// if let sticker = content.sticker {
///     stickerLayout(content: content, sticker: sticker)   // ← BubbleSticker
/// } else {
///     standardLayout(content: content)                    // ← BubbleStandardLayout
/// }
/// ```
///
/// `BubbleSticker` court-circuitait donc le seul site où le mode Bulles monte
/// le voile et le chrome. Mesuré sur staging : un texte à VUE UNIQUE s'affichait
/// **en clair** au destinataire, jamais consommé (`isViewOnce: true`,
/// `viewOnceCount: 0` côté serveur) — la protection était POSÉE et pas
/// APPLIQUÉE.
///
/// Et ce n'est pas une branche rare : le bouton d'envoi par défaut du composeur
/// rend le texte tapé en STICKER et le poste en `messageType: "image"`. La
/// branche sticker EST le chemin nominal d'un message tapé au clavier.
///
/// La garde précédente rendait VERT pendant ce défaut parce qu'elle mesure le
/// montage du chrome dans le site qu'elle CONNAÎT, pas l'atteignabilité de tous
/// les chemins de rendu d'un mode. Celle-ci ferme la classe : toute branche de
/// l'aiguillage doit porter le voile ET le chrome.
final class BubbleRenderBranchProtectionGuardTests: XCTestCase {

    /// Les deux feuilles entre lesquelles `ThemedMessageBubble` aiguille.
    /// Une troisième branche ajoutée sans entrée ici ne serait pas gardée —
    /// d'où `test_lAiguillageNAQueLesBranchesEnumereesIci`, juste en dessous.
    private static let renderBranches = [
        "Features/Main/Views/Bubble/BubbleStandardLayout.swift",
        "Features/Main/Views/Bubble/BubbleSticker.swift",
    ]

    private func appRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // …/Unit/Architecture
            .deletingLastPathComponent()  // …/Unit
            .deletingLastPathComponent()  // …/MeeshyTests
            .deletingLastPathComponent()  // …/apps/ios
            .appendingPathComponent("Meeshy")
    }

    private func source(at relativePath: String) throws -> String {
        try String(contentsOf: appRoot().appendingPathComponent(relativePath), encoding: .utf8)
    }

    // MARK: - Le voile, sur chaque branche

    func test_chaqueBrancheDeRendu_monteLeVoileDeProtection() throws {
        for path in Self.renderBranches {
            let code = try source(at: path)
            XCTAssertTrue(
                code.contains("ProtectedVeilAffordance("),
                """
                `\(path)` ne monte PAS `ProtectedVeilAffordance`. Un message à \
                vue unique ou flouté rendu par cette branche s'affiche EN CLAIR : \
                le destinataire le lit — et le relit — sans avoir jamais consenti \
                à le consommer. Un champ `isViewOnce` posé côté serveur ne fait \
                pas respecter la restriction qu'il déclare ; seul le voile la \
                fait respecter.
                """
            )
        }
    }

    func test_chaqueBrancheDeRendu_gardeLeVoileSurLaRegleUnique() throws {
        for path in Self.renderBranches {
            let code = try source(at: path)
            XCTAssertTrue(
                code.contains("requiresVeil"),
                """
                `\(path)` monte un voile sans consulter `requiresVeil`. La règle \
                « ce contenu doit-il être voilé ? » vit en UN site — \
                `MessageProtectionDescriptor.requiresVeil` — et une seconde \
                écriture divergerait au premier badge ajouté.
                """
            )
        }
    }

    // MARK: - Le chrome, sur chaque branche

    func test_chaqueBrancheDeRendu_monteLeChromeDeProtection() throws {
        for path in Self.renderBranches {
            let code = try source(at: path)
            XCTAssertTrue(
                code.contains("MessageProtectionChrome(descriptor:"),
                """
                `\(path)` ne rend PAS le chrome de protection : ni flamme, ni \
                compteur de dernière minute, ni puce ① sur cette branche. \
                Le décompte d'un éphémère et la désignation d'une vue unique \
                en dépendent.
                """
            )
        }
    }

    // MARK: - L'aiguillage lui-même

    /// La liste ci-dessus est un INVENTAIRE, et un inventaire se périme en
    /// silence. Ce témoin le rattache à la source : si `ThemedMessageBubble`
    /// gagne une troisième feuille, il rougit — et l'inventaire se met à jour
    /// avec elle, plutôt que de la laisser non gardée.
    func test_lAiguillageNAQueLesBranchesEnumereesIci() throws {
        let code = try source(at: "Features/Main/Views/ThemedMessageBubble.swift")
        let feuilles = ["BubbleSticker(", "BubbleStandardLayout("]
        for feuille in feuilles {
            XCTAssertTrue(
                code.contains(feuille),
                "`ThemedMessageBubble` ne monte plus `\(feuille)` — l'inventaire de cette garde est périmé."
            )
        }
        let montees = ["BubbleSticker(", "BubbleStandardLayout(", "BubbleGrid", "BubbleAudio", "BubbleEmoji"]
            .filter { code.contains($0) }
        XCTAssertEqual(
            Set(montees), Set(feuilles),
            """
            `ThemedMessageBubble` monte une feuille de rendu que \
            `renderBranches` n'énumère pas : \(Set(montees).subtracting(feuilles)). \
            Ajoutez-la à l'inventaire — sinon elle rendra des messages protégés \
            sans voile, exactement comme `BubbleSticker` avant #7508.
            """
        )
    }
}
