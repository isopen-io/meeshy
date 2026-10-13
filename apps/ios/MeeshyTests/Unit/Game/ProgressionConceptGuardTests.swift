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
            XCTAssertFalse(text.contains("اندفاع"), "\(key) [ar] : l'ancien mot du concept — « \(text) »")
        }
        for key in elanNamingKeys + ["progression.elans.title"] {
            let text = try XCTUnwrap(table[key]?["ar"], "\(key) [ar] : absente du catalogue")
            XCTAssertTrue(text.contains("زخم"), "\(key) [ar] : le concept ne dit pas الزخم — « \(text) »")
        }
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
}
