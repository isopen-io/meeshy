import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K08 — le champ de feuille, lu comme des VALEURS : la recette par `input` et
/// par ton, la loi du plafond (compte, troncature, seuil de 80 %, franchissement),
/// le registre du brouillon (frappe, écho, réalignement, commit), la visibilité
/// de l'invite, de la croix et du compteur, les mots dits, l'activation de la
/// croix et la garde de source. Les mesures viennent du fichier de vecteurs que
/// lisent aussi Android et le web.
@Suite("MeeshyField")
struct MeeshyFieldTests {

    // MARK: - Recette par input et par ton

    @Test("chaque input fixe clavier, Retour, correction, majuscule, lignes, marges et valeur du tableau")
    func recipe_input_followsTheVectors() throws {
        for row in try Self.rows("inputs") {
            let input = try #require(MeeshyFieldInput(rawValue: try kitRequired(row["input"] as? String)))
            let recipe = MeeshyFieldRecipe.resolve(input: input, hasCaption: true, tone: nil, isEnabled: true, increasedContrast: false)
            let lines = try #require(row["lines"] as? [Int])
            let padding = try #require(row["padding"] as? [String: Any])
            #expect(recipe.keyboard.rawValue == row["keyboard"] as? String, "\(row)")
            #expect(recipe.returnKey.rawValue == row["returnKey"] as? String, "\(row)")
            #expect(recipe.autocorrects == row["autocorrects"] as? Bool, "\(row)")
            #expect(recipe.capitalization.rawValue == row["capitalization"] as? String, "\(row)")
            #expect(recipe.lineRange == lines[0]...lines[1], "\(row)")
            #expect(recipe.offersClear == row["offersClear"] as? Bool, "\(row)")
            #expect(Double(recipe.verticalPadding) == padding["vertical"] as? Double, "\(row)")
            #expect(Double(recipe.horizontalPadding) == padding["horizontal"] as? Double, "\(row)")
            #expect(Double(recipe.valueSize) == row["valueSize"] as? Double, "\(row)")
            #expect(recipe.valueIsBold == row["valueBold"] as? Bool, "\(row)")
            #expect(Double(recipe.captionSpacing) == row["captionSpacing"] as? Double, "\(row)")
        }
    }

    @Test("sans légende, aucun écart de légende", arguments: MeeshyFieldInput.allCases)
    func recipe_noCaption_noCaptionSpacing(input: MeeshyFieldInput) {
        let recipe = MeeshyFieldRecipe.resolve(input: input, hasCaption: false, tone: nil, isEnabled: true, increasedContrast: false)
        #expect(recipe.captionSpacing == 0)
    }

    @Test("l'encre suit le ton : média par défaut, sombre sur onLight, thème sur theme")
    func recipe_ink_followsTheTone() throws {
        for row in try Self.rows("ink") {
            let tone = (row["tone"] as? String).flatMap(MeeshyGlassTone.init(rawValue:))
            #expect(MeeshyFieldRecipe.ink(for: tone).rawValue == row["ink"] as? String, "\(row)")
            let recipe = MeeshyFieldRecipe.resolve(input: .search, hasCaption: false, tone: tone, isEnabled: true, increasedContrast: false)
            #expect(recipe.ink.rawValue == row["ink"] as? String, "\(row)")
        }
    }

    @Test("le fond vaut l'encre à 8 %, l'atténué 70 %, le désactivé 40 %, le filet 60 % sous augmenter le contraste")
    func recipe_opacities_followTheVectors() throws {
        let opacity = try Self.object("opacity")
        let plain = MeeshyFieldRecipe.resolve(input: .sentence, hasCaption: false, tone: nil, isEnabled: true, increasedContrast: false)
        let off = MeeshyFieldRecipe.resolve(input: .sentence, hasCaption: false, tone: nil, isEnabled: false, increasedContrast: false)
        let contrast = MeeshyFieldRecipe.resolve(input: .sentence, hasCaption: false, tone: nil, isEnabled: true, increasedContrast: true)
        #expect(plain.fillOpacity == opacity["fill"] as? Double)
        #expect(MeeshyFieldRecipe.mutedOpacity == opacity["muted"] as? Double)
        #expect(plain.contentOpacity == 1)
        #expect(plain.hairlineOpacity == nil)
        #expect(off.contentOpacity == opacity["disabled"] as? Double)
        #expect(contrast.hairlineOpacity == opacity["hairlineEmphasis"] as? Double)
    }

