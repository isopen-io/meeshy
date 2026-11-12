import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K10 — la pilule de verre du bas, lue comme des LOIS : l'ajustement des
/// boutons (48, 44, 40, puis défilement), la largeur, la présence (retrait par
/// le bord, grâce du fondu), la marge du dock, puis les gardes de source (un
/// seul verre, aucun geste, aucun état observé, aucune couleur en dur). Les
/// mesures viennent du fichier de vecteurs que lisent aussi Android et le web.
@Suite("MeeshyGlassPill")
struct MeeshyGlassPillTests {

    // MARK: - Loi d'ajustement

    @Test("chaque vecteur (largeur, nombre, action principale) rend la taille, le défilement et la largeur attendus")
    func fit_followsTheVectors() throws {
        for row in try Self.rows("fit") {
            let host = CGFloat(try Self.number(row["hostWidth"]))
            let fit = MeeshyGlassPillFit.resolve(
                availableWidth: MeeshyGlassPillFit.place(forHostWidth: host),
                buttonCount: Int(try Self.number(row["buttonCount"])),
                primaryWidth: Self.optionalNumber(row["primaryWidth"]).map { CGFloat($0) }
            )
            #expect(fit.size.diameter == (try Self.number(row["size"])), "\(row)")
            #expect(fit.scrolls == row["scrolls"] as? Bool, "\(row)")
            #expect(fit.width == CGFloat(try Self.number(row["width"])), "\(row)")
        }
    }

    @Test("sept outils : 44 à 390, 40 à 360, 40 qui défile à 320")
    func fit_sevenTools() {
        func fit(_ host: CGFloat) -> MeeshyGlassPillFit.Result {
            MeeshyGlassPillFit.resolve(availableWidth: MeeshyGlassPillFit.place(forHostWidth: host), buttonCount: 7)
        }
        #expect(fit(390).size == .s44 && !fit(390).scrolls)
        #expect(fit(360).size == .s40 && !fit(360).scrolls)
        #expect(fit(320).size == .s40 && fit(320).scrolls)
    }

    @Test("une place négative ou non finie ne casse rien : 40, qui défile")
    func fit_degenerateInputs() {
        #expect(MeeshyGlassPillFit.resolve(availableWidth: -10, buttonCount: 3).scrolls)
        #expect(MeeshyGlassPillFit.resolve(availableWidth: .nan, buttonCount: 3).size == .s40)
        #expect(MeeshyGlassPillFit.resolve(availableWidth: 300, buttonCount: -2).width == 0)
    }

    // MARK: - Largeur

    @Test("hug au contenu, spread sous son plafond, above au plafond de 560 : tous sous la place")
    func width_followsTheVectors() throws {
        for row in try Self.rows("width") {
            let layout: MeeshyGlassPillLayout = (row["layout"] as? String) == "spread" ? .spread() : .hug
            let width = MeeshyGlassPillRecipe.width(
                layout: layout, hasAbove: row["hasAbove"] as? Bool ?? false,
                place: CGFloat(try Self.number(row["place"])), naturalWidth: CGFloat(try Self.number(row["natural"])),
                expandedMaxWidth: MeeshyGlassPillRecipe.expandedMaxWidth
            )
            #expect(width == CGFloat(try Self.number(row["width"])), "\(row)")
        }
    }

    @Test("la disposition répartie vaut 440 par défaut, et un plafond donné est respecté")
    func layout_spreadDefault() {
        #expect(MeeshyGlassPillLayout.spread() == .spread(maxWidth: 440))
        #expect(MeeshyGlassPillRecipe.width(layout: .spread(maxWidth: 300), hasAbove: false, place: 796, naturalWidth: 100, expandedMaxWidth: 560) == 300)
    }

    // MARK: - Loi de présence

    @Test("durées : 250 ms, 150 ms sous « réduire les animations »")
    func presence_duration() throws {
        for row in try Self.object("presence")["duration"] as? [[String: Any]] ?? [] {
            #expect(MeeshyGlassPillPresenceRule.duration(reduceMotion: row["reduceMotion"] as? Bool ?? false) == (try Self.number(row["seconds"])), "\(row)")
        }
    }

