import XCTest
import MeeshySDK
@testable import Meeshy

/// #13864 (I1, R2), #14457 — « Texte du post » existe en post et en réel,
/// jamais en story ; il se pose depuis une OPTION du rail, au pied des outils,
/// et non plus depuis le socle : cocher Post ne change ni la scène ni le socle.
/// Le titre dit ce qui est écrit, ou son nom tant que rien ne l'est ; la porte
/// du fil ouvre la scène au repos, comme la story (#16207) ; le ⋯ ne la double pas.
final class ComposerPostTextPillTests: XCTestCase {

    /// **La porte du fil ouvre la MÊME scène au repos que la story** (#16207,
    /// jumelle d'Android #16203) : un clavier levé sur « Texte du post » au
    /// montage réduisait la scène et retirait ses outils et Publier.
    func test_opensOnAppear_laPorteDuFil_ouvreLaSceneAuRepos_sansClavier() {
        XCTAssertFalse(ComposerPostTextPill.opensOnAppear(opening: .keyboardOnContent, format: .post),
                       "le post du fil s'ouvre au repos ; son texte s'écrit depuis l'option de la colonne")
        XCTAssertFalse(ComposerPostTextPill.opensOnAppear(opening: .keyboardOnContent, format: .reel),
                       "le réel aussi se compose sur la scène, au repos")
        XCTAssertFalse(ComposerPostTextPill.opensOnAppear(opening: .keyboardOnContent, format: .story))
        XCTAssertFalse(ComposerPostTextPill.opensOnAppear(opening: .mediaSeeded, format: .post))
        XCTAssertFalse(ComposerPostTextPill.opensOnAppear(opening: .resume, format: .post))
    }

    /// Aucune porte, aucun format composé sur la scène : le texte du post ne
    /// s'ouvre jamais au montage.
    func test_opensOnAppear_aucuneOuverture_neLeveLeClavierSurUneScene() {
        let formats: [ComposerFormat] = [.story, .post, .reel, .status]
        let scenes = formats.filter { ComposerFormatVariant.of($0).composesOnScene }
        XCTAssertEqual(scenes, [.story, .post, .reel], "les trois formats de la scène")
        for ouverture in ComposerOpening.allCases {
            for format in scenes {
                XCTAssertFalse(ComposerPostTextPill.opensOnAppear(opening: ouverture, format: format),
                               "\(format) ouvert par \(ouverture) : la scène s'ouvre au repos")
            }
        }
    }

    /// **Seule une surface SANS scène peut lever un clavier à l'ouverture**
    /// (miroir d'Android `ComposerProfile.raisesKeyboardOnOpen`, #16203).
    func test_raisesKeyboardOnOpen_seuleUneSurfaceSansScene() {
        for ouverture in ComposerOpening.allCases {
            for format in [ComposerFormat.story, .post, .reel] {
                XCTAssertFalse(ComposerSurfaceRouting.raisesKeyboardOnOpen(opening: ouverture, format: format),
                               "\(format) ouvert par \(ouverture) : la scène s'ouvre au repos")
            }
        }
        XCTAssertTrue(ComposerSurfaceRouting.raisesKeyboardOnOpen(opening: .keyboardOnContent, format: .status),
                      "l'humeur n'a pas de scène : sa porte du clavier peut le lever")
        XCTAssertFalse(ComposerSurfaceRouting.raisesKeyboardOnOpen(opening: .moodGrid, format: .status),
                       "la grille d'humeurs passe avant le clavier")
    }

    func test_opensOnAppear_laPhotothequeDOffice_passeAvantLeTexte() {
        XCTAssertFalse(ComposerPostTextPill.opensOnAppear(opening: .keyboardOnContent, format: .post, picksFirst: true),
                       "la photothèque ouverte à la création d'un post ne se double pas d'un clavier levé")
    }

    func test_lePlusMenu_neDoublePlusLeTexteDuPost() {
        XCTAssertFalse(ComposerMoreMenuEntry.allCases.compactMap(\.door).contains(.content),
                       "« Texte du post » est une option du rail ; le ⋯ ne l'ouvre pas")
    }

    // MARK: - #14457 · Story, post et réel partagent la même géographie

    private func outilsAuRepos(_ format: ComposerFormat) -> [ComposerRestTool] {
        ComposerRestChrome.tools(offered: ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors,
                                                                   format: format, allowsCapture: true))
    }

    /// **Le socle ne connaît pas le format** : la scène est le plus grand 9:16
    /// AU-DESSUS du socle (`composerFloatingSocle` réserve sa hauteur), donc une
    /// rangée du socle qui n'existe qu'en post réduit la scène dès qu'on coche
    /// Post, sans clavier ni feuille — la loi #14249 défaite.
    func test_cocherPost_neChangePasLeSocle_doncPasLeCadreDeLaScene() throws {
        let hote = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        XCTAssertTrue(hote.contains("var socle: some View"), "Source du socle introuvable — la garde ne mesurerait rien.")
        XCTAssertFalse(hote.contains("ComposerPostTextPillView"),
                       "Une rangée « Texte du post » au socle réduit la scène dès qu'on coche Post.")
        XCTAssertFalse(hote.contains("socleServesPostText"),
                       "Le socle ne lit aucun format : il porte l'audience et Publier, partout pareil.")
    }

    func test_cocherPost_ajouteUneOption_auPiedDesOutils_rienDAutre() {
        let story = outilsAuRepos(.story)
        for format in [ComposerFormat.post, .reel] {
            let outils = outilsAuRepos(format)
            XCTAssertEqual(outils.filter { $0 != .postText }, story, "\(format) : les outils de la story, à l'identique")
            XCTAssertEqual(Array(outils.suffix(2)), [.postText, .more], "\(format) : l'option se pose juste avant ⋯")
        }
        XCTAssertFalse(story.contains(.postText), "une story n'a pas de texte hors de ses scènes")
    }

    func test_lOption_ouvreLeTexteDuPost_sousLeMemeNom() {
        XCTAssertEqual(ComposerRestTool.postText.door, .content)
        XCTAssertEqual(ComposerRestChromeCopy.label(.postText), ComposerPostTextPill.label)
        XCTAssertEqual(ComposerLabeledRailCopy.title(.tool(.postText)), ComposerPostTextPill.label)
    }

    /// **Un point discret dit qu'un texte est posé** — le même que celui du son
    /// de fond ; VoiceOver lit la première ligne.
    func test_lIndicateur_neParaitQuAvecUnTexte() {
        XCTAssertFalse(ComposerPostTextPill.isWritten(""))
        XCTAssertFalse(ComposerPostTextPill.isWritten(" \n "))
        XCTAssertTrue(ComposerPostTextPill.isWritten("Au marché ce matin"))
        XCTAssertEqual(ComposerPostTextPill.spokenValue("\nAu marché ce matin\nla suite"), "Au marché ce matin")
        XCTAssertEqual(ComposerPostTextPill.spokenValue(""), "")
    }
}
