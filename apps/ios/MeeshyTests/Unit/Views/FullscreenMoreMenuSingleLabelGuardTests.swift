import XCTest
@testable import Meeshy

/// **Le ⋯ plein écran n'a qu'UN nom pour VoiceOver, porté par l'atome** (#8918).
///
/// `FullscreenMoreMenu` (MeeshyUI) se nomme lui-même. La galerie le recouvrait
/// par « Autres actions », la story par « Options de la story » : le MÊME
/// contrôle s'annonçait sous trois noms selon la visionneuse, et rien ne
/// rougissait — chaque libellé était juste chez lui.
///
/// Le témoin lit la chaîne de modificateurs posée sur chaque montage de l'atome
/// dans l'app : aucune n'y écrit de libellé. Un indice reste permis — il dit ce
/// que le menu ouvre ici, pas ce qu'est le contrôle.
final class FullscreenMoreMenuSingleLabelGuardTests: XCTestCase {

    private static let hosts = [
        "Meeshy/Features/Main/Views/ConversationMediaGalleryView+Menu.swift",
        "Meeshy/Features/Main/Views/StoryViewerView+Header.swift",
        "Meeshy/Features/Main/Views/ReelsPlayerView+ActionRail.swift",
    ]

    func test_noHost_overridesTheLabelOfTheFullscreenMoreMenu() throws {
        for host in Self.hosts {
            let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(host))
            let chains = Self.modifierChains(after: "FullscreenMoreMenu(", in: code)
                + Self.modifierChains(after: "FullscreenMoreMenu {", in: code)
            XCTAssertFalse(chains.isEmpty, "\(host) ne monte plus FullscreenMoreMenu — la garde ne mesure rien")
            for chain in chains {
                XCTAssertFalse(chain.contains(".accessibilityLabel("),
                               "\(host) renomme le ⋯ plein écran : un même contrôle doit s'annoncer sous le nom que l'atome porte")
            }
        }
    }

    /// Les modificateurs posés sur chaque appel : du `}` qui ferme le contenu de
    /// l'appel jusqu'à la première ligne qui ne commence plus par un point.
    private static func modifierChains(after call: String, in code: String) -> [String] {
        var chains: [String] = []
        var cursor = code.startIndex
        while let start = code.range(of: call, range: cursor..<code.endIndex) {
            guard let open = code.range(of: "{", range: start.upperBound..<code.endIndex) else { break }
            var depth = 0
            var index = open.lowerBound
            while index < code.endIndex {
                if code[index] == "{" { depth += 1 }
                if code[index] == "}" { depth -= 1; if depth == 0 { break } }
                index = code.index(after: index)
            }
            guard index < code.endIndex else { break }
            let rest = code[code.index(after: index)...]
            let lines = rest.split(separator: "\n", omittingEmptySubsequences: false).dropFirst()
            let chain = lines.prefix { $0.trimmingCharacters(in: .whitespaces).hasPrefix(".") }
            chains.append(chain.joined(separator: "\n"))
            cursor = code.index(after: index)
        }
        return chains
    }
}
