import Testing
import Foundation
@testable import MeeshyUI

/// K01 — le verre du kit, lu comme des VALEURS : un `ViewModifier` ne s'inspecte
/// pas, sa recette si. Chaque témoin interroge la loi du ton, le choix de la
/// matière ou la recette, jamais un rendu.
@Suite("MeeshyGlassTone")
struct MeeshyGlassToneTests {

    // MARK: - La loi du ton

    @Test("un témoin de chaque côté de chaque seuil")
    func resolve_eachSideOfEachThreshold() {
        #expect(MeeshyGlassTone.resolve(luminance: 0.117) == .plain)
        #expect(MeeshyGlassTone.resolve(luminance: 0.119) == .deep)
        #expect(MeeshyGlassTone.resolve(luminance: 0.612) == .deep)
        #expect(MeeshyGlassTone.resolve(luminance: 0.614) == .onLight)
    }

    @Test("luminance inconnue ⇒ deep, quel que soit le ton précédent", arguments: [nil, MeeshyGlassTone.plain, .deep, .onLight, .theme])
    func resolve_unknownLuminance_isDeep(previous: MeeshyGlassTone?) {
        #expect(MeeshyGlassTone.resolve(luminance: nil, previous: previous) == .deep)
    }

    @Test("pas de bascule dans l'hystérésis, bascule au-delà")
    func resolve_hysteresisHoldsThePreviousTone() {
        #expect(MeeshyGlassTone.resolve(luminance: 0.14, previous: .plain) == .plain)
        #expect(MeeshyGlassTone.resolve(luminance: 0.16, previous: .plain) == .deep)
        #expect(MeeshyGlassTone.resolve(luminance: 0.10, previous: .deep) == .deep)
        #expect(MeeshyGlassTone.resolve(luminance: 0.08, previous: .deep) == .plain)
        #expect(MeeshyGlassTone.resolve(luminance: 0.63, previous: .deep) == .deep)
        #expect(MeeshyGlassTone.resolve(luminance: 0.65, previous: .deep) == .onLight)
        #expect(MeeshyGlassTone.resolve(luminance: 0.59, previous: .onLight) == .onLight)
        #expect(MeeshyGlassTone.resolve(luminance: 0.57, previous: .onLight) == .deep)
    }

    @Test("le ton theme n'est jamais tenu : il n'a pas de seuil")
    func resolve_themeIsNotAThresholdTone() {
        #expect(MeeshyGlassTone.resolve(luminance: 0.05, previous: .theme) == .plain)
        #expect(MeeshyGlassTone.resolve(luminance: 0.9, previous: .theme) == .onLight)
    }

    // MARK: - La matière

    @Test("liquid dès qu'iOS 26 le permet, quel que soit le ton")
    func material_liquidWhenAvailable() {
        #expect(MeeshyGlassMaterial.resolve(isLiquidAvailable: true, reduceTransparency: false, forcesDrawn: false) == .liquid)
        #expect(MeeshyGlassMaterial.resolve(isLiquidAvailable: false, reduceTransparency: false, forcesDrawn: false) == .drawn)
    }

    @Test("réduire la transparence ⇒ opaque, sur toute version")
    func material_reduceTransparencyIsOpaque() {
        #expect(MeeshyGlassMaterial.resolve(isLiquidAvailable: true, reduceTransparency: true, forcesDrawn: false) == .opaque)
        #expect(MeeshyGlassMaterial.resolve(isLiquidAvailable: false, reduceTransparency: true, forcesDrawn: false) == .opaque)
    }

    @Test("le forçage du verre dessiné ne passe que par l'environnement de debug")
    func material_forcedDrawn() {
        #expect(MeeshyGlassMaterial.resolve(isLiquidAvailable: true, reduceTransparency: false, forcesDrawn: true) == .drawn)
    }

