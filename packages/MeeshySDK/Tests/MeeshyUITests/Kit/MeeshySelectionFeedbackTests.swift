import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K23 — le halo de sélection et les repères d'aimantation, lus comme des
/// VALEURS : la recette du halo, le plan des repères, les tics, l'accessibilité,
/// le contraste, puis les gardes de source (ni cadre, ni poignée, ni toucher, ni
/// couleur en dur, ni loi d'aimantation réécrite). Les lignes viennent du fichier
/// de vecteurs que lisent aussi Android et le web.
@Suite("MeeshySelectionFeedback")
struct MeeshySelectionFeedbackTests {

    // MARK: - Halo

    @Test("le halo : encre par ton, lueurs par contraste, rayons divisés par l'échelle")
    func recipe_halo_followsTheVectors() throws {
        for row in try Self.rows("halo") {
            let toneName = try kitRequired(row["ton"] as? String)
            let tone = try #require(MeeshyGlassTone(rawValue: toneName))
            let scale = try kitRequired(row["echelle"] as? Double)
            let recipe = MeeshySelectionFeedbackRecipe.halo(
                tone: tone,
                isIncreasedContrast: row["contraste"] as? String == "accru",
                scale: scale
            )
            #expect(recipe.ink.rawValue == row["encre"] as? String, "\(row["nom"] ?? "")")
            let expected = try #require(row["couches"] as? [[Double]])
            #expect(recipe.layers.count == expected.count, "\(row["nom"] ?? "")")
            for (layer, pair) in zip(recipe.layers, expected) {
                #expect(abs(Double(layer.radius) - pair[0]) < 1e-9 && abs(layer.opacity - pair[1]) < 1e-9, "\(row["nom"] ?? "")")
            }
        }
    }

    @Test("l'encre du halo : sombre sur une scène claire, blanche partout ailleurs")
    func recipe_ink_followsTheTone() {
        for tone in MeeshyGlassTone.allCases {
            let ink = MeeshySelectionFeedbackRecipe.halo(tone: tone, isIncreasedContrast: false, scale: 1).ink
            #expect(ink == (tone == .onLight ? .mediaBackdrop : .onMedia), "\(tone)")
        }
    }

    @Test("fondu du halo seul : 150 ms à l'apparition, 100 ms au retrait, aucun sous « réduire les animations »")
    func recipe_fade_followsTheSheet() throws {
        let recipe = try Self.object("recette")
        let fade = try kitRequired(recipe["fondu"] as? [String: Double])
        #expect(MeeshySelectionFeedbackRecipe.haloFadeIn == fade["apparition"])
        #expect(MeeshySelectionFeedbackRecipe.haloFadeOut == fade["retrait"])
        #expect(MeeshySelectionFeedbackRecipe.fade(appearing: true, reduceMotion: false) == .easeOut(duration: 0.15))
        #expect(MeeshySelectionFeedbackRecipe.fade(appearing: false, reduceMotion: false) == .easeOut(duration: 0.1))
        #expect(MeeshySelectionFeedbackRecipe.fade(appearing: true, reduceMotion: true) == nil)
        #expect(MeeshySelectionFeedbackRecipe.fade(appearing: false, reduceMotion: true) == nil)
    }

    @Test("le modificateur pose l'état « sélectionné » et le retire, sans rien ajouter d'autre")
    func accessibility_traits_follow_selection() {
        #expect(MeeshySelectionFeedbackAccessibility.traits(isSelected: true) == .isSelected)
        #expect(MeeshySelectionFeedbackAccessibility.traits(isSelected: false) == [])
    }

    @Test("la boîte arrondie et la silhouette se déclarent par la forme, jamais par un booléen")
    func shape_isTwoCases() {
        #expect(MeeshySelectionHaloShape.content != .rounded(12))
        #expect(MeeshySelectionHaloShape.rounded(12) == .rounded(12))
        #expect(MeeshySelectionHaloShape.rounded(12) != .rounded(16))
    }

