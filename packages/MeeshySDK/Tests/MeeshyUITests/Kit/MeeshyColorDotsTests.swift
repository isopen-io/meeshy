import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K07 — les pastilles de couleur, lues comme des VALEURS : la recette, la loi
/// de la courante, le nom dit, l'activation, l'égalité des cellules. Les mesures
/// viennent du fichier de vecteurs que lisent aussi Android et le web.
@Suite("MeeshyColorDots")
struct MeeshyColorDotsTests {

    // MARK: - Disposition

    @Test("les vecteurs de la planche : 8 + 6 pour A3, 8 + 8 + 1 pour S1, une ligne qui défile pour A13")
    func recipe_layout_followsTheVectors() throws {
        for row in try Self.rows("layout") {
            let recipe = MeeshyColorDotsRecipe.resolve(
                count: try #require(row["count"] as? Int),
                available: try #require(row["available"] as? Double),
                size: try Self.size(row["size"]),
                layout: try Self.layout(row["layout"])
            )
            #expect(recipe.cell == row["cell"] as? Double, "\(row)")
            #expect(recipe.rows == row["rows"] as? [Int], "\(row)")
            #expect(recipe.scrolls == row["scrolls"] as? Bool, "\(row)")
            #expect(Double(recipe.size.width) == row["width"] as? Double, "\(row)")
            #expect(Double(recipe.size.height) == row["height"] as? Double, "\(row)")
        }
    }

    @Test("sans largeur proposée, tout tient sur une ligne, sans défilement")
    func recipe_unboundedWidth_holdsOneRow() {
        let recipe = MeeshyColorDotsRecipe.resolve(count: 17, available: .infinity, size: .s28, layout: .wrap)
        #expect(recipe.rows == [17])
        #expect(!recipe.scrolls)
    }

    @Test("le premier disque s'aligne au bord du contenu, la cible déborde de (cellule − diamètre) / 2", arguments: MeeshyColorDotSize.allCases)
    func recipe_firstCell_overflowsByTheInset(size: MeeshyColorDotSize) {
        let recipe = MeeshyColorDotsRecipe.resolve(count: 17, available: 342, size: size, layout: .wrap)
        let inset = (size.cell - size.diameter) / 2
        #expect(recipe.inset == inset)
        #expect(recipe.cellOrigin(index: 0) == CGPoint(x: -inset, y: -inset))
        #expect(recipe.cellOrigin(index: recipe.perRow) == CGPoint(x: -inset, y: size.cell - inset))
        #expect(recipe.cellOrigin(index: 1) == CGPoint(x: size.cell - inset, y: -inset))
    }

    // MARK: - Tailles, cible, cercle

    @Test("diamètre de chaque taille et cible de 44 pt au moins, cellules jointives", arguments: MeeshyColorDotSize.allCases)
    func size_followsTheVectors(size: MeeshyColorDotSize) throws {
        let row = try #require(try Self.rows("sizes").first { $0["size"] as? String == size.rawValue })
        let tapTarget = try Self.object("tapTarget")
        #expect(size.diameter == row["diameter"] as? Double)
        #expect(size.cell >= Double(MeeshyControlSize.tapTarget))
        #expect(size.cell == tapTarget["ios"] as? Double)
        #expect(size.cell > size.diameter)
    }

    @Test("le cercle de la courante : 2 de vide puis 2 de trait, hors du disque", arguments: MeeshyColorDotSize.allCases)
    func ring_isOutsideTheDisc(size: MeeshyColorDotSize) throws {
        let ring = try Self.object("ring")
        let recipe = MeeshyColorDotsRecipe.resolve(count: 1, available: 342, size: size, layout: .wrap)
        let gap = try #require(ring["gap"] as? Double)
        let width = try #require(ring["width"] as? Double)
        #expect(recipe.ringGap == gap)
        #expect(recipe.ringWidth == width)
        #expect(recipe.ringDiameter == size.diameter + 2 * (gap + width))
        #expect(recipe.ringDiameter <= size.cell)
        #expect(MeeshyColorDotsRecipe.ringEnterScale == ring["enterScale"] as? Double)
    }

