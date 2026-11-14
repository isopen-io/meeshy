import Testing
import Foundation
import SwiftUI
import Combine
@testable import MeeshyUI

/// K25 — les deux cibles du glisser, lues comme des VALEURS : la loi (capture,
/// hystérésis, placement), l'état (un tic par entrée, aucun rappel hors cible),
/// la recette, l'accessibilité, le contraste, puis les gardes de source (aucun
/// toucher, aucune couleur en dur, aucun type du composer). Les lignes viennent
/// du fichier de vecteurs que lisent aussi Android et le web.
@Suite("MeeshyDragTargets")
struct MeeshyDragTargetsTests {

    // MARK: - Placement

    @Test("les centres : bord haut de l'emplacement, centre de l'autre, bords sûrs par défaut")
    func rule_centers_followTheVectors() throws {
        for row in try Self.rows("emplacements") {
            let name = "\(row["nom"] ?? "")"
            let size = try Self.pair(row["taille"])
            let safe = try Self.pair(row["sures"])
            let offered = Set(try kitRequired(row["offertes"] as? [String]).compactMap(MeeshyDragTarget.init(rawValue:)))
            let centers = MeeshyDragTargetsRule.centers(
                size: CGSize(width: size.0, height: size.1),
                safeTop: CGFloat(safe.0), safeBottom: CGFloat(safe.1),
                topSlot: try Self.rect(row["haut"]), bottomSlot: try Self.rect(row["bas"]),
                offered: offered
            )
            let expected = try Self.points(row["centres"])
            #expect(Set(centers.keys) == Set(expected.keys), name)
            for (target, point) in expected {
                let center = try #require(centers[target])
                #expect(abs(Double(center.x) - Double(point.x)) < 1e-6 && abs(Double(center.y) - Double(point.y)) < 1e-6, "\(name) \(target)")
            }
        }
    }

    // MARK: - Capture

    @Test("la capture : entrée à 37,5 pt, sortie au-delà de 43,5 pt, sans battement ; chaque entrée joue UN medium")
    @MainActor
    func state_move_followsTheVectors() throws {
        for row in try Self.rows("suites") {
            let name = "\(row["nom"] ?? "")"
            let hapticName = try kitRequired(row["haptique"] as? String)
            let haptic = try #require(MeeshyDragTargetsHaptic(rawValue: hapticName))
            let spy = HapticSpy()
            let state = Self.state(centers: try Self.points(row["centres"]), haptic: haptic, spy: spy)
            state.begin()
            for step in try kitRequired(row["etapes"] as? [[String: Any]]) {
                let before = spy.count
                state.move(to: try Self.point(step["doigt"]))
                let expected = (step["survole"] as? String).flatMap(MeeshyDragTarget.init(rawValue:))
                #expect(state.hovered == expected, "\(name) : \(step)")
                #expect(spy.count - before == step["tics"] as? Int, "\(name) : \(step)")
            }
        }
    }

    @Test("la loi seule : un point non fini ne survole rien, deux cibles à égale distance ne se disputent pas")
    func rule_hovered_edgeCases() {
        let centers: [MeeshyDragTarget: CGPoint] = [.duplicate: CGPoint(x: 100, y: 100), .remove: CGPoint(x: 100, y: 500)]
        #expect(MeeshyDragTargetsRule.hovered(finger: CGPoint(x: .nan, y: 100), centers: centers, previous: .duplicate) == nil)
        #expect(MeeshyDragTargetsRule.hovered(finger: CGPoint(x: 100, y: .infinity), centers: centers, previous: nil) == nil)
        #expect(MeeshyDragTargetsRule.hovered(finger: CGPoint(x: 100, y: 100), centers: [:], previous: nil) == nil)
        #expect(MeeshyDragTargetsRule.hovered(finger: CGPoint(x: 100, y: 100), centers: centers, previous: .remove) == .duplicate)
    }

