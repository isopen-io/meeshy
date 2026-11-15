import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K05 — le curseur d'un réglage continu, lu comme des VALEURS : la loi, les
/// effets de chaque geste et commande, la recette et l'accessibilité. Les
/// lignes viennent du fichier de vecteurs que lisent aussi Android et le web.
@Suite("MeeshyLabeledSlider")
struct MeeshyLabeledSliderTests {

    // MARK: - Loi

    @Test("bornage, calage sur le pas et pas nul : la valeur suit les vecteurs")
    func rule_snap_followsTheVectors() throws {
        for row in try Self.rows("loi") where (row["nom"] as? String)?.hasPrefix("snap") == true {
            let rule = try Self.rule(row)
            let input = try #require(row["entree"] as? Double)
            let expected = try #require(row["attendu"] as? Double)
            #expect(abs(rule.snap(input) - expected) < 1e-9, "\(row)")
        }
    }

    @Test("fraction ↔ valeur, et leur miroir RTL")
    func rule_fraction_followsTheVectors() throws {
        let rows = try Self.rows("loi")
        for row in rows where (row["nom"] as? String)?.hasPrefix("fraction") == true {
            let rule = try Self.rule(row)
            let input = try #require(row["entree"] as? Double)
            let expected = try #require(row["attendu"] as? Double)
            #expect(abs(rule.fraction(of: input, isRTL: row["rtl"] as? Bool ?? false) - expected) < 1e-9, "\(row)")
        }
        for row in rows where row["fraction"] != nil {
            let rule = try Self.rule(row)
            let fraction = try #require(row["fraction"] as? Double)
            let expected = try #require(row["attendu"] as? Double)
            #expect(abs(rule.value(atFraction: fraction, isRTL: row["rtl"] as? Bool ?? false) - expected) < 1e-9, "\(row)")
        }
    }

    @Test("aller-retour fraction → valeur → fraction, dans les deux sens d'écriture", arguments: [false, true])
    func rule_fraction_roundTrips(isRTL: Bool) {
        let rule = MeeshyLabeledSliderRule(range: -40...160)
        for value in stride(from: -40.0, through: 160, by: 25) {
            #expect(abs(rule.value(atFraction: rule.fraction(of: value, isRTL: isRTL), isRTL: isRTL) - value) < 1e-9)
        }
    }

    @Test("flèche : le pas, 1 % si continu ; balayage : 5 % arrondi au pas, un pas au moins, borné")
    func rule_adjusted_followsTheVectors() throws {
        for row in try Self.rows("loi") where row["grossier"] != nil {
            let rule = try Self.rule(row)
            let value = try #require(row["valeur"] as? Double)
            let up = try #require(row["haut"] as? Bool)
            let coarse = try #require(row["grossier"] as? Bool)
            let expected = try #require(row["attendu"] as? Double)
            #expect(abs(rule.adjusted(value, up: up, coarse: coarse) - expected) < 1e-9, "\(row)")
        }
    }

    @Test("le tic : franchir ou rejoindre le neutre, atteindre une borne — jamais entre deux crans")
    func rule_detentCrossed_followsTheVectors() throws {
        for row in try Self.rows("loi") where row["tic"] != nil {
            let rule = try Self.rule(row)
            let from = try #require(row["de"] as? Double)
            let to = try #require(row["a"] as? Double)
            #expect(rule.detentCrossed(from: from, to: to, neutral: row["neutre"] as? Double) == row["tic"] as? Bool, "\(row)")
        }
    }

    @Test("aucun changement n'est émis si la valeur calée est la même")
    func rule_shouldEmit_followsTheVectors() throws {
        for row in try Self.rows("loi") where row["emet"] != nil {
            let rule = try Self.rule(row)
            let previous = try #require(row["de"] as? Double)
            let next = try #require(row["a"] as? Double)
            #expect(rule.shouldEmit(previous: previous, next: next) == row["emet"] as? Bool, "\(row)")
        }
    }

    // MARK: - Gestes et commandes

