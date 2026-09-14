import XCTest

/// LES PAGES OUVERTES DEPUIS RÉGLAGES portent le retour en verre, un en-tête
/// clair, et des (+) en verre (#6481).
///
/// Directive porteur 2026-09-14 : « Dans la page Réglages, assure-toi que tous
/// aient le bouton (<) retour en Liquid Glass avec l'en-tête clair et précis !
/// Ceux qui ont des boutons (+) : les mettre en adaptive Liquid Glass aussi ! »
///
/// Inventaire du 2026-09-14 : vingt-deux destinations, deux seulement portaient
/// le retour en verre (Profil, Progression). Quinze dessinaient le même en-tête
/// à la main — chevron nu + « Retour » —, deux fermaient par un ✕ sans verre,
/// deux vivaient sous la barre système.
///
/// **Garde de SOURCE, et pourquoi.** Le verre ne laisse aucune trace dans
/// l'arbre d'accessibilité, et vingt montages réels coûteraient vingt jeux de
/// dépendances. Le défaut visé est ÉCRIT : un chevron ou un ✕ refait à la main
/// à côté du composant partagé. La preuve visuelle est la capture au simulateur.
final class SettingsDestinationsGlassHeaderGuardTests: XCTestCase {

    /// Les pages de Réglages, et les deux sous-pages de Sécurité au même motif.
    private static let pages = [
        "PrivacySettingsView", "SecurityView", "ChangePasswordView", "ActiveSessionsView",
        "BlockedUsersView", "DeleteAccountView",
        "VoiceProfileManageView", "VoiceProfileWizardView",
        "NotificationSettingsView",
        "DataStorageView", "MediaDownloadSettingsView", "DataExportView",
        "StarredMessagesView", "BookmarksView", "UserStatsView", "AffiliateView",
        "SupportView", "AboutView", "PrivacyPolicyView", "TermsOfServiceView", "LicensesView"
    ]

    private func source(_ page: String) throws -> String {
        try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()   // Views
                .deletingLastPathComponent()   // Unit
                .deletingLastPathComponent()   // MeeshyTests
                .deletingLastPathComponent()   // ios
                .appendingPathComponent("Meeshy/Features/Main/Views/\(page).swift"),
            encoding: .utf8
        )
    }

    func test_everySettingsPage_mountsTheSharedHeader() throws {
        let sans = try Self.pages.filter { page in
            let code = try source(page)
            return !code.contains("CollapsibleHeader(") && !code.contains("CollapsibleHeaderPage(")
        }
        XCTAssertEqual(sans, [], "Ces pages ne montent pas l'en-tête partagé (retour en verre, en-tête qui se réduit).")
    }

    /// Un chevron de retour n'a aucun usage de CONTENU : il est interdit partout.
    /// Un ✕, lui, en a (révoquer une session, puce de ce qui sera perdu) : il
    /// n'est fautif que s'il FERME la page — un `dismiss()` à portée du glyphe.
    func test_noSettingsPage_drawsItsOwnChevronOrCloseCross() throws {
        let chevrons = [
            "Image(systemName: \"chevron.backward\")",
            "Image(systemName: \"chevron.left\")"
        ]
        let croix = "Image(systemName: \"xmark.circle.fill\")"
        let fautives = try Self.pages.compactMap { page -> String? in
            let code = try source(page)
            var trouves = chevrons.filter(code.contains)
            let fermetures = Self.voisinages(de: croix, dans: code, avant: 400, apres: 400)
                .filter { $0.contains("dismiss()") }
            if !fermetures.isEmpty { trouves.append("\(croix) qui ferme la page") }
            return trouves.isEmpty ? nil : "\(page) : \(trouves.joined(separator: ", "))"
        }
        XCTAssertEqual(fautives, [], "Un retour ou une fermeture refait à la main, sans verre.")
    }

    /// Chaque (+) de ces pages est porté par du verre adaptatif — `adaptiveGlass`
    /// ou `adaptiveGlassProminent` — dans la chaîne de modificateurs qui le suit.
    func test_everyAddButton_isInAdaptiveGlass() throws {
        let fautives = try Self.pages.flatMap { page -> [String] in
            let code = try source(page)
            return Self.voisinages(de: "Image(systemName: \"plus", dans: code, avant: 0, apres: 900)
                .enumerated()
                .compactMap { index, suite in suite.contains(".adaptiveGlass") ? nil : "\(page) (+ n°\(index + 1))" }
        }
        XCTAssertEqual(fautives, [], "Un (+) sans verre adaptatif.")
    }

    /// Le texte autour de chaque occurrence d'un motif.
    private static func voisinages(de motif: String, dans code: String, avant: Int, apres: Int) -> [String] {
        var resultat: [String] = []
        var recherche = code.startIndex..<code.endIndex
        while let trouve = code.range(of: motif, range: recherche) {
            let debut = code.index(trouve.lowerBound, offsetBy: -avant, limitedBy: code.startIndex) ?? code.startIndex
            let fin = code.index(trouve.upperBound, offsetBy: apres, limitedBy: code.endIndex) ?? code.endIndex
            resultat.append(String(code[debut..<fin]))
            recherche = trouve.upperBound..<code.endIndex
        }
        return resultat
    }
}
