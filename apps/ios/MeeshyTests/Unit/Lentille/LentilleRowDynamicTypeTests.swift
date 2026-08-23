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

    // MARK: - Branches 4, 5, 6 : previewLine — expired / hidden / viewOnce
    // (LastMessageSummaryKind, SDK gelé — 3 des 5 cas ; les 2 restants,
    // ephemeralActive/standard, partagent standardPreview ci-dessous)

    func test_expiredBranch_appliesExactlyOneDocumentedLineLimit() throws {
        let code = try source("LentilleConversationRow.swift")
        let text = try body(of: "private var previewLine: some View {", in: code)
        guard let start = text.range(of: "case .expired:"),
              let end = text.range(of: "\n        case .hidden:")
        else {
            XCTFail("le cas .expired de previewLine est introuvable — la structure a-t-elle changé ?")
            return
        }
        XCTAssertEqual(
            lineLimitOneCount(text[start.lowerBound..<end.lowerBound]), 1,
            "previewLine, cas .expired, doit tronquer « message.expired » À UNE LIGNE (politique " +
            "documentée) — ni 0, ni 2."
        )
    }

    func test_hiddenBranch_appliesExactlyOneDocumentedLineLimit() throws {
        let code = try source("LentilleConversationRow.swift")
        let text = try body(of: "private var previewLine: some View {", in: code)
        guard let start = text.range(of: "case .hidden:"),
              let end = text.range(of: "\n        case .viewOnce:")
        else {
            XCTFail("le cas .hidden de previewLine est introuvable — la structure a-t-elle changé ?")
            return
        }
        XCTAssertEqual(
            lineLimitOneCount(text[start.lowerBound..<end.lowerBound]), 1,
            "previewLine, cas .hidden, doit tronquer « conversation.summary.hidden » À UNE LIGNE " +
            "(politique documentée) — ni 0, ni 2."
        )
    }

    func test_viewOnceBranch_appliesExactlyOneDocumentedLineLimit() throws {
        let code = try source("LentilleConversationRow.swift")
        let text = try body(of: "private var previewLine: some View {", in: code)
        guard let start = text.range(of: "case .viewOnce:"),
              let end = text.range(of: "\n        case .ephemeralActive:")
        else {
            XCTFail("le cas .viewOnce de previewLine est introuvable — la structure a-t-elle changé ?")
            return
        }
        XCTAssertEqual(
            lineLimitOneCount(text[start.lowerBound..<end.lowerBound]), 1,
            "previewLine, cas .viewOnce, doit tronquer « conversation.summary.view_once » À UNE " +
            "LIGNE (politique documentée) — ni 0, ni 2."
        )
    }

    // MARK: - Branches 7 & 8 : ephemeralActive / standard (même fichier, même
    // politique — les deux routent vers `standardPreview`, seul l'icône
    // horloge diffère)

    /// `previewLine` route .ephemeralActive et .standard vers LA MÊME
    /// fonction `standardPreview(showEphemeralIcon:)` (LentilleConversationRow.swift:490-494) —
    /// même chemin de code que les branches 1&2 / 4&5 de FocalDynamicTypeTests
    /// (une paire de cas, un seul test).
    func test_ephemeralActiveAndStandardBranches_routeToTheSameStandardPreview() throws {
        let code = try source("LentilleConversationRow.swift")
        let text = try body(of: "private var previewLine: some View {", in: code)
        XCTAssertTrue(
            text.contains("case .ephemeralActive:") && text.contains("standardPreview(showEphemeralIcon: true)"),
            "previewLine doit router .ephemeralActive vers standardPreview(showEphemeralIcon: true)."
        )
        XCTAssertTrue(
            text.contains("case .standard:") && text.contains("standardPreview(showEphemeralIcon: false)"),
            "previewLine doit router .standard vers standardPreview(showEphemeralIcon: false)."
        )
    }

    /// `standardPreview` (LentilleConversationRow.swift:498-554) — quatre
    /// issues (texte / pièce jointe / position / vide) ; SEULES les trois
    /// issues à contenu variable tronquent à une ligne (texte du message,
    /// libellé court de pièce jointe, nom de lieu) — l'issue vide (fallback
    /// `Text("")`) ne porte aucun `.lineLimit`, rien à tronquer.
    ///
    /// **2026-08-23** — la première des trois (le texte du message) est
    /// devenue CONDITIONNELLE : `.lineLimit(isMagnified ? 2 : 1)`. La
    /// politique est inchangée au repos — c'est le même rang à hauteur fixe,
    /// tronqué à une ligne — et la magnification lui en accorde une seconde,
    /// dans une enveloppe elle aussi fixe (`FocusInline.height`). Le témoin
    /// compte donc deux `.lineLimit(1)` littéraux plus cette forme ternaire,
    /// et vérifie explicitement qu'aucune des trois issues à contenu variable
    /// n'a perdu sa borne.
    func test_standardPreviewBody_appliesExactlyThreeDocumentedLineLimits() throws {
        let code = try source("LentilleConversationRow.swift")
        let text = try body(of: "private func standardPreview(showEphemeralIcon: Bool) -> some View {", in: code)
        XCTAssertTrue(
            text.contains(".lineLimit(isMagnified ? 2 : 1)"),
            "Le texte du message tronque à UNE ligne au repos, DEUX sous la loupe — jamais libre."
        )
        XCTAssertEqual(
            lineLimitOneCount(text), 2,
            "standardPreview doit tronquer EXACTEMENT deux Text à une ligne EN DUR (libellé de " +
            "pièce jointe, nom de lieu) — le texte du message, lui, porte la forme ternaire " +
            "vérifiée juste au-dessus, politique documentée, rang à hauteur fixe — " +
            "ni moins (croissance libre dans un conteneur figé à .accessibility5), ni plus " +
            "(troncature accidentelle supplémentaire, par ex. sur senderLabel qui a SA PROPRE " +
            "politique testée séparément ci-dessous)."
        )
    }

    /// `senderLabel` (LentilleConversationRow.swift:556-566), consommé par
    /// `standardPreview` ET par les branches .hidden/.viewOnce ci-dessus —
    /// tronque à une ligne, comme tout nom affiché sur le rang (même
    /// politique que `headerLine`'s `conversation.displayName`, hors
    /// périmètre ligne 2 mais même discipline).
    func test_senderLabel_appliesExactlyOneDocumentedLineLimit() throws {
        let code = try source("LentilleConversationRow.swift")
        let text = try body(of: "private var senderLabel: some View {", in: code)
        XCTAssertEqual(
            lineLimitOneCount(text), 1,
            "senderLabel doit tronquer le nom d'expéditeur À UNE LIGNE (politique documentée) — " +
            "ni 0, ni 2."
        )
    }
}
