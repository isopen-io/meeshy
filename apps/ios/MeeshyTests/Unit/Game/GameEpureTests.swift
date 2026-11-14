import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// L'épure du jeu (#17584, lot iOS 1/3 « le jeu montre des valeurs, ses règles sont à un toucher », #17687) :
/// clés `game.*` et `game2.*`. Un libellé NOMME, une phrase ne redit ni le titre ni le contrôle voisin, l'explication
/// de détail passe derrière un (i) dont le nom est la QUESTION, et les repères propres à Meeshy (joute, alliance,
/// voyage, Atlas, Chronique, Veilleuses) restent LISIBLES AU REPOS (règle 7).
///
/// Les textes se testent dans le catalogue (c'est lui qui s'affiche, jamais le `defaultValue`), les vues par leur
/// source (elles ne se construisent pas hors environnement), les modèles par leur comportement.
@MainActor
final class GameEpureTests: XCTestCase {

    // MARK: - Lecture du catalogue et des sources

    private static let repoRoot: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

    private typealias Catalog = [String: [String: String]]

    private static func catalog() throws -> Catalog {
        let data = try Data(contentsOf: repoRoot.appendingPathComponent("apps/ios/Meeshy/Localizable.xcstrings"))
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

    private static let otherLanguages = ["en", "es", "pt-BR", "de", "it", "ar"]

    private func code(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(relativePath))
    }

