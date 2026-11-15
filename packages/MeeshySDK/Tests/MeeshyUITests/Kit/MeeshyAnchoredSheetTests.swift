import Testing
import Foundation
import SwiftUI
import UIKit
@testable import MeeshyUI

/// K15 — la feuille ancrée, lue comme des VALEURS : la hauteur et son plafond, la loi du
/// glissé, les crans, la place publiée, le mouvement, le contraste de l'encre. Les mesures
/// viennent du fichier de vecteurs que lisent aussi Android et le web.
@Suite("MeeshyAnchoredSheet")
struct MeeshyAnchoredSheetTests {

    // MARK: - Hauteur

    @Test("les fractions de la planche : 0,30, 0,50 et 0,62, et 120 pt gardés au-dessus")
    func fractions_followTheVectors() throws {
        let row = try Self.object("fractions")
        #expect(Double(MeeshyAnchoredSheetMetrics.compactFraction) == row["compact"] as? Double)
        #expect(Double(MeeshyAnchoredSheetMetrics.regularFraction) == row["regular"] as? Double)
        #expect(Double(MeeshyAnchoredSheetMetrics.maximumFraction) == row["tall"] as? Double)
        #expect(Double(MeeshyAnchoredSheetMetrics.reservedAbove) == row["reservedAbove"] as? Double)
    }

    @Test("le plafond : la fraction maximale de la place, 120 pt gardés au-dessus, jamais négatif")
    func ceiling_followsTheVectors() throws {
        for row in try Self.rows("ceiling") {
            let ceiling = MeeshyAnchoredSheetMetrics.ceiling(
                available: try Self.cg(row["available"]), maximumFraction: try Self.cg(row["maximumFraction"])
            )
            #expect(Double(ceiling) == row["ceiling"] as? Double, "\(row)")
        }
    }

    @Test("la hauteur au repos : le contenu épouse puis plafonne, les fractions et les crans suivent les vecteurs")
    func height_followsTheVectors() throws {
        for row in try Self.rows("height") {
            let rest = MeeshyAnchoredSheetMetrics.height(
                try Self.height(row), content: try Self.cg(row["content"]), available: try Self.cg(row["available"])
            )
            #expect(Double(rest) == row["rest"] as? Double, "\(row)")
        }
    }

    @Test("des crans désordonnés sont ordonnés et plafonnés")
    func detents_areOrderedAndCapped() throws {
        for row in try Self.rows("detents") {
            let fractions = try #require(row["fractions"] as? [Double]).map { CGFloat($0) }
            let rests = MeeshyAnchoredSheetMetrics.detentHeights(fractions, available: try Self.cg(row["available"]))
            #expect(rests.map { Double($0) } == row["rests"] as? [Double], "\(row)")
        }
    }

    @Test("jamais plus que la fenêtre, quelle que soit la hauteur demandée", arguments: [0, 40, 200, 480, 852] as [CGFloat])
    func height_neverExceedsTheWindow(available: CGFloat) {
        let heights: [MeeshyAnchoredSheetHeight] = [.compact, .regular, .tall, .fraction(2), .content,
                                                    .detents([0.2, 1.5], initial: 1)]
        for height in heights {
            let rest = MeeshyAnchoredSheetMetrics.height(height, content: 10_000, available: available)
            #expect(rest >= 0)
            #expect(rest <= available)
            #expect(rest <= available * MeeshyAnchoredSheetMetrics.maximumFraction + 0.0001)
            #expect(available - rest >= min(available, MeeshyAnchoredSheetMetrics.reservedAbove) - 0.0001)
        }
    }

    @Test("une place non finie ne produit aucune feuille")
    func height_nonFiniteAvailable_isZero() {
        #expect(MeeshyAnchoredSheetMetrics.height(.regular, content: 100, available: .nan) == 0)
        #expect(MeeshyAnchoredSheetMetrics.height(.content, content: 100, available: .infinity) == 0)
        #expect(MeeshyAnchoredSheetMetrics.height(.content, content: .nan, available: 800) == 496)
    }

    // MARK: - Glissé

