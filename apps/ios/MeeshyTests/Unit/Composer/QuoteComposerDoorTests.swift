import XCTest
@testable import Meeshy
@testable import MeeshySDK
import MeeshyUI

/// **« Citer » ouvre le compositeur unifié, la source y est AFFICHÉE, et la
/// citation part par l'écrivain durable du repost** (#15628).
///
/// La citation d'un post ou d'un réel ouvrait `FeedComposerSheet`, une feuille
/// à part qui ne publiait que le commentaire. Cette suite tient la porte (le
/// meuble, plus aucun historique), la carte (la RACINE citée, figée), la scène
/// (l'écriture seule), le plan (ce qui part, ou pourquoi rien ne part) et
/// l'écrivain (hors ligne la file durable, en ligne le réseau).
@MainActor
final class QuoteComposerDoorTests: XCTestCase {

    // MARK: - Fabriques

    private func publication(
        id: String = "post-1",
        type: String? = "POST",
        content: String = "le texte cité",
        repost: RepostContent? = nil,
        media: [FeedMedia] = [],
        visibility: String? = "PUBLIC"
    ) -> FeedPost {
        var post = FeedPost(id: id, author: "Alice", authorId: "alice-id", type: type, content: content,
                            repost: repost, media: media)
        post.visibility = visibility
        return post
    }

    private func racine(id: String = "racine-1", type: String? = "REEL",
                        originalRepostOfId: String? = nil) -> RepostContent {
        RepostContent(id: id, author: "Bruno", authorId: "bruno-id", content: "la racine",
                      type: type, moodEmoji: "🔥",
                      media: [FeedMedia(id: "m1", type: .video, url: "https://cdn/v.mp4"),
                              FeedMedia(id: "m2", type: .image, url: "https://cdn/i.jpg")],
                      originalRepostOfId: originalRepostOfId, visibility: "FRIENDS")
    }

    private func brouillon(
        format: ComposerFormat = .post,
        text: String = "mon avis",
        visibility: PostVisibility = .public,
        repostOfId: String? = "post-1",
        location: SharedPlace? = nil,
        storyEffects: StoryEffects? = nil
    ) -> ComposerDocumentDraft {
        .document(
            format: format, forcePlainPost: false, text: text, visibility: visibility,
            visibilityUserIds: [], repostOfId: repostOfId, localMedia: [], location: location,
            discoverabilityPrecision: nil, originalLanguage: nil, mobileTranscription: nil,
            references: [], storyEffects: storyEffects, mediaCaptions: [:], mediaAlts: [:],
            mediaObjectIds: [:], allowSoundExtraction: nil
        )
    }

    private func ecrivain(horsLigne: Bool) -> (ComposerQuotePublisher, MockPostService, MockOfflineQueue) {
        let service = MockPostService()
        let file = MockOfflineQueue()
        let publieur = RepostPublisher(postService: service, offlineQueue: file, isOffline: { horsLigne })
        return (ComposerQuotePublisher(writer: publieur), service, file)
    }

    // MARK: - 1. La porte : le meuble, jamais l'historique

    func test_laCitationDUnPostOuDUnReel_neRouteVersAucunComposerHistorique() {
        for format: ComposerFormat in [.post, .reel] {
            let intent = ComposerIntent(origin: .repost(ofPostId: "s", sourceFormat: format))
            XCTAssertNil(
                ComposerProfile.profile(for: intent.origin).routesToLegacy,
                "Citer un \(format) doit ouvrir le compositeur unifié : la feuille historique quitte le dépôt."
            )
        }
    }

    func test_citerUnPost_viseLaCarte_etMiroiteSonFormat() {
        let intent = ComposerQuoteDoor.intent(quoting: publication(id: "p-9", type: "POST"))
        XCTAssertEqual(intent.origin, .repost(ofPostId: "p-9", sourceFormat: .post))
    }

    /// Citer le repost d'un réel cite la RACINE et garde le format de la CARTE.
    func test_citerUneRepublication_viseLaRacine_etGardeLeFormatDeLaCarte() {
        let carte = publication(id: "carte-1", type: "REEL", repost: racine(id: "racine-7"))
        XCTAssertEqual(ComposerQuoteDoor.intent(quoting: carte).origin,
                       .repost(ofPostId: "racine-7", sourceFormat: .reel))
    }

    // MARK: - 2. La carte : la racine, figée

    func test_laCarteDUnPost_montreSonAuteur_sonTexte_etSonPremierMedia() {
        let media = [FeedMedia(id: "a", type: .image, url: "https://cdn/a.jpg"),
                     FeedMedia(id: "b", type: .image, url: "https://cdn/b.jpg")]
        let carte = ComposerQuotedPublication(quoting: publication(content: "bonjour", media: media,
                                                                   visibility: "PRIVATE"))
        XCTAssertEqual(carte.author, "Alice")
        XCTAssertEqual(carte.text, "bonjour")
        XCTAssertEqual(carte.primaryMedia?.id, "a")
        XCTAssertEqual(carte.mediaCount, 2)
        XCTAssertEqual(carte.visibility, "PRIVATE")
    }

