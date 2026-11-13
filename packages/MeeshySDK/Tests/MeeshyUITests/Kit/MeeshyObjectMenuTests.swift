import Testing
import Foundation
import SwiftUI
import UIKit
@testable import MeeshyUI

/// K18 — le menu d'objet, lu comme des VALEURS : l'ordre (la ligne destructive en
/// dernier), la place (le bord, le rabat, la colonne qui défile, le RTL), ce qu'il
/// montre autour de ses lignes, le choix, le mouvement, le contraste. Les mesures
/// viennent du fichier de vecteurs que lisent aussi Android et le web.
@Suite("MeeshyObjectMenu")
struct MeeshyObjectMenuTests {

    // MARK: - Recette

    @Test("les mesures de la planche : 236, 46, rayon 16, retrait 14, 11 au-delà, 10 d'écart, 12 de marge")
    func recipe_followsTheVectors() throws {
        let recipe = try Self.object("recipe")
        #expect(Double(MeeshyObjectMenuRecipe.width) == recipe["width"] as? Double)
        #expect(Double(MeeshyObjectMenuRecipe.maximumWidth) == recipe["maximumWidth"] as? Double)
        #expect(Double(MeeshyObjectMenuRecipe.maximumWidth) == recipe["accessibilityWidth"] as? Double)
        #expect(Double(MeeshyObjectMenuRecipe.rowHeight) == recipe["rowHeight"] as? Double)
        #expect(Double(MeeshyObjectMenuRecipe.headerHeight) == recipe["headerHeight"] as? Double)
        #expect(Double(MeeshyObjectMenuRecipe.endOverhang) == recipe["endOverhang"] as? Double)
        #expect(Double(MeeshyObjectMenuRecipe.anchorGap) == recipe["anchorGap"] as? Double)
        #expect(Double(MeeshyObjectMenuRecipe.margin) == recipe["margin"] as? Double)
        #expect(Double(MeeshyObjectMenuRecipe.radius) == recipe["radius"] as? Double)
        #expect(Double(MeeshyObjectMenuRecipe.inset) == recipe["inset"] as? Double)
        #expect(Double(MeeshyObjectMenuRecipe.glyphSize) == recipe["glyph"] as? Double)
        #expect(MeeshyObjectMenuRecipe.dividerOpacity == recipe["dividerOpacity"] as? Double)
        #expect(Double(MeeshyObjectMenuRecipe.enterScale) == recipe["enterScale"] as? Double)
        #expect(MeeshyObjectMenuRecipe.springResponse == recipe["springResponse"] as? Double)
        #expect(MeeshyObjectMenuRecipe.springDamping == recipe["springDamping"] as? Double)
        #expect(MeeshyObjectMenuRecipe.enterMilliseconds == recipe["enterMs"] as? Int)
        #expect(MeeshyObjectMenuRecipe.exitMilliseconds == recipe["exitMs"] as? Int)
        #expect(MeeshyObjectMenuRecipe.reducedMilliseconds == recipe["reducedMs"] as? Int)
    }

    @Test("la largeur monte à 320 aux tailles d'accessibilité, 236 sinon")
    func width_growsWithAccessibilitySizes() {
        #expect(MeeshyObjectMenuRecipe.width(isAccessibilitySize: false) == 236)
        #expect(MeeshyObjectMenuRecipe.width(isAccessibilitySize: true) == 320)
    }

    @Test("la hauteur estimée de la première pose : l'en-tête et n lignes, rien sans ligne")
    func estimatedHeight_followsTheVectors() throws {
        for row in try Self.rows("estimatedHeight") {
            let height = MeeshyObjectMenuRecipe.estimatedHeight(
                rowCount: try #require(row["rows"] as? Int), hasHeader: try #require(row["header"] as? Bool)
            )
            #expect(Double(height) == row["height"] as? Double, "\(row)")
        }
    }

    // MARK: - Ordre

    @Test("la ligne destructive est toujours la dernière, les titres vides et les doublons sont retirés")
    func order_followsTheVectors() throws {
        for row in try Self.rows("order") {
            let triples = try #require(row["items"] as? [[String]])
            let items = triples.map {
                MeeshyObjectMenuItem(id: $0[0], title: $0[1], role: $0[2] == "destructive" ? .destructive : .normal)
            }
            let ids = MeeshyObjectMenuOrder.resolve(items).map(\.id)
            #expect(ids == row["ids"] as? [String], "\(row["case"] ?? "")")
        }
    }

