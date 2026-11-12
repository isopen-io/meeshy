import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K13 — l'action principale et son choix, lus comme des VALEURS : la recette,
/// la loi du libellé, la loi d'activation (qui joue quoi), la valeur dite, le
/// contraste, puis les gardes de source (aucun verre propre, aucune couleur en
/// dur, un seul site d'haptique). Les mesures viennent du fichier de vecteurs
/// que lisent aussi Android et le web.
@Suite("MeeshySplitActionButton")
struct MeeshySplitActionButtonTests {

    // MARK: - Recette

    @Test("la recette suit les vecteurs : hauteurs, libellé, chevron, filet, anneau, différé, opacités")
    func recipe_followsTheVectors() throws {
        let recipe = try Self.object("recipe")
        #expect(MeeshySplitActionButtonRecipe.regularHeight == recipe["regularHeight"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.compactHeight == recipe["compactHeight"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.labelSize == recipe["labelSize"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.smallLabelSize == recipe["smallLabelSize"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.labelPaddingHorizontal == recipe["labelPaddingHorizontal"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.labelPaddingVertical == recipe["labelPaddingVertical"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.chevronGlyph == recipe["chevronGlyph"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.chevronMarginStart == recipe["chevronMarginStart"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.chevronMarginEnd == recipe["chevronMarginEnd"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.chevronDrawn == recipe["chevronDrawn"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.ruleWidth == recipe["ruleWidth"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.ruleOpacity == recipe["ruleOpacity"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.ruleOpacityHighContrast == recipe["ruleOpacityHighContrast"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.ringDiameter == recipe["ringDiameter"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.ringMarginStart == recipe["ringMarginStart"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.ringGap == recipe["ringGap"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.ringMarginEnd == recipe["ringMarginEnd"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.deferredPadding == recipe["deferredPadding"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.deferredGap == recipe["deferredGap"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.deferredGlyph == recipe["deferredGlyph"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.deferredLabelSize == recipe["deferredLabelSize"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.deferredVeilOpacity == recipe["deferredVeilOpacity"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.disabledOpacity == recipe["disabledOpacity"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.pressVeilPressedOpacity == recipe["pressVeilPressedOpacity"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.pressVeilHoveredOpacity == recipe["pressVeilHoveredOpacity"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.contentFadeDuration * 1000 == recipe["contentFadeMs"] as? Double)
        let shadow = try #require(recipe["shadow"] as? [String: Any])
        #expect(MeeshySplitActionButtonRecipe.shadowOpacity == shadow["opacity"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.shadowBlur == shadow["blur"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.shadowY == shadow["y"] as? Double)
    }