    // MARK: - Repères

    @Test("ce qui se peint : lignes engagées et candidates, hors bornes et doublons ignorés, candidate masquée sous l'engagée")
    func rule_plan_followsTheVectors() throws {
        for row in try Self.rows("lignes") {
            let engaged = try Self.lines(row["engagees"])
            let candidates = try Self.lines(row["candidates"])
            let plan = try #require(MeeshySnapGuidesRule.plan(isActive: true, engaged: engaged, candidates: candidates))
            let size = try Self.pair(row["taille"])
            let expected = try kitRequired(row["attendu"] as? [String: Any])
            let name = "\(row["nom"] ?? "")"
            try Self.assertLines(plan.engaged, size: size, equals: try kitRequired(expected["engagees"]), name: name)
            try Self.assertLines(plan.candidates, size: size, equals: try kitRequired(expected["candidates"]), name: name)
        }
    }

    @Test("inactif, rien ne se peint : aucun plan, aucune ligne dans l'arbre")
    func rule_plan_isNilWhenInactive() {
        let lines = MeeshySnapLines(vertical: [0.5], horizontal: [0.25])
        #expect(MeeshySnapGuidesRule.plan(isActive: false, engaged: lines, candidates: lines) == nil)
        #expect(MeeshySnapGuidesRule.plan(isActive: true, engaged: .none, candidates: .none)?.isEmpty == true)
    }

    @Test("un tic `light` par nouvelle ligne : jamais en continu, jamais à la sortie, aucun avec `none`")
    @MainActor
    func rule_haptic_followsTheVectors() throws {
        for row in try Self.rows("sequences") {
            let hapticName = try kitRequired(row["haptique"] as? String)
            let haptic = try #require(MeeshySnapHaptic(rawValue: hapticName))
            let steps = try kitRequired(row["etapes"] as? [[String: Any]])
            var previous = MeeshySnapLines.none
            for step in steps {
                let next = try Self.lines(step["engagees"])
                var played = 0
                MeeshySnapGuidesRule.perform(from: previous, to: next, haptic: haptic, play: { played += 1 })
                #expect(played == step["attendu"] as? Int, "\(row["nom"] ?? "") : \(step)")
                previous = next
            }
        }
    }

    @Test("cent mouvements du doigt à lignes égales : aucun tic, et les repères restent égaux à eux-mêmes")
    @MainActor
    func guides_sameLines_neverRedrawNorTap() {
        let lines = MeeshySnapLines(vertical: [0.5])
        let first = MeeshySnapGuides(isActive: true, engaged: lines)
        var taps = 0
        for _ in 0..<100 {
            MeeshySnapGuidesRule.perform(from: lines, to: lines, haptic: .light, play: { taps += 1 })
            #expect(first == MeeshySnapGuides(isActive: true, engaged: lines))
        }
        #expect(taps == 0)
        #expect(first != MeeshySnapGuides(isActive: true, engaged: MeeshySnapLines(vertical: [0.75])))
        #expect(first != MeeshySnapGuides(isActive: false, engaged: lines))
    }

    @Test("la recette des repères : les mesures du canvas UIKit, reprises telles quelles")
    func recipe_guides_followsTheSheet() throws {
        let sheet = try Self.object("recette")
        let style = MeeshySelectionFeedbackRecipe.guides()
        let engaged = try kitRequired(sheet["engagee"] as? [String: Any])
        let candidates = try kitRequired(sheet["candidates"] as? [String: Any])
        let bounds = try kitRequired(sheet["contour"] as? [String: Any])
        #expect(Double(style.engagedWidth) == engaged["epaisseur"] as? Double)
        #expect(Double(style.engagedEdgeWidth) == engaged["filet"] as? Double)
        #expect(style.candidateOpacity == candidates["opacite"] as? Double)
        #expect(Double(style.candidateWidth) == candidates["epaisseur"] as? Double)
        #expect(style.candidateDash.map(Double.init) == candidates["tirets"] as? [Double])
        #expect(style.boundsOpacity == bounds["opacite"] as? Double)
        #expect(Double(style.boundsWidth) == bounds["epaisseur"] as? Double)
        #expect(Double(style.boundsInset) == bounds["retrait"] as? Double)
    }