    @Test("aucun paramètre public de .meeshyGlass ne force la matière")
    func publicSurfaceHasNoMaterialParameter() throws {
        let source = try Self.kitSource("MeeshyGlassSurface.swift")
        let start = try #require(source.range(of: "func meeshyGlass<"))
        let tail = source[start.lowerBound...]
        let end = try #require(tail.range(of: "-> some View"))
        let signature = String(tail[..<end.lowerBound]).lowercased()
        #expect(!signature.contains("material"))
        #expect(!signature.contains("drawn"))
    }

    @Test("le forçage de #17334 est absent du build release")
    func debugForcingLivesOnlyUnderDebug() throws {
        let names = ["meeshyGlassForcesDrawn", "meeshyGlassForcesOpaque", "MeeshyForceDrawnGlass"]
        for file in try Self.kitSourceFiles() {
            let release = Self.outsideDebugBlocks(try Self.kitSource(file))
            for name in names {
                #expect(!release.contains(name), "\(file) laisse \(name) hors de #if DEBUG")
            }
        }
    }

    // MARK: - La recette de repos et pressée

    @Test("une surface qui se touche : repos ≠ pressé, en verre dessiné", arguments: MeeshyGlassTone.allCases)
    func recipe_drawnInteractive_restDiffersFromPressed(tone: MeeshyGlassTone) {
        let rest = Self.recipe(tone: tone, interactive: true, pressed: false)
        let pressed = Self.recipe(tone: tone, interactive: true, pressed: true)
        #expect(rest != pressed)
        #expect(rest.scale == 1)
        #expect(pressed.scale == 1.04)
        #expect(pressed.sheen + pressed.topLight > rest.sheen + rest.topLight)
    }

    @Test("une surface qui ne se touche pas ne répond pas au toucher", arguments: MeeshyGlassTone.allCases)
    func recipe_notInteractive_ignoresPress(tone: MeeshyGlassTone) {
        #expect(Self.recipe(tone: tone, interactive: false, pressed: true) == Self.recipe(tone: tone, interactive: false, pressed: false))
    }

    @Test("réduire les animations ⇒ aucune échelle, le reflet répond encore")
    func recipe_reduceMotion_hasNoScale() {
        let pressed = Self.recipe(tone: .deep, interactive: true, pressed: true, reduceMotion: true)
        #expect(pressed.scale == 1)
        #expect(pressed != Self.recipe(tone: .deep, interactive: true, pressed: false, reduceMotion: true))
    }

    @Test("sur iOS 26 la réponse est celle du système : la recette ne bouge pas")
    func recipe_liquid_leavesThePressToTheSystem() {
        let rest = Self.recipe(tone: .theme, interactive: true, pressed: false, material: .liquid)
        let pressed = Self.recipe(tone: .theme, interactive: true, pressed: true, material: .liquid)
        #expect(rest == pressed)
    }

    @Test("opaque : ni flou, ni reflet, ni ombre ; la surface pleine répond par l'échelle", arguments: MeeshyGlassTone.allCases)
    func recipe_opaque_hasNoBlurNorSheen(tone: MeeshyGlassTone) {
        let rest = Self.recipe(tone: tone, interactive: true, pressed: false, material: .opaque)
        let pressed = Self.recipe(tone: tone, interactive: true, pressed: true, material: .opaque)
        #expect(!rest.blursBackdrop)
        #expect(rest.sheen == 0 && rest.topLight == 0 && rest.shadowOpacity == 0)
        #expect(rest.fillOpacity == 1)
        #expect(pressed.sheen == 0 && pressed.topLight == 0)
        #expect(pressed.scale == 1.04)
    }

    @Test("un seul flou par surface, jamais en verre opaque ni liquid")
    func recipe_blursOnlyWhenDrawn() {
        for tone in MeeshyGlassTone.allCases {
            #expect(Self.recipe(tone: tone, material: .drawn).blursBackdrop)
            #expect(!Self.recipe(tone: tone, material: .opaque).blursBackdrop)
            #expect(!Self.recipe(tone: tone, material: .liquid).blursBackdrop)
        }
    }

    // MARK: - Non-régression du ton theme

