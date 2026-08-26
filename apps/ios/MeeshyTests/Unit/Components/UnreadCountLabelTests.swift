import XCTest
@testable import Meeshy

/// La famille « non-lus » portait CINQ écritures du même libellé, dont quatre
/// fausses au singulier :
///
/// - `accessibility.unread_count` — la seule juste (`variations.plural`,
///   2 formes en 6 locales latines, 6 en arabe) ;
/// - `conversation.scroll-to-bottom.a11y-unread` — doublon mot pour mot de sa
///   forme `other` dans les 7 locales, mais à plat ⇒ « 1 messages non lus » sur
///   le bouton de retour en bas de conversation ;
/// - `unit.unread` — adjectif nu concaténé au nombre par `GlobalSearchView`
///   (`"\(count) " + « non lus »`) : une concaténation ne peut pas accorder, et
///   l'arabe n'en recevait jamais qu'une forme sur six ;
/// - `a11y.notifications.unread_count` — même défaut à plat sur l'autre nom
///   compté de la famille ⇒ « 1 notifications non lues » sur la cloche ;
/// - `a11y.back.with_unread` — déjà correcte, laissée intacte (elle porte en
///   plus le préfixe « Retour, » et n'est donc pas un doublon).
///
/// Cette suite verrouille le contrat unique qui les remplace. Elle reprend
/// l'idiome de `MembersCountLabelTests` (234i), dont elle est le jumeau.
///
/// `bundle` et `locale` vont par PAIRE : le bundle choisit la TABLE, le locale
/// la RÈGLE plurielle. Fixer l'un sans l'autre rendrait le test vert en local et
/// rouge en CI (le simulateur y tourne en anglais).
///
/// `@MainActor` : le target app est isolé main-actor-par-défaut (Swift 6.2).
@MainActor
final class UnreadCountLabelTests: XCTestCase {

    private static let latinLocales = ["fr", "en", "es", "it", "de", "pt-BR"]

    private func bundle(_ code: String) throws -> Bundle {
        let path = try XCTUnwrap(
            Bundle.main.path(forResource: code, ofType: "lproj"),
            "localisation « \(code) » absente du bundle — régression de packaging"
        )
        return try XCTUnwrap(Bundle(path: path))
    }

    private func messages(_ count: Int, in code: String) throws -> String {
        UnreadCountLabel.messages(count, bundle: try bundle(code), locale: Locale(identifier: code))
    }

    private func notifications(_ count: Int, in code: String) throws -> String {
        UnreadCountLabel.notifications(count, bundle: try bundle(code), locale: Locale(identifier: code))
    }

    // MARK: - Le compteur est toujours présent

    func test_labels_containTheCount() throws {
        XCTAssertTrue(try messages(42, in: "en").contains("42"))
        XCTAssertTrue(try messages(42, in: "fr").contains("42"))
        XCTAssertTrue(try notifications(42, in: "en").contains("42"))
        XCTAssertTrue(try notifications(42, in: "fr").contains("42"))
    }

    // MARK: - Messages : accord singulier / pluriel

    /// Régression du défaut porté par `conversation.scroll-to-bottom.a11y-unread`
    /// et par la concaténation de `GlobalSearchView` : « 1 messages non lus ».
    func test_messages_singularInFrench() throws {
        XCTAssertEqual(try messages(1, in: "fr"), "1 message non lu")
    }

    func test_messages_pluralInFrench() throws {
        XCTAssertEqual(try messages(3, in: "fr"), "3 messages non lus")
    }

    func test_messages_singularInEnglish() throws {
        XCTAssertEqual(try messages(1, in: "en"), "1 unread message")
    }

    func test_messages_pluralInEnglish() throws {
        XCTAssertEqual(try messages(3, in: "en"), "3 unread messages")
    }

    func test_messages_singularInSpanish() throws {
        XCTAssertEqual(try messages(1, in: "es"), "1 mensaje sin leer")
    }

    func test_messages_pluralInItalian() throws {
        XCTAssertEqual(try messages(4, in: "it"), "4 messaggi non letti")
    }

    func test_messages_singularInGerman() throws {
        XCTAssertEqual(try messages(1, in: "de"), "1 ungelesene Nachricht")
    }

    func test_messages_pluralInPortuguese() throws {
        XCTAssertEqual(try messages(3, in: "pt-BR"), "3 mensagens não lidas")
    }

    // MARK: - Notifications : accord singulier / pluriel