    @Test("la boîte et ses cellules font au moins 44 pt ; une ligne fait 45, un paragraphe 110", arguments: MeeshyFieldInput.allCases)
    func recipe_heights_followTheVectors(input: MeeshyFieldInput) throws {
        let geometry = try Self.object("geometry")
        let tapTarget = try Self.object("tapTarget")
        let recipe = MeeshyFieldRecipe.resolve(input: input, hasCaption: false, tone: nil, isEnabled: true, increasedContrast: false)
        let expected = input == .paragraph ? geometry["paragraphMinimumHeight"] : geometry["lineHeight"]
        #expect(Double(recipe.minimumHeight) == expected as? Double)
        #expect(recipe.minimumHeight >= MeeshyControlSize.tapTarget)
        #expect(Double(MeeshyControlSize.tapTarget) == tapTarget["ios"] as? Double)
        #expect(Double(MeeshyRadius.md) == geometry["radius"] as? Double)
        #expect(MeeshyFieldRecipe.fadeDuration * 1000 == geometry["fadeMs"] as? Double)
    }

    // MARK: - Visibilité (loi 13)

    @Test("l'invite n'existe que champ vide et sans légende")
    func visibility_prompt_followsTheVectors() throws {
        for row in try Self.rows("prompt") {
            let shown = MeeshyFieldRecipe.showsPrompt(text: try #require(row["text"] as? String), caption: row["caption"] as? String)
            #expect(shown == row["shows"] as? Bool, "\(row)")
        }
    }

    @Test("la croix n'existe que dans search, avec du texte, hors occupation et hors désactivé")
    func visibility_clear_followsTheVectors() throws {
        for row in try Self.rows("clear") {
            let shown = MeeshyFieldRecipe.showsClear(
                input: try #require(MeeshyFieldInput(rawValue: try kitRequired(row["input"] as? String))),
                text: try #require(row["text"] as? String),
                isBusy: try #require(row["busy"] as? Bool),
                isEnabled: try #require(row["enabled"] as? Bool)
            )
            #expect(shown == row["shows"] as? Bool, "\(row)")
        }
    }

    @Test("le compteur en ligne n'existe qu'avec une limite et du texte, jamais en hébergé")
    func visibility_counter_followsTheVectors() throws {
        for row in try Self.rows("counter") {
            let shown = MeeshyFieldRecipe.showsInlineCounter(
                limit: row["limit"] as? Int,
                text: try #require(row["text"] as? String),
                placement: try #require(MeeshyFieldCounterPlacement(rawValue: try kitRequired(row["placement"] as? String)))
            )
            #expect(shown == row["shows"] as? Bool, "\(row)")
        }
    }

    // MARK: - Loi du plafond

    @Test("le compte se fait en unités UTF-16, émojis composés et drapeaux compris")
    func limit_count_followsTheVectors() throws {
        for row in try Self.rows("count") {
            #expect(MeeshyFieldLimit.count(try #require(row["text"] as? String)) == row["count"] as? Int, "\(row)")
        }
    }

    @Test("la troncature coupe au plafond, sur une frontière de graphème, sans jamais le dépasser")
    func limit_truncate_followsTheVectors() throws {
        for row in try Self.rows("truncate") {
            let limit = try #require(row["limit"] as? Int)
            let cut = MeeshyFieldLimit.truncate(try #require(row["text"] as? String), to: limit)
            #expect(cut == row["result"] as? String, "\(row)")
            #expect(MeeshyFieldLimit.count(cut) == row["count"] as? Int, "\(row)")
            #expect(MeeshyFieldLimit.count(cut) <= limit, "\(row)")
        }
    }

    @Test("le seuil d'alerte est atteint à 80 %, pas avant")
    func limit_isNear_followsTheVectors() throws {
        #expect(MeeshyFieldRecipe.nearLimitRatio == (try Self.json()["nearLimitRatio"] as? Double))
        for row in try Self.rows("near") {
            let near = MeeshyFieldLimit.isNear(count: try #require(row["count"] as? Int), limit: try #require(row["limit"] as? Int))
            #expect(near == row["near"] as? Bool, "\(row)")
        }
    }

    @Test("un franchissement ne se dit qu'en montant, une fois ; le plafond l'emporte sur les 80 %")
    func limit_crossing_followsTheVectors() throws {
        for row in try Self.rows("crossing") {
            let crossing = MeeshyFieldLimit.crossing(
                from: try #require(row["from"] as? Int), to: try #require(row["to"] as? Int), limit: try #require(row["limit"] as? Int)
            )
            #expect(crossing?.rawValue == row["crossing"] as? String, "\(row)")
        }
    }

    // MARK: - Registre du brouillon

    @Test("onChange à chaque frappe, l'écho de l'hôte ne rappelle rien")
    func ledger_receive_emitsEachKeystrokeOnce() {
        var ledger = MeeshyFieldLedger("")
        #expect(ledger.receive("a", limit: nil) == MeeshyFieldEdit(value: "a", wasTruncated: false, emits: true, crossing: nil))
        #expect(ledger.receive("ab", limit: nil)?.value == "ab")
        #expect(ledger.receive("ab", limit: nil) == nil)
        #expect(ledger.emitted == "ab")
    }

    @Test("au-delà du plafond, la frappe est coupée ; au plafond, une frappe de plus n'émet rien de neuf")
    func ledger_receive_truncatesAtTheLimit() {
        var ledger = MeeshyFieldLedger("ab")
        let pasted = ledger.receive("abcdef", limit: 3)
        #expect(pasted == MeeshyFieldEdit(value: "abc", wasTruncated: true, emits: true, crossing: .reached))
        let extra = ledger.receive("abcd", limit: 3)
        #expect(extra == MeeshyFieldEdit(value: "abc", wasTruncated: true, emits: false, crossing: nil))
        #expect(ledger.receive("abc", limit: 3) == nil)
    }

    @Test("le plafond se franchit une fois par passage : redescendre puis remonter le redit")
    func ledger_crossing_oncePerPassage() {
        var ledger = MeeshyFieldLedger("")
        #expect(ledger.receive("1234", limit: 5)?.crossing == .near)
        #expect(ledger.receive("12345", limit: 5)?.crossing == .reached)
        #expect(ledger.receive("123456", limit: 5)?.crossing == nil)
        #expect(ledger.receive("12", limit: 5)?.crossing == nil)
        #expect(ledger.receive("12345", limit: 5)?.crossing == .reached)
    }

    @Test("onCommit une fois par valeur changée, jamais sans changement")
    func ledger_commit_oncePerChangedValue() {
        var ledger = MeeshyFieldLedger("Début")
        #expect(ledger.commit("Début") == nil)
        #expect(ledger.commit("Début 2") == "Début 2")
        #expect(ledger.commit("Début 2") == nil)
    }

    @Test("un text venu de l'hôte remplace le brouillon et n'est pas un pas d'annulation")
    func ledger_resync_replacesWithoutCommit() {
        var ledger = MeeshyFieldLedger("0:02")
        _ = ledger.receive("0:025", limit: nil)
        #expect(ledger.resync(external: "0:02") == true)
        #expect(ledger.emitted == "0:02")
        #expect(ledger.commit("0:02") == nil)
        #expect(ledger.resync(external: "0:02") == false)
        #expect(ledger.receive("0:02", limit: nil) == nil)
    }

    // MARK: - Activation de la croix

    @MainActor
    @Test("la croix : un light par le site unique, puis l'effacement ; none : aucun ; désactivé : rien")
    func clear_followsTheHapticLaw() {
        var events: [String] = []
        let play: @MainActor (MeeshyGlassButtonHaptic) -> Void = { events.append("haptic:\($0.rawValue)") }
        MeeshyGlassButtonTrigger.perform(isEnabled: true, haptic: .light, play: play) { events.append("clear") }
        #expect(events == ["haptic:light", "clear"])
        events = []
        MeeshyGlassButtonTrigger.perform(isEnabled: true, haptic: .none, play: play) { events.append("clear") }
        #expect(events == ["clear"])
        events = []
        MeeshyGlassButtonTrigger.perform(isEnabled: false, haptic: .light, play: play) { events.append("clear") }
        #expect(events.isEmpty)
    }

    @Test("onStep : +1 en montant, −1 en descendant")
    func step_delta() {
        #expect(MeeshyFieldStep.delta(increments: true) == 1)
        #expect(MeeshyFieldStep.delta(increments: false) == -1)
    }

    // MARK: - Mots

    @Test("le compteur s'écrit « 17 / 60 », avec les espaces de la planche")
    func words_counter_followsTheVectors() throws {
        for row in try Self.rows("counterText") {
            let written = MeeshyFieldWords.counter(
                count: try #require(row["count"] as? Int), limit: try #require(row["limit"] as? Int),
                locale: Locale(identifier: try #require(row["locale"] as? String))
            )
            #expect(written == row["text"] as? String, "\(row)")
        }
    }

    @MainActor
    @Test("les mots dits : compteur en phrase, croix, plafond, occupation, en fr, en et ar")
    func words_spoken_followTheVectors() throws {
        for row in try Self.rows("spoken") {
            let code = try #require(row["locale"] as? String)
            let bundle = try Self.lproj(code)
            let locale = Locale(identifier: code)
            let said: String
            switch try #require(row["key"] as? String) {
            case "count":
                said = MeeshyFieldWords.spokenCount(count: try #require(row["count"] as? Int),
                                                    limit: try #require(row["limit"] as? Int), bundle: bundle, locale: locale)
            case "clear": said = MeeshyFieldWords.clear(bundle: bundle, locale: locale)
            case "limit_reached": said = MeeshyFieldWords.limitReached(bundle: bundle, locale: locale)
            default: said = MeeshyFieldWords.busy(bundle: bundle, locale: locale)
            }
            #expect(said == row["said"] as? String, "\(row)")
        }
    }

    @MainActor
    @Test("le compteur se dit dans les chiffres du lecteur, sans placeholder brut")
    func words_spokenCount_usesTheReadersDigits() throws {
        let locale = Locale(identifier: "ar_SA")
        let said = MeeshyFieldWords.spokenCount(count: 17, limit: 60, bundle: try Self.lproj("ar"), locale: locale)
        #expect(said.contains(IntegerFormatStyle<Int>(locale: locale).format(17)), "obtenu « \(said) »")
        #expect(said.contains(IntegerFormatStyle<Int>(locale: locale).format(60)), "obtenu « \(said) »")
        for code in ["fr", "en", "ar"] {
            let rendered = MeeshyFieldWords.spokenCount(count: 17, limit: 60, bundle: try Self.lproj(code),
                                                        locale: Locale(identifier: code))
            for specifier in ["%@", "%lld", "%1$", "%2$"] {
                #expect(!rendered.contains(specifier), "« \(specifier) » brut dans « \(rendered) » (\(code))")
            }
        }
    }

    @MainActor
    @Test("un franchissement s'annonce : le compte à 80 %, « limite atteinte » au plafond")
    func words_announcement_byCrossing() throws {
        let bundle = try Self.lproj("fr")
        let locale = Locale(identifier: "fr")
        #expect(MeeshyFieldWords.announcement(for: .near, count: 48, limit: 60, bundle: bundle, locale: locale)
                == MeeshyFieldWords.spokenCount(count: 48, limit: 60, bundle: bundle, locale: locale))
        #expect(MeeshyFieldWords.announcement(for: .reached, count: 60, limit: 60, bundle: bundle, locale: locale)
                == MeeshyFieldWords.limitReached(bundle: bundle, locale: locale))
    }

    // MARK: - Garde de source

    @Test("ni verre, ni code de couleur, ni singleton de thème dans les fichiers de K08")
    func source_hasNoGlassNoColorCodeNoThemeSingleton() throws {
        for file in ["MeeshyField.swift", "MeeshyFieldRecipe.swift"] {
            let code = try Self.code(file)
            for forbidden in ["glassEffect", "adaptiveGlass", "meeshyGlass(", "Material", "Color(hex", "Color(red",
                              "Color.white", "Color.black", "ThemeManager", "@ObservedObject", "shadow(", "blur("] {
                #expect(!code.contains(forbidden), "« \(forbidden) » dans \(file)")
            }
        }
    }

    @Test("seule l'opacité s'anime : ni hauteur, ni ombre, ni flou")
    func source_animatesOpacityOnly() throws {
        let code = try Self.code("MeeshyField.swift")
        #expect(!code.contains("withAnimation"))
        #expect(!code.contains(".animation("))
        #expect(code.components(separatedBy: ".meeshyAnimation(").count == 3)
    }

    // MARK: - Aides

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func json() throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K08-MeeshyField.vectors.json")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return try #require(object as? [String: Any])
    }

    private static func rows(_ key: String) throws -> [[String: Any]] {
        try #require(try json()[key] as? [[String: Any]])
    }

    private static func object(_ key: String) throws -> [String: Any] {
        try #require(try json()[key] as? [String: Any])
    }

    /// La table d'une langue : `bundle` choisit la table, `locale` ses règles.
    @MainActor
    private static func lproj(_ code: String) throws -> Bundle {
        let language = Locale(identifier: code).language.languageCode?.identifier ?? code
        let path = try #require(Bundle.module.path(forResource: language, ofType: "lproj"), "\(language).lproj absent")
        return try #require(Bundle(path: path))
    }

    /// Le code d'un fichier du kit, commentaires de ligne retirés.
    private static func code(_ file: String) throws -> String {
        let url = repositoryRoot.appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Kit/\(file)")
        return try String(contentsOf: url, encoding: .utf8)
            .components(separatedBy: "\n")
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }
}