    @Test("cent mouvements à cible égale : aucun changement publié, aucun tic")
    @MainActor
    func state_move_sameTarget_publishesNothing() {
        let spy = HapticSpy()
        let state = Self.state(centers: [.remove: CGPoint(x: 195, y: 764)], haptic: .medium, spy: spy)
        state.begin()
        state.move(to: CGPoint(x: 195, y: 764))
        var publications = 0
        let subscription = state.objectWillChange.sink { publications += 1 }
        for step in 0..<100 { state.move(to: CGPoint(x: 195 + CGFloat(step % 5), y: 764)) }
        for _ in 0..<100 { state.move(to: CGPoint(x: 10, y: 10)) }
        subscription.cancel()
        #expect(publications == 1, "seule la sortie de la cible publie")
        #expect(spy.count == 1)
    }

    @Test("hors glisser, rien ne bouge : `move` ne survole rien et ne joue rien")
    @MainActor
    func state_move_whenInactive_doesNothing() {
        let spy = HapticSpy()
        let state = Self.state(centers: [.remove: CGPoint(x: 195, y: 764)], haptic: .medium, spy: spy)
        state.move(to: CGPoint(x: 195, y: 764))
        #expect(!state.isActive && state.hovered == nil && spy.count == 0)
        #expect(state.end() == nil)
    }

    // MARK: - Lâcher

    @Test("lâcher : le rappel de la cible survolée part UNE fois, la cible est rendue ; ailleurs ou annulé, rien")
    @MainActor
    func state_end_followsTheVectors() throws {
        for row in try Self.rows("issues") {
            let name = "\(row["nom"] ?? "")"
            let offered = try kitRequired(row["offertes"] as? [String])
            let layout = MeeshyDragTargetsRule.centers(
                size: CGSize(width: 390, height: 844), safeTop: 47, safeBottom: 34,
                topSlot: nil, bottomSlot: nil,
                offered: Set(offered.compactMap(MeeshyDragTarget.init(rawValue:)))
            )
            var calls: [String] = []
            let state = Self.state(centers: layout, haptic: .none, spy: HapticSpy())
            state.bind(
                haptic: .none,
                onDuplicate: offered.contains("duplicate") ? { calls.append("duplicate") } : nil,
                onRemove: offered.contains("remove") ? { calls.append("remove") } : nil
            )
            state.begin()
            state.move(to: try Self.point(row["doigt"]))
            let result: MeeshyDragTarget?
            if row["fin"] as? String == "cancel" {
                state.cancel()
                result = nil
            } else {
                result = state.end()
            }
            #expect(result?.rawValue == row["rend"] as? String, name)
            #expect(calls == (row["rappels"] as? [String] ?? []), name)
            #expect(!state.isActive && state.hovered == nil, name)
        }
    }

    @Test("le rappel part de façon synchrone, avant le retour de `end()`, l'état déjà rendu à l'hôte")
    @MainActor
    func state_end_callsBackSynchronously() {
        let state = Self.state(centers: [.remove: CGPoint(x: 195, y: 764)], haptic: .none, spy: HapticSpy())
        var wasActiveInCallback: Bool?
        state.bind(haptic: .none, onDuplicate: nil, onRemove: { wasActiveInCallback = state.isActive })
        state.begin()
        state.move(to: CGPoint(x: 195, y: 764))
        #expect(state.end() == .remove)
        #expect(wasActiveInCallback == false)
    }

    // MARK: - Recette

