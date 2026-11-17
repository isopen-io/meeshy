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

    private static let domains = ["Settings", "Links", "Profile", "Main"]

    private func source(_ page: String) throws -> String {
        let features = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // ios
            .appendingPathComponent("Meeshy/Features")
        let candidates = Self.domains.map { features.appendingPathComponent("\($0)/Views/\(page).swift") }
        let file = try XCTUnwrap(candidates.first { FileManager.default.fileExists(atPath: $0.path) },
                                 "\(page).swift introuvable dans \(Self.domains)")
        return try String(contentsOf: file, encoding: .utf8)
    }

    func test_everySettingsPage_mountsTheSharedHeader() throws {
        let sans = try Self.pages.filter { page in
            let code = try source(page)
            return !code.contains("CollapsibleHeader(") && !code.contains("CollapsibleHeaderPage(") && !code.contains("LinksPage(")
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

/// LES PAGES DE LIENS portent l'en-tête de Parrainage, et leur contenu passe au
/// kit (#18429).
///
/// Directive porteur 2026-11-14 : « la vue Parrainage a un header qui a les
/// boutons avec le kit mais les autres pages de liens ne respectent pas. Le
/// contenu ne respecte pas l'approche kit par contre. »
///
/// Garde de SOURCE, comme sa voisine : le verre ne laisse aucune trace dans
/// l'arbre d'accessibilité. Le défaut visé est ÉCRIT — une barre refaite à la
/// main, un contrôle système là où le kit en fournit un.
final class LinksPagesKitGuardTests: XCTestCase {

    private static let pages = [
        "AffiliateView", "LinksHubView", "ShareLinksView", "TrackingLinksView", "CommunityLinksView",
        "ShareLinkDetailView", "ShareLinkArrivalsListView", "TrackingLinkDetailView", "CommunityLinkDetailView",
        "CreateShareLinkView", "CreateTrackingLinkView", "AffiliateCreateView"
    ]

    private static let sheets = ["CreateShareLinkView", "CreateTrackingLinkView", "AffiliateCreateView"]

    private static var linksViews: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // ios
            .appendingPathComponent("Meeshy/Features/Links/Views")
    }

    private func code(_ file: String) throws -> String {
        let source = try String(contentsOf: Self.linksViews.appendingPathComponent("\(file).swift"), encoding: .utf8)
        return source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") && !$0.trimmingCharacters(in: .whitespaces).hasPrefix("///") }
            .joined(separator: "\n")
    }

    private func allViewFiles() throws -> [String] {
        try FileManager.default.contentsOfDirectory(atPath: Self.linksViews.path)
            .filter { $0.hasSuffix(".swift") }
            .map { String($0.dropLast(".swift".count)) }
            .sorted()
    }

    func test_everyLinksPage_whenRendered_mountsTheSharedLinksPage() throws {
        let sans = try Self.pages.filter { try !code($0).contains("LinksPage(") }
        XCTAssertEqual(sans, [], "Ces pages de liens ne montent pas l'en-tête partagé de Parrainage.")
    }

    /// La sous-feuille de choix de conversation reste une `List` cherchable sous
    /// barre système : `CollapsibleHeaderPage` ne porte ni `List` ni `.searchable`
    /// (manque signalé au rapport de #18429). Elle est la seule exemption, et elle
    /// est NOMMÉE : la page qui l'héberge est lue jusqu'à elle.
    private func pageCode(_ page: String) throws -> String {
        let source = try code(page)
        let bornes = ["private struct ConversationPickerSheet", "struct LinksPageAction"]
        guard let fin = bornes.compactMap({ source.range(of: $0)?.lowerBound }).min() else { return source }
        return String(source[..<fin])
    }

    func test_everyLinksPage_whenRendered_drawsNoHandmadeOrSystemBar() throws {
        let interdits = [
            ".navigationTitle(", "CollapsibleHeader(", "CollapsibleHeaderPage(",
            "Image(systemName: \"chevron.backward\")", "Image(systemName: \"chevron.left\")"
        ]
        let fautives = try Self.pages.compactMap { page -> String? in
            let source = try pageCode(page)
            let trouves = interdits.filter(source.contains)
            return trouves.isEmpty ? nil : "\(page) : \(trouves.joined(separator: ", "))"
        }
        XCTAssertEqual(fautives, [], "Une barre de titre système ou refaite à la main, à côté de l'en-tête partagé.")
    }

    func test_linksPage_whenDeclared_isOneComponentOverTheSharedHeader() throws {
        let declarations = try allViewFiles().filter { try code($0).contains("struct LinksPage<") }
        XCTAssertEqual(declarations.count, 1, "UN composant d'en-tête pour toutes les pages de liens, jamais une copie par page.")
        let host = try code(try XCTUnwrap(declarations.first))
        XCTAssertTrue(host.contains("CollapsibleHeaderPage("), "L'en-tête des liens EST celui de Parrainage : la page partagée du SDK.")
        XCTAssertTrue(host.contains("MeeshyGlassButton("), "L'action de l'en-tête est le disque de verre du kit.")
        XCTAssertTrue(host.contains(".meeshyGlassTone(.theme)"), "Le contenu des pages de liens se pose sur le thème : le kit en prend l'encre.")
    }

    func test_creationSheets_whenPresented_closeWithTheSharedCross() throws {
        let fautives = try Self.sheets.filter { sheet in
            let source = try pageCode(sheet)
            return !source.contains("glyph: .close") || source.contains("NavigationStack {")
        }
        XCTAssertEqual(fautives, [], "Une feuille de création ferme par le ✕ de l'en-tête partagé, sans barre système.")
    }

    func test_linksContent_whenRendered_usesTheKitWhereItHasTheControl() throws {
        let interdits = [
            "TextField(": "MeeshyField", "Toggle(": "MeeshyToggleRow", " Picker(": "MeeshyChipRow / MeeshySegmented",
            ".adaptiveGlass(": "MeeshyGlassButton", "plus.circle.fill": "MeeshyGlassButton"
        ]
        let fautives = try allViewFiles().flatMap { file -> [String] in
            let source = try code(file)
            return interdits.compactMap { motif, kit in source.contains(motif) ? "\(file) : \(motif) → \(kit)" : nil }
        }
        XCTAssertEqual(fautives.sorted(), [], "Un contrôle maison là où le kit fournit l'équivalent.")
    }

    func test_copyActions_whenTapped_confirmVisibly() throws {
        let fautives = try allViewFiles().filter { file in
            try file != "LinksHubView" && code(file).contains("UIPasteboard.general.string =")
        }
        XCTAssertEqual(fautives, [], "Une copie passe par LinksClipboard, qui la dit (#18311).")
        let hub = try code("LinksHubView")
        XCTAssertTrue(hub.contains("enum LinksClipboard"))
        XCTAssertTrue(hub.contains("UIAccessibility.post(notification: .announcement"))
        XCTAssertTrue(hub.contains("FeedbackToastManager.shared.showSuccess(message)"))
        XCTAssertTrue(hub.contains("message: String = ShareLinkDetailCopy.copied"))
    }

    func test_deleteFailure_whenTheServerRefuses_isSaid() throws {
        let tracking = try code("TrackingLinkDetailView")
        XCTAssertFalse(tracking.contains("catch { /* handle if needed */ }"), "Une suppression en échec ne se tait pas (#18311).")
        XCTAssertTrue(tracking.contains("FeedbackToastManager.shared.showError(ShareLinkDetailCopy.actionFailed)"))
        let affiliate = try code("AffiliateView")
        XCTAssertTrue(affiliate.contains("FeedbackToastManager.shared.showError(ShareLinkDetailCopy.actionFailed)"),
                      "La suppression d'un lien de parrainage refusée se dit, pas seulement par un retour haptique.")
    }
}