    @Test("elle sort par son bord quand elle est rangée, sauf sous « réduire les animations »")
    func presence_leavesByItsEdge() throws {
        for row in try Self.object("presence")["leavesByItsEdge"] as? [[String: Any]] ?? [] {
            let presence = try #require(MeeshyGlassPillPresence(rawValue: row["presence"] as? String ?? ""))
            let reduce = row["reduceMotion"] as? Bool ?? false
            #expect(MeeshyGlassPillPresenceRule.leavesByItsEdge(presence: presence, reduceMotion: reduce) == row["leaves"] as? Bool, "\(row)")
        }
    }

    @Test("la distance du retrait : toute la hauteur mesurée plus la marge ; non mesurée ou non finie, zéro")
    func presence_travel() throws {
        for row in try Self.object("presence")["travel"] as? [[String: Any]] ?? [] {
            let extent: CGFloat
            switch row["extent"] {
            case let text as String where text == "nan": extent = .nan
            case let text as String where text == "infinity": extent = .infinity
            default: extent = CGFloat(try Self.number(row["extent"]))
            }
            #expect(MeeshyGlassPillPresenceRule.travel(extent: extent, margin: CGFloat(try Self.number(row["margin"]))) == CGFloat(try Self.number(row["travel"])), "\(row)")
        }
    }

    @Test("elle répond jusqu'au terme du fondu, plus après ; jamais coupée tant qu'elle n'est pas rangée")
    func presence_acceptsTouches() throws {
        for row in try Self.object("presence")["acceptsTouches"] as? [[String: Any]] ?? [] {
            let presence = try #require(MeeshyGlassPillPresence(rawValue: row["presence"] as? String ?? ""))
            let accepts = MeeshyGlassPillPresenceRule.acceptsTouches(
                presence: presence,
                stowedFor: Self.optionalNumber(row["stowedFor"]) ?? 0,
                reduceMotion: row["reduceMotion"] as? Bool ?? false
            )
            #expect(accepts == row["accepts"] as? Bool, "\(row)")
        }
    }

    @Test("la présence dit si la rangée est montrée et si la pilule est rangée")
    func presence_flags() {
        #expect(MeeshyGlassPillPresence.shown.showsRow && !MeeshyGlassPillPresence.shown.isStowed)
        #expect(!MeeshyGlassPillPresence.withoutRow.showsRow && !MeeshyGlassPillPresence.withoutRow.isStowed)
        #expect(MeeshyGlassPillPresence.stowed.isStowed)
    }

    // MARK: - La rangée

    @Test("la largeur d'une rangée serrée : les boutons et leurs écarts")
    func row_width_followsTheVectors() throws {
        for row in try Self.rows("rowWidth") {
            let widths = (row["widths"] as? [NSNumber] ?? []).map { CGFloat($0.doubleValue) }
            #expect(MeeshyGlassPillRecipe.rowWidth(widths: widths, gap: CGFloat(try Self.number(row["gap"]))) == CGFloat(try Self.number(row["width"])), "\(row)")
        }
    }

    @Test("serrée ils se suivent ; répartie ils sont centrés dans des cases égales, et se suivent si la place manque")
    func row_offsets_followTheVectors() throws {
        for row in try Self.rows("offsets") {
            let widths = (row["widths"] as? [NSNumber] ?? []).map { CGFloat($0.doubleValue) }
            let expected = (row["offsets"] as? [NSNumber] ?? []).map { CGFloat($0.doubleValue) }
            let offsets = MeeshyGlassPillRecipe.rowOffsets(
                widths: widths, gap: CGFloat(try Self.number(row["gap"])),
                available: CGFloat(try Self.number(row["available"])), spreads: row["spreads"] as? Bool ?? false
            )
            #expect(offsets == expected, "\(row)")
        }
    }

    // MARK: - Recette et dock

