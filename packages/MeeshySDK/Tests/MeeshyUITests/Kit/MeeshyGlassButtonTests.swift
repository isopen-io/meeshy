import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K02 — le bouton rond de verre, lu comme des VALEURS : la recette, la loi
/// d'activation et l'état exposé au lecteur d'écran. Les mesures viennent du
/// fichier de vecteurs que lisent aussi Android et le web.
@Suite("MeeshyGlassButton")
struct MeeshyGlassButtonTests {

    // MARK: - Tailles

    @Test("diamètre, glyphe, cible et débord de chaque taille suivent les vecteurs", arguments: MeeshyGlassButtonSize.allCases)
    func recipe_size_followsTheVectors(size: MeeshyGlassButtonSize) throws {
        let row = try Self.rows("sizes").first { $0["size"] as? String == size.rawValue }.unwrapped()
        let recipe = MeeshyGlassButtonRecipe.resolve(kind: .normal, size: size)
        #expect(recipe.diameter == row["diameter"] as? Double)
        #expect(recipe.glyphSize == row["glyph"] as? Double)
        #expect(recipe.targetSide == row["target"] as? Double)
        #expect(Double(size.hitSlack) == row["slack"] as? Double)
    }

    @Test("la cible tactile est de 44 pt au moins, quelle que soit la taille dessinée", arguments: MeeshyGlassButtonSize.allCases)
    func recipe_target_isAtLeastTheTapTarget(size: MeeshyGlassButtonSize) throws {
        let tapTargets = try Self.object("tapTarget")
        let recipe = MeeshyGlassButtonRecipe.resolve(kind: .normal, size: size)
        #expect(recipe.targetSide >= Double(MeeshyControlSize.tapTarget))
        #expect(recipe.targetSide >= recipe.diameter)
        #expect(Double(MeeshyControlSize.tapTarget) == tapTargets["ios"] as? Double)
    }

    // MARK: - Matière : fond, verre demandé, appui, survol

    @Test("chaque tenue sur chaque matière demande à K01 et peint ce que les vecteurs disent")
    func recipe_matter_followsTheVectors() throws {
        for row in try Self.rows("matter") {
            let kind = try Self.kind(row["kind"])
            let material = try Self.material(row["material"])
            let nested = row["nested"] as? Bool ?? false
            func resolve(pressed: Bool = false, hovered: Bool = false) -> MeeshyGlassButtonRecipe {
                MeeshyGlassButtonRecipe.resolve(
                    kind: kind, size: .s44, material: material, isNested: nested, isPressed: pressed, isHovered: hovered
                )
            }
            #expect(Self.vectorName(resolve().fill) == row["fill"] as? String, "\(row)")
            #expect(resolve().glass.rawValue == row["glass"] as? String, "\(row)")
            #expect(resolve().fillOpacity == row["restFill"] as? Double, "\(row)")
            #expect(resolve(pressed: true).fillOpacity == row["pressedFill"] as? Double, "\(row)")
            #expect(resolve(hovered: true).fillOpacity == row["hoveredFill"] as? Double, "\(row)")
            #expect(resolve().pressVeilOpacity == 0, "\(row)")
            #expect(resolve(pressed: true).pressVeilOpacity == row["pressedVeil"] as? Double, "\(row)")
            #expect(resolve(hovered: true).pressVeilOpacity == row["hoveredVeil"] as? Double, "\(row)")
        }
    }