    /// Régression du défaut de la cloche : `a11y.notifications.unread_count`
    /// était à plat (« %d notifications non lues ») ⇒ « 1 notifications non
    /// lues » dès la première notification.
    func test_notifications_singularInFrench() throws {
        XCTAssertEqual(try notifications(1, in: "fr"), "1 notification non lue")
    }

    func test_notifications_pluralInFrench() throws {
        XCTAssertEqual(try notifications(3, in: "fr"), "3 notifications non lues")
    }

    func test_notifications_singularInEnglish() throws {
        XCTAssertEqual(try notifications(1, in: "en"), "1 unread notification")
    }

    func test_notifications_pluralInEnglish() throws {
        XCTAssertEqual(try notifications(5, in: "en"), "5 unread notifications")
    }

    func test_notifications_singularInItalian() throws {
        XCTAssertEqual(try notifications(1, in: "it"), "1 notifica non letta")
    }

    func test_notifications_singularInGerman() throws {
        XCTAssertEqual(try notifications(1, in: "de"), "1 ungelesene Mitteilung")
    }

    func test_notifications_singularInPortuguese() throws {
        XCTAssertEqual(try notifications(1, in: "pt-BR"), "1 notificação não lida")
    }

    // MARK: - Verrous généraux

    /// Si l'une des locales perd sa `variations.plural`, elle retombe sur une
    /// forme unique et ce test rougit — pour les DEUX noms comptés.
    func test_singularAndPluralDifferInEveryLatinLocale() throws {
        for code in Self.latinLocales {
            XCTAssertNotEqual(
                try messages(1, in: code), try messages(5, in: code),
                "« message non lu » doit s'accorder au nombre en \(code) — variations.plural manquante ?"
            )
            XCTAssertNotEqual(
                try notifications(1, in: code), try notifications(5, in: code),
                "« notification non lue » doit s'accorder au nombre en \(code) — variations.plural manquante ?"
            )
        }
    }

    /// Les deux noms comptés n'ont ni le même genre ni le même mot : les
    /// fusionner en une clé unique paramétrée par le nom regraverait l'accord
    /// dans le code. Ce test rougit si quelqu'un le tente.
    func test_messagesAndNotificationsAreDistinctLabels() throws {
        for code in Self.latinLocales {
            XCTAssertNotEqual(try messages(3, in: code), try notifications(3, in: code), code)
        }
    }

    /// Régression arabe : les formes à plat servaient la même chaîne à tous les
    /// effectifs. L'arabe distingue six catégories CLDR — le singulier, le duel
    /// et la plage 3–10 doivent différer.
    func test_arabicDistinguishesItsPluralCategories() throws {
        let one = try messages(1, in: "ar")
        let two = try messages(2, in: "ar")
        let few = try messages(3, in: "ar")
        XCTAssertNotEqual(one, two, "l'arabe distingue le singulier du duel")
        XCTAssertNotEqual(two, few, "l'arabe distingue le duel de la plage 3–10")

        let oneNotif = try notifications(1, in: "ar")
        let twoNotif = try notifications(2, in: "ar")
        let fewNotif = try notifications(3, in: "ar")
        XCTAssertNotEqual(oneNotif, twoNotif)
        XCTAssertNotEqual(twoNotif, fewNotif)
    }

    /// Aucune forme arabe ne doit porter de caractère latin greffé — le défaut
    /// que 232i avait soldé pour les membres, et que la concaténation de
    /// `unit.unread` rendait à nouveau possible ici.
    func test_arabicCarriesNoLatinLetter() throws {
        for count in [0, 1, 2, 3, 11, 100] {
            for value in [try messages(count, in: "ar"), try notifications(count, in: "ar")] {
                XCTAssertNil(
                    value.range(of: "[A-Za-z]", options: .regularExpression),
                    "aucune lettre latine ne doit apparaître dans la forme arabe : \(value)"
                )
            }
        }
    }

    /// Garde héritée de 235i : un spécificateur non substitué serait énoncé tel
    /// quel par VoiceOver.
    func test_labels_neverLeakAFormatSpecifier() throws {
        for code in Self.latinLocales + ["ar"] {
            for count in [0, 1, 2, 3, 11, 199] {
                for value in [try messages(count, in: code), try notifications(count, in: code)] {
                    for specifier in ["%lld", "%d", "%@", "%1$@", "%ld"] {
                        XCTAssertFalse(
                            value.contains(specifier),
                            "aucun spécificateur ne doit atteindre VoiceOver (\(specifier), \(code), count=\(count)) : \(value)"
                        )
                    }
                }
            }
        }
    }

