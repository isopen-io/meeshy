import XCTest
@testable import Meeshy

/// D-1 (§2.3 Q142-b, contrat `tasks/lentille-implementation-contract.md:522`
/// « Dynamic Type `.accessibility5` sans troncature sur les 8 branches de
/// contenu du rang ») — le harnais existait déjà (`FocalDynamicTypeTests`,
/// `MeeshyTests/Unit/Focal/FocalDynamicTypeTests.swift`) mais n'avait jamais
/// été pointé sur `LentilleConversationRow` (0 fichier sous
/// `MeeshyTests/Unit/Lentille` ne citait `DynamicTypeSize`/`accessibility5`
/// avant ce fichier — grep re-joué au moment d'écrire ce commentaire).
///
/// **Les 8 branches, réalité du code (pas l'exemple générique de la
/// mission).** `tasks/lentille-workshop-execution.md:262` (Q-142) les nomme
/// explicitement : « 8 branches de LIGNE 2 » — pas huit zones disjointes du
/// rang (titre/pilule/badges/…), mais les huit chemins de code atteignables
/// par `LentilleConversationRow.line2` (`LentilleConversationRow.swift:385-404`) :
/// `Line2Kind.resolve` (`:369-374`) choisit entre trois cas (`typing`,
/// `draft`, `bridge`), et le quatrième cas (`preview`) se subdivise à son
/// tour sur `LastMessageSummaryKind` (SDK, gelé — `standard`, `hidden`,
/// `viewOnce`, `expired`, `ephemeralActive`, 5 cas) dans `previewLine`
/// (`:449-496`). 3 + 5 = 8 — exactement le compte cité par Q-142.
///
/// **Écart de méthode assumé vs un montage réel — MÊME motif que
/// `FocalDynamicTypeTests` (voir son en-tête, `:4-26`).** Aucune toolchain
/// Swift ici (Linux, R5) : impossible de monter `LentilleConversationRow`
/// dans un vrai `UIHostingController`/`UIWindow` et d'y vérifier
/// `.accessibility5` par la marche de `UILabel` que fait
/// `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Accessibility/DynamicTypeTests.swift`
/// (`mount(_:size:)`/`renderAndCollectLabels`/`assertNoTruncation`, hors
/// cible `Meeshy`, `@testable import` impossible depuis ce fichier). Ce
/// fichier applique donc le MÊME esprit par une garde de SOURCE, à
/// l'identique de `FocalDynamicTypeTests` : une branche = une preuve de sa
/// politique de troncature, RÉELLE, pas déduite.
///
/// **La politique n'est PAS celle de Focal — et c'est attendu.** `FocalRow`
/// est une carte qui s'étire (aucun `.lineLimit` sur son texte, §7 « la
/// rangée s'étire »). `LentilleConversationRow` est un rang **plat, hauteur
/// FIXE** (`.frame(height: LentilleMetrics.Row.height)`,
/// `LentilleConversationRow.swift:123` — `LentilleMetrics.Row.height == 64`,
/// `LentilleMetrics.swift:28`) : il ne peut pas s'étirer verticalement sans
/// chevaucher la rangée suivante de la liste. Les 8 branches de ligne 2
/// appliquent donc TOUTES `.lineLimit(1)`, en politique délibérée et
/// UNIFORME — exactement le même statut que la branche 7 (réponse citée) de
/// `FocalDynamicTypeTests` (`.lineLimit(1)` documenté, pas un oubli). « Sans
/// troncature » se vérifie ici au niveau du RANG, pas du glyphe : aucun
/// fichier de `Lentille/Row/` ne pose `.clipped()` (vérifié ci-dessous) — la
/// ligne 2 tronque proprement par ellipse SwiftUI à 1 ligne, à
/// `.accessibility5` comme à toute taille, mais rien ne rogne un glyphe à
/// mi-hauteur ni ne fait disparaître la ligne entière.
///
/// **Capacité de RED.** Chaque test ci-dessous compte les occurrences
/// EXACTES de `.lineLimit(1)` sur la branche qu'il couvre. Si une future
/// édition de `LentilleConversationRow.swift` retire le `.lineLimit(1)`
/// d'UNE branche (par ex. en pensant « corriger » la troncature d'après la
/// lettre du contrat), cette branche passerait en multi-ligne libre à
/// `.accessibility5` dans un rang dont le conteneur reste figé à 64pt — elle
/// chevaucherait visuellement la rangée suivante de la liste, un défaut
/// PIRE que l'ellipse à une ligne qu'elle remplacerait ; le test de cette
/// branche rougirait (compte tombé à 0). Symétriquement, un `.lineLimit(1)`
/// dupliqué (compte à 2) ou un `.clipped()` ajouté sur le rang (glyphe rogné
/// à mi-hauteur) ferait aussi rougir la suite.
final class LentilleRowDynamicTypeTests: XCTestCase {

    // MARK: - Lecture de source