    @Test("le jaune de l'accroche est un alias de `warning`, comme celui de la piste de coupe")
    func colors_mediaSnap_isWarning() {
        #expect(MeeshyColors.mediaSnap == MeeshyColors.warning)
        #expect(MeeshyColors.mediaSnap == MeeshyColors.mediaTrim)
    }

    // MARK: - Contraste

    @Test("contraste calculé depuis la recette : 12,6 : 1 sur noir, 1,7 : 1 sur blanc, que le liseré sombre relève")
    func contrast_isComputedFromTheRecipe() throws {
        let sheet = try Self.object("contraste")
        let hex = try kitRequired(sheet["jaune"] as? String)
        let tolerance = try kitRequired(sheet["tolerance"] as? Double)
        let onBlack = try kitRequired(sheet["surNoir"] as? Double)
        let onWhite = try kitRequired(sheet["surBlanc"] as? Double)
        let yellow = Self.luminance(hex: hex)
        #expect(abs(Self.ratio(yellow, 0) - onBlack) < tolerance)
        #expect(abs(Self.ratio(yellow, 1) - onWhite) < tolerance)
        let style = MeeshySelectionFeedbackRecipe.guides()
        #expect(style.engagedEdgeWidth > 0, "sans liseré, la ligne s'efface sur une scène claire")
        let edgeOverWhite = Self.luminanceOfBlackOverWhite(opacity: 0.5)
        #expect(Self.ratio(yellow, edgeOverWhite) > Self.ratio(yellow, 1) + 0.5)
    }

    // MARK: - Source

    @Test("ni cadre, ni poignée, ni badge : K23 ne peint qu'une lueur et des lignes")
    func source_hasNoFrameNoHandle() throws {
        for file in ["MeeshySelectionFeedback.swift", "MeeshySnapGuides.swift"] {
            let code = try Self.code(file)
            for word in ["strokeBorder", ".border(", "Handle", "handle", "badge", "Badge", "overlay(alignment"] {
                #expect(!code.contains(word), "\(file) contient \(word)")
            }
        }
    }

    @Test("aucun toucher : le halo n'agrandit pas la cible, les repères ne captent rien et se taisent")
    func source_takesNoTouch() throws {
        let halo = try Self.code("MeeshySelectionFeedback.swift")
        let guides = try Self.code("MeeshySnapGuides.swift")
        #expect(halo.contains(".allowsHitTesting(false)"))
        #expect(guides.contains(".allowsHitTesting(false)"))
        #expect(guides.contains(".accessibilityHidden(true)"))
        for code in [halo, guides] {
            for word in ["onTapGesture", ".gesture(", "DragGesture", "MagnificationGesture", "Button(", ".focusable(", "contentShape"] {
                #expect(!code.contains(word), "contient \(word)")
            }
        }
    }

    @Test("pas de miroir en RTL : une scène est un média, les fractions se comptent depuis la gauche physique")
    func source_doesNotMirror() throws {
        for file in ["MeeshySelectionFeedback.swift", "MeeshySnapGuides.swift", "MeeshySnapGuidesRule.swift"] {
            let code = try Self.code(file)
            #expect(!code.contains("layoutDirection"), file)
            #expect(!code.contains("flipsForRightToLeftLayoutDirection"), file)
        }
    }

