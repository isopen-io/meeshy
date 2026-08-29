import XCTest
@testable import Meeshy

/// Chrome de la rangée Lentille — directive produit du 2026-08-22 (soir) :
/// « dans les rangées normales, pas de contour sur le dernier message, juste
/// "auteur : message", puis en dessous, sur une nouvelle ligne à droite, la
/// date (qui garde cette place en magnificence) ; la pile de non-lus toujours
/// sur fond rouge, magnificence comprise ; la pile d'effectif en bas à droite
/// SUR la bordure, jamais dans le contenu, repos compris ».
///
/// Gardes de FORME (lecture du source, comme `LentilleFocusCardTests`) +
/// règles pures.
///
/// **2026-08-23 — une seule vue, deux états.** Repos ET magnificence sont
/// désormais `LentilleConversationRow` (Row/), selon que son paramètre
/// `magnification` est `nil` ou non ; `Lentille/Mode/` ne porte plus que les
/// trois pastilles actionnables (mode, catégorie, étiquette) et l'effectif.
/// Les témoins qui gardaient « deux vues, une même grammaire » deviennent donc
/// des témoins de NON-DUPLICATION : ce qui garantissait l'accord des deux
/// vues, c'est qu'il n'y en a plus qu'une.
final class LentilleRowChromeTests: XCTestCase {

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private func source(_ relative: String) throws -> String {
        try String(contentsOf: Self.iosRoot.appendingPathComponent(relative), encoding: .utf8)
    }

    private func rowSource() throws -> String { try source("Meeshy/Features/Main/Lentille/Row/LentilleConversationRow.swift") }
    private func skeletonSource() throws -> String { try source("Meeshy/Features/Main/Lentille/Row/LentilleSkeletonRow.swift") }
    private func magnificationSource() throws -> String { try source("Meeshy/Features/Main/Lentille/Mode/LentilleMagnification.swift") }

    /// Le corps d'une déclaration, de son en-tête à la prochaine déclaration
    /// de même niveau. Une garde de forme doit viser le BLOC, jamais le
    /// FICHIER : la rangée contient légitimement un `strokeBorder` (l'anneau
    /// d'avatar) et une `Capsule` (le bouton « Rejoindre » d'un appel en
    /// cours) — les interdire globalement condamnait deux innocents.
    private func block(_ header: String, in code: String) throws -> Substring {
        let start = try XCTUnwrap(code.range(of: header), "\(header) introuvable")
        let rest = code[start.upperBound...]
        let end = rest.range(of: "\n    private var ")?.lowerBound
            ?? rest.range(of: "\n    private func ")?.lowerBound
            ?? rest.range(of: "\n    nonisolated static func ")?.lowerBound
            ?? rest.endIndex
        return code[start.lowerBound..<end]
    }

    private func viewBlock(_ name: String, in code: String) throws -> Substring {
        try block("private var \(name): some View {", in: code)
    }

    // MARK: - « auteur : message » (repos ET magnificence)

    func test_authorPrefix_isNameColonSpace_orNothing() {
        XCTAssertEqual(LentilleConversationRow.authorPrefix(name: "Andre Tabeth"), "Andre Tabeth : ")
        XCTAssertNil(LentilleConversationRow.authorPrefix(name: ""))
        XCTAssertNil(LentilleConversationRow.authorPrefix(name: "   "))
        XCTAssertNil(LentilleConversationRow.authorPrefix(name: nil))
    }

    func test_flatRow_textPreview_isOneText_authorColonMessage_noOutline() throws {
        let code = try rowSource()
        XCTAssertTrue(code.contains("(senderPrefix + Text(resolvedPreviewText)"), "« Auteur : texte » en UN seul texte, comme la carte")
        XCTAssertTrue(code.contains("LentilleConversationRow.authorPrefix(name:") || code.contains("Self.authorPrefix(name:"), "le préfixe vient de la règle pure")
        let preview = try block("private func standardPreview(showEphemeralIcon: Bool) -> some View {", in: code)
        for outline in ["strokeBorder", ".border(", "RoundedRectangle", "background("] {
            XCTAssertFalse(preview.contains(outline), "aucun contour ni fond sur le dernier message au repos (« \(outline) »)")
        }
    }

    /// **SUPERSÈDE** `test_focusCard_previewUsesTheSameAuthorPrefixRule`.
    /// La règle « auteur : » ne peut plus DIVERGER entre repos et
    /// magnificence : il n'y a plus qu'une vue pour les deux. Ce témoin garde
    /// la propriété qui rend cela vrai — `Lentille/Mode/` ne réécrit aucun
    /// aperçu.
    func test_theMagnifiedPreview_cannotDiverge_becauseThereIsOnlyOneView() throws {
        let mode = try magnificationSource()
        XCTAssertFalse(mode.contains("authorPrefix"), "aucune seconde règle « auteur : » dans Lentille/Mode/")
        XCTAssertFalse(mode.contains("senderPrefix"))
        XCTAssertTrue(
            try rowSource().contains(".lineLimit(isMagnified ? 2 : 1)"),
            "… la magnification ne fait qu'élargir l'aperçu de la MÊME vue : une ligne au repos, deux sous la loupe."
        )
    }