    // MARK: - Gardes de source : les quatre surfaces passent par le helper

    /// Les assertions cherchent la forme **CITÉE** des clés retirées, jamais le
    /// nom nu : le helper et le bouton de défilement les mentionnent en prose
    /// (entre accents graves) pour expliquer le défaut soldé, et une garde sur
    /// le nom nu rougirait sur son propre commentaire — leçon 235i.
    func test_everyUnreadCounterGoesThroughTheLabel() throws {
        let sites: [(path: String, call: String)] = [
            ("Meeshy/Features/Main/Views/ThemedConversationRow.swift", "UnreadCountLabel.messages("),
            ("Meeshy/Features/Main/Views/ConversationView+ScrollIndicators.swift", "UnreadCountLabel.messages("),
            ("Meeshy/Features/Main/Views/GlobalSearchView.swift", "UnreadCountLabel.messages("),
            ("Meeshy/Features/Main/Views/RootView.swift", "UnreadCountLabel.notifications("),
            // Un cinquième site a vécu ici — `Lentille/Mode/LentilleFocusCard.swift`,
            // découvert par la CI parce que 235i avait retiré
            // `accessibility.unread_messages` du catalogue en ne corrigeant que
            // DEUX de ses trois porteurs. Il n'a plus de SUJET depuis le
            // 2026-08-23 : la carte de magnification a été dissoute, et le
            // compteur qu'elle peignait n'existe plus — la rangée monte l'atome
            // partagé `UnreadCountBadge`, décoratif à l'intérieur d'un élément
            // combiné, et le compte est annoncé par le libellé de RANGÉE, qui
            // dérive de `ThemedConversationRow` (site 1 ci-dessus).
            //
            // Seule l'assertion POSITIVE disparaît avec son sujet. La moitié
            // NÉGATIVE — les clés retirées du catalogue ne doivent réapparaître
            // nulle part — est ce qui avait attrapé l'orpheline, et elle survit
            // en balayant les deux dossiers Lentille (boucle ci-dessous), qui
            // n'ont plus de site nommé dans cet inventaire.
        ]
        let retiredKeyScopes = [
            "Meeshy/Features/Main/Lentille/Mode",
            "Meeshy/Features/Main/Lentille/Row"
        ]
        for site in sites {
            let source = try iosSource(at: site.path)
            XCTAssertTrue(
                source.contains(site.call),
                "\(site.path) doit composer son compteur de non-lus via \(site.call)"
            )
            for removed in [
                "\"conversation.scroll-to-bottom.a11y-unread\"",
                "\"unit.unread\"",
                "\"accessibility.unread_messages\""
            ] {
                XCTAssertFalse(
                    source.contains(removed),
                    "\(site.path) : clé retirée du catalogue, elle ne doit plus être référencée en code"
                )
            }
        }

        for scope in retiredKeyScopes {
            let directory = try iosRootURL().appendingPathComponent(scope)
            let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
                .filter { $0.pathExtension == "swift" }
            XCTAssertFalse(
                files.isEmpty,
                "Le balayage n'a chargé AUCUN fichier depuis \(scope) — une garde qui lit zéro " +
                "fichier passe TOUJOURS au vert sans avoir rien vérifié (leçon 257)."
            )
            for file in files {
                let source = try String(contentsOf: file, encoding: .utf8)
                for removed in [
                    "\"conversation.scroll-to-bottom.a11y-unread\"",
                    "\"unit.unread\"",
                    "\"accessibility.unread_messages\""
                ] {
                    XCTAssertFalse(
                        source.contains(removed),
                        "\(file.lastPathComponent) : clé retirée du catalogue, elle ne doit plus être référencée en code"
                    )
                }
            }
        }
    }

    /// La concaténation elle-même ne doit pas revenir : c'est la forme d'écriture
    /// qui produisait « 1 non lus », et elle est invisible à toute garde portant
    /// sur une clé.
    func test_noSurfaceConcatenatesTheCountWithABareUnit() throws {
        let source = try iosSource(at: "Meeshy/Features/Main/Views/GlobalSearchView.swift")
        XCTAssertFalse(
            source.contains("unreadUnit"),
            "le nom au pluriel nu ne doit plus être collé au nombre — une concaténation ne peut pas accorder"
        )
    }

    private func iosRootURL() throws -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Components
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
    }

    private func iosSource(at relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Components
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
        return try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
    }
}
