import XCTest
import MeeshySDK
@testable import Meeshy

/// L'épure des réglages et des liens (#17584, lot iOS 1/3, #17652, onze constats).
///
/// Un libellé NOMME ; une rangée inerte n'est pas à l'écran ; un état vide tient en une ligne plus l'action ;
/// ce qui est PROPRE À MEESHY (lien de suivi, parrainage, Flamme) garde SA phrase, lisible au repos (règle 7) ;
/// une liste d'objets à surveiller montre ce qui permet d'en reconnaître un : son nom et ses dates.
/// Aucun texte n'est perdu : une clé sans lecteur quitte les sept langues, un libellé raccourci est traduit.
@MainActor
final class EpureReglagesLiensTests: XCTestCase {

    // MARK: - Lecture des catalogues et des sources

    private static let repoRoot: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

    private typealias Catalog = [String: [String: String]]

    private func app() throws -> Catalog {
        let data = try Data(contentsOf: Self.repoRoot.appendingPathComponent("apps/ios/Meeshy/Localizable.xcstrings"))
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(root["strings"] as? [String: Any])
        return strings.reduce(into: Catalog()) { result, entry in
            let localizations = ((entry.value as? [String: Any])?["localizations"] as? [String: Any]) ?? [:]
            result[entry.key] = localizations.reduce(into: [String: String]()) { values, locale in
                if let unit = (locale.value as? [String: Any])?["stringUnit"] as? [String: Any], let value = unit["value"] as? String {
                    values[locale.key] = value
                }
            }
        }
    }