    @Test("chaque geste et chaque commande rend les effets des vecteurs : édition, valeur, tic")
    func interaction_effects_followTheVectors() throws {
        for row in try Self.rows("interaction") {
            let interaction = try Self.interaction(row)
            let played = try Self.effects(of: row, on: interaction)
            let expected = try Self.expectedEffects(row)
            #expect(played == expected, "\(row["nom"] ?? "")")
        }
    }

    @Test("un glissé complet : vrai au premier contact, une seule valeur par cran, faux au lever")
    func interaction_dragSession_pairsTheEditing() {
        let interaction = Self.interaction(range: 0...10, neutral: nil)
        var value = 4.0
        var editing = false
        var played: [MeeshyLabeledSliderEffect] = []
        for fraction in [0.4, 0.41, 0.42, 0.5, 0.51, 0.6] {
            let effects = interaction.drag(from: value, toFraction: fraction, isRTL: false, isEditing: editing)
            played += effects
            editing = true
            for case .value(let next) in effects { value = next }
        }
        played += interaction.release(isEditing: editing)
        #expect(played == [.editing(true), .value(5), .value(6), .editing(false)])
    }

    @Test("le curseur qui disparaît doigt posé rend faux, une fois")
    func interaction_disappearWhileEditing_endsOnce() {
        let interaction = Self.interaction(range: 0...10, neutral: nil)
        #expect(interaction.release(isEditing: true) == [.editing(false)])
        #expect(interaction.release(isEditing: false) == [])
    }

    @Test("désactivé : aucune commande ne part — ni valeur, ni édition, ni haptique", arguments: MeeshyLabeledSliderCommand.allCases)
    func interaction_disabled_isSilent(command: MeeshyLabeledSliderCommand) {
        let interaction = MeeshyLabeledSliderInteraction(
            rule: MeeshyLabeledSliderRule(range: -10...10, step: 1), neutral: 0, haptic: .light, isEnabled: false
        )
        #expect(interaction.perform(command, from: 4, isRTL: false) == [])
        #expect(interaction.jump(from: 4, toFraction: 1, isRTL: false) == [])
    }

    @Test("avec `none`, aucune commande ne joue de tic", arguments: MeeshyLabeledSliderCommand.allCases)
    func interaction_hapticNone_neverTics(command: MeeshyLabeledSliderCommand) {
        let interaction = MeeshyLabeledSliderInteraction(
            rule: MeeshyLabeledSliderRule(range: -10...10, step: 1), neutral: 0, haptic: .none, isEnabled: true
        )
        #expect(!interaction.perform(command, from: 4, isRTL: false).contains(.haptic))
    }

    @Test("toute commande qui change la valeur est encadrée d'une paire vrai / faux : un pas d'annulation", arguments: MeeshyLabeledSliderCommand.allCases)
    func interaction_command_isOneUndoStep(command: MeeshyLabeledSliderCommand) {
        let effects = Self.interaction(range: -10...10, neutral: 0).perform(command, from: 4, isRTL: false)
        #expect(effects.first == .editing(true))
        #expect(effects.last == .editing(false))
        #expect(effects.filter { if case .value = $0 { return true } else { return false } }.count == 1)
    }

    // MARK: - Recette

    @Test("chaque état de la recette suit les vecteurs : halo, échelle, contenu, valeur")
    func recipe_states_followTheVectors() throws {
        for row in try Self.rows("recette") {
            let recipe = MeeshyLabeledSliderRecipe.resolve(
                tone: .deep,
                isEnabled: row["actif"] as? Bool ?? true,
                isPressed: row["tenu"] as? Bool ?? false,
                isOffNeutral: row["ecarte"] as? Bool ?? false,
                tint: nil,
                reduceMotion: row["reduire"] as? Bool ?? false,
                isHovered: row["survol"] as? Bool ?? false
            )
            let halo = try #require(row["halo"] as? Double)
            let scale = try #require(row["echelle"] as? Double)
            let content = try #require(row["contenu"] as? Double)
            let value = try #require(row["valeur"] as? Double)
            #expect(abs(recipe.haloOpacity - halo) < 1e-9, "\(row)")
            #expect(abs(recipe.thumbScale - scale) < 1e-9, "\(row)")
            #expect(abs(recipe.contentOpacity - content) < 1e-9, "\(row)")
            #expect(abs(recipe.valueOpacity - value) < 1e-9, "\(row)")
        }
    }

