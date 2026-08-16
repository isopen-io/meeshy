import XCTest
@testable import Meeshy

/// Garde de source COMPLÈTE de `Lentille/Row/*.swift` (contrat LWS-7,
/// workshop I-068 — nom cité par le contrat §LWS-7). `LentilleFlatRowTests`
/// (I-065) embarquait déjà un témoin minimal (`unreadBadgeBackground`,
/// liste de fichiers recopiée à la main) ; cette suite le COMPLÈTE avec les
/// autres interdits du contrat et bascule sur une découverte DYNAMIQUE du
/// dossier (leçon 257 — « chercher les types/fichiers DÉCLARÉS, jamais
/// recopiés dans une liste »), à la manière de `LentilleChromeSourceGuardTests`
/// (I-064) : un fichier ajouté demain à `Lentille/Row/` entre automatiquement
/// dans le périmètre de la garde, et la suite échoue explicitement si elle
/// n'en découvre aucun.
///
/// **Alignement `scripts/check-law-literals.sh`.** `Lentille/Row/` est déjà
/// sous les `SKIN_DIRS` du script (tout `.swift` sous `Lentille/**`, hors
/// `Lentille/Core/**` — non pertinent ici puisque `Row/` n'a pas de
/// sous-dossier `Core/`) : le script grep la source BRUTE, sans retrait de
/// commentaires. Les témoins de littéraux R15 ci-dessous font de même (pas
/// d'`AppSourceGuard.stripComments`), pour rester alignés avec le mécanisme
/// que la CI applique réellement.
final class LentilleRowSourceGuardTests: XCTestCase {

