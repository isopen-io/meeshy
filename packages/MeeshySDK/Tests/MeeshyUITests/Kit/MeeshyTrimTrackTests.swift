import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K21 — la piste de coupe, lue comme des VALEURS : la loi, la géométrie, les
/// effets de chaque geste et commande, la recette et l'accessibilité. Les
/// lignes viennent du fichier de vecteurs que lisent aussi Android et le web.
@Suite("MeeshyTrimTrack")
struct MeeshyTrimTrackTests {

    // MARK: - Loi

    @Test("une poignée suit le doigt : bornage, plancher, plafond, la borne opposée ne bouge jamais")
    func rule_moving_followsTheVectors() throws {
        for row in try Self.rows("loi") {
            let rule = try Self.rule(row)
            let range = try Self.range(row, "plage")
            let input = try #require(row["entree"] as? Double)
            let expected = try Self.pair(row["attendu"])
            let moved: ClosedRange<Double>
            switch row["geste"] as? String {
            case "debut": moved = rule.movingStart(input, range: range)
            default: moved = rule.movingEnd(input, range: range)
            }
            #expect(abs(moved.lowerBound - expected.lowerBound) < 1e-9 && abs(moved.upperBound - expected.upperBound) < 1e-9, "\(row["nom"] ?? "")")
            if let trimmable = row["coupable"] as? Bool {
                #expect(rule.canTrim == trimmable, "\(row["nom"] ?? "")")
            }
        }
    }

    @Test("jamais de croisement, jamais plus court que le plancher, jamais plus long que le plafond")
    func rule_moving_neverCrossesNorExceeds() {
        let rule = MeeshyTrimTrackRule(duration: 30, minimumSpan: 0.5, maximumSpan: 12)
        for time in stride(from: -5.0, through: 40, by: 1.7) {
            let start = rule.movingStart(time, range: 10...20)
            let end = rule.movingEnd(time, range: 10...20)
            #expect(start.upperBound == 20 && end.lowerBound == 10)
            for result in [start, end] {
                #expect(result.lowerBound >= 0 && result.upperBound <= 30)
                #expect(result.upperBound - result.lowerBound >= 0.5 - 1e-9)
                #expect(result.upperBound - result.lowerBound <= 12 + 1e-9)
            }
        }
    }