    private func code(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: Self.repoRoot.appendingPathComponent("apps/ios/Meeshy/" + relativePath), encoding: .utf8))
    }

    private func specifiers(in text: String) -> [String] {
        let regex = try? NSRegularExpression(pattern: #"%(\d+\$)?(@|lld|d|ld)"#)
        let range = NSRange(text.startIndex..., in: text)
        return (regex?.matches(in: text, range: range) ?? []).compactMap { Range($0.range, in: text).map { String(text[$0]) } }.sorted()
    }

    private func shippedSources() throws -> String {
        let roots = ["apps/ios/Meeshy", "packages/MeeshySDK/Sources"].map { Self.repoRoot.appendingPathComponent($0) }
        return try roots.flatMap { root -> [String] in
            let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)
            return try (walker?.allObjects as? [URL] ?? [])
                .filter { $0.pathExtension == "swift" }
                .map { AppSourceGuard.stripComments(try String(contentsOf: $0, encoding: .utf8)) }
        }.joined(separator: "\n")
    }

    private static let settingsViews = "Features/Settings/Views/"
    private static let linksViews = "Features/Links/Views/"
    private static let otherLanguages = ["en", "es", "pt-BR", "de", "it", "ar"]

    // MARK: - Le nouveau français de chaque libellé (règles 1, 2, 4, 6 et 7)

    private static let french: [String: String] = [
        "settings.notifications.game": "Jeu : duo, joute, voyage",
        "settings.tools.progression.hint": "Vos médailles, votre niveau et votre Flamme",
        "settings.notifications.email": "E-mail",
        "settings.security.email": "E-mail",
        "settings.security.email.current": "E-mail actuel",
        "settings.security.email.new": "Nouvel e-mail",
        "settings.security.email.resend_email": "Renvoyer l'e-mail",
        "settings.security.email.resend_failed": "Impossible de renvoyer l'e-mail",
        "settings.security.email.verification_sent": "E-mail de vérification envoyé",
        "links.hub.affiliate.title": "Parrainage",
        "links.hub.affiliate.description": "Invitez et suivez qui s'inscrit par vos liens",
        "links.hub.affiliate.create.a11y": "Créer un lien de parrainage",
        "links.hub.tracking.create.a11y": "Créer un lien de suivi",
        "tracking.links.create.a11y": "Créer un lien de suivi",
        "tracking.link.create.title": "Nouveau lien de suivi",
        "tracking.links.empty.title": "Aucun lien de suivi",
        "tracking.links.orientation": "Un lien de suivi compte les clics et dit d'où ils viennent.",
        "affiliate.orientation": "Ceux qui s'inscrivent par votre lien de parrainage vous sont rattachés.",
        "links.row.created": "Créé le %@",
        "tracking.links.row.lastClick": "Dernier clic %@",
    ]

    /// Le même mot dans deux langues n'est pas une copie : le lexique lui-même le dit (E-mail, Contacts).
    private static let sameWordAsFrenchByDesign: Set<String> = [
        "settings.notifications.email", "settings.security.email",
    ]

    func test_catalog_shortenedAndRevealedLabels_sayTheirNewFrench() throws {
        let app = try app()
        for (key, expected) in Self.french { XCTAssertEqual(app[key]?["fr"], expected, key) }
    }

    func test_catalog_shortenedAndRevealedLabels_areTranslatedInTheSixOtherLanguages_neverCopiedFromFrench() throws {
        let app = try app()
        for key in Self.french.keys {
            let values = app[key] ?? [:]
            let french = try XCTUnwrap(values["fr"], key)
            for language in Self.otherLanguages {
                let value = try XCTUnwrap(values[language], "\(key) [\(language)]")
                XCTAssertFalse(value.isEmpty, "\(key) [\(language)]")
                if !Self.sameWordAsFrenchByDesign.contains(key) {
                    XCTAssertNotEqual(value, french, "\(key) [\(language)] : copié du français")
                }
                XCTAssertEqual(specifiers(in: value), specifiers(in: french), "\(key) [\(language)] : mêmes marqueurs que le français")
            }
        }
    }

    /// Les mots du jeu (joute, voyage, médaille, Flamme) sont ceux du jeu, dans chaque langue : un seul vocabulaire.
    func test_gameWords_inNotificationsAndProgression_areTheOnesTheGameUses_inEveryLanguage() throws {
        let app = try app()
        let game: [String: [String]] = [
            "fr": ["joute", "voyage"], "en": ["joust", "journey"], "es": ["justa", "viaje"], "pt-BR": ["torneio", "viagem"],
            "de": ["turnier", "reise"], "it": ["torneo", "viaggio"], "ar": ["مبارزة", "رحلة"],
        ]
        for (language, words) in game {
            let line = try XCTUnwrap(app["settings.notifications.game"]?[language], language).lowercased()
            for word in words { XCTAssertTrue(line.contains(word), "settings.notifications.game [\(language)] : « \(line) » ne dit pas « \(word) »") }
            XCTAssertFalse(line.contains("ligue") || line.contains("league") || line.contains("saison") || line.contains("season"), "\(language) : « \(line) »")
        }
        let progression: [String: [String]] = [
            "fr": ["médailles", "flamme"], "en": ["medals", "flame"], "es": ["medallas", "llama"], "pt-BR": ["medalhas", "chama"],
            "de": ["medaillen", "flamme"], "it": ["medaglie", "fiamma"], "ar": ["أوسمتك", "لهبك"],
        ]
        for (language, words) in progression {
            let line = try XCTUnwrap(app["settings.tools.progression.hint"]?[language], language).lowercased()
            for word in words { XCTAssertTrue(line.contains(word), "settings.tools.progression.hint [\(language)] : « \(line) » ne dit pas « \(word) »") }
            XCTAssertFalse(line.contains("badge") || line.contains("série") || line.contains("streak"), "\(language) : « \(line) »")
        }
    }

    func test_noUserFacingTrackingWord_isLeftInFrench_theLexiconSaysSuivi() throws {
        let app = try app()
        for key in ["links.hub.tracking.create.a11y", "tracking.links.create.a11y", "tracking.link.create.title", "tracking.links.empty.title"] {
            let french = try XCTUnwrap(app[key]?["fr"], key)
            XCTAssertFalse(french.localizedCaseInsensitiveContains("tracking"), key)
            XCTAssertTrue(french.contains("suivi"), key)
        }
        XCTAssertFalse(try XCTUnwrap(app["links.hub.affiliate.title"]?["fr"]).localizedCaseInsensitiveContains("affili"))
    }

    // MARK: - Ce qui sort : la rangée inerte, le badge, la bannière, la redite (règles 2, 4, 6) — aucune clé sans lecteur ne reste

    private static let removed = [
        "settings.privacy.coming_soon", "settings.privacy.coming_soon.a11y", "settings.privacy.share_data",
        "settings.privacy.block_screenshots", "settings.privacy.contact_requests", "settings.privacy.group_invites",
        "sessions_current_badge", "links.hub.banner.title", "links.hub.banner.subtitle",
        "tracking.links.empty.subtitle", "affiliate.empty.subtitle", "settings.privacy.contacts_groups",
    ]

    func test_removedKeys_areGoneFromEveryLanguage_andNoSourceReadsThemAnymore() throws {
        let app = try app(), sources = try shippedSources()
        for key in Self.removed {
            XCTAssertNil(app[key], "\(key) : encore au catalogue")
            XCTAssertFalse(sources.contains("\"\(key)\""), "\(key) : une source la lit encore")
        }
    }

    // MARK: - Confidentialité : une rangée sans effet n'est pas à l'écran (règle 6)

    func test_privacy_theFourInertRows_areNotOnTheScreenAtRest() throws {
        let view = try code(Self.settingsViews + "PrivacySettingsView.swift")
        XCTAssertFalse(view.contains("isComingSoon"), "plus de rangée grisée « Bientôt disponible »")
        XCTAssertFalse(view.contains("comingSoon"))
        for keyPath in ["\\.blockScreenshots", "\\.shareUsageData", "\\.allowContactRequests", "\\.allowGroupInvites"] {
            XCTAssertFalse(view.contains(keyPath), "\(keyPath) : une rangée sans effet reste à l'écran")
        }
        XCTAssertTrue(view.contains("\\.acceptCallsFromNonContacts"), "la rangée qui a un effet reste")
        XCTAssertTrue(view.contains("\\.allowAnalytics"))
    }

    /// Les deux rangées des Appels vivent sous le MÊME titre : sorties les demandes de contact et les invitations,
    /// une section « Contacts » qui ne portait plus qu'« Appels hors contacts » se lisait comme un réglage de contacts.
    func test_privacy_callsFromNonContacts_livesUnderCalls_withTheHiddenAddress_noLoneContactsSection() throws {
        let view = try code(Self.settingsViews + "PrivacySettingsView.swift")
        XCTAssertFalse(view.contains("contactsSection"))
        let calls = try XCTUnwrap(view.range(of: "private var callsSection").map { String(view[$0.lowerBound...]) })
        let callsBody = calls.components(separatedBy: "private var encryptionSection")[0]
        XCTAssertTrue(callsBody.contains("\\.acceptCallsFromNonContacts"), "Appels hors contacts est une rangée des Appels")
        XCTAssertTrue(callsBody.contains("settings.privacy.calls.hide_ip"))
    }

    /// La rangée « Parrainage » des réglages dit ce que dit l'écran qu'elle ouvre : le parrainage invite et compte les
    /// inscrits, il ne promet aucune récompense que rien dans Meeshy ne verse.
    func test_settingsAffiliateRow_saysWhatTheReferralScreenDoes_noPromisedReward() throws {
        XCTAssertEqual(SettingsOrientation.affiliate, "Invitez et suivez qui s'inscrit par vos liens")
        XCTAssertFalse(SettingsOrientation.affiliate.lowercased().contains("récompense"))
        let app = try app()
        XCTAssertNil(app["settings.tools.affiliate.hint"], "la phrase vit sous une seule clé, celle de l'écran des liens")
    }

    // MARK: - Sessions : le titre de section suffit, la rangée garde ses dates

    func test_sessions_currentDevice_isNamedOnceByItsSectionTitle_notAgainByABadge() throws {
        let view = try code(Self.settingsViews + "ActiveSessionsView.swift")
        XCTAssertTrue(view.contains("sessions.section.current"))
        XCTAssertFalse(view.contains("sessions_current_badge"))
        XCTAssertFalse(view.contains("Capsule().fill(MeeshyColors.success)"), "le badge vert est retiré")
        XCTAssertEqual(try app()["sessions.section.current"]?["fr"], "Cet appareil")
    }

    func test_sessions_currentRow_stillShowsWhenItWasOpened_andThatItIsActive() throws {
        let session: UserSession = JSONStub.decode("""
        { "id": "s1", "createdAt": "2026-10-01T08:00:00.000Z", "isCurrentSession": true }
        """)
        let row = SessionRowPresentation(session, locale: Locale(identifier: "fr_FR"))
        XCTAssertTrue(row.isCurrent)
        XCTAssertTrue(row.opened.contains("2026"), row.opened)
        XCTAssertNotNil(row.activity)
    }

    // MARK: - Mes liens : la bannière qui redit le titre s'en va, les cartes gardent leur phrase (règles 2 et 7)

    func test_linksHub_hasNoBanner_andEveryCardKeepsItsOrientationSentence() throws {
        let hub = try code(Self.linksViews + "LinksHubView.swift")
        XCTAssertFalse(hub.contains("headerBanner"))
        XCTAssertFalse(hub.contains("links.hub.banner"))
        for key in ["links.hub.share.description", "links.hub.tracking.description", "links.hub.community.description", "links.hub.affiliate.description"] {
            XCTAssertTrue(hub.contains("\"\(key)\""), "\(key) : la phrase d'orientation de la carte reste lisible au repos")
        }
        XCTAssertTrue(hub.contains("defaultValue: \"Parrainage\""))
        XCTAssertTrue(hub.contains("defaultValue: \"Créer un lien de parrainage\""))
        XCTAssertTrue(hub.contains("defaultValue: \"Créer un lien de suivi\""))
    }

    // MARK: - Liens de suivi et parrainage : l'état vide, une ligne plus l'action (règle 4)

    func test_trackingEmpty_isOneLinePlusTheCreateAction() throws {
        let view = try code(Self.linksViews + "TrackingLinksView.swift")
        XCTAssertTrue(view.contains("tracking.links.empty.title"))
        XCTAssertFalse(view.contains("tracking.links.empty.subtitle"))
        XCTAssertTrue(view.contains("actionLabel:"), "l'état vide porte l'action de création")
        XCTAssertFalse(view.contains("defaultValue: \"Aucun lien de tracking\""))
    }

    func test_affiliateEmpty_isOneLinePlusTheCreateAction() throws {
        let view = try code(Self.linksViews + "AffiliateView.swift")
        XCTAssertTrue(view.contains("affiliate.empty.title"))
        XCTAssertFalse(view.contains("affiliate.empty.subtitle"))
        XCTAssertTrue(view.contains("affiliate.action.create"))
        XCTAssertTrue(view.contains("Button"), "l'action de l'état vide est un bouton")
    }

    // MARK: - Liens de suivi et parrainage : la phrase d'orientation est lisible au repos, jamais derrière un (i) (règle 7)

    func test_trackingAndAffiliate_sayWhatALinkDoes_atRest() throws {
        for (file, key) in [("TrackingLinksView.swift", "tracking.links.orientation"), ("AffiliateView.swift", "affiliate.orientation")] {
            let view = try code(Self.linksViews + file)
            XCTAssertTrue(view.contains("\"\(key)\""), "\(file) : la phrase d'orientation n'est pas lue")
            XCTAssertTrue(view.contains("SettingsSentence"), "\(file) : la phrase se rend au repos, sous l'en-tête")
            XCTAssertFalse(view.contains("MeeshyInfoNote"), "\(file) : l'unique explication d'une feature propre à Meeshy ne passe pas derrière un (i)")
        }
    }

    // MARK: - Chaque rangée de lien montre ce qui permet de la reconnaître : ses dates (règle 7)

    private func trackingLink(createdAt: String, lastClickedAt: String?) -> TrackingLink {
        let last = lastClickedAt.map { "\"\($0)\"" } ?? "null"
        return JSONStub.decode("""
        { "id": "t1", "token": "abc", "name": "Rentrée", "campaign": null, "source": null, "medium": null,
          "originalUrl": "https://example.com", "shortUrl": "https://meeshy.me/l/abc", "totalClicks": 3, "uniqueClicks": 2,
          "isActive": true, "expiresAt": null, "createdAt": "\(createdAt)", "lastClickedAt": \(last) }
        """)
    }

    func test_trackingRow_saysWhenTheLinkWasCreated_andWhenItWasLastClicked() {
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        let link = trackingLink(createdAt: "2026-10-01T08:00:00.000Z", lastClickedAt: "2026-11-02T10:00:00.000Z")
        let line = TrackingLinkRowDates.line(for: link, now: now, locale: Locale(identifier: "fr_FR"))
        XCTAssertTrue(line.contains("2026"), line)
        XCTAssertTrue(line.contains(" · "), "création et dernier clic sont deux dates : \(line)")
        XCTAssertTrue(line.contains(String(localized: "tracking.links.row.lastClick", bundle: .main).replacingOccurrences(of: "%@", with: "")), line)
    }

    func test_trackingRow_neverClicked_saysOnlyWhenItWasCreated_andInventsNoClickDate() {
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        let line = TrackingLinkRowDates.line(for: trackingLink(createdAt: "2026-10-01T08:00:00.000Z", lastClickedAt: nil), now: now, locale: Locale(identifier: "fr_FR"))
        XCTAssertTrue(line.contains("2026"), line)
        XCTAssertFalse(line.contains(" · "), line)
    }

    func test_affiliateRow_saysWhenTheLinkWasCreated_andNothingWhenTheDateIsUnreadable() throws {
        let token = { (createdAt: String) in
            AffiliateToken(id: "a1", token: "tok", name: "Rentrée", affiliateLink: nil, maxUses: nil, currentUses: 0,
                           isActive: true, expiresAt: nil, createdAt: createdAt, _count: nil, clickCount: 0)
        }
        let line = AffiliateTokenRowDates.line(for: token("2026-10-01T08:00:00.000Z"), locale: Locale(identifier: "fr_FR"))
        XCTAssertTrue(try XCTUnwrap(line).contains("2026"))
        XCTAssertNil(AffiliateTokenRowDates.line(for: token("pas une date"), locale: Locale(identifier: "fr_FR")), "aucune date inventée")
    }

    func test_linkRows_renderTheirDatesLine() throws {
        XCTAssertTrue(try code(Self.linksViews + "TrackingLinksView.swift").contains("TrackingLinkRowDates.line("))
        XCTAssertTrue(try code(Self.linksViews + "AffiliateView.swift").contains("AffiliateTokenRowDates.line("))
    }
}
