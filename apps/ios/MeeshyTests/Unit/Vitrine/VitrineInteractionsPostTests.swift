import XCTest
import MeeshySDK
@testable import Meeshy

/// Les interactions de la vitrine sur le DÉTAIL d'un post (#9810) : un commentaire vocal qui part puis s'enrichit de sa
/// transcription et de sa traduction, et une réaction par la palette d'émojis. Le vrai écran, servi par le cache ; seule
/// la passerelle des commentaires est fictive.
@MainActor
final class VitrineInteractionsPostTests: XCTestCase {
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

    private func scene(_ argument: String) -> VitrineScene? {
        VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", argument])
    }

    private func makeServeur() throws -> (serveur: VitrineCommentaireServeur, f: VitrineFixtures, vocal: VitrineCommentaireVocal) {
        let f = try fixtures()
        let vocal = try XCTUnwrap(VitrineCommentaireVocal.depuis(f, dossier: FileManager.default.temporaryDirectory))
        let post = try XCTUnwrap(VitrineInteractions.postCommente(f))
        return (VitrineCommentaireServeur(lecteur: f.lecteur, postId: post.id, vocal: vocal, montee: .zero), f, vocal)
    }

    private func charge(_ f: VitrineFixtures, postId: String, auteur: String? = nil) -> CreateCommentPayload {
        CreateCommentPayload(
            clientMutationId: "cmid-\(UUID().uuidString)", postId: postId, parentCommentId: nil,
            content: "", originalLanguage: f.lang, authorId: auteur ?? f.lecteur.id
        )
    }

    private func piece() -> CommentPublisher.Piece {
        CommentPublisher.Piece(sourceIndex: 0, fileURL: FileManager.default.temporaryDirectory.appendingPathComponent("v.m4a"), mimeType: "audio/mp4")
    }

    // MARK: - Les scènes

    func test_postScenes_parse_andOpenASession() {
        XCTAssertEqual(scene("interaction-commentaire-audio"), .interactionCommentaireAudio)
        XCTAssertEqual(scene("interaction-emoji-post"), .interactionEmojiPost)
        XCTAssertEqual(VitrineScene.interactionCommentaireAudio.interaction, .commentaireAudio)
        XCTAssertEqual(VitrineScene.interactionEmojiPost.interaction, .emojiPost)
        XCTAssertTrue(VitrineScene.interactionCommentaireAudio.ouvreUneSession)
        XCTAssertTrue(VitrineScene.interactionEmojiPost.ouvreUneSession)
    }

    /// Le détail d'un post est prêt quand son composeur (commentaire) ou son cœur (palette) a prêté son geste ; sur
    /// iPad, le fil peint à gauche aussi.
    func test_rendusAttendus_waitForTheGestureTheSceneDrives() {
        XCTAssertEqual(VitrineScene.interactionCommentaireAudio.rendusAttendus(conversationId: nil, appareil: .iphone), [.composeurDeCommentaire])
        XCTAssertEqual(VitrineScene.interactionCommentaireAudio.rendusAttendus(conversationId: nil, appareil: .ipad), [.composeurDeCommentaire, .fil])
        XCTAssertEqual(VitrineScene.interactionEmojiPost.rendusAttendus(conversationId: nil, appareil: .iphone), [.paletteDeReactionsPrete])
        XCTAssertEqual(VitrineScene.interactionEmojiPost.rendusAttendus(conversationId: nil, appareil: .ipad), [.paletteDeReactionsPrete, .fil])
    }

    /// Le post du kit le plus récent, avec sa photo ; son fil de commentaires est vide et le dit (0), le vocal y sera seul.
    func test_postCommente_isTheKitsFirstPost_withAnEmptyThread() throws {
        let f = try fixtures()
        let post = try XCTUnwrap(VitrineInteractions.postCommente(f))
        XCTAssertEqual(post.id, f.posts.first?.id)
        XCTAssertFalse(post.media.isEmpty)
        XCTAssertEqual(post.commentCount, 0)
        XCTAssertTrue(post.comments.isEmpty)
    }

    // MARK: - Le vocal

    /// Sans vocal propre à la scène dans le kit, celui de la scène « amour » : un vrai fichier, sa transcription, ses pistes.
    func test_vocal_fallsBackToTheLoveSceneVoiceNote() throws {
        let f = try fixtures()
        let vocal = try XCTUnwrap(VitrineCommentaireVocal.depuis(f, dossier: URL(fileURLWithPath: "/medias")))
        XCTAssertTrue(vocal.urlServie.hasSuffix("vocal-minjun.p-ko.m4a"))
        XCTAssertEqual(vocal.fichier, URL(fileURLWithPath: "/medias/vocal-minjun.p-ko.m4a"))
        XCTAssertEqual(vocal.duree, 9, accuracy: 0.01)
        XCTAssertEqual(vocal.transcription?.language, "ko")
        XCTAssertNotNil(vocal.traductions?["fr"])
    }

    // MARK: - La passerelle fictive, derrière le VRAI publieur

    /// Le jeton de la vitrine désigne le lecteur : la garde d'appartenance du publieur le laisse passer, pour lui seul.
    func test_jeton_bindsTheReader() throws {
        let (serveur, f, _) = try makeServeur()
        XCTAssertEqual(CommentOwnership.userId(inToken: serveur.jeton), f.lecteur.id)
    }

