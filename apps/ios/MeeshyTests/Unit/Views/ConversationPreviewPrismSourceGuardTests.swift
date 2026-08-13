import Foundation
import XCTest
@testable import Meeshy

/// Confrontation mécanique de TOUTES les lectures app-side de
/// `conversation.lastMessagePreview` avec la règle qui les gouverne.
///
/// `MeeshyConversation.resolvedLastMessagePreview(preferredLanguages:)` est la
/// source de vérité iOS du Prisme Linguistique pour l'aperçu de conversation
/// (`CLAUDE.md`, règle #3, jumelle de `resolveLastMessagePreview()` côté
/// gateway). Elle était appliquée par DEUX lecteurs — la ligne de liste et la
/// recherche globale — pendant que trois autres surfaces d'affichage lisaient
/// le champ BRUT et montraient donc le dernier message dans sa langue
/// d'origine : le widget de l'écran d'accueil (via l'App Group), le sélecteur
/// de destination de partage, et l'aperçu in-app des widgets.
///
/// C'est la forme « garde locale sur défaut global » de la leçon 231, appliquée
/// non plus à un composant partagé mais à une RÈGLE partagée : une règle tenue
/// par ses deux lecteurs canoniques n'est pas tenue tant qu'un troisième lecteur
/// l'ignore, et rien ne rougit — chaque surface affiche un texte plausible.
///
/// La garde extrait donc les accès `.lastMessagePreview` réellement écrits sous
/// `apps/ios/Meeshy/` et exige de chaque fichier une classification explicite :
/// soit il résout par le Prisme, soit il figure dans l'allowlist délibérée
/// ci-dessous AVEC sa raison. Une nouvelle surface d'affichage qui lit le champ
/// brut fait rougir l'égalité d'ensembles.
final class ConversationPreviewPrismSourceGuardTests: XCTestCase {

    // MARK: - Allowlist délibérée (relue à chaque évolution)

    /// Fichiers autorisés à toucher `.lastMessagePreview` BRUT, et pourquoi.
    ///
    /// Aucun des deux n'AFFICHE le champ brut : le premier l'ÉCRIT, le second
    /// lit un champ homonyme déjà résolu. C'est la seule justification
    /// acceptable — « cette surface n'a pas de traductions de toute façon »
    /// n'en est pas une, puisqu'elle dépend de ce que le gateway envoie ce
    /// jour-là et non de ce que le fichier garantit.
    private static let deliberateRawReaders: [String: String] = [
        // ÉCRITURE, pas lecture : le pont `conversation:updated` recopie
        // `event.lastMessagePreview` dans le modèle. C'est ce champ-là que
        // `resolvedLastMessagePreview` consommera ensuite — le résoudre ici
        // figerait la langue du lecteur DANS le cache.
        "Features/Main/ViewModels/ConversationListViewModel.swift":
            "écrit le champ depuis conversation:updated ; la résolution est en aval, à l'affichage",
        // Homonymie : `GlobalSearchViewModel.SearchResult.lastMessagePreview`
        // est un champ DE LA VUE, rempli lignes 329/358 par
        // `conv.resolvedLastMessagePreview(preferredLanguages:)`. La vue lit
        // donc une valeur déjà passée par le Prisme.
        "Features/Main/Views/GlobalSearchView.swift":
            "lit SearchResult.lastMessagePreview, déjà résolu par GlobalSearchViewModel",
    ]

    // MARK: - Balayage