    // MARK: - Localisation des sources

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Lentille
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }

    private static var rowDirectory: URL {
        iosRoot.appendingPathComponent("Meeshy/Features/Main/Lentille/Row")
    }

    /// Tout `.swift` de `Lentille/Row/`, découvert au moment du test —
    /// jamais une liste de noms recopiée à la main (leçon 257).
    private func rowSources() throws -> [(name: String, code: String)] {
        let entries = try FileManager.default.contentsOfDirectory(
            at: Self.rowDirectory,
            includingPropertiesForKeys: nil
        )
        let swiftFiles = entries
            .filter { $0.pathExtension == "swift" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        return try swiftFiles.map { url in
            (url.lastPathComponent, try String(contentsOf: url, encoding: .utf8))
        }
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

    /// Même patron que `LentilleChromeSourceGuardTests.comparisonOccurrences`
    /// — littéraux « mous » interdits SEULEMENT en comparaison numérique
    /// (`grep -nE "\s*(>|>=|<|<=)\s*$literal\b"`, `check-law-literals.sh`).
    private func comparisonOccurrences(of literal: String, in code: String) -> Int {
        let pattern = "[<>]=?\\s*\(NSRegularExpression.escapedPattern(for: literal))\\b"
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            XCTFail("Regex de garde invalide pour le littéral « \(literal) » — corriger le motif dans LentilleRowSourceGuardTests avant de faire confiance à ce témoin.")
            return 0
        }
        let range = NSRange(code.startIndex..., in: code)
        return regex.numberOfMatches(in: code, range: range)
    }

    // MARK: - Garde d'ensemble (leçon 257)

    func test_guardDiscoversAtLeastOneRowFile_neverSilentlyEmpty() throws {
        let sources = try rowSources()
        XCTAssertFalse(
            sources.isEmpty,
            "LentilleRowSourceGuardTests n'a chargé AUCUN fichier depuis " +
            "`\(Self.rowDirectory.path)` — vérifier que ce chemin existe encore depuis le " +
            "bundle de test (`apps/ios/Meeshy/Features/Main/Lentille/Row/`). Une garde qui " +
            "charge zéro fichier passe TOUJOURS au vert sans avoir rien vérifié (leçon 257) : " +
            "c'est le défaut le plus coûteux de cette suite, bien pire qu'un simple trou de " +
            "couverture."
        )
    }

    // MARK: - Aucun badge chiffré (contrat §LWS-7 : « le chiffre vit dans le pont »)

    func test_noUnreadBadgeBackground_inAnyRowFile() throws {
        for source in try rowSources() {
            let count = occurrences(of: "unreadBadgeBackground", in: normalizedCode(source.code))
            XCTAssertEqual(
                count, 0,
                "\(source.name) contient \(count) occurrence(s) de « unreadBadgeBackground » — " +
                "le chiffre de non-lu vit dans le pont ✦ (point accent 8 px), plus dans un " +
                "badge chiffré (contrat §LWS-7, critère « aucun badge chiffré nulle part »)."
            )
        }
    }

    // MARK: - Dynamic Type — tout passe par MeeshyFont.relative

    func test_noRawSystemFontSize_inAnyRowFile() throws {
        for source in try rowSources() {
            let count = occurrences(of: ".font(.system(size:", in: normalizedCode(source.code))
            XCTAssertEqual(
                count, 0,
                "\(source.name) contient \(count) occurrence(s) de « .font(.system(size: » — " +
                "toute police du rang doit passer par MeeshyFont.relative (donc suivre Dynamic " +
                "Type), jamais une taille de police fixe (contrat §LWS-7)."
            )
        }
    }

    // MARK: - Aucun `.onTapGesture` — avalé par le long press du conteneur

    /// Régression déjà documentée côté bulle (#3010 WS-4) : un
    /// `.onTapGesture` posé sur un contrôle interne au rang se fait AVALER
    /// par le long-press du conteneur (`RowPressBounceModifier` /
    /// `.contextMenu`, `ConversationListView+Rows.swift`) — tout contrôle
    /// interne doit être un `Button(.plain)` + `.contentShape(Rectangle())`.
    func test_noOnTapGesture_inAnyRowFile() throws {
        for source in try rowSources() {
            let count = occurrences(of: ".onTapGesture", in: normalizedCode(source.code))
            XCTAssertEqual(
                count, 0,
                "\(source.name) contient \(count) occurrence(s) de « .onTapGesture » — un " +
                "contrôle interne au rang doit être Button(.plain) + .contentShape(Rectangle()), " +
                "jamais .onTapGesture (avalé par le long-press du conteneur, régression " +
                "documentée #3010 WS-4, contrat §LWS-7)."
            )
        }
    }

    // MARK: - Aucun `@State` de langue — la résolution vient du SDK gelé, jamais d'un cache local

    /// Le rang ne porte AUCUN `@State` de langue (contrat §LWS-7, contrainte
    /// dure) : la résolution vient de `resolvedLastMessagePreview(preferredLanguages:)`
    /// / `LentilleBridgeLine.resolveAgentText`, jamais d'un cache local. Un
    /// `@State` NON lié à la langue (ex. `LentilleTypingDots.isAnimating`,
    /// animation pure) reste légitime — la garde n'interdit donc pas
    /// `@State` en bloc, elle interdit un `@State` dont la déclaration porte
    /// un mot-clé de langue/traduction.
    func test_noLanguageState_inAnyRowFile() throws {
        let forbiddenKeywords = ["lang", "translat", "resolvedPreview", "resolvedText", "cachedTranslation"]
        let pattern = "@State[^\\n]*"
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            XCTFail("Regex de garde invalide pour la détection des déclarations @State.")
            return
        }
        for source in try rowSources() {
            let stripped = AppSourceGuard.stripComments(source.code)
            let range = NSRange(stripped.startIndex..., in: stripped)
            let matches = regex.matches(in: stripped, range: range)
            for match in matches {
                guard let matchRange = Range(match.range, in: stripped) else { continue }
                let declaration = String(stripped[matchRange])
                let lowered = declaration.lowercased()
                for keyword in forbiddenKeywords {
                    XCTAssertFalse(
                        lowered.contains(keyword.lowercased()),
                        "\(source.name) porte un @State suspect de cacher une résolution de " +
                        "langue : « \(declaration.trimmingCharacters(in: .whitespaces)) » — la " +
                        "résolution doit TOUJOURS venir de resolvedLastMessagePreview(preferredLanguages:) " +
                        "ou LentilleBridgeLine.resolveAgentText, jamais d'un cache local (contrat §LWS-7)."
                    )
                }
            }
        }
    }

    // MARK: - Aucune carte — pas de backgroundSecondary hors focus card (LWS-8)

    /// « AUCUNE carte » (contrat §LWS-7) : ni `backgroundSecondary`, ni
    /// gradient de chaleur, ni bordure — la focus card de LWS-8
    /// (`Lentille/Perspective/`, hors périmètre de ce dossier) est la SEULE
    /// carte de l'écran. `Lentille/Row/` ne doit donc JAMAIS référencer
    /// `backgroundSecondary`.
    func test_noBackgroundSecondary_inAnyRowFile_focusCardIsTheOnlyCard() throws {
        for source in try rowSources() {
            let count = occurrences(of: "backgroundSecondary", in: normalizedCode(source.code))
            XCTAssertEqual(
                count, 0,
                "\(source.name) contient \(count) occurrence(s) de « backgroundSecondary » — " +
                "AUCUNE carte dans Lentille/Row/ (contrat §LWS-7) : la focus card de LWS-8 est " +
                "la SEULE carte de l'écran."
            )
        }
    }

    // MARK: - Littéraux de loi (R15), bruts — alignés sur check-law-literals.sh

    func test_hardLawLiterals_areAbsent_fromRowFiles() throws {
        let hardLiterals = ["900", "520", "380", "0.45", "0.82"]
        for source in try rowSources() {
            for literal in hardLiterals {
                let count = occurrences(of: literal, in: source.code)
                XCTAssertEqual(
                    count, 0,
                    "\(source.name) contient « \(literal) » (\(count) fois, commentaires " +
                    "compris) — constante de loi gelée : elle doit être LUE depuis son miroir " +
                    "Swift (`LentilleMetrics`, `packages/shared/design/lentille-tokens.json`), " +
                    "jamais recopiée dans une peau (garde R15, contrat R15)."
                )
            }
        }
    }

    /// `25` et `24` ne sont interdits qu'en COMPARAISON numérique (même
    /// nuance que `check-law-literals.sh` et `LentilleChromeSourceGuardTests`)
    /// — un zéro aveugle sur le chiffre lui-même ferait rougir du code sans
    /// rapport avec la loi (un index, une taille de police).
    func test_softLawLiterals_areNeverUsedAsNumericComparisons_inRowFiles() throws {
        let softLiterals = ["25", "24"]
        for source in try rowSources() {
            for literal in softLiterals {
                let count = comparisonOccurrences(of: literal, in: source.code)
                XCTAssertEqual(
                    count, 0,
                    "\(source.name) compare une valeur à « \(literal) » (\(count) fois) — " +
                    "seuils de loi (orchestrateur LWS-8) : à lire depuis leur miroir Swift, " +
                    "jamais à comparer en dur dans une peau (garde R15)."
                )
            }
        }
    }

    // MARK: - Témoins manquants après I-065 (leçon de la mission : re-auditer
    // avant d'ajouter) — sourdine 🔕 et point du pont, aucun des deux
    // structurellement vérifié par LentilleFlatRowTests/LentilleSkeletonRowTests.

    /// `behaviour-matrix.json` L07 : « la sourdine passe enfin visible (rang
    /// à 0.55 + 🔕) ». L'opacité 0.55 est déjà verrouillée par
    /// `LentilleFlatRowTests.test_rowOpacity_muted_usesMetricNotLiteral`
    /// (`LentilleConversationRow.rowOpacity`, dérivée de
    /// `LentilleMetrics.Muted.opacity`) — mais AUCUN témoin n'existait pour
    /// le second volet de L07, l'émoji 🔕 après le nom. Aucun framework
    /// d'inspection SwiftUI n'étant disponible ici (même contrainte que
    /// `LentilleSkeletonRowTests`), la garde porte sur la STRUCTURE : le 🔕
    /// est gated par `conversation.userState.isMuted`, la même donnée que
    /// `rowOpacity` lit déjà.
    func test_mutedGlyph_gatedByUserStateIsMuted_inLentilleConversationRow() throws {
        guard let source = try rowSources().first(where: { $0.name == "LentilleConversationRow.swift" }) else {
            XCTFail("LentilleConversationRow.swift introuvable parmi les fichiers découverts de Lentille/Row/")
            return
        }
        let code = normalizedCode(source.code)
        XCTAssertTrue(
            code.contains(#"if conversation.userState.isMuted { Text("🔕")"#),
            "LentilleConversationRow.swift doit afficher 🔕 immédiatement gated par " +
            "`conversation.userState.isMuted` (behaviour-matrix.json L07 : « la sourdine " +
            "passe enfin visible — rang à 0.55 + 🔕 », affordance manquante relevée à l'audit)."
        )
    }

    /// Contrat §LWS-7 : « pont : […] ligne 2 = pont ✦ + point accent 8 ».
    /// `LentilleMetricsTests` verrouille déjà `LentilleMetrics.UnreadDot.size == 8`
    /// contre `lentille-tokens.json` (LWS-5, hors périmètre) ; ce témoin
    /// verrouille le CÔTÉ CONSOMMATEUR — que `LentilleBridgeLine` dimensionne
    /// bien son point avec CE token, jamais un `8` recopié (garde R15 en
    /// prime : `8` n'est pas dans la liste des littéraux interdits, mais
    /// l'identité de source reste la propriété recherchée, comme pour
    /// `LentilleSkeletonRowTests`).
    func test_bridgeLine_unreadDot_usesMetric_notALiteral() throws {
        guard let source = try rowSources().first(where: { $0.name == "LentilleBridgeLine.swift" }) else {
            XCTFail("LentilleBridgeLine.swift introuvable parmi les fichiers découverts de Lentille/Row/")
            return
        }
        let code = normalizedCode(source.code)
        XCTAssertTrue(
            code.contains("frame(width: LentilleMetrics.UnreadDot.size, height: LentilleMetrics.UnreadDot.size)"),
            "LentilleBridgeLine.swift doit dimensionner le point du pont avec " +
            "LentilleMetrics.UnreadDot.size (8, contrat §LWS-7 : « point accent 8 »), jamais un " +
            "littéral recopié."
        )
    }
}