    @Test("le cercle n'existe que sur la pastille dont l'id est la sélection ; aucun pour nil ou un id inconnu")
    func selection_ringsOnlyTheCurrent() throws {
        for row in try Self.rows("selection") {
            let ids = try #require(row["ids"] as? [String])
            let selection = row["selection"] as? String
            let ringed = ids.filter { MeeshyColorDotsRecipe.isCurrent($0, selection: selection) }
            #expect(ringed == row["ringed"] as? [String], "\(row)")
        }
    }

    @Test("pré-cercle à 50 % sous le doigt, plein sur la courante, absent sinon ; jamais de voile ni d'échelle du disque")
    func ring_states_followTheVectors() throws {
        for row in try Self.rows("ringStates") {
            let selected = try #require(row["selected"] as? Bool)
            let pressed = try #require(row["pressed"] as? Bool)
            #expect(MeeshyColorDotsRecipe.ringOpacity(isSelected: selected, isPressed: pressed) == row["opacity"] as? Double, "\(row)")
            #expect(MeeshyColorDotsRecipe.ringScale(isSelected: selected, isPressed: pressed) == row["scale"] as? Double, "\(row)")
        }
    }

    @Test("filet 25 % au repos, 60 % au survol et sous « Augmenter le contraste » ; désactivé à 40 %")
    func opacities_followTheVectors() throws {
        let opacity = try Self.object("opacity")
        for row in try Self.rows("hairline") {
            let said = MeeshyColorDotsRecipe.hairline(
                isHovered: try #require(row["hovered"] as? Bool),
                increasedContrast: try #require(row["increasedContrast"] as? Bool)
            )
            #expect(said == row["opacity"] as? Double, "\(row)")
        }
        #expect(MeeshyColorDotsRecipe.pressedRingOpacity == opacity["pressedRing"] as? Double)
        #expect(MeeshyColorDotsRecipe.disabledOpacity == opacity["disabled"] as? Double)
        #expect(MeeshyColorDotsRecipe.fadeStart == (try Self.json())["fadeStart"] as? Double)
    }

    @MainActor
    @Test("sous « réduire les animations », aucun ressort ; sinon le ressort rapide du design system")
    func reduceMotion_hasNoSpring() {
        #expect(MeeshyColorDotsRecipe.ringAnimation(reduceMotion: true) == nil)
        #expect(MeeshyColorDotsRecipe.ringAnimation(reduceMotion: false) == MeeshyAnimation.springFast)
    }

    // MARK: - Encre et contraste

    @Test("l'encre suit le ton : celle du média, celle du thème sous le ton theme")
    func ink_followsTheTone() throws {
        for row in try Self.rows("ink") {
            let tone = try #require(MeeshyGlassTone(rawValue: try #require(row["tone"] as? String)))
            let recipe = MeeshyColorDotsRecipe.resolve(count: 1, available: 342, size: .s28, layout: .wrap, tone: tone)
            #expect(recipe.ink.rawValue == row["ink"] as? String, "\(row)")
        }
    }

    @Test("le cercle tient 3:1 contre son fond : blanc sur le panneau sombre, encre du thème en clair et en sombre", arguments: [false, true])
    func contrast_ringInk_holdsAgainstItsBackdrop(isDark: Bool) throws {
        let inkMin = try #require(try Self.object("contrast")["inkMin"] as? Double)
        let media = MeeshyColorDotsRecipe.resolve(count: 1, available: 342, size: .s28, layout: .wrap, tone: .deep)
        let theme = MeeshyColorDotsRecipe.resolve(count: 1, available: 342, size: .s28, layout: .wrap, tone: .theme)
        let panel = MeeshyColors.backgroundPrimary(isDark: true)
        #expect(MeeshyColorDotsRecipe.worstContrast(of: media.inkColor(isDark: isDark), on: [panel]) >= inkMin)
        let page = MeeshyColors.backgroundPrimary(isDark: isDark)
        #expect(MeeshyColorDotsRecipe.worstContrast(of: theme.inkColor(isDark: isDark), on: [page]) >= inkMin)
    }