    @Test("la butée atteinte : bord de la source, plancher, plafond — jamais pour la tête")
    func rule_stop_followsTheVectors() throws {
        for row in try Self.rows("butee") {
            let rule = try Self.rule(row)
            let rawMeeshyTrimTrackPart = try #require(row["partie"] as? String)
            let part = try #require(MeeshyTrimTrackPart(rawValue: rawMeeshyTrimTrackPart))
            let stop = rule.stop(part: part, requested: try #require(row["entree"] as? Double), range: try Self.range(row, "plage"))
            #expect(stop?.rawValue == row["butee"] as? String, "\(row["nom"] ?? "")")
        }
    }

    @Test("un cran du lecteur d'écran ou du clavier : la poignée ou la tête, de `step`, bornée")
    func rule_adjusted_followsTheVectors() throws {
        for row in try Self.rows("ajustement") {
            let rule = try Self.rule(row)
            let rawMeeshyTrimTrackPart = try #require(row["partie"] as? String)
            let part = try #require(MeeshyTrimTrackPart(rawValue: rawMeeshyTrimTrackPart))
            let selection = MeeshyTrimTrackSelection(rawValue: row["selection"] as? String ?? "kept") ?? .kept
            let result = rule.adjusted(
                part: part, up: try #require(row["haut"] as? Bool), step: try #require(row["pas"] as? Double),
                range: try Self.range(row, "plage"), playhead: try #require(row["tete"] as? Double), selection: selection
            )
            let expected = try #require(row["attendu"] as? [String: Any])
            let range = try Self.pair(expected["plage"])
            #expect(abs(result.range.lowerBound - range.lowerBound) < 1e-9, "\(row["nom"] ?? "")")
            #expect(abs(result.range.upperBound - range.upperBound) < 1e-9, "\(row["nom"] ?? "")")
            #expect(abs(result.playhead - (try #require(expected["tete"] as? Double))) < 1e-9, "\(row["nom"] ?? "")")
        }
    }

    @Test("x ↔ temps : le contenu en retrait, la source entière sur toute sa largeur")
    func geometry_followsTheVectors() throws {
        for row in try Self.rows("geometrie") {
            let geometry = MeeshyTrimTrackGeometry(
                totalWidth: CGFloat(try #require(row["largeur"] as? Double)),
                inset: CGFloat(try #require(row["retrait"] as? Double)),
                duration: try #require(row["duree"] as? Double)
            )
            if row["sens"] as? String == "temps-depuis-x" {
                let time = geometry.time(atX: CGFloat(try #require(row["x"] as? Double)))
                #expect(abs(time - (try #require(row["temps"] as? Double))) < 1e-6, "\(row["nom"] ?? "")")
            } else {
                let x = geometry.x(for: try #require(row["temps"] as? Double))
                #expect(abs(Double(x) - (try #require(row["x"] as? Double))) < 1e-6, "\(row["nom"] ?? "")")
            }
        }
    }

    @Test("la loupe : échelle de 40 ×, plancher de 500 pt/s, fenêtre visible, la règle suit le doigt")
    func rule_precision_followsTheVectors() throws {
        let rule = MeeshyTrimTrackRule(duration: 48, minimumSpan: 0.4)
        for row in try Self.rows("precision") {
            let pps = CGFloat(try #require(row["points_par_seconde"] as? Double))
            let name = row["nom"] as? String ?? ""
            switch name {
            case "fenetre":
                let window = rule.precisionWindow(anchor: try #require(row["ancre"] as? Double), width: CGFloat(try #require(row["largeur"] as? Double)), pointsPerSecond: pps)
                let expected = try Self.pair(row["attendu"])
                #expect(abs(window.lowerBound - expected.lowerBound) < 1e-9 && abs(window.upperBound - expected.upperBound) < 1e-9)
            case "temps-vers-la-droite":
                let time = rule.preciseTime(anchor: try #require(row["ancre"] as? Double), translation: CGFloat(try #require(row["translation"] as? Double)), pointsPerSecond: pps)
                #expect(abs(time - (try #require(row["attendu"] as? Double))) < 1e-9)
            default:
                #expect(abs(Double(rule.preciseScale(pointsPerSecond: pps)) - (try #require(row["attendu"] as? Double))) < 1e-9, "\(name)")
            }
        }
    }

    @Test("au plus un changement par image, et aucun si la plage bornée est la même")
    func rule_shouldEmit_followsTheVectors() throws {
        for row in try Self.rows("emission") {
            let rule = try Self.rule(row)
            #expect(rule.shouldEmit(previous: try Self.range(row, "de"), next: try Self.range(row, "a")) == row["emet"] as? Bool, "\(row["nom"] ?? "")")
        }
    }

    // MARK: - Gestes et commandes

    @Test("chaque geste et chaque commande rend les effets des vecteurs : édition, plage, tête, tic")
    func interaction_effects_followTheVectors() throws {
        for row in try Self.rows("interaction") {
            let interaction = try Self.interaction(row)
            let range = try Self.range(row, "plage")
            let played = try Self.effects(of: row, on: interaction, range: range)
            #expect(played.effects == (try Self.expectedEffects(row)), "\(row["nom"] ?? "")")
            if let atStop = row["en_butee"] as? Bool {
                #expect(played.isAtStop == atStop, "\(row["nom"] ?? "")")
            }
        }
    }

    @Test("un glissé complet : vrai au premier contact, une plage par image qui change, faux au lever")
    func interaction_dragSession_pairsTheEditing() {
        let interaction = MeeshyTrimTrackInteraction(rule: MeeshyTrimTrackRule(duration: 48, minimumSpan: 0.4))
        var range: ClosedRange<Double> = 18...33
        var editing = false
        var atStop = false
        var played: [MeeshyTrimTrackEffect] = []
        for requested in [19.0, 19.0, 20.0, 20.0, 21.5] {
            let step = interaction.drag(.start, to: requested, range: range, isEditing: editing, wasAtStop: atStop)
            played += step.effects
            editing = true
            atStop = step.isAtStop
            for case .range(let next) in step.effects { range = next }
        }
        played += interaction.release(.start, isEditing: editing)
        #expect(played == [.editing(.start, true), .range(19...33), .range(20...33), .range(21.5...33), .editing(.start, false)])
    }

    @Test("la piste qui disparaît doigt posé rend faux, une fois")
    func interaction_disappearWhileEditing_endsOnce() {
        let interaction = MeeshyTrimTrackInteraction(rule: MeeshyTrimTrackRule(duration: 48, minimumSpan: 0.4))
        #expect(interaction.release(.end, isEditing: true) == [.editing(.end, false)])
        #expect(interaction.release(.end, isEditing: false) == [])
    }

    @Test("désactivée : aucune commande ne part — ni plage, ni édition, ni haptique", arguments: MeeshyTrimTrackCommand.allCases)
    func interaction_disabled_isSilent(command: MeeshyTrimTrackCommand) {
        let interaction = MeeshyTrimTrackInteraction(rule: MeeshyTrimTrackRule(duration: 48, minimumSpan: 0.4), isEnabled: false)
        for part in MeeshyTrimTrackPart.allCases {
            #expect(interaction.perform(command, on: part, range: 18...33, playhead: 24) == [])
            #expect(interaction.accessibilityAdjust(part, up: true, range: 18...33, playhead: 24) == [])
        }
        #expect(interaction.tap(at: 20, range: 18...33) == [])
        #expect(interaction.beginPrecision(.start, isEditing: false) == [])
        #expect(interaction.drag(.start, to: 20, range: 18...33, isEditing: false, wasAtStop: false).effects == [])
    }

    @Test("avec `none`, aucune commande ne joue de tic", arguments: MeeshyTrimTrackCommand.allCases)
    func interaction_hapticNone_neverTics(command: MeeshyTrimTrackCommand) {
        let interaction = MeeshyTrimTrackInteraction(rule: MeeshyTrimTrackRule(duration: 48, minimumSpan: 0.4), haptic: .none)
        for part in MeeshyTrimTrackPart.allCases {
            let effects = interaction.perform(command, on: part, range: 18...33, playhead: 24)
            #expect(!effects.contains { if case .haptic = $0 { return true } else { return false } })
        }
        #expect(!interaction.beginPrecision(.start, isEditing: false).contains(.haptic(.medium)))
        #expect(interaction.tap(at: 20, range: 18...33) == [.seek(20)])
    }

    @Test("toute commande qui change quelque chose est encadrée d'une paire vrai / faux : un pas d'annulation", arguments: MeeshyTrimTrackCommand.allCases)
    func interaction_command_isOneUndoStep(command: MeeshyTrimTrackCommand) {
        let interaction = MeeshyTrimTrackInteraction(rule: MeeshyTrimTrackRule(duration: 48, minimumSpan: 0.4))
        for part in [MeeshyTrimTrackPart.start, .end, .playhead] {
            let effects = interaction.perform(command, on: part, range: 18...33, playhead: 24)
            guard !effects.isEmpty else { continue }
            #expect(effects.first == .editing(part, true))
            #expect(effects.last == .editing(part, false))
        }
    }

    @Test("une source qui ne se coupe pas : aucune poignée ne bouge, la tête reste réglable")
    func interaction_nonTrimmable_keepsOnlyThePlayhead() {
        let interaction = MeeshyTrimTrackInteraction(rule: MeeshyTrimTrackRule(duration: 0.3, minimumSpan: 0.4))
        #expect(interaction.perform(.arrowRight, on: .start, range: 0...0.3, playhead: 0.1) == [])
        #expect(interaction.perform(.arrowRight, on: .end, range: 0...0.3, playhead: 0.1) == [])
        #expect(interaction.accessibilityAdjust(.playhead, up: true, range: 0...0.3, playhead: 0.1) != [])
    }

    // MARK: - Recette

    @Test("chaque état de la recette suit les vecteurs : prise, tête, décor, couleur, contenu")
    func recipe_states_followTheVectors() throws {
        for row in try Self.rows("recette") {
            let held = (row["tenue"] as? String).flatMap(MeeshyTrimTrackPart.init(rawValue:))
            let recipe = MeeshyTrimTrackRecipe.resolve(
                tone: .deep,
                selection: MeeshyTrimTrackSelection(rawValue: try #require(row["selection"] as? String)) ?? .kept,
                isEnabled: try #require(row["actif"] as? Bool),
                held: held,
                isPrecise: try #require(row["precision"] as? Bool)
            )
            #expect(Double(recipe.gripHeight(of: .start)) == row["prise_debut"] as? Double, "\(row["nom"] ?? "")")
            #expect(Double(recipe.playheadWidth) == row["tete"] as? Double, "\(row["nom"] ?? "")")
            #expect(recipe.handleOpacity(of: .end) == row["opacite_fin"] as? Double, "\(row["nom"] ?? "")")
            #expect(recipe.chromeOpacity == row["opacite_decor"] as? Double, "\(row["nom"] ?? "")")
            #expect(recipe.contentOpacity == row["contenu"] as? Double, "\(row["nom"] ?? "")")
            #expect((recipe.handleColor == MeeshyColors.mediaTrim) == (row["poignee_jaune"] as? Bool), "\(row["nom"] ?? "")")
        }
    }

    @Test("les mesures propres de la recette sont celles de la planche et des vecteurs")
    func recipe_measures_followTheVectors() throws {
        let measures = try Self.object("mesures")
        let heights = try #require(measures["hauteurs"] as? [String: Any])
        let grip = try #require(measures["prise"] as? [String: Any])
        let head = try #require(measures["tete"] as? [String: Any])
        #expect(Double(MeeshyTrimTrackRecipe.height(.regular)) == heights["onde"] as? Double)
        #expect(Double(MeeshyTrimTrackRecipe.height(.tall)) == heights["vignettes"] as? Double)
        #expect(Double(MeeshyTrimTrackRecipe.radius) == measures["rayon"] as? Double)
        #expect(Double(MeeshyTrimTrackRecipe.handleWidth) == measures["poignee"] as? Double)
        #expect(Double(MeeshyTrimTrackRecipe.frameThickness) == measures["liseré"] as? Double)
        #expect(Double(MeeshyTrimTrackRecipe.gripWidth) == grip["largeur"] as? Double)
        #expect(Double(MeeshyTrimTrackRecipe.restGripHeight) == grip["repos"] as? Double)
        #expect(Double(MeeshyTrimTrackRecipe.heldGripHeight) == grip["tenue"] as? Double)
        #expect(Double(MeeshyTrimTrackRecipe.hoveredGripHeight) == grip["survol"] as? Double)
        #expect(MeeshyTrimTrackRecipe.gripOpacity == grip["opacite"] as? Double)
        #expect(Double(MeeshyTrimTrackRecipe.playheadWidth) == head["largeur"] as? Double)
        #expect(Double(MeeshyTrimTrackRecipe.heldPlayheadWidth) == head["tenue"] as? Double)
        #expect(Double(MeeshyTrimTrackRecipe.playheadHaloRadius) == head["halo"] as? Double)
        #expect(MeeshyTrimTrackRecipe.veilOpacity == measures["voile"] as? Double)
        #expect(MeeshyTrimTrackRecipe.loupeOpacity == measures["loupe"] as? Double)
        #expect(MeeshyTrimTrackRecipe.disabledOpacity == measures["desactive"] as? Double)
        #expect(MeeshyTrimTrackRecipe.holdDuration == measures["appui_long_s"] as? Double)
        #expect(Double(MeeshyTrimTrackRecipe.holdSlop) == measures["jeu_pt"] as? Double)
        #expect(Double(MeeshyTrimTrackRecipe.dragThreshold) == measures["seuil_glisse_pt"] as? Double)
        #expect(MeeshyTrimTrackRecipe.loupeFade * 1000 == measures["fondu_loupe_ms"] as? Double)
        #expect(MeeshyTrimTrackRecipe.settleDuration * 1000 == measures["glissement_ms"] as? Double)
        #expect(Double(MeeshyTrimTrackRecipe.readoutShrink) == measures["reduction_releve"] as? Double)
        #expect(MeeshyTrimTrackRule.fineStep == measures["pas_maj_s"] as? Double)
        #expect(MeeshyTrimTrackRule.coarseStep == measures["pas_page_s"] as? Double)
        #expect(Double(MeeshyTrimTrackRule.minimumPrecisePointsPerSecond) == measures["echelle_min_pt_s"] as? Double)
        #expect(Double(MeeshyTrimTrackRule.preciseZoom) == measures["zoom"] as? Double)
    }

    @Test("le ton `theme` passe le relevé à l'encre du thème ; les autres tons gardent l'encre du média", arguments: MeeshyGlassTone.allCases)
    func recipe_ink_followsTheTone(tone: MeeshyGlassTone) {
        let recipe = MeeshyTrimTrackRecipe.resolve(tone: tone, selection: .kept, isEnabled: true, held: nil, isPrecise: false)
        #expect(recipe.ink == (tone == .theme ? .theme : .onMedia))
        #expect(recipe.handleColor == MeeshyColors.mediaTrim)
    }

    @Test("contraste calculé depuis la recette : la tête sur le lit, la durée gardée sur son fond")
    func recipe_contrast_meetsTheMinimums() throws {
        let minimums = try Self.object("contraste_min")
        let recipe = MeeshyTrimTrackRecipe.resolve(tone: .deep, selection: .kept, isEnabled: true, held: nil, isPrecise: false)
        let themed = MeeshyTrimTrackRecipe.resolve(tone: .theme, selection: .kept, isEnabled: true, held: nil, isPrecise: false)
        #expect(recipe.playheadContrast >= (try #require(minimums["tete_sur_lit"] as? Double)) - 0.001)
        #expect(recipe.keptContrast(isDark: true) >= (try #require(minimums["duree_gardee_sur_lit"] as? Double)))
        #expect(themed.keptContrast(isDark: false) >= 4.5)
    }

    @Test("le jaune est l'alias `mediaTrim` de `warning`, la poignée d'un retrait prend la couleur d'erreur")
    func recipe_handleColor_isTheTokens() {
        let kept = MeeshyTrimTrackRecipe.resolve(tone: .deep, selection: .kept, isEnabled: true, held: nil, isPrecise: false)
        let removal = MeeshyTrimTrackRecipe.resolve(tone: .deep, selection: .removed, isEnabled: true, held: nil, isPrecise: false)
        #expect(MeeshyColors.mediaTrim == MeeshyColors.warning)
        #expect(kept.handleColor == MeeshyColors.mediaTrim)
        #expect(removal.handleColor == MeeshyColors.error)
    }

    @Test("la cible tactile d'une poignée et de la tête est de 44 pt au moins, et déborde le dessin")
    func recipe_hitWidth_isAtLeastTheTapTarget() throws {
        let targets = try Self.object("cible_minimale")
        #expect(Double(MeeshyTrimTrackRecipe.hitWidth) >= (try #require(targets["ios_pt"] as? Double)))
        #expect(MeeshyTrimTrackRecipe.hitWidth > MeeshyTrimTrackRecipe.handleWidth)
        #expect(MeeshyTrimTrackRecipe.hitWidth > MeeshyTrimTrackRecipe.heldPlayheadWidth)
    }

    // MARK: - Accessibilité et source

    @Test("un groupe nommé, trois éléments réglables dans l'ordre, la tête seulement avec `onSeek`, le relevé masqué")
    func source_accessibility_isOneGroupOfAdjustables() throws {
        let code = try Self.code("MeeshyTrimTrack.swift")
        #expect(code.contains(".accessibilityElement(children: .contain)"))
        #expect(code.contains(".accessibilityLabel(Text(names.track))"))
        #expect(code.contains(".accessibilityValue(Text(timeText(range.upperBound - range.lowerBound, .spoken)))"))
        #expect(code.components(separatedBy: ".accessibilityAdjustableAction").count == 3, "la poignée (début et fin) et la tête")
        #expect(code.contains(".accessibilitySortPriority(isStart ? 3 : 1)"))
        #expect(code.contains(".accessibilitySortPriority(2)"))
        #expect(code.contains("if onSeek == nil {\n            shape.allowsHitTesting(false).accessibilityHidden(true)"))
        let layers = try Self.code("MeeshyTrimTrackLayers.swift")
        let readout = try #require(layers.range(of: "struct MeeshyTrimTrackReadout"))
        #expect(layers[readout.upperBound...].prefix(1500).contains(".accessibilityHidden(true)"))
    }

    @Test("le temps ne se met pas en miroir : la piste et le relevé sont forcés de gauche à droite")
    func source_layout_isLeftToRight() throws {
        let code = try Self.code("MeeshyTrimTrack.swift")
        #expect(code.contains(".environment(\\.layoutDirection, .leftToRight)"))
    }

    @Test("ne s'animent que des transformations, la loupe ne dessine que sa fenêtre, les couches sont Equatable")
    func source_animatesTransformsOnly() throws {
        let layers = try Self.code("MeeshyTrimTrackLayers.swift")
        let track = try Self.code("MeeshyTrimTrack.swift")
        for code in [layers, track] {
            #expect(!code.contains(".position("))
            #expect(!code.contains(".blur("))
        }
        #expect(layers.contains(".scaleEffect(x: fraction, y: 1, anchor: anchor)"))
        #expect(layers.contains("let first = Int((max(0, window.lowerBound) * 100).rounded(.up))"))
        for layer in ["VeilLayer", "HandleShape", "HeadShape", "LoupeLayer", "Readout", "PreciseCapsule"] {
            #expect(layers.contains("struct MeeshyTrimTrack\(layer): View, Equatable"), "\(layer)")
            #expect(track.contains("MeeshyTrimTrack\(layer)(") && track.contains(".equatable()"), "\(layer)")
        }
    }

    @Test("aucun verre, aucune couleur en dur, aucun type du composer, aucune légende dans les fichiers de K21")
    func source_hasNoGlassNoLiteralColorNoComposerType() throws {
        let files = [
            "MeeshyTrimTrack.swift", "MeeshyTrimTrackLayers.swift", "MeeshyTrimTrackRule.swift", "MeeshyTrimTrackRecipe.swift",
            "MeeshyTrimTrackInteraction.swift", "MeeshyTrimTrackSupport.swift", "MeeshyTrimTrackVocabulary.swift",
        ]
        let forbidden = [
            "caption", "Color(hex:", "Color(red:", "Color.white", "Color.black", "Color.yellow", ".white", ".black", ".yellow",
            "meeshyGlass(", "adaptiveGlass", "adaptiveLiquidGlass", ".glassEffect", "UIBlurEffect", "Material", "MeeshyGlassSurface",
            "ComposerCapture", "ComposerTrim", "MeeshyCall", "CacheCoordinator", ".shared",
            "UIImpactFeedbackGenerator", "sensoryFeedback",
        ]
        for file in files {
            let code = try Self.code(file)
            for word in forbidden {
                #expect(!code.contains(word), "\(file) contient \(word)")
            }
        }
    }

    @Test("la garde « un seul rogneur » admet `MeeshyTrimTrack` et refuse toute autre piste hors `Composer…`")
    func source_oneTrimTrack_isTheKitOne() throws {
        let pattern = #"(struct|class)\s+(?!Meeshy|Composer)\w*TrimTrack\w*\s*[:<]"#
        let ok = ["public struct MeeshyTrimTrack<Content: View>: View {", "struct ComposerTrimTrack: View {"]
        let ko = ["struct SoundTrimTrack: View {", "struct TrimTrack<Content>: View {"]
        for line in ok { #expect(line.range(of: pattern, options: .regularExpression) == nil, "\(line)") }
        for line in ko { #expect(line.range(of: pattern, options: .regularExpression) != nil, "\(line)") }
    }

    // MARK: - Fabriques

    private static func rule(_ row: [String: Any]) throws -> MeeshyTrimTrackRule {
        MeeshyTrimTrackRule(
            duration: try #require(row["duree"] as? Double),
            minimumSpan: row["plancher"] as? Double ?? 0.4,
            maximumSpan: row["plafond"] as? Double
        )
    }

    private static func pair(_ value: Any?) throws -> ClosedRange<Double> {
        let bounds = try #require(value as? [Double])
        return bounds[0]...bounds[1]
    }

    private static func range(_ row: [String: Any], _ key: String) throws -> ClosedRange<Double> {
        try pair(row[key])
    }

    private static func interaction(_ row: [String: Any]) throws -> MeeshyTrimTrackInteraction {
        MeeshyTrimTrackInteraction(
            rule: try rule(row),
            haptic: MeeshyTrimTrackHaptic(rawValue: row["haptique"] as? String ?? "standard") ?? .standard,
            isEnabled: row["actif"] as? Bool ?? true,
            canSeek: row["peut_chercher"] as? Bool ?? true
        )
    }

    private static func effects(
        of row: [String: Any],
        on interaction: MeeshyTrimTrackInteraction,
        range: ClosedRange<Double>
    ) throws -> MeeshyTrimTrackStep {
        let part = MeeshyTrimTrackPart(rawValue: row["partie"] as? String ?? "start") ?? .start
        let isEditing = row["edition"] as? Bool ?? false
        switch row["geste"] as? String {
        case "glisser":
            return interaction.drag(part, to: try #require(row["entree"] as? Double), range: range, isEditing: isEditing, wasAtStop: row["deja_en_butee"] as? Bool ?? false)
        case "precision":
            return MeeshyTrimTrackStep(effects: interaction.beginPrecision(part, isEditing: isEditing), isAtStop: false)
        case "lever":
            return MeeshyTrimTrackStep(effects: interaction.release(part, isEditing: isEditing), isAtStop: false)
        case "toucher":
            return MeeshyTrimTrackStep(effects: interaction.tap(at: try #require(row["entree"] as? Double), range: range), isAtStop: false)
        case "glisser-tete":
            return MeeshyTrimTrackStep(effects: interaction.dragPlayhead(
                to: try #require(row["entree"] as? Double), range: range, current: try #require(row["tete"] as? Double), isEditing: isEditing
            ), isAtStop: false)
        case "balayage":
            return MeeshyTrimTrackStep(effects: interaction.accessibilityAdjust(
                part, up: try #require(row["haut"] as? Bool), range: range, playhead: try #require(row["tete"] as? Double)
            ), isAtStop: false)
        default:
            let rawMeeshyTrimTrackCommand = try #require(row["commande"] as? String)
            let command = try #require(MeeshyTrimTrackCommand(rawValue: rawMeeshyTrimTrackCommand))
            return MeeshyTrimTrackStep(effects: interaction.perform(command, on: part, range: range, playhead: try #require(row["tete"] as? Double)), isAtStop: false)
        }
    }

    private static func expectedEffects(_ row: [String: Any]) throws -> [MeeshyTrimTrackEffect] {
        let effects = try #require(row["effets"] as? [[String: Any]])
        return try effects.map { effect in
            if let editing = effect["editing"] as? [Any] {
                let rawMeeshyTrimTrackPart = try #require(editing[0] as? String)
                let part = try #require(MeeshyTrimTrackPart(rawValue: rawMeeshyTrimTrackPart))
                return .editing(part, try #require(editing[1] as? Bool))
            }
            if let bounds = effect["range"] as? [Double] { return .range(bounds[0]...bounds[1]) }
            if let time = effect["seek"] as? Double { return .seek(time) }
            let rawMeeshyTrimTrackHapticKind = try #require(effect["haptic"] as? String)
            let kind = try #require(MeeshyTrimTrackHapticKind(rawValue: rawMeeshyTrimTrackHapticKind))
            return .haptic(kind)
        }
    }

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func json() throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K21-MeeshyTrimTrack.vectors.json")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return try #require(object as? [String: Any])
    }

    private static func rows(_ key: String) throws -> [[String: Any]] {
        try #require(try json()[key] as? [[String: Any]])
    }

    private static func object(_ key: String) throws -> [String: Any] {
        try #require(try json()[key] as? [String: Any])
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