    func test_laCarteDUneRepublication_montreLaRacine_pasLIntermediaire() {
        let carte = ComposerQuotedPublication(quoting: publication(content: "mon commentaire",
                                                                   repost: racine()))
        XCTAssertEqual(carte.author, "Bruno", "La carte doit montrer ce que la citation désignera : la racine.")
        XCTAssertEqual(carte.text, "la racine")
        XCTAssertEqual(carte.moodEmoji, "🔥")
        XCTAssertEqual(carte.primaryMedia?.id, "m1")
        XCTAssertEqual(carte.visibility, "FRIENDS")
    }

    // MARK: - 3. L'hydratation : l'audience de la source, aucune reprise de brouillon

    /// Rang 2 (leçon 261) : la racine est en anglais, traduite en français,
    /// prisme `['fr', 'en']`. Le texte brut citerait « Hello » (#16002).
    func test_laCarteDUneRepublication_sertLeTexteDuPrisme_auRangDeux() throws {
        let apiRacine = RepostContent(id: "racine-1", author: "Bruno", authorId: "bruno-id", content: "Hello",
                                      type: "POST", originalLanguage: "en",
                                      translations: ["fr": PostTranslation(text: "Bonjour")])
        let carte = publication(content: "", repost: apiRacine).resolved(preferredLanguages: ["fr", "en"])

        XCTAssertEqual(ComposerQuotedPublication(quoting: carte).text, "Bonjour")
        XCTAssertEqual(FeedPostCard.repostBodyText(for: try XCTUnwrap(carte.repost)), "Bonjour")
    }

    func test_laCitation_plafonneLAudience_aCelleDeLaSource() {
        let hydratation = ComposerHydration.quotingPublication(
            ComposerQuotedPublication(quoting: publication(visibility: "FRIENDS")))
        XCTAssertEqual(hydratation.allowedVisibilities, StoryRepostAudience.allowed(fromRawValue: "FRIENDS"))
        XCTAssertEqual(hydratation.initialVisibility, "FRIENDS")
        XCTAssertEqual(hydratation.initialVisibilityUserIds, [])
        XCTAssertNil(hydratation.repostSource, "Une citation n'est pas une republication de story.")
        XCTAssertEqual(hydratation.quotedPublication?.author, "Alice")
    }

    func test_uneSourceDAudienceInconnue_nePlafonneRien() {
        let hydratation = ComposerHydration.quotingPublication(
            ComposerQuotedPublication(quoting: publication(visibility: nil)))
        XCTAssertNil(hydratation.allowedVisibilities)
    }

    /// Éditer un repost montre aussi ce qu'il cite.
    func test_editerUnRepost_montreLaSourceQuIlCite() {
        let repost = publication(id: "mon-repost", content: "mon commentaire", repost: racine())
        let session = PostEditComposerSession(post: repost, defaultLanguage: "fr")
        XCTAssertEqual(session.seed.quoted?.author, "Bruno")
        XCTAssertEqual(session.seed.quoted?.text, "la racine")
        XCTAssertNil(PostEditComposerSession(post: publication(), defaultLanguage: "fr").seed.quoted,
                     "Une publication qui ne republie rien n'a pas de carte citée.")
    }

    // MARK: - 4. La scène : l'écriture, rien d'autre

    private func portes(_ origin: ComposerOrigin, format: ComposerFormat = .post) -> [ComposerRailDoor] {
        ComposerQuoteScene.doors(served: ComposerSceneCapabilities.doors, format: format, allowsCapture: false,
                                 origin: origin)
    }

    func test_laSceneDUneCitation_nOffreQueLesPortesDEcriture() {
        let cite = portes(.repost(ofPostId: "s", sourceFormat: .reel), format: .reel)
        XCTAssertFalse(cite.isEmpty)
        XCTAssertTrue(cite.allSatisfy(ComposerRailDoor.writingDoors.contains),
                      "Un média, un sticker ou un lieu n'atteindrait pas le serveur : \(cite)")
    }

