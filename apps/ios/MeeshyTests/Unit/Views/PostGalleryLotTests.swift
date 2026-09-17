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

    private func mediaObject(_ postMediaId: String, aspectRatio: Double? = nil) -> ObjectV3 {
        var payload: [String: CanvasJSONValue] = ["postMediaId": .string(postMediaId)]
        // **Ce qu'il faut pour qu'une scène soit vue comme UNE IMAGE** (#6806).
        // `SceneFraming.imageAspect` exige les deux ensemble : un objet reconnu
        // comme FOND (`isBackground` ⇒ `plane == .bg`) ET un rapport DÉCLARÉ
        // (`declaredAspect` ⇒ la clé `aspectRatio` du payload). Il manquait les
        // deux : la scène passait pour un canvas ordinaire, les deux surfaces
        // servaient le même rapport, et le témoin qui les comparait ne mesurait
        // plus rien — vert par omission.
        if let aspectRatio { payload["aspectRatio"] = .number(aspectRatio) }
        return ObjectV3(id: "objet-\(postMediaId)", kind: .media,
                        anchor: .free(x: 0.5, y: 0.5),
                        plane: aspectRatio == nil ? .content : .bg, z: 1,
                        transform: TransformV3(),
                        payload: payload)
    }

    private func scene(_ id: String,
                       media mediaId: String? = nil,
                       mediaAspectRatio: Double? = nil,
                       opening: [String: CanvasJSONValue]? = nil,
                       thumbHash: String? = nil,
                       carrierAspect: Double? = nil) -> SceneV3 {
        SceneV3(id: id,
                objects: mediaId.map { [mediaObject($0, aspectRatio: mediaAspectRatio)] } ?? [],
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

    /// **Une scène qui n'est qu'une image PLUS LARGE qu'elle se cadre au rapport
    /// de son image** — la loi partagée de présentation d'une scène
    /// (`SceneFraming.presentationAspect`, #6697, fusionnée par #6736).
    ///
    /// Mesuré à la recette staging du 2026-09-15 sur le post « PAYSAGE 16:9 » :
    /// un seul objet, un fond au rapport 1,7778, sans cadrage déclaré. Cadré en
    /// 9:16, le fond rempli sortait des deux côtés du cadre et la page n'en
    /// montrait que le tiers central — la carte du fil et le détail ont été
    /// corrigés par #6736, et la galerie les rejoint par le même point.
    func test_uneSceneQuiNestQuUneImagePaysage_seCadreAuRapportDeSonImage() throws {
        let paysage = 16.0 / 9.0
        let fond = ObjectV3(id: "fond", kind: .media, anchor: .free(x: 0.5, y: 0.5),
                            plane: .content, z: 0,
                            transform: TransformV3(scale: 1, rotation: 0, opacity: 1),
                            payload: ["isBackground": .bool(true),
                                      "aspectRatio": .number(paysage),
                                      "postMediaId": .string("m1"),
                                      "mediaType": .string("image")])
        let lot = compose(post(media: [media("m1")], scenes: [SceneV3(id: "s1", objects: [fond])]))
        let page = try XCTUnwrap(lot.attachments.first.flatMap { lot.scenes[$0.id] })

        XCTAssertEqual(Double(page.aspect), paysage, accuracy: 0.0001,
                       "Cadrée en 9:16, une scène qui n'est qu'une image paysage n'en montre que le tiers central.")
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
    }

    /// **Un média du post montré par une scène ouvre CETTE scène.** C'est le
    /// chemin d'une citation : un commentaire qui cite le média de la scène 3
    /// doit rouvrir la scène 3, pas la première (#6711).
    func test_lEntree_parUnMediaDuPost_ouvreLaSceneQuiLeMontre() {
        let lot = compose(troisScenes())

        XCTAssertEqual(PostGalleryLot.entryId(in: lot, startMediaId: "m3", startSceneIndex: 0),
                       lot.attachments[2].id)
    }

    /// **Répondre depuis une scène cite le média qu'elle MONTRE** — la même
    /// citation que #6578, jamais un second format. Un média JOINT à un
    /// commentaire n'est pas un média du post : le serveur refuserait la
    /// citation, donc la page n'offre pas le geste (loi 4).
    func test_repondre_citeLeMediaDuPost_etJamaisUnMediaDeCommentaire() throws {
        let publication = troisScenes()
        let lot = compose(publication, comments: [comment("c1", media: [media("x")])])
        let seconde = try XCTUnwrap(lot.attachments.dropFirst().first?.id)

        XCTAssertEqual(lot.quotation(for: seconde, in: publication)?.postMediaId, "m2")
        XCTAssertEqual(lot.quotation(for: seconde, in: publication)?.kind, .image)
        XCTAssertNil(lot.quotation(for: "x", in: publication))

        let texte = post(scenes: [scene("s1")])
        let sansMedia = compose(texte)
        XCTAssertNil(sansMedia.quotation(for: try XCTUnwrap(sansMedia.attachments.first?.id), in: texte),
                     "Une scène sans média n'a rien à citer.")

        let photos = post(media: [media("a")])
        XCTAssertEqual(compose(photos).quotation(for: "a", in: photos)?.postMediaId, "a")
    }

    /// **En PLEIN CADRE, une scène se présente comme une SCÈNE** (#6806,
    /// directive porteur 2026-09-16 : « il faut pas afficher une troisieme couche
    /// en plein plein écran, mais juste agrandir le canvas à sa taille total du
    /// viewport »).
    ///
    /// `SceneFraming.presentationAspect` rend `imageAspect ?? canvasAspect` :
    /// une scène qui n'est qu'une image se présente au rapport de son IMAGE.
    /// C'est juste sur une carte de fil — on y ouvre une photo, et une fenêtre
    /// posée sur un canvas 9:16 en montrerait le milieu. **C'est faux en plein
    /// écran**, où ce qu'on ouvre est la scène.
    ///
    /// Mesuré au simulateur avant ce lot, sur une scène-image quasi carrée :
    /// `media = 402 × 398,6` dans un cadre de 402 × 874 — le média touchait
    /// gauche et droite, et laissait **237,7 pt de sol en haut ET en bas**, soit
    /// 54 % de l'écran en fond flou. Au rapport du CANVAS, il reste 79,6 pt de
    /// chaque côté : le même défaut divisé par trois, sans rien rogner.
    @MainActor
    func test_enPleinCadre_uneSceneImage_sePresenteAuRapportDeSonCanvas() throws {
        // Une scène qui n'est QU'UNE image, déclarée en 0,8 — plus large que le
        // 9:16 du canvas, donc `imageAspect` la reconnaît (sans `carrierAspect`,
        // qui ferait de la scène un cadre et non une photo).
        let lot = compose(post(media: [media("photo")],
                               scenes: [scene("s", media: "photo", mediaAspectRatio: 0.8)]))
        let page = try XCTUnwrap(lot.attachments.first)

        let cardé = try XCTUnwrap(MediaGalleryStage.mediaRatio(of: page, scenes: lot.scenes,
                                                              presentation: .carded))
        let plein = try XCTUnwrap(MediaGalleryStage.mediaRatio(of: page, scenes: lot.scenes,
                                                              presentation: .full(pausedOnEntry: false)))

        XCTAssertEqual(cardé, 1_080.0 / 1_350.0, accuracy: 0.0001,
                       "cardée, la scène-image garde le rapport de son image — on y ouvre la photo")
        XCTAssertEqual(plein, CanvasGeometry.portraitRatio, accuracy: 0.0001,
                       """
                       En plein cadre, la scène se présente au rapport de son CANVAS : \
                       c'est une scène qu'on ouvre, pas une photo.
                       """)
    }

    /// **Le sol restant, mesuré des deux côtés** — la règle ne vaut que par ce
    /// qu'elle retire à l'écran.
    @MainActor
    func test_enPleinCadre_leRapportDuCanvas_diviseLeSolParTrois() throws {
        let viewport = CGSize(width: 402, height: 874)
        func sol(_ ratio: CGFloat) -> CGFloat {
            let cadre = MediaGalleryStage.resolve(
                viewport: viewport, mediaRatio: ratio,
                presentation: .full,
                corridors: MediaGalleryStage.corridors(safeTop: 59, safeBottom: 34, attachments: []))
            return (cadre.frame.height - cadre.media.height) / 2
        }

        let avant = sol(1.0)                              // rapport de l'IMAGE, carrée
        let après = sol(CanvasGeometry.portraitRatio)     // rapport du CANVAS

        // 236,0 pour un carré EXACT. Au simulateur la scène mesurée était en
        // 1,0086 et rendait 237,7 : le même ordre, sur une image réelle.
        XCTAssertEqual(avant, 236.0, accuracy: 0.5)
        XCTAssertEqual(après, 79.6, accuracy: 0.5)
        XCTAssertLessThan(après, avant / 2.5,
                          "la scène se présente au rapport de son canvas ⇒ trois fois moins de sol")
    }

    /// **Le cadre d'une page scène prend le rapport de la scène** — c'est la
    /// question que le solveur pose à chaque page. Une pièce synthétique n'a pas
    /// de dimensions : sans cette réponse, le cadre prendrait toute la zone libre.
    @MainActor
    func test_leCadreDUnePageScene_prendLeRapportDeLaScene() throws {
        let paysage: CGFloat = 16.0 / 9.0
        let lot = compose(post(scenes: [scene("large", carrierAspect: Double(paysage))]))
        let page = try XCTUnwrap(lot.attachments.first)
        let photo = MessageAttachment(id: "photo", mimeType: "image/jpeg", width: 1_600, height: 1_200)

        let rapport = try XCTUnwrap(MediaGalleryStage.mediaRatio(of: page, scenes: lot.scenes, presentation: .carded))
        XCTAssertEqual(rapport, paysage, accuracy: 0.0001)
        XCTAssertEqual(try XCTUnwrap(MediaGalleryStage.mediaRatio(of: photo, scenes: lot.scenes, presentation: .carded)),
                       4.0 / 3.0, accuracy: 0.0001)

        let cadre = MediaGalleryStage.resolve(
            viewport: CGSize(width: 390, height: 844),
            mediaRatio: rapport,
            presentation: .carded,
            corridors: MediaGalleryStage.corridors(safeTop: 59, safeBottom: 34, attachments: lot.attachments)
        )
        XCTAssertEqual(cadre.media.width / cadre.media.height, paysage, accuracy: 0.01,
                       "Le média ajusté doit garder le rapport de la scène, ni rogné ni étiré.")
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

    // MARK: - #6709 — « Créer avec ce média » sur une page de post

    /// **La page d'une scène offre « Créer avec CE média »** — recette du
    /// 2026-09-16 (Meeshy-iOS26, PR #6761) : sur les posts à plusieurs scènes, la
    /// colonne n'avait que « Répondre ». La règle d'offre répond au POST
    /// (« exactement une pièce composable ») ; la galerie, elle, montre UNE pièce,
    /// et c'est elle que « CE média » désigne.
    @MainActor
    func test_composer_surUneSceneDUnPostAPlusieursScenes_semeLeMediaQuElleMontre() throws {
        let publication = post(media: [media("m1"), media("m2"), media("m3")],
                               scenes: [scene("s1", media: "m1"), scene("s2", media: "m2"), scene("s3", media: "m3")],
                               content: "Trois scènes")
        let lot = compose(publication)
        let seconde = try XCTUnwrap(lot.attachments.dropFirst().first?.id)

        let cible = try XCTUnwrap(lot.composeTarget(for: seconde, in: publication),
                                  "la page d'une scène doit offrir « Créer avec ce média »")
        XCTAssertEqual(cible.attachment?.id, "m2")
        XCTAssertEqual(cible.origin, .socialMedia(postId: "p1", mediaId: "m2"))
        XCTAssertEqual(cible.plan.description, "Trois scènes")
    }

    /// Un média JOINT à un commentaire n'est pas un média du post, et une scène
    /// sans média n'a aucune pièce à poser : « Créer avec CE média » n'y existe pas.
    @MainActor
    func test_composer_surUnMediaDeCommentaire_ouUneSceneSansMedia_nOffreRien() {
        let publication = troisScenes()
        let lot = compose(publication, comments: [comment("c1", media: [media("x")])])
        XCTAssertNil(lot.composeTarget(for: "x", in: publication),
                     "un média de commentaire n'est pas un média du post")

        let texte = post(scenes: [scene("s1")], content: "Juste du texte")
        let sansMedia = compose(texte)
        XCTAssertNil(sansMedia.attachments.first.flatMap { sansMedia.composeTarget(for: $0.id, in: texte) },
                     "« Créer avec CE média » promet une pièce : une scène sans média n'en a pas")
    }

    /// **Le fond se peint EXACTEMENT quand le cadre n'est pas celui de l'image.**
    ///
    /// C'est la loi que la tentative du 2026-09-16 13:50 a violée sans le voir :
    /// elle a fait passer le plein cadre au rapport du canvas — géométrie juste,
    /// `media = 402 × 714,7` — en laissant le fond sur sa réponse CARDÉE. La
    /// scène montrait alors du vide là où le canvas aurait dû peindre, et la
    /// photo semblait « glisser vers le haut ».
    ///
    /// Le témoin interroge les DEUX surfaces pour CHAQUE rapport : il ne peut
    /// donc pas verdir par omission sur l'une d'elles, ce qui est précisément
    /// comment le défaut est passé.
    @MainActor
    func test_leFond_suitLeCadre_surLesDeuxSurfaces() throws {
        for rapport in [0.8, 1.0, 1.7778] {
            let lot = compose(post(media: [media("photo")],
                                   scenes: [scene("s", media: "photo",
                                                  mediaAspectRatio: rapport)]))
            let item = try XCTUnwrap(lot.scenes.values.first)

            let cardée = item.surface(inFullFrame: false)
            XCTAssertFalse(cardée.paintsLetterbox,
                           "cardée, la scène-image est la PHOTO : ses bandes sortent du cadre")

            let pleine = item.surface(inFullFrame: true)
            XCTAssertEqual(pleine.aspect, item.canvasAspect, accuracy: 0.0001,
                           "en plein cadre, le cadre prend le rapport du CANVAS")
            XCTAssertTrue(pleine.paintsLetterbox,
                          "ses bandes entrent dans le cadre — le canvas DOIT les peindre")
            XCTAssertNotEqual(pleine.aspect, cardée.aspect, accuracy: 0.0001,
                              "les deux surfaces ne présentent pas la même chose (rapport \(rapport))")
        }
    }

    /// Une scène qui n'est PAS qu'une image ne change pas de comportement : son
    /// cadre est déjà celui du canvas, et son fond était déjà peint (#4519 — la
    /// bande est une surface de composition dès que l'auteur y pose quelque
    /// chose).
    @MainActor
    func test_uneSceneComposee_presenteLaMemeChoseSurLesDeuxSurfaces() throws {
        let lot = compose(post(media: [media("photo")],
                               scenes: [scene("s", media: "photo")]))
        let item = try XCTUnwrap(lot.scenes.values.first)

        XCTAssertEqual(item.surface(inFullFrame: false), item.surface(inFullFrame: true),
                       "sans image de fond déclarée, la surface ne dépend plus de la présentation")
        XCTAssertTrue(item.surface(inFullFrame: false).paintsLetterbox)
    }

    /// `servesLetterboxFill` — que quatre surfaces lisent déjà (#6791) — reste
    /// EXACTEMENT la réponse cardée. Le lot ne déplace rien de ce qui existait.
    @MainActor
    func test_servesLetterboxFill_resteLaReponseCardee() throws {
        for rapport in [nil, 0.8, 1.0] as [Double?] {
            let lot = compose(post(media: [media("photo")],
                                   scenes: [scene("s", media: "photo",
                                                  mediaAspectRatio: rapport)]))
            let item = try XCTUnwrap(lot.scenes.values.first)
            XCTAssertEqual(item.servesLetterboxFill,
                           item.surface(inFullFrame: false).paintsLetterbox)
        }
    }

    /// **La page scène lit la réponse de SA présentation, pas la cardée.**
    ///
    /// Garde de source : c'est le site qui a manqué au lot précédent, et rien
    /// d'autre ne le mesure — la page est une vue SwiftUI dont le canvas est un
    /// `UIViewRepresentable`.
    func test_laPageScene_sertLeFondDeSaPresentation() throws {
        let source = try String(contentsOfFile: Self.cheminPageScene, encoding: .utf8)
        XCTAssertTrue(
            source.contains("item.surface(inFullFrame: presentation.isFull).paintsLetterbox"),
            """
            La page scène doit servir le fond de SA présentation. Servir             `item.servesLetterboxFill` — la réponse cardée — laisse le plein             cadre sans fond dès que son rapport change.
            """)
    }

    private static let cheminPageScene = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("Meeshy/Features/Main/Views/ConversationMediaGalleryView+ScenePage.swift")
        .path

}
