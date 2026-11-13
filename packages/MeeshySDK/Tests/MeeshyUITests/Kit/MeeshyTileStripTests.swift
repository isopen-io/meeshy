import Testing
import Foundation
import SwiftUI
import UIKit
@testable import MeeshyUI

/// K19 — la bande de vignettes, lue comme des VALEURS : les lois du défilement
/// (centre, pas, suivi), la géométrie, les bords, la recette, le toucher, le nom
/// et le rôle. Les mesures viennent du fichier de vecteurs que lisent aussi
/// Android et le web.
@Suite("MeeshyTileStrip")
struct MeeshyTileStripTests {

    // MARK: - Les lois du défilement

    @Test("la vignette au centre suit les vecteurs, et les rebonds restent sur les bords")
    func rule_centeredIndex_followsTheVectors() throws {
        for row in try Self.rows("centered") {
            let index = MeeshyTileStripRule.centeredIndex(
                scrolled: try Self.cg(row["scrolled"]), pitch: try Self.cg(row["pitch"]), count: try #require(row["count"] as? Int)
            )
            #expect(index == row["index"] as? Int, "\(row)")
        }
    }

    @Test("le pas est borné aux extrémités, et sans courante il part de la première")
    func rule_stepping_followsTheVectors() throws {
        for row in try Self.rows("stepping") {
            let count = try #require(row["count"] as? Int)
            let ids = Array(0..<count)
            let next = MeeshyTileStripRule.stepping(row["selection"] as? Int, in: ids, by: try #require(row["step"] as? Int))
            #expect(next == row["next"] as? Int, "\(row)")
        }
    }

    @Test("un toucher ne répond que sur une autre vignette, active")
    func rule_responds_followsTheVectors() throws {
        for row in try Self.rows("responds") {
            let answers = MeeshyTileStripRule.responds(
                tapped: try #require(row["tapped"] as? String),
                selection: row["selection"] as? String,
                isEnabled: try #require(row["enabled"] as? Bool)
            )
            #expect(answers == row["responds"] as? Bool, "\(row)")
        }
    }

    @Test("le suivi : chaque scénario des vecteurs rend ce qu'il doit à chaque pas")
    func follow_followsTheVectors() throws {
        for scenario in try Self.rows("follow") {
            var follow = MeeshyTileStripFollow()
            let name = try #require(scenario["name"] as? String)
            for step in try #require(scenario["steps"] as? [[String: Any]]) {
                try Self.play(step, on: &follow, scenario: name)
            }
        }
    }

    // MARK: - La géométrie

    @Test("le pas est la largeur d'une vignette plus l'écart")
    func geometry_pitch() throws {
        for row in try Self.rows("pitch") {
            let geometry = Self.geometry(tileWidth: try Self.cg(row["tileWidth"]), spacing: try Self.cg(row["spacing"]))
            #expect(Double(geometry.pitch) == row["pitch"] as? Double, "\(row)")
        }
    }

