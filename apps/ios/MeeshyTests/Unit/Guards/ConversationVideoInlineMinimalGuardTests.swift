import XCTest

/// **Une vidéo reçue dans le fil se lit avec TROIS contrôles, et son toucher
/// ouvre le plein écran** (#8231).
///
/// Directive porteur 2026-09-27 : « Au touché d'une vidéo/scène reçue, ouvrir
/// en plein écran DIRECTEMENT ! », précisée le même jour sur la PR : « Il faut
/// permettre de jouer en inline mais avec peu de contrôleurs : son, pause/play
/// et plein écran ! »
///
/// Donc, dans les cellules du fil — tuile de grille et page de carrousel des
/// Bulles, tuile Focal (que Script monte aussi) :
///
/// 1. tout lecteur INLINE porte le jeu `.inlineMinimal` (son · lecture/pause ·
///    plein écran), jamais le jeu complet ;
/// 2. son toucher HORS contrôles ouvre le plein écran (`surfaceTapExpands`),
///    et il a un hôte de plein écran (`onExpand`) ;
/// 3. aucun geste de cellule ne s'ajoute EN PLUS de ceux du lecteur : un
///    `.simultaneousGesture` de tap faisait jouer la vidéo dans la bulle ET
///    ouvrir la galerie sur un seul toucher du bouton lecture.
///
/// Les lecteurs PLEIN ÉCRAN (le cover local de repli) ne sont pas visés. Ces
/// règles ne s'observent pas sans rendu (le dépôt n'embarque pas
/// d'introspection de vues) : gardes de source, commentaires retirés.
final class ConversationVideoInlineMinimalGuardTests: XCTestCase {

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

    private func inlineCalls() throws -> [(path: String, call: String)] {
        try Self.filCellFiles.flatMap { path in
            playerCalls(in: try stripped(path))
                .filter { !$0.contains("style: .fullscreen") }
                .map { (path, $0) }
        }
    }

    func test_lesSourcesDuFilSontBienLues() throws {
        for path in Self.filCellFiles {
            XCTAssertFalse(try stripped(path).isEmpty, "source vide ou introuvable : \(path)")
        }
    }

    /// Le fusible : sans lui, les règles 1 et 2 passeraient au vert en ne
    /// trouvant aucun lecteur. Grille, carrousel, Focal et le chemin de repli
    /// de `BubbleAttachmentView` en montent un chacun.
    func test_leFilMonteBienSesLecteursInline() throws {
        XCTAssertGreaterThanOrEqual(try inlineCalls().count, 4)
    }

    func test_toutLecteurInlineDuFil_nOffreQueSonLecturePauseEtPleinEcran() throws {
        for (path, call) in try inlineCalls() {
            XCTAssertTrue(call.contains("style: .inline"), "\(path) : style inattendu\n\(call)")
            XCTAssertTrue(call.contains("controls: .inlineMinimal"),
                          "\(path) monte un lecteur inline hors du jeu minimal (son, lecture/pause, plein écran) :\n\(call)")
        }
    }

    func test_toutLecteurInlineDuFil_ouvreLePleinEcranAuToucherDeSaSurface() throws {
        for (path, call) in try inlineCalls() {
            XCTAssertTrue(call.contains("surfaceTapExpands: true"),
                          "\(path) : toucher la vidéo hors contrôles doit ouvrir le plein écran\n\(call)")
            XCTAssertTrue(call.contains("onExpand:"),
                          "\(path) : sans hôte de plein écran, le toucher et le bouton plein écran ne font rien\n\(call)")
        }
    }

    func test_aucunGesteDeCelluleNeDoubleCeuxDuLecteur() throws {
        for path in Self.filCellFiles {
            XCTAssertFalse(try stripped(path).contains(".simultaneousGesture(TapGesture"),
                           "\(path) : un tap simultané fait jouer ET ouvrir le plein écran sur un seul toucher")
        }
    }

    /// La tuile de débordement (« +N ») et la pièce protégée ne lisent rien :
    /// elles montrent le poster partagé, et leur toucher garde son chemin
    /// (carrousel, révélation).
    func test_lePosterPartage_neCapteAucunToucher_etNeLitRien() throws {
        let poster = try stripped(Self.posterPath)
        XCTAssertTrue(poster.contains(".allowsHitTesting(false)"),
                      "le poster rend le toucher à la cellule : un seul déclencheur")
        XCTAssertTrue(poster.contains("MeeshyVideoThumbnail("),
                      "le poster réutilise l'extraction de première image du SDK")
        for forbidden in ["MeeshyVideoPlayer(", "AVPlayer", "onTapGesture", "Button(", "Button {"] {
            XCTAssertFalse(poster.contains(forbidden), "le poster est une image fixe décorative : `\(forbidden)` interdit")
        }
        let bubbles = try stripped("Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift")
        XCTAssertTrue(bubbles.contains("ConversationVideoPoster("),
                      "la tuile de débordement et la vidéo protégée montrent le poster partagé")
    }
}