    func test_lesAutresPortes_gardentToutesLeursPortes() {
        let offertes = ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors, format: .post,
                                                allowsCapture: false)
        XCTAssertGreaterThan(offertes.count, ComposerRailDoor.writingDoors.count)
        XCTAssertEqual(portes(.feedComposer), offertes)
        XCTAssertEqual(portes(.repost(ofPostId: "s", sourceFormat: .story)), offertes,
                       "La republication d'une story garde son atelier entier.")
    }

    func test_laSceneDUneCitation_nArmeAucuneCamera_niSonIndication() {
        XCTAssertFalse(ComposerQuoteScene.servesCapture(origin: .repost(ofPostId: "s", sourceFormat: .post)),
                       "« Touchez la scène pour la caméra » se posait sur la carte citée : la prise serait refusée.")
        XCTAssertFalse(ComposerQuoteScene.servesCapture(origin: .repost(ofPostId: "s", sourceFormat: .reel)))
        XCTAssertTrue(ComposerQuoteScene.servesCapture(origin: .repost(ofPostId: "s", sourceFormat: .story)))
        XCTAssertTrue(ComposerQuoteScene.servesCapture(origin: .feedComposer))
    }

    func test_lesQuatreGestesDeLaCaptureRapide_lisentLaCitation() throws {
        func corps(_ fichier: String, de debut: String, a fin: String) throws -> String {
            let url = Self.appRoot.appendingPathComponent("Meeshy/Features/Composer/\(fichier)")
            let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
                .components(separatedBy: .whitespacesAndNewlines).joined()
            guard let d = code.range(of: debut), let f = code.range(of: fin, range: d.upperBound..<code.endIndex)
            else { XCTFail("\(fichier) a changé de forme"); return "" }
            return String(code[d.upperBound..<f.lowerBound])
        }
        let vue = "MeeshyComposerHost+Viewfinder.swift"
        XCTAssertTrue(try corps(vue, de: "funchandleSceneCaptureLongPress(){", a: "funchandleSceneQuickTap()")
            .hasPrefix("guard!writesText,sceneServesCapture,"))
        XCTAssertTrue(try corps(vue, de: "funchandleSceneQuickTap()->Bool{", a: "funcendSceneWriting()")
            .hasPrefix("guardsceneServesCapture,"))
        XCTAssertTrue(try corps(vue, de: "varsceneQuickCaptureIsOffered:Bool{", a: "ComposerSceneQuickCapture.offers(")
            .hasPrefix("sceneServesCapture&&"))
        XCTAssertTrue(try corps("MeeshyComposerHost+SceneState.swift",
                                de: "varsceneQuickCaptureHint:ComposerSceneQuickCapture.Hint?{", a: "returnComposerSceneQuickCapture.hint")
            .hasPrefix("guardautosave.didBind,sceneQuickCaptureIsOffered"))
    }

    // MARK: - 5. Le plan : ce qui part, ou pourquoi rien ne part

    func test_unCommentaire_partEnCitation_auFormatEtALAudienceChoisis() {
        guard case .send(let intention) = ComposerQuoteSendPlan.plan(
            for: brouillon(format: .reel, text: "  mon avis  ", visibility: .friends)) else {
            return XCTFail("Une citation avec commentaire doit partir.")
        }
        XCTAssertEqual(intention.postId, "post-1")
        XCTAssertEqual(intention.targetType, .reel)
        XCTAssertEqual(intention.content, "mon avis")
        XCTAssertTrue(intention.isQuote)
        XCTAssertEqual(intention.visibility, PostVisibility.friends.rawValue)
    }

    func test_unCommentaireVide_faitUnRepartageSec() {
        guard case .send(let intention) = ComposerQuoteSendPlan.plan(for: brouillon(text: "   ")) else {
            return XCTFail("Citer sans un mot reste un repartage.")
        }
        XCTAssertFalse(intention.isQuote)
        XCTAssertNil(intention.content)
    }

    func test_unLieuOuUnObjetDeScene_estRefuse_plutotQuePerduSansUnMot() {
        let lieu = SharedPlace(latitude: 48.85, longitude: 2.35, name: "Paris")
        XCTAssertEqual(ComposerQuoteSendPlan.plan(for: brouillon(location: lieu)), .refuse(.carriesMoreThanText))

        var effets = StoryEffects()
        effets.textObjects = [StoryTextObject(id: "t", text: "écrit sur la scène")]
        XCTAssertEqual(ComposerQuoteSendPlan.plan(for: brouillon(storyEffects: effets)),
                       .refuse(.carriesMoreThanText))
    }

    func test_uneSceneSansObjet_neBloquePasLaCitation() {
        XCTAssertNotEqual(ComposerQuoteSendPlan.plan(for: brouillon(storyEffects: StoryEffects())),
                          .refuse(.carriesMoreThanText))
    }

    func test_sansSource_ouSourceEnAttente_ouMauvaisFormat_rienNePart() {
        XCTAssertEqual(ComposerQuoteSendPlan.plan(for: brouillon(repostOfId: nil)), .refuse(.notAQuote))
        XCTAssertEqual(ComposerQuoteSendPlan.plan(for: brouillon(repostOfId: ClientMutationId.generate())),
                       .refuse(.pendingSource))
        XCTAssertEqual(ComposerQuoteSendPlan.plan(for: brouillon(format: .story)),
                       .refuse(.wrongFormat(.story)))
    }

    // MARK: - 6. L'écrivain : la file durable hors ligne, le réseau en ligne

    func test_horsLigne_laCitation_estGraveeDansLaFileDurable_sansToucherLeReseau() async throws {
        let (publieur, service, file) = ecrivain(horsLigne: true)

        let issue = await publieur.publish(brouillon(format: .reel, text: "mon avis", visibility: .friends))

        XCTAssertEqual(issue, .accepted(.queued))
        XCTAssertEqual(service.repostCallCount, 0)
        let charge = try XCTUnwrap(file.enqueueCalls.first?.payload as? RepostPostPayload)
        XCTAssertEqual(charge.postId, "post-1")
        XCTAssertEqual(charge.targetType, PostType.reel.rawValue)
        XCTAssertEqual(charge.content, "mon avis")
        XCTAssertTrue(charge.isQuote)
        XCTAssertEqual(charge.visibility, PostVisibility.friends.rawValue)
    }

    func test_enLigne_laCitation_partSurLeReseau() async {
        let (publieur, service, file) = ecrivain(horsLigne: false)

        let issue = await publieur.publish(brouillon())

        XCTAssertEqual(issue, .accepted(.sent))
        XCTAssertEqual(service.repostCallCount, 1)
        XCTAssertEqual(service.lastRepostContent, "mon avis")
        XCTAssertEqual(service.lastRepostIsQuote, true)
        XCTAssertTrue(file.enqueueCalls.isEmpty)
    }

    func test_enLigne_uneSourceDisparue_estUnEchecNomme() async {
        let (publieur, service, _) = ecrivain(horsLigne: false)
        service.repostResult = .failure(MeeshyError.server(statusCode: 404, message: "gone"))

        let issue = await publieur.publish(brouillon())

        XCTAssertEqual(issue, .failed(.sourceGone))
        XCTAssertFalse(issue.isAccepted, "Un échec laisse le compositeur ouvert, le commentaire intact.")
    }

    func test_unRefus_neToucheNiLeReseauNiLaFile() async {
        let (publieur, service, file) = ecrivain(horsLigne: true)

        let issue = await publieur.publish(brouillon(location: SharedPlace(latitude: 45.7, longitude: 4.8, name: "Lyon")))

        XCTAssertEqual(issue, .refused(.carriesMoreThanText))
        XCTAssertEqual(service.repostCallCount, 0)
        XCTAssertTrue(file.enqueueCalls.isEmpty)
    }

    // MARK: - 7. Les sites : la porte unique, et la feuille partie

    private static let appRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()

    private func sourcesDeLApp() throws -> [(chemin: String, code: String)] {
        let racineApp = Self.appRoot.appendingPathComponent("Meeshy")
        let enumerateur = try XCTUnwrap(FileManager.default.enumerator(at: racineApp, includingPropertiesForKeys: nil))
        return try enumerateur.compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
            .map { ($0.path, AppSourceGuard.stripComments(try String(contentsOf: $0, encoding: .utf8))) }
    }

    func test_lesDeuxSitesDeCitation_montentLaPorteDuCompositeur() throws {
        let sources = try sourcesDeLApp()
        XCTAssertGreaterThan(sources.count, 100, "Le balayage n'a pas lu l'app.")
        let sites = sources.filter { $0.code.contains("QuoteComposerDoor(") }
            .map { URL(fileURLWithPath: $0.chemin).lastPathComponent }
            .sorted()
        XCTAssertEqual(sites, ["FeedView.swift", "QuoteComposerDoor.swift", "RootViewComponents.swift"],
                       "« Citer » depuis le fil, la feuille de détail et le lecteur de réels (`QuoteComposerCover`, #15869) ouvrent le compositeur.")
    }

    func test_plusRienNeMonteLaFeuilleHistorique_etElleAQuitteLeDepot() throws {
        let montages = try sourcesDeLApp().filter { $0.code.contains("FeedComposerSheet(") }.map(\.chemin)
        XCTAssertEqual(montages, [], "Plus aucun site ne doit monter `FeedComposerSheet`.")
        for fichier in ["FeedComposerSheet.swift", "FeedComposerQuotedPostPreview.swift",
                        "FeedComposerAttachmentsRow.swift"] {
            XCTAssertFalse(
                FileManager.default.fileExists(atPath: Self.appRoot
                    .appendingPathComponent(AppSourceGuard.featureViewPath(fichier)).path),
                "\(fichier) doit avoir quitté le dépôt avec la feuille."
            )
        }
    }
}
