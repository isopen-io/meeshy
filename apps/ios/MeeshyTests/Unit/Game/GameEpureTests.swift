import XCTest
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
        "game2.settings.friends_league.switch": "Me retirer de la joute des amis",
        "game2.settings.friends_league.body": "Classement de la semaine entre amis acceptés. T’en retirer vous masque les uns aux autres.",
        "game2.settings.visibility.body": "Hors amis acceptés, personne ne voit si tu es en ligne ni quand tu joues.",
        "game2.settings.hidden.body": "Masque le jeu sur cet appareil, ferme tes trophées, ton rang, ton Héritage et ton Atlas aux autres, te retire de la joute publique. Étincelles et trophées gardés.",
        "game2.league.pseudonym.invalid": "Nom non valable : lettres, chiffres, point, tiret, tiret bas.",
        "game2.league.pseudonym.hint_change": "3 à 20 caractères. Ni ton nom, ni ton identifiant.",
        "game2.league.friends.body": "Étincelles de la semaine entre amis acceptés. Ouverte à tous, sans consentement.",
        "game2.season.how": "Actes et alliance font avancer le voyage : %@ pas par halte. Tout est gratuit.",
        "game2.season.seal.body": "Objet décoratif, une fois toutes les %@ haltes. Sans effet sur le jeu.",
        "game2.atlas.intro": "Un tampon par langue vraiment échangée : un message envoyé, un reçu.",
        "game2.atlas.privacy": "Ton Atlas est privé par défaut : une langue peut en dire long sur toi. Le jeu garde la langue, les deux sens et la date — jamais l’interlocuteur ni la conversation.",
        "game2.atlas.empty": "Pas encore de tampon : écris dans une autre langue.",
        "game2.showcase.visibility_hint": "Un visiteur ne voit que le mois d’obtention, jamais la date exacte.",
        "game2.showcase.empty": "Tes trophées t’attendent : coupes de joute et de voyage, Renaissance, Flamme.",
        "game.flame_panel.freeze_full": "Tes Veilleuses sont au complet.",
        "game.photo.camera.unavailable": "Caméra indisponible. Choisis une photo dans ta galerie, ou garde la carte seule.",
        "game.rules.concepts_intro": "Chaque élément du jeu, en clair.",
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
            "game.rules.step.why", "game.fiche.what.question",
        ]
        let sameInEveryLanguage: Set<String> = ["game2.settings.notifications.switch"]
        for key in keys {
            let values = catalog[key] ?? [:]
            let french = try XCTUnwrap(values["fr"], key)
            for language in Self.otherLanguages {
                let value = try XCTUnwrap(values[language], "\(key) [\(language)]")
                XCTAssertFalse(value.isEmpty, "\(key) [\(language)]")
                if !sameInEveryLanguage.contains(key) {
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
            "game2.settings.friends_league.switch": 40, "game2.league.pseudonym.invalid": 80,
            "game2.league.pseudonym.hint_change": 60, "game2.atlas.empty": 80, "game2.showcase.empty": 120,
            "game.flame_panel.freeze_full": 60, "game.photo.camera.unavailable": 100,
            "game.rules.concepts_intro": 60, "game2.atlas.intro": 100, "game2.league.friends.body": 100,
            "game2.season.how": 100, "game2.season.seal.body": 100, "game2.settings.notifications.body": 100,
            "game2.showcase.visibility_hint": 100, "game2.settings.visibility.body": 120,
            "game2.settings.friends_league.body": 120,
        ]
        for (key, maximum) in limit {
            let value = try XCTUnwrap(catalog[key]?["fr"], key)
            XCTAssertLessThanOrEqual(value.count, maximum, "\(key) : \(value)")
        }
    }

    /// Un commutateur se lit SEUL au lecteur d'écran, hors de son titre de carte : « Me retirer » ne dit pas de quoi.
    /// Le libellé nomme la joute dont on se retire, dans chaque langue.
    func test_friendsLeagueSwitch_namesWhatYouLeave_whenReadWithoutItsCardTitle() throws {
        let catalog = try Self.catalog()
        let title = try XCTUnwrap(catalog["game2.settings.friends_league.title"])
        let switchLabel = try XCTUnwrap(catalog["game2.settings.friends_league.switch"])
        let joust: [String: String] = ["fr": "joute des amis", "en": "Friends’ Joust", "es": "Justa de los amigos", "pt-BR": "Torneio dos amigos",
                                       "de": "Turnier der Freunde", "it": "Torneo degli amici", "ar": "مبارزة الأصدقاء"]
        for (language, name) in joust {
            XCTAssertTrue((title[language] ?? "").lowercased().contains(name.lowercased()), "\(language) : le titre nomme la joute")
            XCTAssertTrue((switchLabel[language] ?? "").lowercased().contains(name.lowercased()), "\(language) : « \(switchLabel[language] ?? "") » ne dit pas de quoi l'on se retire")
        }
        let view = try code("Meeshy/Features/Game/Wave2/GameSettingsViews.swift")
        XCTAssertTrue(view.contains("label: GameText.settingsFriendsLeagueSwitch"))
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
        XCTAssertFalse(try XCTUnwrap(catalog["game.concept.level.use"]?["fr"]).contains("une fois ouvertes"), "level.what et les règles le disent déjà")
        XCTAssertFalse(try XCTUnwrap(catalog["game.concept.points.use"]?["fr"]).contains("Ce que tu as reçu reste reçu"), "level.what le dit déjà")
    }

    func test_catalog_theConsequences_andTheLandmarks_stayVisible() throws {
        let catalog = try Self.catalog()
        XCTAssertTrue(try XCTUnwrap(catalog["game2.settings.hidden.body"]?["fr"]).contains("te retire de la joute publique"), "la conséquence de « Jeu masqué »")
        XCTAssertTrue(try XCTUnwrap(catalog["game2.settings.hidden.body"]?["fr"]).contains("gardés"), "les étincelles et les trophées sont gardés")
        XCTAssertTrue(try XCTUnwrap(catalog["game2.settings.friends_league.body"]?["fr"]).contains("masque"), "se retirer vous masque les uns aux autres")
        XCTAssertTrue(try XCTUnwrap(catalog["game2.atlas.privacy"]?["fr"]).contains("privé par défaut"), "le repère de confidentialité de l'Atlas")
        XCTAssertTrue(try XCTUnwrap(catalog["game2.atlas.privacy"]?["fr"]).contains("jamais l’interlocuteur"), "ce que le jeu ne garde pas")
        XCTAssertTrue(try XCTUnwrap(catalog["game2.season.how"]?["fr"]).contains("gratuit"), "la gratuité du voyage")
        XCTAssertTrue(try XCTUnwrap(catalog["game2.season.seal.body"]?["fr"]).contains("Sans effet sur le jeu"), "le Sceau ne change rien")
        XCTAssertTrue(try XCTUnwrap(catalog["game2.league.friends.body"]?["fr"]).contains("sans consentement"), "la Joute des amis est ouverte")
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
    private static let conceptsWithoutASheet = ["chest", "treasury", "steps", "tailwind", "duo"]

    func test_glossary_aConceptWithASheet_isOneSentence_inEveryLanguage() throws {
        let catalog = try Self.catalog()
        for concept in Self.conceptsWithASheet {
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
        let notes = (1...7).map { MeeshyInfoNote(question: GameGuideCopy.stepWhy(index: String($0)), text: "note \($0)") }
        XCTAssertEqual(Set(notes.map(\.id)).count, 7, "un seul (i) s'ouvre : leurs identifiants diffèrent")
        for note in notes {
            XCTAssertFalse(note.question.isEmpty)
            XCTAssertFalse(note.question.localizedCaseInsensitiveContains("Plus d"), "jamais « Plus d'infos »")
        }
    }

    func test_stepNote_onlyOneOpensAtATime() {
        let first = MeeshyInfoNote(question: GameGuideCopy.stepWhy(index: "1"), text: "a")
        let second = MeeshyInfoNote(question: GameGuideCopy.stepWhy(index: "2"), text: "b")
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
        XCTAssertTrue(try XCTUnwrap(catalog["game.notebook.empty"]?["fr"]).contains("Mee et Meo"), "le repère propre à Meeshy reste visible")
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

    func test_conceptSheet_whatIsBehindAnInfoButton_whyAndHowStayVisible() throws {
        let page = try code("Meeshy/Features/Game/ProgressionConceptPage.swift")
        XCTAssertTrue(page.contains("MeeshyInfoNote(question: ConceptText.ficheWhatQuestion, text: ConceptText.what(concept))"))
        XCTAssertTrue(page.contains("sentence(ConceptText.why(concept), strong: true)"))
        XCTAssertTrue(page.contains("sentence(ConceptText.how(concept))"))
        XCTAssertFalse(page.contains("sentence(ConceptText.what(concept))"), "what n'est plus au repos")
        XCTAssertTrue(try XCTUnwrap(Self.catalog()["game.fiche.what.question"]?["fr"]).hasSuffix("?"))
    }

    // MARK: - Les repères restent lisibles au repos (règle 7)

    func test_frontList_chronicleRow_saysWhatItIs_withoutOpeningAnything() throws {
        let list = try code("Meeshy/Features/Game/ProgressionFrontList.swift")
        XCTAssertTrue(list.contains("game.door.notebook.line"), "la rangée « La Chronique » porte sa phrase")
        XCTAssertTrue(list.contains("subtitle: String(localized: \"game.door.notebook.line\""))
        let catalog = try Self.catalog()
        XCTAssertEqual(catalog["game.door.notebook.line"]?["fr"], "Tes photos avec Mee et Meo")
    }

    func test_settings_everyNonUsualBlock_keepsItsOrientationSentenceVisible() throws {
        let view = try code("Meeshy/Features/Game/Wave2/GameSettingsViews.swift")
        for sentence in [
            "GameNote(text: GameText.settingsCelebrationsBody)", "GameNote(text: GameText.settingsHiddenBody)",
            "GameNote(text: GameText.settingsNotificationsBody)", "GameNote(text: GameText.settingsVisibilityBody)",
            "GameNote(text: GameText.settingsFriendsLeagueBody)",
        ] {
            XCTAssertTrue(view.contains(sentence), "« \(sentence) » ne se lit plus au repos")
        }
        XCTAssertFalse(view.contains("InfoNote"), "les phrases d'orientation du jeu ne sont pas rangées derrière un (i)")
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
        "game2.settings.celebrations.body": "Cartes de Mee et Meo sur Progression. Cet appareil seulement.",
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
        "game.notebook.empty": "Ta Chronique attend sa première page : à chaque signe de tes aïeux, une photo avec Mee et Meo.",
        "game2.duo.none": "Fais alliance avec un ami accepté : si chacun réalise sa part dans la semaine, la récompense double.",
        "game.flame_panel.relight_missing_window": "Rallumage possible dans les 48 h qui suivent l’extinction.",
        "game.concept.flame.how": "Elle grandit d’un jour à chaque jour où tu fais un geste.",
        "game.concept.flame.use": "Chaque jour de Flamme ajoute 2 % aux étincelles de tes rêves, jusqu’à 50 %. Éteinte, elle se rallume avec des Meeshes pendant 48 h.",
        "game.concept.points.tip.1": "Reviens chaque jour : une Flamme allumée nourrit tes étincelles.",
        "game.concept.showcase.use": "Un trophée ne rapporte rien : il se montre. Les niveaux de visibilité sont tout le monde, tes amis ou toi seul.",
        "game.concept.defis.use": "Ouvre la liste : chaque palier dit sa rareté.",
        "game.concept.succes.use": "Ouvre un haut fait pour lire ce qu’il demande. Accompli, il fait grandir ta gloire.",
        "game.concept.missions.use": "Ouvre un acte pour voir où tu en es. L’Offrande donne des étincelles, de la gloire, parfois une prime, un fragment d’étoile ou une Veilleuse.",
        "game.concept.season.use": "Réclame chaque halte atteinte : des étincelles, un fragment d’étoile, une Veilleuse. Le voyage fini donne la coupe du voyage. Le Sceau du voyage est un objet à collectionner, pris avec des Meeshes.",
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
        XCTAssertTrue(try XCTUnwrap(catalog["game.notebook.empty"]?["fr"]).contains("Mee et Meo"), "le repère reste visible")
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
        XCTAssertTrue(try XCTUnwrap(catalog["game.concept.season.use"]?["fr"]).contains("Sceau du voyage"))
        XCTAssertTrue(try XCTUnwrap(catalog["game2.duo.none"]?["fr"]).contains("la récompense double"))
        let page = try code("Meeshy/Features/Game/ProgressionConceptPage.swift")
        XCTAssertTrue(page.contains("sentence(ConceptText.how(concept))"))
    }
}