    @Test("le verre dessiné se voit appuyé pour chaque tenue ; seul le normal seul laisse K01 répondre", arguments: MeeshyGlassButtonKind.allCases)
    func recipe_drawn_pressIsVisible(kind: MeeshyGlassButtonKind) {
        let rest = MeeshyGlassButtonRecipe.resolve(kind: kind, size: .s44, material: .drawn)
        let pressed = MeeshyGlassButtonRecipe.resolve(kind: kind, size: .s44, material: .drawn, isPressed: true)
        if kind == .normal {
            #expect(rest == pressed)
            #expect(rest.glass == .neutral)
        } else {
            #expect(rest != pressed)
        }
        let nested = MeeshyGlassButtonRecipe.resolve(kind: kind, size: .s44, material: .drawn, isNested: true)
        let nestedPressed = MeeshyGlassButtonRecipe.resolve(
            kind: kind, size: .s44, material: .drawn, isNested: true, isPressed: true
        )
        #expect(nested != nestedPressed)
    }

    @Test("sous le Liquid Glass, le système répond : la recette ne bouge ni à l'appui ni au survol", arguments: MeeshyGlassButtonKind.allCases)
    func recipe_liquid_isIdenticalPressedAndHovered(kind: MeeshyGlassButtonKind) {
        let rest = MeeshyGlassButtonRecipe.resolve(kind: kind, size: .s44, material: .liquid)
        #expect(rest == MeeshyGlassButtonRecipe.resolve(kind: kind, size: .s44, material: .liquid, isPressed: true))
        #expect(rest == MeeshyGlassButtonRecipe.resolve(kind: kind, size: .s44, material: .liquid, isHovered: true))
        #expect(rest == MeeshyGlassButtonRecipe.resolve(kind: kind, size: .s44, material: .liquid, isNested: true))
    }

    @Test("seul l'actif porte une ombre ; le normal ne porte aucun fond")
    func recipe_onlyTheActiveCastsAShadow() throws {
        let shadow = try Self.object("shadowActive")
        for kind in MeeshyGlassButtonKind.allCases {
            let recipe = MeeshyGlassButtonRecipe.resolve(kind: kind, size: .s44)
            #expect((recipe.shadow != nil) == (kind == .active))
        }
        let active = MeeshyGlassButtonRecipe.resolve(kind: .active, size: .s44).shadow
        #expect(active?.opacity == shadow["opacity"] as? Double)
        #expect(active?.radius == shadow["radius"] as? Double)
        #expect(active?.y == shadow["y"] as? Double)
        #expect(MeeshyGlassButtonRecipe.resolve(kind: .normal, size: .s44).fill == .clear)
    }

    // MARK: - Encre

    @Test("l'encre suit la tenue, le ton du thème et l'encre imposée")
    func recipe_ink_followsTheVectors() throws {
        let themeFill = try #require(try Self.json()["activeThemeFill"] as? String)
        for row in try Self.rows("ink") {
            let kind = try Self.kind(row["kind"])
            let tone = try Self.tone(row["tone"])
            let tinted = row["glyphTint"] as? Bool ?? false
            let recipe = MeeshyGlassButtonRecipe.resolve(
                kind: kind, size: .s44, tone: tone, glyphTint: tinted ? MeeshyColors.warning : nil
            )
            #expect(Self.inkName(recipe.ink) == row["ink"] as? String, "\(row)")
        }
        let theme = MeeshyGlassButtonRecipe.resolve(kind: .active, size: .s44, tone: .theme)
        #expect(theme.fill.rawValue == themeFill)
    }

    @Test("le rouge du destructif est le jeton qui tient le contraste promis")
    func recipe_destructive_usesTheStrongRedToken() {
        let recipe = MeeshyGlassButtonRecipe.resolve(kind: .destructive, size: .s40, material: .drawn)
        #expect(recipe.fillColor(isDark: false) == MeeshyColors.errorStrong)
        #expect(recipe.inkColor(isDark: false) == MeeshyColors.onMedia)
    }

    // MARK: - Contraste