    @Test("le glyphe prend la plus contrastée des deux encres, au moins 4:1, calculé depuis la recette")
    func contrast_glyph_picksTheBetterInk() throws {
        let glyphMin = try #require(try Self.object("contrast")["glyphMin"] as? Double)
        let fills: [MeeshyColorDotFill] = [
            .solid(MeeshyColors.onMedia), .solid(MeeshyColors.indigo950), .solid(MeeshyColors.brandPrimary),
            .gradient([MeeshyColors.brandPrimary, MeeshyColors.indigo950]),
        ]
        for fill in fills {
            let stops: [Color]
            switch fill {
            case .solid(let color): stops = [color]
            case .gradient(let colors): stops = colors
            case .hollow: stops = []
            }
            let ink = MeeshyColorDotsRecipe.glyphInk(on: fill, groupInk: MeeshyColors.onMedia)
            #expect(MeeshyColorDotsRecipe.worstContrast(of: ink, on: stops) >= glyphMin, "\(fill)")
        }
        #expect(MeeshyColorDotsRecipe.glyphInk(on: .solid(MeeshyColors.onMedia), groupInk: MeeshyColors.onMedia) == MeeshyColors.indigo950)
        #expect(MeeshyColorDotsRecipe.glyphInk(on: .hollow, groupInk: MeeshyColors.warning) == MeeshyColors.warning)
    }

    // MARK: - Nom dit

    @MainActor
    @Test("nom : celui de l'hôte, sinon la position dans la langue du lecteur ; jamais le code")
    func name_followsTheVectors() throws {
        for row in try Self.rows("names") {
            let code = try #require(row["locale"] as? String)
            let dot = MeeshyColorDot(id: "#FF2E63", fill: .solid(MeeshyColors.tileRose), name: row["name"] as? String)
            let said = MeeshyColorDotsWords.spokenName(
                of: dot, index: try #require(row["index"] as? Int), total: try #require(row["total"] as? Int),
                bundle: try Self.lproj(code), locale: Locale(identifier: code)
            )
            #expect(said == row["said"] as? String, "\(row)")
            #expect(!said.contains("#"))
        }
    }

    @MainActor
    @Test("la position s'écrit dans les chiffres du lecteur, sans placeholder brut")
    func name_position_usesTheReadersDigits() throws {
        let locale = Locale(identifier: "ar_SA")
        let said = MeeshyColorDotsWords.position(index: 2, total: 17, bundle: try Self.lproj("ar"), locale: locale)
        #expect(said.contains(IntegerFormatStyle<Int>(locale: locale).format(3)), "obtenu « \(said) »")
        #expect(said.contains(IntegerFormatStyle<Int>(locale: locale).format(17)), "obtenu « \(said) »")
        for code in ["fr", "en", "ar"] {
            let rendered = MeeshyColorDotsWords.position(index: 2, total: 17, bundle: try Self.lproj(code),
                                                         locale: Locale(identifier: code))
            for specifier in ["%@", "%lld", "%1$", "%2$"] {
                #expect(!rendered.contains(specifier), "« \(specifier) » brut dans « \(rendered) » (\(code))")
            }
        }
    }

    // MARK: - Activation

    @MainActor
    @Test("un toucher : un seul light par le site unique, puis onSelect avec l'id ; none : aucun ; désactivé : rien")
    func trigger_followsTheHapticLaw() {
        var events: [String] = []
        let play: @MainActor (MeeshyColorDotHaptic) -> Void = { events.append("haptic:\($0.rawValue)") }
        MeeshyGlassButtonTrigger.perform(isEnabled: true, haptic: .light, play: play) { events.append("select:rose") }
        #expect(events == ["haptic:light", "select:rose"])
        events = []
        MeeshyGlassButtonTrigger.perform(isEnabled: true, haptic: .none, play: play) { events.append("select:rose") }
        #expect(events == ["select:rose"])
        events = []
        MeeshyGlassButtonTrigger.perform(isEnabled: false, haptic: .light, play: play) { events.append("select:rose") }
        #expect(events.isEmpty)
    }

