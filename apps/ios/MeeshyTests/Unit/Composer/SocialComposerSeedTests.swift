import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

// MARK: - Seam

/// Résolveur INJECTÉ par le protocole : la porte n'a rien à télécharger pour
/// qu'on éprouve ce qu'elle fait d'une graine de post ou de story.
private final class StubSocialMediaResolver: MediaSaveSourceResolving, @unchecked Sendable {
    var result: Result<URL, Error> = .failure(MediaSaveError.sourceUnavailable)
    private(set) var lastRequest: MediaSaveRequest?
    private(set) var callCount = 0

    func resolveLocalFile(for request: MediaSaveRequest) async throws -> URL {
        lastRequest = request
        callCount += 1
        return try result.get()
    }
}

/// **« Composer » s'ouvre depuis le média d'un post et la slide d'une story,
/// comme depuis un message** (#6085).
///
/// Ce qui est mesuré ici n'est pas « la porte s'ouvre » — c'est que les TROIS
/// surfaces passent par la MÊME règle d'offre. Une règle produit recopiée sur
/// trois sites est une règle qui a déjà commencé à diverger, et le seul témoin
/// qui l'attrape est celui qui rejoue les refus SURFACE PAR SURFACE.
///
/// > **Écart de modèle, mesuré et dit** : ni `Post` ni `PostMedia` ni
/// > `StoryItem` ne portent de drapeau de protection côté serveur — pas de vue
/// > unique, pas de flou, pas de chiffrement (vérifié au #6084 sur le schéma
/// > Prisma). Le pont `FeedMedia.toMessageAttachment()` rend donc toujours une
/// > pièce NON protégée, et aucune fixture de post ne peut en fabriquer une.
/// > Les refus de protection se rejouent donc sur la SOURCE que chaque surface
/// > compose (`SeedSource`), qui est exactement ce que la règle reçoit d'elles.
@MainActor
final class SocialComposerSeedTests: XCTestCase {

    // MARK: - Fixtures

    private func media(id: String = "pm-1",
                       type: FeedMediaType = .image,
                       url: String? = "https://cdn.example/post.jpg",
                       caption: String? = nil) -> FeedMedia {
        FeedMedia(id: id, type: type, url: url, caption: caption)
    }

    private func post(media: [FeedMedia] = [], content: String = "") -> FeedPost {
        FeedPost(id: "post-1", author: "Ana", authorId: "u-1", content: content, media: media)
    }

    private func story(media: [FeedMedia] = [],
                       content: String? = nil,
                       translations: [StoryTranslation]? = nil) -> StoryItem {
        StoryItem(id: "story-1", content: content, media: media, translations: translations)
    }

    private func piece(mimeType: String,
                       id: String = "att-1",
                       isViewOnce: Bool = false,
                       isBlurred: Bool = false,
                       isEncrypted: Bool = false) -> MessageAttachment {
        MeeshyMessageAttachment(
            id: id,
            fileName: "p",
            originalName: "p",
            mimeType: mimeType,
            fileUrl: "https://cdn.example/p",
            isViewOnce: isViewOnce,
            isBlurred: isBlurred,
            isEncrypted: isEncrypted
        )
    }