    @Test("le glissé court revient, le long ou le vif ferme (le quart parcouru, la moitié prédite)")
    func dismisses_followsTheVectors() throws {
        for row in try Self.rows("dismisses") {
            let closes = MeeshyAnchoredSheetMetrics.dismisses(
                translation: try Self.cg(row["translation"]),
                predictedEnd: try Self.cg(row["predictedEnd"]),
                height: try Self.cg(row["height"])
            )
            #expect(closes == row["closes"] as? Bool, "\(row)")
        }
    }

    @Test("vers le haut, la feuille ne se soulève pas — sauf la place qu'un cran plus haut offre")
    func dragOffset_followsTheVectors() throws {
        for row in try Self.rows("dragOffset") {
            let offset = MeeshyAnchoredSheetMetrics.dragOffset(
                try Self.cg(row["translation"]), upwardRoom: try Self.cg(row["upwardRoom"])
            )
            #expect(Double(offset) == row["offset"] as? Double, "\(row)")
        }
    }

    @Test("le relâcher conclut vers le cran le plus proche de l'endroit que la vitesse désigne, ou ferme sous le plus bas")
    func settle_followsTheVectors() throws {
        for row in try Self.rows("settle") {
            let rests = try #require(row["rests"] as? [Double]).map { CGFloat($0) }
            let settlement = MeeshyAnchoredSheetMetrics.settle(
                translation: try Self.cg(row["translation"]),
                predictedEnd: try Self.cg(row["predictedEnd"]),
                currentIndex: try #require(row["index"] as? Int),
                rests: rests
            )
            switch try #require(row["settles"] as? String) {
            case "dismiss": #expect(settlement == .dismiss, "\(row)")
            default: #expect(settlement == .rest(index: try #require(row["to"] as? Int)), "\(row)")
            }
        }
    }

    @Test("sans cran, le relâcher ne choisit qu'entre fermer et revenir")
    func settle_withoutRests_dismisses() {
        #expect(MeeshyAnchoredSheetMetrics.settle(translation: 0, predictedEnd: 0, currentIndex: 0, rests: []) == .dismiss)
    }

    // MARK: - Place publiée

    @Test("le haut au repos est le bas du conteneur moins la feuille")
    func restingTop_followsTheVectors() throws {
        for row in try Self.rows("restingTop") {
            let top = MeeshyAnchoredSheetMetrics.restingTop(
                containerMaxY: try Self.cg(row["containerMaxY"]), height: try Self.cg(row["height"])
            )
            #expect(Double(top) == row["top"] as? Double, "\(row)")
        }
    }

    @Test("la disposition d'une feuille à crans repose sur le cran courant, mise en page au plus haut")
    func layout_detents_restOnTheCurrentDetent() {
        let height = MeeshyAnchoredSheetHeight.detents([0.3, 0.6], initial: 0)
        let low = MeeshyAnchoredSheetLayout.resolve(height: height, content: nil, available: 800,
                                                    maximumFraction: 0.62, detentIndex: 0)
        let high = MeeshyAnchoredSheetLayout.resolve(height: height, content: nil, available: 800,
                                                     maximumFraction: 0.62, detentIndex: 1)
        #expect(low.rest == 240 && high.rest == 480)
        #expect(low.layoutHeight == 480 && high.layoutHeight == 480)
        #expect(low.restOffset == 240 && high.restOffset == 0)
        #expect(low.hasDetents && high.hasDetents)
    }

    @Test("une feuille sans cran se met en page à sa hauteur, sans décalage")
    func layout_plain_hasNoRestOffset() {
        let layout = MeeshyAnchoredSheetLayout.resolve(height: .regular, content: nil, available: 800,
                                                       maximumFraction: 0.62, detentIndex: 0)
        #expect(layout.rest == 400 && layout.layoutHeight == 400 && layout.restOffset == 0)
        #expect(!layout.hasDetents)
    }

    @Test("le cran d'ouverture est cherché dans l'ordre fourni, puis lu dans la liste ordonnée")
    func initialDetentIndex_readsTheGivenOrder() {
        #expect(MeeshyAnchoredSheetMetrics.initialDetentIndex([0.6, 0.3], initial: 0) == 1)
        #expect(MeeshyAnchoredSheetMetrics.initialDetentIndex([0.3, 0.6], initial: 5) == 1)
        #expect(MeeshyAnchoredSheetMetrics.initialDetentIndex([], initial: 0) == 0)
    }

    // MARK: - Mouvement

    @Test("le ressort de 0,32 / 0,88 ; sous « Réduire les animations », tout est immédiat")
    func motion_followsTheVectors() throws {
        let motion = try Self.object("motion")
        let normal = MeeshyAnchoredSheetMetrics.motion(reduceMotion: false)
        #expect(normal.response == motion["response"] as? Double)
        #expect(normal.dampingFraction == motion["dampingFraction"] as? Double)
        #expect(normal.durationMilliseconds == motion["durationMs"] as? Int)
        #expect(!normal.isImmediate)
        #expect(normal.animation != nil)
        let reduced = MeeshyAnchoredSheetMetrics.motion(reduceMotion: true)
        let expected = try #require(motion["reduced"] as? [String: Any])
        #expect(reduced.isImmediate == expected["immediate"] as? Bool)
        #expect(reduced.durationMilliseconds == expected["durationMs"] as? Int)
        #expect(reduced.animation == nil)
    }

    // MARK: - Loi 13 et rôle

    @Test("loi 13 : ni poignée, ni en-tête, ni ✕, ni voile hors de leurs conditions ; modale en « dismisses » seulement")
    func chrome_followsTheVectors() throws {
        for row in try Self.rows("law13") {
            let expect = try #require(row["expect"] as? [String: Any])
            let outside = try #require(MeeshyAnchoredSheetOutside(rawValue: try kitRequired(row["outside"] as? String)))
            let chrome = MeeshyAnchoredSheetChrome.resolve(
                hasTitle: try #require(row["title"] as? Bool),
                hasTrailing: try #require(row["trailing"] as? Bool),
                hasCloseLabel: try #require(row["closeLabel"] as? Bool),
                showsHandle: try #require(row["showsHandle"] as? Bool),
                isDragDismissEnabled: try #require(row["drag"] as? Bool),
                hasDetents: try #require(row["detents"] as? Bool),
                outside: outside,
                scrim: try #require(row["scrim"] as? Bool)
            )
            #expect(chrome.showsHandle == expect["handle"] as? Bool, "\(row)")
            #expect(chrome.handleIsAdjustable == expect["adjustable"] as? Bool, "\(row)")
            #expect(chrome.showsHeader == expect["header"] as? Bool, "\(row)")
            #expect(chrome.showsClose == expect["close"] as? Bool, "\(row)")
            #expect(chrome.showsScrim == expect["scrim"] as? Bool, "\(row)")
            #expect(chrome.isModal == expect["modal"] as? Bool, "\(row)")
        }
    }

    @Test("la poignée à crans dit « agrandie » sur le cran le plus haut, « réduite » ailleurs")
    func handleValue_followsTheVectors() throws {
        for row in try Self.rows("handleValue") {
            let expanded = MeeshyAnchoredSheetMetrics.isExpanded(
                detentIndex: try #require(row["index"] as? Int), detentCount: try #require(row["count"] as? Int)
            )
            #expect(expanded == row["expanded"] as? Bool, "\(row)")
        }
    }

    @Test("la feuille lit sa loi 13 dans la loi pure, sans la réécrire")
    func source_chromeIsResolvedByTheLaw() throws {
        let code = try Self.code("MeeshyAnchoredSheet.swift")
        #expect(code.contains("MeeshyAnchoredSheetChrome.resolve("))
        #expect(code.contains("MeeshyAnchoredSheetMetrics.isExpanded("))
        #expect(!code.contains("outside == .dismisses"))
    }

    // MARK: - Mesures et jetons

    @Test("la poignée, l'ombre et le voile de la planche vivent dans la loi, nulle part ailleurs")
    func chromeTokens_liveInTheLaw() throws {
        let chrome = try Self.object("chrome")
        let handle = try #require(chrome["handle"] as? [String: Any])
        let shadow = try #require(chrome["shadow"] as? [String: Any])
        #expect(Double(MeeshyAnchoredSheetMetrics.handleWidth) == handle["width"] as? Double)
        #expect(Double(MeeshyAnchoredSheetMetrics.handleHeight) == handle["height"] as? Double)
        #expect(MeeshyAnchoredSheetMetrics.handleOpacity(surface: .dark) == handle["opacityDark"] as? Double)
        #expect(MeeshyAnchoredSheetMetrics.handleOpacity(surface: .theme) == handle["opacityTheme"] as? Double)
        #expect(Double(MeeshyAnchoredSheetMetrics.shadowRadius) == shadow["radius"] as? Double)
        #expect(Double(MeeshyAnchoredSheetMetrics.shadowYOffset) == shadow["y"] as? Double)
        #expect(MeeshyAnchoredSheetMetrics.shadowOpacity == shadow["opacity"] as? Double)
        #expect(MeeshyAnchoredSheetMetrics.scrimOpacity == chrome["scrimOpacity"] as? Double)
        #expect(Double(MeeshyRadius.xxl) == chrome["radius"] as? Double)
        #expect(Double(MeeshySpacing.xxl) == chrome["bottomMargin"] as? Double)
        #expect(Double(MeeshyControlSize.tapTarget) == chrome["headerMinHeight"] as? Double)
    }

    // MARK: - Contraste

    @Test("le titre tient 4,5:1 et la poignée 3:1 sur la surface sombre, calculés depuis la recette")
    func contrast_darkSurface() throws {
        let contrast = try Self.object("contrast")
        let surface = Self.components(MeeshyColors.indigo950)
        let title = Self.contrast(ink: Self.components(MeeshyColors.onMedia), alpha: 1, on: surface)
        let handle = Self.contrast(
            ink: Self.components(MeeshyColors.onMedia),
            alpha: MeeshyAnchoredSheetMetrics.handleOpacity(surface: .dark), on: surface
        )
        #expect(title >= (contrast["titleMin"] as? Double ?? .infinity))
        #expect(handle >= (contrast["handleMin"] as? Double ?? .infinity))
    }

    @Test("sur la surface du thème, clair et sombre : titre 4,5:1, poignée 3:1", arguments: [false, true])
    func contrast_themeSurface(isDark: Bool) throws {
        let contrast = try Self.object("contrast")
        let surface = Self.components(MeeshyColors.backgroundPrimary(isDark: isDark))
        let ink = Self.components(MeeshyColors.textPrimary(isDark: isDark))
        let title = Self.contrast(ink: ink, alpha: 1, on: surface)
        let handle = Self.contrast(ink: ink, alpha: MeeshyAnchoredSheetMetrics.handleOpacity(surface: .theme), on: surface)
        #expect(title >= (contrast["titleMin"] as? Double ?? .infinity))
        #expect(handle >= (contrast["handleMin"] as? Double ?? .infinity))
    }

    // MARK: - Hauteur et surface par défaut

    @Test("les hauteurs nommées sont les fractions de la fiche")
    func namedHeights() {
        #expect(MeeshyAnchoredSheetHeight.compact == .fraction(0.3))
        #expect(MeeshyAnchoredSheetHeight.regular == .fraction(0.5))
        #expect(MeeshyAnchoredSheetHeight.tall == .fraction(0.62))
    }

    // MARK: - Mots

    @Test("le nom du ✕ et celui de la poignée sont traduits dans les sept langues", arguments: ["fr", "en", "es", "de", "it", "pt-BR", "ar"])
    @MainActor
    func copy_isTranslated(code: String) throws {
        let bundle = try Self.lproj(code)
        for key in ["kit.anchored_sheet.close", "kit.anchored_sheet.height",
                    "kit.anchored_sheet.height.reduced", "kit.anchored_sheet.height.expanded"] {
            let value = bundle.localizedString(forKey: key, value: "∅", table: nil)
            #expect(value != "∅" && !value.isEmpty, "\(code) : \(key)")
        }
    }

    // MARK: - Gardes de source

    @Test("aucun verre, aucune couleur en dur, aucun type du composer ni singleton dans les fichiers du kit")
    func source_isAgnosticAndFlat() throws {
        for file in ["MeeshyAnchoredSheet.swift", "MeeshyAnchoredSheetHost.swift", "MeeshyAnchoredSheetMetrics.swift"] {
            let code = try Self.code(file)
            #expect(!code.contains("Color(hex"), "\(file)")
            #expect(!code.contains("Color.white") && !code.contains("Color.black"), "\(file)")
            #expect(!code.contains(".meeshyGlass("), "\(file)")
            #expect(!code.contains("glassEffect"), "\(file)")
            #expect(!code.contains("Composer"), "\(file)")
            #expect(!code.contains(".shared"), "\(file)")
            #expect(!code.contains("UIImpactFeedbackGenerator"), "\(file)")
        }
    }

    @Test("le décalage du doigt n'est lu que par l'enveloppe, jamais par le contenu")
    func source_dragOffsetIsObservedByTheWrapperOnly() throws {
        let code = try Self.code("MeeshyAnchoredSheet.swift")
        #expect(code.components(separatedBy: "@ObservedObject").count == 2)
        #expect(!code.contains("@StateObject"))
        #expect(!code.contains("blur"))
    }

    @Test("la place n'est publiée qu'au repos : elle ne lit jamais le décalage du doigt")
    func source_footprintIgnoresTheDrag() throws {
        let code = try Self.code("MeeshyAnchoredSheet.swift")
        let start = try #require(code.range(of: "private func footprint("))
        let body = String(code[start.upperBound...].prefix(520))
        #expect(!body.contains("drag"))
        #expect(body.contains("layout.rest"))
    }

    // MARK: - Aides

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func json() throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K15-MeeshyAnchoredSheet.vectors.json")
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
        CGFloat(try #require((value as? NSNumber)?.doubleValue))
    }

    private static func height(_ row: [String: Any]) throws -> MeeshyAnchoredSheetHeight {
        switch try #require(row["height"] as? String) {
        case "content": return .content
        case "compact": return .compact
        case "regular": return .regular
        case "tall": return .tall
        case "fraction": return .fraction(try cg(row["fraction"]))
        default:
            let fractions = try #require(row["fractions"] as? [Double]).map { CGFloat($0) }
            return .detents(fractions, initial: try #require(row["initial"] as? Int))
        }
    }

    private static func components(_ color: Color) -> (r: Double, g: Double, b: Double) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Double(r), Double(g), Double(b))
    }

    /// Le contraste WCAG d'une encre posée à `alpha` sur une surface opaque.
    private static func contrast(ink: (r: Double, g: Double, b: Double), alpha: Double,
                                 on surface: (r: Double, g: Double, b: Double)) -> Double {
        func mixed(_ i: Double, _ s: Double) -> Double { i * alpha + s * (1 - alpha) }
        let drawn = CanvasChromeScheme.luminance(
            red: mixed(ink.r, surface.r), green: mixed(ink.g, surface.g), blue: mixed(ink.b, surface.b)
        )
        let base = CanvasChromeScheme.luminance(red: surface.r, green: surface.g, blue: surface.b)
        return CanvasChromeScheme.contrastRatio(drawn, base)
    }

    @MainActor
    private static func lproj(_ code: String) throws -> Bundle {
        let path = try #require(Bundle.module.path(forResource: code, ofType: "lproj"), "\(code).lproj absent")
        return try #require(Bundle(path: path))
    }

    /// Le code d'un fichier du kit, commentaires de ligne retirés.
    private static func code(_ file: String) throws -> String {
        let url = repositoryRoot.appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Kit/\(file)")
        return try String(contentsOf: url, encoding: .utf8)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") && !$0.trimmingCharacters(in: .whitespaces).hasPrefix("///") }
            .joined(separator: "\n")
    }
}