    @Test("le ton theme redonne la recette dessinée d'avant, au bit près", arguments: [false, true])
    func recipe_theme_equalsTheLegacyFallback(isDark: Bool) {
        for isTinted in [false, true] {
            let legacy = LiquidGlassFallbackRecipe.resolve(isDark: isDark, isTinted: isTinted)
            let recipe = MeeshyGlassRecipe.resolve(
                tone: .theme, density: .regular, isTinted: isTinted, isInteractive: false,
                isPressed: false, material: .drawn, reduceMotion: false, isDark: isDark
            )
            #expect(recipe.tintWash == legacy.tintWash)
            #expect(recipe.sheen == legacy.sheen)
            #expect(recipe.rimLit == legacy.rimLit)
            #expect(recipe.rimShade == legacy.rimShade)
            #expect(recipe.rimTail == legacy.rimLit * 0.5)
            #expect(recipe.shadowOpacity == legacy.shadowOpacity)
            #expect(recipe.shadowRadius == Double(legacy.shadowRadius))
            #expect(recipe.shadowY == 6)
            #expect(recipe.fill == .clear && recipe.topLight == 0)
        }
    }

    // MARK: - Le contraste, calculé depuis la recette

    @Test("encre blanche ≥ 4,5:1 sur dense et onLight, contre le pire fond")
    func contrast_textCarriers() {
        #expect(Self.worstContrast(tone: .deep, density: .dense) >= 4.5)
        #expect(Self.worstContrast(tone: .onLight, density: .regular) >= 4.5)
        #expect(Self.worstContrast(tone: .onLight, density: .dense) >= 4.5)
    }

    @Test("glyphe blanc ≥ 3:1 sur deep, contre le pire fond")
    func contrast_deepGlyph() {
        #expect(Self.worstContrast(tone: .deep, density: .regular) >= 3)
    }

    @Test("plain tient 4,5:1 jusqu'à la luminance 0,118, son plafond")
    func contrast_plainAtItsCeiling() {
        let ratio = Self.contrast(tone: .plain, density: .regular, backdropLuminance: MeeshyGlassTone.plainCeiling)
        #expect(ratio >= 4.5, "mesuré \(ratio)")
    }

    // MARK: - Parité : un fichier de vecteurs pour les trois suites

    @Test("la loi du ton suit les vecteurs de parité")
    func parity_toneLaw() throws {
        let tone = try Self.vector("tone")
        #expect(MeeshyGlassTone.plainCeiling == (tone["plainCeiling"] as? Double))
        #expect(MeeshyGlassTone.deepCeiling == (tone["deepCeiling"] as? Double))
        #expect(MeeshyGlassTone.hysteresis == (tone["hysteresis"] as? Double))
        let cases = try #require(tone["cases"] as? [[String: Any]])
        #expect(!cases.isEmpty)
        for entry in cases {
            let previous = (entry["previous"] as? String).flatMap(Self.tone(named:))
            let expected = try #require((entry["tone"] as? String).flatMap(Self.tone(named:)))
            let luminance = entry["luminance"] as? Double
            #expect(MeeshyGlassTone.resolve(luminance: luminance, previous: previous) == expected, "\(entry)")
        }
    }

    @Test("la recette suit les vecteurs de parité")
    func parity_recipe() throws {
        let recipe = try Self.vector("recipe")
        let drawn = try #require(recipe["drawn"] as? [[String: Any]])
        #expect(drawn.count == 6)
        for entry in drawn {
            let tone = try #require((entry["tone"] as? String).flatMap(Self.tone(named:)))
            let density: MeeshyGlassDensity = entry["density"] as? String == "dense" ? .dense : .regular
            let resolved = Self.recipe(tone: tone, density: density)
            #expect(resolved.fill == (entry["fill"] as? String == "light" ? .light : .dark), "\(entry)")
            #expect(resolved.fillOpacity == entry["fillOpacity"] as? Double, "\(entry)")
            #expect(resolved.rimLit == entry["rim"] as? Double, "\(entry)")
            #expect(resolved.rimShade == entry["rim"] as? Double, "\(entry)")
            #expect(resolved.topLight == recipe["topLight"] as? Double)
            #expect(resolved.shadowOpacity == recipe["shadowOpacity"] as? Double)
            #expect(resolved.shadowY == recipe["shadowOffsetY"] as? Double)
            #expect(resolved.blurRadius == recipe["blurRadius"] as? Double)
            #expect(resolved.saturation == recipe["saturation"] as? Double)
        }
        let pressed = Self.recipe(tone: .deep, interactive: true, pressed: true)
        #expect(pressed.scale == recipe["pressScale"] as? Double)
        let rest = Self.recipe(tone: .deep, interactive: true, pressed: false)
        #expect(pressed.topLight == rest.topLight * (recipe["pressSheenFactor"] as? Double ?? 0))
    }
}

