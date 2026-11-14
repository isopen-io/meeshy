import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K22 — la frise du temps, lue comme des VALEURS : la loi (glisser, aimanter,
/// fenêtre visible, règle, zones), les effets de chaque geste et pas, la
/// recette et l'accessibilité. Les lignes viennent du fichier de vecteurs que
/// lisent aussi Android et le web ; elles reprennent celles de
/// `ComposerSceneFriseTests` et des tests de `:core:model`.
@Suite("MeeshyTimelineFrise")
struct MeeshyTimelineFriseTests {

    // MARK: - Loi : glisser, tirer

    @Test("déplacer garde la durée, tirer ne franchit ni l'autre poignée ni les bords")
    func rule_dragged_followsTheVectors() throws {
        for row in try Self.rows("glisse") {
            let rule = MeeshyTimelineFriseRule(duration: try Self.double(row, "duree"), minimumSpan: try Self.double(row, "plancher"))
            let moved = rule.dragged(try Self.pair(row["plage"]), part: try Self.part(row), by: try Self.double(row, "delta"))
            try Self.expectRange(moved, row["attendu"], row)
        }
    }

    @Test("jamais de croisement, jamais hors de la scène, jamais sous le plancher")
    func rule_dragged_neverCrossesNorLeaves() {
        let rule = MeeshyTimelineFriseRule(duration: 10, minimumSpan: 0.5)
        for delta in stride(from: -15.0, through: 15, by: 1.3) {
            for part in [MeeshyTimelineFrisePart.move, .start, .end] {
                let result = rule.dragged(3...6, part: part, by: delta)
                #expect(result.lowerBound >= 0 && result.upperBound <= 10)
                if part != .move { #expect(result.upperBound - result.lowerBound >= 0.5 - 1e-9) }
                if part == .move { #expect(abs(result.upperBound - result.lowerBound - 3) < 1e-9) }
            }
        }
        #expect(rule.dragged(3...6, part: .move, by: .nan) == 3...6)
        #expect(rule.dragged(3...6, part: .playhead, by: 2) == 3...6)
    }

    // MARK: - Loi : l'aimant

    @Test("le bord qui bouge s'accroche par SnapEngine : tête, bords, images clés voisines")
    func rule_snapped_followsTheVectors() throws {
        for row in try Self.rows("aimant") {
            let rule = MeeshyTimelineFriseRule(duration: try Self.double(row, "duree"), minimumSpan: 0.05)
            let drag = rule.snapped(
                try Self.pair(row["plage"]), part: try Self.part(row), by: try Self.double(row, "delta"),
                candidates: try Self.candidates(row), tolerance: try Self.double(row, "tolerance")
            )
            try Self.expectRange(drag.range, row["attendu"], row)
            if let snapped = row["accroche"] as? Double {
                #expect(abs((drag.snappedTime ?? -1) - snapped) < 1e-4, "\(row["nom"] ?? "")")
            } else {
                #expect(drag.snappedTime == nil, "\(row["nom"] ?? "")")
            }
        }
    }

    @Test("les candidats : la tête, les bords de la scène, les bords et les images clés des AUTRES pistes")
    func rule_candidates_followTheVectors() throws {
        for row in try Self.rows("candidats") {
            let rule = MeeshyTimelineFriseRule(duration: try Self.double(row, "duree"), minimumSpan: 0.05)
            let tracks = try Self.tracks(row)
            let times = rule.candidates(tracks: tracks, excluding: try kitRequired(row["exclue"] as? String), playhead: row["tete"] as? Double)
                .map { Double($0.time) }
            let expected = try kitRequired(row["attendu"] as? [Double])
            #expect(Set(times) == Set(expected), "\(row["nom"] ?? "")")
        }
    }

    @Test("la tolérance suit l'échelle rendue (TimelineGeometry) et plafonne à 0,25 s")
    func rule_tolerance_followsTheVectors() throws {
        for row in try Self.rows("tolerance") {
            let tolerance = MeeshyTimelineFriseRule.tolerance(span: try Self.double(row, "portee"), width: CGFloat(try Self.double(row, "largeur")))
            let expected = try Self.double(row, "attendu")
            #expect(abs(tolerance - expected) < 1e-4, "\(row["nom"] ?? "")")
        }
    }

    // MARK: - Fenêtre visible

    @Test("zoom autour de la tête, plancher de 3 s, défilement, page qui tourne, temps du doigt")
    func viewport_followsTheVectors() throws {
        for row in try Self.rows("fenetre") {
            let bounds = try kitRequired(row["vue"] as? [Double])
            let view = MeeshyTimelineFriseViewport(start: bounds[0], span: bounds[1])
            let duration = try Self.double(row, "duree")
            let name = "\(row["nom"] ?? "")"
            switch row["operation"] as? String {
            case "zoom":
                let result = view.zoomed(by: try Self.double(row, "echelle"), around: try Self.double(row, "ancre"), duration: duration)
                try Self.expectViewport(result, row["attendu"], name)
            case "pan": try Self.expectViewport(view.panned(by: try Self.double(row, "fraction"), duration: duration), row["attendu"], name)
            case "clamp": try Self.expectViewport(view.clamped(to: duration), row["attendu"], name)
            case "show": try Self.expectViewport(view.showing(try Self.double(row, "temps"), duration: duration), row["attendu"], name)
            default:
                let time = view.time(atFraction: try Self.double(row, "fraction"))
                let expected = try Self.double(row, "attendu")
                #expect(abs(time - expected) < 1e-6, "\(name)")
            }
        }
    }

    @Test("pincer garde la tête à sa place ; zoomée seulement quand elle montre moins que la scène")
    func viewport_zoom_keepsTheAnchorInPlace() {
        let view = MeeshyTimelineFriseViewport.whole(7200).zoomed(by: 100, around: 3600, duration: 7200)
        #expect(abs(view.fraction(3600) - 0.5) < 1e-9)
        #expect(view.isZoomed(in: 7200))
        #expect(!MeeshyTimelineFriseViewport.whole(15).isZoomed(in: 15))
        #expect(MeeshyTimelineFriseViewport.whole(7200).zoomed(by: 10_000, around: 100, duration: 7200, minimumSpan: 10).span == 10)
    }

    // MARK: - Règle

    @Test("une règle lisible : majeures au pas de l'échelle, douze libellés au plus, mineures à 6 pt")
    func ruler_followsTheVectors() throws {
        let ruler = try Self.object("regle")
        let six = try kitRequired(ruler["six-secondes"] as? [String: Any])
        #expect(MeeshyTimelineFriseRuler.ticks(in: .whole(6), width: 300).filter(\.isMajor).map(\.time) == six["majeures"] as? [Double])
        let long = MeeshyTimelineFriseRuler.ticks(in: .whole(7200), width: 300)
        #expect((2...13).contains(long.filter(\.isMajor).count))
        #expect(long.allSatisfy { $0.time >= 0 && $0.time <= 7200 })
        let zoomed = MeeshyTimelineFriseRuler.ticks(in: .init(start: 3600, span: 60), width: 300)
        #expect(zoomed.first(where: \.isMajor)?.time == 3600)
        #expect(zoomed.filter(\.isMajor).count <= 12 && zoomed.allSatisfy { $0.time >= 3600 && $0.time <= 3660 })
        let readable = try kitRequired(ruler["lisibles"] as? [String: Any])
        for duration in try kitRequired(readable["durees"] as? [Double]) {
            #expect(CGFloat(MeeshyTimelineFriseRuler.majorStep(span: duration, width: 280) / duration) * 280 >= 44, "durée \(duration)")
        }
        let times = MeeshyTimelineFriseRuler.ticks(in: .whole(6), width: 300).map(\.time).sorted()
        let gap = zip(times, times.dropFirst()).map { CGFloat(($1 - $0) / 6) * 300 }.min() ?? 0
        #expect(gap >= 6)
        for crossing in try kitRequired(ruler["franchit"] as? [[Any]]) {
            let values = crossing.compactMap { $0 as? Double }
            #expect(MeeshyTimelineFriseRuler.crossesMajor(from: values[0], to: values[1], step: values[2]) == crossing[3] as? Bool)
        }
    }

    @Test("l'écart entre deux libellés suit la police : 44, ou le plus large plus 8")
    func ruler_labelGap_followsTheFont() throws {
        let police = try kitRequired(try Self.object("regle")["police"] as? [String: Any])
        #expect(MeeshyTimelineFriseRuler.majorStep(span: 15, width: 300) == police["pas_standard"] as? Double)
        #expect(MeeshyTimelineFriseRuler.majorStep(span: 15, width: 300, labelGap: 120) == police["pas_grand"] as? Double)
        #expect(MeeshyTimelineFriseRuler.labelGap(widestLabel: 20) == 44)
        #expect(MeeshyTimelineFriseRuler.labelGap(widestLabel: 60) == 68)
        let small = MeeshyTimelineFriseRuler.estimatedLabelWidth(characters: 4, fontSize: 10)
        let large = MeeshyTimelineFriseRuler.estimatedLabelWidth(characters: 4, fontSize: 20)
        #expect(large > small && small > 0)
    }

    // MARK: - Zones

    @Test("une poignée : 14 dans la barre (16 de corps laissés) et 30 dehors ; un losange le plus proche dans 32")
    func zones_followTheVectors() throws {
        for row in try Self.rows("zones") {
            let zone = MeeshyTimelineFriseRule.handleZone(barWidth: CGFloat(try Self.double(row, "barre")))
            let inside = CGFloat(try Self.double(row, "dedans"))
            let outside = CGFloat(try Self.double(row, "dehors"))
            #expect(zone.inside == inside)
            #expect(zone.outside == outside)
        }
        for row in try Self.rows("cles") {
            let keys = try kitRequired(row["cles"] as? [[Any]]).map { pair in
                MeeshyTimelineFriseKey(id: pair[0] as? String ?? "", time: pair[1] as? Double ?? 0)
            }
            let found = MeeshyTimelineFriseRule.keyframe(
                near: try Self.double(row, "temps"), in: keys, pointsPerSecond: CGFloat(try Self.double(row, "pps"))
            )
            #expect(found?.id == row["attendu"] as? String, "\(row["nom"] ?? "")")
        }
        #expect(MeeshyTimelineFriseRule.handleInside + MeeshyTimelineFriseRule.handleOutside == MeeshyControlSize.tapTarget)
    }

    // MARK: - Effets : glisser, lâcher, annuler

    @Test("un geste complet : editing(true), aperçu local, UNE écriture au lâcher, editing(false)")
    func interaction_dragThenRelease_commitsOnce() {
        let interaction = Self.interaction(selected: "texte")
        let track = Self.text
        var effects = interaction.beginDrag(track, part: .move)
        var preview = track.range
        for delta in [0.2, 0.6, 1.0] {
            let step = interaction.drag(track, part: .move, by: delta, candidates: [], tolerance: 0, wasSnapped: false)
            preview = step.preview.range
            effects += step.effects
        }
        effects += interaction.release(track, part: .move, preview: preview)
        #expect(effects == [.editing(.move, true), .commit("texte", 3...8, .move), .editing(.move, false)])
    }

    @Test("jamais d'écriture à l'annulation, ni pour une fenêtre revenue à sa place")
    func interaction_cancelOrUnchanged_neverCommits() {
        let interaction = Self.interaction(selected: "texte")
        #expect(interaction.cancel(.start) == [.editing(.start, false)])
        #expect(interaction.release(Self.text, part: .end, preview: Self.text.range) == [.editing(.end, false)])
        #expect(interaction.release(Self.text, part: .end, preview: nil) == [.editing(.end, false)])
    }

    @Test("une piste non choisie se choisit au début du glissé, avec un tic")
    func interaction_beginDrag_selectsAnUnselectedTrack() {
        let unselected = Self.interaction(selected: nil).beginDrag(Self.text, part: .end)
        #expect(unselected == [.editing(.end, true), .select("texte", nil), .haptic(.light)])
        #expect(Self.interaction(selected: "texte").beginDrag(Self.text, part: .end) == [.editing(.end, true)])
    }

    @Test("verrouillée, en lecture seule ou désactivée : aucune fenêtre ne bouge, aucun pas")
    func interaction_lockedReadOnlyDisabled_doNothing() {
        let locked = MeeshyTimelineFriseTrack(id: "fond", name: "Fond", systemImage: "photo", range: 0...15, isLocked: true)
        let free = Self.interaction(selected: "fond")
        #expect(free.beginDrag(locked, part: .move).isEmpty)
        #expect(free.drag(locked, part: .end, by: 1, candidates: [], tolerance: 0, wasSnapped: false).effects.isEmpty)
        #expect(MeeshyTimelineFriseNudge.allCases.allSatisfy { free.nudge(locked, $0).isEmpty })
        let readOnly = Self.interaction(selected: "texte", canEdit: false)
        #expect(readOnly.beginDrag(Self.text, part: .move).isEmpty)
        #expect(readOnly.nudge(Self.text, .later).isEmpty)
        let disabled = Self.interaction(selected: "texte", isEnabled: false)
        #expect(disabled.tap(Self.text, at: 3, pointsPerSecond: 20).isEmpty)
        #expect(disabled.scrub(to: 3, previous: nil, majorStep: 1).isEmpty)
        #expect(disabled.nudge(Self.text, .later).isEmpty)
    }

    // MARK: - Effets : haptique

    @Test("haptique : au choix, au seul passage libre → accroché, au franchissement d'une majeure")
    func interaction_haptics() {
        let interaction = Self.interaction(selected: "texte")
        #expect(interaction.tap(Self.text, at: 3, pointsPerSecond: 20) == [.select("texte", 3), .haptic(.light)])
        let head = [SnapCandidate(kind: .playhead, time: 9)]
        let first = interaction.drag(Self.text, part: .end, by: 1.9, candidates: head, tolerance: 0.25, wasSnapped: false)
        let held = interaction.drag(Self.text, part: .end, by: 1.95, candidates: head, tolerance: 0.25, wasSnapped: true)
        #expect(first.preview.isSnapped && first.effects == [.haptic(.light)])
        #expect(held.preview.isSnapped && held.effects.isEmpty)
        #expect(interaction.scrub(to: 2.1, previous: 1.9, majorStep: 1) == [.seek(2.1), .haptic(.light)])
        #expect(interaction.scrub(to: 2.4, previous: 2.1, majorStep: 1) == [.seek(2.4)])
    }

    @Test("haptique `none` : les mêmes effets, sans un seul tic")
    func interaction_hapticNone_isSilent() {
        let interaction = Self.interaction(selected: nil, haptic: .none)
        #expect(interaction.tap(Self.text, at: 3, pointsPerSecond: 20) == [.select("texte", 3)])
        #expect(interaction.scrub(to: 2.1, previous: 1.9, majorStep: 1) == [.seek(2.1)])
        #expect(interaction.beginDrag(Self.text, part: .move) == [.editing(.move, true), .select("texte", nil)])
    }

    @Test("aimant coupé : la fenêtre brute, jamais accrochée")
    func interaction_snappingNone_neverSnaps() {
        let interaction = MeeshyTimelineFriseInteraction(rule: Self.rule, selectedID: "texte", snapping: .none)
        let head = [SnapCandidate(kind: .playhead, time: 9)]
        let step = interaction.drag(Self.text, part: .end, by: 1.9, candidates: head, tolerance: 0.25, wasSnapped: false)
        #expect(!step.preview.isSnapped)
        #expect(abs(step.preview.range.upperBound - 8.9) < 1e-9)
        #expect(step.effects.isEmpty)
    }

    // MARK: - Effets : la règle

    @Test("la règle : editing(true) et la tête au premier contact, une fois par instant, editing(false) au lâcher")
    func interaction_scrub_pairsAndDeduplicates() {
        let interaction = Self.interaction(selected: nil)
        #expect(interaction.scrub(to: 4, previous: nil, majorStep: 1) == [.editing(.playhead, true), .seek(4)])
        #expect(interaction.scrub(to: 4, previous: 4, majorStep: 1).isEmpty)
        #expect(interaction.scrub(to: 99, previous: 4, majorStep: 1).first == .seek(15))
        #expect(interaction.endScrub(wasScrubbing: true) == [.editing(.playhead, false)])
        #expect(interaction.endScrub(wasScrubbing: false).isEmpty)
        #expect(Self.interaction(selected: nil, canSeek: false).scrub(to: 4, previous: nil, majorStep: 1).isEmpty)
    }

    @Test("le lecteur d'écran et le clavier règlent la tête d'un pas, encadré d'une paire")
    func interaction_playheadCommands() {
        let interaction = Self.interaction(selected: nil)
        #expect(interaction.adjustPlayhead(from: 4, to: 4.5) == [.editing(.playhead, true), .seek(4.5), .editing(.playhead, false)])
        let fine = interaction.playheadCommand(.fineRight, current: 4)
        #expect(fine.count == 3 && fine.first == .editing(.playhead, true) && fine.last == .editing(.playhead, false))
        #expect(interaction.playheadCommand(.home, current: 4).contains(.seek(0)))
        #expect(interaction.playheadCommand(.end, current: 4).contains(.seek(15)))
        #expect(interaction.adjustPlayhead(from: 0, to: -1).isEmpty)
    }

    // MARK: - Accessibilité : les six pas

    @Test("les six pas nommés : chacun d'un `step`, encadré, puis annoncé")
    func interaction_nudges_commitAndAnnounce() {
        let interaction = Self.interaction(selected: "texte")
        let expected: [MeeshyTimelineFriseNudge: ClosedRange<Double>] = [
            .earlier: 1.5...6.5, .later: 2.5...7.5, .entryEarlier: 1.5...7, .entryLater: 2.5...7,
            .exitEarlier: 2...6.5, .exitLater: 2...7.5,
        ]
        #expect(MeeshyTimelineFriseNudge.allCases.count == 6)
        for nudge in MeeshyTimelineFriseNudge.allCases {
            let range = expected[nudge] ?? 0...0
            let part = nudge.part
            let effects = interaction.nudge(Self.text, nudge)
            #expect(effects == [.editing(part, true), .commit("texte", range, part), .editing(part, false), .announce("texte", range)], "\(nudge)")
        }
    }

    @Test("les six pas portent les six noms de l'hôte")
    func names_nudges_mapToTheHostWords() {
        #expect(MeeshyTimelineFriseNudge.allCases.map { $0.name(in: Self.names) } == ["a", "b", "c", "d", "e", "f"])
    }

    @Test("clavier sur une piste : ← → `step`, Maj 0,1 s, Début et Fin les butées, Entrée choisit")
    func interaction_trackCommands() {
        let interaction = Self.interaction(selected: "texte")
        #expect(interaction.trackCommand(.arrowRight, on: Self.text, part: .move).contains(.commit("texte", 2.5...7.5, .move)))
        let fine = interaction.trackCommand(.fineLeft, on: Self.text, part: .start)
        #expect(fine.contains { effect in
            guard case .commit("texte", let range, .start) = effect else { return false }
            return abs(range.lowerBound - 1.9) < 1e-9 && range.upperBound == 7
        })
        #expect(interaction.trackCommand(.home, on: Self.text, part: .move).contains(.commit("texte", 0...5, .move)))
        #expect(interaction.trackCommand(.end, on: Self.text, part: .end).contains(.commit("texte", 2...15, .end)))
        #expect(interaction.trackCommand(.choose, on: Self.text, part: .move) == [.select("texte", nil), .haptic(.light)])
    }

    @Test("toucher un losange de la piste choisie : `onKeyframe`, s'il existe ; sinon le choix")
    func interaction_tapKeyframe() {
        let sticker = MeeshyTimelineFriseTrack(
            id: "sticker", name: "Sticker", systemImage: "face.smiling", range: 4...9, keyframes: [.init(id: "k2", time: 6)]
        )
        let listening = MeeshyTimelineFriseInteraction(rule: Self.rule, selectedID: "sticker", canTouchKeyframes: true)
        #expect(listening.tap(sticker, at: 6.1, pointsPerSecond: 100) == [.keyframe("sticker", "k2")])
        #expect(listening.tap(sticker, at: 7, pointsPerSecond: 100) == [.select("sticker", 7), .haptic(.light)])
        let deaf = MeeshyTimelineFriseInteraction(rule: Self.rule, selectedID: "sticker", canTouchKeyframes: false)
        #expect(deaf.tap(sticker, at: 6, pointsPerSecond: 100) == [.select("sticker", 6), .haptic(.light)])
    }

    // MARK: - Recette

    @Test("loi 13 : rien de choisi ⇒ aucune barre atténuée ; choisie ⇒ les autres à 50 % ; losanges effacés poignée tenue")
    func recipe_law13() {
        #expect(Self.recipe(held: nil, hasSelection: false).barOpacity(isSelected: false) == 1)
        let chosen = Self.recipe(held: nil, hasSelection: true)
        #expect(chosen.barOpacity(isSelected: false) == 0.5)
        #expect(chosen.barOpacity(isSelected: true) == 1)
        #expect(Self.recipe(held: .start, hasSelection: true).keyframeOpacity == 0)
        #expect(Self.recipe(held: .move, hasSelection: true).keyframeOpacity == 1)
        let held = MeeshyTimelineFriseRecipe.resolve(tone: .deep, isEnabled: true, held: .move, isSnapped: true, isZoomed: false, hasSelection: true)
        #expect(held.isSnapped)
        let free = MeeshyTimelineFriseRecipe.resolve(tone: .deep, isEnabled: true, held: nil, isSnapped: true, isZoomed: false, hasSelection: true)
        #expect(!free.isSnapped)
    }

    @Test("désactivée : contenu à 40 %, aucune partie tenue ; ton `theme` : encres du thème")
    func recipe_disabledAndTheme() {
        let disabled = MeeshyTimelineFriseRecipe.resolve(tone: .deep, isEnabled: false, held: .end, isSnapped: true, isZoomed: false, hasSelection: true)
        #expect(disabled.contentOpacity == 0.4)
        #expect(disabled.heldPart == nil && !disabled.isSnapped)
        let theme = MeeshyTimelineFriseRecipe.resolve(tone: .theme, isEnabled: true, held: nil, isSnapped: false, isZoomed: false, hasSelection: false)
        #expect(theme.ink == .theme)
        let plain = MeeshyTimelineFriseRecipe.resolve(tone: .plain, isEnabled: true, held: nil, isSnapped: false, isZoomed: false, hasSelection: false)
        #expect(plain.ink == .onMedia)
    }

    @Test("contraste calculé depuis la recette : étiquette jaune, marques à liseré, ligne du thème clair")
    func recipe_contrast_isComputed() {
        let media = Self.recipe(held: nil, hasSelection: false)
        #expect(media.snapLabelContrast >= 4.5)
        #expect(media.markContrast >= 4.5)
        #expect(media.snapLineContrast(isDark: true) >= 3)
        let theme = MeeshyTimelineFriseRecipe.resolve(tone: .theme, isEnabled: true, held: nil, isSnapped: false, isZoomed: false, hasSelection: false)
        #expect(theme.snapLineContrast(isDark: false) >= 3, "le jaune tomberait à 1,7:1 : l'encre du thème le remplace")
    }

    @Test("cibles : rangées et règle de 44, barres de 34 et 40, couloir de 26 + 6")
    func recipe_targets() {
        #expect(MeeshyTimelineFriseRecipe.rowHeight == 44)
        #expect(MeeshyTimelineFriseRecipe.rulerHeight == 44)
        #expect(MeeshyTimelineFriseRecipe.barHeight(.regular) == 34)
        #expect(MeeshyTimelineFriseRecipe.barHeight(.tall) == 40)
        #expect(MeeshyTimelineFriseRecipe.timeInset == 32)
    }

    // MARK: - Performance

    @Test("le contenu n'est jamais réévalué pendant un geste ; au repos, il suit l'hôte")
    @MainActor
    func content_isFrozenDuringAGesture() {
        let build: (MeeshyTimelineFriseTrack) -> EmptyView = { _ in EmptyView() }
        let frozen = MeeshyTimelineFriseBarContent(track: Self.text, isFrozen: true, content: build)
        let alsoFrozen = MeeshyTimelineFriseBarContent(track: Self.text, isFrozen: true, content: build)
        let resting = MeeshyTimelineFriseBarContent(track: Self.text, isFrozen: false, content: build)
        #expect(frozen == alsoFrozen)
        #expect(frozen != resting)
        #expect(resting != resting)
    }

    @Test("pendant un geste, seule la rangée qui change se re-rend ; la règle ne bouge pas")
    func source_rowsAndRulerAreFrozenDuringAGesture() throws {
        let row = try Self.code("MeeshyTimelineFriseRow.swift")
        #expect(row.contains("struct MeeshyTimelineFriseRow<Content: View>: View, Equatable"))
        #expect(row.contains("struct MeeshyTimelineFriseRowModel: Equatable"))
        #expect(row.contains("lhs.model.isFrozen && rhs.model.isFrozen && lhs.model == rhs.model"), "au repos, les rappels suivent la frise")
        let strip = try Self.code("MeeshyTimelineFriseRulerStrip.swift")
        #expect(strip.contains("struct MeeshyTimelineFriseRulerStrip: View, Equatable"))
        #expect(strip.contains("lhs.isFrozen && rhs.isFrozen"))
        let frise = try Self.code("MeeshyTimelineFrise.swift")
        #expect(frise.components(separatedBy: ".equatable()").count >= 3, "rangées et règle montées en `.equatable()`")
    }

    @Test("un pincement ne devient jamais un glissé : le doigt qui reste après lui est ignoré jusqu'au lâcher")
    func source_pinchNeverBecomesADrag() throws {
        let frise = try Self.code("MeeshyTimelineFrise.swift")
        #expect(frise.contains("if isPinching {\n            if held == nil { held = ignoredHold(track, part: part) }"))
        #expect(!frise.contains("isPinching = false\n                held = nil"), "la fin du pincement ne relâche pas la barre ignorée")
    }

    @Test("l'anneau de focus ne se montre qu'au clavier, jamais sous le doigt")
    func source_focusRingIsKeyboardOnly() throws {
        let row = try Self.code("MeeshyTimelineFriseRow.swift")
        #expect(row.contains("if model.showsFocus && focus.wrappedValue == .track(track.id)"))
        #expect(row.contains("showsFocusRing: model.showsFocus && focus.wrappedValue == .handle(track.id, part)"))
        let strip = try Self.code("MeeshyTimelineFriseRulerStrip.swift")
        #expect(strip.contains("if focusVisible.wrappedValue && focus.wrappedValue == .ruler"))
        let frise = try Self.code("MeeshyTimelineFrise.swift")
        #expect(frise.contains("if !showsFocus { showsFocus = true }"))
        #expect(frise.contains("if showsFocus { showsFocus = false }"))
    }

    @Test("ton `theme` : la puce de l'invite prend un voile de l'encre du thème, pas le voile blanc d'un média")
    func recipe_hintFillFollowsTheInk() {
        let media = MeeshyTimelineFriseRecipe.resolve(tone: .deep, isEnabled: true, held: nil, isSnapped: false, isZoomed: false, hasSelection: false)
        let sheet = MeeshyTimelineFriseRecipe.resolve(tone: .theme, isEnabled: true, held: nil, isSnapped: false, isZoomed: false, hasSelection: false)
        #expect(media.hintFill(isDark: true) == MeeshyColors.mediaFill)
        #expect(sheet.hintFill(isDark: false) != MeeshyColors.mediaFill)
        #expect(sheet.hintFill(isDark: false) == MeeshyColors.textPrimary(isDark: false).opacity(MeeshyTimelineFriseRecipe.bedOpacity))
    }

    // MARK: - Gardes de source

    @Test("aucun verre, aucune couleur en dur, aucun type du composer, aucune chaîne dans les fichiers de K22")
    func source_hasNoGlassNoLiteralColorNoComposerTypeNoString() throws {
        let forbidden = [
            "Color(hex:", "Color(red:", "Color.white", "Color.black", "Color.yellow", ".white)", ".black)", ".yellow",
            "meeshyGlass(", "adaptiveGlass", "adaptiveLiquidGlass", ".glassEffect", "UIBlurEffect", "Material", "MeeshyGlassSurface",
            "ComposerScene", "SceneFriseTrack", "TimelineViewModel", "MeeshyCall", "CacheCoordinator", ".shared",
            "String(localized", "NSLocalizedString", "UIImpactFeedbackGenerator", "sensoryFeedback", ".blur(",
        ]
        for file in Self.files {
            let code = try Self.code(file)
            for word in forbidden { #expect(!code.contains(word), "\(file) contient \(word)") }
            #expect(code.range(of: #"Text\("[^"]"#, options: .regularExpression) == nil, "\(file) écrit un mot")
        }
    }

    @Test("SnapEngine et TimelineGeometry appelés, jamais recopiés")
    func source_snapEngineIsCalled() throws {
        let rule = try Self.code("MeeshyTimelineFriseRule.swift")
        #expect(rule.contains("SnapEngine(toleranceSeconds:"))
        #expect(rule.contains("engine.snap(rawTime:"))
        #expect(rule.contains("TimelineGeometry(zoomScale:"))
        for file in Self.files {
            let code = try Self.code(file)
            #expect(!code.contains("pickBest") && !code.contains("priority(for"), "\(file)")
        }
    }

    @Test("le temps ne se met pas en miroir ; seules la tête et la règle lisent l'horloge")
    func source_layoutAndClock() throws {
        let frise = try Self.code("MeeshyTimelineFrise.swift")
        #expect(frise.contains(".environment(\\.layoutDirection, .leftToRight)"))
        #expect(frise.components(separatedBy: "PlayheadTimeReader(").count == 2, "la seule feuille de la tête")
        #expect(!frise.contains("@ObservedObject"))
        let strip = try Self.code("MeeshyTimelineFriseRulerStrip.swift")
        #expect(strip.components(separatedBy: "PlayheadTimeReader(").count == 2, "la seule valeur dite de la règle")
        #expect(!strip.contains("@ObservedObject"))
    }

    @Test("loi 13 dans le code : poignées, losanges, ascenseur, invite, ligne du haut, tête, vide")
    func source_law13() throws {
        let row = try Self.code("MeeshyTimelineFriseRow.swift")
        #expect(row.contains("if model.isSelected && model.isAdjustable { handles("))
        #expect(row.contains("if model.isSelected { keyframes("))
        let layers = try Self.code("MeeshyTimelineFriseLayers.swift")
        #expect(layers.contains("guard recipe.isZoomed, duration > 0 else { return }"))
        let frise = try Self.code("MeeshyTimelineFrise.swift")
        #expect(frise.contains("let hint = recipe.isZoomed || !canZoom ? nil : names.zoomHint"))
        #expect(frise.contains("if hasTransport || hint != nil {"))
        #expect(frise.contains("if let clock {\n            let top"))
        #expect(frise.contains("if tracks.isEmpty {\n            empty"))
        #expect(frise.contains(".accessibilityHidden(calls.onSeek == nil)"))
        #expect(frise.contains("if !text.isEmpty {"), "`timeText(_, snap)` vide ⇒ la ligne seule")
    }

    @Test("accessibilité : un groupe nommé, une piste = un élément à six pas, la règle réglable, le zoom nommé")
    func source_accessibility() throws {
        let frise = try Self.code("MeeshyTimelineFrise.swift")
        #expect(frise.contains(".accessibilityElement(children: .contain)"))
        #expect(frise.contains(".accessibilityLabel(Text(names.frise))"))
        #expect(frise.contains(".accessibilityZoomAction"))
        let row = try Self.code("MeeshyTimelineFriseRow.swift")
        #expect(row.contains(".accessibilityElement(children: .ignore)"))
        #expect(row.contains("nudges: model.isAdjustable ? MeeshyTimelineFriseNudge.allCases : []"))
        #expect(row.contains("Button(step.name(in: names))"))
        let strip = try Self.code("MeeshyTimelineFriseRulerStrip.swift")
        #expect(strip.contains(".accessibilityAdjustableAction"))
        #expect(strip.contains(".accessibilityLabel(Text(names.playhead))"))
    }

    @Test("les couches dessinées sont Equatable et montées en `.equatable()`")
    func source_layersAreEquatable() throws {
        let layers = try Self.code("MeeshyTimelineFriseLayers.swift")
        let users = try Self.files.map { try Self.code($0) }.joined()
        for layer in ["RulerCanvas", "BarChrome", "HandleShape", "KeyMark", "SnapLine", "SnapLabel", "PlayheadShape", "ZoomHint"] {
            #expect(layers.contains("struct MeeshyTimelineFrise\(layer): View, Equatable"), "\(layer)")
            #expect(users.contains("MeeshyTimelineFrise\(layer)("), "\(layer)")
        }
        #expect(users.contains(".equatable()"))
    }

    // MARK: - Fabriques

    private static let files = [
        "MeeshyTimelineFrise.swift", "MeeshyTimelineFrise+API.swift", "MeeshyTimelineFriseRow.swift",
        "MeeshyTimelineFriseRulerStrip.swift", "MeeshyTimelineFriseLayers.swift", "MeeshyTimelineFriseRule.swift",
        "MeeshyTimelineFriseViewport.swift", "MeeshyTimelineFriseInteraction.swift", "MeeshyTimelineFriseRecipe.swift",
        "MeeshyTimelineFriseSupport.swift", "MeeshyTimelineFriseVocabulary.swift",
    ]

    private static let rule = MeeshyTimelineFriseRule(duration: 15, minimumSpan: 0.3)

    private static let text = MeeshyTimelineFriseTrack(id: "texte", name: "Texte", systemImage: "textformat", range: 2...7)

    private static let names = MeeshyTimelineFriseNames(
        frise: "frise", playhead: "tête", earlier: "a", later: "b", entryEarlier: "c", entryLater: "d",
        exitEarlier: "e", exitLater: "f", start: "début", end: "fin", zoomIn: "+", zoomOut: "-"
    )

    private static func interaction(
        selected: String?,
        haptic: MeeshyTimelineFriseHaptic = .standard,
        isEnabled: Bool = true,
        canEdit: Bool = true,
        canSeek: Bool = true
    ) -> MeeshyTimelineFriseInteraction {
        MeeshyTimelineFriseInteraction(
            rule: rule, selectedID: selected, haptic: haptic, isEnabled: isEnabled, canEdit: canEdit, canSeek: canSeek
        )
    }

    private static func recipe(held: MeeshyTimelineFrisePart?, hasSelection: Bool) -> MeeshyTimelineFriseRecipe {
        MeeshyTimelineFriseRecipe.resolve(tone: .deep, isEnabled: true, held: held, isSnapped: false, isZoomed: false, hasSelection: hasSelection)
    }

    private static func tracks(_ row: [String: Any]) throws -> [MeeshyTimelineFriseTrack] {
        try kitRequired(row["pistes"] as? [[String: Any]]).map { piste in
            let keys = (piste["cles"] as? [Double] ?? []).enumerated().map { MeeshyTimelineFriseKey(id: "\($0.offset)", time: $0.element) }
            return MeeshyTimelineFriseTrack(
                id: try kitRequired(piste["id"] as? String), name: "", systemImage: "", range: try pair(piste["plage"]), keyframes: keys
            )
        }
    }

    private static func part(_ row: [String: Any]) throws -> MeeshyTimelineFrisePart {
        let raw = try kitRequired(row["partie"] as? String)
        return try kitRequired(MeeshyTimelineFrisePart(rawValue: raw))
    }

    private static func double(_ row: [String: Any], _ key: String) throws -> Double {
        try kitRequired(row[key] as? Double)
    }

    private static func pair(_ value: Any?) throws -> ClosedRange<Double> {
        let bounds = try kitRequired(value as? [Double])
        return bounds[0]...bounds[1]
    }

    private static func candidates(_ row: [String: Any]) throws -> [SnapCandidate] {
        try kitRequired(row["candidats"] as? [[String: Any]]).map { candidate in
            let time = Float(try double(candidate, "temps"))
            switch candidate["type"] as? String {
            case "playhead": return SnapCandidate(kind: .playhead, time: time)
            case "clipStart": return SnapCandidate(kind: .clipStart, time: time)
            case "keyframe": return SnapCandidate(kind: .keyframe, time: time)
            default: return SnapCandidate(kind: .clipEnd, time: time)
            }
        }
    }

    private static func expectRange(_ range: ClosedRange<Double>, _ expected: Any?, _ row: [String: Any]) throws {
        let bounds = try kitRequired(expected as? [Double])
        let matches = abs(range.lowerBound - bounds[0]) < 1e-4 && abs(range.upperBound - bounds[1]) < 1e-4
        #expect(matches, "\(row["nom"] ?? "") : \(range)")
    }

    private static func expectViewport(_ view: MeeshyTimelineFriseViewport, _ expected: Any?, _ name: String) throws {
        let bounds = try kitRequired(expected as? [Double])
        #expect(abs(view.start - bounds[0]) < 1e-3 && abs(view.span - bounds[1]) < 1e-3, "\(name) : \(view)")
    }

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func json() throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K22-MeeshyTimelineFrise.vectors.json")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return try kitRequired(object as? [String: Any])
    }

    private static func rows(_ key: String) throws -> [[String: Any]] {
        try kitRequired(try json()[key] as? [[String: Any]])
    }

    private static func object(_ key: String) throws -> [String: Any] {
        try kitRequired(try json()[key] as? [String: Any])
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