    @Test("la pastille passe par le déclencheur partagé, sans retenir la courante : retoucher la courante rappelle")
    func source_cellGoesThroughTheTrigger() throws {
        let code = try Self.code("MeeshyColorDots.swift")
        #expect(code.contains("MeeshyGlassButtonTrigger.perform(isEnabled: isEnabled, haptic: haptic) { onSelect(dot.id) }"))
        #expect(!code.contains("guard !isSelected"))
        #expect(!code.contains("HapticFeedback."))
    }

    // MARK: - Performance : égalité par valeurs

    @MainActor
    @Test("deux cellules aux mêmes valeurs sont égales, fermetures différentes ; l'état, l'encre ou l'haptique les distinguent")
    func equality_comparesValuesNotClosures() {
        let dot = MeeshyColorDot(id: "rose", fill: .solid(MeeshyColors.tileRose), name: "Rose")
        func cell(selected: Bool = false, ink: Color = MeeshyColors.onMedia, haptic: MeeshyColorDotHaptic = .light,
                  onSelect: @escaping (String) -> Void = { _ in }) -> MeeshyColorDotCell {
            MeeshyColorDotCell(dot: dot, name: "Rose", isSelected: selected, isPressedPreview: false, size: .s28,
                               ink: ink, reduceMotion: false, haptic: haptic, onSelect: onSelect)
        }
        #expect(cell(onSelect: { _ in _ = 1 }) == cell(onSelect: { _ in _ = 2 }))
        #expect(cell() != cell(selected: true))
        #expect(cell() != cell(ink: MeeshyColors.indigo950))
        #expect(cell() != cell(haptic: .none))
    }

    // MARK: - Source

    @Test("aucun verre, aucune légende, aucune couleur en dur dans les fichiers de K07")
    func source_hasNoGlassNoCaptionNoLiteralColor() throws {
        let files = ["MeeshyColorDots.swift", "MeeshyColorDotsRecipe.swift", "Catalog/MeeshyKitCatalog+K07.swift"]
        let forbidden = [
            "caption", "Color(hex:", "Color(red:", "Color(white:", "Color.white", "Color.black", "Color.gray",
            "#FF", "0x", "glassEffect", "adaptiveGlass", "adaptiveLiquidGlass", ".meeshyGlass(", "UIBlurEffect",
            "Material", ".blur(", ".shadow(",
        ]
        for file in files {
            let code = try Self.code(file)
            for word in forbidden {
                #expect(!code.contains(word), "\(file) contient \(word)")
            }
        }
    }

    @Test("seuls l'opacité et l'échelle du cercle s'animent ; jamais la mise en page")
    func source_animatesOnlyTheRing() throws {
        let code = try Self.code("MeeshyColorDots.swift")
        #expect(code.components(separatedBy: ".animation(").count == 2)
        #expect(code.components(separatedBy: "scaleEffect").count == 2)
        #expect(!code.contains("GeometryReader"))
        #expect(!code.contains("@State private var width"))
    }

    // MARK: - Aides

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func json() throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K07-MeeshyColorDots.vectors.json")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return try #require(object as? [String: Any])
    }

    private static func rows(_ key: String) throws -> [[String: Any]] {
        try #require(try json()[key] as? [[String: Any]])
    }

    private static func object(_ key: String) throws -> [String: Any] {
        try #require(try json()[key] as? [String: Any])
    }

    private static func size(_ name: Any?) throws -> MeeshyColorDotSize {
        try #require(MeeshyColorDotSize(rawValue: try #require(name as? String)))
    }

    private static func layout(_ name: Any?) throws -> MeeshyColorDotsLayout {
        try #require(MeeshyColorDotsLayout(rawValue: try #require(name as? String)))
    }

    /// La table d'une langue : `bundle` choisit la table, `locale` ses règles.
    @MainActor
    private static func lproj(_ code: String) throws -> Bundle {
        let language = Locale(identifier: code).language.languageCode?.identifier ?? code
        let path = try #require(Bundle.module.path(forResource: language, ofType: "lproj"), "\(language).lproj absent")
        return try #require(Bundle(path: path))
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
