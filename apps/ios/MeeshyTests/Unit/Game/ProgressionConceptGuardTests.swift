import XCTest
@testable import Meeshy

/// **Les gardes de source de la refonte de Progression** (#9564) — ce qu'aucun rendu ne peut dire à la place du code :
/// aucune pastille ne se coupe, la première page ne monte aucune vue de geste, les textes des concepts existent dans
/// les sept langues, et l'annonce d'une mission mène à la fiche des missions.
final class ProgressionConceptGuardTests: XCTestCase {

    private let locales = ["fr", "en", "es", "de", "it", "pt-BR", "ar"]
    private let concepts = ["level", "points", "meesh", "glory", "flame", "missions", "league", "season", "prestige",
                            "elans", "badges", "defis", "succes", "showcase", "atlas"]

    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    }

    private func source(_ relative: String) throws -> String {
        try String(contentsOf: iosRoot.appendingPathComponent(relative), encoding: .utf8)
    }

    /// Le corps d'une déclaration : de son en-tête jusqu'à la prochaine déclaration de premier niveau.
    private func body(of header: String, in text: String) throws -> String {
        let start = try XCTUnwrap(text.range(of: header), "« \(header) » introuvable")
        let rest = text[start.upperBound...]
        let end = rest.range(of: "\n}\n")?.upperBound ?? rest.endIndex
        return String(rest[..<end])
    }

    // MARK: - Aucune pastille sur deux lignes

    /// Chaque pastille du jeu tient sur UNE ligne, et RÉTRÉCIT plutôt que d'élargir la page : `lineLimit(1)` +
    /// `minimumScaleFactor`, jamais `fixedSize()` (amendement n° 3 — une largeur forcée poussait la carte hors de
    /// l'écran). Le retour à la ligne se fait ENTRE les pastilles, y compris en Dynamic Type agrandi.
    func test_everyChip_holdsOnOneLine_andShrinksRatherThanWidenThePage() throws {
        let chips: [(file: String, header: String)] = [
            ("Meeshy/Features/Main/Game/GameSurface.swift", "struct GameChip: View {"),
            ("Meeshy/Features/Main/Views/ProgressionHub.swift", "struct ProgressionWrap: View {"),
            ("Meeshy/Features/Main/Game/GameHeroParts.swift", "private func chip(_ item: GameHero.EarnItem) -> some View {"),
        ]
        for chip in chips {
            let code = try body(of: chip.header, in: try source(chip.file))
            XCTAssertTrue(code.contains(".lineLimit(1)"), "\(chip.header) : une pastille peut passer à la ligne")
            XCTAssertTrue(code.contains(".minimumScaleFactor("), "\(chip.header) : une pastille trop longue ne sait pas rétrécir")
            XCTAssertFalse(code.contains(".fixedSize()"), "\(chip.header) : une pastille garde sa largeur de force, donc élargit la page")
        }
    }

    /// Une rangée de pastilles est un `FlowLayout`, jamais un `HStack` : c'est lui qui renvoie la pastille de trop
    /// à la ligne suivante au lieu de comprimer ses voisines.
    func test_everyRowOfChips_wrapsBetweenChips() throws {
        let hosts = [
            "Meeshy/Features/Main/Game/GameMissionsView.swift",
            "Meeshy/Features/Main/Game/GameMintPreviewView.swift",
            "Meeshy/Features/Main/Game/GameHeroView.swift",
            "Meeshy/Features/Main/Game/ProgressionConceptViews.swift",
        ]
        for host in hosts {
            let lines = try source(host).components(separatedBy: "\n")
            for (index, line) in lines.enumerated() where line.contains("GameChip(") && !line.contains("struct") {
                let before = lines[max(0, index - 20)..<index].reversed()
                let container = before.first { $0.contains("HStack(") || $0.contains("FlowLayout(") || $0.contains("VStack(") }
                XCTAssertTrue(container?.contains("FlowLayout(") ?? false,
                              "\(host):\(index + 1) — une pastille hors d'un FlowLayout : « \(container ?? "aucun conteneur") »")
            }
        }
    }

    // MARK: - La première page ne porte que des cartes

    func test_theFrontPage_mountsNoGestureView() throws {
        // La LISTE ne porte aucun geste. L'en-tête, lui, retrouve le compteur de Meeshes et sa feuille (amendement n° 2).
        let list = try source("Meeshy/Features/Main/Game/ProgressionFrontList.swift")
        for gesture in ["GameMintPreviewView(", "GameMissionsView(", "GameFlamePanelView(", "GameHeroView(", "GameGaugesView(",
                        "GameBadgeShelfView(", "ProgressionMeeshEntry(", "ProgressionMeeshDetail(", "GameLeagueDetailCard",
                        "viewModel.mint()", "claimChest()", "buyFreeze()", "relight()", "reroll("] {
            XCTAssertFalse(list.contains(gesture), "« \(gesture) » est dans la liste de la première page : les gestes vivent dans les fiches")
        }
        let page = try source("Meeshy/Features/Main/Views/ProgressionView.swift")
        for gesture in ["GameMintPreviewView(", "GameMissionsView(", "GameFlamePanelView(", "GameHeroView(", "GameGaugesView(",
                        "GameBadgeShelfView(", "claimChest()", "buyFreeze()", "relight()", "reroll("] {
            XCTAssertFalse(page.contains(gesture), "« \(gesture) » est sur la première page : les gestes vivent dans les fiches")
        }
        let front = list
        XCTAssertTrue(front.contains("ProgressionConceptModel.cards(progress: progress, game: game)"),
                      "la première page PARCOURT la liste des concepts, elle ne la compose pas")
    }

    func test_theSheet_hostsTheGesturesTheFrontPageLost() throws {
        let fiche = try source("Meeshy/Features/Main/Game/ProgressionConceptPage.swift")
        for gesture in ["GameMintPreviewView(", "GameMissionsView(", "GameFlamePanelView(", "GameHeroView(", "GameBadgeShelfView(",
                        "ProgressionLastAchievementHero(", "ProgressionElansHero(", "GameLeagueDetailCard.make("] {
            XCTAssertTrue(fiche.contains(gesture), "« \(gesture) » n'est rangé dans aucune fiche : une vue écrite et montée par personne")
        }
    }

    // MARK: - L'annonce d'une mission ouvre la FICHE des missions

    /// La pile porte le chemin complet (#9564) : Progression n'attend plus d'ancre pour pousser une fiche après coup —
    /// une seule transition, aucune image perdue.
    func test_theFirstPage_waitsForNoAnchor_theStackCarriesTheChain() throws {
        let progression = try source("Meeshy/Features/Main/Views/ProgressionView.swift")
        XCTAssertFalse(progression.contains("Anchor"), "plus d'ancre ramassée : l'entrée pose son chemin complet")
        XCTAssertFalse(progression.contains("Task.sleep"), "plus de seconde poussée retardée")
        XCTAssertFalse(progression.contains("proxy.scrollTo("), "plus rien ne défile jusqu'à une section : la première page n'en a plus")
        let fiche = try source("Meeshy/Features/Main/Game/ProgressionConceptPage.swift")
        XCTAssertTrue(fiche.contains("proxy.scrollTo(section"), "la fiche se pose à la section que l'entrée demande")
        for host in ["Meeshy/Features/Main/Views/RootLayers/RootRouteDestination.swift", "Meeshy/Features/Main/Views/iPadRootView+Panels.swift"] {
            let code = try source(host)
            XCTAssertTrue(code.contains("ProgressionConceptPage(concept: concept, section: section)"), "\(host) rend la fiche, à sa section")
            XCTAssertFalse(code.contains("ProgressionDashboardPage"), "\(host) : le tableau de bord a disparu (amendement n° 4)")
        }
    }

    // MARK: - Sept langues, une source par concept

    private func catalog(prefix: String = "game.concept.") throws -> [String: [String: String]] {
        let data = try Data(contentsOf: iosRoot.appendingPathComponent("Meeshy/Localizable.xcstrings"))
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let strings = root["strings"] as? [String: Any] else { return [:] }
        var table: [String: [String: String]] = [:]
        for (key, value) in strings where key.hasPrefix(prefix) {
            guard let localizations = (value as? [String: Any])?["localizations"] as? [String: Any] else { continue }
            table[key] = localizations.reduce(into: [:]) { acc, pair in
                if let unit = (pair.value as? [String: Any])?["stringUnit"] as? [String: Any], let text = unit["value"] as? String {
                    acc[pair.key] = text
                }
            }
        }
        return table
    }

    func test_everyConcept_hasItsNameItsWhyItsHowAndItsTwoTips_inTheSevenLanguages() throws {
        let table = try catalog()
        for concept in concepts {
            for field in ["name", "why", "how", "tip.1", "tip.2"] {
                let key = "game.concept.\(concept).\(field)"
                let entry = try XCTUnwrap(table[key], "\(key) : absente du catalogue")
                for locale in locales {
                    XCTAssertFalse((entry[locale] ?? "").isEmpty, "\(key) : pas de \(locale)")
                }
            }
        }
    }

    /// #7757 — le titre de la carte des élans se lit dans la langue du lecteur : il passe par une clé du catalogue,
    /// présente dans les sept langues, et seul le français dit « Élan » (la phrase juste dessous dit déjà « Momentum ×3 »,
    /// « Schwung ×3 », « الزخم ×3 »). Une capture `en-US` de Progression ne montre plus un mot français en tête.
    func test_theElansCardTitle_isLocalized_inTheSevenLanguages_neverAHardcodedFrenchWord() throws {
        let entry = try XCTUnwrap(try catalog(prefix: "progression.elan.")["progression.elan.factor"],
                                  "progression.elan.factor : absente du catalogue")
        for locale in locales {
            let text = entry[locale] ?? ""
            XCTAssertTrue(text.contains("×%lld"), "progression.elan.factor [\(locale)] : le facteur doit y figurer — « \(text) »")
            if locale != "fr" {
                XCTAssertFalse(text.contains("Élan"), "progression.elan.factor [\(locale)] : mot français — « \(text) »")
            }
        }
        XCTAssertTrue(ProgressionCopy.elanTitle(factor: 3).contains("×3"), "le titre porte le facteur entier")
        XCTAssertFalse(ProgressionCopy.elanTitle(factor: 2).contains("×2.0"), "jamais une précision inexistante")

        let hero = try body(of: "struct ProgressionElansHero: View {",
                            in: try source("Meeshy/Features/Main/Views/ProgressionHub.swift"))
        XCTAssertFalse(hero.contains("\"Élan"), "aucune chaîne en dur dans la carte des élans")
        XCTAssertTrue(hero.contains("ProgressionCopy.elanTitle(factor:"), "le titre passe par la copie localisée")
    }

    /// Une phrase de carte tient en deux lignes à 320 pt de large : 72 caractères au plus, la borne que le lot web a
    /// MESURÉE dans un navigateur (#9563) — les phrases sont les siennes, la borne aussi.
    func test_theWhyAndTheHow_stayShortEnoughForTwoLines() throws {
        let table = try catalog()
        for concept in concepts {
            for field in ["why", "how"] {
                let key = "game.concept.\(concept).\(field)"
                for locale in locales {
                    let text = table[key]?[locale] ?? ""
                    XCTAssertLessThanOrEqual(text.count, 72, "\(key) [\(locale)] : \(text.count) caractères — « \(text) »")
                }
            }
        }
    }

    /// Un libellé de pastille trop long se raccourcit dans le catalogue, il ne se tronque pas : 28 caractères hors
    /// substitution tiennent à 320 pt de large.
    func test_theChipLabels_stayShort() throws {
        let table = try catalog()
        for (key, perLocale) in table where key.hasPrefix("game.concept.chip.") {
            for locale in locales {
                let text = (perLocale[locale] ?? "")
                    .replacingOccurrences(of: "%1$@", with: "").replacingOccurrences(of: "%2$@", with: "").replacingOccurrences(of: "%@", with: "")
                XCTAssertLessThanOrEqual(text.count, 28, "\(key) [\(locale)] : libellé de pastille trop long — « \(text) »")
            }
        }
    }

    // MARK: - #10444 — le concept de l'élan porte UN mot par langue

    /// Les clés qui NOMMENT le concept : la fiche, la pastille sans élan, l'astuce des points, le détail et la carte.
    private let elanNamingKeys = ["game.concept.elans.name", "game.concept.elans.why", "game.concept.points.tip.2",
                                  "game.concept.value.no_elan", "game.detail.elan.how", "progression.elan.factor",
                                  "progression.elan.base"]

    /// Le web dit « Momentum » partout en anglais (#10439) ; iOS disait « Boosts » sur la fiche et « Momentum » sur la
    /// carte. « boost » reste le verbe de la Flamme, jamais le nom de l'élan.
    func test_theElanConcept_saysMomentum_inEnglish_everywhere() throws {
        let table = try catalog(prefix: "")
        for key in elanNamingKeys {
            let text = try XCTUnwrap(table[key]?["en"], "\(key) [en] : absente du catalogue")
            XCTAssertTrue(text.localizedCaseInsensitiveContains("momentum"), "\(key) [en] : le concept ne dit pas « Momentum » — « \(text) »")
            XCTAssertFalse(text.localizedCaseInsensitiveContains("boost"), "\(key) [en] : « boost » nomme encore le concept — « \(text) »")
        }
        XCTAssertEqual(table["game.concept.elans.name"]?["en"], "Momentum")
    }

    /// L'arabe disait الاندفاع sur la fiche et الزخم sur la carte : un seul mot, الزخم — celui du titre et du facteur.
    func test_theElanConcept_saysOneWord_inArabic() throws {
        let table = try catalog(prefix: "")
        let conceptKeys = table.keys.filter {
            $0.hasPrefix("game.concept.elans.") || $0.hasPrefix("game.detail.elan.") || $0.hasPrefix("progression.elan")
        } + elanNamingKeys
        for key in Set(conceptKeys) {
            let text = table[key]?["ar"] ?? ""
            XCTAssertFalse(spells(text, "اندفاع"), "\(key) [ar] : l'ancien mot du concept — « \(text) »")
        }
        for key in elanNamingKeys + ["progression.elans.title"] {
            let text = try XCTUnwrap(table[key]?["ar"], "\(key) [ar] : absente du catalogue")
            XCTAssertTrue(spells(text, "زخم"), "\(key) [ar] : le concept ne dit pas الزخم — « \(text) »")
        }
    }

    /// Cherche le mot lettre par lettre : `String.contains` compare des graphèmes, et le tanwîn de « زخمًا » soude
    /// son م au signe qui le suit, si bien que « زخم » n'y serait jamais trouvé.
    private func spells(_ text: String, _ word: String) -> Bool {
        let letters = Array(text.unicodeScalars), needle = Array(word.unicodeScalars)
        guard needle.count <= letters.count else { return false }
        return (0...(letters.count - needle.count)).contains { Array(letters[$0..<$0 + needle.count]) == needle }
    }

    /// Le titre, l'invitation et l'invitation sans famille de la carte ont leur portugais (`pt`) : la phrase et les
    /// pastilles juste en dessous l'ont aussi, sans quoi un lecteur portugais lit la carte à moitié en français.
    func test_theElansCard_hasItsPortuguese() throws {
        let table = try catalog(prefix: "progression.")
        let keys = table.keys.filter { $0.hasPrefix("progression.elan") || $0.hasPrefix("progression.family.") }
        XCTAssertGreaterThanOrEqual(keys.count, 10, "les clés de la carte des élans ont disparu du catalogue")
        for key in keys {
            for locale in ["pt", "pt-BR"] {
                XCTAssertFalse((table[key]?[locale] ?? "").isEmpty, "\(key) : pas de \(locale)")
            }
        }
    }

    // MARK: - #10540 — quatre questions, une phrase d'état, un carnet complet, aucun manque sans cible

    private let glossaryExtras = ["chest", "treasury", "steps", "tailwind", "duo"]

    func test_everyConcept_saysWhatItIs_andHowToUseIt_inTheSevenLanguages() throws {
        let table = try catalog(prefix: "game.")
        for concept in concepts {
            for field in ["what", "use"] {
                let key = "game.concept.\(concept).\(field)"
                let entry = try XCTUnwrap(table[key], "\(key) : absente du catalogue")
                for locale in locales {
                    XCTAssertFalse((entry[locale] ?? "").isEmpty, "\(key) : pas de \(locale)")
                }
            }
        }
        for key in ["game.fiche.use", "game.concept.fact.held", "game.concept.fact.convertible", "game.fact.to_convert"] {
            let entry = try XCTUnwrap(table[key], "\(key) : absente du catalogue")
            for locale in locales { XCTAssertFalse((entry[locale] ?? "").isEmpty, "\(key) : pas de \(locale)") }
        }
    }

    /// Les phrases d'état, les manques nommés et les pastilles à cible : sept langues, et chaque langue garde les
    /// substitutions du français — une phrase qui en perd une affiche un trou, une qui en gagne une plante le formatage.
    func test_theStateAndMissingSentences_keepTheirSubstitutions_inTheSevenLanguages() throws {
        let table = try catalog(prefix: "game.")
        let watched = table.keys.filter {
            $0.hasPrefix("game.state.") || $0.hasPrefix("game.spend.missing.") || $0.hasPrefix("game.fact.missing_for.")
                || $0.hasPrefix("game.concept.chip.to_") || $0 == "game.detail.badge.missing" || $0 == "game.detail.levelstep.progress"
        }
        XCTAssertGreaterThanOrEqual(watched.filter { $0.hasPrefix("game.state.") }.count, 35, "les phrases d'état ont quitté le catalogue")
        let pattern = try NSRegularExpression(pattern: "%(?:\\d+\\$)?@")
        func holes(_ text: String) -> [String] {
            pattern.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap { Range($0.range, in: text).map { String(text[$0]) } }
        }
        for key in watched.sorted() {
            let expected = Set(holes(table[key]?["fr"] ?? ""))
            for locale in locales {
                let text = table[key]?[locale] ?? ""
                XCTAssertFalse(text.isEmpty, "\(key) : pas de \(locale)")
                XCTAssertEqual(Set(holes(text)), expected, "\(key) [\(locale)] : les substitutions ne sont pas celles du français — « \(text) »")
            }
        }
    }

    /// Le carnet des règles dit CHAQUE concept : les quinze de Progression, et ce qu'elle montre sans en faire une fiche
    /// (coffre, trésor, étapes des niveaux, Vent arrière, duo), chacun à la suite du concept qu'il complète.
    @MainActor
    func test_theRulesNotebook_explainsEveryConcept_inTheSevenLanguages() throws {
        let table = try catalog(prefix: "game.rules.")
        for key in concepts + glossaryExtras {
            let entry = try XCTUnwrap(table["game.rules.concept.\(key).body"], "\(key) : le carnet ne l'explique pas")
            for locale in locales { XCTAssertFalse((entry[locale] ?? "").isEmpty, "game.rules.concept.\(key).body : pas de \(locale)") }
        }
        for key in glossaryExtras.map({ "game.rules.concept.\($0).name" }) + ["game.rules.section_concepts", "game.rules.concepts_intro"] {
            let entry = try XCTUnwrap(table[key], "\(key) : absente du catalogue")
            for locale in locales { XCTAssertFalse((entry[locale] ?? "").isEmpty, "\(key) : pas de \(locale)") }
        }

        XCTAssertEqual(GameRulesGlossary.keys.map { $0.rawValue }, [
            "level", "steps", "points", "meesh", "treasury", "glory", "flame", "missions", "chest", "league", "season", "duo",
            "prestige", "elans", "tailwind", "badges", "defis", "succes", "showcase", "atlas",
        ])
        let entries = GameRulesGlossary.entries
        XCTAssertEqual(Set(entries.map { $0.body }).count, entries.count, "deux entrées du carnet partagent leur explication")
        XCTAssertFalse(entries.contains { $0.name.isEmpty || $0.body.isEmpty })

        let page = try source("Meeshy/Features/Main/Game/GameRulesView.swift")
        XCTAssertTrue(page.contains("GameRulesGlossarySection()"), "la section est écrite et montée par personne")
        XCTAssertTrue(page.contains("ForEach(GameRulesGlossary.entries)"), "la section PARCOURT le glossaire, elle ne le recopie pas")
    }

    /// Aucun « Il manque » sans cible : les libellés nus ont quitté le catalogue ET l'app, et la rangée de dépense ne
    /// peut plus se bâtir sans la phrase qui dit pour quoi.
    func test_noBareMissingLabel_survivesInTheCatalogOrTheApp() throws {
        let table = try catalog(prefix: "game")
        let retired = ["game.detail.missing", "game.concept.fact.missing", "game.concept.chip.missing", "game.concept.chip.convertible",
                       "game.concept.chip.glory_missing", "game.concept.fact.to_promotion", "game.concept.fact.next_step"]
        let enumerator = FileManager.default.enumerator(at: iosRoot.appendingPathComponent("Meeshy"), includingPropertiesForKeys: nil)
        var corpus = ""
        while let url = enumerator?.nextObject() as? URL {
            guard url.pathExtension == "swift" else { continue }
            corpus += (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        }
        XCTAssertFalse(corpus.isEmpty, "les sources de l'app sont introuvables")
        for key in retired {
            XCTAssertNil(table[key], "\(key) : un manque sans cible est resté au catalogue")
            XCTAssertFalse(corpus.contains("\"\(key)\""), "\(key) : un manque sans cible est resté dans l'app")
        }
        let surface = try source("Meeshy/Features/Main/Game/GameSurface.swift")
        XCTAssertTrue(surface.contains("missing: @MainActor (String) -> String\n"), "la phrase de manque n'est plus obligatoire sur la rangée de dépense")
        // Ce qu'il reste sur la bannière nomme le niveau visé : deux substitutions, dans les sept langues.
        let banner = try XCTUnwrap(table["game2.banner.missing"])
        for locale in locales {
            XCTAssertTrue((banner[locale] ?? "").contains("%1$@") && (banner[locale] ?? "").contains("%2$@"),
                          "game2.banner.missing [\(locale)] : le niveau visé manque — « \(banner[locale] ?? "") »")
        }
    }

    /// Les étincelles (#10846) : un SEUL solde, la poche, toute convertible — « à convertir » ne se dit plus nulle part.
    func test_theSingleBalance_isAllConvertible() throws {
        let table = try catalog(prefix: "game.")
        for key in ["game.error.insufficient_points", "game.concept.fact.convertible", "game.fact.to_convert"] {
            let french = try XCTUnwrap(table[key]?["fr"], "\(key) : absente du catalogue")
            XCTAssertFalse(french.localizedCaseInsensitiveContains("à convertir"), "\(key) : l'ancien second solde — « \(french) »")
        }
        XCTAssertEqual(table["game.concept.fact.held"]?["fr"], "Ta lumière")
    }

    /// La poche fait le niveau (#10892) : aucune phrase ne promet plus que la frappe épargne le niveau, ni que le niveau
    /// se lit sur les étincelles cumulées depuis le Prestige. Le rang et la Gloire, eux, ne baissent toujours jamais.
    func test_theLevel_readsTheConvertibles_andTheMintLowersIt_inEveryLanguage() throws {
        let table = try catalog(prefix: "game")
        let stale = ["ne fait plus baisser", "sans faire baisser", "sans toucher à ton niveau", "jamais de ton niveau",
                     "ne le fait jamais baisser", "depuis ton dernier Prestige", "Cumulées, elles font ton niveau", "reste acquis",
                     "Frapper ne fait plus redescendre", "pas ton niveau", "ne baisse pas : il se lit",
                     "elles, font ton niveau"]
        for (key, entry) in table {
            let french = entry["fr"] ?? ""
            for phrase in stale {
                XCTAssertFalse(french.contains(phrase), "\(key) : l'ancienne loi du niveau — « \(french) »")
            }
        }
        XCTAssertEqual(table["game.concept.points.why"]?["fr"], "Tes étincelles forment ta lumière ; son éclat, c’est ton niveau.")
        XCTAssertTrue((table["game.concept.level.what"]?["fr"] ?? "").contains("Il se lit sur ta lumière"))
        XCTAssertTrue((table["game.rules.4.body"]?["fr"] ?? "").contains("ton niveau baisse d’autant"))
        for key in ["game.rules.2.body", "game.rules.4.body", "game.concept.level.what", "game.concept.points.why",
                    "game.guide.moment.first_mint.means", "game.mint.chip.level_a11y",
                    "game.guide.moment.first_mint_possible.means_drop"] {
            for locale in locales { XCTAssertFalse((table[key]?[locale] ?? "").isEmpty, "\(key) : pas de \(locale)") }
        }
    }

    /// Le Vent arrière des étincelles (#10896) : +25 % à 7 niveaux ou plus sous le record de niveau, plus jamais « éteint »
    /// — dans les règles et dans la fiche, dans les sept langues ; l'espace insécable précède « % » en fr, es et de.
    func test_theTailwind_saysSevenLevelsBelowTheLevelRecord_inEveryLanguage() throws {
        let table = try catalog(prefix: "game.")
        XCTAssertEqual(table["game.rules.concept.tailwind.body"]?["fr"],
                       "+25\u{00A0}% sur les étincelles de tes gestes tant que ton niveau est 7 niveaux ou plus sous ta plus haute lumière. Il s’arrête dès que l’écart retombe à 6.")
        let fiche = try XCTUnwrap(table["game.detail.fact.tailwind"]?["fr"])
        XCTAssertEqual(fiche, "+25\u{00A0}% sur tes gestes tant que ton niveau est 7 niveaux ou plus sous ta plus haute lumière.")
        XCTAssertLessThanOrEqual(fiche.count, 110, "la fiche tient en 110 caractères")
        for key in ["game.rules.concept.tailwind.body", "game.detail.fact.tailwind"] {
            for locale in locales {
                let text = try XCTUnwrap(table[key]?[locale], "\(key) : pas de \(locale)")
                let seven = locale == "ar" ? "سبع" : "7"
                XCTAssertTrue(text.contains("25") && text.contains(seven), "\(key) [\(locale)] : la règle des 7 niveaux manque — « \(text) »")
            }
            for locale in ["fr", "es", "de"] {
                XCTAssertTrue((table[key]?[locale] ?? "").contains("25\u{00A0}%"), "\(key) [\(locale)] : l'espace insécable devant « % »")
            }
        }
        XCTAssertFalse(table.values.contains { ($0["fr"] ?? "").contains("Vent arrière est éteint") }, "le Vent arrière éteint se dit encore")
    }

    /// Les trois records (#10899) racontent l'épopée (#11179, § 4) : ta plus haute lumière, les étincelles reçues depuis
    /// toujours, les Meeshes frappées depuis toujours — « à vie », « max à vie » et « total à vie » ne se disent plus
    /// dans le Jeu, et « record » non plus (garde de vocabulaire : `GameEpicVocabularyGuardTests`).
    func test_theGame_saysTheThreeRecords_andNoLongerLifetimeOrMax() throws {
        let table = try catalog(prefix: "game").merging(try catalog(prefix: "progression.meesh.")) { first, _ in first }
        for (key, entry) in table {
            let french = entry["fr"] ?? ""
            for stale in ["à vie", "Max à vie", "niveau max", "total à vie"] {
                XCTAssertFalse(french.contains(stale), "\(key) : « \(stale) » se dit encore — « \(french) »")
            }
        }
        XCTAssertEqual(table["game.sparks.levelMax.label"]?["fr"], "Au plus haut")
        XCTAssertEqual(table["game.sparks.lifetime.label"]?["fr"], "Reçues depuis toujours")
        XCTAssertEqual(table["game.concept.fact.minted"]?["fr"], "Frappées depuis toujours")
        XCTAssertEqual(table["progression.meesh.minted.many"]?["fr"], "%lld frappées depuis toujours")
        XCTAssertEqual(table["game.detail.fact.level_record"]?["fr"], "C’est ta plus haute lumière : le plus haut niveau que tu as atteint.")
        XCTAssertEqual(table["game.detail.fact.minted"]?["fr"], "Ce sont toutes les Meeshes que tu as frappées depuis toujours.")
        XCTAssertTrue((table["game2.prestige.meo"]?["fr"] ?? "").contains("Ce que tu as reçu depuis toujours et ta plus haute lumière restent gravés"))
        XCTAssertTrue((table["game2.prestige.confirm.access"]?["fr"] ?? "").hasSuffix("car elles lisent ta plus haute lumière."))
        for key in ["game.sparks.record.line", "game.sparks.cumul.record", "game.sparks.levelRecord.line", "game.concept.fact.minted",
                    "progression.meesh.minted.one", "progression.meesh.minted.many", "game2.prestige.confirm.access"] {
            for locale in locales { XCTAssertFalse((table[key]?[locale] ?? "").isEmpty, "\(key) : pas de \(locale)") }
        }
    }

    /// Le « + » des gains par famille est retiré (« Contenu jusqu’à 16 », plus « jusqu’à +16 ») — dans le code et
    /// dans les sept langues. Les « + » de mission, de Gloire, de pourcentage et de coffre restent.
    func test_theEarnChip_hasNoPlusSign() throws {
        let entry = try XCTUnwrap(try catalog(prefix: "game.hero.")["game.hero.earn.chip"], "game.hero.earn.chip : absente du catalogue")
        for locale in locales {
            let text = entry[locale] ?? ""
            XCTAssertTrue(text.contains("%@"), "game.hero.earn.chip [\(locale)] : le nombre de points manque — « \(text) »")
            XCTAssertFalse(text.contains("+"), "game.hero.earn.chip [\(locale)] : le « + » est resté — « \(text) »")
        }
        let chip = try body(of: "private func chip(_ item: GameHero.EarnItem) -> some View {",
                            in: try source("Meeshy/Features/Main/Game/GameHeroParts.swift"))
        XCTAssertFalse(chip.contains("+\\("), "le « + » est resté dans la valeur par défaut de la pastille")
        XCTAssertEqual(try catalog(prefix: "game.mint.")["game.mint.chip.glory"]?["fr"]?.hasPrefix("+"), true, "le « + » de la Gloire reste")
    }

    /// La fiche pose les quatre réponses, puis « Où j'en suis » : la phrase d'état d'abord, puis les lignes — l'une
    /// et l'autre lues sur `ProgressionConceptFiche`, qui ne redit rien de ce que l'écran montre (#11180). La carte
    /// n'a plus de phrase d'état : un nom, une valeur, une ligne.
    func test_theSheetShowsTheFourAnswersAndItsWhere_theCardThreeStoreys() throws {
        let fiche = try source("Meeshy/Features/Main/Game/ProgressionConceptPage.swift")
        for piece in ["ConceptText.what(concept)", "ConceptText.why(concept)", "ConceptText.how(concept)", "ConceptText.use(concept)",
                      "ProgressionConceptFiche.make(concept, progress: progress, game: game)", "section(ConceptText.ficheUse)"] {
            XCTAssertTrue(fiche.contains(piece), "« \(piece) » n'est plus dans la fiche")
        }
        let where_ = try XCTUnwrap(fiche.range(of: "section(ConceptText.ficheWhere)"))
        let stateLine = try XCTUnwrap(fiche.range(of: "sentence(state.text, strong: true)"))
        let facts = try XCTUnwrap(fiche.range(of: "ProgressionConceptFacts(facts: fiche.facts, concept: concept)"))
        XCTAssertTrue(where_.lowerBound < stateLine.lowerBound && stateLine.lowerBound < facts.lowerBound,
                      "la phrase d'état ouvre « Où j'en suis », avant les lignes")
        let card = try body(of: "struct ProgressionConceptCardView: View {", in: try source("Meeshy/Features/Main/Game/ProgressionConceptViews.swift"))
        for storey in ["Text(card.name)", "Text(card.value)", "if let line = card.line"] {
            XCTAssertTrue(card.contains(storey), "la carte ne rend pas « \(storey) »")
        }
        for gone in ["card.state", "card.why", "card.how", "ProgressionBar(", "GameChip("] {
            XCTAssertFalse(card.contains(gone), "la carte rend encore « \(gone) » : la fiche dit le reste")
        }
    }
}