    @Test("aucune couleur ni code en dur, aucune loi d'aimantation réécrite")
    func source_hasNoLiteralColorNoSnapLaw() throws {
        let files = [
            "MeeshySelectionFeedback.swift", "MeeshySelectionFeedbackRecipe.swift", "MeeshySnapGuides.swift",
            "MeeshySnapGuidesRule.swift", "MeeshySnapGuidesModels.swift", "Catalog/MeeshyKitCatalog+K23.swift",
        ]
        let forbidden = [
            "Color(hex:", "Color(red:", "Color(white:", "Color.white", "Color.black", "Color.yellow", "Color.pink",
            ".white", ".black", ".yellow", ".pink", "UIColor", "#FF", "0x", "snapTargets", "snapTolerance",
            "0.18", "0.82", "0.035",
        ]
        for file in files {
            let code = try Self.code(file)
            for word in forbidden where !(file.hasPrefix("Catalog") && ["0.18", "0.82"].contains(word)) {
                #expect(!code.contains(word), "\(file) contient \(word)")
            }
        }
    }

    @Test("rien d'animé que l'opacité du halo : ni minuteur, ni mise en page, ni flou recalculé")
    func source_animatesOnlyTheGlow() throws {
        let code = try Self.code("MeeshySelectionFeedback.swift")
        #expect(code.components(separatedBy: "withAnimation(").count == 2)
        for word in ["Timer", "TimelineView", "GeometryReader", ".animation(", ".blur(", "scaleEffect", ".frame("] {
            #expect(!code.contains(word), "MeeshySelectionFeedback.swift contient \(word)")
        }
    }

    // MARK: - Aides

    private static func assertLines(_ lines: MeeshySnapLines, size: (Double, Double), equals expected: Any, name: String) throws {
        let table = try #require(expected as? [String: Any])
        let vertical = try #require(table["verticales"] as? [Double])
        let horizontal = try #require(table["horizontales"] as? [Double])
        let x = MeeshySnapGuidesRule.points(lines.vertical, length: CGFloat(size.0)).map(Double.init)
        let y = MeeshySnapGuidesRule.points(lines.horizontal, length: CGFloat(size.1)).map(Double.init)
        #expect(x.count == vertical.count && zip(x, vertical).allSatisfy { abs($0 - $1) < 1e-6 }, "\(name) x \(x) ≠ \(vertical)")
        #expect(y.count == horizontal.count && zip(y, horizontal).allSatisfy { abs($0 - $1) < 1e-6 }, "\(name) y \(y) ≠ \(horizontal)")
    }

    /// Une fraction du fichier de vecteurs : un nombre, ou « nan » / « inf ».
    private static func fraction(_ value: Any) throws -> CGFloat {
        if let number = value as? Double { return CGFloat(number) }
        switch value as? String {
        case "nan": return .nan
        case "inf": return .infinity
        default: throw MeeshySelectionFeedbackVectorError.unreadable("\(value)")
        }
    }

    private static func lines(_ value: Any?) throws -> MeeshySnapLines {
        let table = try #require(value as? [String: Any])
        return MeeshySnapLines(
            vertical: try (table["verticales"] as? [Any] ?? []).map(fraction),
            horizontal: try (table["horizontales"] as? [Any] ?? []).map(fraction)
        )
    }

    private static func pair(_ value: Any?) throws -> (Double, Double) {
        let numbers = try #require(value as? [Double])
        return (numbers[0], numbers[1])
    }

    private static func channel(_ value: Double) -> Double {
        value <= 0.03928 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
    }

    private static func luminance(hex: String) -> Double {
        let value = Int(hex, radix: 16) ?? 0
        let red = Double((value >> 16) & 0xFF) / 255
        let green = Double((value >> 8) & 0xFF) / 255
        let blue = Double(value & 0xFF) / 255
        return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
    }

    private static func luminanceOfBlackOverWhite(opacity: Double) -> Double {
        channel(1 - opacity)
    }

    private static func ratio(_ first: Double, _ second: Double) -> Double {
        (max(first, second) + 0.05) / (min(first, second) + 0.05)
    }

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func json() throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K23-MeeshySelectionFeedback.vectors.json")
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

private enum MeeshySelectionFeedbackVectorError: Error {
    case unreadable(String)
}
