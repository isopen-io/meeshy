import XCTest
import CoreGraphics
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Le plein écran d'un post feuillette UN lot : ses scènes ou ses médias, puis
/// les médias joints à ses commentaires** (#6709, #6710, directive porteur
/// 2026-09-15).
///
/// > « lorsqu'on ouvre les scènes de poste, on doit utiliser LE même composant
/// > qu'on utilise pour afficher les attachements de conversation ! Et afficher
/// > en bas la liste des images du poste et des médias en commentaire ! »
///
/// Ces témoins éprouvent la COMPOSITION du lot, sans monter une vue : c'est elle
/// qui décide de ce que la galerie peint, dans quel ordre, et avec quelle
/// attribution. Un défaut d'ordre ou de doublon ne se voit sur aucune capture
/// isolée — il se voit en feuilletant, et c'est ce qu'aucun test de rendu ne fait.
final class PostGalleryLotTests: XCTestCase {

    // MARK: - Fabriques

    private func media(_ id: String,
                       _ type: FeedMediaType = .image,
                       caption: String? = nil,
                       thumbHash: String? = nil) -> FeedMedia {
        FeedMedia(id: id, type: type,
                  url: "https://cdn.meeshy.me/\(id)",
                  thumbnailUrl: "https://cdn.meeshy.me/\(id)-vignette",
                  thumbHash: thumbHash,
                  width: 1_080, height: 1_350,
                  duration: type == .video ? 12 : nil,
                  caption: caption)
    }

    private func mediaObject(_ postMediaId: String) -> ObjectV3 {
        ObjectV3(id: "objet-\(postMediaId)", kind: .media,
                 anchor: .free(x: 0.5, y: 0.5),
                 plane: .content, z: 1,
                 transform: TransformV3(),
                 payload: ["postMediaId": .string(postMediaId)])
    }

    private func scene(_ id: String,
                       media mediaId: String? = nil,
                       opening: [String: CanvasJSONValue]? = nil,
                       thumbHash: String? = nil,
                       carrierAspect: Double? = nil) -> SceneV3 {
        SceneV3(id: id,
                objects: mediaId.map { [mediaObject($0)] } ?? [],
                opening: opening,
                thumbHash: thumbHash,
                carrierAspect: carrierAspect)
    }

    private func post(media: [FeedMedia] = [],
                      scenes: [SceneV3]? = nil,
                      content: String = "",
                      originalLanguage: String? = nil,
                      translations: [String: PostTranslation]? = nil) -> FeedPost {
        var post = FeedPost(id: "p1", author: "alice", authorId: "a1",
                            content: content, timestamp: Date(timeIntervalSince1970: 1_000))
        post.media = media
        post.originalLanguage = originalLanguage
        post.translations = translations
        if let scenes {
            var effets = StoryEffects()
            effets.canvasV3 = CanvasV3(scenes: scenes)
            post.storyEffects = effets
        }
        return post
    }

    private func comment(_ id: String,
                         by author: String = "bob",
                         at seconds: TimeInterval = 2_000,
                         media: [FeedMedia] = [],
                         parentId: String? = nil) -> FeedComment {
        FeedComment(id: id, author: author, authorId: "u-\(author)",
                    content: "texte de \(id)",
                    timestamp: Date(timeIntervalSince1970: seconds),
                    parentId: parentId,
                    media: media)
    }

    /// Un post de trois scènes, chacune sur son média — la publication de test
    /// de la recette du 2026-09-15.
    private func troisScenes() -> FeedPost {
        post(media: [media("m1", .video), media("m2"), media("m3")],
             scenes: [scene("s1", media: "m1"), scene("s2", media: "m2"), scene("s3", media: "m3")])
    }

    private func compose(_ post: FeedPost,
                         comments: [FeedComment] = [],
                         languages: [String] = []) -> PostGalleryLot {
        PostGalleryLot.compose(post: post, comments: comments, preferredLanguages: languages)
    }

    // MARK: - #6709 — une scène de post s'ouvre DANS la galerie