    private var appSourcesDirectory: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Views
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
            .appendingPathComponent("Meeshy", isDirectory: true)
    }

    /// Retire commentaires de ligne et de bloc AVANT toute recherche : ces
    /// fichiers documentent abondamment `lastMessagePreview` en prose, et une
    /// garde qui compterait la prose serait rouge en permanence pour rien.
    ///
    /// Les littéraux de chaîne sont préservés (le découpeur les traverse sans
    /// y chercher de commentaire) — corollaire de la leçon 231 : un découpeur
    /// qui avale trop rend un balayage vide indiscernable d'un succès.
    private func strippingComments(_ code: String) -> String {
        var output = ""
        var inBlockComment = false
        var inLineComment = false
        var inString = false
        var index = code.startIndex

        while index < code.endIndex {
            let character = code[index]
            let next = code.index(after: index) < code.endIndex ? code[code.index(after: index)] : Character(" ")

            if inBlockComment {
                if character == "*" && next == "/" {
                    inBlockComment = false
                    index = code.index(index, offsetBy: 2)
                    continue
                }
                index = code.index(after: index)
                continue
            }
            if inLineComment {
                if character == "\n" {
                    inLineComment = false
                    output.append(character)
                }
                index = code.index(after: index)
                continue
            }
            if inString {
                if character == "\\" {
                    output.append("  ")
                    index = code.index(index, offsetBy: 2, limitedBy: code.endIndex) ?? code.endIndex
                    continue
                }
                if character == "\"" { inString = false }
                output.append(character)
                index = code.index(after: index)
                continue
            }
            if character == "/" && next == "/" {
                inLineComment = true
                index = code.index(index, offsetBy: 2)
                continue
            }
            if character == "/" && next == "*" {
                inBlockComment = true
                index = code.index(index, offsetBy: 2)
                continue
            }
            if character == "\"" { inString = true }
            output.append(character)
            index = code.index(after: index)
        }
        return output
    }

    /// `.lastMessagePreview` en accès membre — le `.` exclut la déclaration de
    /// la propriété et les étiquettes d'argument (`lastMessagePreview:`), la
    /// borne droite exclut `lastMessagePreviewView` (nom de vue).
    private func rawPreviewAccessCount(in code: String) -> Int {
        let needle = ".lastMessagePreview"
        var count = 0
        var searchRange = code.startIndex..<code.endIndex
        while let found = code.range(of: needle, range: searchRange) {
            let isIdentifierContinuation: Bool = {
                guard found.upperBound < code.endIndex else { return false }
                let after = code[found.upperBound]
                return after.isLetter || after.isNumber || after == "_"
            }()
            if !isIdentifierContinuation { count += 1 }
            searchRange = found.upperBound..<code.endIndex
        }
        return count
    }

    private func rawPreviewReadersByRelativePath() throws -> [String: Int] {
        let root = appSourcesDirectory
        let enumerator = try XCTUnwrap(
            FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil),
            "impossible d'énumérer \(root.path)"
        )
        var readers: [String: Int] = [:]
        for case let url as URL in enumerator where url.pathExtension == "swift" {
            let code = strippingComments(try String(contentsOf: url, encoding: .utf8))
            let count = rawPreviewAccessCount(in: code)
            guard count > 0 else { continue }
            let relative = url.path.replacingOccurrences(of: root.path + "/", with: "")
            readers[relative] = count
        }
        return readers
    }

    // MARK: - Tests

    /// Le balayage doit trouver quelque chose. Sans cette assertion, un
    /// découpeur de commentaires trop gourmand (ou une arborescence déplacée)
    /// rendrait la garde VERTE en n'ayant rien vérifié — c'est exactement le
    /// mode d'échec payé comptant au cycle 106.
    func test_scan_findsTheDeliberateReaders_soASilentSweepCannotPassAsSuccess() throws {
        let readers = try rawPreviewReadersByRelativePath()
        XCTAssertFalse(
            readers.isEmpty,
            "balayage vide : le découpeur ou la racine sont cassés, pas le code applicatif"
        )
        for expected in Self.deliberateRawReaders.keys {
            XCTAssertNotNil(
                readers[expected],
                "\(expected) devait être trouvé par le balayage — s'il a été corrigé, retirer son entrée de l'allowlist"
            )
        }
    }

    /// Égalité d'ensembles : tout fichier app-side qui lit
    /// `.lastMessagePreview` brut est soit corrigé, soit délibérément listé.
    func test_everyRawPreviewReader_isDeliberate_orResolvesThroughThePrism() throws {
        let readers = try rawPreviewReadersByRelativePath()
        let undeclared = Set(readers.keys).subtracting(Self.deliberateRawReaders.keys)

        XCTAssertTrue(
            undeclared.isEmpty,
            """
            Ces fichiers lisent conversation.lastMessagePreview BRUT :
            \(undeclared.sorted().joined(separator: "\n"))

            Une surface qui AFFICHE l'aperçu doit passer par
            `resolvedLastMessagePreview(preferredLanguages:)` — sinon elle montre
            le dernier message dans la langue de l'EXPÉDITEUR pendant que la
            liste de conversations, elle, affiche la traduction. Si la lecture
            est légitime (écriture, ou champ homonyme déjà résolu), l'ajouter à
            `deliberateRawReaders` AVEC sa raison.
            """
        )
    }

    /// Les trois surfaces corrigées ce cycle ne doivent pas régresser : elles
    /// doivent APPELER le résolveur, pas seulement avoir cessé de lire le brut
    /// (supprimer l'aperçu ferait passer le test précédent aussi).
    func test_theThreeFixedSurfaces_callTheResolver() throws {
        let expectations = [
            "Features/Main/Services/WidgetDataManager.swift",
            "Features/Main/Views/SharePickerView.swift",
            "Features/Main/Views/WidgetPreviewView.swift",
        ]
        for relative in expectations {
            let url = appSourcesDirectory.appendingPathComponent(relative)
            let code = strippingComments(try String(contentsOf: url, encoding: .utf8))
            XCTAssertTrue(
                code.contains("resolvedLastMessagePreview"),
                "\(relative) doit résoudre l'aperçu par le Prisme — l'appel a disparu"
            )
        }
    }

    /// La ligne de liste et la recherche globale restent les deux lecteurs
    /// canoniques : la garde ne doit pas les laisser régresser non plus.
    func test_canonicalReaders_stillResolveThroughThePrism() throws {
        let expectations = [
            "Features/Main/Views/ThemedConversationRow.swift",
            "Features/Main/ViewModels/GlobalSearchViewModel.swift",
        ]
        for relative in expectations {
            let url = appSourcesDirectory.appendingPathComponent(relative)
            let code = strippingComments(try String(contentsOf: url, encoding: .utf8))
            XCTAssertTrue(
                code.contains("resolvedLastMessagePreview"),
                "\(relative) est un lecteur canonique du Prisme — son appel a disparu"
            )
        }
    }
}
