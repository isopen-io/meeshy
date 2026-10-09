import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// Un réel publié depuis le composeur (#9820) : la vraie vidéo du kit entre dans le composeur, part par le chemin réel de
/// publication d'un réel — le canal DOCUMENT, la file durable et `OutboxDispatcher.dispatchCreatePost` (#4869) —, où
/// seuls le téléversement (`VitrineTus`, derrière le VRAI `TusUploadManager`) et `POST /posts` (`VitrineReel.creer`)
/// sont fictifs, puis arrive dans le fil par `post:created`.
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

    /// Le geste de l'auteur se joue en DEUX temps, comme au doigt : « Réel » armé au chevron, puis « Publier ». Armer et
    /// publier dans le même tour laissait la flèche presser un composeur qui ne s'était pas encore relu en réel
    /// (prise du 2026-10-09 : « Erreur lors de la publication », ou une publication jamais arrivée).
    func test_rendu_relaysTheFeed_theArmingAndThePublishArrow_separately_andHandsTheVideoOnce() {
        let rendu = VitrineRendu(actif: true)
        var filMontre = false
        var arme: ComposerPublishChoice?
        var publie: ComposerPublishChoice?
        rendu.racineAffichee { filMontre = true }
        rendu.mediaDuComposeur = VitrineMediaDOuverture(url: URL(fileURLWithPath: "/v.mp4"), mimeType: "video/mp4")

        let media = rendu.composeurAffiche {}
        rendu.composeurPretAPublier(armer: { arme = $0 }, publier: { publie = $0 })
        rendu.montrerLeFil?()
        rendu.armerDepuisLeComposeur?(VitrineInteractions.choixDuReel)

        XCTAssertEqual(arme, VitrineInteractions.choixDuReel)
        XCTAssertNil(publie, "armer ne publie pas")
        rendu.publierDepuisLeComposeur?(VitrineInteractions.choixDuReel)
        XCTAssertEqual(publie, VitrineInteractions.choixDuReel)
        XCTAssertEqual(media?.mimeType, "video/mp4")
        XCTAssertNil(rendu.composeurAffiche {}, "le média d'ouverture n'entre qu'une fois")
        XCTAssertTrue(filMontre)
    }

    func test_rendu_inactive_lendsNothing() {
        let rendu = VitrineRendu(actif: false)
        rendu.racineAffichee {}
        rendu.composeurPretAPublier(armer: { _ in }, publier: { _ in })
        XCTAssertNil(rendu.montrerLeFil)
        XCTAssertNil(rendu.armerDepuisLeComposeur)
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
        XCTAssertNotNil(CacheCoordinator.videoLocalFileURL(for: resultat.fileUrl), "le téléverseur range le fichier envoyé sous fileUrl")
    }

    // MARK: - La création du post

    private func corps(type: String? = "REEL", mediaIds: [String]? = ["m1"]) -> CreatePostBody {
        CreatePostBody(
            content: "Coucher de soleil", mediaIds: mediaIds, visibility: "PUBLIC", originalLanguage: "fr", type: type,
            moodEmoji: nil, audioUrl: nil, audioDuration: nil, visibilityUserIds: nil, location: nil, mentions: nil,
            discoverabilityPrecision: nil, repostOfId: nil, mobileTranscription: nil, storyEffects: nil,
            mediaCaption: nil, mediaAlt: nil, allowSoundExtraction: nil
        )
    }

    private var video: VitrineTeleverse {
        VitrineTeleverse(id: "m1", url: "\(VitrineTus.racine)/m1.mp4", mimeType: "video/mp4")
    }

    /// Sans la vitrine, `POST /posts` part : la file durable garde sa lettre.
    func test_creer_withoutTheVitrine_servesNothing() async throws {
        VitrineReel.retirer()

        let servi = try await VitrineReel.creerSiInstallee(corps(), televerses: [video])

        XCTAssertNil(servi)
    }

    /// Installée, la vitrine crée le réel du lecteur avec sa vidéo téléversée, et le pousse au fil comme la vraie passerelle
    /// (`post:created`) — aucune requête ne part.
    func test_creer_installed_createsTheReaderReel_andAnnouncesIt() async throws {
        let f = try fixtures()
        VitrineReel.installer(lecteur: f.lecteur, montee: .zero)
        addTeardownBlock { await MainActor.run { VitrineReel.retirer() } }
        var annonces: [SocketPostCreatedData] = []
        let abonnement = SocialSocketManager.shared.postCreated.sink { annonces.append($0) }
        defer { abonnement.cancel() }

        let servi = try await VitrineReel.creerSiInstallee(corps(), televerses: [video])
        let post = try XCTUnwrap(servi)

        XCTAssertEqual(post.type, "REEL")
        XCTAssertEqual(post.author.id, f.lecteur.id)
        XCTAssertEqual(post.content, "Coucher de soleil")
        XCTAssertEqual(post.media?.first?.mimeType, "video/mp4")
        XCTAssertEqual(post.media?.first?.fileUrl, "\(VitrineTus.racine)/m1.mp4", "rien en cache : l'adresse téléversée")
        XCTAssertEqual(annonces.map(\.post.id), [post.id])
    }

    /// Face à l'hôte mort, une adresse relative ne se résout pas (`resolveMediaURL` refuse 127.0.0.1) : la vidéo du réel
    /// se cherchait sur la passerelle et la carte du fil restait un aplat de couleur (prise du 2026-10-09). La vitrine
    /// sert donc la COPIE que le téléverseur a rangée dans le cache, comme le lecteur la jouerait sur un cache chaud.
    func test_creer_servesTheUploadedCopy_fromTheMediaCache() async throws {
        let f = try fixtures()
        VitrineReel.installer(lecteur: f.lecteur, montee: .zero)
        addTeardownBlock { await MainActor.run { VitrineReel.retirer() } }
        let cle = "\(VitrineTus.racine)/copie-\(UUID().uuidString).mp4"
        let fichier = FileManager.default.temporaryDirectory.appendingPathComponent("vitrine-copie-\(UUID().uuidString).mp4")
        try Data("video".utf8).write(to: fichier)
        addTeardownBlock { try? FileManager.default.removeItem(at: fichier) }
        await CacheCoordinator.shared.video.seed(copyingLocalFile: fichier, for: cle)
        let piece = VitrineTeleverse(id: "m1", url: cle, mimeType: "video/mp4")

        let servi = try await VitrineReel.creerSiInstallee(corps(), televerses: [piece])
        let post = try XCTUnwrap(servi)

        let adresse = try XCTUnwrap(post.media?.first?.fileUrl)
        XCTAssertEqual(adresse, CacheCoordinator.videoLocalFileURL(for: cle)?.absoluteString)
        XCTAssertTrue(adresse.hasPrefix("file://"))
    }

    /// La scène nomme ses médias par `postMediaId` et par `mediaURL` : l'adresse de la scène suit celle de la pièce servie.
    func test_adressesDeLaScene_followTheServedPiece() throws {
        let effets: [String: Any] = ["v": 3, "scenes": [["objects": [
            ["kind": "media", "payload": ["postMediaId": "m1", "mediaURL": "/api/v1/x.mp4"]],
            ["kind": "media", "payload": ["postMediaId": "m9", "mediaURL": "/api/v1/y.mp4"]],
        ]]]]
        let piece = VitrineTeleverse(id: "m1", url: "file:///cache/m1.mp4", mimeType: "video/mp4")

        let servis = try XCTUnwrap(VitrinePostServi.adressesDeLaScene(effets, televerses: [piece]) as? [String: Any])

        let objets = try XCTUnwrap(((servis["scenes"] as? [[String: Any]])?.first?["objects"]) as? [[String: Any]])
        XCTAssertEqual((objets[0]["payload"] as? [String: Any])?["mediaURL"] as? String, "file:///cache/m1.mp4")
        XCTAssertEqual((objets[1]["payload"] as? [String: Any])?["mediaURL"] as? String, "/api/v1/y.mp4")
    }

    /// Une vidéo servie porte son affiche, ses dimensions et sa durée, comme la passerelle les sert : la carte du réel au fil
    /// a une image à montrer avant la première frame.
    func test_postServi_aVideo_carriesItsPosterSizeAndDuration() throws {
        let f = try fixtures()
        let affiche = VitrineAffiche(url: "file:///tmp/affiche.jpg", largeur: 1080, hauteur: 1920, dureeMs: 6000)
        let piece = VitrineTeleverse(id: "m1", url: "file:///tmp/m1.mp4", mimeType: "video/mp4", affiche: affiche)

        let post = try VitrinePostServi.post(corps(), auteur: f.lecteur, televerses: [piece])

        let media = try XCTUnwrap(post.media?.first)
        XCTAssertEqual(media.thumbnailUrl, "file:///tmp/affiche.jpg")
        XCTAssertEqual(media.width, 1080)
        XCTAssertEqual(media.height, 1920)
        XCTAssertEqual(media.duration, 6000)
    }

    /// La file durable efface le fichier envoyé une fois le post créé : la vitrine sert une COPIE locale, qui survit.
    func test_copieServie_copiesTheSentFile_beforeTheQueueDeletesIt() throws {
        let dossier = FileManager.default.temporaryDirectory.appendingPathComponent("vitrine-servi-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: dossier) }
        let envoye = dossier.appendingPathComponent("envoye.mp4")
        try Data("video".utf8).write(to: envoye)
        let piece = VitrineTeleverse(id: "m1", url: "\(VitrineTus.racine)/m1.mp4", mimeType: "video/mp4", fichierLocal: envoye)

        let servie = VitrineReel.copieServie(piece, dossier: dossier)
        try FileManager.default.removeItem(at: envoye)

        let copie = try XCTUnwrap(URL(string: servie.url))
        XCTAssertTrue(copie.isFileURL)
        XCTAssertEqual(try Data(contentsOf: copie), Data("video".utf8))
    }

    /// Les médias du post sont ceux que la publication RATTACHE (`mediaIds`), dans son ordre.
    func test_postServi_keepsTheAttachedMedia_inTheirOrder() throws {
        let f = try fixtures()
        let image = VitrineTeleverse(id: "m2", url: "\(VitrineTus.racine)/m2.jpg", mimeType: "image/jpeg")
        let autre = VitrineTeleverse(id: "m3", url: "\(VitrineTus.racine)/m3.jpg", mimeType: "image/jpeg")

        let post = try VitrinePostServi.post(corps(mediaIds: ["m2", "m1"]), auteur: f.lecteur, televerses: [video, image, autre])

        XCTAssertEqual(post.media?.map(\.id), ["m2", "m1"])
        XCTAssertEqual(post.media?.map(\.mimeType), ["image/jpeg", "video/mp4"])
    }

    // MARK: - Les crochets du chemin réel

    /// Le chemin publié en Release ne change pas : le téléverseur et `POST /posts` de la file durable ne sont surchargés
    /// que dans des blocs DEBUG, l'appel de production garde sa lettre.
    func test_dispatchCreatePost_isOverriddenOnlyInsideDebug() throws {
        let envoi = try source("apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher+Publications.swift")
        XCTAssertTrue(envoi.contains("let sessionDeLaVitrine = await VitrineReel.sessionDeTeleversement"))
        XCTAssertTrue(envoi.contains("let uploader = TusUploadManager(baseURL: baseURL, urlSession: sessionDeLaVitrine ?? .shared)"))
        XCTAssertTrue(envoi.contains("#else\n            let uploader = TusUploadManager(baseURL: baseURL)\n            #endif"))
        XCTAssertTrue(envoi.contains("try await VitrineReel.creerSiInstallee(body, televerses:"))
        XCTAssertTrue(envoi.contains("let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders("))
        let story = try source("apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel+PublicationUpload.swift")
        XCTAssertFalse(story.contains("Vitrine"), "le réel ne passe pas par le canal de la scène : aucun crochet n'y vit")
    }

    /// La flèche publie comme l'auteur : le choix armé au chevron (`chooseArmedPublish`), puis « Publier »
    /// (`requestSoclePublish`) ; le fil se révèle comme par l'accès rapide.
    func test_reel_publishesThroughTheComposerArrow_andTheFeedRevealsLikeTheQuickAccess() throws {
        let pickers = try source("apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Pickers.swift")
        XCTAssertTrue(pickers.contains("armer: { chooseArmedPublish($0) }"))
        XCTAssertTrue(pickers.contains("publier: { requestSoclePublish($0) }"))
        XCTAssertTrue(pickers.contains("declaredMimeType: media.mimeType"))
        let racine = try source("apps/ios/Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift")
        XCTAssertTrue(racine.contains("VitrineRendu.shared.racineAffichee {"))
    }
}
