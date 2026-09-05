import XCTest
@testable import Meeshy

/// **La chaîne d'un GIF collé, maillon par maillon** (#3956).
///
/// Le lot #4925 a livré un décodeur parfait et une vue parfaite, et la feature
/// n'existait pas : rien ne montait la vue. Le lot présent a le MÊME mode de
/// panne, sur une chaîne plus longue — collage → bibliothèque → grille → pose →
/// couche → publication. **Chaque maillon peut se couper sans qu'aucun autre
/// rougisse** : les octets manquants ne produisent pas une erreur, ils
/// produisent une image FIXE. Un sticker s'affiche, l'auteur le voit, et
/// personne ne sait que le mouvement est mort.
///
/// > La question n'est donc jamais « le décodeur marche-t-il ? » mais **« qui
/// > passe les octets au suivant ? »** — et elle se pose une fois par maillon.
///
/// Ces gardes lisent la source, commentaires retirés (`strippingComments`) :
/// une doctrine qui cite la ligne cherchée ne doit pas passer pour la ligne.
final class AnimatedStickerChainGuardTests: XCTestCase {

    private func appSource(_ relativePath: String) throws -> String {
        try MyStoriesSourceCorpus.text(of: relativePath)
    }

    /// Le SDK vit à côté de `apps/ios`, pas dedans — et la chaîne traverse la
    /// frontière deux fois (pose et couche côté SDK, collage et publication
    /// côté app). C'est précisément ce qui permet à un maillon de se couper sans
    /// qu'aucune suite d'un seul côté ne s'en aperçoive.
    private func sdkSource(_ relativePath: String, file: StaticString = #filePath) throws -> String {
        let repo = MyStoriesSourceCorpus.appRoot(file: file)   // …/apps/ios
            .deletingLastPathComponent()                        // …/apps
            .deletingLastPathComponent()                        // …/
        let url = repo.appendingPathComponent("packages/MeeshySDK/Sources/\(relativePath)")
        return MyStoriesSourceCorpus.strippingComments(try String(contentsOf: url, encoding: .utf8))
    }

    // MARK: - Maillon 1 — le collage GARDE les octets

    /// L'écriture dans la bibliothèque passe par la règle, jamais par un
    /// `pngData()` direct : c'est ce ré-encodage qui détruisait l'animation
    /// AVANT le disque, donc avant tout site capable de la rattraper.
    func test_leCollage_remetLesOctetsALaRegle_jamaisUneImageReencodee() throws {
        let paste = try appSource("Meeshy/Features/Main/Composer/StickerLibraryPaste.swift")

        XCTAssertTrue(paste.contains("StickerLibraryArtwork.keep("),
                      "le collage doit passer par la règle : sans elle, un GIF est ré-encodé en PNG et perd ses images.")
        XCTAssertTrue(paste.contains("StickerLibraryArtwork.item("),
                      "relire la bibliothèque doit redécouvrir l'animation dans les octets.")
    }

    // MARK: - Maillon 2 — la grille JOUE ce qu'elle garde

    /// `Image(uiImage:)` ne joue pas une image animée : il lit le `cgImage` de
    /// base et ignore le tableau. Une grille écrite avec lui montrerait la
    /// première image d'un GIF sans qu'une seule ligne soit fausse.
    func test_laGrilleDeLaBibliotheque_monteLaVueAnimee() throws {
        let picker = try sdkSource("MeeshyUI/Story/StickerPickerView+Emoji.swift")

        XCTAssertTrue(picker.contains("AnimatedImageView("),
                      "la grille « Mes stickers » doit MONTER la vue animée, sinon un GIF y reste figé.")
        XCTAssertTrue(picker.contains("AnimatedImageMemo.decoded("),
                      "…et passer par la mémoire : une grille se re-rend à chaque frappe.")
    }

    // MARK: - Maillon 3 — la pose EMPORTE les octets