    @Test("la recette : les mesures de la planche, les rayons de capture et de sortie")
    func recipe_followsTheSheet() throws {
        let sheet = try Self.object("recette")
        #expect(MeeshyDragTargetsRecipe.diameter == sheet["diametre"] as? Double)
        #expect(MeeshyDragTargetsRecipe.hotScale == sheet["echelleChaude"] as? Double)
        #expect(MeeshyDragTargetsRecipe.glyphSize == sheet["glyphe"] as? Double)
        let object = try kitRequired(sheet["objet"] as? [String: Double])
        #expect(MeeshyDragTargetsRecipe.draggedScale(over: .remove) == object["echelle"])
        #expect(MeeshyDragTargetsRecipe.draggedOpacity(over: .remove) == object["opacite"])
        #expect(MeeshyDragTargetsRecipe.draggedScale(over: .duplicate) == 1)
        #expect(MeeshyDragTargetsRecipe.draggedOpacity(over: nil) == 1)
        let ring = try kitRequired(sheet["anneau"] as? [String: Double])
        #expect(MeeshyDragTargetsRecipe.ringWidth == ring["largeur"])
        #expect(MeeshyDragTargetsRecipe.ringWidth == Double(MeeshySpacing.xsPlus))
        #expect(MeeshyDragTargetsRecipe.ringOpacity == ring["opacite"])
        let durations = try kitRequired(sheet["durees"] as? [String: Double])
        #expect(MeeshyDragTargetsRecipe.appearDuration == durations["apparition"])
        #expect(MeeshyDragTargetsRecipe.exitDuration == durations["sortie"])
        #expect(MeeshyDragTargetsRecipe.heatFadeDuration == durations["fondu"])
        #expect(MeeshyDragTargetsRecipe.appearScale == sheet["apparitionEchelle"] as? Double)
        let spring = try kitRequired(sheet["ressort"] as? [String: Double])
        #expect(MeeshyDragTargetsRecipe.heatResponse == spring["reponse"])
        #expect(MeeshyDragTargetsRecipe.heatDamping == spring["amortissement"])
        let radii = try kitRequired(sheet["rayons"] as? [String: Double])
        #expect(MeeshyDragTargetsRecipe.captureRadius == radii["capture"])
        #expect(MeeshyDragTargetsRecipe.releaseRadius == radii["sortie"])
    }

    @Test("au repos : verre dense, encre blanche, ni fond plein ni anneau ; au chaud : la tenue de K02")
    func recipe_disc_restAndHot() {
        for target in MeeshyDragTarget.allCases {
            let rest = MeeshyDragTargetsRecipe.disc(target: target, isHot: false, tone: .deep, material: .drawn)
            #expect(rest.density == .dense && rest.glass == .neutral && rest.fill == .clear)
            #expect(rest.fillOpacity == 0 && rest.ringOpacity == 0 && rest.scale == 1 && rest.ink == .onMedia)
            let hot = MeeshyDragTargetsRecipe.disc(target: target, isHot: true, tone: .deep, material: .drawn)
            #expect(hot.scale == 1.25 && hot.diameter == 60 && hot.ringOpacity == 0.3 && hot.ringWidth == 6)
        }
        let duplicate = MeeshyDragTargetsRecipe.disc(target: .duplicate, isHot: true, tone: .deep, material: .drawn)
        #expect(duplicate.fill == .white && duplicate.fillOpacity == MeeshyGlassButtonRecipe.restFillOpacity && duplicate.ink == .onSolid)
        let remove = MeeshyDragTargetsRecipe.disc(target: .remove, isHot: true, tone: .deep, material: .drawn)
        #expect(remove.fill == .red && remove.ink == .onMedia)
    }

    @Test("sous Liquid Glass, la poubelle chaude est un verre teinté de rouge, la duplication un verre à fond blanc")
    func recipe_disc_liquid() {
        let remove = MeeshyDragTargetsRecipe.disc(target: .remove, isHot: true, tone: .deep, material: .liquid)
        #expect(remove.glass == .red && remove.fill == .clear)
        let duplicate = MeeshyDragTargetsRecipe.disc(target: .duplicate, isHot: true, tone: .deep, material: .liquid)
        #expect(duplicate.glass == .neutral && duplicate.fill == .white)
    }

