import XCTest
import SwiftUI
import MeeshyUI
@testable import Meeshy

/// F-083 (WS-4) — cotes EXCLUSIVEMENT via `FocalMetrics` (mandat de tâche) :
/// (1) la table `focal-implementation-contract.md` §WS-4 est croisée
/// littéralement contre `FocalMetrics` (indépendamment de la parité JSON
/// déjà prouvée par `FocalMetricsTests`, tâche 0 — celle-ci pinne le texte
/// du CONTRAT, celle-là le TOKEN) ; (2) garde source : les cotes `29`
/// (retrait) et `22` (pastille) n'apparaissent JAMAIS en littéral autonome
/// dans les fichiers consommateurs `Focal/Row/*.swift` — SEULEMENT via
/// `FocalMetrics.Text.indent`/`FocalMetrics.Avatar.size`.
@MainActor
final class FocalRowMetricsTests: XCTestCase {

    // MARK: - Table du contrat §WS-4, croisée littéralement

    func test_contractTable_avatar22() {
        XCTAssertEqual(FocalMetrics.Avatar.size, 22)
    }

    func test_contractTable_name13Heavy() {
        XCTAssertEqual(FocalMetrics.Name.size, 13)
        XCTAssertEqual(FocalMetrics.Name.weight, .heavy)
    }

    func test_contractTable_time12Medium600() {
        // « Heure 12, medium » (texte du contrat) mappe sur le poids CSS 600
        // du token thread.time (`FocalMetricsTests.test_time`) → `.semibold`
        // côté SwiftUI (600 dans l'échelle 100…900), PAS `Font.Weight.medium`
        // (500) — le mot « medium » du contrat est un adjectif de langage
        // courant, pas le nom du cas `Font.Weight.medium`. Écart de
        // vocabulaire signalé, le TOKEN (600 → .semibold) fait foi.
        XCTAssertEqual(FocalMetrics.Time.size, 12)
        XCTAssertEqual(FocalMetrics.Time.weight, .semibold)
    }

    func test_contractTable_text15() {
        XCTAssertEqual(FocalMetrics.Text.size, MeeshyFont.bodySize)
        XCTAssertEqual(FocalMetrics.Text.size, 15)
    }

    func test_contractTable_indent29() {
        XCTAssertEqual(FocalMetrics.Text.indent, 29)
    }

    func test_contractTable_lineSpacing1_42() {
        XCTAssertEqual(FocalMetrics.Text.lineHeightRatio, 1.42)
    }

    func test_contractTable_mediaRadius16() {
        XCTAssertEqual(FocalMetrics.Media.radius, 16)
    }

    // MARK: - Densité Script — la même rangée, zéro perspective

    func test_focalRowInput_density_hasExactlyTwoUniformCases() {
        // Exhaustivité de compilation : si un 3ᵉ cas apparaissait un jour
        // (ex. `.summary`), ce `switch` cesserait de compiler sans `default`
        // — aucun `default` ici, intentionnellement, pour que la garde
        // casse au bon endroit (le fichier, pas un test qui l'ignore).
        func widthClass(_ d: FocalRowInput.Density) -> String {
            switch d {
            case .focal: return "flat"
            case .script: return "flat"
            }
        }
        XCTAssertEqual(widthClass(.focal), widthClass(.script), "même rangée, densité uniforme (contrat §3.1 usesFlatRow)")
    }

    // MARK: - Garde source : cotes EXCLUSIVEMENT via FocalMetrics

    private func source(_ fileName: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Focal/Row/\(fileName)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private static let rowFiles = [
        "FocalRow.swift",
        "FocalIdentityHeader.swift",
        "FocalMetaRow.swift",
        "FocalAttachmentBlock.swift",
        "FocalQuotedReplyView.swift",
        "FocalConversationStartRow.swift"
    ]

    /// Jeton numérique isolé (`\b…\b`), pas une sous-chaîne — même mécanique
    /// que `ScrollTimePillSourceGuardTests.containsStandaloneNumericLiteral`.
    private func containsStandaloneNumericLiteral(_ literal: String, in text: String) -> Bool {
        let pattern = "\\b\(NSRegularExpression.escapedPattern(for: literal))\\b"
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return false }
        return regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
    }