    @Test("la cible du chevron fait 44 pt et déborde vers la fin seulement")
    func recipe_chevronTargetSlack() throws {
        let tapTarget = try #require(try Self.object("recipe")["tapTarget"] as? [String: Any])
        #expect(MeeshySplitActionButtonRecipe.tapTarget == tapTarget["ios"] as? Double)
        #expect(MeeshySplitActionButtonRecipe.chevronDrawn + MeeshySplitActionButtonRecipe.chevronTargetSlack
                == MeeshySplitActionButtonRecipe.tapTarget)
    }

    @Test("les mesures sont des jetons du design system, pas des nombres propres")
    func recipe_isMadeOfTokens() {
        #expect(MeeshySplitActionButtonRecipe.regularHeight == MeeshyGlassButtonSize.s48.diameter)
        #expect(MeeshySplitActionButtonRecipe.compactHeight == Double(MeeshyControlSize.tapTarget))
        #expect(MeeshySplitActionButtonRecipe.labelSize == Double(MeeshyFont.bodySize))
        #expect(MeeshySplitActionButtonRecipe.smallLabelSize == Double(MeeshyFont.subheadSize))
        #expect(MeeshySplitActionButtonRecipe.labelPaddingHorizontal == Double(MeeshySpacing.mdPlus))
        #expect(MeeshySplitActionButtonRecipe.chevronGlyph == Double(MeeshyIconSize.lg))
        #expect(MeeshySplitActionButtonRecipe.chevronMarginStart == Double(MeeshySpacing.smPlus))
        #expect(MeeshySplitActionButtonRecipe.chevronMarginEnd == Double(MeeshySpacing.md))
        #expect(MeeshySplitActionButtonRecipe.ruleWidth == Double(MeeshyBorder.regular))
        #expect(MeeshySplitActionButtonRecipe.ringDiameter == Double(MeeshyControlSize.large))
        #expect(MeeshySplitActionButtonRecipe.ringMarginStart == Double(MeeshySpacing.xs))
        #expect(MeeshySplitActionButtonRecipe.ringGap == Double(MeeshySpacing.sm))
        #expect(MeeshySplitActionButtonRecipe.ringMarginEnd == Double(MeeshySpacing.lg))
        #expect(MeeshySplitActionButtonRecipe.deferredPadding == Double(MeeshySpacing.mdPlus))
        #expect(MeeshySplitActionButtonRecipe.deferredGap == Double(MeeshySpacing.xsPlus))
        #expect(MeeshySplitActionButtonRecipe.deferredGlyph == Double(MeeshyIconSize.md))
        #expect(MeeshySplitActionButtonRecipe.deferredLabelSize == Double(MeeshyFont.labelSize))
        #expect(MeeshySplitActionButtonRecipe.deferredVeilOpacity == MeeshyGlassButtonRecipe.softRestOpacity)
        #expect(MeeshySplitActionButtonRecipe.disabledOpacity == MeeshyGlassButtonRecipe.disabledOpacity)
    }

    @Test("la hauteur : 48 au repos, 44 en compact")
    func recipe_height() {
        #expect(Self.recipe(size: .regular).height == 48)
        #expect(Self.recipe(size: .compact).height == 44)
    }

    @Test("chaque phase montre ce que la loi 13 permet : chevron, filet, anneau, toucher")
    func recipe_phases_followTheVectors() throws {
        for row in try Self.rows("phases") {
            let recipe = Self.recipe(
                phase: Self.phase(row["phase"] as? String),
                isEnabled: row["isEnabled"] as? Bool ?? true,
                hasChevron: row["hasChevron"] as? Bool ?? true
            )
            #expect(recipe.content.rawValue == row["content"] as? String, "\(row)")
            #expect(recipe.showsChevron == row["chevron"] as? Bool, "\(row)")
            #expect(recipe.showsRule == recipe.showsChevron, "\(row)")
            #expect(recipe.showsRing == row["ring"] as? Bool, "\(row)")
            #expect(recipe.labelRespondsToTouch == row["touch"] as? Bool, "\(row)")
        }
    }

    @Test("la matière : brand sous Liquid Glass (prêt et en cours), none ailleurs et en différé")
    func recipe_material() {
        #expect(Self.recipe(material: .liquid).glass == .brand)
        #expect(Self.recipe(phase: .busy(progress: 0.2, title: "x"), material: .liquid).glass == .brand)
        #expect(Self.recipe(phase: .deferred(title: "x"), material: .liquid).glass == .none)
        #expect(Self.recipe(material: .drawn).glass == .none)
        #expect(Self.recipe(material: .opaque).glass == .none)
    }

    @Test("le fond : marque, marque profonde en contraste accru, voile doux en différé, rien sous Liquid Glass")
    func recipe_fill() {
        #expect(Self.recipe().fill == .brand)
        #expect(Self.recipe(increasedContrast: true).fill == .brandDeep)
        #expect(Self.recipe(phase: .deferred(title: "x")).fill == .softVeil)
        #expect(Self.recipe(material: .liquid).fill == .clear)
    }

    @Test("retenu : 40 %, ni voile d'appui ni ombre ; en cours et différé : pleine opacité")
    func recipe_disabled() {
        let held = Self.recipe(isEnabled: false)
        #expect(held.opacity == MeeshyGlassButtonRecipe.disabledOpacity)
        #expect(held.pressVeilOpacity == 0)
        #expect(held.hoverVeilOpacity == 0)
        #expect(held.shadow == nil)
        #expect(Self.recipe().shadow != nil)
        #expect(Self.recipe(phase: .busy(progress: nil, title: "x")).opacity == 1)
        #expect(Self.recipe(phase: .deferred(title: "x")).shadow == nil)
    }

    @Test("le voile d'appui est celui de K02 ; l'échelle est celle de K01 ; Liquid Glass laisse répondre le système")
    func recipe_pressResponse() {
        let rest = Self.recipe()
        #expect(rest.pressVeilOpacity == MeeshyGlassButtonRecipe.pressVeilPressedOpacity)
        #expect(rest.hoverVeilOpacity == MeeshyGlassButtonRecipe.pressVeilHoveredOpacity)
        #expect(rest.pressScale == MeeshySplitActionButtonRecipe.pressScale)
        #expect(rest.pressScale > 1)
        let liquid = Self.recipe(material: .liquid)
        #expect(liquid.pressVeilOpacity == 0)
        #expect(liquid.pressScale == 1)
    }

    @Test("réduire les animations : ni échelle ni fondu, le voile d'appui reste")
    func recipe_reduceMotion() {
        let calm = Self.recipe(reduceMotion: true)
        #expect(calm.pressScale == 1)
        #expect(calm.fadeDuration == nil)
        #expect(calm.pressVeilOpacity == MeeshyGlassButtonRecipe.pressVeilPressedOpacity)
        #expect(Self.recipe().fadeDuration == MeeshySplitActionButtonRecipe.contentFadeDuration)
    }

    @Test("le filet passe de 35 % à 60 % en contraste accru")
    func recipe_ruleOpacity() {
        #expect(Self.recipe().ruleOpacity == 0.35)
        #expect(Self.recipe(increasedContrast: true).ruleOpacity == 0.6)
    }

    @Test("largeur imposée : le bouton prend la place offerte")
    func recipe_width() {
        #expect(Self.recipe(width: .fill).fillsWidth)
        #expect(!Self.recipe(width: .hug).fillsWidth)
    }

    @Test("l'encre : celle de la marque sur le fond de marque, celle du ton sur le voile doux")
    func recipe_ink() {
        #expect(Self.recipe().ink == .onBrand)
        #expect(Self.recipe(phase: .busy(progress: nil, title: "x")).ink == .onBrand)
        #expect(Self.recipe(phase: .deferred(title: "x"), tone: .deep).ink == .onMedia)
        #expect(Self.recipe(phase: .deferred(title: "x"), tone: .theme).ink == .themeInk)
    }

    @Test("contraste calculé : l'encre sur la marque tient 3:1, sur la marque profonde 7:1")
    func recipe_contrast() throws {
        let contrast = try Self.object("contrast")
        let rest = try #require(Self.recipe().solidContrast())
        let increased = try #require(Self.recipe(increasedContrast: true).solidContrast())
        #expect(rest >= (contrast["restMinimum"] as? Double ?? .infinity), "\(rest)")
        #expect(increased >= (contrast["increasedMinimum"] as? Double ?? .infinity), "\(increased)")
        #expect(Self.recipe(material: .liquid).solidContrast() == nil)
    }

    // MARK: - Loi du libellé

    @Test("la loi du libellé suit chaque vecteur")
    func labelFit_followsTheVectors() throws {
        let fit = try Self.object("labelFit")
        let rows = try #require(fit["rows"] as? [[String: Any]])
        for row in rows {
            let widths = try Self.widths(try #require(row["widths"] as? [String: Double]))
            let step = MeeshySplitActionLabelFit.resolve(
                widths: widths, room: try #require(row["room"] as? Double), maxLines: try #require(row["maxLines"] as? Int)
            )
            #expect(step.rawValue == row["step"] as? String, "\(row["name"] ?? "")")
        }
    }

    @Test("l'ordre des marches que la vue essaie est celui de la fiche")
    func labelFit_stepOrder() throws {
        let fit = try Self.object("labelFit")
        #expect(MeeshySplitActionLabelFit.wrapEfficiency == fit["wrapEfficiency"] as? Double)
        for row in try #require(fit["steps"] as? [[String: Any]]) {
            let steps = MeeshySplitActionLabelFit.steps(
                hasShortTitle: row["hasShortTitle"] as? Bool ?? false, maxLines: row["maxLines"] as? Int ?? 1
            )
            #expect(steps.map(\.rawValue) == row["order"] as? [String], "\(row)")
        }
    }

    @Test("le titre replié demande son mot le plus long, jamais moins")
    func labelFit_wrappedWidth() {
        let widths = MeeshySplitActionLabelWidths(title: 200, titleSmall: 180, titleLongestWordSmall: 150)
        #expect(MeeshySplitActionLabelFit.wrappedWidth(widths: widths, maxLines: 3) == 150)
        let roomy = MeeshySplitActionLabelWidths(title: 120, titleSmall: 104, titleLongestWordSmall: 52)
        #expect(MeeshySplitActionLabelFit.wrappedWidth(widths: roomy, maxLines: 2) == 58)
    }

    @MainActor
    @Test("le nom dit reste le libellé entier même quand le glyphe reste seul")
    func words_spokenName() {
        #expect(MeeshySplitActionWords.spokenName(label: nil, title: "Publier la story") == "Publier la story")
        #expect(MeeshySplitActionWords.spokenName(label: "", title: "Publier la story") == "Publier la story")
        #expect(MeeshySplitActionWords.spokenName(label: "Publier", title: "Publier la story") == "Publier")
    }

    // MARK: - Valeur dite

    @MainActor
    @Test("en cours : « Publication…, 62 % » en fr, en et ar, dans les chiffres et la virgule de la langue")
    func words_busyValue_followsTheVectors() throws {
        let spoken = try Self.object("spoken")
        let separators = try #require(spoken["separators"] as? [String: String])
        for row in try #require(spoken["rows"] as? [[String: Any]]) {
            let code = try #require(row["locale"] as? String)
            let locale = Locale(identifier: code)
            let title = try #require(row["title"] as? String)
            let percent = row["percent"] as? Int
            let said = MeeshySplitActionWords.busyValue(title: title, percent: percent, locale: locale)
            let tail = MeeshyProgressRingWords.spokenValue(percent: percent, valueText: nil, locale: locale)
            #expect(said == title + (separators[code] ?? "") + tail, "\(row)")
            #expect(MeeshySplitActionWords.separator(locale: locale) == separators[code])
        }
    }

    // MARK: - Qui joue quoi

    @MainActor
    @Test("toucher le libellé joue l'action seule, avec un seul impact léger")
    func trigger_label_playsTheActionOnly() {
        var plays: [MeeshyGlassButtonHaptic] = []
        var calls: [String] = []
        let fired = MeeshySplitActionTrigger.pressLabel(
            isEnabled: true, haptic: .light, play: { plays.append($0) },
            action: { calls.append("action") }, onDisabledPress: { calls.append("refus") }
        )
        #expect(fired)
        #expect(calls == ["action"])
        #expect(plays == [.light])
    }

    @MainActor
    @Test("toucher le chevron joue le choix seul : il n'appelle jamais l'action")
    func trigger_chevron_playsTheChoiceOnly() {
        var plays: [MeeshyGlassButtonHaptic] = []
        var calls: [String] = []
        let choose = MeeshySplitActionChoose(label: "Choisir", action: { calls.append("choose") })
        let fired = MeeshySplitActionTrigger.pressChevron(choose: choose, haptic: .light, play: { plays.append($0) })
        #expect(fired)
        #expect(calls == ["choose"])
        #expect(plays == [.light])
    }

    @MainActor
    @Test("retenu : ni action ni haptique, onDisabledPress part, le chevron reste actif")
    func trigger_held() {
        var plays: [MeeshyGlassButtonHaptic] = []
        var calls: [String] = []
        let fired = MeeshySplitActionTrigger.pressLabel(
            isEnabled: false, haptic: .light, play: { plays.append($0) },
            action: { calls.append("action") }, onDisabledPress: { calls.append("refus") }
        )
        #expect(!fired)
        #expect(calls == ["refus"])
        #expect(plays.isEmpty)
        let choose = MeeshySplitActionChoose(label: "Choisir", action: { calls.append("choose") })
        let chevronFired = MeeshySplitActionTrigger.pressChevron(choose: choose, haptic: .light, play: { plays.append($0) })
        #expect(chevronFired)
        #expect(calls == ["refus", "choose"])
        #expect(plays == [.light])
    }

    @MainActor
    @Test("retenu sans onDisabledPress : rien ne part")
    func trigger_heldWithoutReason() {
        var calls = 0
        let fired = MeeshySplitActionTrigger.pressLabel(
            isEnabled: false, haptic: .light, play: { _ in calls += 1 }, action: { calls += 1 }, onDisabledPress: nil
        )
        #expect(!fired)
        #expect(calls == 0)
    }

    @MainActor
    @Test("un chevron retenu ne joue ni choix ni haptique")
    func trigger_chevronHeld() {
        var calls = 0
        let choose = MeeshySplitActionChoose(label: "Choisir", isEnabled: false, action: { calls += 1 })
        let fired = MeeshySplitActionTrigger.pressChevron(choose: choose, haptic: .light, play: { _ in calls += 1 })
        #expect(!fired)
        #expect(calls == 0)
    }

    @MainActor
    @Test("haptique none : l'action part, l'hôte joue le sien")
    func trigger_hapticNone() {
        var plays: [MeeshyGlassButtonHaptic] = []
        var calls = 0
        MeeshySplitActionTrigger.pressLabel(
            isEnabled: true, haptic: .none, play: { plays.append($0) }, action: { calls += 1 }, onDisabledPress: nil
        )
        #expect(calls == 1)
        #expect(plays.isEmpty)
    }

    // MARK: - Performance : égalité par valeurs

    @MainActor
    @Test("le chevron et le libellé se comparent par valeurs ; les fermetures n'en font pas partie")
    func leaves_compareValues() {
        #expect(MeeshySplitActionChevronFace() == MeeshySplitActionChevronFace())
        let ink = MeeshyColors.onBrand
        let text = MeeshySplitActionTitleText(text: "Publier", size: 15, lines: 1, ink: ink)
        #expect(text == MeeshySplitActionTitleText(text: "Publier", size: 15, lines: 1, ink: ink))
        #expect(text != MeeshySplitActionTitleText(text: "Publier", size: 13, lines: 1, ink: ink))
        let a = MeeshySplitActionChoose(label: "Choisir", action: {})
        let b = MeeshySplitActionChoose(label: "Choisir", action: { _ = 1 })
        #expect(a == b)
        #expect(a != MeeshySplitActionChoose(label: "Choisir", isExpanded: true))
    }

    // MARK: - Source

    @Test("un seul site d'haptique (celui de K02), jamais de générateur propre")
    func source_singleHapticSite() throws {
        for file in Self.files {
            let code = try Self.code(file)
            for word in ["HapticFeedback.", "UIImpactFeedbackGenerator", "UINotificationFeedbackGenerator", "sensoryFeedback"] {
                #expect(!code.contains(word), "\(file) contient \(word)")
            }
        }
        #expect(try Self.code("MeeshySplitActionButtonRecipe.swift").contains("MeeshyGlassButtonTrigger.perform"))
    }

    @Test("le verre passe par K01 et par lui seul ; aucune couleur en dur")
    func source_hasNoOwnGlassNoLiteralColor() throws {
        let forbidden = [
            "Color(hex:", "Color(red:", "Color(white:", "Color.white", "Color.black", "Color.gray", "Color.red",
            "UIColor(", "#FF", "0x", "glassEffect", "adaptiveGlass", "adaptiveLiquidGlass", "UIBlurEffect",
            ".ultraThinMaterial", ".thinMaterial", ".regularMaterial", ".thickMaterial", "backdrop",
        ]
        for file in Self.files {
            let code = try Self.code(file)
            for word in forbidden {
                #expect(!code.contains(word), "\(file) contient \(word)")
            }
        }
        #expect(try Self.code("MeeshySplitActionButton.swift").components(separatedBy: ".meeshyGlass(").count == 2)
    }

    @Test("le nom accessible ne change pas en cours : le même spokenName nomme le libellé et l'état en cours")
    func source_nameIsStableAcrossPhases() throws {
        let code = try Self.code("MeeshySplitActionButton.swift")
        #expect(code.components(separatedBy: "MeeshySplitActionWords.spokenName(label: spec.label, title: spec.title)").count >= 4)
        #expect(code.contains(".accessibilityAddTraits(.updatesFrequently)"))
        #expect(code.contains("MeeshySplitActionWords.busyValue("))
    }

    @Test("busy et deferred ne montent aucun bouton : un toucher ne fait rien")
    func source_noGestureOutsideReady() throws {
        let code = try Self.code("MeeshySplitActionButton.swift")
        let busy = try #require(code.range(of: "private func busy("))
        let activate = try #require(code.range(of: "private func activate()"))
        let between = String(code[busy.lowerBound..<activate.lowerBound])
        for word in ["Button(", "onTapGesture", ".gesture(", "chevron("] {
            #expect(!between.contains(word), "busy/deferred contient \(word)")
        }
    }

    @Test("l'appui s'anime par l'échelle et l'opacité seulement ; le libellé se mesure par la mise en page, pas par un minuteur")
    func source_animatesOnlyOpacityAndScale() throws {
        let code = try Self.code("MeeshySplitActionButton.swift")
        for word in ["TimelineView", "Timer", "withAnimation", ".blur(", "GeometryReader"] {
            #expect(!code.contains(word), "MeeshySplitActionButton.swift contient \(word)")
        }
        #expect(code.contains("ViewThatFits(in: .horizontal)"))
        #expect(code.contains(".scaleEffect("))
    }

    @Test("RTL : ni le chevron, ni la flèche, ni l'anneau ne se reflètent")
    func source_doesNotMirror() throws {
        let code = try Self.code("MeeshySplitActionButton.swift")
        #expect(!code.contains("flipsForRightToLeftLayoutDirection"))
        #expect(!code.contains("scaleEffect(x: -1"))
        #expect(code.contains(".padding(.trailing, -slack)"))
    }

    // MARK: - Aides

    private static let files = [
        "MeeshySplitActionButton.swift", "MeeshySplitActionButtonRecipe.swift", "Catalog/MeeshyKitCatalog+K13.swift",
    ]

    private static func recipe(
        phase: MeeshySplitActionPhase = .ready,
        size: MeeshySplitActionSize = .regular,
        width: MeeshySplitActionWidth = .hug,
        isEnabled: Bool = true,
        hasChevron: Bool = true,
        material: MeeshyGlassMaterial = .drawn,
        tone: MeeshyGlassTone = .deep,
        increasedContrast: Bool = false,
        reduceMotion: Bool = false
    ) -> MeeshySplitActionButtonRecipe {
        MeeshySplitActionButtonRecipe.resolve(
            phase: phase, size: size, width: width, isEnabled: isEnabled, hasChevron: hasChevron,
            material: material, tone: tone, increasedContrast: increasedContrast, reduceMotion: reduceMotion
        )
    }

    private static func phase(_ name: String?) -> MeeshySplitActionPhase {
        switch name {
        case "busy": return .busy(progress: 0.62, title: "Publication…")
        case "deferred": return .deferred(title: "Au retour en ligne")
        default: return .ready
        }
    }

    private static func widths(_ row: [String: Double]) throws -> MeeshySplitActionLabelWidths {
        MeeshySplitActionLabelWidths(
            title: try #require(row["title"]),
            titleSmall: try #require(row["titleSmall"]),
            titleLongestWordSmall: try #require(row["longestWordSmall"]),
            shortTitle: row["shortTitle"],
            shortTitleSmall: row["shortTitleSmall"]
        )
    }

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func json() throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K13-MeeshySplitActionButton.vectors.json")
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