    private func makeJPEG() throws -> URL {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 80, height: 60))
        let image = renderer.image { ctx in
            UIColor.systemTeal.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 80, height: 60))
        }
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("SocialComposerSeed-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let url = root.appendingPathComponent("social.jpg")
        try XCTUnwrap(image.jpegData(compressionQuality: 0.9)).write(to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }
        return url
    }

    // MARK: - POST — ce qui est OFFERT

    func test_post_unSeulMedia_semeLeMediaEtLaDescription() throws {
        let plan = try XCTUnwrap(
            ComposableAttachment.seedPlan(inPost: post(media: [media()], content: "Au marché"))
        )
        XCTAssertEqual(plan.media?.id, "pm-1")
        XCTAssertEqual(plan.description, "Au marché")
    }

    /// Le Prisme : la description est pré-remplie avec ce que le LECTEUR a sous
    /// les yeux, jamais avec la langue de l'auteur.
    func test_post_laDescription_estLeTexteSERVI_pasLOriginal() throws {
        var p = post(media: [media()], content: "At the market")
        p.translatedContent = "Au marché"
        XCTAssertEqual(ComposableAttachment.seedPlan(inPost: p)?.description, "Au marché")
    }

    // MARK: - POST — ce qui est REFUSÉ

    /// **Plusieurs pièces ⇒ aucune pièce.** Un lot mentirait sur ce qui part.
    /// Le texte, lui, reste semable : le refus porte sur « quelle pièce », jamais
    /// sur la phrase qui l'accompagne.
    func test_post_plusieursPiecesComposables_neSemeAucunMedia() throws {
        let deux = [media(id: "pm-1"), media(id: "pm-2")]
        let plan = try XCTUnwrap(
            ComposableAttachment.seedPlan(inPost: post(media: deux, content: "Deux photos"))
        )
        XCTAssertNil(plan.media, "un lot ne pose pas de pièce sur le canvas")
        XCTAssertEqual(plan.description, "Deux photos")
    }

    /// Et sans texte, il n'y a plus rien à semer : la porte ne s'ouvre pas du
    /// tout, plutôt que sur une scène vide.
    func test_post_plusieursPiecesEtAucunTexte_nOffreRien() {
        XCTAssertNil(
            ComposableAttachment.seedPlan(inPost: post(media: [media(id: "a"), media(id: "b")]))
        )
    }

    func test_post_sansMediaNiTexte_nOffreRien() {
        XCTAssertNil(ComposableAttachment.seedPlan(inPost: post()))
        XCTAssertNil(ComposableAttachment.seedPlan(inPost: post(content: "   \n\t ")))
    }

    /// Un document n'est pas composable : la graine ne sait rien en poser sur un
    /// canvas, et `form(mimeType:)` l'écarte pour les trois surfaces à la fois.
    func test_post_unDocumentSeul_nePoseRien() {
        XCTAssertNil(
            ComposableAttachment.seedPlan(inPost: post(media: [media(id: "d", type: .document, url: "u")]))
        )
    }

    /// **Les trois protections, rejouées sur la SOURCE d'un post.** Voir l'écart
    /// de modèle en tête de fichier : aucune fixture de `FeedPost` ne peut porter
    /// ces drapeaux, mais la règle qu'un post alimente est la même — et c'est
    /// elle que ce témoin interroge, dans la forme EXACTE qu'un post lui remet
    /// (`carrierIsProtected: false`, pièces bridées).
    func test_post_unePieceProtegee_neSeraitPasPosee() {
        for protegee in [piece(mimeType: "image/jpeg", isViewOnce: true),
                         piece(mimeType: "image/jpeg", isBlurred: true),
                         piece(mimeType: "image/jpeg", isEncrypted: true)] {
            let source = ComposableAttachment.SeedSource(
                pieces: [protegee], text: "Au marché", carrierIsProtected: false
            )
            XCTAssertNil(ComposableAttachment.seedPlan(for: source)?.media,
                         "une pièce protégée ne se pose jamais sur un canvas")
        }
    }

    /// La forme que le post remet à la règle — ce qui rend le témoin ci-dessus
    /// représentatif plutôt que théorique.
    func test_laSourceDUnPost_bridSesMedias_etNeDeclareAucuneProtection() {
        let source = ComposableAttachment.SeedSource.post(post(media: [media()], content: "Au marché"))
        XCTAssertEqual(source.pieces.map(\.id), ["pm-1"])
        XCTAssertEqual(source.pieces.first?.mimeType, "image/jpeg")
        XCTAssertEqual(source.text, "Au marché")
        XCTAssertFalse(source.carrierIsProtected,
                       "ni Post ni PostMedia ne portent de drapeau de protection côté serveur")
    }

    // MARK: - STORY

    func test_story_uneSeulePiece_semeLeMediaEtLaDescription() throws {
        let plan = try XCTUnwrap(
            ComposableAttachment.seedPlan(inStory: story(media: [media()], content: "Coucher de soleil"))
        )
        XCTAssertEqual(plan.media?.id, "pm-1")
        XCTAssertEqual(plan.description, "Coucher de soleil")
    }

    func test_story_laDescription_descendLePrismeDuLecteur() throws {
        let traduite = story(
            media: [media()],
            content: "Sunset",
            translations: [StoryTranslation(language: "fr", content: "Coucher de soleil")]
        )
        XCTAssertEqual(
            ComposableAttachment.seedPlan(inStory: traduite, preferredLanguages: ["fr"])?.description,
            "Coucher de soleil"
        )
        XCTAssertEqual(
            ComposableAttachment.seedPlan(inStory: traduite, preferredLanguages: ["de"])?.description,
            "Sunset",
            "aucune traduction pour la langue lue ⇒ l'ORIGINAL, jamais translations.first"
        )
    }

    func test_story_plusieursPiecesComposables_neSemeAucunMedia() throws {
        let plan = try XCTUnwrap(
            ComposableAttachment.seedPlan(inStory: story(media: [media(id: "a"), media(id: "b")],
                                                         content: "Deux"))
        )
        XCTAssertNil(plan.media)
    }

    func test_story_sansMediaNiTexte_nOffreRien() {
        XCTAssertNil(ComposableAttachment.seedPlan(inStory: story()))
    }

    func test_story_unePieceProtegee_neSeraitPasPosee() {
        for protegee in [piece(mimeType: "image/jpeg", isViewOnce: true),
                         piece(mimeType: "image/jpeg", isBlurred: true),
                         piece(mimeType: "image/jpeg", isEncrypted: true)] {
            let source = ComposableAttachment.SeedSource(
                pieces: [protegee], text: "Coucher de soleil", carrierIsProtected: false
            )
            XCTAssertNil(ComposableAttachment.seedPlan(for: source)?.media)
        }
    }

    func test_laSourceDUneStory_bridSesMedias_etDescendLePrisme() {
        let source = ComposableAttachment.SeedSource.story(
            story(media: [media()], content: "Sunset",
                  translations: [StoryTranslation(language: "fr", content: "Coucher de soleil")]),
            preferredLanguages: ["fr"]
        )
        XCTAssertEqual(source.pieces.map(\.id), ["pm-1"])
        XCTAssertEqual(source.text, "Coucher de soleil")
        XCTAssertFalse(source.carrierIsProtected)
    }

    // MARK: - Les CIBLES, et l'origine qu'elles portent

    func test_cibleDePost_porteLOrigineSociale_etUneIdentiteDistincte() throws {
        let cible = try XCTUnwrap(ComposerSeedTarget(post: post(media: [media()], content: "Au marché")))
        XCTAssertEqual(cible.attachment?.id, "pm-1")
        XCTAssertEqual(cible.id, "post/post-1/pm-1")
        XCTAssertEqual(cible.origin, .socialMedia(postId: "post-1", mediaId: "pm-1"))
    }

    func test_cibleDeStory_porteLOrigineSociale() throws {
        let cible = try XCTUnwrap(
            ComposerSeedTarget(story: story(media: [media()], content: "Coucher de soleil"),
                               preferredLanguages: [])
        )
        XCTAssertEqual(cible.id, "story/story-1/pm-1")
        XCTAssertEqual(cible.origin, .socialMedia(postId: "story-1", mediaId: "pm-1"))
    }

    func test_cible_refuseCeQuiNeSemeRien_surLesDeuxSurfaces() {
        XCTAssertNil(ComposerSeedTarget(post: post()))
        XCTAssertNil(ComposerSeedTarget(story: story(), preferredLanguages: []))
    }

    /// **Deux surfaces, deux identités.** Un `.fullScreenCover(item:)` ne
    /// re-présente rien quand l'identifiant ne change pas : un post et une story
    /// qui partageraient un identifiant de média enfermeraient le second geste.
    func test_cible_deuxSurfaces_neSeConfondentPas() throws {
        let p = try XCTUnwrap(ComposerSeedTarget(post: post(media: [media()], content: "x")))
        let s = try XCTUnwrap(
            ComposerSeedTarget(story: story(media: [media()], content: "x"), preferredLanguages: [])
        )
        XCTAssertNotEqual(p.id, s.id)
    }

    // MARK: - La GRAINE, par surface

    func test_graineDUnPost_porteLeMediaETLaDescription() async throws {
        let resolver = StubSocialMediaResolver()
        resolver.result = .success(try makeJPEG())
        let cible = try XCTUnwrap(ComposerSeedTarget(post: post(media: [media()], content: "Au marché")))

        let graine = await ComposerMediaSeeding.seed(for: cible.plan, resolver: resolver)

        XCTAssertEqual(graine?.description, "Au marché")
        guard case .image = graine?.payload else {
            return XCTFail("la graine d'un post doit poser son IMAGE sur le canvas")
        }
        XCTAssertEqual(resolver.lastRequest?.remoteURLString, "https://cdn.example/post.jpg")
    }

    func test_graineDUneStory_porteLeMediaETLaDescription() async throws {
        let resolver = StubSocialMediaResolver()
        resolver.result = .success(try makeJPEG())
        let cible = try XCTUnwrap(
            ComposerSeedTarget(story: story(media: [media()], content: "Coucher de soleil"),
                               preferredLanguages: [])
        )

        let graine = await ComposerMediaSeeding.seed(for: cible.plan, resolver: resolver)

        XCTAssertEqual(graine?.description, "Coucher de soleil")
        guard case .image = graine?.payload else {
            return XCTFail("la graine d'une story doit poser son IMAGE sur le canvas")
        }
    }

    // MARK: - Critère 2 : AUCUN second site ne réécrit la règle

    /// **La conjonction n'a qu'UNE écriture.** Le témoin ne cherche pas un nom
    /// mais la FORME du refus — « exactement une pièce composable » — parce que
    /// c'est elle qu'une surface pressée recopierait.
    func test_laConjonction_naQuUneSeuleEcriture_dansTouteLApp() throws {
        let porteurs = try sourcesContenant("composables.count == 1")
        XCTAssertEqual(
            porteurs, ["ComposableAttachmentSurfaces.swift"],
            "La règle d'offre de « Composer » doit rester UNE (critère 2 de #6085). Zéro : la garde a "
                + "cessé de mesurer. Deux : une surface l'a recopiée, et les deux écritures ont déjà "
                + "commencé à diverger."
        )
    }

    // MARK: - Critère 3 : UNE porte, appelée par les surfaces

    /// **Les surfaces montent la MÊME porte.**
    ///
    /// La liste est écrite en toutes lettres plutôt que comptée, pour la raison
    /// que `MeeshyComposerHostGuardTests` donne déjà : un SET qui grandit dit
    /// « une surface de plus », un SET qui rétrécit dit « une surface a cessé de
    /// passer par la porte et recopie son envoi ». Les deux se lisent dans un
    /// diff ; un compte ne dit ni l'un ni l'autre.
    ///
    /// Quatre fichiers pour trois surfaces : le fil en a DEUX pleins écrans —
    /// la galerie qui feuillette, et le player qui rejoue une scène. Un post
    /// composé passe par le second, et c'est le cas le plus courant du fil.
    ///
    /// Côté story, c'est le CONTENEUR qui monte la porte, pas l'en-tête qui
    /// porte l'entrée de menu : l'en-tête est reconstruit à chaque tick de la
    /// barre de progression, et un état de présentation y meurt avant d'être
    /// lu. Mesuré au simulateur (#6085).
    func test_lesSurfaces_montentLaMemePorte_etUneSeule() throws {
        let porteurs = try sourcesContenant("MediaComposerDoor(")
        XCTAssertEqual(
            porteurs,
            ["ConversationView.swift", "SocialMediaGalleryPresentation.swift",
             "SocialSceneFullscreenView.swift", "StoryViewerContainer.swift"],
            "« Composer » doit s'ouvrir par UNE porte (critère 3 de #6085) : la conversation, les deux "
                + "pleins écrans du fil et le lecteur de stories. Un nom en moins = une surface muette ; "
                + "un nom en plus = un montage qui n'est pas passé par la revue."
        )
    }

    /// **Et la règle d'offre décide sur CHACUNE.** Un site qui construirait la
    /// cible sans passer par `ComposerSeedTarget` contournerait les quatre refus
    /// d'un coup — c'est exactement le « quatrième déclencheur » que
    /// `ComposerSeedTarget.init?` existe pour rendre impossible.
    func test_aucuneSurface_neFabriqueUnPlanSansPasserParLaCible() throws {
        let porteurs = try sourcesContenant("SeedPlan(media:")
        XCTAssertEqual(
            porteurs, ["ComposableAttachmentSurfaces.swift"],
            "Un site de production compose un `SeedPlan` à la main : il court-circuite la règle d'offre, "
                + "donc les protections qu'elle porte. Le seul site autorisé est la règle elle-même."
        )
    }

    private func sourcesContenant(_ fragment: String) throws -> [String] {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
        let walker = try XCTUnwrap(
            FileManager.default.enumerator(at: racine, includingPropertiesForKeys: nil),
            "L'arbre source de l'app est introuvable — la garde ne mesurerait RIEN."
        )
        var porteurs: [String] = []
        var balayees = 0
        for case let url as URL in walker where url.pathExtension == "swift" {
            balayees += 1
            let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            if code.contains(fragment) { porteurs.append(url.lastPathComponent) }
        }
        XCTAssertGreaterThan(balayees, 50,
                             "Trop peu de sources balayées — la garde passerait au vert sur du vide.")
        return porteurs.sorted()
    }
}