    func test_rowFiles_neverHardcodeIndent29AsALiteral() throws {
        for fileName in Self.rowFiles {
            let stripped = AppSourceGuard.stripComments(try source(fileName))
            XCTAssertFalse(
                containsStandaloneNumericLiteral("29", in: stripped),
                "\(fileName) contient le littéral « 29 » — le retrait doit venir de FocalMetrics.Text.indent"
            )
        }
    }

    /// **Recalibré — déplacé par `0c619a98` (« la magnification ne change plus
    /// la hauteur de la cellule — fin des sauts au défilement »), l'invariant
    /// est inchangé : tout retrait vient d'une cote NOMMÉE, jamais d'un
    /// littéral.**
    ///
    /// Ce commit a rendu le retrait de `FocalRow` CONSTANT. Le raisonnement
    /// est le même que pour le « 15 → 16 » abandonné juste à côté : le retrait
    /// fixe la largeur disponible, donc le retour à la ligne, donc la hauteur ;
    /// le faire varier avec l'élection faisait changer la cellule de taille au
    /// basculement, et toute la liste sautait. La valeur retenue pour TOUTES
    /// les rangées est celle de l'élue — `FocalMetrics.Focus.textIndent`
    /// (`avatarSize + 7` = 41), la seule qui laisse la place à la pastille de
    /// 34 que l'en-tête réserve désormais en permanence.
    ///
    /// `FocalRow` a donc changé de COTE, pas de discipline : les deux sont
    /// nommées dans `FocalMetrics`, aucune n'est un littéral. Le témoin
    /// attend maintenant la cote propre à chaque fichier plutôt qu'une seule
    /// pour tous — c'est plus strict que l'ancienne rédaction, qui aurait
    /// accepté n'importe lequel des deux retraits n'importe où.
    func test_rowFiles_thatIndent_referenceTheirNamedIndentCote() throws {
        // Seuls les fichiers qui posent RÉELLEMENT un retrait sous l'avatar
        // (texte/citation/média/méta) le font via une cote partagée.
        // `FocalIdentityHeader` (l'avatar LUI-MÊME définit le retrait des
        // rangées suivantes, il ne s'indente pas sous lui-même) et
        // `FocalConversationStartRow` (rangée centrée) en sont exclus.
        let indentedFiles = [
            // Retrait CONSTANT au gabarit de l'élue depuis `0c619a98` : la
            // pastille de 34 est réservée en permanence.
            "FocalRow.swift": "FocalMetrics.Focus.textIndent",
            // Rangées satellites : toujours alignées sur la pastille de 22.
            "FocalMetaRow.swift": "FocalMetrics.Text.indent",
            "FocalAttachmentBlock.swift": "FocalMetrics.Text.indent",
            "FocalQuotedReplyView.swift": "FocalMetrics.Text.indent",
        ]
        for (fileName, cote) in indentedFiles {
            let stripped = AppSourceGuard.stripComments(try source(fileName))
            XCTAssertTrue(
                stripped.contains(cote),
                "\(fileName) doit poser son retrait via \(cote) — une cote NOMMÉE de FocalMetrics, jamais un littéral (garde R15)."
            )
        }
    }

    func test_focalIdentityHeader_neverHardcodesAvatarSize22AsALiteral() throws {
        let stripped = AppSourceGuard.stripComments(try source("FocalIdentityHeader.swift"))
        XCTAssertFalse(
            containsStandaloneNumericLiteral("22", in: stripped),
            "FocalIdentityHeader.swift ne doit pas écrire la taille de pastille en dur — FocalMetrics.Avatar.size"
        )
        XCTAssertTrue(stripped.contains("FocalMetrics.Avatar.size"))
    }

    // MARK: - Règle #9 du contrat : « aucune police fixe »

    func test_rowFiles_neverUseSystemFontDirectly() throws {
        for fileName in Self.rowFiles {
            let stripped = AppSourceGuard.stripComments(try source(fileName))
            XCTAssertFalse(
                stripped.contains(".font(.system(size:"),
                "\(fileName) : `.font(.system(size:))` est interdit dans Focal/** (contrat §8, règle 9) — utiliser MeeshyFont.relative"
            )
        }
    }
}