    @Test("les mesures propres de la recette sont celles de la planche et des vecteurs")
    func recipe_measures_followTheVectors() throws {
        let measures = try Self.object("mesures")
        let shadow = try #require(measures["ombre"] as? [String: Any])
        #expect(Double(MeeshyLabeledSliderRecipe.trackHeight) == measures["piste"] as? Double)
        #expect(Double(MeeshyLabeledSliderRecipe.thumbDiameter) == measures["pouce"] as? Double)
        #expect(Double(MeeshyLabeledSliderRecipe.thumbInset) == measures["encart"] as? Double)
        #expect(Double(MeeshyLabeledSliderRecipe.haloDiameter) == measures["halo"] as? Double)
        #expect(MeeshyLabeledSliderRecipe.pressedScale == measures["echelleTenue"] as? Double)
        #expect(MeeshyLabeledSliderRecipe.emptyTrackOpacity == measures["pisteVide"] as? Double)
        #expect(Double(MeeshyLabeledSliderRecipe.shadowOffsetY) == shadow["y"] as? Double)
        #expect(Double(MeeshyLabeledSliderRecipe.shadowRadius) == shadow["flou"] as? Double)
        #expect(MeeshyLabeledSliderRecipe.shadowOpacity == shadow["opacite"] as? Double)
        #expect(MeeshyLabeledSliderRecipe.settleDuration * 1000 == measures["glisseMs"] as? Double)
        #expect(MeeshyLabeledSliderRule.coarseFraction == measures["balayage"] as? Double)
        #expect(MeeshyLabeledSliderRule.fineFraction == measures["flecheContinue"] as? Double)
    }

    @Test("le ton `theme` passe tout à l'encre du thème ; les autres tons gardent l'encre du média", arguments: MeeshyGlassTone.allCases)
    func recipe_ink_followsTheTone(tone: MeeshyGlassTone) {
        let recipe = MeeshyLabeledSliderRecipe.resolve(tone: tone, isEnabled: true, isPressed: false, isOffNeutral: false, tint: nil)
        #expect(recipe.ink == (tone == .theme ? .theme : .onMedia))
        for isDark in [false, true] {
            #expect(recipe.fillColor(isDark: isDark) == recipe.inkColor(isDark: isDark))
        }
    }

    @Test("teinté : seul le remplissage prend la teinte, le pouce garde l'encre")
    func recipe_tint_paintsTheFillOnly() {
        let recipe = MeeshyLabeledSliderRecipe.resolve(
            tone: .deep, isEnabled: true, isPressed: false, isOffNeutral: false, tint: MeeshyColors.brandPrimary
        )
        #expect(recipe.fillColor(isDark: true) == MeeshyColors.brandPrimary)
        #expect(recipe.inkColor(isDark: true) == MeeshyColors.onMedia)
    }

    @Test("contraste du pouce, calculé depuis la recette, au moins celui des vecteurs", arguments: MeeshyLabeledSliderInk.allCases)
    func recipe_thumbContrast_meetsTheMinimum(ink: MeeshyLabeledSliderInk) throws {
        let minimums = try Self.object("contraste_min")
        let minimum = try #require(minimums["pouce"] as? Double)
        let recipe = MeeshyLabeledSliderRecipe.resolve(
            tone: ink == .theme ? .theme : .deep, isEnabled: true, isPressed: false, isOffNeutral: false, tint: nil
        )
        for isDark in [false, true] {
            #expect(recipe.thumbContrast(isDark: isDark) >= minimum, "\(ink) isDark=\(isDark)")
        }
    }