// MARK: - Fabriques et lecture du disque

private extension MeeshyGlassToneTests {

    static func recipe(
        tone: MeeshyGlassTone,
        density: MeeshyGlassDensity = .regular,
        interactive: Bool = false,
        pressed: Bool = false,
        material: MeeshyGlassMaterial = .drawn,
        reduceMotion: Bool = false
    ) -> MeeshyGlassRecipe {
        MeeshyGlassRecipe.resolve(
            tone: tone, density: density, isTinted: false, isInteractive: interactive,
            isPressed: pressed, material: material, reduceMotion: reduceMotion
        )
    }

    static func tone(named name: String) -> MeeshyGlassTone? {
        MeeshyGlassTone(rawValue: name)
    }

    /// Contraste de l'encre blanche sur le fond de luminance `backdropLuminance`
    /// une fois recouvert du remplissage de la recette (composition en sRGB encodé).
    static func contrast(tone: MeeshyGlassTone, density: MeeshyGlassDensity, backdropLuminance: Double) -> Double {
        let recipe = Self.recipe(tone: tone, density: density)
        let backdrop = encoded(luminance: backdropLuminance)
        let inkLevel: Double = recipe.fill == .light ? 1 : 0
        let covered = backdrop * (1 - recipe.fillOpacity) + inkLevel * recipe.fillOpacity
        let luminance = CanvasChromeScheme.luminance(red: covered, green: covered, blue: covered)
        return CanvasChromeScheme.contrastRatio(1, luminance)
    }

    /// Le pire fond du ton : le plus clair qu'il accepte (`plain` s'arrête à son plafond).
    static func worstContrast(tone: MeeshyGlassTone, density: MeeshyGlassDensity) -> Double {
        let worst = tone == .plain ? MeeshyGlassTone.plainCeiling : 1
        return contrast(tone: tone, density: density, backdropLuminance: worst)
    }

    static func encoded(luminance: Double) -> Double {
        luminance <= 0.0031308 ? luminance * 12.92 : 1.055 * pow(luminance, 1 / 2.4) - 0.055
    }

    static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    static func vector(_ key: String) throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K01-MeeshyGlassTone.vectors.json")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return try #require((object as? [String: Any])?[key] as? [String: Any])
    }

    static var kitSourcesURL: URL {
        repositoryRoot.appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Kit")
    }

    static func kitSourceFiles() throws -> [String] {
        try FileManager.default.contentsOfDirectory(atPath: kitSourcesURL.path).filter { $0.hasSuffix(".swift") }
    }

    static func kitSource(_ file: String) throws -> String {
        try String(contentsOf: kitSourcesURL.appendingPathComponent(file), encoding: .utf8)
    }

    /// Le texte hors des blocs `#if DEBUG … #endif` (les blocs ne s'imbriquent pas dans le kit).
    static func outsideDebugBlocks(_ source: String) -> String {
        var kept: [Substring] = []
        var inDebug = false
        for line in source.split(separator: "\n", omittingEmptySubsequences: false) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed == "#if DEBUG" { inDebug = true; continue }
            if trimmed == "#endif" { inDebug = false; continue }
            if !inDebug { kept.append(line) }
        }
        return kept.joined(separator: "\n")
    }
}
