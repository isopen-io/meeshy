import XCTest
@testable import Meeshy

/// Aperçu d'appui long d'une conversation — décision utilisateur 2026-08-21 :
/// « juste voir les derniers messages dans la preview avec le titre, la
/// bannière, l'image/logo de la conversation et les icônes d'en-tête » ; le
/// menu des modes (Auto · Focal · Script · …) « ne sert à rien » dans
/// l'aperçu — le choix de mode garde ses DEUX portes : l'encoche de la carte
/// de focus et le sous-menu « Mode de lecture » du menu contextuel.
///
/// Les DEUX chemins OS (natif iOS 26+ `.contextMenu(menuItems:preview:)`
/// dans `+Rows.swift`, overlay custom < iOS 26 dans `+Overlays.swift`)
/// montent donc `ConversationPreviewView` — la carte historique des derniers
/// messages — drapeau Lentille ON comme OFF, sans conditionnel. L'ancienne
/// `LentillePeekView` (en-tête + texte + menu des modes, contrat LWS-8/I-072)
/// est SUPPRIMÉE, pas mise sous drapeau : un aperçu qui change de nature
/// selon un drapeau est la dérive que ce témoin interdit.
///
/// Témoins de STRUCTURE (source lue à l'exécution, leçon « ce qui ne
/// s'exécute pas ne se signale pas ») + gardes des fichiers `Lentille/Mode/`
/// reprises de l'ancienne suite `PeekViewModelTests` (timings et cotes gelés).
final class LongPressPreviewGuardTests: XCTestCase {

    // MARK: - Sources

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func source(_ relativePath: String) throws -> String {
        try String(
            contentsOf: Self.iosRoot.appendingPathComponent(relativePath),
            encoding: .utf8
        )
    }