    @Test("la cible tactile est une bande de 44 pt au moins, centrée sur la piste")
    func recipe_hitBand_isAtLeastTheTapTarget() throws {
        let targets = try Self.object("cible_minimale")
        let recipe = MeeshyLabeledSliderRecipe.resolve(tone: .deep, isEnabled: true, isPressed: false, isOffNeutral: false, tint: nil)
        let minimum = try #require(targets["ios_pt"] as? Double)
        #expect(Double(recipe.hitHeight) >= minimum)
        #expect(recipe.hitHeight >= MeeshyLabeledSliderRecipe.haloDiameter)
    }

    // MARK: - Accessibilité

    @Test("l'action de remise n'existe qu'avec un neutre et un nom non vide")
    func accessibility_resetAction_needsANeutral() {
        let withNeutral = Self.interaction(range: -10...10, neutral: 0)
        let withoutNeutral = Self.interaction(range: 0...10, neutral: nil)
        #expect(withNeutral.resetActionName("Remettre à zéro") == "Remettre à zéro")
        #expect(withNeutral.resetActionName(nil) == nil)
        #expect(withNeutral.resetActionName("") == nil)
        #expect(withoutNeutral.resetActionName("Remettre à zéro") == nil)
    }

    @Test("un seul élément : nom et valeur annoncés sans condition, en-tête masqué, réglable au balayage de 5 %")
    func source_accessibility_isOneAdjustableElement() throws {
        let code = try Self.code("MeeshyLabeledSlider.swift")
        #expect(code.contains(".accessibilityElement(children: .ignore)"))
        #expect(code.contains(".accessibilityLabel(Text(spec.label))"))
        #expect(code.contains(".accessibilityValue(Text(spec.valueText))"))
        #expect(code.contains("perform(direction == .increment ? .pageUp : .pageDown)"))
        let header = try #require(code.range(of: "private struct MeeshyLabeledSliderHeader"))
        #expect(code[header.upperBound...].prefix(1200).contains(".accessibilityHidden(true)"))
    }

    // MARK: - Performance : égalité par valeurs

    @MainActor
    @Test("à valeurs égales deux curseurs sont égaux, fermetures différentes ; une autre valeur les distingue")
    func equality_comparesValuesNotClosures() {
        let first = MeeshyLabeledSlider("Taille", value: .constant(40), in: 0...100, valueText: "40 pt", onEditingChanged: { _ in })
        let second = MeeshyLabeledSlider("Taille", value: .constant(40), in: 0...100, valueText: "40 pt", onEditingChanged: nil)
        let moved = MeeshyLabeledSlider("Taille", value: .constant(41), in: 0...100, valueText: "41 pt")
        let silent = MeeshyLabeledSlider("Taille", value: .constant(40), in: 0...100, valueText: "40 pt", showsValue: false)
        #expect(first == second)
        #expect(first != moved)
        #expect(first != silent)
    }

    @MainActor
    @Test("la piste seule compare aussi ses valeurs, jamais sa fermeture")
    func equality_trackComparesValues() {
        let first = MeeshySliderTrack("Intensité", value: .constant(0.5), in: 0...1, valueText: "50 %", onEditingChanged: { _ in })
        let second = MeeshySliderTrack("Intensité", value: .constant(0.5), in: 0...1, valueText: "50 %")
        let tinted = MeeshySliderTrack("Intensité", value: .constant(0.5), in: 0...1, valueText: "50 %", tint: MeeshyColors.brandPrimary)
        #expect(first == second)
        #expect(first != tinted)
    }

    @Test("ne s'animent que des transformations : ni position, ni largeur recalculée, ni flou")
    func source_animatesTransformsOnly() throws {
        let code = try Self.code("MeeshyLabeledSlider.swift")
        #expect(!code.contains(".position("))
        #expect(!code.contains(".frame(width: max(centre"))
        #expect(!code.contains(".blur("))
        #expect(code.contains(".offset(x: centre - MeeshyLabeledSliderRecipe.haloDiameter / 2)"))
        #expect(code.contains("isPressed ? nil : .easeOut(duration: MeeshyLabeledSliderRecipe.settleDuration)"))
    }

