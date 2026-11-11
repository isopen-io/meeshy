import Testing
import Foundation
import SwiftUI
import UIKit
@testable import MeeshyUI

/// K04 — la rangée de puces de choix, lue comme des VALEURS : la loi du
/// toucher, les bords, la recette, le nom et le rôle. Les mesures viennent du
/// fichier de vecteurs que lisent aussi Android et le web.
@Suite("MeeshyChipRow")
struct MeeshyChipRowTests {

    // MARK: - La loi du toucher

    @Test("next suit les vecteurs pour chaque mode et chaque genre de puce")
    func rule_next_followsTheVectors() throws {
        for row in try Self.rows("next") {
            let mode = try #require(MeeshyChipRowMode(rawValue: try #require(row["mode"] as? String)))
            let kind = try #require(MeeshyChipKind(rawValue: try #require(row["kind"] as? String)))
            let selection = Set(try #require(row["selection"] as? [String]))
            let tapped = try #require(row["tapped"] as? String)
            let expected = Set(try #require(row["next"] as? [String]))
            let response = MeeshyChipRowRule.response(selection: selection, tapped: tapped, mode: mode, kind: kind)
            #expect(MeeshyChipRowRule.next(selection: selection, tapped: tapped, mode: mode, kind: kind) == expected, "\(row)")
            switch response {
            case .ignored: #expect(row["response"] as? String == "ignored", "\(row)")
            case .action: #expect(row["response"] as? String == "action", "\(row)")
            case .changed(let next):
                #expect(row["response"] as? String == "changed", "\(row)")
                #expect(next == expected, "\(row)")
            }
        }
    }

    @Test("une puce d'action ou de menu n'entre jamais dans la sélection", arguments: [MeeshyChipKind.action, .menu])
    func rule_actionAndMenu_neverEnterTheSelection(kind: MeeshyChipKind) {
        for mode in MeeshyChipRowMode.allCases {
            #expect(MeeshyChipRowRule.response(selection: ["a"], tapped: "b", mode: mode, kind: kind) == .action)
            #expect(MeeshyChipRowRule.next(selection: ["a"], tapped: "b", mode: mode, kind: kind) == ["a"])
        }
    }

    @Test("la puce à montrer est celle qui entre, sinon la première courante")
    func rule_revealTarget() {
        let order = ["a", "b", "c", "d"]
        #expect(MeeshyChipRowRule.revealTarget(order: order, previous: ["a"], current: ["a", "c"]) == "c")
        #expect(MeeshyChipRowRule.revealTarget(order: order, previous: [], current: ["d", "b"]) == "b")
        #expect(MeeshyChipRowRule.revealTarget(order: order, previous: ["a", "b"], current: ["b"]) == "b")
        #expect(MeeshyChipRowRule.revealTarget(order: order, previous: ["a"], current: []) == nil)
    }

    // MARK: - L'activation

    @MainActor
    @Test("un changement effectif : UN light, puis un onChange avec la sélection suivante et la puce touchée")
    func trigger_change_playsOneHapticAndCallsOnce() {
        var haptics: [MeeshyChipRowHaptic] = []
        var changes: [(Set<String>, String)] = []
        let performed = MeeshyChipRowTrigger.perform(
            response: .changed(["b"]), tapped: "b", isEnabled: true, haptic: .light,
            play: { haptics.append($0) }, onChange: { changes.append(($0, $1)) }, onAction: nil
        )
        #expect(performed)
        #expect(haptics == [.light])
        #expect(changes.count == 1)
        #expect(changes.first?.0 == ["b"])
        #expect(changes.first?.1 == "b")
    }

    @MainActor
    @Test("un toucher ignoré ne joue rien et ne rappelle rien")
    func trigger_ignored_isSilent() {
        var calls = 0
        let performed = MeeshyChipRowTrigger.perform(
            response: MeeshyChipRowResponse<String>.ignored, tapped: "a", isEnabled: true, haptic: .light,
            play: { _ in calls += 1 }, onChange: { _, _ in calls += 1 }, onAction: { _ in calls += 1 }
        )
        #expect(!performed)
        #expect(calls == 0)
    }

    @MainActor
    @Test("désactivée, la puce ne joue rien et ne rappelle rien")
    func trigger_disabled_isSilent() {
        var calls = 0
        let performed = MeeshyChipRowTrigger.perform(
            response: .changed(["b"]), tapped: "b", isEnabled: false, haptic: .light,
            play: { _ in calls += 1 }, onChange: { _, _ in calls += 1 }, onAction: { _ in calls += 1 }
        )
        #expect(!performed)
        #expect(calls == 0)
    }

    @MainActor
    @Test("avec `none`, l'hôte joue son haptique : le rappel part, la rangée se tait")
    func trigger_noneHaptic_stillCallsBack() {
        var haptics = 0
        var changes = 0
        MeeshyChipRowTrigger.perform(
            response: .changed(["b"]), tapped: "b", isEnabled: true, haptic: .none,
            play: { _ in haptics += 1 }, onChange: { _, _ in changes += 1 }, onAction: nil
        )
        #expect(haptics == 0)
        #expect(changes == 1)
    }

    @MainActor
    @Test("une action joue UN light et appelle onAction, jamais onChange")
    func trigger_action_callsOnActionOnly() {
        var haptics: [MeeshyChipRowHaptic] = []
        var actions: [String] = []
        var changes = 0
        MeeshyChipRowTrigger.perform(
            response: MeeshyChipRowResponse<String>.action, tapped: "menu", isEnabled: true, haptic: .light,
            play: { haptics.append($0) }, onChange: { _, _ in changes += 1 }, onAction: { actions.append($0) }
        )
        #expect(haptics == [.light])
        #expect(actions == ["menu"])
        #expect(changes == 0)
    }

    // MARK: - Les bords

    @Test("les bords suivent les vecteurs")
    func edges_followTheVectors() throws {
        for row in try Self.rows("edges") {
            let edges = MeeshyScrollEdges.of(
                content: try Self.cg(row["content"]), viewport: try Self.cg(row["viewport"]), offset: try Self.cg(row["offset"])
            )
            #expect(edges.start == row["start"] as? Bool, "\(row)")
            #expect(edges.end == row["end"] as? Bool, "\(row)")
        }
    }

    @Test("la tolérance et la largeur de l'estompe sont celles des vecteurs")
    func edges_constantsFollowTheVectors() throws {
        let vectors = try Self.json()
        #expect(Double(MeeshyScrollEdges.tolerance) == vectors["edgeTolerance"] as? Double)
        #expect(Double(MeeshyChipRecipe.edgeFade) == vectors["edgeFade"] as? Double)
        #expect(Double(MeeshyChipRecipe.edgeFade) == Double(MeeshyControlSize.tapTarget))
    }

    @Test("un cadre physique LTR : le début est à gauche")
    func edges_frame_leftToRight() {
        let atStart = MeeshyScrollEdges.of(contentFrame: CGRect(x: 0, y: 0, width: 800, height: 36), viewport: 390, axis: .horizontal, isRightToLeft: false)
        let scrolled = MeeshyScrollEdges.of(contentFrame: CGRect(x: -200, y: 0, width: 800, height: 36), viewport: 390, axis: .horizontal, isRightToLeft: false)
        #expect(atStart == MeeshyScrollEdges(start: false, end: true))
        #expect(scrolled == MeeshyScrollEdges(start: true, end: true))
    }

    @Test("un cadre physique RTL : le début est à droite, les bords sont miroités")
    func edges_frame_rightToLeft() {
        let atStart = MeeshyScrollEdges.of(contentFrame: CGRect(x: -410, y: 0, width: 800, height: 36), viewport: 390, axis: .horizontal, isRightToLeft: true)
        let atEnd = MeeshyScrollEdges.of(contentFrame: CGRect(x: 0, y: 0, width: 800, height: 36), viewport: 390, axis: .horizontal, isRightToLeft: true)
        #expect(atStart == MeeshyScrollEdges(start: false, end: true))
        #expect(atEnd == MeeshyScrollEdges(start: true, end: false))
        #expect(atStart.physicalSides(axis: .horizontal, isRightToLeft: true).low)
        #expect(!atStart.physicalSides(axis: .horizontal, isRightToLeft: true).high)
        #expect(atStart.physicalSides(axis: .horizontal, isRightToLeft: false).high)
    }

    @Test("la loi vaut pour l'axe vertical, et ne se miroite pas en RTL")
    func edges_frame_vertical() {
        let scrolled = MeeshyScrollEdges.of(contentFrame: CGRect(x: 0, y: -50, width: 36, height: 400), viewport: 200, axis: .vertical, isRightToLeft: true)
        #expect(scrolled == MeeshyScrollEdges(start: true, end: true))
        #expect(scrolled.physicalSides(axis: .vertical, isRightToLeft: true).low)
    }

    // MARK: - La recette

    @Test("fond, voile et encre suivent les vecteurs, par état, surface et teinte")
    func recipe_followsTheVectors() throws {
        for row in try Self.rows("recipe") {
            let surface = try #require(MeeshyChipRowSurface(rawValue: try #require(row["surface"] as? String)))
            let recipe = MeeshyChipRecipe.resolve(
                surface: surface,
                isSelected: try #require(row["selected"] as? Bool),
                isPressed: try #require(row["pressed"] as? Bool),
                isHovered: try #require(row["hovered"] as? Bool),
                isEnabled: try #require(row["enabled"] as? Bool),
                isTinted: try #require(row["tinted"] as? Bool)
            )
            #expect(recipe.fill.rawValue == row["fill"] as? String, "\(row)")
            #expect(recipe.fillOpacity == row["fillOpacity"] as? Double, "\(row)")
            #expect(recipe.ink.rawValue == row["ink"] as? String, "\(row)")
            #expect(recipe.opacity == row["opacity"] as? Double, "\(row)")
        }
    }

    @Test("les voiles et les durées sont ceux des vecteurs")
    func recipe_constantsFollowTheVectors() throws {
        let vectors = try Self.json()
        let veils = try Self.object("voiles")
        #expect(MeeshyChipRecipe.restFillOpacity == veils["rest"] as? Double)
        #expect(MeeshyChipRecipe.pressedFillOpacity == veils["pressed"] as? Double)
        #expect(MeeshyChipRecipe.selectedPressedFillOpacity == veils["selectedPressed"] as? Double)
        #expect(MeeshyChipRecipe.selectedFillOpacity == veils["selected"] as? Double)
        #expect(MeeshyChipRecipe.disabledOpacity == vectors["disabledOpacity"] as? Double)
        #expect(MeeshyChipRecipe.toneFadeDuration * 1000 == vectors["toneFadeMs"] as? Double)
        #expect(MeeshyChipRecipe.edgeFadeDuration * 1000 == vectors["edgeFadeMs"] as? Double)
        #expect(MeeshyChipRecipe.revealDuration * 1000 == vectors["revealMs"] as? Double)
    }

    @Test("le repos ne se confond ni avec l'appui ni avec le survol, pour chaque surface", arguments: MeeshyChipRowSurface.allCases)
    func recipe_pressIsVisible(surface: MeeshyChipRowSurface) {
        for selected in [false, true] {
            let rest = MeeshyChipRecipe.resolve(surface: surface, isSelected: selected)
            let pressed = MeeshyChipRecipe.resolve(surface: surface, isSelected: selected, isPressed: true)
            let hovered = MeeshyChipRecipe.resolve(surface: surface, isSelected: selected, isHovered: true)
            #expect(rest != pressed)
            #expect(pressed == hovered)
        }
    }

    @Test("désactivée, la puce ne répond ni à l'appui ni au survol, et son contenu est à 40 %")
    func recipe_disabled() {
        let rest = MeeshyChipRecipe.resolve(surface: .onMedia, isSelected: false, isEnabled: false)
        let pressed = MeeshyChipRecipe.resolve(surface: .onMedia, isSelected: false, isPressed: true, isHovered: true, isEnabled: false)
        #expect(rest == pressed)
        #expect(rest.opacity == 0.4)
        #expect(!rest.respondsToTouch)
        #expect(!rest.playsHaptic)
    }

    @Test("l'encre de la courante est l'indigo 950 sur le blanc : 15,99:1")
    func recipe_selectedContrast() {
        let recipe = MeeshyChipRecipe.resolve(surface: .onMedia, isSelected: true)
        #expect(abs(recipe.contrast(over: MeeshyColors.backgroundPrimary(isDark: true), isDark: true) - 15.99) < 0.05)
    }

    @Test("le repos tient 4,5:1 sur une feuille sombre, et le thème tient 4,5:1 en clair comme en sombre")
    func recipe_restContrast() {
        let onSheet = MeeshyChipRecipe.resolve(surface: .onMedia, isSelected: false)
        #expect(onSheet.contrast(over: MeeshyColors.backgroundSecondary(isDark: true), isDark: true) >= 4.5)
        for isDark in [false, true] {
            let backdrop = MeeshyColors.backgroundPrimary(isDark: isDark)
            for selected in [false, true] {
                let themed = MeeshyChipRecipe.resolve(surface: .theme, isSelected: selected)
                #expect(themed.contrast(over: backdrop, isDark: isDark) >= 4.5, "selected \(selected) dark \(isDark)")
            }
        }
    }

    // MARK: - Mesures

    @Test("hauteur, marge et corps de chaque taille suivent les vecteurs", arguments: MeeshyChipRowSize.allCases)
    func size_followsTheVectors(size: MeeshyChipRowSize) throws {
        let row = try Self.rows("sizes").first { $0["size"] as? String == size.rawValue }.unwrapped()
        #expect(Double(size.height) == row["height"] as? Double)
        #expect(Double(size.horizontalPadding) == row["padding"] as? Double)
        #expect(Double(size.fontSize) == row["font"] as? Double)
    }

    @Test("la cible tactile atteint 44 pt en hauteur, la capsule gardant son encombrement", arguments: MeeshyChipRowSize.allCases)
    func size_target_reachesTheTapTarget(size: MeeshyChipRowSize) throws {
        let targets = try Self.object("tapTarget")
        #expect(size.height + 2 * size.verticalSlack >= MeeshyControlSize.tapTarget)
        #expect(Double(MeeshyControlSize.tapTarget) == targets["ios"] as? Double)
    }

    @Test("l'écart entre deux rangées repliées vaut la cible moins la capsule")
    func spacing_rows_isTargetMinusCapsule() throws {
        let spacing = try Self.object("spacing")
        #expect(MeeshyControlSize.tapTarget - MeeshyChipRowSize.regular.height == MeeshySpacing.sm)
        #expect(Double(MeeshySpacing.sm) == spacing["rows"] as? Double)
        #expect(Double(MeeshySpacing.xsPlus) == spacing["chips"] as? Double)
        #expect(Double(MeeshySpacing.xsPlus) == spacing["glyphAndText"] as? Double)
    }

    // MARK: - Nom, rôle, valeur

    @Test("un choix simple est un bouton sélectionné ; un choix multiple, une bascule ; des onglets, des onglets")
    func accessibility_roles() {
        func state(_ mode: MeeshyChipRowMode, _ semantics: MeeshyChipRowSemantics = .choice, _ kind: MeeshyChipKind = .choice, _ selected: Bool = true) -> MeeshyChipAccessibility {
            MeeshyChipAccessibility.resolve(mode: mode, semantics: semantics, kind: kind, isSelected: selected)
        }
        #expect(state(.single) == MeeshyChipAccessibility(role: .choice, isSelected: true))
        #expect(state(.singleOrNone, .choice, .choice, false) == MeeshyChipAccessibility(role: .choice, isSelected: false))
        #expect(state(.multiple) == MeeshyChipAccessibility(role: .toggle, isSelected: true))
        #expect(state(.single, .tabs) == MeeshyChipAccessibility(role: .tab, isSelected: true))
        #expect(state(.single, .choice, .action) == MeeshyChipAccessibility(role: .button, isSelected: false))
        #expect(state(.actions) == MeeshyChipAccessibility(role: .button, isSelected: false))
        #expect(state(.single, .choice, .menu) == MeeshyChipAccessibility(role: .menu, isSelected: false))
    }

    @Test("le nom est l'accessibilityLabel, sinon le titre ; une puce sans titre ni nom est refusée")
    func chip_name() {
        #expect(MeeshyChip(id: "a", title: "Fondu").name == "Fondu")
        #expect(MeeshyChip(id: "a", title: "Fondu", accessibilityLabel: "Effet fondu").name == "Effet fondu")
        let glyph = MeeshyChip(id: "s", title: "", systemImage: "magnifyingglass")
        #expect(!glyph.hasAccessibleName)
        #expect(glyph.isGlyphOnly)
        #expect(MeeshyChip(id: "s", title: "", systemImage: "magnifyingglass", accessibilityLabel: "Rechercher").hasAccessibleName)
        #expect(!MeeshyChip(id: "a", title: "Fondu", systemImage: "star").isGlyphOnly)
    }

    // MARK: - Rendu

    @Test("une rangée sans puce ne rend rien : ni hauteur ni marge")
    @MainActor
    func row_empty_rendersNothing() {
        let row = MeeshyChipRow([MeeshyChip<String>](), selection: [], label: "Vide", inset: MeeshySpacing.lg, onChange: { _, _ in })
        let size = UIHostingController(rootView: row).sizeThatFits(in: CGSize(width: 390, height: 800))
        #expect(size.height == 0)
    }

    @Test("changer la sélection ne change que les valeurs des puces dont l'état change (choix simple)")
    @MainActor
    func performance_cellSpecs_singleChoice() {
        func spec(_ id: String, selection: Set<String>) -> MeeshyChipCellSpec<String> {
            let selected = selection.contains(id)
            return MeeshyChipCellSpec(
                chip: MeeshyChip(id: id, title: id), isSelected: selected, ruleSelection: selected ? [id] : [],
                mode: .single, semantics: .choice, surface: .onMedia, size: .regular, haptic: .light,
                fillsWidth: false, forcedPressed: false
            )
        }
        #expect(spec("a", selection: ["a"]) == spec("a", selection: ["a"]))
        #expect(spec("c", selection: ["a"]) == spec("c", selection: ["b"]))
        #expect(spec("a", selection: ["a"]) != spec("a", selection: ["b"]))
        #expect(spec("b", selection: ["a"]) != spec("b", selection: ["b"]))
    }

    @MainActor
    @Test("deux cellules aux mêmes valeurs s'égalent, quelles que soient leurs fermetures")
    func performance_cell_equalityIgnoresClosures() {
        let spec = MeeshyChipCellSpec(
            chip: MeeshyChip(id: "a", title: "A"), isSelected: false, ruleSelection: [],
            mode: .single, semantics: .choice, surface: .onMedia, size: .regular, haptic: .light,
            fillsWidth: false, forcedPressed: false
        )
        let first = MeeshyChipCell(spec: spec, label: { chip, _ in MeeshyChipTitleLabel(chip.title) }, onChange: { _, _ in }, onAction: nil)
        let second = MeeshyChipCell(spec: spec, label: { chip, _ in MeeshyChipTitleLabel(chip.title) }, onChange: { _, _ in }, onAction: { _ in })
        #expect(first == second)
    }

    // MARK: - Source

    @Test("aucun verre, aucune couleur en dur, aucune échelle, aucun impact maison dans les fichiers de K04")
    func source_hasNoGlassNoLiteralColorNoScale() throws {
        for file in Self.sourceFiles {
            let code = try Self.code(file)
            let forbidden = [
                "caption", "Color(hex:", "Color(red:", "Color.white", "Color.black",
                "meeshyGlass", "adaptiveGlass", "adaptiveLiquidGlass", ".glassEffect", "UIBlurEffect", ".ultraThinMaterial",
                ".blur(", "scaleEffect", "UIImpactFeedbackGenerator", "sensoryFeedback",
            ]
            for word in forbidden {
                #expect(!code.contains(word), "\(file) contient \(word)")
            }
        }
    }

    @Test("le fondu ne suit que la sélection : l'appui part au toucher, lu dans le style du bouton")
    func source_pressIsNotAnimatedByTheRow() throws {
        let code = try Self.code("MeeshyChipCell.swift")
        #expect(code.contains(".meeshyAnimation(.easeInOut(duration: MeeshyChipRecipe.toneFadeDuration), value: spec.isSelected)"))
        #expect(code.contains("configuration.isPressed"))
    }

    // MARK: - Aides

    private static let sourceFiles = [
        "MeeshyChipRow.swift", "MeeshyChipCell.swift", "MeeshyChipRowRule.swift",
        "MeeshyChipRecipe.swift", "MeeshyScrollEdges.swift",
    ]

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func json() throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K04-MeeshyChipRow.vectors.json")
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
        CGFloat(try #require(value as? Double))
    }

    private static func code(_ file: String) throws -> String {
        let url = repositoryRoot.appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Kit/\(file)")
        return try String(contentsOf: url, encoding: .utf8)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }
}

private extension Optional {
    func unwrapped() throws -> Wrapped {
        try #require(self)
    }
}