    // MARK: - La date : seule, en dessous, à droite — repos ET magnificence

    func test_flatRow_dateLeavesTheHeaderLine_andSitsAloneTrailingBelow() throws {
        let code = try rowSource()
        let header = try viewBlock("headerLine", in: code)
        XCTAssertFalse(header.contains("LentilleRowTimestamp("), "plus d'heure sur la ligne du nom")
        // Les DEUX écritures du séparateur : la littérale et `MetaSeparator`, qui
        // l'a remplacée au 251i. Une garde NÉGATIVE restée sur l'ancien nom ne
        // rougit pas quand le nom change — elle passe au vert en cessant de voir.
        for spelling in ["Text(\"·\")", "MetaSeparator("] {
            XCTAssertFalse(header.contains(spelling),
                           "plus de séparateur « · » sur la ligne du nom (graphie « \(spelling) »)")
        }
        let date = try viewBlock("dateLine", in: code)
        let spacer = try XCTUnwrap(date.range(of: "Spacer(minLength: 0)"))
        let stamp = try XCTUnwrap(date.range(of: "timestampText"))
        XCTAssertLessThan(spacer.lowerBound, stamp.lowerBound, "la date est poussée à DROITE de sa ligne")
        XCTAssertTrue(code.contains("headerLine\n                line2\n                dateLine"), "ordre : nom, message, date")
    }

    /// « La date gardera cette place même en magnificence » — désormais
    /// littéralement : c'est la MÊME ligne, au même endroit, dont seule la
    /// précision change.
    func test_magnifiedDate_keepsTheExactSamePlace_onlyItsPrecisionChanges() throws {
        let code = try rowSource()
        let stamp = try viewBlock("timestampText", in: code)
        XCTAssertTrue(stamp.contains("LentilleFocusCard.fullTimestamp("), "date complète sous la loupe")
        XCTAssertTrue(stamp.contains("LentilleRowTimestamp(date: conversation.lastMessageAt)"), "relatif court au repos")
        let header = try viewBlock("headerLine", in: code)
        XCTAssertFalse(header.contains("fullTimestamp("), "ni l'une ni l'autre sur la ligne du nom")
    }

    func test_skeleton_mirrorsTheDateLine() throws {
        let code = try skeletonSource()
        XCTAssertTrue(code.contains("LentilleMetrics.Time.font"), "le squelette réserve la ligne de date")
        XCTAssertTrue(code.contains("Spacer(minLength: 0)"), "… à droite, comme la rangée réelle")
    }

    func test_rowHeight_fitsThreeLines() {
        // nom (corps) + message (sous-titre) + date (12) + rembourrage : 64 ne
        // logeait que deux lignes. L'effectif ayant quitté le bord bas, la
        // rangée n'a plus à réserver sa place — 84 loge les trois lignes.
        XCTAssertGreaterThanOrEqual(LentilleMetrics.Row.height, 72)
        XCTAssertGreaterThan(LentilleMetrics.FocusCard.height, LentilleMetrics.Row.height)
    }

    // MARK: - Non-lus : rouge, toujours

    /// UN seul badge de non-lus dans tout le chantier — et deux lots l'ont
    /// obtenu par les deux bouts, en se croisant :
    ///
    /// - en amont, le rang a cessé de peindre son chrome et monte l'ATOME
    ///   PARTAGÉ `UnreadCountBadge` (matrice L06) ; le rouge sémantique et
    ///   l'interdit `fill(accent)` sont vérifiés chez l'atome
    ///   (`UnreadCountBadgeTests`), où l'assertion a MIGRÉ ;
    /// - ici, la carte de magnification a été dissoute (2026-08-23), donc la
    ///   seconde copie que l'amont laissait vivre « migration non décidée »
    ///   n'existe plus du tout.
    ///
    /// Ce qui reste à garder, et que ni l'atome ni l'amont ne disent : que
    /// `Lentille/Mode/` ne se remette pas à en peindre un.
    func test_unreadBadge_existsOnce_theRowMountsTheSharedAtom_andModeRepaintsNothing() throws {
        let row = try rowSource()
        XCTAssertEqual(
            row.components(separatedBy: "UnreadCountBadge(").count - 1, 1,
            "UN seul montage de l'atome dans le rang — magnifié ou au repos, c'est la même vue."
        )
        XCTAssertFalse(
            row.contains("private var unreadBadge: some View {"),
            "… et plus aucune copie locale du chrome : elle a migré dans l'atome."
        )
        XCTAssertFalse(
            try magnificationSource().contains("unreadBadgeBackground"),
            "Lentille/Mode/ ne repeint aucun badge de non-lus : la rangée le porte, magnifiée ou non."
        )
    }

    // MARK: - Effectif : sur la bordure, jamais dans le contenu — repos compris