    private func normalizedCode(_ source: String) -> String {
        AppSourceGuard.stripComments(source)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    private static let nativePath = "Meeshy/Features/Main/Views/ConversationListView+Rows.swift"
    private static let overlayPath = "Meeshy/Features/Main/Views/ConversationListView+Overlays.swift"

    // MARK: - 1. L'aperçu = la carte des derniers messages, sur les DEUX chemins

    func test_nativeContextMenuPreview_isTheRecentMessagesCard_unconditionally() throws {
        let raw = try source(Self.nativePath)
        XCTAssertEqual(
            occurrences(of: "ConversationPreviewView(", in: raw), 1,
            "Le chemin natif iOS 26+ monte la carte des derniers messages UNE fois, en `preview:`."
        )
        let normalized = normalizedCode(raw)
        XCTAssertTrue(
            normalized.contains("} preview: { ConversationPreviewView("),
            "La carte des derniers messages est l'aperçu LUI-MÊME — pas la branche d'un " +
            "conditionnel de drapeau : l'aperçu ne change pas de nature selon la Lentille."
        )
    }

    func test_customOverlayPreview_isTheRecentMessagesCard_unconditionally() throws {
        let raw = try source(Self.overlayPath)
        XCTAssertEqual(
            occurrences(of: "ConversationPreviewView(", in: raw), 1,
            "Le chemin < iOS 26 (`conversationContextMenuOverlay`) monte la carte des " +
            "derniers messages UNE fois."
        )
        let normalized = normalizedCode(raw)
        XCTAssertFalse(
            normalized.contains("isLentilleListEnabled { ConversationPreviewView(") ||
            normalized.contains("} else { ConversationPreviewView("),
            "La carte des derniers messages ne doit être ni la branche ON ni le repli OFF " +
            "d'un conditionnel de drapeau — elle est l'aperçu, point."
        )
    }

    // MARK: - 2. Le menu des modes a quitté l'aperçu — et la vue qui le portait n'existe plus

    func test_modeMenuPeekView_isGone_fromTheAppTree() throws {
        let enumerator = FileManager.default.enumerator(
            at: Self.iosRoot.appendingPathComponent("Meeshy"),
            includingPropertiesForKeys: nil
        )
        var offenders: [String] = []
        while let url = enumerator?.nextObject() as? URL {
            guard url.pathExtension == "swift" else { continue }
            let code = normalizedCode(try String(contentsOf: url, encoding: .utf8))
            if code.contains("LentillePeekView") {
                offenders.append(url.lastPathComponent)
            }
        }
        XCTAssertEqual(
            offenders, [],
            "`LentillePeekView` (aperçu portant le menu des modes) est SUPPRIMÉE : aucun " +
            "fichier de l'app ne doit plus la déclarer ni la monter — \(offenders)."
        )
    }

    func test_previewClosures_neverMountTheModeMenu() throws {
        for path in [Self.nativePath, Self.overlayPath] {
            let normalized = normalizedCode(try source(path))
            XCTAssertFalse(
                normalized.contains("LentilleModeMenu(") || normalized.contains("LentillePeekView("),
                "\(path) : l'aperçu d'appui long ne porte plus le menu des modes (le " +
                "sous-menu « Mode de lecture » et l'encoche restent ses deux portes)."
            )
        }
    }

    /// Le choix de mode reste joignable depuis le menu contextuel (sous-menu
    /// « Mode de lecture ») : retirer l'aperçu-menu ne retire pas la porte.
    func test_readingModeSubmenu_remainsInTheContextMenu() throws {
        let normalized = normalizedCode(try source(Self.overlayPath))
        XCTAssertTrue(
            normalized.contains("LentilleReadingModeSubmenu("),
            "Le sous-menu « Mode de lecture » doit rester monté dans le menu contextuel — " +
            "c'est désormais, avec l'encoche, l'une des DEUX portes du choix de mode."
        )
    }

    // MARK: - 3. Gardes de source — timings et cotes gelés NON redéfinis dans Lentille/Mode/

    private static var modeDirectory: URL {
        Self.iosRoot.appendingPathComponent("Meeshy/Features/Main/Lentille/Mode")
    }

    /// Découverte dynamique (leçon 257) — jamais une liste de fichiers
    /// recopiée à la main : un fichier ajouté demain à `Lentille/Mode/`
    /// entre automatiquement sous cette garde.
    private func modeSources() throws -> [(name: String, code: String)] {
        let entries = try FileManager.default.contentsOfDirectory(
            at: Self.modeDirectory, includingPropertiesForKeys: nil
        )
        return try entries
            .filter { $0.pathExtension == "swift" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .map { ($0.lastPathComponent, try String(contentsOf: $0, encoding: .utf8)) }
    }

    func test_guardDiscoversAtLeastOneModeSourceFile_neverSilentlyEmpty() throws {
        XCTAssertFalse(
            try modeSources().isEmpty,
            "La garde n'a chargé AUCUN fichier depuis `\(Self.modeDirectory.path)` — elle " +
            "passerait alors au vert sans rien vérifier (leçon 257)."
        )
    }

    /// Critère LWS-8 : « timings, spring 0.55/0.25 … gelés ». Le spring peu
    /// amorti du rebond de long-press (`RowPressBounceModifier
    /// .spring(response: 0.55, dampingFraction: 0.25)`) vit dans
    /// `ConversationListView+Rows.swift` et SEULEMENT là — `Lentille/Mode/`
    /// ne doit jamais recomposer sa propre paire `(0.55, 0.25)`.
    func test_modeFiles_neverRedefineTheFrozenPressBounceSpring() throws {
        for source in try modeSources() {
            for forbidden in ["0.55", "0.25"] {
                XCTAssertEqual(
                    source.code.components(separatedBy: forbidden).count - 1, 0,
                    "\(source.name) contient « \(forbidden) » (source BRUTE, commentaires " +
                    "compris) : les timings du geste d'appui long sont GELÉS dans " +
                    "`RowPressBounceModifier` (`ConversationListView+Rows.swift`) — " +
                    "critère LWS-8, « timings … gelés »."
                )
            }
        }
    }

    /// Critère LWS-8 : « zone d'exclusion avatar 70 pt … consommée pas
    /// recalculée » — `Lentille/Mode/` ne recompose jamais son propre
    /// littéral `70` (recherche par limite de mot : `I-070` en commentaire
    /// n'est pas une cote).
    func test_modeFiles_neverHardcodeTheAvatarExclusionZoneAsALiteral() throws {
        let pattern = "\\b70\\b"
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            XCTFail("Regex de garde invalide pour la zone d'exclusion avatar — corriger le motif avant de faire confiance à ce témoin.")
            return
        }
        for source in try modeSources() {
            let range = NSRange(source.code.startIndex..<source.code.endIndex, in: source.code)
            XCTAssertEqual(
                regex.numberOfMatches(in: source.code, range: range), 0,
                "\(source.name) contient un `70` isolé : la zone d'exclusion avatar " +
                "(`ConversationRowMetrics.avatarInteractionExclusionWidth`) se CONSOMME, " +
                "elle ne se RECALCULE pas dans `Lentille/Mode/`."
            )
        }
    }
}