    @Test("sous « réduire les animations » : aucun ressort, aucun fondu du fond, l'objet ne rétrécit pas par animation")
    func recipe_reduceMotion() {
        #expect(MeeshyDragTargetsRecipe.heat(reduceMotion: true) == nil)
        #expect(MeeshyDragTargetsRecipe.heatFade(reduceMotion: true) == nil)
        #expect(MeeshyDragTargetsRecipe.dragged(reduceMotion: true) == nil)
        #expect(MeeshyDragTargetsRecipe.heat(reduceMotion: false) != nil)
        #expect(MeeshyDragTargetsRecipe.presence(appearing: true) == .easeOut(duration: 0.2))
        #expect(MeeshyDragTargetsRecipe.presence(appearing: false) == .easeOut(duration: 0.15))
    }

    // MARK: - Accessibilité

    @Test("les noms : celui du repos, celui du chaud, et une valeur vide est refusée par l'API")
    func labels_namesByState() {
        let labels = MeeshyDragTargetsLabels(duplicate: "a", duplicateHot: "b", remove: "c", removeHot: "d")
        #expect(labels.name(of: .duplicate, isHot: false) == "a")
        #expect(labels.name(of: .duplicate, isHot: true) == "b")
        #expect(labels.name(of: .remove, isHot: false) == "c")
        #expect(labels.name(of: .remove, isHot: true) == "d")
    }

    // MARK: - Contraste

    @Test("contraste calculé depuis la recette : glyphe sombre sur blanc 15,99 : 1, glyphe blanc sur rouge 3,76 : 1")
    func contrast_isComputedFromTheRecipe() throws {
        let sheet = try Self.object("contraste")
        let tolerance = try kitRequired(sheet["tolerance"] as? Double)
        let duplicate = MeeshyDragTargetsRecipe.disc(target: .duplicate, isHot: true, tone: .deep, material: .drawn)
        let remove = MeeshyDragTargetsRecipe.disc(target: .remove, isHot: true, tone: .deep, material: .drawn)
        let onWhite = try #require(duplicate.solidContrast(isDark: false))
        let onRed = try #require(remove.solidContrast(isDark: false))
        let expectedOnWhite = try kitRequired(sheet["duplicationChaude"] as? Double)
        let expectedOnRed = try kitRequired(sheet["poubelleChaude"] as? Double)
        #expect(abs(onWhite - expectedOnWhite) < tolerance)
        #expect(abs(onRed - expectedOnRed) < tolerance)
        #expect(onRed >= 3, "glyphe de 26 pt : seuil 3:1")
        #expect(MeeshyDragTargetsRecipe.disc(target: .remove, isHot: false, tone: .deep, material: .drawn).solidContrast(isDark: false) == nil)
    }

    // MARK: - Source

    @Test("aucun toucher, aucun arrêt de tabulation : ni geste, ni bouton, ni focus, ni zone de contact")
    func source_takesNoTouchNoFocus() throws {
        let view = try Self.code("MeeshyDragTargets.swift")
        #expect(view.contains(".allowsHitTesting(false)"))
        #expect(view.contains(".accessibilityAddTraits(.isImage)"))
        #expect(view.contains(".accessibilityElement(children: .ignore)"))
        for file in Self.files {
            let code = try Self.code(file)
            for word in ["onTapGesture", ".gesture(", "DragGesture", "MagnificationGesture", "Button(", ".focusable(", "contentShape", "isButton"] {
                #expect(!code.contains(word), "\(file) contient \(word)")
            }
        }
    }

    @Test("inactif, rien dans l'arbre : le calque n'existe que pendant un glisser, sans minuteur ni observateur global")
    func source_layerExistsOnlyWhileActive() throws {
        let view = try Self.code("MeeshyDragTargets.swift")
        #expect(view.contains("if state.isActive"))
        for file in Self.files {
            let code = try Self.code(file)
            for word in ["Timer", "TimelineView", "NotificationCenter", "addObserver", "CADisplayLink"] {
                #expect(!code.contains(word), "\(file) contient \(word)")
            }
        }
    }

    @Test("pas de miroir en RTL : disposition verticale et centrée, glyphes non retournés")
    func source_doesNotMirror() throws {
        for file in Self.files {
            let code = try Self.code(file)
            #expect(!code.contains("layoutDirection"), file)
            #expect(!code.contains("flipsForRightToLeftLayoutDirection"), file)
        }
    }