    @Test("actif : encre sombre sur blanc ; destructif : blanc sur rouge ; chacun au moins 3:1")
    func contrast_solidKinds_holdTheirPromise() throws {
        let vectors = try Self.object("contrast")
        let tolerance = try #require(vectors["tolerance"] as? Double)
        let glyphMin = try #require(vectors["glyphMin"] as? Double)
        let active = try MeeshyGlassButtonRecipe.resolve(kind: .active, size: .s44).solidContrast(isDark: false).unwrapped()
        let destructive = try MeeshyGlassButtonRecipe.resolve(kind: .destructive, size: .s44).solidContrast(isDark: false).unwrapped()
        #expect(abs(active - (vectors["active"] as? Double ?? 0)) < tolerance)
        #expect(abs(destructive - (vectors["destructive"] as? Double ?? 0)) < tolerance)
        #expect(active >= glyphMin)
        #expect(destructive >= glyphMin)
    }

    @Test("l'actif au ton du thème garde son contraste en clair comme en sombre", arguments: [false, true])
    func contrast_themeActive_holdsInBothSchemes(isDark: Bool) throws {
        let glyphMin = try #require(try Self.object("contrast")["glyphMin"] as? Double)
        let recipe = MeeshyGlassButtonRecipe.resolve(kind: .active, size: .s44, tone: .theme)
        let contrast = try recipe.solidContrast(isDark: isDark).unwrapped()
        #expect(contrast >= glyphMin)
    }

    @Test("normal et doux n'ont pas de fond plein : leur contraste est celui du ton de K01")
    func contrast_glassKinds_areTheTonesBusiness() {
        #expect(MeeshyGlassButtonRecipe.resolve(kind: .normal, size: .s44).solidContrast(isDark: false) == nil)
        #expect(MeeshyGlassButtonRecipe.resolve(kind: .soft, size: .s44).solidContrast(isDark: false) == nil)
    }

    // MARK: - Désactivé

    @Test("désactivé : ni action, ni haptique, ni appui, ni voile ; l'opacité suit les vecteurs")
    func recipe_disabled_followsTheVectors() throws {
        for row in try Self.rows("states") {
            let enabled = row["enabled"] as? Bool ?? true
            let recipe = MeeshyGlassButtonRecipe.resolve(kind: .destructive, size: .s44, isPressed: true, isEnabled: enabled)
            #expect(recipe.isActionEnabled == row["action"] as? Bool)
            #expect(recipe.playsHaptic == row["haptic"] as? Bool)
            #expect(recipe.respondsToTouch == row["touchResponse"] as? Bool)
            #expect(recipe.opacity == row["opacity"] as? Double)
            if !enabled {
                let rest = MeeshyGlassButtonRecipe.resolve(kind: .destructive, size: .s44, isEnabled: false)
                #expect(recipe == rest)
                #expect(recipe.pressVeilOpacity == 0)
            }
        }
    }

    // MARK: - Activation

    @MainActor
    @Test("un seul retour haptique par activation, puis l'action")
    func trigger_playsOneHapticThenTheAction() {
        var events: [String] = []
        let fired = MeeshyGlassButtonTrigger.perform(
            isEnabled: true, haptic: .light,
            play: { events.append("haptic:\($0.rawValue)") },
            action: { events.append("action") }
        )
        #expect(fired)
        #expect(events == ["haptic:light", "action"])
    }

    @MainActor
    @Test("haptic none : l'action part, aucun retour")
    func trigger_noneHaptic_playsNothing() {
        var events: [String] = []
        MeeshyGlassButtonTrigger.perform(
            isEnabled: true, haptic: .none,
            play: { events.append("haptic:\($0.rawValue)") },
            action: { events.append("action") }
        )
        #expect(events == ["action"])
    }

    @MainActor
    @Test("désactivé : ni action ni haptique")
    func trigger_disabled_doesNothing() {
        var events: [String] = []
        let fired = MeeshyGlassButtonTrigger.perform(
            isEnabled: false, haptic: .light,
            play: { events.append("haptic:\($0.rawValue)") },
            action: { events.append("action") }
        )
        #expect(!fired)
        #expect(events.isEmpty)
    }

    // MARK: - Appui long, fondu