    @Test("les mesures de la recette sont celles des vecteurs")
    func recipe_followsTheVectors() throws {
        let recipe = try Self.object("recipe")
        #expect(MeeshyGlassPillRecipe.restingHeight == CGFloat(try Self.number(recipe["restingHeight"])))
        #expect(MeeshyGlassPillRecipe.radius == CGFloat(try Self.number(recipe["radius"])))
        #expect(MeeshyGlassPillRecipe.spreadMaxWidth == CGFloat(try Self.number(recipe["spreadMaxWidth"])))
        #expect(MeeshyGlassPillRecipe.expandedMaxWidth == CGFloat(try Self.number(recipe["expandedMaxWidth"])))
        #expect(MeeshyGlassPillRecipe.overflow == CGFloat(try Self.number(recipe["overflow"])))
        #expect(MeeshyGlassPillRecipe.dividerOpacity == (try Self.number(recipe["dividerOpacity"])))
        #expect(MeeshyGlassPillRecipe.dividerHeight == CGFloat(try Self.number(recipe["dividerHeight"])))
        #expect(MeeshyGlassPillRecipe.stowDuration == (try Self.number(recipe["stowMs"])) / 1000)
        #expect(MeeshyGlassPillRecipe.reducedStowDuration == (try Self.number(recipe["reducedStowMs"])) / 1000)
        #expect(MeeshyGlassPillRecipe.reducedSizeDuration == (try Self.number(recipe["reducedSizeMs"])) / 1000)
        #expect(MeeshyGlassPillRecipe.springResponse == (try Self.number(recipe["springResponse"])))
        #expect(MeeshyGlassPillRecipe.springDamping == (try Self.number(recipe["springDamping"])))
        #expect(MeeshyGlassPillRecipe.defaultBottomGap == CGFloat(try Self.number(recipe["bottomGap"])))
        #expect(MeeshyGlassPillRecipe.defaultMinimumBottom == CGFloat(try Self.number(recipe["minimumBottom"])))
        #expect(MeeshyGlassPillRecipe.defaultSideMargin == CGFloat(try Self.number(recipe["sideMargin"])))
        #expect(MeeshyGlassPillRecipe.edgeFade == CGFloat(try Self.number(recipe["edgeFade"])))
        #expect(MeeshyGlassPillRecipe.gap == MeeshySpacing.xsPlus)
        #expect(MeeshyGlassPillRecipe.inset == MeeshySpacing.sm)
        #expect(MeeshyGlassPillRecipe.spreadVerticalInset == MeeshySpacing.smPlus)
        #expect(MeeshyGlassPillRecipe.dividerInset == MeeshySpacing.lg)
        #expect(MeeshyGlassPillRecipe.sizes == [.s48, .s44, .s40])
    }

    @Test("la marge basse du dock : la zone sûre plus 12, jamais sous 28")
    func dock_bottomMargin() throws {
        for row in try Self.rows("dock") {
            let margin = MeeshyGlassPillRecipe.bottomMargin(
                safeBottom: CGFloat(try Self.number(row["safeBottom"])),
                bottomGap: MeeshyGlassPillRecipe.defaultBottomGap,
                minimumBottom: MeeshyGlassPillRecipe.defaultMinimumBottom
            )
            #expect(margin == CGFloat(try Self.number(row["bottom"])), "\(row)")
        }
    }

    @Test("la pilule sans bouton, sans action principale ni dessus n'a aucun verre")
    func empty_hasNoContent() {
        #expect(!MeeshyGlassPill<EmptyView, EmptyView, EmptyView>.hasContent)
        #expect(MeeshyGlassPill<Text, EmptyView, EmptyView>.hasContent)
        #expect(MeeshyGlassPill<EmptyView, Text, EmptyView>.hasContent)
        #expect(MeeshyGlassPill<EmptyView, EmptyView, Text>.hasContent)
    }