    @Test("rien d'animé que l'échelle et l'opacité : aucune mise en page, aucun flou recalculé")
    func source_animatesOnlyTransformAndOpacity() throws {
        let code = try Self.code("MeeshyDragTargets.swift") + (try Self.code("MeeshyDragTargetsDragged.swift"))
        for word in [".blur(", "withAnimation(", "matchedGeometryEffect"] {
            #expect(!code.contains(word), "contient \(word)")
        }
    }

    @Test("aucune couleur ni code en dur, aucun type du composer ni singleton nommé Meeshy")
    func source_isAgnosticAndTokenised() throws {
        let forbidden = [
            "Color(hex:", "Color(red:", "Color(white:", "Color.white", "Color.black", "Color.red", "Color.pink",
            "UIColor", "#FF", "0x",
            "Story", "Composer", "Call", "Conversation", "StoryCanvas", ".shared", "AuthManager", "CacheCoordinator",
        ]
        for file in Self.files {
            let code = try Self.code(file)
            for word in forbidden where !(file == "MeeshyDragTargetsRecipe.swift" && word == "Story") {
                #expect(!code.contains(word), "\(file) contient \(word)")
            }
        }
    }

    @Test("le haptique passe par le site unique : HapticFeedback.medium(), nulle part ailleurs dans le kit")
    func source_hapticIsTheSingleSite() throws {
        let state = try Self.code("MeeshyDragTargetsState.swift")
        #expect(state.contains("HapticFeedback.medium()"))
        for file in Self.files where file != "MeeshyDragTargetsState.swift" {
            let code = try Self.code(file)
            #expect(!code.contains("UIImpactFeedbackGenerator") && !code.contains("HapticFeedback"), file)
        }
    }

    // MARK: - Aides

    private static let files = [
        "MeeshyDragTargets.swift", "MeeshyDragTargetsModels.swift", "MeeshyDragTargetsRule.swift",
        "MeeshyDragTargetsRecipe.swift", "MeeshyDragTargetsState.swift", "MeeshyDragTargetsDragged.swift",
    ]

    @MainActor
    private final class HapticSpy {
        var count = 0
    }

    @MainActor
    private static func state(centers: [MeeshyDragTarget: CGPoint], haptic: MeeshyDragTargetsHaptic, spy: HapticSpy) -> MeeshyDragTargetsState {
        let state = MeeshyDragTargetsState(isActive: false, hovered: nil, playHaptic: { spy.count += 1 })
        state.bind(haptic: haptic, onDuplicate: nil, onRemove: nil)
        state.updateCenters(centers)
        return state
    }

    private static func number(_ value: Any?) throws -> Double {
        if let number = value as? Double { return number }
        switch value as? String {
        case "nan": return .nan
        case "inf": return .infinity
        default: throw MeeshyDragTargetsVectorError.unreadable("\(String(describing: value))")
        }
    }

    private static func pair(_ value: Any?) throws -> (Double, Double) {
        let items = try #require(value as? [Any])
        return (try number(items[0]), try number(items[1]))
    }

    private static func point(_ value: Any?) throws -> CGPoint {
        let pair = try pair(value)
        return CGPoint(x: pair.0, y: pair.1)
    }

    private static func points(_ value: Any?) throws -> [MeeshyDragTarget: CGPoint] {
        let table = try #require(value as? [String: Any])
        return try table.reduce(into: [:]) { result, entry in
            let target = try #require(MeeshyDragTarget(rawValue: entry.key))
            result[target] = try point(entry.value)
        }
    }

    private static func rect(_ value: Any?) throws -> CGRect? {
        guard let items = value as? [Any] else { return nil }
        return CGRect(x: try number(items[0]), y: try number(items[1]), width: try number(items[2]), height: try number(items[3]))
    }

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func json() throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K25-MeeshyDragTargets.vectors.json")
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

private enum MeeshyDragTargetsVectorError: Error {
    case unreadable(String)
}