    /// **Toute scène de post devient une page de la galerie.** Avant ce lot, un
    /// post qui portait un canvas quittait la galerie pour un second plein écran
    /// — sans cadre, sans plein cadre au toucher, sans pellicule.
    func test_unPostAScenes_chaqueSceneEstUnePageDeLaGalerie_dansLOrdreDuDocument() {
        let lot = compose(troisScenes())

        XCTAssertEqual(lot.attachments.count, 3,
                       "Les trois scènes doivent être trois pages de la galerie.")
        XCTAssertEqual(lot.attachments.compactMap { lot.scenes[$0.id]?.sceneIndex }, [0, 1, 2],
                       "Chaque page du lot doit être une scène, dans l'ordre du document.")
        XCTAssertEqual(Set(lot.attachments.compactMap { lot.scenes[$0.id]?.postId }), ["p1"])
    }

    /// `CanvasV3(migrating:)` a gravé `"s1"` en dur pendant tout le corpus legacy :
    /// une page identifiée par le seul id de scène en perdrait une.
    func test_deuxScenesHomonymes_restentDeuxPages() {
        let lot = compose(post(scenes: [scene("s1"), scene("s1")]))

        XCTAssertEqual(Set(lot.attachments.map(\.id)).count, 2,
                       "Deux scènes homonymes doivent rester deux pages distinctes.")
    }

    /// Un post SANS canvas garde ses médias visuels, dans l'ordre de publication.
    /// L'audio a son propre plein écran et n'entre pas dans le lot.
    func test_unPostSansScene_feuilletteSesMedias_dansLOrdreDePublication() {
        let lot = compose(post(media: [media("a"), media("b", .audio), media("c", .video)]))

        XCTAssertEqual(lot.attachments.map(\.id), ["a", "c"])
        XCTAssertTrue(lot.scenes.isEmpty, "Un post sans canvas n'a aucune page scène.")
    }

    /// **Le cadre d'une scène prend le rapport de SA scène**, jamais le portrait
    /// d'office : une scène composée en paysage débordait son cadre portrait.
    func test_uneScene_prendLeRapportDeSaScene() {
        let paysage = 16.0 / 9.0
        let lot = compose(post(scenes: [scene("large", carrierAspect: paysage), scene("haute")]))
        let pages = lot.attachments.compactMap { lot.scenes[$0.id] }

        XCTAssertEqual(Double(pages[0].aspect), paysage, accuracy: 0.0001)
        XCTAssertEqual(pages[1].aspect, CanvasGeometry.portraitRatio, accuracy: 0.0001)
    }

    /// Le bouton de lecture et l'appui long n'ont d'effet que sur ce qui bouge.
    func test_seuleUneSceneQuiBouge_seLit() {
        let lot = compose(post(scenes: [scene("fixe"), scene("anime", opening: ["kind": .string("fade")])]))
        let pages = lot.attachments.compactMap { lot.scenes[$0.id] }

        XCTAssertEqual(pages.map(\.moves), [false, true])
    }

    /// La vignette de la pellicule montre la scène : son ThumbHash à elle, et
    /// l'image de son média.
    func test_laVignetteDUneScene_estCelleDeSonMedia() throws {
        let lot = compose(post(media: [media("m1", thumbHash: "hash-media")],
                               scenes: [scene("s1", media: "m1", thumbHash: "hash-scene")]))
        let page = try XCTUnwrap(lot.attachments.first)

        XCTAssertEqual(page.thumbnailUrl, "https://cdn.meeshy.me/m1-vignette")
        XCTAssertEqual(page.thumbHash, "hash-scene")
    }