    func test_publish_createsTheVoiceComment_withoutItsTranscriptionYet() async throws {
        let (serveur, f, vocal) = try makeServeur()
        let payload = charge(f, postId: serveur.postId)

        let cree = try await serveur.publieur.publish(payload, pieces: [piece()])

        let commentaire = try XCTUnwrap(cree)
        XCTAssertEqual(commentaire.author.id, f.lecteur.id)
        XCTAssertEqual(commentaire.media?.first?.fileUrl, vocal.urlServie)
        XCTAssertNil(commentaire.media?.first?.transcription, "la transcription arrive ENSUITE, par le socket")
        XCTAssertNil(commentaire.media?.first?.translations)
        let attendu = await serveur.attendreLaCreation()
        XCTAssertEqual(attendu.id, commentaire.id)
    }

    /// Une charge qui n'est pas celle du lecteur ne part pas : la vitrine ne contourne pas la garde.
    func test_publish_anotherAuthor_isRefusedByTheRealGuard() async throws {
        let (serveur, f, _) = try makeServeur()
        do {
            _ = try await serveur.publieur.publish(charge(f, postId: serveur.postId, auteur: "quelqu-un-d-autre"), pieces: [piece()])
            XCTFail("la garde d'appartenance devait refuser")
        } catch is CommentOwnership.Refusal {
        }
    }

    func test_enrichissements_bringTheTranscription_thenTheTranslations() async throws {
        let (serveur, f, vocal) = try makeServeur()
        let cree = try await serveur.publieur.publish(charge(f, postId: serveur.postId), pieces: [piece()])
        let commentaire = try XCTUnwrap(cree)

        let transcription = try XCTUnwrap(serveur.transcriptionArrivee())
        let traduction = try XCTUnwrap(serveur.traductionArrivee())

        XCTAssertEqual(transcription.postId, serveur.postId)
        XCTAssertEqual(transcription.commentId, commentaire.id)
        XCTAssertEqual(transcription.comment.media?.first?.transcription?.text, vocal.transcription?.text)
        XCTAssertNil(transcription.comment.media?.first?.translations)
        XCTAssertEqual(traduction.comment.media?.first?.translations?["fr"]?.transcription, vocal.traductions?["fr"]?.transcription)
        XCTAssertNotNil(traduction.comment.media?.first?.transcription)
    }

    /// Installée, la passerelle fictive EST le publieur que l'app appelle (`CommentPublisher.live`) ; retirée, le réseau revient.
    func test_installer_routesTheLivePublisher_andRetirerRestoresIt() throws {
        let (serveur, _, _) = try makeServeur()
        addTeardownBlock { VitrineCommentaire.retirer() }

        VitrineCommentaire.installer(serveur)
        XCTAssertEqual(CommentPublisher.live.token(), serveur.jeton)

        VitrineCommentaire.retirer()
        XCTAssertEqual(CommentPublisher.live.token(), APIClient.shared.authToken)
    }

    // MARK: - Les gestes empruntés

    /// Le vocal fourni prend le chemin de la fin d'un enregistrement : la zone (`stagerLeVocal`), puis l'envoi.
    func test_commentaireAudio_sendsThroughTheRecordingPath() throws {
        let composeur = try source("apps/ios/Meeshy/Features/Main/Views/PostDetailView+CommentComposer.swift")
        XCTAssertTrue(composeur.contains("return stagerLeVocal(url, duree: duration)"), "l'enregistrement passe par la zone partagée")
        XCTAssertTrue(composeur.contains("VitrineRendu.shared.composeurDeCommentaireAffiche"))
        XCTAssertTrue(composeur.contains("guard stagerLeVocal(url, duree: duree) else { return }"))
    }

    func test_emojiPost_opensAndPicksThroughThePaletteItself() throws {
        let geste = try source("apps/ios/Meeshy/Features/Main/Views/ReactionPaletteModifier.swift")
        XCTAssertTrue(geste.contains("VitrineRendu.shared.paletteDeReactionsPrete"))
        XCTAssertEqual(geste.components(separatedBy: "ouvrirLaPalette(isPresented)").count - 1, 2, "l'appui long et la vitrine ouvrent la palette par la même fonction")
        let palette = try source("apps/ios/Meeshy/Features/Main/Views/PostReactionPalette.swift")
        XCTAssertTrue(palette.contains("onReact: { choisir($0) }"))
        XCTAssertTrue(palette.contains("VitrineRendu.shared.paletteDeReactionsAffichee { choisir($0) }"))
    }

    func test_publisher_isOverriddenOnlyInsideDebug() throws {
        let publieur = try source("apps/ios/Meeshy/Features/Main/Services/CommentPublisher.swift")
        XCTAssertTrue(publieur.contains("if let vitrine = VitrineCommentaire.publieur { return vitrine }"))
    }

    func test_rendu_relaysThePostGestures() {
        let rendu = VitrineRendu(actif: true)
        var envoye: TimeInterval?
        var ouverte = false
        var choisi: String?
        rendu.composeurDeCommentaireAffiche { _, duree in envoye = duree }
        rendu.paletteDeReactionsPrete { ouverte = true }
        rendu.paletteDeReactionsAffichee { choisi = $0 }

        rendu.envoyerUnVocal?(URL(fileURLWithPath: "/v.m4a"), 9)
        rendu.ouvrirLaPalette?()
        rendu.choisirDansLaPalette?("❤️")

        XCTAssertEqual(envoye, 9)
        XCTAssertTrue(ouverte)
        XCTAssertEqual(choisi, "❤️")
        XCTAssertEqual(rendu.observes, [.composeurDeCommentaire, .paletteDeReactionsPrete, .paletteDeReactions])
    }
}
