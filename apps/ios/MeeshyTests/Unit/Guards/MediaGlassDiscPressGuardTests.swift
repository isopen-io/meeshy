import XCTest
@testable import Meeshy

/// **Le disque « télécharger » d'un média et le ✕ de l'écran visiteur répondent à l'appui par le verre du kit** (#18305).
///
/// Les deux disques étaient posés à la main (`Circle().fill(.ultraThinMaterial)`,
/// `.background(.ultraThinMaterial, in: Circle())`) dans un bouton au style par défaut
/// ou `.plain` : ni verre interactif d'iOS 26, ni état pressé du kit. Le disque de
/// téléchargement garde ses 56 pt et son disque d'accent, donc il passe par l'entrée
/// de verre du kit sous `MeeshyGlassPressStyle` ; le ✕ fait 44 pt, donc il EST un
/// `MeeshyGlassButton`.
final class MediaGlassDiscPressGuardTests: XCTestCase {

    private static let badgePath = "Meeshy/Features/Main/Views/DownloadBadgeView.swift"
    private static let visitorPath = "Meeshy/Features/Main/Views/VisitorContentView.swift"

    private func code(_ path: String) throws -> String {
        let unit = try AppSourceGuard.unit(path)
        XCTAssertFalse(unit.isEmpty, "la garde lit une source vide : chemin faux (\(path))")
        return AppSourceGuard.stripComments(unit)
            .components(separatedBy: .whitespacesAndNewlines)
            .joined()
    }

    private static let handMadeMaterialDiscs = [
        "Circle().fill(.ultraThinMaterial",
        "Circle().fill(.thinMaterial",
        "Circle().fill(.regularMaterial",
        ".background(.ultraThinMaterial,in:Circle())",
        ".background(.thinMaterial,in:Circle())",
    ]

    func test_downloadBadge_and_visitorClose_drawNoHandMadeMaterialDisc() throws {
        for path in [Self.badgePath, Self.visitorPath] {
            let source = try code(path)
            for forbidden in Self.handMadeMaterialDiscs {
                XCTAssertFalse(source.contains(forbidden), "\(path) pose un disque de verre à la main : « \(forbidden) »")
            }
        }
    }

    func test_downloadBadge_answersThePressThroughTheKitGlass() throws {
        let source = try code(Self.badgePath)
        XCTAssertTrue(source.contains(".meeshyGlass(in:Circle()") && source.contains("isInteractive:true"),
                      "le disque « télécharger » passe par le verre interactif du kit")
        XCTAssertTrue(source.contains(".buttonStyle(MeeshyGlassPressStyle())"),
                      "le bouton « télécharger » pose l'état pressé que le verre du kit lit")
    }

    func test_downloadBadge_glassCarriesTheAccentDiscAndArrow() throws {
        let source = try code(Self.badgePath)
        XCTAssertNil(source.range(of: #"Color\.clear\.frame\([^)]*\)\.meeshyGlass\("#, options: .regularExpression),
                     "le verre posé sur un Color.clear voisin ne presse que son liseré : le disque d'accent et la flèche restent figés à l'appui")
        let glassedDiscs = source.components(separatedBy: "}.frame(width:").dropFirst()
            .filter { $0.range(of: #"^[^)]*\)\.meeshyGlass\(in:Circle\(\),isInteractive:true\)"#, options: .regularExpression) != nil }
        XCTAssertEqual(glassedDiscs.count, 2,
                       "les deux formes du disque « télécharger » posent le verre sur la pile qui porte le disque d'accent et la flèche")
    }

    func test_visitorClose_isAKitGlassButton() throws {
        let source = try code(Self.visitorPath)
        XCTAssertTrue(source.contains("MeeshyGlassButton(systemImage:\"xmark\""),
                      "le ✕ de l'écran visiteur est un bouton de verre du kit")
        XCTAssertTrue(source.contains("action:onClose"), "le ✕ garde sa sortie")
    }
}