    @Test("quel que soit l'ordre reçu, aucune ligne normale ne suit une ligne destructive")
    func order_neverPutsADestructiveRowBeforeANormalOne() {
        let roles: [MeeshyObjectMenuRole] = [.destructive, .normal, .destructive, .normal, .normal]
        let items = roles.enumerated().map { MeeshyObjectMenuItem(id: "i\($0.offset)", title: "T\($0.offset)", role: $0.element) }
        let resolved = MeeshyObjectMenuOrder.resolve(items)
        let firstDestructive = resolved.firstIndex { $0.role == .destructive } ?? -1
        let lastNormal = resolved.lastIndex { $0.role == .normal } ?? Int.max
        #expect(firstDestructive > lastNormal)
    }

    // MARK: - Place

    @Test("la place : le vecteur O2, le bord qui bascule, le rabat, la colonne qui défile, le RTL, le point")
    func placement_followsTheVectors() throws {
        for row in try Self.rows("placement") {
            let placement = MeeshyObjectMenuPlacement.resolve(
                control: try Self.rect(row["control"]),
                surface: row["surface"] is NSNull ? nil : try Self.rect(row["surface"]),
                menu: try Self.size(row["menu"]),
                container: try Self.size(row["container"]),
                insets: try Self.insets(row["insets"]),
                preferredEdge: row["edge"] as? String == "below" ? .below : .above,
                alignment: row["alignment"] as? String == "center" ? .center : .end,
                isRightToLeft: row["rtl"] as? Bool ?? false
            )
            let expected = try Self.rect(row["frame"])
            let label = "\(row["case"] ?? "")"
            #expect(abs(placement.frame.minX - expected.minX) < 0.001, "\(label) x")
            #expect(abs(placement.frame.minY - expected.minY) < 0.001, "\(label) y")
            #expect(abs(placement.frame.width - expected.width) < 0.001, "\(label) largeur")
            #expect(abs(placement.frame.height - expected.height) < 0.001, "\(label) hauteur")
            #expect(placement.edge.rawValue == row["resolvedEdge"] as? String, "\(label) bord")
            #expect(placement.scrolls == row["scrolls"] as? Bool, "\(label) défile")
            let origin = try #require(row["origin"] as? [Double])
            #expect(abs(Double(placement.origin.x) - origin[0]) < 0.0005, "\(label) origine x")
            #expect(abs(Double(placement.origin.y) - origin[1]) < 0.0005, "\(label) origine y")
        }
    }

    @Test("le menu ne recouvre jamais la surface qui porte son contrôle quand il tient", arguments: [
        CGRect(x: 55, y: 752, width: 280, height: 64),
        CGRect(x: 55, y: 40, width: 280, height: 64),
        CGRect(x: 20, y: 400, width: 120, height: 64),
    ])
    func placement_neverCoversTheSurface(surface: CGRect) {
        let control = CGRect(x: surface.maxX - 56, y: surface.minY + 8, width: 48, height: 48)
        let placement = MeeshyObjectMenuPlacement.resolve(
            control: control, surface: surface, menu: CGSize(width: 236, height: 230), container: CGSize(width: 390, height: 844)
        )
        #expect(!placement.scrolls)
        #expect(!placement.frame.intersects(surface))
    }

    @Test("jamais hors des marges, quelle que soit la place", arguments: [
        CGRect(x: 0, y: 0, width: 40, height: 40),
        CGRect(x: 350, y: 800, width: 40, height: 40),
        CGRect(x: 175, y: 400, width: 40, height: 40),
    ])
    func placement_staysInsideTheMargins(control: CGRect) {
        for alignment in MeeshyObjectMenuAlignment.allCases {
            for edge in MeeshyObjectMenuEdge.allCases {
                let placement = MeeshyObjectMenuPlacement.resolve(
                    control: control, menu: CGSize(width: 236, height: 600), container: CGSize(width: 390, height: 844),
                    preferredEdge: edge, alignment: alignment
                )
                let margin = MeeshyObjectMenuRecipe.margin
                #expect(placement.frame.minX >= margin - 0.001)
                #expect(placement.frame.maxX <= 390 - margin + 0.001)
                #expect(placement.frame.minY >= margin - 0.001)
                #expect(placement.frame.maxY <= 844 - margin + 0.001)
            }
        }
    }

    // MARK: - Loi 13

    @Test("ce que le menu montre autour de ses lignes : rien sans ligne, ni en-tête, ni filet, ni voile hors de leurs conditions")
    func chrome_followsTheVectors() throws {
        for row in try Self.rows("chrome") {
            let chrome = MeeshyObjectMenuChrome.resolve(
                rowCount: try #require(row["rows"] as? Int),
                header: row["header"] as? String,
                backdrop: row["backdrop"] as? String == "dim" ? .dim : .clear
            )
            #expect(chrome.showsMenu == row["showsMenu"] as? Bool, "\(row)")
            #expect(chrome.showsHeader == row["showsHeader"] as? Bool, "\(row)")
            #expect(chrome.showsScrim == row["showsScrim"] as? Bool, "\(row)")
            #expect(chrome.dividerCount == row["dividers"] as? Int, "\(row)")
            #expect(chrome.requestsDismiss == row["requestsDismiss"] as? Bool, "\(row)")
        }
    }