    // MARK: - Source

    @Test("aucun verre, aucune couleur en dur, aucune légende dans les fichiers de K05")
    func source_hasNoGlassNoLiteralColor() throws {
        for file in ["MeeshyLabeledSlider.swift", "MeeshyLabeledSliderRule.swift", "MeeshyLabeledSliderRecipe.swift"] {
            let code = try Self.code(file)
            let forbidden = [
                "caption", "Color(hex:", "Color(red:", "Color.white", "Color.black", ".white", ".black",
                "meeshyGlass(", "adaptiveGlass", "adaptiveLiquidGlass", ".glassEffect", "UIBlurEffect", "Material",
                " Slider(", "UIImpactFeedbackGenerator", "sensoryFeedback",
            ]
            for word in forbidden {
                #expect(!code.contains(word), "\(file) contient \(word)")
            }
        }
    }

    // MARK: - Fabriques

    private static func interaction(range: ClosedRange<Double>, neutral: Double?) -> MeeshyLabeledSliderInteraction {
        MeeshyLabeledSliderInteraction(rule: MeeshyLabeledSliderRule(range: range, step: 1), neutral: neutral, haptic: .light, isEnabled: true)
    }

    private static func rule(_ row: [String: Any]) throws -> MeeshyLabeledSliderRule {
        let bounds = try #require(row["range"] as? [Double])
        return MeeshyLabeledSliderRule(range: bounds[0]...bounds[1], step: row["step"] as? Double)
    }

    private static func interaction(_ row: [String: Any]) throws -> MeeshyLabeledSliderInteraction {
        let hapticName = row["haptique"] as? String ?? "light"
        let haptic = try #require(MeeshyLabeledSliderHaptic(rawValue: hapticName))
        return MeeshyLabeledSliderInteraction(
            rule: try rule(row), neutral: row["neutre"] as? Double, haptic: haptic, isEnabled: row["actif"] as? Bool ?? true
        )
    }

    private static func effects(of row: [String: Any], on interaction: MeeshyLabeledSliderInteraction) throws -> [MeeshyLabeledSliderEffect] {
        let isRTL = row["rtl"] as? Bool ?? false
        let from = row["de"] as? Double ?? 0
        let fraction = row["fraction"] as? Double ?? 0
        let isEditing = row["edition"] as? Bool ?? false
        switch row["geste"] as? String {
        case "drag":
            return interaction.drag(from: from, toFraction: fraction, isRTL: isRTL, isEditing: isEditing)
        case "release":
            return interaction.release(isEditing: isEditing)
        case "jump":
            return interaction.jump(from: from, toFraction: fraction, isRTL: isRTL)
        default:
            let name = try #require(row["commande"] as? String)
            let command = try #require(MeeshyLabeledSliderCommand(rawValue: name))
            return interaction.perform(command, from: from, isRTL: isRTL)
        }
    }

    private static func expectedEffects(_ row: [String: Any]) throws -> [MeeshyLabeledSliderEffect] {
        let effects = try #require(row["effets"] as? [[String: Any]])
        return effects.map { effect in
            if let editing = effect["editing"] as? Bool { return .editing(editing) }
            if let value = effect["value"] as? Double { return .value(value) }
            #expect(effect["haptic"] as? Bool == true, "\(effect)")
            return .haptic
        }
    }

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func json() throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K05-MeeshyLabeledSlider.vectors.json")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return try #require(object as? [String: Any])
    }

    private static func rows(_ key: String) throws -> [[String: Any]] {
        let vectors = try json()
        return try #require(vectors[key] as? [[String: Any]])
    }

    private static func object(_ key: String) throws -> [String: Any] {
        let vectors = try json()
        return try #require(vectors[key] as? [String: Any])
    }

    /// Le code d'un fichier du kit, commentaires de ligne retirés.
    private static func code(_ file: String) throws -> String {
        let url = repositoryRoot.appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Kit/\(file)")
        return try String(contentsOf: url, encoding: .utf8)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }
}