    /// **L'entrée se fait sur la scène touchée** (directive porteur 2026-09-06 :
    /// « en touchant une scène voisine, j'ai la première scène qui ouvre »).
    func test_lEntree_seFaitSurLaSceneTouchee_bornee() {
        let lot = compose(troisScenes())
        let ids = lot.attachments.map(\.id)

        XCTAssertEqual(PostGalleryLot.entryId(in: lot, startMediaId: nil, startSceneIndex: 2), ids[2])
        XCTAssertEqual(PostGalleryLot.entryId(in: lot, startMediaId: nil, startSceneIndex: 9), ids[2])
        XCTAssertEqual(PostGalleryLot.entryId(in: lot, startMediaId: nil, startSceneIndex: -1), ids[0])
        XCTAssertEqual(PostGalleryLot.entryId(in: lot, startMediaId: "m1", startSceneIndex: 1), ids[1],
                       "Un média du post que le lot montre par sa scène n'est pas une page : la scène décide.")
    }

    /// La légende d'une scène est celle qui lui est ADOSSÉE — la légende de son
    /// média, et non celle de la première scène.
    func test_laLegendeDUneScene_estCelleDeSonMedia() throws {
        let lot = compose(post(media: [media("m1", caption: "matin"), media("m2", caption: "soir")],
                               scenes: [scene("s1", media: "m1"), scene("s2", media: "m2")]))
        let seconde = try XCTUnwrap(lot.attachments.last?.id)

        XCTAssertEqual(lot.captionMap[seconde], "soir")
        XCTAssertEqual(lot.sceneCaptions[seconde], GallerySceneCaption(origin: .mediaCaption, mediaId: "m2"))
    }

    /// **Le Prisme descend sur la légende d'une scène** : un texte de post
    /// traduit dans la langue du lecteur est servi traduit.
    func test_laLegendeDUneScene_estServieDansLaLangueDuLecteur() throws {
        let lot = compose(post(scenes: [scene("s1")],
                               content: "Bonjour",
                               originalLanguage: "fr",
                               translations: ["en": PostTranslation(text: "Hello")]),
                          languages: ["en"])
        let page = try XCTUnwrap(lot.attachments.first?.id)

        XCTAssertEqual(lot.captionMap[page], "Hello")
        XCTAssertEqual(lot.sceneCaptions[page]?.origin, .carrierText)
    }

    // MARK: - #6710 — la pellicule porte aussi les médias des commentaires

    func test_lesMediasDesCommentaires_suiventCeuxDuPost_dansLOrdreDesCommentaires() {
        let lot = compose(post(media: [media("a")]),
                          comments: [comment("c1", media: [media("x")]),
                                     comment("c2"),
                                     comment("c3", media: [media("y", .video), media("z", .audio)])])

        XCTAssertEqual(lot.attachments.map(\.id), ["a", "x", "y"])
    }

    /// Les médias des commentaires suivent aussi les SCÈNES d'un post composé.
    func test_lesMediasDesCommentaires_suiventLesScenes() {
        let lot = compose(troisScenes(), comments: [comment("c1", media: [media("x")])])

        XCTAssertEqual(lot.attachments.count, 4)
        XCTAssertEqual(lot.attachments.last?.id, "x")
        XCTAssertNil(lot.scenes["x"], "Un média de commentaire n'est pas une scène.")
    }

    /// Un hôte qui concatène une liste et ses réponses peut présenter deux fois
    /// le même commentaire ; le pager n'aurait alors plus d'index unique par page.
    func test_unMediaPresentDeuxFois_nEntreQuUneFois() {
        let lot = compose(post(media: [media("a")]),
                          comments: [comment("c1", media: [media("x")]),
                                     comment("c1", media: [media("x")]),
                                     comment("c2", media: [media("a")])])

        XCTAssertEqual(lot.attachments.map(\.id), ["a", "x"])
    }

    /// **Une page de média de commentaire dit qui l'a joint et quand.**
    func test_unMediaDeCommentaire_estAttribueASonCommentaire() throws {
        let lot = compose(troisScenes(),
                          comments: [comment("c1", by: "bob", at: 5_000, media: [media("x")])])
        let scene = try XCTUnwrap(lot.attachments.first?.id)

        XCTAssertEqual(lot.attributions["x"],
                       PostGalleryLot.Attribution(name: "bob", avatarURL: nil,
                                                  color: FeedComment(author: "bob", authorId: "u-bob", content: "").authorColor,
                                                  date: Date(timeIntervalSince1970: 5_000),
                                                  commentId: "c1"))
        XCTAssertEqual(lot.attributions[scene]?.name, "alice")
        XCTAssertNil(lot.attributions[scene]?.commentId, "Une scène du post n'appartient à aucun commentaire.")
    }

