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
            let host = try Self.number(row["hostWidth"])
            let fit = MeeshyGlassPillFit.resolve(
                availableWidth: MeeshyGlassPillFit.place(forHostWidth: host),
                buttonCount: Int(try Self.number(row["buttonCount"])),
                primaryWidth: Self.optionalNumber(row["primaryWidth"])
            )
            #expect(fit.size.diameter == (try Self.number(row["size"])), "\(row)")
            #expect(fit.scrolls == row["scrolls"] as? Bool, "\(row)")
            #expect(fit.width == (try Self.number(row["width"])), "\(row)")
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

    @Test("le nombre de boutons se déduit de la largeur mesurée de la rangée à la taille courante")
    func fit_inferredButtonCount_followsTheVectors() throws {
        for row in try Self.rows("inference") {
            let size = try #require(Self.size(try Self.number(row["size"])))
            let count = MeeshyGlassPillFit.inferredButtonCount(rowWidth: try Self.number(row["rowWidth"]), size: size)
            #expect(count == Int(try Self.number(row["buttonCount"])), "\(row)")
        }
        #expect(MeeshyGlassPillFit.inferredButtonCount(rowWidth: 0, size: .s48) == 0)
        #expect(MeeshyGlassPillFit.inferredButtonCount(rowWidth: .nan, size: .s48) == 0)
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
                place: try Self.number(row["place"]), naturalWidth: try Self.number(row["natural"]),
                expandedMaxWidth: MeeshyGlassPillRecipe.expandedMaxWidth
            )
            #expect(width == (try Self.number(row["width"])), "\(row)")
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

    // MARK: - Recette et dock

    @Test("les mesures de la recette sont celles des vecteurs")
    func recipe_followsTheVectors() throws {
        let recipe = try Self.object("recipe")
        #expect(MeeshyGlassPillRecipe.restingHeight == (try Self.number(recipe["restingHeight"])))
        #expect(MeeshyGlassPillRecipe.radius == (try Self.number(recipe["radius"])))
        #expect(MeeshyGlassPillRecipe.spreadMaxWidth == (try Self.number(recipe["spreadMaxWidth"])))
        #expect(MeeshyGlassPillRecipe.expandedMaxWidth == (try Self.number(recipe["expandedMaxWidth"])))
        #expect(MeeshyGlassPillRecipe.overflow == (try Self.number(recipe["overflow"])))
        #expect(MeeshyGlassPillRecipe.dividerOpacity == (try Self.number(recipe["dividerOpacity"])))
        #expect(MeeshyGlassPillRecipe.dividerHeight == (try Self.number(recipe["dividerHeight"])))
        #expect(MeeshyGlassPillRecipe.stowDuration == (try Self.number(recipe["stowMs"])) / 1000)
        #expect(MeeshyGlassPillRecipe.reducedStowDuration == (try Self.number(recipe["reducedStowMs"])) / 1000)
        #expect(MeeshyGlassPillRecipe.reducedSizeDuration == (try Self.number(recipe["reducedSizeMs"])) / 1000)
        #expect(MeeshyGlassPillRecipe.springResponse == (try Self.number(recipe["springResponse"])))
        #expect(MeeshyGlassPillRecipe.springDamping == (try Self.number(recipe["springDamping"])))
        #expect(MeeshyGlassPillRecipe.defaultBottomGap == (try Self.number(recipe["bottomGap"])))
        #expect(MeeshyGlassPillRecipe.defaultMinimumBottom == (try Self.number(recipe["minimumBottom"])))
        #expect(MeeshyGlassPillRecipe.defaultSideMargin == (try Self.number(recipe["sideMargin"])))
        #expect(MeeshyGlassPillRecipe.edgeFade == (try Self.number(recipe["edgeFade"])))
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

    // MARK: - Source

    @Test("un seul verre, demandé à K01, pour la pilule et tout ce qu'elle porte")
    func source_oneGlass() throws {
        let code = try Self.code("MeeshyGlassPill.swift")
        #expect(code.components(separatedBy: ".meeshyGlass(").count == 2)
        #expect(code.contains("MeeshyGlassGroup("))
        #expect(code.contains("MeeshyGlassPillFit.resolve("))
        #expect(code.contains("density: hasAbove ? .dense : .regular"))
    }

    @Test("nom, groupe nommé, ordre de lecture : le dessus, la rangée, l'action principale ; rangée, absente du lecteur d'écran")
    func source_accessibility() throws {
        let code = try Self.code("MeeshyGlassPill.swift")
        #expect(code.contains(".accessibilityElement(children: .contain)"))
        #expect(code.contains(".accessibilityLabel(label)"))
        #expect(code.contains("assert(!label.isEmpty"))
        let stow = try Self.code("MeeshyGlassPillStow.swift")
        #expect(stow.contains(".accessibilityHidden("))
        let aboveAt = try #require(code.range(of: "above\n"))
        let rowAt = try #require(code.range(of: "buttonRow("))
        let primaryAt = try #require(code.range(of: "primarySlot"))
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

    @Test("le catalogue porte les douze états de la fiche, dans l'ordre")
    func catalog_states() throws {
        let entry = try #require(MeeshyKitCatalog.listedEntry(matching: "K10"))
        #expect(entry.states.map(\.id) == [
            "repos-vide", "repos", "ouvert", "clair", "en-cours", "objet", "texte",
            "retouche-video", "agrandie", "sans-rangee", "repartie", "defilement",
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