    /// Les deux sites de pose — celui du composer SDK et celui du meuble — sont
    /// des JUMEAUX : un seul câblé ferait animer le sticker par une porte et le
    /// figerait par l'autre, pour le même geste utilisateur.
    func test_lesDeuxSitesDePose_emportentLesOctets() throws {
        let sdkPose = try sdkSource("MeeshyUI/Story/StoryComposerView+Media.swift")
        let hostPose = try appSource("Meeshy/Features/Main/Composer/MeeshyComposerHost+Intake.swift")

        XCTAssertTrue(sdkPose.contains("animatedData: item.animatedData"),
                      "poser depuis le composer SDK doit emporter les octets du sticker.")
        XCTAssertTrue(hostPose.contains("animatedData: item.animatedData"),
                      "poser depuis le meuble doit emporter les mêmes octets — sinon une porte anime et l'autre fige.")
    }

    // MARK: - Maillon 4 — la scène REÇOIT les octets

    /// Le composer passe son dictionnaire au canvas. Sans ce fil, la couche a
    /// beau savoir jouer : elle n'a rien à jouer, et peint l'image fixe.
    func test_leComposer_passeSesOctetsAuCanvas() throws {
        let canvas = try sdkSource("MeeshyUI/Story/StoryComposerView+Canvas.swift")

        XCTAssertTrue(canvas.contains("loadedStickerAnimations: viewModel.loadedStickerAnimations"),
                      "le canvas du composer doit recevoir les octets animés du modèle de vue.")
    }

    /// Les trois surfaces du meuble montent la MÊME scène embarquée. Une seule
    /// non câblée ferait animer le sticker dans une surface et le figerait dans
    /// la voisine — l'écart le plus difficile à nommer pour un utilisateur.
    func test_lesTroisSurfacesDuMeuble_passentLesOctets() throws {
        for chemin in [
            "Meeshy/Features/Main/Composer/ComposerSceneSurface.swift",
            "Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift",
            "Meeshy/Features/Main/Composer/ComposerObjectEditorView.swift"
        ] {
            let source = try appSource(chemin)
            XCTAssertTrue(source.contains("loadedStickerAnimations: sceneStickerAnimations"),
                          "\(chemin) ne passe pas les octets animés à sa scène.")
        }
    }

    // MARK: - Maillon 5 — la couche JOUE le chemin SYNCHRONE

    /// Le chemin animé du #4925 était ASYNCHRONE — il partait d'une URL
    /// publiée. Dans le composer il n'y a ni URL ni `postMediaId` : sans une
    /// branche synchrone, un GIF fraîchement collé n'atteint jamais le
    /// décodeur.
    func test_laCouche_aUneBrancheSynchroneAnimee() throws {
        let layer = try sdkSource("MeeshyUI/Story/Canvas/Layers/StoryStickerLayer.swift")

        XCTAssertTrue(layer.contains("synchronousAnimation("),
                      "la couche doit tenter les octets du composer AVANT de peindre le bitmap fixe.")
        XCTAssertTrue(layer.contains("!playsAnimatedContents"),
                      "…et ne pas ré-armer la rasterisation par-dessus, qui figerait le cycle sur son cache.")
    }

    // MARK: - Maillon 6 — la publication ENVOIE le GIF

    /// **Le maillon dont la rupture ne se voit que chez le LECTEUR.** Publier
    /// un `pngData()` détruit l'original : le composer aura dit vrai, la
    /// publication non, et l'écart n'apparaît qu'une fois l'asset en ligne.
    func test_laPublication_envoieLesOctetsAnimesSousLeurPropreMime() throws {
        let upload = try appSource("Meeshy/Features/Main/ViewModels/StoryViewModel+PublicationUpload.swift")

        XCTAssertTrue(upload.contains("AnimatedImageEligibility.container("),
                      "le mime doit venir du CONTENEUR : un GIF envoyé en `image/png` arrive mal étiqueté partout.")
        XCTAssertTrue(upload.contains("animatedData: upload.loadedStickerAnimations["),
                      "le publish doit lire les octets animés du sticker.")
        XCTAssertTrue(upload.contains("animatedData: loadedStickerAnimations["),
                      "l'édition d'une story publiée aussi — sinon elle remplace un GIF en ligne par son image 1.")
    }
}