    // MARK: - Choix

    @Test("choisir une ligne : le retour haptique, la fermeture, PUIS l'identifiant, une fois chacun")
    @MainActor
    func choice_playsHapticThenDismissesThenSelects() throws {
        var calls: [String] = []
        MeeshyObjectMenuChoice.commit(
            id: "lock", haptic: .light,
            playHaptic: { calls.append("haptic") }, dismiss: { calls.append("dismiss") }, select: { calls.append("select:\($0)") }
        )
        #expect(calls == ["haptic", "dismiss", "select:lock"])
        #expect(calls.prefix(3).map { $0.split(separator: ":").first.map(String.init) ?? "" } == (try Self.strings("choice")))
    }

    @Test("sans retour haptique, le choix ferme puis remet l'identifiant")
    @MainActor
    func choice_withoutHaptic_playsNone() {
        var calls: [String] = []
        MeeshyObjectMenuChoice.commit(
            id: "remove", haptic: .none,
            playHaptic: { calls.append("haptic") }, dismiss: { calls.append("dismiss") }, select: { calls.append("select:\($0)") }
        )
        #expect(calls == ["dismiss", "select:remove"])
    }

    // MARK: - Mouvement

    @Test("l'entrée part à 0,92 depuis l'ancre ; « réduire les animations » : fondu seul, sans échelle")
    func motion_reducesToAFade() {
        let normal = MeeshyObjectMenuMotion.resolve(reduceMotion: false)
        let reduced = MeeshyObjectMenuMotion.resolve(reduceMotion: true)
        #expect(normal.scale == 0.92)
        #expect(!normal.isReduced)
        #expect(reduced.scale == 1)
        #expect(reduced.isReduced)
    }

    // MARK: - Lignes et face

    @Test("une ligne est une valeur : le rappel n'entre pas dans l'égalité, l'appui d'une voisine ne la rend pas")
    @MainActor
    func row_ignoresItsClosure() {
        let item = MeeshyObjectMenuItem(id: "a", title: "A", systemImage: "lock")
        let first = MeeshyObjectMenuRow(item: item, isFrozenPressed: false, showsDivider: true, onSelect: { _ in })
        let second = MeeshyObjectMenuRow(item: item, isFrozenPressed: false, showsDivider: true, onSelect: { _ in })
        let pressed = MeeshyObjectMenuRow(item: item, isFrozenPressed: true, showsDivider: true, onSelect: { _ in })
        #expect(first == second)
        #expect(first != pressed)
    }

    @Test("la face se compare par ses valeurs")
    @MainActor
    func face_isEquatable() {
        let items = [MeeshyObjectMenuItem(id: "a", title: "A")]
        let one = MeeshyObjectMenu(items: items, onSelect: { _ in })
        #expect(one == MeeshyObjectMenu(items: items, onSelect: { _ in }))
        #expect(one != MeeshyObjectMenu(items: items, header: "Fond", onSelect: { _ in }))
        #expect(one != MeeshyObjectMenu(items: items, tone: .onLight, onSelect: { _ in }))
    }

    @Test("une ligne sans glyphe n'a ni trou ni nom de symbole")
    func item_withoutGlyph() {
        let item = MeeshyObjectMenuItem(id: "a", title: "A")
        #expect(item.systemImage == nil)
        #expect(item.role == .normal)
        #expect(item.hint == nil)
    }

    // MARK: - Mots

    @Test("le nom de la fermeture est traduit dans les sept langues", arguments: ["fr", "en", "es", "de", "it", "pt-BR", "ar"])
    @MainActor
    func copy_isTranslated(code: String) throws {
        let bundle = try Self.lproj(code)
        let value = bundle.localizedString(forKey: "kit.object_menu.dismiss", value: "∅", table: nil)
        #expect(value != "∅" && !value.isEmpty, "\(code)")
    }

    // MARK: - Contraste

    @Test("le titre tient 4,5:1 et Retirer 3:1 sur le verre dense au pire fond, calculés depuis la recette")
    func contrast_worstBackdrop() throws {
        let contrast = try Self.object("contrast")
        let fill = try #require(contrast["denseFillOpacity"] as? Double)
        let glass = Self.components(MeeshyColors.mediaBackdrop)
        let worst = Self.components(MeeshyColors.onMedia)
        let surface = (
            r: worst.r * (1 - fill) + glass.r * fill,
            g: worst.g * (1 - fill) + glass.g * fill,
            b: worst.b * (1 - fill) + glass.b * fill
        )
        let title = Self.contrast(ink: Self.components(MeeshyColors.onMedia), on: surface)
        let destructive = Self.contrast(ink: Self.components(MeeshyColors.errorSoft), on: surface)
        #expect(title >= (contrast["titleMin"] as? Double ?? .infinity))
        #expect(destructive >= (contrast["destructiveMin"] as? Double ?? .infinity))
    }