    private func rowRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Lentille
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Lentille/Row")
    }

    private func source(_ fileName: String) throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: rowRoot().appendingPathComponent(fileName), encoding: .utf8))
    }

    private func body(of functionSignature: String, in code: String, file: StaticString = #filePath, line: UInt = #line) throws -> Substring {
        guard let start = code.range(of: functionSignature),
              let end = code.range(of: "\n    }", range: start.upperBound..<code.endIndex)
        else {
            XCTFail("le corps de « \(functionSignature) » est introuvable — la structure a-t-elle changé ?", file: file, line: line)
            return code[code.startIndex..<code.startIndex]
        }
        return code[start.lowerBound..<end.lowerBound]
    }

    private func lineLimitOneCount(_ text: Substring) -> Int {
        text.components(separatedBy: ".lineLimit(1)").count - 1
    }

    // MARK: - Garde d'ensemble : aucun `.clipped()` dans Lentille/Row/
    //
    // Prémisse dont dépendent les 8 tests de branche ci-dessous : le rang à
    // hauteur fixe (64) ne CLIPPE pas son contenu — SwiftUI `.frame(height:)`
    // seul ne rogne rien, contrairement à `.frame(...).clipped()`. Si ce
    // fichier venait à ajouter `.clipped()`, la troncature cesserait d'être
    // une ellipse lisible (politique documentée ci-dessus) pour devenir un
    // rognage de glyphe à mi-hauteur — exactement ce que « sans troncature »
    // interdit.

    func test_noClipped_anywhereInLentilleRow() throws {
        for fileName in ["LentilleConversationRow.swift", "LentilleBridgeLine.swift"] {
            let code = try source(fileName)
            XCTAssertFalse(
                code.contains(".clipped()"),
                "\(fileName) pose `.clipped()` — le rang à hauteur fixe (64, LentilleMetrics.Row.height) " +
                "rognerait alors un glyphe à mi-hauteur à .accessibility5 au lieu de tronquer proprement " +
                "par ellipse à 1 ligne (politique documentée des 8 branches de ligne 2)."
            )
        }
    }

    // MARK: - Branches 1 & 2 : typing / draft (précédence la plus haute, même fichier)

    /// `typingLine` (LentilleConversationRow.swift:406-417) : « X écrit… »
    /// tronque à une ligne — politique documentée, la ligne 2 ne peut pas
    /// pousser un rang à hauteur fixe.
    func test_typingBranch_appliesExactlyOneDocumentedLineLimit() throws {
        let code = try source("LentilleConversationRow.swift")
        let text = try body(of: "private var typingLine: some View {", in: code)
        XCTAssertEqual(
            lineLimitOneCount(text), 1,
            "LentilleConversationRow.typingLine doit tronquer À UNE LIGNE (politique documentée, " +
            "rang à hauteur fixe LentilleMetrics.Row.height) — ni 0 (croissance libre dans un " +
            "conteneur figé, chevauchement de la rangée suivante à .accessibility5), ni 2 " +
            "(troncature accidentelle supplémentaire)."
        )
    }

    /// `draftLine` (LentilleConversationRow.swift:419-433) : le préfixe
    /// « Brouillon » ne tronque jamais (glyphe fixe court, jamais de contenu
    /// utilisateur) ; SEUL `draft.previewText` tronque à une ligne.
    func test_draftBranch_appliesExactlyOneDocumentedLineLimit() throws {
        let code = try source("LentilleConversationRow.swift")
        let text = try body(of: "private func draftLine(_ draft: DraftSummary) -> some View {", in: code)
        XCTAssertEqual(
            lineLimitOneCount(text), 1,
            "LentilleConversationRow.draftLine doit tronquer draft.previewText À UNE LIGNE " +
            "(politique documentée) — ni 0, ni 2."
        )
    }

    // MARK: - Branche 3 : pont ✦ (fichier délégué, jamais réédité par ce lot)

    /// `line2` route `.bridge` vers `LentilleBridgeLine` sans lui superposer
    /// de `.lineLimit` propre (LentilleConversationRow.swift:392-400) ; la
    /// troncature à une ligne vit dans le fichier délégué lui-même
    /// (`LentilleBridgeLine.swift`), sur le texte résolu ET sur le compteur
    /// partiel (deux `Text` possibles selon `bridge.isComplete`).
    func test_bridgeBranch_delegatesWithoutAddingALineLimit_andBridgeLineDocumentsItsOwn() throws {
        let rowCode = try source("LentilleConversationRow.swift")
        let muxText = try body(of: "private var line2: some View {", in: rowCode)
        XCTAssertFalse(
            muxText.contains(".lineLimit("),
            "LentilleConversationRow.line2 pose un `.lineLimit` sur le cas .bridge — la politique de " +
            "troncature du pont vit dans LentilleBridgeLine.swift, jamais superposée ici."
        )

        let bridgeCode = try source("LentilleBridgeLine.swift")
        XCTAssertEqual(
            lineLimitOneCount(Substring(bridgeCode)), 2,
            "LentilleBridgeLine.swift doit tronquer EXACTEMENT deux Text à une ligne (le texte résolu " +
            "du pont, et le compteur partiel affiché quand bridge.isComplete == false) — politique " +
            "documentée, pas une troncature accidentelle supplémentaire ni une régression qui en " +
            "aurait retiré une."
        )
    }

    // MARK: - Branche 4 : la préview composée (#7548)

    /// La préview n'a plus de branches dans la rangée : `ConversationPreviewLine`
    /// peint UN `Text` composé par le SDK (auteur, glyphe, corps), borné par le
    /// `lineLimit` que la rangée lui passe — une ligne au repos, deux sous la
    /// loupe, jamais libre (rang à hauteur fixe).
    func test_previewBranch_passesItsLineLimit_andTheSharedLineHonoursIt() throws {
        let code = try source("LentilleConversationRow.swift")
        let text = try body(of: "private var previewLine: some View {", in: code)
        XCTAssertTrue(
            text.contains("lineLimit: isMagnified ? 2 : 1"),
            "La préview tronque à UNE ligne au repos, DEUX sous la loupe — jamais libre."
        )

        let lineURL = rowRoot()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Views/ConversationPreviewLine.swift")
        let line = AppSourceGuard.stripComments(try String(contentsOf: lineURL, encoding: .utf8))
        XCTAssertTrue(line.contains(".lineLimit(lineLimit)"), "ConversationPreviewLine doit appliquer la borne reçue.")
        XCTAssertFalse(line.contains(".clipped()"), "ConversationPreviewLine ne rogne jamais un glyphe à mi-hauteur.")
    }
}
