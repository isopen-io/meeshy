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

    @Test("diamètre, glyphe (46 %) et cible de chaque taille suivent les vecteurs", arguments: MeeshyGlassButtonSize.allCases)
    func recipe_size_followsTheVectors(size: MeeshyGlassButtonSize) throws {
        let row = try Self.rows("sizes").first { $0["size"] as? String == size.rawValue }.unwrapped()
        let recipe = MeeshyGlassButtonRecipe.resolve(kind: .normal, size: size)
        #expect(recipe.diameter == row["diameter"] as? Double)
        #expect(recipe.glyphSize == row["glyph"] as? Double)
        #expect(recipe.targetSide == row["target"] as? Double)
    }

    @Test("la cible tactile est de 44 pt au moins, quelle que soit la taille dessinée", arguments: MeeshyGlassButtonSize.allCases)
    func recipe_target_isAtLeastTheTapTarget(size: MeeshyGlassButtonSize) {
        let recipe = MeeshyGlassButtonRecipe.resolve(kind: .normal, size: size)
        #expect(recipe.targetSide >= Double(MeeshyControlSize.tapTarget))
        #expect(recipe.targetSide >= recipe.diameter)
    }

    // MARK: - Tenues

    @Test("chaque tenue a le fond, l'encre et l'ombre des vecteurs", arguments: MeeshyGlassButtonKind.allCases)
    func recipe_kind_followsTheVectors(kind: MeeshyGlassButtonKind) throws {
        let row = try Self.rows("kinds").first { $0["kind"] as? String == kind.rawValue }.unwrapped()
        let recipe = MeeshyGlassButtonRecipe.resolve(kind: kind, size: .regular)
        #expect(recipe.fill.rawValue == Self.fillName(row["fill"] as? String))
        #expect(recipe.fillOpacity == row["fillOpacity"] as? Double)
        #expect(recipe.pressedFillOpacity == row["pressedFillOpacity"] as? Double)
        #expect(Self.inkName(recipe.ink) == row["ink"] as? String)
        let shadow = row["shadow"] as? [String: Double]
        #expect(recipe.shadow?.opacity == shadow?["opacity"])
        #expect(recipe.shadow?.radius == shadow?["radius"])
        #expect(recipe.shadow?.y == shadow?["y"])
    }

    @Test("seul l'actif porte une ombre ; le normal ne porte aucun fond")
    func recipe_onlyTheActiveCastsAShadow() {
        for kind in MeeshyGlassButtonKind.allCases {
            let recipe = MeeshyGlassButtonRecipe.resolve(kind: kind, size: .regular)
            #expect((recipe.shadow != nil) == (kind == .active))
        }
        #expect(MeeshyGlassButtonRecipe.resolve(kind: .normal, size: .regular).fill == .clear)
    }

    @Test("le voile doux s'éclaircit sous le doigt, et n'existe pas sous le Liquid Glass")
    func recipe_soft_veilBrightensAndYieldsToLiquidGlass() {
        let soft = MeeshyGlassButtonRecipe.resolve(kind: .soft, size: .compact)
        #expect(soft.fillOpacity(isPressed: false) == 0.12)
        #expect(soft.fillOpacity(isPressed: true) == 0.22)
        #expect(!soft.fillsUnderLiquid)
        #expect(MeeshyGlassButtonRecipe.resolve(kind: .active, size: .compact).fillsUnderLiquid)
    }

    @Test("une encre imposée remplace celle de la tenue, sauf pour l'actif")
    func recipe_ink_overridesEveryKindButActive() {
        let amber = MeeshyColors.warning
        #expect(MeeshyGlassButtonRecipe.resolve(kind: .normal, size: .regular, ink: amber).ink == .custom(amber))
        #expect(MeeshyGlassButtonRecipe.resolve(kind: .soft, size: .regular, ink: amber).ink == .custom(amber))
        #expect(MeeshyGlassButtonRecipe.resolve(kind: .active, size: .regular, ink: amber).ink == .onSolid)
        #expect(MeeshyGlassButtonRecipe.resolve(kind: .normal, size: .regular).ink == .onMedia)
    }

    @Test("le rouge du destructif est le jeton qui tient le contraste promis")
    func recipe_destructive_usesTheStrongRedToken() {
        let recipe = MeeshyGlassButtonRecipe.resolve(kind: .destructive, size: .compact)
        #expect(recipe.fillColor == MeeshyColors.errorStrong)
        #expect(recipe.inkColor == MeeshyColors.onMedia)
    }

    // MARK: - Contraste

    @Test("actif : encre sombre sur blanc, plus de 15:1 ; destructif : blanc sur rouge, 3:1 au moins")
    func contrast_solidKinds_holdTheirPromise() throws {
        let vectors = try Self.object("contrast")
        let active = try MeeshyGlassButtonRecipe.resolve(kind: .active, size: .regular).solidContrast.unwrapped()
        let destructive = try MeeshyGlassButtonRecipe.resolve(kind: .destructive, size: .regular).solidContrast.unwrapped()
        #expect(active > (vectors["activeMin"] as? Double ?? .infinity))
        #expect(destructive >= (vectors["glyphMin"] as? Double ?? .infinity))
        #expect(abs(destructive - (vectors["destructiveNominal"] as? Double ?? 0)) < 0.1)
    }

    @Test("normal et doux n'ont pas de fond plein : leur contraste est celui du ton de K01")
    func contrast_glassKinds_areTheTonesBusiness() {
        #expect(MeeshyGlassButtonRecipe.resolve(kind: .normal, size: .regular).solidContrast == nil)
        #expect(MeeshyGlassButtonRecipe.resolve(kind: .soft, size: .regular).solidContrast == nil)
    }

    // MARK: - Désactivé et occupé

    @Test("désactivé ou occupé : ni action, ni haptique, ni appui ; l'opacité suit les vecteurs")
    func recipe_disabledAndBusy_followTheVectors() throws {
        for row in try Self.rows("states") {
            let recipe = MeeshyGlassButtonRecipe.resolve(
                kind: .normal, size: .regular,
                isEnabled: row["isEnabled"] as? Bool ?? true, isBusy: row["isBusy"] as? Bool ?? false
            )
            #expect(recipe.isActionEnabled == row["action"] as? Bool)
            #expect(recipe.playsHaptic == row["haptic"] as? Bool)
            #expect(recipe.respondsToTouch == row["touchResponse"] as? Bool)
            #expect(recipe.opacity == row["opacity"] as? Double)
        }
    }

    @Test("occupé : l'indicateur remplace le glyphe")
    func recipe_busy_showsTheIndicator() {
        #expect(MeeshyGlassButtonRecipe.resolve(kind: .normal, size: .regular, isBusy: true).showsBusyIndicator)
        #expect(!MeeshyGlassButtonRecipe.resolve(kind: .normal, size: .regular).showsBusyIndicator)
    }

    // MARK: - Activation

    @MainActor
    @Test("un seul retour haptique par activation, puis l'action")
    func activation_playsOneHapticThenTheAction() {
        var events: [String] = []
        let recipe = MeeshyGlassButtonRecipe.resolve(kind: .normal, size: .regular)
        let fired = MeeshyGlassButtonActivation.perform(
            recipe: recipe, haptic: .medium,
            play: { events.append("haptic:\($0.rawValue)") },
            action: { events.append("action") }
        )
        #expect(fired)
        #expect(events == ["haptic:medium", "action"])
    }

    @MainActor
    @Test("haptic none : l'action part, aucun retour")
    func activation_noneHaptic_playsNothing() {
        var events: [String] = []
        let recipe = MeeshyGlassButtonRecipe.resolve(kind: .normal, size: .regular)
        MeeshyGlassButtonActivation.perform(
            recipe: recipe, haptic: .none,
            play: { events.append("haptic:\($0.rawValue)") },
            action: { events.append("action") }
        )
        #expect(events == ["action"])
    }

    @MainActor
    @Test("désactivé : ni action ni haptique")
    func activation_disabled_doesNothing() {
        var events: [String] = []
        let recipe = MeeshyGlassButtonRecipe.resolve(kind: .normal, size: .regular, isEnabled: false)
        let fired = MeeshyGlassButtonActivation.perform(
            recipe: recipe, haptic: .light,
            play: { events.append("haptic:\($0.rawValue)") },
            action: { events.append("action") }
        )
        #expect(!fired)
        #expect(events.isEmpty)
    }

    @MainActor
    @Test("occupé : ni action ni haptique")
    func activation_busy_doesNothing() {
        var events: [String] = []
        let recipe = MeeshyGlassButtonRecipe.resolve(kind: .normal, size: .regular, isBusy: true)
        let fired = MeeshyGlassButtonActivation.perform(
            recipe: recipe, haptic: .light,
            play: { events.append("haptic:\($0.rawValue)") },
            action: { events.append("action") }
        )
        #expect(!fired)
        #expect(events.isEmpty)
    }

    // MARK: - Appui long

    @Test("l'appui long dure 500 ms et s'annule au-delà de 10 pt")
    func longPress_followsTheVectors() throws {
        let vectors = try Self.object("longPress")
        #expect(MeeshyGlassButtonRecipe.longPressDuration * 1000 == vectors["durationMs"] as? Double)
        #expect(MeeshyGlassButtonRecipe.longPressMaxMovement == vectors["maxMovement"] as? Double)
    }

    // MARK: - Lecteur d'écran

    @Test("bascule, sélectionné, ou rien : l'état exposé suit les vecteurs")
    func accessibility_state_followsTheVectors() throws {
        for row in try Self.rows("accessibility") {
            let kind = try MeeshyGlassButtonKind(rawValue: (row["kind"] as? String).unwrapped()).unwrapped()
            let state = MeeshyGlassButtonAccessibilityState.resolve(kind: kind, isOn: row["isOn"] as? Bool)
            #expect(state.isSelected == row["selected"] as? Bool, "\(row)")
            #expect(state.isToggle == row["toggle"] as? Bool, "\(row)")
        }
    }

    // MARK: - Fondu, performance

    @Test("le fondu d'une tenue est celui du ton de K01")
    func fade_isTheToneFade() throws {
        let vectors = try Self.json()
        #expect(MeeshyGlassButtonRecipe.toneFadeDuration == MeeshyGlassRecipe.toneFadeDuration)
        #expect(MeeshyGlassButtonRecipe.toneFadeDuration * 1000 == vectors["toneFadeMs"] as? Double)
    }

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
    @Test("un bouton avec appui long ne s'égale pas à un bouton sans")
    func equality_distinguishesAPresentLongPress() {
        let plain = MeeshyGlassButton(systemImage: "plus", label: "Ajouter", action: {})
        let longPressable = MeeshyGlassButton(systemImage: "plus", label: "Ajouter", onLongPress: {}, action: {})
        #expect(plain != longPressable)
    }

    // MARK: - Source

    @Test("jamais de légende, aucune couleur en dur, aucun appel de verre direct")
    func source_hasNoCaptionNoLiteralColorNoDirectGlass() throws {
        for file in ["MeeshyGlassButton.swift", "MeeshyGlassButtonRecipe.swift"] {
            let code = try Self.code(file)
            for forbidden in ["caption", "Color(hex:", "Color(red:", "Color.white", "Color.black", "adaptiveGlass", "adaptiveLiquidGlass", ".glassEffect"] {
                #expect(!code.contains(forbidden), "\(file) contient \(forbidden)")
            }
        }
    }

    @Test("le disque passe par l'unique entrée de verre, interactive")
    func source_discGoesThroughKitGlass() throws {
        let code = try Self.code("MeeshyGlassButton.swift")
        #expect(code.contains(".meeshyGlass(in: Circle()"))
        #expect(code.contains("isInteractive: true"))
    }

    @Test("aucun rétrécissement de jumeau ne s'empile avec la réponse de K01")
    func source_hasNoPressScaleOfItsOwn() throws {
        let code = try Self.code("MeeshyGlassButton.swift")
        #expect(!code.contains("scaleEffect"))
        #expect(!code.contains("UIImpactFeedbackGenerator"))
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

    private static func fillName(_ vector: String?) -> String? {
        vector == "none" ? MeeshyGlassButtonFill.clear.rawValue : vector
    }

    private static func inkName(_ ink: MeeshyGlassButtonInk) -> String {
        switch ink {
        case .onMedia: return "onMedia"
        case .onSolid: return "indigo950"
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