    @Test("loi 13 : un verre seulement pour ce qui se porte — une rangée mesurée vide ou repliée n'en demande pas")
    func glass_onlyForWhatIsCarried() {
        func carries(buttons: Bool = false, primary: Bool = false, above: Bool = false,
                     showsRow: Bool = true, empty: Bool = false) -> Bool {
            MeeshyGlassPillRecipe.carriesGlass(hasButtons: buttons, hasPrimary: primary, hasAbove: above,
                                               showsRow: showsRow, rowMeasuresEmpty: empty)
        }
        #expect(!carries())
        #expect(carries(buttons: true))
        #expect(!carries(buttons: true, empty: true), "un ForEach sans élément : aucune bande vide")
        #expect(!carries(buttons: true, showsRow: false), "rangée repliée, sans dessus : rien à porter")
        #expect(carries(buttons: true, primary: true, empty: true), "l'action principale porte seule le verre")
        #expect(carries(buttons: true, above: true, showsRow: false), "sans rangée, le dessus garde le verre")
        #expect(!carries(primary: true, showsRow: false), "l'action principale vit dans la rangée : repliée, elle ne porte plus le verre")
    }

    // MARK: - Source

    @Test("la rangée se pose depuis son DÉBUT : SwiftUI la retourne en RTL, un second retournement la remettait à l'endroit")
    func source_rowIsNotFlippedByHand() throws {
        let code = try Self.code("MeeshyGlassPill.swift")
        #expect(!code.contains("layoutDirection"), "la pilule ne lit pas la direction : la disposition est retournée par SwiftUI")
        #expect(!code.contains("bounds.maxX"), "aucune position comptée depuis la droite")
        #expect(code.contains("x: bounds.minX + offsets[index]"))
    }

    @Test("la pilule mesure sa rangée et passe la loi 13 au morphisme, qui ne pose le verre que si elle porte quelque chose")
    func source_emptyRowCarriesNoGlass() throws {
        let pill = try Self.code("MeeshyGlassPill.swift")
        let morph = try Self.code("MeeshyGlassPillMorph.swift")
        #expect(pill.contains("MeeshyGlassPillRecipe.carriesGlass("))
        #expect(pill.contains("drawsGlass: drawsGlass"))
        #expect(pill.contains(".accessibilityHidden(!drawsGlass)"))
        #expect(morph.contains("if drawsGlass {"))
    }

    @Test("un seul verre, demandé à K01 par le morphisme, pour la pilule et tout ce qu'elle porte")
    func source_oneGlass() throws {
        let pill = try Self.code("MeeshyGlassPill.swift")
        let morph = try Self.code("MeeshyGlassPillMorph.swift")
        #expect(pill.components(separatedBy: ".meeshyGlass(").count == 1)
        #expect(morph.components(separatedBy: ".meeshyGlass(").count == 2)
        #expect(morph.contains(".environment(\\.meeshyGlassIsNested, true)"))
        #expect(pill.contains("MeeshyGlassGroup("))
        #expect(pill.contains("density: Self.hasAbove ? .dense : .regular"))
    }

    @Test("la loi d'ajustement : quatre candidats dans l'ordre des tailles de la recette, le dernier défile")
    func source_fitIsTheLaw() throws {
        let code = try Self.code("MeeshyGlassPill.swift")
        #expect(code.contains("ViewThatFits(in: .horizontal)"))
        #expect(code.contains("let sizes = MeeshyGlassPillRecipe.sizes"))
        #expect(code.contains("rowBlock(size: sizes[0], scrolls: false)"))
        #expect(code.contains("rowBlock(size: sizes[1], scrolls: false)"))
        #expect(code.contains("rowBlock(size: sizes[2], scrolls: false)"))
        #expect(code.contains("rowBlock(size: sizes[2], scrolls: true)"))
        #expect(MeeshyGlassPillRecipe.sizes.map(\.diameter) == [48, 44, 40])
    }

    @Test("nom, groupe nommé, ordre de lecture : le dessus, la rangée, l'action principale ; rangée, absente du lecteur d'écran")
    func source_accessibility() throws {
        let code = try Self.code("MeeshyGlassPill.swift")
        #expect(code.contains(".accessibilityElement(children: .contain)"))
        #expect(code.contains(".accessibilityLabel(label)"))
        #expect(code.contains("assert(!label.isEmpty"))
        let stow = try Self.code("MeeshyGlassPillStow.swift")
        #expect(stow.contains(".accessibilityHidden("))
        let aboveAt = try #require(code.range(of: "            above\n"))
        let rowAt = try #require(code.range(of: "rowSection\n"))
        let primaryAt = try #require(code.range(of: "primarySlot\n"))
        #expect(aboveAt.lowerBound < rowAt.lowerBound)
        #expect(rowAt.lowerBound < primaryAt.lowerBound)
    }