    @Test("l'appui long dure 500 ms et s'annule au-delà de 10 pt")
    func longPress_followsTheVectors() throws {
        let vectors = try Self.object("longPress")
        #expect(MeeshyGlassButtonRecipe.longPressDuration * 1000 == vectors["durationMs"] as? Double)
        #expect(MeeshyGlassButtonRecipe.longPressMaxMovement == vectors["maxMovement"] as? Double)
    }

    @Test("le fondu d'une tenue est celui du ton de K01")
    func fade_isTheToneFade() throws {
        let vectors = try Self.json()
        #expect(MeeshyGlassButtonRecipe.toneFadeDuration == MeeshyGlassRecipe.toneFadeDuration)
        #expect(MeeshyGlassButtonRecipe.toneFadeDuration * 1000 == vectors["toneFadeMs"] as? Double)
    }

    // MARK: - Lecteur d'écran

    @Test("l'état dit déduit la tenue et l'état exposé : bascule, sélection, déplié")
    func accessibility_activation_followsTheVectors() throws {
        for row in try Self.rows("activation") {
            let activation = try Self.activation(row["activation"])
            let state = MeeshyGlassButtonAccessibilityState.resolve(activation: activation)
            #expect(activation.impliedKind.rawValue == row["impliedKind"] as? String, "\(row)")
            #expect(state.isToggle == row["toggle"] as? Bool, "\(row)")
            #expect(state.isSelected == row["selected"] as? Bool, "\(row)")
            #expect(state.toggleIsOn == row["toggleOn"] as? Bool, "\(row)")
        }
    }

    @Test("la valeur dite compose le mot de la bascule et ce que le contrôle porte déjà")
    func accessibility_value_isComposed() throws {
        for row in try Self.rows("value") {
            let said = MeeshyGlassButtonAccessibilityState.composeValue(
                toggleWord: row["toggleWord"] as? String, value: row["value"] as? String
            )
            #expect(said == row["said"] as? String, "\(row)")
        }
    }

    @MainActor
    @Test("les deux mots de la bascule existent et diffèrent")
    func accessibility_toggleWords_areDistinct() {
        #expect(!MeeshyGlassButtonWords.toggle(isOn: true).isEmpty)
        #expect(MeeshyGlassButtonWords.toggle(isOn: true) != MeeshyGlassButtonWords.toggle(isOn: false))
    }

    // MARK: - Performance : égalité par valeurs

    @MainActor
    @Test("à valeurs égales deux boutons sont égaux, fermetures différentes ; une autre tenue les distingue")
    func equality_comparesValuesNotClosures() {
        let first = MeeshyGlassButton(systemImage: "plus", label: "Ajouter", action: { _ = 1 })
        let second = MeeshyGlassButton(systemImage: "plus", label: "Ajouter", action: { _ = 2 })
        let active = MeeshyGlassButton(systemImage: "plus", label: "Ajouter", kind: .active, action: { _ = 1 })
        let renamed = MeeshyGlassButton(systemImage: "plus", label: "Retirer", action: { _ = 1 })
        #expect(first == second)
        #expect(first != active)
        #expect(first != renamed)
    }

    @MainActor
    @Test("sans tenue explicite, l'état dit choisit la tenue")
    func equality_activationImpliesTheKind() {
        let implied = MeeshyGlassButton(systemImage: "plus", label: "Ajouter", activation: .toggle(true), action: {})
        let forced = MeeshyGlassButton(systemImage: "plus", label: "Ajouter", kind: .active, activation: .toggle(true), action: {})
        let off = MeeshyGlassButton(systemImage: "plus", label: "Ajouter", activation: .toggle(false), action: {})
        #expect(implied == forced)
        #expect(implied != off)
    }

