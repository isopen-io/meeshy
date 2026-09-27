import XCTest

/// **Une vidéo reçue dans le fil ne se lit JAMAIS dans sa cellule** (#8231,
/// directive porteur 2026-09-27 : « Supprime la lecture de vidéo inline ! Au
/// touché d'une vidéo/scène reçue, ouvrir en plein écran DIRECTEMENT ! »).
///
/// La cellule — tuile de grille et page de carrousel des Bulles, tuile du mode
/// Focal (et donc Script, qui la monte) — montre un POSTER fixe et rend le
/// toucher à son hôte, qui ouvre la galerie plein écran : c'est elle qui lance
/// la lecture. Aucun `AVPlayer` n'est donc créé dans le fil.
///
/// Ces règles ne s'observent pas sans rendu (le dépôt n'embarque pas
/// d'introspection de vues) : elles se tiennent en gardes de source, lues
/// commentaires retirés.
///
/// 1. Tout `MeeshyVideoPlayer(` restant dans les fichiers de cellules du fil
///    est un lecteur PLEIN ÉCRAN (le cover local de repli, sans galerie).
/// 2. Le suivi de lecture inline (miroir de `SharedAVPlayerManager.activeURL`
///    qui masquait le pied de bulle) a disparu avec la lecture qu'il suivait.
/// 3. Les trois cellules vidéo montent LE poster partagé, et ce poster ne
///    capte aucun toucher : le geste de la cellule est le seul déclencheur.
final class ConversationVideoFullscreenOnlyGuardTests: XCTestCase {

    private static let filCellFiles = [
        "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift",
        "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift",
        "Meeshy/Features/Main/Views/Bubble/BubbleAttachmentView.swift",
        "Meeshy/Features/Main/Focal/Row/FocalAttachmentBlock.swift",
    ]

    private static let posterPath = "Meeshy/Features/Main/Views/Bubble/ConversationVideoPoster.swift"

    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
    }

    private func stripped(_ relativePath: String) throws -> String {
        let url = appRoot.appendingPathComponent(relativePath)
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    /// Les appels `MeeshyVideoPlayer(` d'une source, chacun jusqu'à la
    /// parenthèse qui le ferme.
    private func playerCalls(in source: String) -> [String] {
        var calls: [String] = []
        var cursor = source.startIndex
        while let start = source.range(of: "MeeshyVideoPlayer(", range: cursor..<source.endIndex) {
            var depth = 1
            var index = start.upperBound
            while index < source.endIndex, depth > 0 {
                if source[index] == "(" { depth += 1 }
                if source[index] == ")" { depth -= 1 }
                index = source.index(after: index)
            }
            calls.append(String(source[start.lowerBound..<index]))
            cursor = index
        }
        return calls
    }

    func test_lesSourcesDuFilSontBienLues() throws {
        for path in Self.filCellFiles {
            XCTAssertFalse(try stripped(path).isEmpty, "source vide ou introuvable : \(path)")
        }
    }

    func test_aucuneCelluleDuFil_neMonteDeLecteurVideoInline() throws {
        for path in Self.filCellFiles {
            for call in playerCalls(in: try stripped(path)) {
                XCTAssertTrue(
                    call.contains("style: .fullscreen"),
                    "\(path) monte un MeeshyVideoPlayer hors plein écran — le fil ne lit plus de vidéo (#8231) :\n\(call)"
                )
                XCTAssertFalse(call.contains("performance: .inline"), "\(path) : profil de lecture inline")
                XCTAssertFalse(call.contains("performance: .carousel"), "\(path) : profil de lecture en carrousel")
            }
        }
    }

    func test_leSuiviDeLectureInline_aDisparuAvecLaLecture() throws {
        for path in Self.filCellFiles {
            let source = try stripped(path)
            for symbol in ["hasPlayingInlineVideo", "inlineVideoActiveURL", "SharedAVPlayerManager"] {
                XCTAssertEqual(
                    AppSourceGuard.occurrences(ofIdentifier: symbol, in: source), 0,
                    "\(path) cite encore `\(symbol)` : plus aucune vidéo ne joue dans une cellule du fil"
                )
            }
        }
    }

    func test_lesCellulesVideo_montentLePosterPartage() throws {
        let bubbles = try stripped("Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift")
        XCTAssertGreaterThanOrEqual(
            bubbles.components(separatedBy: "ConversationVideoPoster(").count - 1, 2,
            "la tuile de grille ET la page de carrousel montent le poster partagé"
        )
        let focal = try stripped("Meeshy/Features/Main/Focal/Row/FocalAttachmentBlock.swift")
        XCTAssertTrue(focal.contains("ConversationVideoPoster("), "la tuile Focal/Script monte le poster partagé")
    }

    func test_leCorpsDeLaTuile_nAPlusDeBrancheLecteur() throws {
        let bubbles = try stripped("Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift")
        XCTAssertEqual(AppSourceGuard.occurrences(ofIdentifier: "videoBody", in: bubbles), 0,
                       "une vidéo passe par le même corps que l'image : poster + toucher → plein écran")
        XCTAssertEqual(AppSourceGuard.occurrences(ofIdentifier: "VideoAvailabilityResolver", in: bubbles), 0,
                       "la disponibilité (téléchargement) se résout au plein écran, plus dans la cellule")
    }

    func test_lePoster_neCapteAucunToucher_etNeLitRien() throws {
        let poster = try stripped(Self.posterPath)
        XCTAssertTrue(poster.contains(".allowsHitTesting(false)"),
                      "le poster rend le toucher à la cellule : un seul déclencheur, celui qui ouvre le plein écran")
        XCTAssertTrue(poster.contains("MeeshyVideoThumbnail("),
                      "le poster réutilise l'extraction de première image du SDK")
        for forbidden in ["MeeshyVideoPlayer(", "AVPlayer", "onTapGesture", "Button"] {
            XCTAssertFalse(poster.contains(forbidden), "le poster est une image fixe décorative : `\(forbidden)` interdit")
        }
    }
}