    @Test("aucun geste à elle, aucune haptique, aucun magasin observé, aucune lecture du ton de l'hôte")
    func source_takesNoGestureNorState() throws {
        let code = try Self.code("MeeshyGlassPill.swift")
        for word in ["Button(", "onTapGesture", ".gesture(", "HapticFeedback", "sensoryFeedback",
                     "@ObservedObject", "@StateObject", "@EnvironmentObject", "@Environment(\\.meeshyGlassTone)"] {
            #expect(!code.contains(word), "MeeshyGlassPill.swift contient \(word)")
        }
    }

    @Test("rangée, le retrait translate et fond ; jamais le flou, l'ombre ni la mise en page")
    func source_stowAnimatesOnlyOffsetAndOpacity() throws {
        let code = try Self.code("MeeshyGlassPillStow.swift")
        #expect(code.contains(".offset(y:"))
        #expect(code.contains(".opacity("))
        #expect(code.contains("MeeshyGlassPillPresenceRule.acceptsTouches("))
        #expect(code.contains("onRevive"))
        for word in [".blur(", ".shadow(", "scaleEffect", "GeometryReader"] {
            #expect(!code.contains(word), "MeeshyGlassPillStow.swift contient \(word)")
        }
    }

    @Test("aucun verre écrit à la main, aucune couleur ni rayon en dur, aucune légende dans les fichiers de K10")
    func source_hasNoOwnGlassNoLiteral() throws {
        let files = ["MeeshyGlassPill.swift", "MeeshyGlassPillRecipe.swift", "MeeshyGlassPillFit.swift",
                     "MeeshyGlassPillPresenceRule.swift", "MeeshyGlassPillDock.swift", "MeeshyGlassPillStow.swift",
                     "MeeshyGlassPillMorph.swift",
                     "Catalog/MeeshyKitCatalog+K10.swift"]
        let forbidden = [
            "caption", "Color(hex:", "Color(red:", "Color(white:", "Color.white", "Color.black", "Color.gray",
            "Color.red", ".secondary", "#FF", "0x", "glassEffect", "adaptiveGlass", "adaptiveLiquidGlass",
            "UIBlurEffect", "Material", "cornerRadius: 3", "cornerRadius: 2",
        ]
        for file in files {
            let code = try Self.code(file)
            for word in forbidden {
                #expect(!code.contains(word), "\(file) contient \(word)")
            }
        }
    }

    @Test("le catalogue porte les douze états de la fiche, puis la bascule « ranger »")
    func catalog_states() throws {
        let entry = try #require(MeeshyKitCatalog.listedEntry(matching: "K10"))
        #expect(entry.states.map(\.id) == [
            "repos-vide", "repos", "ouvert", "clair", "en-cours", "objet", "texte",
            "retouche-video", "agrandie", "sans-rangee", "repartie", "defilement", "retrait",
        ])
    }

    // MARK: - Aides

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func json() throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K10-MeeshyGlassPill.vectors.json")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return try #require(object as? [String: Any])
    }

    private static func rows(_ key: String) throws -> [[String: Any]] {
        try #require(try json()[key] as? [[String: Any]])
    }

    private static func object(_ key: String) throws -> [String: Any] {
        try #require(try json()[key] as? [String: Any])
    }

    private static func number(_ value: Any?) throws -> Double {
        try #require((value as? NSNumber)?.doubleValue, "nombre attendu : \(String(describing: value))")
    }

    private static func optionalNumber(_ value: Any?) -> Double? {
        (value as? NSNumber)?.doubleValue
    }

    private static func size(_ diameter: Double) -> MeeshyGlassButtonSize? {
        MeeshyGlassButtonSize.allCases.first { $0.diameter == diameter }
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