    @MainActor
    @Test("un bouton avec appui long ne s'égale pas à un bouton sans")
    func equality_distinguishesAPresentLongPress() {
        let plain = MeeshyGlassButton(systemImage: "plus", label: "Ajouter", action: {})
        let longPressable = MeeshyGlassButton(systemImage: "plus", label: "Ajouter", onLongPress: {}, action: {})
        #expect(plain != longPressable)
    }

    @MainActor
    @Test("le disque seul se compare par valeurs")
    func equality_faceComparesValues() {
        let rest = MeeshyGlassButtonFace(systemImage: "plus")
        #expect(rest == MeeshyGlassButtonFace(systemImage: "plus"))
        #expect(rest != MeeshyGlassButtonFace(systemImage: "plus", isPressed: true))
        #expect(rest != MeeshyGlassButtonFace(systemImage: "plus", kind: .soft))
    }

    // MARK: - Source

    @Test("jamais de légende, aucune couleur en dur, aucun verre dessiné dans les fichiers de K02")
    func source_hasNoCaptionNoLiteralColorNoDirectGlass() throws {
        for file in ["MeeshyGlassButton.swift", "MeeshyGlassButtonRecipe.swift"] {
            let code = try Self.code(file)
            let forbidden = [
                "caption", "Color(hex:", "Color(red:", "Color.white", "Color.black",
                "adaptiveGlass", "adaptiveLiquidGlass", ".glassEffect", "UIBlurEffect", ".ultraThinMaterial", ".blur(",
            ]
            for word in forbidden {
                #expect(!code.contains(word), "\(file) contient \(word)")
            }
        }
    }

    @Test("le verre passe par l'unique entrée de K01, interactive")
    func source_goesThroughKitGlass() throws {
        let code = try Self.code("MeeshyGlassButton.swift")
        #expect(code.contains(".meeshyGlass(in: Circle()"))
        #expect(code.contains("isInteractive: true"))
    }

    @Test("aucun rétrécissement de jumeau ne s'empile avec la réponse de K01, aucun impact maison")
    func source_hasNoPressScaleOfItsOwn() throws {
        let code = try Self.code("MeeshyGlassButton.swift")
        #expect(!code.contains("scaleEffect"))
        #expect(!code.contains("UIImpactFeedbackGenerator"))
        #expect(!code.contains("sensoryFeedback"))
    }

    // MARK: - Aides

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func json() throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K02-MeeshyGlassButton.vectors.json")
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

    private static func kind(_ name: Any?) throws -> MeeshyGlassButtonKind {
        let raw = try #require(name as? String)
        return try #require(MeeshyGlassButtonKind(rawValue: raw))
    }

    private static func tone(_ name: Any?) throws -> MeeshyGlassTone {
        let raw = try #require(name as? String)
        return try #require(MeeshyGlassTone(rawValue: raw))
    }

    private static func material(_ name: Any?) throws -> MeeshyGlassMaterial {
        switch try #require(name as? String) {
        case "liquid": return .liquid
        case "drawn": return .drawn
        default: return .opaque
        }
    }

    private static func activation(_ name: Any?) throws -> MeeshyGlassButtonActivation {
        switch try #require(name as? String) {
        case "toggle(true)": return .toggle(true)
        case "toggle(false)": return .toggle(false)
        case "selected(true)": return .selected(true)
        case "selected(false)": return .selected(false)
        case "expanded(true)": return .expanded(true)
        case "expanded(false)": return .expanded(false)
        default: return .none
        }
    }

    private static func vectorName(_ fill: MeeshyGlassButtonFill) -> String {
        fill == .clear ? "none" : fill.rawValue
    }

    private static func inkName(_ ink: MeeshyGlassButtonInk) -> String {
        switch ink {
        case .onMedia: return "onMedia"
        case .onSolid: return "onSolid"
        case .themeInk: return "themeInk"
        case .themeInverse: return "themeInverse"
        case .custom: return "custom"
        }
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

private extension Optional {
    func unwrapped() throws -> Wrapped {
        try #require(self)
    }
}