    @Test("le cadre d'une vignette, dans le contenu, depuis le début de la bande")
    func geometry_frame() throws {
        for row in try Self.rows("frames") {
            let geometry = try Self.geometry(row)
            let frame = geometry.frame(of: try #require(row["index"] as? Int))
            #expect(Double(frame.minX) == row["x"] as? Double, "\(row)")
            #expect(Double(frame.minY) == row["y"] as? Double, "\(row)")
            #expect(Double(frame.width) == row["width"] as? Double, "\(row)")
            #expect(Double(frame.height) == row["height"] as? Double, "\(row)")
        }
    }

    @Test("la largeur du contenu compte la marge des deux côtés et aucun écart de fin")
    func geometry_contentWidth() throws {
        for row in try Self.rows("contentWidth") {
            let geometry = try Self.geometry(row)
            #expect(Double(geometry.contentWidth) == row["width"] as? Double, "\(row)")
        }
    }

    @Test("les vignettes dont un pixel se voit : une vignette qui touche juste le bord ne se voit pas")
    func geometry_visibleRange() throws {
        for row in try Self.rows("visible") {
            let range = try Self.geometry(row).visibleRange(offset: try Self.cg(row["offset"]), viewport: try Self.cg(row["viewport"]))
            let expected = row["visible"] as? [Int]
            #expect(range?.lowerBound == expected?.first, "\(row)")
            #expect(range?.upperBound == expected?.last, "\(row)")
        }
    }

    @Test("une grille a des colonnes égales aux proportions de la vignette")
    func geometry_gridCell() throws {
        for row in try Self.rows("gridCells") {
            let cell = MeeshyTileStripGeometry.gridCell(
                width: try Self.cg(row["width"]),
                columns: try #require(row["columns"] as? Int),
                spacing: try Self.cg(row["spacing"]),
                tileSize: CGSize(width: try Self.cg(row["tileWidth"]), height: try Self.cg(row["tileHeight"]))
            )
            #expect(Double(cell.width) == row["cellWidth"] as? Double, "\(row)")
            #expect(Double(cell.height) == row["cellHeight"] as? Double, "\(row)")
        }
    }

    @Test("la cible d'une vignette atteint 44 pt, sans changer ce que l'aperçu dessine")
    func geometry_target_reachesTheTapTarget() throws {
        let targets = try Self.object("tapTarget")
        #expect(Double(MeeshyControlSize.tapTarget) == targets["ios"] as? Double)
        let small = MeeshyTileStripGeometry.target(of: CGSize(width: 30, height: 30))
        #expect(small == CGSize(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget))
        let tile = MeeshyTileStripGeometry.target(of: CGSize(width: 56, height: 72))
        #expect(tile == CGSize(width: 56, height: 72))
    }

    // MARK: - Les bords

    @Test("les bords suivent les vecteurs (la loi de K04, lue ici sur une bande)")
    func edges_followTheVectors() throws {
        for row in try Self.rows("edges") {
            let edges = MeeshyScrollEdges.of(
                content: try Self.cg(row["content"]), viewport: try Self.cg(row["viewport"]), offset: try Self.cg(row["offset"])
            )
            #expect(edges.start == row["start"] as? Bool, "\(row)")
            #expect(edges.end == row["end"] as? Bool, "\(row)")
        }
    }

    @Test("la tolérance et la largeur de l'estompe sont celles des vecteurs : la cible tactile")
    func edges_constantsFollowTheVectors() throws {
        let vectors = try Self.json()
        #expect(Double(MeeshyScrollEdges.tolerance) == vectors["edgeTolerance"] as? Double)
        #expect(Double(MeeshyTileRecipe.edgeFade) == vectors["edgeFade"] as? Double)
        #expect(MeeshyTileRecipe.edgeFade == MeeshyControlSize.tapTarget)
        #expect(MeeshyTileRecipe.edgeFadeDuration * 1000 == vectors["edgeFadeMs"] as? Double)
    }

    // MARK: - La recette

    @Test("cercle ou plein, voile et opacité suivent les vecteurs, par état et par surface")
    func recipe_followsTheVectors() throws {
        for row in try Self.rows("recipe") {
            let surface = try #require(MeeshyTileSurface(rawValue: try kitRequired(row["surface"] as? String)))
            let style = try #require(MeeshyTileSelectionStyle(rawValue: try kitRequired(row["style"] as? String)))
            let recipe = MeeshyTileRecipe.resolve(
                surface: surface,
                selectionStyle: style,
                isSelected: try #require(row["selected"] as? Bool),
                isPressed: try #require(row["pressed"] as? Bool),
                isHovered: try #require(row["hovered"] as? Bool),
                isEnabled: try #require(row["enabled"] as? Bool)
            )
            #expect(recipe.tone.rawValue == row["tone"] as? String, "\(row)")
            #expect(recipe.ringOpacity == row["ringOpacity"] as? Double, "\(row)")
            #expect(recipe.fillOpacity == row["fillOpacity"] as? Double, "\(row)")
            #expect(recipe.opacity == row["opacity"] as? Double, "\(row)")
            #expect(recipe.fillInk?.rawValue == row["fillInk"] as? String, "\(row)")
        }
    }

    @Test("les opacités, les durées et les voisines sont celles des vecteurs")
    func recipe_constantsFollowTheVectors() throws {
        let vectors = try Self.json()
        #expect(MeeshyTileRecipe.disabledOpacity == vectors["disabledOpacity"] as? Double)
        #expect(MeeshyTileRecipe.pressedOpacity == vectors["pressedOpacity"] as? Double)
        #expect(MeeshyTileRecipe.placeholderVeil == vectors["placeholderVeil"] as? Double)
        #expect(Double(MeeshyTileRecipe.neighbourScale) == vectors["neighbourScale"] as? Double)
        #expect(MeeshyTileRecipe.neighbourOpacity == vectors["neighbourOpacity"] as? Double)
        #expect(MeeshyTileRecipe.ringFadeDuration * 1000 == vectors["ringFadeMs"] as? Double)
        #expect(MeeshyTileRecipe.revealDuration * 1000 == vectors["revealMs"] as? Double)
        #expect(MeeshyTileRecipe.restDelay * 1000 == vectors["restMs"] as? Double)
        #expect(MeeshyTileRecipe.pressedOpacity == MeeshyOpacity.intense)
        #expect(MeeshyTileRecipe.placeholderVeil == MeeshyOpacity.subtle)
    }

    @Test("le repos ne se confond ni avec l'appui ni avec le survol, pour chaque surface", arguments: MeeshyTileSurface.allCases)
    func recipe_pressIsVisible(surface: MeeshyTileSurface) {
        for style in MeeshyTileSelectionStyle.allCases {
            for selected in [false, true] {
                let rest = MeeshyTileRecipe.resolve(surface: surface, selectionStyle: style, isSelected: selected)
                let pressed = MeeshyTileRecipe.resolve(surface: surface, selectionStyle: style, isSelected: selected, isPressed: true)
                let hovered = MeeshyTileRecipe.resolve(surface: surface, selectionStyle: style, isSelected: selected, isHovered: true)
                #expect(rest != pressed)
                #expect(pressed == hovered)
            }
        }
    }

    @Test("désactivée, la vignette ne répond ni à l'appui ni au survol, et son contenu est à 40 %")
    func recipe_disabled() {
        let rest = MeeshyTileRecipe.resolve(surface: .onMedia, selectionStyle: .ring, isSelected: false, isEnabled: false)
        let pressed = MeeshyTileRecipe.resolve(
            surface: .onMedia, selectionStyle: .ring, isSelected: false, isPressed: true, isHovered: true, isEnabled: false
        )
        #expect(rest == pressed)
        #expect(rest.opacity == 0.4)
        #expect(!rest.respondsToTouch)
        #expect(!rest.playsHaptic)
    }

    @Test("pas de cercle sans courante, et le plein ne pose pas de cercle")
    func recipe_ringOnlyOnTheSelectedRingTile() {
        #expect(MeeshyTileRecipe.resolve(surface: .onMedia, selectionStyle: .ring, isSelected: false).ringOpacity == 0)
        #expect(MeeshyTileRecipe.resolve(surface: .onMedia, selectionStyle: .ring, isSelected: true).ringOpacity == 1)
        #expect(MeeshyTileRecipe.resolve(surface: .onMedia, selectionStyle: .fill, isSelected: true).ringOpacity == 0)
    }

    @Test("le cercle blanc tient 3:1 contre la plaque, l'encre du thème 4,5:1 en clair comme en sombre")
    func recipe_contrast() {
        let ring = MeeshyTileRecipe.resolve(surface: .onMedia, selectionStyle: .ring, isSelected: true)
        #expect(ring.contrast(against: MeeshyColors.backgroundPrimary(isDark: true), isDark: true) >= 3)
        for isDark in [false, true] {
            let themed = MeeshyTileRecipe.resolve(surface: .theme, selectionStyle: .ring, isSelected: true)
            #expect(themed.contrast(against: MeeshyColors.backgroundPrimary(isDark: isDark), isDark: isDark) >= 4.5, "dark \(isDark)")
        }
    }

    // MARK: - Mesures

    @Test("taille, rayons, écarts et cercle suivent les vecteurs")
    func metrics_followTheVectors() throws {
        let tile = try Self.object("tile")
        #expect(Double(MeeshyTileMetrics.defaultSize.width) == tile["width"] as? Double)
        #expect(Double(MeeshyTileMetrics.defaultSize.height) == tile["height"] as? Double)
        #expect(Double(MeeshyTileMetrics.radius) == tile["radius"] as? Double)
        #expect(Double(MeeshyTileMetrics.fillRadius) == tile["fillRadius"] as? Double)
        #expect(Double(MeeshyTileMetrics.spacing) == tile["spacing"] as? Double)
        #expect(Double(MeeshyTileMetrics.rowSpacing) == tile["rowSpacing"] as? Double)
        #expect(Double(MeeshyTileMetrics.nameGap) == tile["nameGap"] as? Double)
        #expect(Double(MeeshyTileMetrics.nameFontSize) == tile["nameFont"] as? Double)
        #expect(MeeshyTileMetrics.nameMaxLines == tile["nameLines"] as? Int)
        #expect(Double(MeeshyTileMetrics.ringGap) == tile["ringGap"] as? Double)
        #expect(Double(MeeshyTileMetrics.ringLine) == tile["ringLine"] as? Double)
        #expect(Double(MeeshyTileMetrics.reserve) == tile["reserve"] as? Double)
        #expect(MeeshyTileMetrics.defaultColumns == (try Self.json())["gridColumns"] as? Int)
    }

    @Test("le cercle est à 2 de l'aperçu, de 2 de trait : la bande réserve 4 autour des vignettes")
    func metrics_ringReserve() {
        #expect(MeeshyTileMetrics.ringGap == MeeshyBorder.strong)
        #expect(MeeshyTileMetrics.ringLine == MeeshyBorder.strong)
        #expect(MeeshyTileMetrics.reserve == MeeshyTileMetrics.ringGap + MeeshyTileMetrics.ringLine)
    }

    // MARK: - L'activation

    @MainActor
    @Test("un changement effectif : UN light, puis un onSelect avec la vignette touchée")
    func trigger_change_playsOneHapticAndCallsOnce() {
        var haptics: [MeeshyTileHaptic] = []
        var selected: [String] = []
        let performed = MeeshyTileStripTrigger.perform(
            tapped: "b", selection: "a", isEnabled: true, haptic: .light,
            play: { haptics.append($0) }, onSelect: { selected.append($0) }
        )
        #expect(performed)
        #expect(haptics == [.light])
        #expect(selected == ["b"])
    }

    @MainActor
    @Test("la courante ne répond pas : ni rappel ni haptique")
    func trigger_current_isSilent() {
        var calls = 0
        let performed = MeeshyTileStripTrigger.perform(
            tapped: "a", selection: "a", isEnabled: true, haptic: .light,
            play: { _ in calls += 1 }, onSelect: { _ in calls += 1 }
        )
        #expect(!performed)
        #expect(calls == 0)
    }

    @MainActor
    @Test("désactivée, la vignette ne joue rien et ne rappelle rien")
    func trigger_disabled_isSilent() {
        var calls = 0
        let performed = MeeshyTileStripTrigger.perform(
            tapped: "b", selection: "a", isEnabled: false, haptic: .light,
            play: { _ in calls += 1 }, onSelect: { _ in calls += 1 }
        )
        #expect(!performed)
        #expect(calls == 0)
    }

    @MainActor
    @Test("avec `none`, l'hôte joue son haptique : le rappel part, la bande se tait")
    func trigger_noneHaptic_stillCallsBack() {
        var haptics = 0
        var selected = 0
        MeeshyTileStripTrigger.perform(
            tapped: "b", selection: "a", isEnabled: true, haptic: .none,
            play: { _ in haptics += 1 }, onSelect: { _ in selected += 1 }
        )
        #expect(haptics == 0)
        #expect(selected == 1)
    }

    @MainActor
    @Test("sans courante, tout toucher choisit")
    func trigger_withoutSelection_selects() {
        var selected: [String] = []
        MeeshyTileStripTrigger.perform(
            tapped: "b", selection: nil, isEnabled: true, haptic: .none, play: { _ in }, onSelect: { selected.append($0) }
        )
        #expect(selected == ["b"])
    }

    // MARK: - Nom, rôle, valeur

    @Test("le nom est l'accessibilityLabel, sinon le titre ; une vignette sans l'un ni l'autre est refusée")
    func tile_name() {
        #expect(MeeshyTile(id: "a", title: "Noir et blanc").name == "Noir et blanc")
        #expect(MeeshyTile(id: "a", title: "Mono", accessibilityLabel: "Filtre noir et blanc").name == "Filtre noir et blanc")
        #expect(!MeeshyTile(id: "a", title: "").hasAccessibleName)
        #expect(MeeshyTile(id: "a", title: "", accessibilityLabel: "Aucun").hasAccessibleName)
    }

    @Test("bande et grille : un bouton par vignette ; carrousel : UN élément ajustable")
    func accessibility_role_perLayout() {
        #expect(MeeshyTileStripAccessibility.role(for: .strip) == .choice)
        #expect(MeeshyTileStripAccessibility.role(for: .grid()) == .choice)
        #expect(MeeshyTileStripAccessibility.role(for: .grid(columns: 5)) == .choice)
        #expect(MeeshyTileStripAccessibility.role(for: .carousel()) == .adjustable)
        #expect(MeeshyTileStripAccessibility.role(for: .carousel(dimsNeighbours: true)) == .adjustable)
    }

    @Test("la valeur du carrousel est le nom de la courante ; sans courante, rien")
    func accessibility_value_isTheCurrentName() {
        let tiles = [MeeshyTile(id: "a", title: "Aucun"), MeeshyTile(id: "b", title: "Mono", accessibilityLabel: "Noir et blanc")]
        #expect(MeeshyTileStripAccessibility.value(of: tiles, selection: "b") == "Noir et blanc")
        #expect(MeeshyTileStripAccessibility.value(of: tiles, selection: "z") == "")
        #expect(MeeshyTileStripAccessibility.value(of: tiles, selection: nil) == "")
    }

    // MARK: - Rendu

    @Test("une bande sans vignette ne rend rien : ni hauteur ni marge")
    @MainActor
    func strip_empty_rendersNothing() {
        let strip = MeeshyTileStrip(
            [MeeshyTile<String>](), selection: nil, label: "Vide", inset: MeeshySpacing.lg, onSelect: { _ in },
            preview: { _, _ in Color.clear }
        )
        let size = UIHostingController(rootView: strip).sizeThatFits(in: CGSize(width: 390, height: 800))
        #expect(size.height == 0)
    }

    @Test("solo : seule la courante reste ; sans courante, rien")
    func solo_keepsOnlyTheCurrentTile() {
        let tiles = ["a", "b", "c"].map { MeeshyTile(id: $0, title: $0) }
        #expect(MeeshyTileStripRule.shown(tiles, selection: "b", isSolo: true).map(\.id) == ["b"])
        #expect(MeeshyTileStripRule.shown(tiles, selection: nil, isSolo: true).isEmpty)
        #expect(MeeshyTileStripRule.shown(tiles, selection: "b", isSolo: false).map(\.id) == ["a", "b", "c"])
    }

    // MARK: - Performance

    private static func spec(_ id: String, selection: String?) -> MeeshyTileCellSpec<String> {
        MeeshyTileCellSpec(
            tile: MeeshyTile(id: id, title: id), isSelected: selection == id, tileSize: MeeshyTileMetrics.defaultSize,
            names: .each, selectionStyle: .ring, surface: .onMedia, haptic: .light,
            isNeighbour: false, listensToGestures: false, fillsWidth: false, forcedPressed: false
        )
    }

    @Test("changer la sélection ne change que les valeurs des deux vignettes concernées")
    func performance_cellSpecs_twoAtMost() {
        let ids = ["a", "b", "c", "d", "e"]
        let before = ids.map { Self.spec($0, selection: "b") }
        let after = ids.map { Self.spec($0, selection: "d") }
        let redrawn = zip(before, after).filter { $0 != $1 }.map { $0.0.tile.id }
        #expect(redrawn == ["b", "d"])
    }

    @Test("une première sélection ne redessine qu'une vignette")
    func performance_cellSpecs_firstSelection() {
        let ids = ["a", "b", "c"]
        let redrawn = ids.filter { Self.spec($0, selection: nil) != Self.spec($0, selection: "c") }
        #expect(redrawn == ["c"])
    }

    @Test("un aperçu neuf se signale par la version de la vignette, et elle seule se redessine")
    func performance_previewVersion_redrawsOneTile() {
        let fresh = MeeshyTile(id: "b", title: "b", previewVersion: 1)
        let spec = MeeshyTileCellSpec(
            tile: fresh, isSelected: false, tileSize: MeeshyTileMetrics.defaultSize,
            names: .each, selectionStyle: .ring, surface: .onMedia, haptic: .light,
            isNeighbour: false, listensToGestures: false, fillsWidth: false, forcedPressed: false
        )
        #expect(spec != Self.spec("b", selection: nil))
        #expect(Self.spec("a", selection: nil) == Self.spec("a", selection: nil))
    }

    @MainActor
    @Test("deux cellules aux mêmes valeurs s'égalent, quelles que soient leurs fermetures")
    func performance_cell_equalityIgnoresClosures() {
        let spec = Self.spec("a", selection: nil)
        let first = MeeshyTileCell(spec: spec, preview: { _, _ in Color.clear }, onSelect: { _ in }, gestures: nil)
        let second = MeeshyTileCell(spec: spec, preview: { _, _ in Color.clear }, onSelect: { _ in }, gestures: nil)
        #expect(first == second)
    }

    @Test("la plage visible ne part qu'au changement de plage")
    func performance_visibleRange_reportsChangesOnly() {
        var tracker = MeeshyTileVisibleRangeTracker()
        #expect(tracker.reports(0...4))
        #expect(!tracker.reports(0...4))
        #expect(tracker.reports(1...5))
        #expect(!tracker.reports(1...5))
        #expect(tracker.reports(nil))
        #expect(!tracker.reports(nil))
        #expect(tracker.reports(0...4))
    }

    // MARK: - Source

    @Test("aucun verre, aucune couleur en dur, aucun impact maison, aucun type du composer ni des appels, aucune chaîne")
    func source_hasNoGlassNoLiteralColorNoHostType() throws {
        for file in Self.sourceFiles {
            let code = try Self.code(file)
            let forbidden = [
                "Color(hex:", "Color(red:", "Color.white", "Color.black", ".white)", ".black)",
                "meeshyGlass", "adaptiveGlass", "adaptiveLiquidGlass", ".glassEffect", "UIBlurEffect", ".ultraThinMaterial",
                ".blur(", "UIImpactFeedbackGenerator", "sensoryFeedback",
                "Composer", "CallMode", "CallPill", "StoryFilter", "VideoFilter", "CacheCoordinator", ".shared",
                "String(localized", "NSLocalizedString", "Text(\"",
            ]
            for word in forbidden {
                #expect(!code.contains(word), "\(file) contient \(word)")
            }
        }
    }

    @Test("l'appui part au toucher, lu dans le style du bouton : la bande ne redessine rien")
    func source_pressIsNotAnimatedByTheStrip() throws {
        let code = try Self.code("MeeshyTileCell.swift")
        #expect(code.contains("configuration.isPressed"))
        #expect(code.contains(".meeshyAnimation(.easeInOut(duration: MeeshyTileRecipe.ringFadeDuration), value: spec.isSelected)"))
    }

    // MARK: - Aides

    private static let sourceFiles = [
        "MeeshyTileStrip.swift", "MeeshyTileCell.swift", "MeeshyTileCarousel.swift",
        "MeeshyTileStripRule.swift", "MeeshyTileStripFollow.swift", "MeeshyTileStripGeometry.swift",
        "MeeshyTileRecipe.swift", "MeeshyTileVocabulary.swift",
    ]

    private static func play(_ step: [String: Any], on follow: inout MeeshyTileStripFollow, scenario: String) throws {
        let op = try #require(step["op"] as? String)
        switch op {
        case "begin":
            follow.begin(chosen: step["chosen"] as? Int)
        case "centered":
            let returned = follow.centered(
                on: try #require(step["index"] as? Int), chosen: step["chosen"] as? Int, selects: try #require(step["selects"] as? Bool)
            )
            #expect(returned == step["returns"] as? Int, "\(scenario) : \(step)")
        case "chose":
            #expect(follow.chose(try #require(step["index"] as? Int)) == step["returns"] as? Int, "\(scenario) : \(step)")
        default:
            let rest = follow.settled(chosen: step["chosen"] as? Int, selects: try #require(step["selects"] as? Bool))
            let expected = try #require(step["returns"] as? [String: Any])
            let kind = try #require(expected["rest"] as? String)
            let index = expected["index"] as? Int
            switch rest {
            case .nothing: #expect(kind == "nothing", "\(scenario) : \(step)")
            case .choose(let value): #expect(kind == "choose" && index == value, "\(scenario) : \(step)")
            case .rejoin(let value): #expect(kind == "rejoin" && index == value, "\(scenario) : \(step)")
            }
        }
    }

    private static func geometry(tileWidth: CGFloat, spacing: CGFloat) -> MeeshyTileStripGeometry {
        MeeshyTileStripGeometry(tileSize: CGSize(width: tileWidth, height: 1), spacing: spacing, inset: 0, count: 0)
    }

    private static func geometry(_ row: [String: Any]) throws -> MeeshyTileStripGeometry {
        MeeshyTileStripGeometry(
            tileSize: CGSize(width: try cg(row["tileWidth"] ?? 56), height: try cg(row["tileHeight"] ?? 72)),
            spacing: try cg(row["spacing"]),
            inset: try cg(row["inset"]),
            count: try #require(row["count"] as? Int)
        )
    }

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func json() throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K19-MeeshyTileStrip.vectors.json")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return try #require(object as? [String: Any])
    }

    private static func rows(_ key: String) throws -> [[String: Any]] {
        try #require(try json()[key] as? [[String: Any]])
    }

    private static func object(_ key: String) throws -> [String: Any] {
        try #require(try json()[key] as? [String: Any])
    }

    private static func cg(_ value: Any?) throws -> CGFloat {
        if let integer = value as? Int { return CGFloat(integer) }
        return CGFloat(try #require(value as? Double))
    }

    private static func code(_ file: String) throws -> String {
        let url = repositoryRoot.appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Kit/\(file)")
        return try String(contentsOf: url, encoding: .utf8)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }
}