    private func specifiers(in text: String) -> [String] {
        let regex = try? NSRegularExpression(pattern: #"%(\d+\$)?(@|lld|d|ld)"#)
        let range = NSRange(text.startIndex..., in: text)
        return (regex?.matches(in: text, range: range) ?? []).compactMap { Range($0.range, in: text).map { String(text[$0]) } }.sorted()
    }

    // MARK: - Le nouveau français de chaque libellé raccourci (règles 1, 2 et 4)

    private static let french: [String: String] = [
        "game2.settings.celebrations.switch": "Signes des aïeux",
        "game2.settings.notifications.switch": "Notifications",
        "game2.settings.notifications.body": "Alliance, joute, voyage : au plus une par jour, sur tous tes appareils.",
        "game2.settings.friends_league.switch": "Me retirer",
        "game2.settings.friends_league.body": "Classement de la semaine entre amis acceptés. T’en retirer vous masque les uns aux autres.",
        "game2.settings.visibility.body": "Choisis qui voit ton rang, ton Héritage, tes trophées et ton Atlas",
        "game2.settings.hidden.body": "Masque le jeu et le ferme aux autres ; rien n’est perdu.",
        "game2.league.pseudonym.invalid": "Nom non valable : lettres, chiffres, point, tiret, tiret bas.",
        "game2.league.pseudonym.hint_change": "3 à 20 caractères. Ni ton nom, ni ton identifiant.",
        "game2.league.friends.body": "Étincelles de la semaine entre amis acceptés. Toujours ouverte, rien à accepter.",
        "game2.season.how": "Actes et alliance font avancer le voyage : %@ pas par halte. Tout est gratuit.",
        "game2.season.seal.body": "Objet décoratif, une fois toutes les %@ haltes. Sans effet sur le jeu.",
        "game2.atlas.intro": "Un tampon par langue vraiment échangée : un message envoyé, un reçu.",
        "game2.atlas.privacy": "Ton Atlas est privé par défaut : une langue peut en dire long sur toi.",
        "game2.atlas.empty": "Pas encore de tampon : écris dans une autre langue.",
        "game2.showcase.visibility_hint": "Un visiteur ne voit que le mois d’obtention, jamais la date exacte.",
        "game2.showcase.empty": "Tes trophées t’attendent : coupes de joute et de voyage, Renaissance, Flamme.",
        "game.flame_panel.freeze_full": "Tes Veilleuses sont au complet.",
        "game.photo.camera.unavailable": "Caméra indisponible. Choisis une photo dans ta galerie, ou garde la carte seule.",
    ]

    func test_catalog_shortenedLabels_sayTheirNewFrench() throws {
        let catalog = try Self.catalog()
        for (key, expected) in Self.french {
            XCTAssertEqual(catalog[key]?["fr"], expected, key)
        }
    }

    func test_catalog_shortenedLabels_areTranslatedInTheSixOtherLanguages_neverCopiedFromFrench() throws {
        let catalog = try Self.catalog()
        let keys = Array(Self.french.keys) + [
            "game.notebook.when", "game.notebook.when.note", "game.door.notebook.line",
            "game.rules.step.meaning",
        ]
        let sameInEnglish: Set<String> = ["game2.settings.notifications.switch"]
        for key in keys {
            let values = catalog[key] ?? [:]
            let french = try XCTUnwrap(values["fr"], key)
            for language in Self.otherLanguages {
                let value = try XCTUnwrap(values[language], "\(key) [\(language)]")
                XCTAssertFalse(value.isEmpty, "\(key) [\(language)]")
                if !(language == "en" && sameInEnglish.contains(key)) {
                    XCTAssertNotEqual(value, french, "\(key) [\(language)] : copié du français")
                }
                XCTAssertEqual(specifiers(in: value), specifiers(in: french), "\(key) [\(language)] : mêmes marqueurs que le français")
            }
        }
    }

    /// Un libellé qui sort du réglage tient en une ligne : sous 160 caractères, et l'état vide ou le sous-titre sous 120.
    func test_catalog_shortenedLabels_holdInOneOrTwoLines() throws {
        let catalog = try Self.catalog()
        let limit: [String: Int] = [
            "game2.settings.celebrations.switch": 30, "game2.settings.notifications.switch": 30,
            "game2.settings.friends_league.switch": 20, "game2.settings.hidden.body": 60, "game2.league.snapshot": 50,
            "game2.atlas.privacy": 80, "game2.league.pseudonym.invalid": 80,
            "game2.league.pseudonym.hint_change": 60, "game2.atlas.empty": 80, "game2.showcase.empty": 120,
            "game.flame_panel.freeze_full": 60, "game.photo.camera.unavailable": 100,
            "game2.atlas.intro": 100, "game2.league.friends.body": 100,
            "game2.season.how": 100, "game2.season.seal.body": 100, "game2.settings.notifications.body": 100,
            "game2.showcase.visibility_hint": 100, "game2.settings.visibility.body": 120,
            "game2.settings.friends_league.body": 120,
        ]
        for (key, maximum) in limit {
            let value = try XCTUnwrap(catalog[key]?["fr"], key)
            XCTAssertLessThanOrEqual(value.count, maximum, "\(key) : \(value)")
        }
    }

    /// Le titre du bloc porte « Joute des amis », la rangée dit « Me retirer » : le libellé visible NOMME le geste. Lu SEUL
    /// par le lecteur d'écran, le commutateur dit pourtant de quoi l'on se retire — son nom parlé reprend le titre.
    func test_friendsLeagueSwitch_isShortOnScreen_butSpokenWithTheNameOfTheJoustItLeaves() throws {
        let catalog = try Self.catalog()
        let title = try XCTUnwrap(catalog["game2.settings.friends_league.title"])
        let switchLabel = try XCTUnwrap(catalog["game2.settings.friends_league.switch"])
        let joust: [String: String] = ["fr": "joute des amis", "en": "Friends’ Joust", "es": "Justa de los amigos", "pt-BR": "Torneio dos amigos",
                                       "de": "Turnier der Freunde", "it": "Torneo degli amici", "ar": "مبارزة الأصدقاء"]
        for (language, name) in joust {
            XCTAssertTrue((title[language] ?? "").lowercased().contains(name.lowercased()), "\(language) : le titre nomme la joute")
            XCTAssertFalse((switchLabel[language] ?? "").lowercased().contains(name.lowercased()), "\(language) : « \(switchLabel[language] ?? "") » redit le titre du bloc")
        }
        let view = try code("Meeshy/Features/Game/Wave2/GameSettingsViews.swift")
        XCTAssertTrue(view.contains("label: GameText.settingsFriendsLeagueSwitch"))
        XCTAssertTrue(view.contains("spokenLabel: \"\\(GameText.settingsFriendsLeagueTitle), \\(GameText.settingsFriendsLeagueSwitch)\""), "le nom parlé reprend le titre du bloc")
        let parts = try code("Meeshy/Features/Game/Wave2/GameWave2Parts.swift")
        XCTAssertTrue(parts.contains(".accessibilityLabel(spokenLabel ?? label)"))
    }

    // MARK: - Ce qui sort du texte : la redite, jamais la conséquence

    func test_catalog_theTitleRepeatingSentences_areGone_inEveryLanguage() throws {
        let catalog = try Self.catalog()
        let visibility = try XCTUnwrap(catalog["game2.settings.visibility.body"])
        for (language, value) in visibility {
            XCTAssertFalse(value.contains("Ces réglages") || value.contains("These settings"), "\(language) : « \(value) »")
        }
        // La première phrase — la présence, propre à Meeshy — reste dans les sept langues.
        for language in ["fr"] + Self.otherLanguages {
            XCTAssertFalse((visibility[language] ?? "").isEmpty, language)
        }
        XCTAssertFalse(try XCTUnwrap(catalog["game2.atlas.privacy"]?["fr"]).contains("Tu choisis qui le voit"), "le sélecteur « Qui voit ton Atlas » le dit")
        XCTAssertFalse(try XCTUnwrap(catalog["game2.showcase.visibility_hint"]?["fr"]).contains("Moi seul"), "le nom de l'option est sur l'option")
        XCTAssertFalse(try XCTUnwrap(catalog["game.concept.points.use"]?["fr"]).contains("Ce que tu as reçu reste reçu"), "level.what le dit déjà")
    }

    /// Frapper une Meesh fait baisser le niveau : seule la fiche du niveau dit que la joute et l'alliance déjà ouvertes ne se referment pas.
    /// Ni `level.what` ni les règles ne le disent ; retirer la phrase la rendait introuvable.
    func test_levelConcept_saysTheJoustAndAllianceStayOpen_whenTheLevelDrops_inEveryLanguage() throws {
        let catalog = try Self.catalog()
        let use = try XCTUnwrap(catalog["game.concept.level.use_cases"])
        let stayOpen: [String: String] = ["fr": "le restent", "en": "stay open", "es": "siguen abiertas", "pt-BR": "continuam abertos",
                                          "de": "bleiben Turnier und Bündnis offen", "it": "restano aperti", "ar": "مفتوحين"]
        for (language, fragment) in stayOpen {
            XCTAssertTrue((use[language] ?? "").contains(fragment), "\(language) : « \(use[language] ?? "") » ne dit plus que la joute et l'alliance restent ouvertes")
        }
        let copy = try code("Meeshy/Features/Game/ProgressionConceptCopy.swift")
        XCTAssertTrue(copy.contains("la joute et l’alliance le restent"))
    }

    /// La Joute des amis se joue ENTRE AMIS ACCEPTÉS : « ouverte à tous » contredisait la phrase qu'elle suit.
    /// Ce qui est ouvert, c'est l'accès (aucun niveau, aucun consentement), pas l'audience.
    func test_friendsLeagueBody_neverSaysOpenToAll_itSaysAlwaysOpen_inEveryLanguage() throws {
        let body = try XCTUnwrap(try Self.catalog()["game2.league.friends.body"])
        let alwaysOpen: [String: String] = ["fr": "Toujours ouverte", "en": "Always open", "es": "Siempre abierta", "pt-BR": "Sempre aberta",
                                            "de": "Immer offen", "it": "Sempre aperta", "ar": "مفتوحة دائمًا"]
        let openToAll = ["à tous", "to all", "a todos", "für alle", "a tutti", "للجميع"]
        for (language, fragment) in alwaysOpen {
            let value = body[language] ?? ""
            XCTAssertTrue(value.contains(fragment), "\(language) : « \(value) »")
            XCTAssertFalse(openToAll.contains { value.contains($0) }, "\(language) : « \(value) » dit la joute ouverte à tous")
        }
    }

    /// Le glossaire disait tout ce qui fait grandir la gloire ; réduit à sa première phrase, il a emporté la joute et le
    /// voyage, que la fiche du Rang ne disait pas. La fiche les dit désormais, dans les sept langues.
    func test_rankConcept_saysTheJoustAndTheJourneyGrowGlory_inEveryLanguage() throws {
        let catalog = try Self.catalog()
        let how = try XCTUnwrap(catalog["game.concept.glory.how"])
        let tip = try XCTUnwrap(catalog["game.concept.glory.tip.2"])
        let joustAndJourney: [String: (String, String)] = [
            "fr": ("joute", "voyage"), "en": ("joust", "journey"), "es": ("justa", "viaje"), "pt-BR": ("torneio", "viagem"),
            "de": ("Turniers", "Reise"), "it": ("torneo", "viaggio"), "ar": ("مبارزة", "رحلة"),
        ]
        for (language, words) in joustAndJourney {
            let page = (how[language] ?? "") + " " + (tip[language] ?? "")
            XCTAssertTrue(page.contains(words.0) && page.contains(words.1), "\(language) : la joute ou le voyage manque à « \(page) »")
        }
        XCTAssertTrue(try XCTUnwrap(tip["fr"]).contains("achève un voyage"))
        let copy = try code("Meeshy/Features/Game/ProgressionConceptCopy.swift")
        XCTAssertTrue(copy.contains("Gravis un cercle de joute, achève un voyage"))
    }

    func test_catalog_theConsequences_andTheLandmarks_stayVisible() throws {
        let catalog = try Self.catalog()
        XCTAssertTrue(try XCTUnwrap(catalog["game2.settings.hidden.body"]?["fr"]).contains("ferme aux autres"), "la conséquence de « Jeu masqué », au repos")
        XCTAssertTrue(try XCTUnwrap(catalog["game2.settings.hidden.body"]?["fr"]).contains("rien n’est perdu"), "ce qui est gardé, au repos")
        XCTAssertTrue(try XCTUnwrap(catalog["game2.settings.hidden.note"]?["fr"]).contains("te retire de la joute publique"), "le détail de « Jeu masqué » n'est pas perdu")
        XCTAssertTrue(try XCTUnwrap(catalog["game2.settings.hidden.note"]?["fr"]).contains("gardés"), "les étincelles et les trophées sont gardés")
        XCTAssertTrue(try XCTUnwrap(catalog["game2.settings.friends_league.body"]?["fr"]).contains("masque"), "se retirer vous masque les uns aux autres")
        XCTAssertTrue(try XCTUnwrap(catalog["game2.atlas.privacy"]?["fr"]).contains("privé par défaut"), "le repère de confidentialité de l'Atlas")
        XCTAssertTrue(try XCTUnwrap(catalog["game2.atlas.privacy.note"]?["fr"]).contains("jamais l’interlocuteur"), "ce que le jeu ne garde pas, derrière son (i)")
        XCTAssertTrue(try XCTUnwrap(catalog["game2.season.how"]?["fr"]).contains("gratuit"), "la gratuité du voyage")
        XCTAssertTrue(try XCTUnwrap(catalog["game2.season.seal.body"]?["fr"]).contains("Sans effet sur le jeu"), "le Sceau ne change rien")
        XCTAssertTrue(try XCTUnwrap(catalog["game2.league.friends.body"]?["fr"]).contains("rien à accepter"), "la Joute des amis est ouverte")
    }

    // MARK: - Les deux phrases « nom de joute non valable » n'en font qu'une

    func test_pseudonymInvalid_isOneSentence_readByOneKey() throws {
        let catalog = try Self.catalog()
        XCTAssertNil(catalog["game.error.league_pseudonym_invalid"],
                     "plus aucun code iOS ne la lit ; Android porte sa propre ligne (strings_epure_jeu.xml)")
        XCTAssertNotNil(catalog["game2.league.pseudonym.invalid"])
        let copy = try code("Meeshy/Features/Game/GameCopy.swift")
        XCTAssertFalse(copy.contains("game.error.league_pseudonym_invalid"), "iOS ne lit plus que la clé game2")
        XCTAssertTrue(copy.contains("GameText.leaguePseudonymInvalid"))
    }

    /// Le formulaire de changement de nom vit dans SA carte (« Ton nom de joute »), loin de l'accord où le nom tiré au
    /// sort est dit : la règle qui protège l'identité dans une joute PUBLIQUE se lit là où l'on tape le nom.
    func test_pseudonymChangeForm_saysTheNameMustNotBeYours_whereTheNameIsTyped() throws {
        let catalog = try Self.catalog()
        XCTAssertTrue(try XCTUnwrap(catalog["game2.league.pseudonym.hint_change"]?["fr"]).contains("Ni ton nom, ni ton identifiant"))
        for language in Self.otherLanguages {
            let value = try XCTUnwrap(catalog["game2.league.pseudonym.hint_change"]?[language], language)
            XCTAssertNotEqual(value, catalog["game2.league.pseudonym.hint_change"]?["fr"], language)
            XCTAssertTrue(value.split(separator: ".").filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.count >= 2, "\(language) : la longueur ET l'anonymat")
        }
        let views = try code("Meeshy/Features/Game/Wave2/GameLeagueViews.swift")
        XCTAssertTrue(views.contains("GameNote(text: GameText.leaguePseudonymHintChange)"), "le formulaire de changement lit la règle")
        XCTAssertTrue(try XCTUnwrap(catalog["game2.league.pseudonym.hint"]?["fr"]).contains("Ni ton nom, ni ton identifiant"))
    }

    // MARK: - Le carnet des règles : le glossaire n'est plus une copie des fiches

    private static let conceptsWithASheet = [
        "level", "points", "meesh", "glory", "flame", "missions", "league", "season", "prestige", "elans", "badges", "defis", "succes",
        "showcase", "atlas",
    ]
    /// Quatre concepts dont le carnet lit la phrase de la fiche (`ConceptText.what`) : leur propre clé n'existe plus.
    private static let glossaryReadsTheSheet: Set<String> = ["points", "meesh", "league", "showcase"]
    private static let conceptsWithoutASheet = ["chest", "treasury", "steps", "tailwind", "duo"]

    func test_glossary_aConceptWithASheet_isOneSentence_inEveryLanguage() throws {
        let catalog = try Self.catalog()
        for concept in Self.conceptsWithASheet where !Self.glossaryReadsTheSheet.contains(concept) {
            let key = "game.rules.concept.\(concept).body"
            for language in ["fr"] + Self.otherLanguages {
                let value = try XCTUnwrap(catalog[key]?[language], "\(key) [\(language)]")
                let inner = value.dropLast().components(separatedBy: ". ")
                XCTAssertEqual(inner.count, 1, "\(key) [\(language)] : une seule phrase, la fiche porte le reste — « \(value) »")
            }
        }
    }

    func test_glossary_theFiveEntriesWithoutASheet_keepTheirWholeBody() throws {
        let catalog = try Self.catalog()
        let minimum = ["chest": 60, "treasury": 100, "steps": 100, "tailwind": 100, "duo": 100]
        for concept in Self.conceptsWithoutASheet {
            let french = try XCTUnwrap(catalog["game.rules.concept.\(concept).body"]?["fr"])
            XCTAssertGreaterThan(french.count, minimum[concept] ?? 100, "\(concept) n'a pas de fiche : le carnet est son seul endroit — « \(french) »")
        }
    }

    func test_glossary_eachSheetStillCarriesWhatTheGlossaryNoLongerSays() throws {
        let catalog = try Self.catalog()
        for concept in Self.conceptsWithASheet {
            for field in ["what", "use"] {
                XCTAssertFalse((catalog["game.concept.\(concept).\(field)"]?["fr"] ?? "").isEmpty, "game.concept.\(concept).\(field)")
            }
        }
    }

    // MARK: - Les (i) : la question est le nom, la note reste lue

    func test_stepNote_questionNamesTheStep_soSevenInfoButtonsTellApart() {
        let notes = (1...7).map { MeeshyInfoNote(question: GameGuideCopy.stepMeaning(index: String($0)), text: "note \($0)") }
        XCTAssertEqual(Set(notes.map(\.id)).count, 7, "un seul (i) s'ouvre : leurs identifiants diffèrent")
        for note in notes {
            XCTAssertFalse(note.question.isEmpty)
            XCTAssertFalse(note.question.localizedCaseInsensitiveContains("Plus d"), "jamais « Plus d'infos »")
        }
    }

    /// Le (i) d'une étape déplie ce qu'elle VEUT DIRE : sa question le demande, avec le mot que porte la rangée
    /// (« Étape N sur 7 »), jamais un « pourquoi » auquel la note ne répond pas, ni « carte » que l'écran ne montre pas.
    func test_stepNote_question_asksWhatTheStepMeans_withTheWordOfItsRow_inEveryLanguage() throws {
        let catalog = try Self.catalog()
        let question = try XCTUnwrap(catalog["game.rules.step.meaning"])
        let row = try XCTUnwrap(catalog["game.guide.step_of"])
        XCTAssertNil(catalog["game.rules.step.why"])
        for language in ["fr"] + Self.otherLanguages {
            let asked = try XCTUnwrap(question[language], language)
            let noun = try XCTUnwrap(row[language]?.components(separatedBy: " ").first, language)
            XCTAssertTrue(asked.lowercased().contains(noun.lowercased()), "\(language) : « \(asked) » ne reprend pas « \(noun) »")
            XCTAssertTrue(asked.hasSuffix("?") || asked.hasSuffix("؟"), "\(language) : « \(asked) » n'est pas une question")
            XCTAssertEqual(specifiers(in: asked).count, 1, language)
        }
    }

    func test_stepNote_onlyOneOpensAtATime() {
        let first = MeeshyInfoNote(question: GameGuideCopy.stepMeaning(index: "1"), text: "a")
        let second = MeeshyInfoNote(question: GameGuideCopy.stepMeaning(index: "2"), text: "b")
        let afterFirst = MeeshyInfoNote.toggled(open: nil, tapped: first.id)
        XCTAssertEqual(MeeshyInfoNote.toggled(open: afterFirst, tapped: second.id), second.id)
        XCTAssertNil(MeeshyInfoNote.toggled(open: second.id, tapped: second.id))
    }

    func test_chronicle_emptyState_isOneLine_andTheExamplesAreBehindAnInfoButton() throws {
        let view = try code("Meeshy/Features/Game/GameNotebookView.swift")
        XCTAssertTrue(view.contains("MeeshyInfoNoted(note: whenNote"), "l'état vide porte le (i)")
        XCTAssertTrue(view.contains("game.notebook.when\""), "le nom du (i) est la question")
        XCTAssertTrue(view.contains("game.notebook.when.note"), "la note porte les exemples de signes")
        let catalog = try Self.catalog()
        XCTAssertFalse(try XCTUnwrap(catalog["game.notebook.empty"]?["fr"]).contains("Flamme de 7 jours"), "les exemples ne sont plus au repos")
        XCTAssertTrue(try XCTUnwrap(catalog["game.notebook.when.note"]?["fr"]).contains("Flamme de 7 jours"), "…mais ils ne sont pas perdus")
        XCTAssertTrue(try XCTUnwrap(catalog["game.notebook.when"]?["fr"]).hasSuffix("?"), "le nom du (i) est une question")
        XCTAssertTrue(try XCTUnwrap(catalog["game.notebook.when.note"]?["fr"]).contains("une photo avec Mee et Meo"), "la précision rejoint le (i)")
    }

    func test_rulesNotebook_stepCard_keepsWhatAndNext_andPutsMeansBehindAnInfoButton() throws {
        let view = try code("Meeshy/Features/Game/GameRulesView.swift")
        XCTAssertTrue(view.contains("Text(card.copy.what)"))
        XCTAssertTrue(view.contains("Text(card.copy.next)"))
        XCTAssertFalse(view.contains("Text(card.copy.means)"), "means n'est plus au repos")
        XCTAssertTrue(view.contains("stepNote(step.index, means: card.copy.means)"))
        XCTAssertTrue(view.contains("MeeshyInfoNoted(note: stepNote"))
        XCTAssertTrue(view.contains(".accessibilityElement(children: .contain)"), "le (i) d'une carte reste atteignable : la carte ne se fond plus en un seul élément")
        let guideCard = try code("Meeshy/Features/Game/GameGuideCardView.swift")
        XCTAssertTrue(guideCard.contains("card.copy.means"), "la carte de Mee garde sa phrase « Ça veut dire »")
    }

    // MARK: - Les repères restent lisibles au repos (règle 7)

    func test_frontList_chronicleRow_saysWhatItIs_withoutOpeningAnything() throws {
        let list = try code("Meeshy/Features/Game/ProgressionFrontList.swift")
        XCTAssertTrue(list.contains("game.door.notebook.line"), "la rangée « La Chronique » porte sa phrase")
        XCTAssertTrue(list.contains("subtitle: String(localized: \"game.door.notebook.line\""))
        let catalog = try Self.catalog()
        XCTAssertEqual(catalog["game.door.notebook.line"]?["fr"], "Tes photos avec Mee et Meo")
    }

    /// Règle 7 : chaque bloc non usuel garde sa phrase d'orientation AU REPOS ; seul le détail secondaire passe derrière
    /// un (i). La phrase du bloc « Mee et Meo » nomme les deux personnages, le titre de carte n'existe plus.
    func test_settings_everyNonUsualBlock_keepsItsOrientationSentenceVisible_andTheDetailIsBehindAnInfoButton() throws {
        let view = try code("Meeshy/Features/Game/Wave2/GameSettingsViews.swift")
        for sentence in [
            "GameNoteInfo(text: GameText.settingsCelebrationsBody, note: GameText.settingsCelebrationsNote",
            "GameNoteInfo(text: GameText.settingsHiddenBody, note: GameText.settingsHiddenNote",
            "GameNoteInfo(text: GameText.settingsVisibilityBody, note: GameText.settingsVisibilityNote",
            "GameNote(text: GameText.settingsFriendsLeagueBody)",
            "GameCard(title: GameText.settingsNotificationsTitle, note: GameText.settingsNotificationsNote)",
        ] {
            XCTAssertTrue(view.contains(sentence), "« \(sentence) » ne se lit plus au repos ou n'a plus son (i)")
        }
        XCTAssertFalse(view.contains("settingsCelebrationsTitle"), "un seul nom : l'interrupteur « Signes des aïeux » ; le titre de carte redisait « Mee et Meo »")
        XCTAssertFalse(view.contains("settingsNotificationsBody"), "la fréquence et la portée sont derrière le (i)")
        XCTAssertTrue(try XCTUnwrap(try Self.catalog()["game2.settings.celebrations.body"]?["fr"]).contains("Mee et Meo"), "le repère propre à Meeshy reste lisible")
    }

    func test_settingsNotes_eachInfoButtonIsNamedByAQuestion_andCarriesTheDetail() throws {
        let catalog = try Self.catalog()
        let questions: [(String, String)] = [
            ("game2.settings.hidden.question", "game2.settings.hidden.note"),
            ("game2.settings.celebrations.question", "game2.settings.celebrations.note"),
            ("game2.settings.notifications.question", "game2.settings.notifications.body"),
            ("game2.settings.visibility.question", "game2.settings.visibility.note"),
            ("game2.atlas.privacy.question", "game2.atlas.privacy.note"),
            ("game2.league.snapshot.question", "game2.league.snapshot.note"),
            ("game2.showcase.visibility_question", "game2.showcase.visibility_hint"),
            ("game.constellation.visibility.question", "game.constellation.visibility"),
            ("game.fiche.how.question", "game.concept.level.how"),
        ]
        let fr: [String: String] = [
            "game2.settings.hidden.question": "Qu’est-ce que « Jeu masqué » ferme ?",
            "game2.settings.celebrations.question": "Ce réglage vaut-il sur mes autres appareils ?",
            "game2.settings.notifications.question": "Combien de notifications le jeu envoie-t-il ?",
            "game2.settings.visibility.question": "Qui voit si je suis en ligne ?",
            "game2.atlas.privacy.question": "Que garde le jeu de mes échanges ?",
            "game2.league.snapshot.question": "Pourquoi le classement est-il figé ?",
            "game2.showcase.visibility_question": "Qu’est-ce qu’un visiteur voit de mes trophées ?",
            "game.constellation.visibility.question": "Qui voit mon ciel ?",
            "game.fiche.how.question": "Comment ça marche ?",
        ]
        for (question, note) in questions {
            XCTAssertEqual(catalog[question]?["fr"], fr[question], question)
            for language in ["fr"] + Self.otherLanguages {
                let asked = try XCTUnwrap(catalog[question]?[language], "\(question) [\(language)]")
                XCTAssertTrue(asked.hasSuffix("?") || asked.hasSuffix("؟"), "\(question) [\(language)] : « \(asked) » n'est pas une question")
                XCTAssertFalse(asked.localizedCaseInsensitiveContains("Plus d"), "jamais « Plus d'infos »")
                if language != "fr" { XCTAssertNotEqual(asked, catalog[question]?["fr"], "\(question) [\(language)] : copié du français") }
                XCTAssertFalse(try XCTUnwrap(catalog[note]?[language], "\(note) [\(language)]").isEmpty)
            }
        }
        XCTAssertEqual(Set(questions.map(\.0)).count, questions.count, "deux (i) ne portent jamais le même nom")
    }

    func test_settingsNotes_theTextsThatLeaveTheScreen_becomeTheNote_sevenLanguages() throws {
        let catalog = try Self.catalog()
        let notes: [String: String] = [
            "game2.settings.hidden.note": "Masque le jeu sur cet appareil, ferme tes trophées, ton rang, ton Héritage et ton Atlas aux autres, te retire de la joute publique. Étincelles et trophées gardés.",
            "game2.settings.visibility.note": "Hors amis acceptés, personne ne voit si tu es en ligne ni quand tu joues.",
            "game2.settings.celebrations.note": "Non : il vaut pour cet appareil seulement.",
            "game2.atlas.privacy.note": "Le jeu garde la langue, les deux sens et la date — jamais l’interlocuteur ni la conversation.",
            "game2.league.snapshot.note": "Personne ne voit qui joue en ce moment. Seule ta ligne est en direct.",
        ]
        for (key, expected) in notes {
            XCTAssertEqual(catalog[key]?["fr"], expected, key)
            for language in Self.otherLanguages {
                let value = try XCTUnwrap(catalog[key]?[language], "\(key) [\(language)]")
                XCTAssertNotEqual(value, expected, "\(key) [\(language)] : copié du français")
            }
        }
    }

    // MARK: - Atlas, joute, vitrine, ciel : le repère reste, le détail passe derrière un (i) (#17687)

    func test_atlas_headerCardHasNoTitleRepeatingThePage_andNoRemainingNote() throws {
        let atlas = try code("Meeshy/Features/Game/Wave2/GameAtlasViews.swift")
        XCTAssertFalse(atlas.contains("GameCard(tint: MeeshyColors.brandPrimary, title: GameText.atlasTitle)"), "le titre de page dit déjà « Atlas des langues »")
        XCTAssertFalse(atlas.contains("atlasRemaining"), "le compte et les pastilles disent les langues à découvrir")
        XCTAssertNotNil(try Self.catalog()["game2.atlas.remaining"], "la ligne de la carte « Atlas » de Progression la lit encore : la clé n'est pas orpheline")
        let card = try code("Meeshy/Features/Game/ProgressionConceptModel.swift")
        XCTAssertTrue(card.contains("GameText.atlasRemaining("), "…et c'est ce lecteur qui la garde")
        XCTAssertTrue(atlas.contains("GameNoteInfo(text: GameText.atlasPrivacy, note: GameText.atlasPrivacyNote"), "la première phrase se lit au repos, la seconde est derrière un (i)")
        XCTAssertTrue(try XCTUnwrap(try Self.catalog()["game2.atlas.privacy"]?["fr"]).contains("privé par défaut"))
    }

    func test_league_snapshotLine_saysItFrozenAtRest_andWhyBehindAnInfoButton() throws {
        let league = try code("Meeshy/Features/Game/Wave2/GameLeagueViews.swift")
        XCTAssertTrue(league.contains("GameNoteInfo(text: GameText.leagueSnapshot, note: GameText.leagueSnapshotNote"))
        XCTAssertEqual(try Self.catalog()["game2.league.snapshot"]?["fr"], "Classement des autres figé chaque jour à 4 h",
                       "ta ligne est en direct : la phrase visible ne dit figé que ce qui l'est")
    }

    func test_showcase_visitorLineAndSkyLine_areBehindInfoButtonsOnTheirCardTitle() throws {
        let views = try code("Meeshy/Features/Game/Wave2/GameShowcaseViews.swift")
        XCTAssertTrue(views.contains("GameCard(title: GameText.showcaseVisibility, note: GameText.showcaseVisibilityNote)"))
        XCTAssertTrue(views.contains("note: GameText.constellationVisibilityNote)"))
        XCTAssertFalse(views.contains("GameNote(text: GameText.showcaseVisibilityHint)"))
        XCTAssertFalse(views.contains("GameNote(text: GameText.constellationVisibility)"))
        let surface = try code("Meeshy/Features/Game/GameSurface.swift")
        XCTAssertTrue(surface.contains("MeeshyInfoNoted(note: note, openNoteID: $openNoteID"), "la carte range sa note derrière le (i) de son titre")
    }

    // MARK: - La fiche : what et why au repos, how derrière « Comment ça marche ? » ou supprimé quand il ne dit rien de plus

    private static let conceptsWithNoHow: Set<ProgressionConcept> = [.meesh, .flame, .elans, .succes]

    func test_conceptHow_isBehindAnInfoButtonNamedByItsQuestion_exceptWhenWhatAlreadySaysIt() {
        for concept in ProgressionConcept.allCases {
            let note = ConceptText.howNote(concept)
            if Self.conceptsWithNoHow.contains(concept) {
                XCTAssertNil(ConceptText.how(concept), "\(concept.rawValue) : `how` redit `what`")
                XCTAssertNil(note, "\(concept.rawValue) : pas de (i) vide")
            } else {
                XCTAssertEqual(note?.question, ConceptText.ficheHow, "\(concept.rawValue)")
                XCTAssertEqual(note?.text, ConceptText.how(concept), "\(concept.rawValue)")
                XCTAssertNotEqual(note?.text, ConceptText.why(concept), "\(concept.rawValue) : un (i) n'est pas un dépotoir")
            }
        }
    }

    func test_conceptSheet_whatAndWhyAreReadAtRest_howIsBehindItsInfoButton() throws {
        let page = try code("Meeshy/Features/Game/ProgressionConceptPage.swift")
        XCTAssertTrue(page.contains("sentence(ConceptText.what(concept))"), "la définition se lit sans rien ouvrir")
        XCTAssertTrue(page.contains("MeeshyInfoNoted(note: ConceptText.howNote(concept)"))
        XCTAssertTrue(page.contains("sentence(ConceptText.why(concept), strong: true)"))
        XCTAssertFalse(page.contains("sentence(ConceptText.how(concept))"), "how n'est plus au repos")
        let catalog = try Self.catalog()
        for concept in Self.conceptsWithNoHow {
            XCTAssertNil(catalog["game.concept.\(concept.rawValue).how"], "\(concept.rawValue) : la clé n'a plus de lecteur, elle est supprimée de toutes les langues")
        }
        XCTAssertNotNil(catalog["game.concept.level.how"])
    }

    func test_flamePanel_fullVigilsLine_isAShortVisibleNote() throws {
        let flame = try code("Meeshy/Features/Game/GameFlamePanelView.swift")
        XCTAssertTrue(flame.contains("game.flame_panel.freeze_full"))
        XCTAssertFalse(flame.contains("MeeshyInfoNote"))
    }

    // MARK: - Épure 2/3 : le glossaire ne redit plus l'atlas, la confirmation ni la règle voisine (#17687)

    private static let frenchSecondPass: [String: String] = [
        "game.rules.2.body": "Ensemble, tes étincelles forment ta lumière, et ton niveau se lit sur elle : un million d’étincelles pour le niveau 100. Une frappe en fige une part, donc le fait baisser.",
        "game.rules.concept.steps.body": "Tous les dix niveaux, de 10 à 100 : frapper une Meesh, réaliser des rêves, tenir une Flamme ou atteindre un rang. Tant qu’elle n’est pas réussie, ta lumière attend.",
        "game.rules.concept.chest.body": "Elle apparaît quand les trois actes du rêve sont réalisés : un présent voilé.",
        "game.rules.concept.treasury.body": "Les Meeshes que tu gardes pour ta lignée. Six contenants, de la Bourse à la Réserve, visibles sur ton profil.",
        "game.rules.badges.intro": "Chaque médaille suit UN geste précis : un message vocal, une story, une amitié nouée…",
        "game.rules.badges.imprint": "Une médaille éteinte reste une empreinte : elle dit ce qu’il manque pour la rallumer.",
        "game2.prestige.meo": "En renaissant, ton niveau repart à 1 et tes étincelles à 0. Tes aïeux t’offrent un nouvel Âge, un trophée numéroté et %@ de gloire. Ton rang ne recule jamais.",
        "game.concept.prestige.use": "Au niveau 100, choisis : renaître, ou continuer à briller. Renaître remet ton niveau à 1 et ta lumière à zéro ; le reste est gardé.",
        "game2.settings.celebrations.body": "Les cartes de Mee et Meo s’affichent sur Progression",
        "game.concept.meesh.use": "Garde tes Meeshes pour ton héritage, ou dépense-les : une Veilleuse pour ta Flamme, un acte à changer, le Sceau du voyage.",
    ]

    func test_secondPass_shortenedTexts_sayTheirNewFrench() throws {
        let catalog = try Self.catalog()
        for (key, expected) in Self.frenchSecondPass {
            XCTAssertEqual(catalog[key]?["fr"], expected, key)
        }
    }

    func test_secondPass_shortenedTexts_areTranslatedInTheSixOtherLanguages_withTheSameMarkers() throws {
        let catalog = try Self.catalog()
        for key in Self.frenchSecondPass.keys {
            let french = try XCTUnwrap(catalog[key]?["fr"], key)
            for language in Self.otherLanguages {
                let value = try XCTUnwrap(catalog[key]?[language], "\(key) [\(language)]")
                XCTAssertFalse(value.isEmpty, "\(key) [\(language)]")
                XCTAssertNotEqual(value, french, "\(key) [\(language)] : copié du français")
                XCTAssertEqual(specifiers(in: value), specifiers(in: french), "\(key) [\(language)] : mêmes marqueurs que le français")
            }
        }
    }

    func test_secondPass_whatAnotherBlockAlreadySays_isNotRepeated() throws {
        let catalog = try Self.catalog()
        let rule2 = try XCTUnwrap(catalog["game.rules.2.body"]?["fr"])
        for repeated in ["Vingt états", "jusqu’à 499", "Ambassadeur", "Oracle", "Chaque niveau demande", "une épreuve tous les dix niveaux"] {
            XCTAssertFalse(rule2.contains(repeated), "la règle 2 redit « \(repeated) » : l'atlas et le glossaire le disent")
        }
        XCTAssertTrue(rule2.contains("un million d’étincelles pour le niveau 100"))
        XCTAssertFalse(try XCTUnwrap(catalog["game.rules.concept.treasury.body"]?["fr"]).contains("L’héritage grandit"), "la règle 6 le dit")
        XCTAssertFalse(try XCTUnwrap(catalog["game.rules.badges.intro"]?["fr"]).contains("vingt"), "le titre « Les vingt médailles » le dit")
        XCTAssertFalse(try XCTUnwrap(catalog["game.rules.badges.imprint"]?["fr"]).contains("Frapper une Meesh"), "la règle 4 le dit")
        XCTAssertFalse(try XCTUnwrap(catalog["game.concept.meesh.use"]?["fr"]).contains("Bourse"), "l'entrée Héritage le dit")
        XCTAssertFalse(try XCTUnwrap(catalog["game.concept.prestige.use"]?["fr"]).contains("ta joute"), "la confirmation de la Renaissance le dit")
        XCTAssertFalse(try XCTUnwrap(catalog["game2.settings.celebrations.body"]?["fr"]).contains("aïeux"), "le commutateur « Signes des aïeux » le nomme")
    }

    func test_secondPass_theTrialAndTheRebirth_keepTheirOneEntry_andTheIrreversibleConfirmationStaysWhole() throws {
        let catalog = try Self.catalog()
        XCTAssertTrue(try XCTUnwrap(catalog["game.rules.concept.steps.body"]?["fr"]).contains("Tous les dix niveaux, de 10 à 100"), "l'épreuve n'est dite qu'ici")
        XCTAssertTrue(try XCTUnwrap(catalog["game.rules.concept.prestige.body"]?["fr"]).contains("facultative, offerte au niveau 100"))
        XCTAssertTrue(try XCTUnwrap(catalog["game2.prestige.meo"]?["fr"]).contains("%@"), "la gloire offerte garde son nombre")
        for key in ["game2.prestige.confirm.resets", "game2.prestige.confirm.keeps", "game2.prestige.confirm.access"] {
            for language in ["fr"] + Self.otherLanguages {
                XCTAssertFalse((catalog[key]?[language] ?? "").isEmpty, "\(key) [\(language)] : la conséquence irréversible ne se retire pas")
            }
        }
        XCTAssertTrue(try XCTUnwrap(catalog["game2.prestige.confirm.keeps"]?["fr"]).contains("ta Flamme"))
    }

    /// La Renaissance est irréversible : l'offre AU REPOS dit ce qui repart, avant même le premier toucher. La note
    /// « Ce qui reste » qui la suit ne se comprend qu'à côté de ce qui repart.
    func test_prestigeOffer_atRest_saysWhatTheRebirthResets_inEveryLanguage() throws {
        let catalog = try Self.catalog()
        XCTAssertTrue(try XCTUnwrap(catalog["game2.prestige.meo"]?["fr"]).contains("ton niveau repart à 1 et tes étincelles à 0"))
        for language in ["fr"] + Self.otherLanguages {
            let value = try XCTUnwrap(catalog["game2.prestige.meo"]?[language], language)
            XCTAssertTrue(value.contains("1") && value.contains("0"), "game2.prestige.meo [\(language)] : la conséquence irréversible au repos")
        }
        let views = try code("Meeshy/Features/Game/Wave2/GamePrestigeViews.swift")
        XCTAssertTrue(views.contains("GameText.prestigeMeo(glory:"), "l'offre au repos lit la phrase de Meo")
    }

    func test_secondPass_shortenedTexts_holdTheirBudget() throws {
        let catalog = try Self.catalog()
        let limit: [String: Int] = [
            "game.rules.2.body": 180, "game.rules.concept.steps.body": 170, "game.rules.concept.chest.body": 80,
            "game.rules.concept.treasury.body": 115, "game.rules.badges.intro": 90, "game.rules.badges.imprint": 90,
            "game2.prestige.meo": 160, "game.concept.prestige.use": 140, "game2.settings.celebrations.body": 70,
            "game.concept.meesh.use": 130,
        ]
        for (key, maximum) in limit {
            let value = try XCTUnwrap(catalog[key]?["fr"], key)
            XCTAssertLessThanOrEqual(value.count, maximum, "\(key) : \(value)")
        }
    }

    func test_atlas_noLongerReadsTheSentencesTheScreenSaysElsewhere() throws {
        let atlas = try code("Meeshy/Features/Game/GameRulesAtlas.swift")
        XCTAssertFalse(atlas.contains("game.atlas.tiers.prestige"), "la Renaissance est dite par le glossaire et l'écran Renaissance")
        XCTAssertFalse(atlas.contains("game.atlas.medals.line"), "la section « Les médailles » dit déjà matières et paliers")
        let detail = try code("Meeshy/Features/Game/GameDetailCopy.swift")
        XCTAssertFalse(detail.contains("game.rules.badges.sheet"), "la rangée montre seule ce que fait un toucher")
        let rules = try code("Meeshy/Features/Game/GameRulesView.swift")
        XCTAssertFalse(rules.contains("rulesSheet"))
    }

    func test_atlas_medalsFamily_hasNoSubtitle_butKeepsItsTitle_andTheOtherEightKeepTheirLine() {
        XCTAssertNil(GameAtlasCopy.line(.medals))
        XCTAssertFalse(GameAtlasCopy.title(.medals).isEmpty)
        for family in GameRulesAtlas.Family.allCases where family != .medals {
            let line = GameAtlasCopy.line(family)
            XCTAssertNotNil(line, "\(family)")
            XCTAssertFalse(line?.hasPrefix("game.") ?? true, "clé brute : \(family)")
        }
    }

    // MARK: - Épure 3/3 : une règle n'est dite qu'une fois par page, le prix et le solde restent aux valeurs (#17687)

    private static let frenchThirdPass: [String: String] = [
        "game.notebook.empty": "Ta Chronique attend sa première page.",
        "game2.duo.none": "Fais alliance avec un ami accepté : si chacun réalise sa part dans la semaine, la récompense double.",
        "game.flame_panel.relight_missing_window": "Rallumage possible dans les 48 h qui suivent l’extinction.",
        "game.concept.flame.use": "Éteinte, elle se rallume avec des Meeshes pendant 48 h.",
        "game.concept.points.tip.1": "Reviens chaque jour : une Flamme allumée nourrit tes étincelles.",
        "game.concept.showcase.use": "Un trophée ne rapporte rien : il se montre. Les niveaux de visibilité sont tout le monde, tes amis ou toi seul.",
        "game.concept.defis.use": "Ouvre la liste : chaque palier dit sa rareté.",
        "game.concept.succes.use": "Ouvre un haut fait pour lire ce qu’il demande. Accompli, il fait grandir ta gloire.",
        "game.concept.missions.use": "Ouvre un acte pour voir où tu en es.",
        "game.concept.season.use": "Réclame chaque halte atteinte : des étincelles, un fragment d’étoile, une Veilleuse. Le voyage fini donne la coupe du voyage.",
        "game.concept.atlas.use": "Regarde les échanges à moitié faits. Ton Atlas est privé par défaut : tu choisis qui le voit.",
    ]

    func test_thirdPass_shortenedTexts_sayTheirNewFrench() throws {
        let catalog = try Self.catalog()
        for (key, expected) in Self.frenchThirdPass {
            XCTAssertEqual(catalog[key]?["fr"], expected, key)
        }
    }

    func test_thirdPass_shortenedTexts_areTranslatedInTheSixOtherLanguages_withTheSameMarkers() throws {
        let catalog = try Self.catalog()
        for key in Self.frenchThirdPass.keys {
            let french = try XCTUnwrap(catalog[key]?["fr"], key)
            for language in Self.otherLanguages {
                let value = try XCTUnwrap(catalog[key]?[language], "\(key) [\(language)]")
                XCTAssertFalse(value.isEmpty, "\(key) [\(language)]")
                XCTAssertNotEqual(value, french, "\(key) [\(language)] : copié du français")
                XCTAssertEqual(specifiers(in: value), specifiers(in: french), "\(key) [\(language)] : mêmes marqueurs que le français")
            }
        }
    }

    func test_thirdPass_chronicleEmpty_saysOnlyOnceThatPhotosStayOnTheDevice() throws {
        let catalog = try Self.catalog()
        XCTAssertFalse(try XCTUnwrap(catalog["game.notebook.empty"]?["fr"]).contains("appareil"), "le pied de page le dit")
        XCTAssertEqual(catalog["game.notebook.device_only"]?["fr"], "Tes photos vivent sur cet appareil.")
        XCTAssertTrue(try XCTUnwrap(catalog["game.notebook.when.note"]?["fr"]).contains("Flamme de 7 jours"), "les exemples restent derrière le (i)")
    }

    func test_thirdPass_allianceWithoutFriends_isOneLine_theContradictingNoteIsGone() throws {
        let view = try code("Meeshy/Features/Game/Wave2/GameDuoViews.swift")
        XCTAssertFalse(view.contains("duoNoFriends"), "« Il te faut un ami » contredisait « Choisis un ami »")
        XCTAssertFalse(try code("Meeshy/Features/Game/Wave2/GameWave2CopyLeague.swift").contains("duoNoFriends"))
        XCTAssertTrue(view.contains("model.friends.isEmpty"), "sans amis, aucun bouton d'invitation")
    }

    func test_thirdPass_relightMissingWindow_leavesThePriceToTheValueRow() throws {
        let flame = try code("Meeshy/Features/Game/GameFlamePanelView.swift")
        let start = try XCTUnwrap(flame.range(of: "game.flame_panel.relight_missing_window"))
        let line = flame[start.lowerBound...].prefix(while: { $0 != ")" })
        XCTAssertFalse(line.contains("relightPrice"), "le prix est dans la rangée de valeurs juste dessous")
        XCTAssertTrue(flame.contains("spendRow(relightSpend"), "le prix, le solde et le manque restent affichés")
        XCTAssertTrue(try XCTUnwrap(Self.catalog()["game.flame_panel.relight_missing_window"]?["fr"]).contains("48 h"), "la fenêtre reste dite")
    }

    func test_thirdPass_progressionSheets_doNotSayTheSameRuleTwice() throws {
        let catalog = try Self.catalog()
        func fr(_ key: String) throws -> String { try XCTUnwrap(catalog[key]?["fr"], key) }
        XCTAssertFalse(try fr("game.concept.flame.use").contains("Veilleuse"), "how, tip.2 et la fiche voisine disent la Veilleuse")
        XCTAssertEqual(try fr("game.concept.flame.tip.2"), "Garde une Veilleuse pour les jours sans.")
        XCTAssertFalse(try fr("game.concept.points.tip.1").contains("Publie"), "how dit les gestes")
        XCTAssertFalse(try fr("game.concept.showcase.use").contains("l’ordre"), "how dit l'ordre")
        XCTAssertFalse(try fr("game.concept.defis.use").contains("avance vers lui"), "tip.1 le dit")
        XCTAssertFalse(try fr("game.concept.succes.use").contains("plus il est rare"), "tip.2 le dit")
        XCTAssertFalse(try fr("game.concept.missions.use").contains("par jour"), "tip.2 le dit")
        XCTAssertFalse(try fr("game.concept.missions.use").contains("Les trois réalisés"), "how le dit")
        XCTAssertFalse(try fr("game.concept.season.use").contains("quelques pas"), "how et tip.1 le disent")
        XCTAssertNotEqual(try fr("game.concept.season.how"), try fr("game.concept.season.tip.1"))
        XCTAssertFalse(try fr("game.concept.atlas.use").contains("envoyé"), "how et tip.2 disent les deux sens")
    }

    func test_thirdPass_theLandmarksStayVisible() throws {
        let catalog = try Self.catalog()
        XCTAssertTrue(try XCTUnwrap(catalog["game.concept.atlas.use"]?["fr"]).contains("privé par défaut"))
        XCTAssertTrue(try XCTUnwrap(catalog["game.concept.showcase.use"]?["fr"]).contains("ne rapporte rien"))
        XCTAssertTrue(try XCTUnwrap(catalog["game.concept.season.use_cases"]?["fr"]).contains("Sceau du voyage"), "le cas particulier est derrière son (i)")
        XCTAssertTrue(try XCTUnwrap(catalog["game2.duo.none"]?["fr"]).contains("la récompense double"))
        let page = try code("Meeshy/Features/Game/ProgressionConceptPage.swift")
        XCTAssertTrue(page.contains("sentence(ConceptText.how(concept))"))
    }

    // MARK: - Épure 2/3 : la phrase d'usage au repos, les cas particuliers derrière un (i), une règle une fois (#17687)

    private static let conceptsWithUseCases = ["level", "glory", "missions", "league", "season", "badges"]

    func test_useCases_everyOneIsBehindTheSameQuestion_andTheUseSentenceNoLongerCarriesIt() throws {
        for raw in Self.conceptsWithUseCases {
            let concept = try XCTUnwrap(ProgressionConcept(rawValue: raw))
            let note = try XCTUnwrap(ConceptText.useNote(concept), raw)
            XCTAssertEqual(note.question, ConceptText.ficheUseCases, "le nom du (i) est la question")
            XCTAssertTrue(note.question.hasSuffix("?") || note.question.hasSuffix("؟"), "une question, jamais « Plus d'infos »")
            XCTAssertFalse(note.text.isEmpty, "la note reste lue : \(raw)")
            XCTAssertFalse(ConceptText.use(concept).contains(note.text), "\(raw) : le cas particulier a quitté le repos")
        }
        for concept in ProgressionConcept.allCases where !Self.conceptsWithUseCases.contains(concept.rawValue) {
            XCTAssertNil(ConceptText.useNote(concept), "\(concept.rawValue) n'a pas de cas particulier : pas de (i) vide")
        }
    }

    func test_useCases_theNotesCarryWhatLeftTheScreen_inEveryLanguage_neverCopiedFromFrench() throws {
        let catalog = try Self.catalog()
        let marks = ["level": "le restent", "league": "lundi", "season": "Sceau du voyage", "badges": "frappe", "glory": "Oracle", "missions": "Offrande"]
        for (concept, fragment) in marks {
            let key = "game.concept.\(concept).use_cases"
            let french = try XCTUnwrap(catalog[key]?["fr"], key)
            XCTAssertTrue(french.contains(fragment), "\(key) : « \(french) »")
            for language in Self.otherLanguages {
                let value = try XCTUnwrap(catalog[key]?[language], "\(key) [\(language)]")
                XCTAssertNotEqual(value, french, "\(key) [\(language)] : copié du français")
            }
        }
        let question = "game.fiche.use.cases_question"
        for language in ["fr"] + Self.otherLanguages { XCTAssertFalse((catalog[question]?[language] ?? "").isEmpty, "\(question) [\(language)]") }
    }

    func test_useSentences_keepTheirLandmarkAtRest_andLeaveTheEdgeCasesBehind() throws {
        let catalog = try Self.catalog()
        func fr(_ key: String) throws -> String { try XCTUnwrap(catalog[key]?["fr"], key) }
        XCTAssertTrue(try fr("game.concept.level.use").contains("la joute au 10"), "les seuils restent au repos")
        XCTAssertFalse(try fr("game.concept.level.use").contains("même quand ton niveau baisse"))
        XCTAssertTrue(try fr("game.concept.league.use").contains("Joute des amis reste toujours ouverte"), "le consentement de la joute publique reste visible")
        XCTAssertFalse(try fr("game.concept.league.use").contains("chaque lundi"))
        XCTAssertFalse(try fr("game.concept.badges.use").contains("Une frappe n’en éteint aucune"))
        XCTAssertEqual(try fr("game.concept.elans.use"), "Regarde quelles familles sont actives, puis fais un geste dans une famille qui manque.")
        let page = try code("Meeshy/Features/Game/ProgressionConceptPage.swift")
        XCTAssertTrue(page.contains("MeeshyInfoNoted(note: ConceptText.useNote(concept)"), "la fiche pose le (i) des cas particuliers")
    }

    func test_glossary_fourEntriesReadTheSheetSentence_theirOwnKeyIsGoneFromEveryLanguage() throws {
        let catalog = try Self.catalog()
        for concept in ["showcase", "points", "meesh", "league"] {
            XCTAssertNil(catalog["game.rules.concept.\(concept).body"], "\(concept) : une seconde formulation de la fiche")
            XCTAssertFalse((catalog["game.concept.\(concept).what"]?["fr"] ?? "").isEmpty, "la fiche garde sa phrase")
            let key = try XCTUnwrap(ProgressionConcept(rawValue: concept))
            XCTAssertEqual(GameRulesGlossary.body(.concept(key)), ConceptText.what(key), "le carnet lit la même source que la fiche")
        }
        XCTAssertEqual(catalog["game.concept.showcase.what"]?["fr"], "L’étagère de tes trophées : coupes de joute et de voyage, trophées de renaissance et de Flamme.")
    }

    func test_flameBonusRule_isSaidOnce_behindTheQuestionOfThePanel_andTheChipShowsTheValue() throws {
        let catalog = try Self.catalog()
        let rules = ["game.flame_panel.bonus", "game.concept.flame.use", "game.guide.step.flame.means"]
        for language in ["fr"] + Self.otherLanguages {
            let saying = rules.filter { (catalog[$0]?[language] ?? "").contains("%") }
            XCTAssertEqual(saying, ["game.flame_panel.bonus"], "\(language) : la règle « par jour, jusqu'à un plafond » n'est dite qu'une fois, dans la note du (i)")
        }
        XCTAssertEqual(catalog["game.concept.flame.use"]?["fr"], "Éteinte, elle se rallume avec des Meeshes pendant 48 h.")
        XCTAssertEqual(catalog["game.guide.step.flame.means"]?["fr"], "Une Veilleuse la garde allumée un jour d’absence.")
        XCTAssertEqual(catalog["game.flame_panel.bonus.question"]?["fr"], "Que rapporte ma Flamme ?")
        XCTAssertEqual(catalog["game.flame_panel.bonus_chip"]?["fr"], "+%@ %% d’étincelles", "un pourcentage seul ne dit pas ce qu'il augmente, ni à l'œil ni au lecteur d'écran")
        for language in Self.otherLanguages {
            let chip = try XCTUnwrap(catalog["game.flame_panel.bonus_chip"]?[language], language)
            XCTAssertGreaterThan(chip.replacingOccurrences(of: "%@", with: "").filter(\.isLetter).count, 2, "\(language) : la pastille nomme ce qu'elle augmente")
        }
        let panel = try code("Meeshy/Features/Game/GameFlamePanelView.swift")
        XCTAssertTrue(panel.contains("MeeshyInfoNoted(note: bonusNote"))
        XCTAssertTrue(panel.contains("game.flame_panel.bonus_chip"))
        XCTAssertFalse(panel.contains("GameNote(text: String(\n                localized: \"game.flame_panel.bonus\""), "la règle n'est plus au repos")
    }

    func test_shadowRefusal_isOneSentence_readByOneKey() throws {
        let catalog = try Self.catalog()
        XCTAssertNil(catalog["game.frappe.refused.shadow"], "supprimée de toutes les langues")
        XCTAssertEqual(catalog["game.mint.blocked.debt_plain"]?["fr"], "Une ombre voile ta lumière : tes étincelles la dissiperont, puis on frappera.",
                       "le refus dit ce que le geste n'a pas fait et quand il se fera, comme les autres refus (« puis on frappera »)")
        XCTAssertEqual(GameMintCostCopy.debtText(0), MintCeremonyCopy.refused(.shadow), "une seule phrase pour l'ombre, où qu'elle se lise")
        XCTAssertFalse(try code("Meeshy/Features/Game/Choreography/MintCeremonyLayers.swift").contains("game.frappe.refused.shadow"))
        XCTAssertNotNil(catalog["game.mint.blocked.debt"]?["fr"], "le message qui garde le nombre d'étincelles reste")
        let french = try XCTUnwrap(catalog["game.mint.blocked.debt_plain"]?["fr"])
        for (language, value) in try XCTUnwrap(catalog["game.mint.blocked.debt_plain"]) where language != "fr" {
            XCTAssertEqual(value.components(separatedBy: ". ").count, 1, "\(language) : une phrase")
            XCTAssertNotEqual(value, french, "\(language) : copié du français")
        }
    }

    func test_chronicleEmpty_isOneLine_andThePhotoWithMeeAndMeoMovesBehindTheInfoButton() throws {
        let catalog = try Self.catalog()
        XCTAssertEqual(catalog["game.notebook.empty"]?["fr"], "Ta Chronique attend sa première page.")
        let note = try XCTUnwrap(catalog["game.notebook.when.note"]?["fr"])
        XCTAssertTrue(note.contains("une photo avec Mee et Meo"))
        XCTAssertTrue(note.contains("signe de tes aïeux"))
        for language in Self.otherLanguages {
            XCTAssertNotEqual(catalog["game.notebook.empty"]?[language], catalog["game.notebook.empty"]?["fr"], language)
        }
    }

    func test_lockedDoors_sayTheThresholdAndWhereYouAre_inOneLine_theWhyIsInTheSheet() throws {
        let catalog = try Self.catalog()
        XCTAssertEqual(catalog["game2.league.locked"]?["fr"], "La joute s’ouvre au niveau %1$@ · tu es au niveau %2$@")
        XCTAssertEqual(catalog["game.missions.locked"]?["fr"], "Le rêve s’ouvre au niveau 5 · tu es au niveau %@.")
        for key in ["game2.league.locked", "game.missions.locked"] {
            let french = try XCTUnwrap(catalog[key]?["fr"])
            XCTAssertLessThanOrEqual(french.count, 60, key)
            for language in Self.otherLanguages {
                let value = try XCTUnwrap(catalog[key]?[language], "\(key) [\(language)]")
                XCTAssertNotEqual(value, french, "\(key) [\(language)] : copié du français")
                XCTAssertEqual(specifiers(in: value), specifiers(in: french), "\(key) [\(language)] : mêmes marqueurs")
            }
        }
        XCTAssertFalse((catalog["game.concept.league.why"]?["fr"] ?? "").isEmpty, "le « à quoi ça sert » reste à la fiche")
    }

    func test_lockedDoors_stillSayWhatIsBehindThem_atRest_beforeTheThreshold() throws {
        let catalog = try Self.catalog()
        XCTAssertEqual(catalog["game2.league.locked.what"]?["fr"], "Chaque semaine, tu te mesures à 29 héros de lumière semblable.")
        XCTAssertEqual(catalog["game.missions.locked.what"]?["fr"], "Chaque nuit, tes aïeux t’envoient un rêve en trois actes, et une Offrande.")
        for key in ["game2.league.locked.what", "game.missions.locked.what"] {
            let french = try XCTUnwrap(catalog[key]?["fr"])
            for language in Self.otherLanguages {
                let value = try XCTUnwrap(catalog[key]?[language], "\(key) [\(language)]")
                XCTAssertNotEqual(value, french, "\(key) [\(language)] : copié du français")
            }
        }
        let league = try code("Meeshy/Features/Game/Wave2/GameLeagueViews.swift")
        let what = try XCTUnwrap(league.range(of: "GameNote(text: GameText.leagueLockedWhat)"), "la joute fermée ne dit plus ce qu'est la joute")
        let threshold = try XCTUnwrap(league.range(of: "GameNote(text: GameText.leagueLocked("))
        XCTAssertLessThan(what.lowerBound, threshold.lowerBound, "ce qu'est la joute se lit avant son seuil")
        let missions = try code("Meeshy/Features/Game/GameMissionsView.swift")
        let dream = try XCTUnwrap(missions.range(of: "GameNote(text: GameCopy.missionsLockedWhat)"), "le rêve fermé ne dit plus ce qu'est le rêve")
        let door = try XCTUnwrap(missions.range(of: "GameNote(text: GameCopy.missionsLocked("))
        XCTAssertLessThan(dream.lowerBound, door.lowerBound, "ce qu'est le rêve se lit avant son seuil")
    }

    private static let frenchStateLines: [String: String] = [
        "game.state.points.ready_plain": "Ta lumière compte %1$@ : de quoi frapper la Meesh n° %2$@.",
        "game.state.points.missing_plain": "Ta lumière compte %1$@ : il manque %2$@ pour la Meesh n° %3$@.",
        "game.state.season.progress": "Voyage %1$@ · halte %2$@ sur %3$@",
        "game.state.missions.progress": "Le rêve de cette nuit : %1$@ sur %2$@ actes, %3$@ à réaliser.",
        "game.state.missions.claimed": "Le rêve de cette nuit : %1$@ sur %2$@ actes. L’Offrande est ouverte.",
    ]

    func test_stateLines_keepOnlyTheValuesTheHeadDoesNotShow_theRestIsInTheTappableFacts() throws {
        let catalog = try Self.catalog()
        for (key, expected) in Self.frenchStateLines {
            XCTAssertEqual(catalog[key]?["fr"], expected, key)
            XCTAssertLessThanOrEqual(expected.count, 80, "\(key) : au plus 80 caractères")
            for language in Self.otherLanguages {
                let value = try XCTUnwrap(catalog[key]?[language], "\(key) [\(language)]")
                XCTAssertNotEqual(value, expected, "\(key) [\(language)] : copié du français")
                XCTAssertEqual(specifiers(in: value), specifiers(in: expected), "\(key) [\(language)] : mêmes marqueurs que le français")
            }
        }
        for (key, expected) in Self.frenchStateLines {
            for (language, value) in try XCTUnwrap(catalog[key]) where language != "fr" {
                XCTAssertEqual(specifiers(in: value), specifiers(in: expected), "\(key) [\(language)] : une langue partielle (pt, zh-Hans) lit les mêmes marqueurs, sinon la ligne affiche un marqueur sans valeur")
            }
        }
        XCTAssertNil(catalog["game.state.points.ready"], "fusionnée avec sa jumelle sans conversion")
        XCTAssertNil(catalog["game.state.points.missing"], "fusionnée avec sa jumelle sans conversion")
    }

    // MARK: - Épure 3/3 : les règles et les fiches disent une fois, le détail est à un toucher (#17687)

    private static let thirdFrench: [String: String] = [
        "game.rules.1.body": "Écrire, parler, publier, réagir, inviter : chaque vrai échange fait jaillir des étincelles. Une publication en fait jaillir selon qui peut la voir : public, communauté ou amis.",
        "game.rules.1.limits.question": "Y a-t-il des limites ?",
        "game.rules.1.limits": "Les limites portent sur tes gestes, jamais sur tes étincelles : élans, Flamme et événements en font jaillir plus à chaque geste.",
        "game.rules.2.body": "Ensemble, tes étincelles forment ta lumière, et ton niveau se lit sur elle.",
        "game.rules.3.body": "Une Meesh se frappe à la main : une part de ta lumière s’y fige.",
        "game.rules.3.share.question": "Comment se calcule la part figée ?",
        "game.rules.3.share": "Cette part dépend du numéro de la pièce et de ton niveau actuel : plus petite quand ton niveau est bas, entière dès le niveau 100. Elle grandit de 30 % toutes les dix frappes.",
        "game.rules.concept.tailwind.body": "+25\u{00A0}% sur les étincelles de tes gestes tant que ton niveau est 7 niveaux ou plus sous ta plus haute lumière.",
        "game.rules.concept.tailwind.stop.question": "Quand le Vent arrière s’arrête-t-il ?",
        "game.rules.concept.tailwind.stop": "Il s’arrête dès que l’écart retombe à 6.",
        "game.rules.concept.duo.body": "Une fois par semaine, une alliance avec un ami accepté, ouverte au niveau 20 pour vous deux. Si chacun réalise sa part, la récompense double.",
        "game.concept.level.what": "Ton niveau est le chiffre au centre de ton anneau : il se lit sur ta lumière.",
        "game.concept.level.what.note.question": "Combien d’étincelles par niveau ?",
        "game.concept.level.what.note": "10 000 étincelles pour le niveau 10, un million pour le niveau 100.",
        "game.concept.prestige.what": "La renaissance ouvre un nouvel Âge de ta légende, offert au niveau 100, quand ta lumière est devenue Galaxie. Elle est facultative.",
        "game.concept.prestige.what.note.question": "Combien de renaissances ?",
        "game.concept.prestige.what.note": "Cinq renaissances au plus mènent au Sixième Âge.",
    ]

    private static let removedKeys = ["game.rules.concepts_intro", "game.atlas.tiers.prestige", "game2.duo.no_friends"]

    func test_thirdPass_texts_sayTheirNewFrench_inTheSevenLanguages_neverCopiedFromFrench() throws {
        let catalog = try Self.catalog()
        for (key, expected) in Self.thirdFrench {
            XCTAssertEqual(catalog[key]?["fr"], expected, key)
            for language in Self.otherLanguages {
                let value = try XCTUnwrap(catalog[key]?[language], "\(key) [\(language)]")
                XCTAssertNotEqual(value, expected, "\(key) [\(language)] : copié du français")
                XCTAssertEqual(specifiers(in: value), specifiers(in: expected), "\(key) [\(language)] : mêmes marqueurs")
            }
        }
    }

    func test_thirdPass_unreadKeys_areGoneFromEveryLanguage() throws {
        let catalog = try Self.catalog()
        for key in Self.removedKeys { XCTAssertNil(catalog[key], "\(key) : plus aucun lecteur") }
        let rules = try code("Meeshy/Features/Game/GameRulesView.swift")
        XCTAssertFalse(rules.contains("GameRulesGlossary.intro"), "le titre de section dit déjà « Chaque concept, en clair »")
    }

    func test_thirdPass_rules_putTheirLimitsAndTheirShareBehindAQuestion_theBodyKeepsTheLandmark() throws {
        let rules = GameGuideCopy.rules
        let limits = try XCTUnwrap(rules[0].note)
        XCTAssertEqual(limits.question, "Y a-t-il des limites ?")
        XCTAssertFalse(rules[0].body.contains(limits.text), "la phrase des limites a quitté le repos")
        XCTAssertTrue(rules[0].body.contains("selon qui peut la voir"), "la valeur d'une publication reste au repos")
        XCTAssertNil(rules[1].note, "la règle 2 se dit en une phrase")
        let share = try XCTUnwrap(rules[2].note)
        XCTAssertEqual(share.question, "Comment se calcule la part figée ?")
        XCTAssertTrue(share.text.contains("30 %"))
        XCTAssertTrue(rules[2].body.contains("une part de ta lumière s’y fige"), "le repère reste au repos")
        for rule in rules where rule.index > 3 { XCTAssertNil(rule.note, "règle \(rule.index)") }
        let view = try code("Meeshy/Features/Game/GameRulesView.swift")
        XCTAssertTrue(view.contains("MeeshyInfoNoted(note: rule.note"), "la règle pose son (i)")
    }

    func test_thirdPass_glossary_tailwindStopsBehindAQuestion_allianceLosesItsJourneySentence() throws {
        let tailwind = try XCTUnwrap(GameRulesGlossary.entries.first { $0.key == .tailwind })
        let note = try XCTUnwrap(tailwind.note)
        XCTAssertEqual(note.question, "Quand le Vent arrière s’arrête-t-il ?")
        XCTAssertFalse(tailwind.body.contains("retombe"))
        XCTAssertTrue(tailwind.body.contains("7 niveaux ou plus"), "la phrase visible garde le seuil")
        let duo = try XCTUnwrap(GameRulesGlossary.entries.first { $0.key == .duo })
        XCTAssertNil(duo.note)
        XCTAssertFalse(duo.body.contains("voyage"))
        XCTAssertTrue(duo.body.contains("niveau 20") && duo.body.contains("récompense double"), "l'orientation de l'alliance reste visible")
        for entry in GameRulesGlossary.entries where entry.key != .tailwind { XCTAssertNil(entry.note, entry.name) }
        let view = try code("Meeshy/Features/Game/GameRulesView.swift")
        XCTAssertTrue(view.contains("MeeshyInfoNoted(note: entry.note"))
    }

    func test_thirdPass_levelAndPrestigeSheets_putTheirFiguresBehindAQuestion() throws {
        let level = try XCTUnwrap(ConceptText.whatNote(.level))
        XCTAssertEqual(level.question, "Combien d’étincelles par niveau ?")
        XCTAssertTrue(level.text.contains("un million"))
        XCTAssertFalse(ConceptText.what(.level).contains("million"))
        let prestige = try XCTUnwrap(ConceptText.whatNote(.prestige))
        XCTAssertEqual(prestige.question, "Combien de renaissances ?")
        XCTAssertTrue(ConceptText.what(.prestige).contains("facultative"), "le caractère facultatif reste au repos")
        XCTAssertFalse(ConceptText.what(.prestige).contains("Sixième"))
        for concept in ProgressionConcept.allCases where concept != .level && concept != .prestige {
            XCTAssertNil(ConceptText.whatNote(concept), "\(concept.rawValue) : pas de (i) vide")
        }
        let page = try code("Meeshy/Features/Game/ProgressionConceptPage.swift")
        XCTAssertTrue(page.contains("MeeshyInfoNoted(note: ConceptText.whatNote(concept)"))
    }

    func test_thirdPass_theLevelConsequence_isSaidByTheSparksSheetAndRule4_notByTheLevelSheet() throws {
        let catalog = try Self.catalog()
        XCTAssertTrue(try XCTUnwrap(catalog["game.concept.points.use"]?["fr"]).contains("ton niveau, baisse d’autant"))
        XCTAssertTrue(try XCTUnwrap(catalog["game.rules.4.body"]?["fr"]).contains("ton niveau baisse d’autant"))
        for key in ["game.concept.level.what", "game.rules.2.body"] {
            XCTAssertFalse(try XCTUnwrap(catalog[key]?["fr"]).contains("baisser"), key)
        }
    }
}