    /// **Décision produit du 2026-08-22 (soir)** : « enlever l'effectif sur
    /// les rows non magnifiées, mais mettre le chip rouge si messages non
    /// lus ». L'effectif est une information de MAGNIFICATION — la rangée au
    /// repos dit qui parle, ce qui a été dit, et quand ; la loupe ajoute
    /// l'effectif et la date complète.
    ///
    /// Ce témoin est le RENVERSEMENT assumé de celui qui, quelques heures
    /// plus tôt, exigeait l'effectif au bord bas de la rangée.
    func test_memberCount_appearsOnlyUnderMagnification_andIsAControl() throws {
        let code = try rowSource()
        XCTAssertFalse(code.contains("memberCountBadge"), "l'effectif ne s'affiche pas au repos")
        XCTAssertFalse(code.contains("conversation.memberCount"), "… sa donnée non plus : elle vit dans la pastille")
        XCTAssertFalse(code.contains(".overlay(alignment: .bottomTrailing) {"), "plus d'ancrage de bord dans la rangée")
        // Il n'apparaît que gardé par la magnification, sur la ligne de date.
        let date = try viewBlock("dateLine", in: code)
        XCTAssertTrue(date.contains("LentilleMemberCountChip("), "il vit sur la ligne de date de la rangée magnifiée")
        XCTAssertTrue(date.contains("if let magnification {"), "… et seulement là")
        // Et c'est un CONTRÔLE depuis la directive du 2026-08-23.
        XCTAssertTrue(
            try magnificationSource().contains("Button(action: onShowParticipants)"),
            "« la chip du nombre d'utilisateurs doit être actionnable (ouvrir la liste des participants) »"
        )
    }

    /// Le chip rouge prend la place que le badge occupe DÉJÀ sur la carte : en
    /// fin de ligne du nom. La loupe agrandit, elle ne recompose pas.
    func test_flatRow_unreadChip_isRed_andEndsTheNameLine_likeOnTheCard() throws {
        let code = try rowSource()
        let header = try viewBlock("headerLine", in: code)
        let spacer = try XCTUnwrap(header.range(of: "Spacer(minLength: 0)"))
        let badge = try XCTUnwrap(header.range(of: "UnreadCountBadge("))
        XCTAssertLessThan(spacer.lowerBound, badge.lowerBound, "poussé en fin de ligne du nom")
        XCTAssertTrue(header.contains("conversation.userState.unreadCount > 0"), "… et seulement s'il y a des non-lus")

        // Le rang ne peint plus son chrome : il monte l'ATOME PARTAGÉ (matrice
        // L06, « via l'atome partagé UnreadCountBadge »). Le rouge sémantique et
        // l'interdit `fill(accent)` sont donc vérifiés là où le chrome vit
        // désormais — `UnreadCountBadgeTests.test_theBadgeIsSemanticRed_neverTheConversationAccent`,
        // où l'assertion a MIGRÉ plutôt que d'être supprimée avec son ancien site.
        // Ce qui se teste ICI est ce que l'atome ne peut pas savoir : sa PLACE
        // dans la ligne du nom, et sa condition d'apparition.

        // La prémisse du bloc amont — « la carte de magnification garde encore
        // sa copie locale, migration non décidée » — est devenue fausse le
        // 2026-08-23 : il n'y a plus de carte. La magnification EST la rangée,
        // donc elle monte le MÊME atome, et il n'existe plus de seconde copie
        // à tenir en accord avec la première. Ce que le bloc protégeait — « les
        // deux surfaces peignent le même rouge » — est désormais vrai par
        // construction.
    }

    /// Les quatre pastilles de la magnification ont le MÊME gabarit — mode,
    /// catégorie, étiquette, effectif : une bulle teintée au padding des
    /// chips. Aucune ne porte de contour d'accent (« pas de bordure »).
    func test_theFourMagnifiedPills_shareOneGauge_andNoneCarriesAnAccentBorder() throws {
        let code = try magnificationSource()
        XCTAssertEqual(
            code.components(separatedBy: "LentilleMetrics.Tags.chipPaddingHorizontal").count - 1, 4,
            "quatre pastilles, un seul gabarit"
        )
        XCTAssertFalse(code.contains("strokeBorder(accent"), "aucun contour d'accent : « pas de bordure »")
    }

    /// **SUPERSÈDE** `test_focusCard_memberCount_staysOnTheBorder_neverInTheContent`.
    /// « Sur la bordure » n'a plus de sens : il n'y a plus de bordure. Tout
    /// tient dans les quatre lignes de la rangée, et c'est précisément la
    /// directive du 2026-08-23 (« on complète juste les informations,
    /// directement sur le row existant »).
    func test_nothingAnchorsToABorderAnymore_everythingLivesInTheRowsLines() throws {
        let code = try rowSource()
        for anchor in [".overlay(alignment: .bottomLeading) {", ".overlay(alignment: .bottomTrailing) {", ".overlay(alignment: .top) {"] {
            XCTAssertFalse(code.contains(anchor), "plus aucun ancrage de bord (« \(anchor) »)")
        }
        XCTAssertFalse(
            try magnificationSource().contains("LentilleMetrics.ModeNotch.top"),
            "… et plus aucune encoche qui déborde du cadre : elle est rentrée dans la ligne."
        )
    }

}
