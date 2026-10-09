import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// Un réel publié depuis le composeur (#9820) : la vraie vidéo du kit entre dans le composeur, part par le chemin réel de
/// publication — seuls le téléversement (`VitrineTus`, derrière le VRAI `TusUploadManager`) et la création du post
/// (`VitrinePasserelleDesPosts`) sont fictifs —, puis arrive dans le fil par `post:created`.
@MainActor
final class VitrineReelTests: XCTestCase {
    private var echantillon: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Resources/VitrineFixtures-fr.json")
    }

    private func fixtures() throws -> VitrineFixtures {
        try VitrineFixtures.decoder(Data(contentsOf: echantillon))
    }

    private var depot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    }

    private func source(_ chemin: String) throws -> String {
        try String(contentsOf: depot.appendingPathComponent(chemin), encoding: .utf8)
    }

    private func requete(_ methode: String, _ adresse: String, entetes: [String: String] = [:]) -> URLRequest {
        var requete = URLRequest(url: URL(string: adresse)!)
        requete.httpMethod = methode
        entetes.forEach { requete.setValue($1, forHTTPHeaderField: $0) }
        return requete
    }

    private func metadonnees(nom: String, type: String) -> String {
        "filename \(Data(nom.utf8).base64EncodedString()),filetype \(Data(type.utf8).base64EncodedString()),uploadcontext \(Data("story".utf8).base64EncodedString())"
    }

    private func effetsAvecVideo(postMediaId: String, adresse: String) -> StoryEffects {
        var effets = StoryEffects()
        effets.mediaObjects = [
            StoryMediaObject(postMediaId: postMediaId, mediaURL: adresse, mediaType: "video", aspectRatio: 9.0 / 16.0, isBackground: true),
        ]
        return effets
    }

    // MARK: - La scène

    func test_interactionReel_parses_andWaitsForTheFeedAndTheComposer() {
        XCTAssertEqual(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", "interaction-reel"]), .interactionReel)
        XCTAssertEqual(VitrineScene.interactionReel.interaction, .reel)
        XCTAssertEqual(VitrineScene.interactionReel.sceneDuKit, .interactionReel)
        XCTAssertTrue(VitrineScene.interactionReel.ouvreUneSession)
        XCTAssertNil(VitrineScene.interactionReel.jeuServi)
        XCTAssertEqual(VitrineScene.interactionReel.rendusAttendus(conversationId: nil, appareil: .iphone), [.fil, .composeur])
        XCTAssertEqual(VitrineScene.interactionReel.rendusAttendus(conversationId: nil, appareil: .ipad), [.fil, .composeur])
    }

    /// La vidéo du kit est un média à part entière : décodée, déposée, rangée dans le cache vidéo.
    func test_videoDuReel_isTheKitVideo() throws {
        let f = try fixtures()
        let video = try XCTUnwrap(f.medias.first { $0.genre == .video })
        XCTAssertEqual(video.fichier, "reel-coucher-ocean.mp4")
        XCTAssertEqual(VitrineInteractions.videoDuReel(f, dossier: URL(fileURLWithPath: "/medias")),
                       URL(fileURLWithPath: "/medias/reel-coucher-ocean.mp4"))
    }

    /// Le geste de l'auteur : « Réel » armé, sans disposition.
    func test_choixDuReel_isAReelWithoutLayout() {
        XCTAssertEqual(VitrineInteractions.choixDuReel, ComposerPublishChoice(format: .reel, layout: nil))
        XCTAssertFalse(VitrineInteractions.choixDuReel.alsoAsReel)
    }

    func test_rendu_relaysTheFeedAndThePublishArrow_andHandsTheVideoOnce() {
        let rendu = VitrineRendu(actif: true)
        var filMontre = false
        var publie: ComposerPublishChoice?
        rendu.racineAffichee { filMontre = true }
        rendu.mediaDuComposeur = VitrineMediaDOuverture(url: URL(fileURLWithPath: "/v.mp4"), mimeType: "video/mp4")

        let media = rendu.composeurAffiche {}
        rendu.composeurPretAPublier { publie = $0 }
        rendu.montrerLeFil?()
        rendu.publierDepuisLeComposeur?(VitrineInteractions.choixDuReel)

        XCTAssertEqual(media?.mimeType, "video/mp4")
        XCTAssertNil(rendu.composeurAffiche {}, "le média d'ouverture n'entre qu'une fois")
        XCTAssertTrue(filMontre)
        XCTAssertEqual(publie, VitrineInteractions.choixDuReel)
    }

    func test_rendu_inactive_lendsNothing() {
        let rendu = VitrineRendu(actif: false)
        rendu.racineAffichee {}
        rendu.composeurPretAPublier { _ in }
        XCTAssertNil(rendu.montrerLeFil)
        XCTAssertNil(rendu.publierDepuisLeComposeur)
    }

    // MARK: - Le serveur TUS

    func test_tus_creation_answers201_withALocationThatCarriesTheFile() throws {
        let reponse = VitrineTus.repondre(a: requete("POST", "http://127.0.0.1:9/api/v1/uploads", entetes: [
            "Upload-Length": "2900820", "Upload-Metadata": metadonnees(nom: "composer_video_1.mp4", type: "video/mp4"),
        ]))
        XCTAssertEqual(reponse.statut, 201)
        let lieu = try XCTUnwrap(reponse.entetes["Location"])
        XCTAssertTrue(lieu.hasPrefix("/api/v1/uploads/"))
        let items = URLComponents(string: lieu)?.queryItems ?? []
        XCTAssertEqual(items.first { $0.name == "type" }?.value, "video/mp4")
        XCTAssertEqual(items.first { $0.name == "taille" }?.value, "2900820")
    }

    func test_tus_finish_describesThePiece_underTheVitrineRoot() throws {
        let creation = VitrineTus.repondre(a: requete("POST", "http://127.0.0.1:9/api/v1/uploads", entetes: [
            "Upload-Length": "12", "Upload-Metadata": metadonnees(nom: "composer_video_1.mp4", type: "video/mp4"),
        ]))
        let lieu = try XCTUnwrap(creation.entetes["Location"])
        let adresse = try XCTUnwrap(URL(string: lieu, relativeTo: URL(string: "http://127.0.0.1:9")))

        let fin = VitrineTus.repondre(a: requete("PATCH", adresse.absoluteString))

        XCTAssertEqual(fin.statut, 200)
        XCTAssertEqual(fin.entetes["Upload-Offset"], "12")
        let objet = try XCTUnwrap(JSONSerialization.jsonObject(with: fin.corps) as? [String: Any])
        let piece = try XCTUnwrap((objet["data"] as? [String: Any])?["attachment"] as? [String: Any])
        XCTAssertEqual(piece["mimeType"] as? String, "video/mp4")
        XCTAssertEqual(piece["fileSize"] as? Int, 12)
        XCTAssertTrue((piece["fileUrl"] as? String)?.hasPrefix(VitrineTus.racine + "/") ?? false)
        XCTAssertTrue((piece["fileUrl"] as? String)?.hasSuffix(".mp4") ?? false)
    }

    func test_tus_metadonnees_decodesBase64Pairs() {
        XCTAssertEqual(VitrineTus.metadonnees(metadonnees(nom: "a b.mp4", type: "video/mp4")),
                       ["filename": "a b.mp4", "filetype": "video/mp4", "uploadcontext": "story"])
        XCTAssertEqual(VitrineTus.metadonnees(""), [:])
    }

    /// Le VRAI téléverseur, branché sur la session de la vitrine : création, tronçon, fin — sans réseau.
    func test_tus_theRealUploader_uploadsThroughTheVitrineSession() async throws {
        let fichier = FileManager.default.temporaryDirectory.appendingPathComponent("vitrine-tus-\(UUID().uuidString).mp4")
        try Data(UUID().uuidString.utf8).write(to: fichier)
        addTeardownBlock { try? FileManager.default.removeItem(at: fichier) }
        let televerseur = TusUploadManager(baseURL: URL(string: "http://127.0.0.1:9")!, urlSession: VitrineTus.session())

        let resultat = try await televerseur.uploadFile(fileURL: fichier, mimeType: "video/mp4", credential: .bearer("vitrine"), uploadContext: "story")

        XCTAssertEqual(resultat.mimeType, "video/mp4")
        XCTAssertEqual(resultat.fileSize, 36)
        XCTAssertTrue(resultat.fileUrl.hasPrefix(VitrineTus.racine + "/"))
    }

    // MARK: - La passerelle des posts

    func test_passerelle_withoutTheVitrine_forwardsToTheRealService() async throws {
        VitrineReel.retirer()
        let service = MockPostService()

        _ = try await VitrineReel.passerelle(devant: service).createCanvasPost(
            type: .reel, content: nil, storyEffects: nil, visibility: "PUBLIC", visibilityUserIds: nil, originalLanguage: "fr",
            mediaIds: nil, repostOfId: nil, mentions: nil, allowSoundExtraction: nil, mediaAlt: nil, mediaCaption: nil, alsoAsReel: nil
        )

        XCTAssertEqual(service.lastCreateCanvasPostType, .reel)
    }

    /// Installée, la passerelle crée le réel du lecteur, avec sa vidéo, et le pousse au fil comme la vraie (`post:created`).
    func test_passerelle_installed_createsTheReaderReel_andAnnouncesIt() async throws {
        let f = try fixtures()
        let service = MockPostService()
        var annonces: [SocketPostCreatedData] = []
        let abonnement = SocialSocketManager.shared.postCreated.sink { annonces.append($0) }
        defer { abonnement.cancel() }
        let passerelle = VitrinePasserelleDesPosts(service: service, lecteur: f.lecteur, montee: .zero)

        let post = try await passerelle.createCanvasPost(
            type: .reel, content: nil, storyEffects: effetsAvecVideo(postMediaId: "m1", adresse: "\(VitrineTus.racine)/m1.mp4"),
            visibility: "PUBLIC", visibilityUserIds: nil, originalLanguage: "fr", mediaIds: ["m1"], repostOfId: nil,
            mentions: nil, allowSoundExtraction: nil, mediaAlt: nil, mediaCaption: nil, alsoAsReel: nil
        )

        XCTAssertNil(service.lastCreateCanvasPostType, "aucune requête ne part")
        XCTAssertEqual(post.type, "REEL")
        XCTAssertEqual(post.author.id, f.lecteur.id)
        XCTAssertEqual(post.media?.first?.mimeType, "video/mp4")
        XCTAssertEqual(post.media?.first?.fileUrl, "\(VitrineTus.racine)/m1.mp4")
        XCTAssertEqual(annonces.map(\.post.id), [post.id])
    }

    func test_postServi_keepsOnlyTheMediaThePublicationAttaches() {
        var effets = effetsAvecVideo(postMediaId: "m1", adresse: "/a/m1.mp4")
        effets.mediaObjects?.append(StoryMediaObject(postMediaId: "", mediaURL: "/local.jpg", mediaType: "image", aspectRatio: 1))
        effets.mediaObjects?.append(StoryMediaObject(postMediaId: "m2", mediaURL: "/a/m2.jpg", mediaType: "image", aspectRatio: 1))

        let medias = VitrinePostServi.medias(effets, retenus: ["m1"])

        XCTAssertEqual(medias.compactMap { $0["id"] as? String }, ["m1"])
    }

    // MARK: - Les crochets du chemin réel

    /// Le chemin publié en Release ne change pas : les deux bouches sont surchargées dans des blocs DEBUG, l'appel de
    /// production garde sa lettre.
    func test_runStoryUpload_isOverriddenOnlyInsideDebug() throws {
        let upload = try source("apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel+PublicationUpload.swift")
        XCTAssertTrue(upload.contains("let uploader = TusUploadManager(baseURL: baseURL, urlSession: VitrineReel.sessionDeTeleversement ?? .shared)"))
        XCTAssertTrue(upload.contains("#else\n        let uploader = TusUploadManager(baseURL: baseURL)\n        #endif"))
        XCTAssertTrue(upload.contains("let postService = VitrineReel.passerelle(devant: self.postService)"))
        XCTAssertTrue(upload.contains("let post = try await postService.createCanvasPost("))
    }

    /// La flèche publie comme l'auteur : le choix armé au chevron (`chooseArmedPublish`), puis « Publier »
    /// (`requestSoclePublish`) ; le fil se révèle comme par l'accès rapide.
    func test_reel_publishesThroughTheComposerArrow_andTheFeedRevealsLikeTheQuickAccess() throws {
        let pickers = try source("apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Pickers.swift")
        XCTAssertTrue(pickers.contains("VitrineRendu.shared.composeurPretAPublier { choix in"))
        XCTAssertTrue(pickers.contains("chooseArmedPublish(choix)"))
        XCTAssertTrue(pickers.contains("requestSoclePublish(choix)"))
        XCTAssertTrue(pickers.contains("declaredMimeType: media.mimeType"))
        let racine = try source("apps/ios/Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift")
        XCTAssertTrue(racine.contains("VitrineRendu.shared.racineAffichee {"))
    }
}