    func test_lEntree_surUnMediaDeCommentaire_ouvreSaPage() {
        let lot = compose(troisScenes(), comments: [comment("c1", media: [media("x")])])

        XCTAssertEqual(PostGalleryLot.entryId(in: lot, startMediaId: "x", startSceneIndex: 0), "x")
    }

    // MARK: - #6710 — le temps réel ne fait pas sauter la page ouverte

    /// **Un commentaire avec média publié pendant la lecture rejoint la FIN du
    /// lot** : les pages déjà là gardent leur rang, donc la page ouverte ne bouge
    /// pas sous le doigt.
    func test_unCommentairePublieEnDirect_rejointLaFinDuLot_sansDeplacerLesPages() {
        let avant = [comment("c1", media: [media("x")]), comment("c2", media: [media("y")])]
        let apres = PostGalleryCommentFeed.adding(comment("c9", media: [media("w")]), to: avant)

        let idsAvant = compose(troisScenes(), comments: avant).attachments.map(\.id)
        let idsApres = compose(troisScenes(), comments: apres).attachments.map(\.id)

        XCTAssertEqual(Array(idsApres.prefix(idsAvant.count)), idsAvant)
        XCTAssertEqual(idsApres.last, "w")
    }

    /// Un commentaire déjà présent (écho socket de son propre envoi) se met à jour
    /// sur place au lieu d'apparaître deux fois.
    func test_unCommentaireDejaPresent_seMetAJourSurPlace() {
        let avant = [comment("c1", media: [media("x")]), comment("c2")]
        let apres = PostGalleryCommentFeed.adding(comment("c1", media: [media("x"), media("v")]), to: avant)

        XCTAssertEqual(apres.map(\.id), ["c1", "c2"])
        XCTAssertEqual(apres.first?.media.map(\.id), ["x", "v"])
    }

    /// **Un commentaire supprimé emporte son média, et ses réponses.**
    func test_unCommentaireSupprime_retireSonMediaEtSesReponses_sansReordonner() {
        let fil = [comment("c1", media: [media("x")]),
                   comment("r1", media: [media("rx")], parentId: "c1"),
                   comment("c2", media: [media("y")]),
                   comment("c3", media: [media("z")])]
        let reste = PostGalleryCommentFeed.removing(commentId: "c1", from: fil)

        XCTAssertEqual(compose(post(media: [media("a")]), comments: reste).attachments.map(\.id),
                       ["a", "y", "z"])
    }

    /// **Le cache complète ce qui est déjà affiché sans le réordonner** : ce que
    /// le fil embarquait garde son rang, ce que le cache apporte vient après.
    func test_leCacheCompleteLeFil_sansReordonnerCeQuiEstDejaLa() {
        let embarques = [comment("c1"), comment("c2")]
        let cache = [comment("c2", media: [media("y")]), comment("c1"), comment("c3", media: [media("z")])]
        let fusion = PostGalleryCommentFeed.merging(cache, into: embarques)

        XCTAssertEqual(fusion.map(\.id), ["c1", "c2", "c3"])
        XCTAssertEqual(fusion[1].media.map(\.id), ["y"], "La version du cache remplace l'embarquée.")
    }

    // MARK: - #6709 — lire et mettre en pause une scène

    func test_lAppuiLong_metEnPause_puisBascule() {
        XCTAssertFalse(GalleryScenePlayback.playing(after: .pause, isPlaying: true))
        XCTAssertTrue(GalleryScenePlayback.playing(after: .togglePlayback, isPlaying: false))
        XCTAssertFalse(GalleryScenePlayback.playing(after: .togglePlayback, isPlaying: true))
        XCTAssertTrue(GalleryScenePlayback.playing(after: .none, isPlaying: true))
    }
}