    // MARK: - Catalogue

    @Test("l'entrée du catalogue : les états de la fiche, O2 pour l'objet, et l'objet se touche")
    func catalog_entry() throws {
        let entry = MeeshyKitCatalog.entryK18
        #expect(entry.states.map(\.id) == ["objet", "media", "verrouille", "en-tete", "dessous", "defile", "clair", "point"])
        let objet = try #require(entry.states.first)
        #expect(objet.boardView == "O2")
        #expect(objet.isTouchable)
        #expect(entry.states.filter(\.isTouchable).count == 1)
    }

    // MARK: - Gardes de source

    @Test("aucune entrée d'appui long, aucun menu système, aucun verre dessiné à la main, aucune couleur en dur, aucun type du composer")
    func source_isAgnosticAndFlat() throws {
        let forbidden = [
            "LongPressGesture", "onLongPressGesture", "contextMenu", "UIMenu", "UIContextMenuInteraction",
            "glassEffect", "adaptiveGlass", "Color(hex", "Color.white", "Color.black", "Composer", ".shared",
            "UIImpactFeedbackGenerator", "@ObservedObject", "@StateObject", "blur(",
        ]
        for file in Self.files {
            let code = try Self.code(file)
            for word in forbidden { #expect(!code.contains(word), "\(file) : \(word)") }
            #expect(code.range(of: #"(?<![A-Za-z])Menu\("#, options: .regularExpression) == nil, "\(file) : Menu(")
        }
    }

    @Test("le verre passe par K01 et par lui seul ; la haptique par le site unique")
    func source_usesTheSingleEntries() throws {
        let face = try Self.code("MeeshyObjectMenu.swift")
        #expect(face.contains(".meeshyGlass(in: shape, tone: tone, density: .dense)"))
        #expect(!face.contains("isInteractive"))
        let host = try Self.code("MeeshyObjectMenuHost.swift")
        #expect(host.contains("HapticFeedback.light()"))
        #expect(host.contains("dismissOnEscape"))
    }

    @Test("l'échelle et l'opacité s'animent ; ni le flou, ni l'ombre, ni la hauteur, ni la mise en page")
    func source_animatesOnlyScaleAndOpacity() throws {
        let host = try Self.code("MeeshyObjectMenuHost.swift")
        #expect(host.contains(".scale(scale: motion.scale"))
        #expect(host.contains(".animation(nil, value: placement)"))
        #expect(!host.contains(".shadow("))
    }

    // MARK: - Aides

    private static let files = [
        "MeeshyObjectMenu.swift", "MeeshyObjectMenuHost.swift", "MeeshyObjectMenuLaws.swift", "MeeshyObjectMenuModels.swift",
    ]

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func json() throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K18-MeeshyObjectMenu.vectors.json")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return try #require(object as? [String: Any])
    }

    private static func rows(_ key: String) throws -> [[String: Any]] {
        try #require(try json()[key] as? [[String: Any]])
    }

    private static func object(_ key: String) throws -> [String: Any] {
        try #require(try json()[key] as? [String: Any])
    }

    private static func strings(_ key: String) throws -> [String] {
        try #require(try json()[key] as? [String])
    }

    private static func numbers(_ value: Any?, count: Int) throws -> [CGFloat] {
        let numbers = try #require(value as? [Double]).map { CGFloat($0) }
        try #require(numbers.count == count)
        return numbers
    }

    private static func rect(_ value: Any?) throws -> CGRect {
        let n = try numbers(value, count: 4)
        return CGRect(x: n[0], y: n[1], width: n[2], height: n[3])
    }

    private static func size(_ value: Any?) throws -> CGSize {
        let n = try numbers(value, count: 2)
        return CGSize(width: n[0], height: n[1])
    }

    private static func insets(_ value: Any?) throws -> MeeshyObjectMenuInsets {
        let n = try numbers(value, count: 4)
        return MeeshyObjectMenuInsets(top: n[0], left: n[1], bottom: n[2], right: n[3])
    }

    private static func components(_ color: Color) -> (r: Double, g: Double, b: Double) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Double(r), Double(g), Double(b))
    }

    /// Le contraste WCAG d'une encre opaque posée sur une surface opaque.
    private static func contrast(ink: (r: Double, g: Double, b: Double), on surface: (r: Double, g: Double, b: Double)) -> Double {
        let drawn = CanvasChromeScheme.luminance(red: ink.r, green: ink.g, blue: ink.b)
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
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }
}
