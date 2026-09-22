import XCTest
import MeeshySDK
@testable import Meeshy

/// **La garde du « tout autre affichage plus tard »** (#7452).
///
/// ## Ce qu'elle empêche, et pourquoi une garde plutôt qu'un correctif
///
/// Relevé sur `dev` 3ff99d3aa3 : la conversation se lit de CINQ façons, et le
/// décompte d'un message éphémère n'existait que dans trois d'entre elles —
/// Focal et Script (`FocalEphemeralBadge`), Bulle (`BubbleEphemeralBadge`).
/// **Rivière et Résumé n'affichaient rien** : un message qui allait disparaître
/// dans trente secondes ne le disait pas à deux lecteurs sur cinq.
///
/// Ce n'était pas une négligence, c'était structurel. Rivière et Résumé sont
/// nés APRÈS la bulle, et rien, en les écrivant, n'obligeait à déclarer ce
/// qu'ils faisaient des messages protégés. Ajouter deux badges aujourd'hui
/// referme le trou d'aujourd'hui ; le sixième mode le rouvrira, exactement
/// comme les deux précédents. La directive porteur nomme ce risque : « il est
/// important de s'assurer que cette feature a un décompte en Script, Focal ou
/// bulle **ou tout autre affichage plus tard** ».
///
/// La garde parcourt donc `ConversationReadingMode.allCases` — jamais une
/// liste recopiée — et exige, pour CHAQUE cas, un fichier qui monte
/// `MessageProtectionChrome` avec un descripteur RÉSOLU. Un sixième mode ne
/// peut naître ni sans entrée dans `ReadingModeProtectionChrome` (le `switch`
/// ne compilerait pas), ni sans rendre le chrome (ce test rougirait).
final class ReadingModeProtectionChromeGuardTests: XCTestCase {

    private func appRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // …/Unit/Architecture
            .deletingLastPathComponent()  // …/Unit
            .deletingLastPathComponent()  // …/MeeshyTests
            .deletingLastPathComponent()  // …/apps/ios
            .appendingPathComponent("Meeshy")
    }

    private func source(at relativePath: String) throws -> String {
        let url = appRoot().appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - Les cinq modes, et le sixième

    func test_chaqueModeDeLecture_rendLeChromeDeProtection() throws {
        for mode in ReadingModeOrchestrator.ConversationReadingMode.allCases {
            let path = ReadingModeProtectionChrome.rendererPath(for: mode)
            let code = try source(at: path)
            XCTAssertTrue(
                code.contains("MessageProtectionChrome(descriptor:"),
                """
                Le mode « \(mode.rawValue) » ne rend PAS le chrome de protection. \
                `\(path)` doit monter `MessageProtectionChrome(descriptor:…)` — le \
                décompte d'un éphémère ET la désignation d'une vue unique en \
                dépendent. C'est la garde du « tout autre affichage plus tard » : \
                deux modes sur cinq (Rivière, Résumé) étaient muets avant #7452, \
                et un badge peint à la main ici rouvrirait la divergence.
                """
            )
        }
    }

    /// Le descripteur monté ne doit pas être FABRIQUÉ par la vue : il vient de
    /// la résolution unique (`MeeshyMessage.protection`), directement ou via la
    /// projection du mode (`BubbleContent.protection`, `RiverBubbleContent
    /// .protection`, `SummaryProtectionEntry.descriptor`).
    func test_chaqueModeDeLecture_consommeUnDescripteurRésolu() throws {
        let resolvedSources = [
            ".protection",          // BubbleContent / RiverBubbleContent / MeeshyMessage
            "entry.descriptor",     // SummaryProtectionEntry
        ]
        for mode in ReadingModeOrchestrator.ConversationReadingMode.allCases {
            let path = ReadingModeProtectionChrome.rendererPath(for: mode)
            let code = try source(at: path)
            XCTAssertTrue(
                resolvedSources.contains(where: code.contains),
                """
                Le mode « \(mode.rawValue) » monte un chrome dont le descripteur \
                n'est pas résolu par le site unique. `\(path)` doit lire la \
                projection de `MeeshyMessage.protection` — une vue qui compose \
                son propre descripteur réécrit la règle d'échéance du contrat \
                #7451, et c'est précisément ainsi que trois lectures différentes \
                de `expiresAt` ont coexisté.
                """
            )
        }
    }

    // MARK: - Plus aucun minuteur par cellule

    func test_aucuneCelluleNeFaitTournerSonPropreMinuteurÉphémère() throws {
        // Le décompte bat côté système (`Text(timerInterval:)`) et la
        // disparition est ordonnancée UNE fois pour tout le fil
        // (`EphemeralExpiryCoordinator`). Un `Timer.publish` réintroduit dans
        // une cellule de message ferait exactement ce que ce lot a retiré :
        // un réveil du MainActor par seconde et par éphémère à l'écran.
        let watched = [
            "Features/Main/Views/Bubble/BubbleStandardLayout.swift",
            "Features/Main/Views/ThemedMessageBubble.swift",
            "Features/Main/Focal/Row/FocalRow.swift",
            "Features/Main/Riviere/View/RiverBubbleView.swift",
            "Features/Main/Focal/Summary/SummaryProtectionsView.swift",
        ]
        for path in watched {
            let code = try source(at: path)
            XCTAssertFalse(
                code.contains("Timer.publish"),
                "`\(path)` fait tourner un minuteur de cellule. Le décompte est rendu par "
                    + "`Text(timerInterval:)` et la disparition par `EphemeralExpiryCoordinator`."
            )
        }
    }

    // MARK: - Un pictogramme par sens

    func test_lesPictogrammesDeProtection_sontCeuxDuComposeur() throws {
        // `flame` désignait la VUE UNIQUE dans la liste et l'ÉPHÉMÈRE dans la
        // bulle : un même pictogramme pour deux sens, et aucun des deux
        // n'était celui que l'utilisateur voit quand il CHOISIT la protection.
        XCTAssertEqual(MessageProtectionSymbols.ephemeral, "hourglass")
        XCTAssertEqual(MessageProtectionSymbols.viewOnce, "1.circle")
        XCTAssertEqual(MessageProtectionSymbols.blurred, "eye.slash")

        let composer = try source(at: "Features/Main/Components/EffectsPickerView.swift")
        for symbol in [MessageProtectionSymbols.ephemeral,
                       MessageProtectionSymbols.viewOnce,
                       MessageProtectionSymbols.blurred] {
            XCTAssertTrue(
                composer.contains("\"\(symbol)\""),
                "« \(symbol) » n'est plus le pictogramme du composeur. Le vocabulaire "
                    + "d'AFFICHAGE est celui du CHOIX : les deux doivent bouger ensemble."
            )
        }
    }
}
