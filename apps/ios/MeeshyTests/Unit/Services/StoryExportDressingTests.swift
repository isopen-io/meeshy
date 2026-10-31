import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

// MARK: - StoryExportDressingTests

/// **Deux habillages coexistent, et UN site les décide** (#10536, demande
/// porteur 2026-10-13) : une STORY sort avec son prélude d'identité et sa carte
/// de fin ; un réel, un post, une scène de post sortent nus.
final class StoryExportDressingTests: XCTestCase {

    private let ada = StoryExportViewer(userId: "u-ada", username: "ada")

    func test_forStory_withoutAuthor_theViewerIsTheAuthor() {
        XCTAssertEqual(StoryExportDressing.forStory(of: nil, viewer: ada),
                       .story(identity: .viewer(handle: "ada")))
    }

    /// Le rang qui fait parler la règle : `StoryGroup.username` porte le NOM
    /// d'affichage. Comparé au pseudo du lecteur, il ne s'égale jamais — et
    /// l'auteur exportait SA story sans son prélude. L'identifiant tranche.
    func test_forStory_ownStoryCarriedUnderADisplayName_isStillTheViewers() {
        let author = StoryExportAuthor(userId: "u-ada", name: "Ada Lovelace")
        XCTAssertEqual(StoryExportDressing.forStory(of: author, viewer: ada),
                       .story(identity: .viewer(handle: "ada")))
    }

    func test_forStory_sameNameButAnotherAccount_isNotTheViewers() {
        let author = StoryExportAuthor(userId: "u-homonyme", name: "ada")
        XCTAssertEqual(StoryExportDressing.forStory(of: author, viewer: ada),
                       .story(identity: .author(author)))
    }

    func test_forStory_withoutIdentifier_fallsBackOnTheHandle_caseInsensitively() {
        let author = StoryExportAuthor(userId: nil, name: "Ada")
        XCTAssertEqual(StoryExportDressing.forStory(of: author, viewer: ada),
                       .story(identity: .viewer(handle: "ada")))
    }

    func test_forStory_ofSomeoneElse_presentsItsAuthor() {
        let grace = StoryExportAuthor(userId: "u-grace", name: "Grace Hopper", avatarURL: "/a/grace.jpg")
        XCTAssertEqual(StoryExportDressing.forStory(of: grace, viewer: ada),
                       .story(identity: .author(grace)))
    }

    func test_forStory_signedOutViewer_neverSignsSomeoneElsesStory() {
        let grace = StoryExportAuthor(userId: "u-grace", name: "grace")
        XCTAssertEqual(StoryExportDressing.forStory(of: grace, viewer: StoryExportViewer(userId: nil, username: nil)),
                       .story(identity: .author(grace)))
    }

    func test_appendsBrandOutro_aStoryKeepsItsCard_aBareWorkDoesNot() {
        XCTAssertTrue(StoryExportDressing.story(identity: .viewer(handle: "ada")).appendsBrandOutro)
        XCTAssertTrue(StoryExportDressing.story(identity: .author(StoryExportAuthor(userId: "u", name: "n")))
            .appendsBrandOutro)
        XCTAssertFalse(StoryExportDressing.bareWork(author: "auteur").appendsBrandOutro)
    }
}

// MARK: - StoryExportDressingResolverTests

@MainActor
final class StoryExportDressingResolverTests: XCTestCase {

    private func content(_ username: String) -> StoryExportIntroContent {
        StoryExportIntroContent(displayName: username.capitalized, username: username, accentColorHex: "6366F1")
    }

    func test_plan_bareWork_isNaked_andResolvesNoIdentity() async {
        let sut = StoryExportDressingResolver(
            viewerIntro: { XCTFail("une œuvre seule ne résout pas l'identité du lecteur"); return nil },
            authorIntro: { _ in XCTFail("une œuvre seule ne résout pas l'identité de l'auteur"); return nil })

        let plan = await sut.plan(for: .bareWork(author: "auteur"))

        XCTAssertNil(plan.intro)
        XCTAssertFalse(plan.appendsBrandOutro)
        XCTAssertEqual(plan.watermarkHandle, "auteur")
    }

    func test_plan_ownStory_carriesTheViewerInterludeAndTheCard() async {
        let ada = content("ada")
        let sut = StoryExportDressingResolver(
            viewerIntro: { ada },
            authorIntro: { _ in XCTFail("sa propre story ne résout pas un autre auteur"); return nil })

        let plan = await sut.plan(for: .story(identity: .viewer(handle: "ada")))

        XCTAssertEqual(plan.intro?.username, "ada")
        XCTAssertTrue(plan.appendsBrandOutro)
        XCTAssertEqual(plan.watermarkHandle, "ada")
    }

    func test_plan_storyOfSomeoneElse_presentsTheAuthor_neverTheViewer() async {
        let grace = content("grace")
        let sut = StoryExportDressingResolver(
            viewerIntro: { XCTFail("le lecteur ne signe pas la story d'un autre de son visage"); return nil },
            authorIntro: { _ in grace })

        let plan = await sut.plan(for: .story(identity: .author(StoryExportAuthor(userId: "u-grace",
                                                                                    name: "Grace Hopper"))))

        XCTAssertEqual(plan.intro?.username, "grace")
        XCTAssertTrue(plan.appendsBrandOutro)
        XCTAssertEqual(plan.watermarkHandle, "grace", "le filigrane nomme le pseudo résolu, pas le nom d'affichage")
    }

    /// Passé la borne, l'interlude reste DÛ : nom et teinte de repli plutôt
    /// qu'une story sans prélude — et sans attendre l'avatar.
    func test_plan_authorIdentitySlowerThanTheBound_stillPaintsASoberInterlude() async {
        let sut = StoryExportDressingResolver(
            viewerIntro: { nil },
            authorIntro: { _ in
                try? await Task.sleep(for: .seconds(3))
                return StoryExportIntroContent(displayName: "Late", username: "late", accentColorHex: "FFFFFF")
            },
            timeout: .milliseconds(100))
        let start = Date()

        let plan = await sut.plan(for: .story(identity: .author(StoryExportAuthor(userId: nil, name: "grace"))))

        XCTAssertEqual(plan.intro?.username, "grace", "l'interlude de repli nomme l'auteur")
        XCTAssertNil(plan.intro?.avatar)
        XCTAssertFalse(plan.intro?.accentColorHex.isEmpty ?? true)
        XCTAssertTrue(plan.appendsBrandOutro)
        XCTAssertLessThan(Date().timeIntervalSince(start), 1.5, "la borne coupe, on n'attend pas les 3 s")
    }
}

// MARK: - StoryExportAuthorIdentityTests

final class StoryExportAuthorIdentityTests: XCTestCase {

    func test_source_withoutProfile_usesWhatTheCallerHolds() {
        let author = StoryExportAuthor(userId: "u-grace", name: "Grace Hopper", avatarURL: "/a/grace.jpg")

        let source = StoryExportAuthorIdentity.source(for: author, profile: nil)

        XCTAssertEqual(source, StoryExportIntroSource(userId: "u-grace", displayName: "Grace Hopper",
                                                      username: "Grace Hopper", avatarURL: "/a/grace.jpg"))
    }

    func test_source_withProfile_takesTheRealHandleAndTheBanner() {
        let author = StoryExportAuthor(userId: "u-grace", name: "Grace Hopper", avatarURL: "/a/group.jpg")
        let profile = MeeshyUser(id: "u-grace", username: "grace", displayName: "Grace Hopper",
                                 avatar: "/a/profile.jpg", avatarThumbHash: "avatar-hash",
                                 banner: "/b/grace.jpg", bannerThumbHash: "banner-hash")

        let source = StoryExportAuthorIdentity.source(for: author, profile: profile)

        XCTAssertEqual(source, StoryExportIntroSource(userId: "u-grace", displayName: "Grace Hopper",
                                                      username: "grace", avatarURL: "/a/profile.jpg",
                                                      bannerURL: "/b/grace.jpg", backgroundThumbHash: "banner-hash"))
    }

    func test_source_profileWithoutAvatarOrBannerHash_keepsTheGroupAvatar_andFallsBackOnTheAvatarHash() {
        let author = StoryExportAuthor(userId: "u-grace", name: "Grace", avatarURL: "/a/group.jpg")
        let profile = MeeshyUser(id: "u-grace", username: "grace", firstName: "Grace", lastName: "Hopper",
                                 avatarThumbHash: "avatar-hash")

        let source = StoryExportAuthorIdentity.source(for: author, profile: profile)

        XCTAssertEqual(source.displayName, "Grace Hopper")
        XCTAssertEqual(source.avatarURL, "/a/group.jpg")
        XCTAssertEqual(source.backgroundThumbHash, "avatar-hash")
    }

    // MARK: Contour de l'avatar — la règle de la carte d'identité de la visionneuse

    private static let filet = ServedProfileDecorItem(pack: "contours-essentiels", item: "filet", origin: .builtin)
    private static let perle = ServedProfileDecorItem(pack: "contours-essentiels", item: "perle", origin: .builtin)

    func test_source_profileRing_beatsTheGroupRing() {
        let author = StoryExportAuthor(userId: "u-grace", name: "Grace", avatarRing: Self.perle)
        let profile = MeeshyUser(id: "u-grace", username: "grace",
                                 profileDecor: ServedProfileDecor(avatarRing: Self.filet))

        XCTAssertEqual(StoryExportAuthorIdentity.source(for: author, profile: profile).avatarRing, Self.filet)
    }

    func test_source_profileWithoutRing_fallsBackOnTheGroupRing() {
        let author = StoryExportAuthor(userId: "u-grace", name: "Grace", avatarRing: Self.perle)
        let profile = MeeshyUser(id: "u-grace", username: "grace")

        XCTAssertEqual(StoryExportAuthorIdentity.source(for: author, profile: profile).avatarRing, Self.perle)
    }

    func test_source_withoutProfile_keepsTheGroupRing() {
        let author = StoryExportAuthor(userId: "u-grace", name: "Grace", avatarRing: Self.perle)

        XCTAssertEqual(StoryExportAuthorIdentity.source(for: author, profile: nil).avatarRing, Self.perle)
    }

    func test_initGroup_copiesTheAuthorRing() {
        let group = StoryGroup(id: "u-grace", username: "Grace Hopper", avatarColor: "6366F1",
                               avatarURL: "/a/grace.jpg", stories: [], authorRing: Self.filet)

        XCTAssertEqual(StoryExportAuthor(group: group),
                       StoryExportAuthor(userId: "u-grace", name: "Grace Hopper",
                                         avatarURL: "/a/grace.jpg", avatarRing: Self.filet))
    }
}

// MARK: - StoryExportRelationBadgeTests

/// **Présence servie et logo de cercle de l'auteur, de l'app jusqu'à l'intro** (#13997).
/// La présence est la projection de ce que le serveur a servi (rien servi, rien peint) ; le
/// niveau vient d'un fournisseur INJECTÉ, dont l'implémentation réelle lit `GET /relations/:userId`.
@MainActor
final class StoryExportRelationBadgeTests: XCTestCase {

    private nonisolated struct StubRelationLevels: RelationLevelProviding {
        let level: String?
        var delay: Duration? = nil

        func servedLevel(withUserId userId: String) async -> String? {
            if let delay { try? await Task.sleep(for: delay) }
            return level
        }
    }

    private func grace(presence: PresenceState? = nil) -> StoryExportAuthor {
        StoryExportAuthor(userId: "u-grace", name: "Grace Hopper", presence: presence)
    }

    // MARK: Présence

    func test_source_servedOnline_projectsAnOnlinePresence() {
        let source = StoryExportAuthorIdentity.source(for: grace(presence: .online), profile: nil)

        XCTAssertEqual(source.presence, .online)
    }

    func test_source_servedAwayAndIdle_projectEachState() {
        XCTAssertEqual(StoryExportAuthorIdentity.source(for: grace(presence: .away), profile: nil).presence, .away)
        XCTAssertEqual(StoryExportAuthorIdentity.source(for: grace(presence: .idle), profile: nil).presence, .idle)
    }

    func test_source_nothingServed_paintsNoPresence() {
        XCTAssertNil(StoryExportAuthorIdentity.source(for: grace(), profile: nil).presence)
    }

    func test_source_servedOffline_paintsNoPresence() {
        XCTAssertNil(StoryExportAuthorIdentity.source(for: grace(presence: .offline), profile: nil).presence)
    }

    func test_source_withProfile_keepsTheServedPresenceOfTheAuthor() {
        let profile = MeeshyUser(id: "u-grace", username: "grace")

        XCTAssertEqual(StoryExportAuthorIdentity.source(for: grace(presence: .away), profile: profile).presence, .away)
    }

    func test_unresolved_afterTheBound_keepsTheServedPresence() {
        let content = StoryExportAuthorIdentity.unresolved(grace(presence: .online))

        XCTAssertEqual(content.presence, .online)
        XCTAssertNil(content.relationLogo, "le niveau n'a pas été attendu : pas de logo")
    }

    func test_initGroup_copiesTheServedPresenceOfTheGroup() {
        let group = StoryGroup(id: "u-grace", username: "Grace", avatarColor: "6366F1", stories: [],
                               authorPresence: UserPresence(isOnline: true))

        XCTAssertEqual(StoryExportAuthor(group: group).presence, .online)
    }

    func test_initGroup_withoutServedPresence_hasNone() {
        let group = StoryGroup(id: "u-grace", username: "Grace", avatarColor: "6366F1", stories: [])

        XCTAssertNil(StoryExportAuthor(group: group).presence)
    }

    /// Le chemin que montent la feuille d'export et « Imager » : sans entrée vivante dans le
    /// `PresenceManager`, la présence est celle que la passerelle a servie avec le groupe.
    func test_served_authorUnknownToTheLiveMap_projectsThePresenceServedWithTheGroup() {
        let group = StoryGroup(id: "u-\(UUID().uuidString)", username: "Grace", avatarColor: "6366F1", stories: [],
                               authorPresence: UserPresence(isOnline: false, lastActiveAt: Date().addingTimeInterval(-120)))

        XCTAssertEqual(StoryExportAuthor.served(from: group).presence, .away)
    }

    /// Pas ami : la passerelle ne sert rien, et l'export ne fabrique aucune présence.
    func test_served_nothingServedNorLive_paintsNoPresence() {
        let group = StoryGroup(id: "u-\(UUID().uuidString)", username: "Grace", avatarColor: "6366F1", stories: [])

        let author = StoryExportAuthor.served(from: group)

        XCTAssertNil(author.presence)
        XCTAssertNil(StoryExportAuthorIdentity.unresolved(author).presence)
    }

    // MARK: Niveau de lien

    func test_servedLevel_injectedClose_reachesTheIntroAsTheFireLogo() async {
        let author = grace()
        let level = await StoryExportAuthorIdentity.servedLevel(of: author, levels: StubRelationLevels(level: "CLOSE"))

        let content = StoryExportIntroFactory.unresolvedContent(
            for: StoryExportAuthorIdentity.source(for: author, profile: nil, servedLevel: level))

        XCTAssertEqual(level, "CLOSE")
        XCTAssertEqual(content.relationLogo, "🔥")
    }

    func test_servedLevel_injectedBlood_reachesTheIntroAsTheBloodLogo() async {
        let author = grace()
        let level = await StoryExportAuthorIdentity.servedLevel(of: author, levels: StubRelationLevels(level: "BLOOD"))

        let content = StoryExportIntroFactory.unresolvedContent(
            for: StoryExportAuthorIdentity.source(for: author, profile: nil, servedLevel: level))

        XCTAssertEqual(content.relationLogo, "🩸")
    }

    func test_servedLevel_friendAndBelow_paintsNothing() async {
        for served in ["FRIEND", "ACQUAINTANCE", "COMMUNITY", "PUBLIC"] {
            let author = grace()
            let level = await StoryExportAuthorIdentity.servedLevel(of: author, levels: StubRelationLevels(level: served))

            let content = StoryExportIntroFactory.unresolvedContent(
                for: StoryExportAuthorIdentity.source(for: author, profile: nil, servedLevel: level))

            XCTAssertNil(content.relationLogo, served)
        }
    }

    func test_servedLevel_realProvider_servesTheEffectiveLevelOfTheServer() async {
        let api = MockAPIClientForApp()
        let served: APIResponse<ServedRelationLevel> = JSONStub.decode("""
        {"success":true,"data":{"userId":"u-grace","effectiveLevel":"CLOSE"}}
        """)
        api.stub("/relations/u-grace", result: served)

        let level = await StoryExportAuthorIdentity.servedLevel(
            of: grace(), levels: RelationLevelProvider(api: api))

        XCTAssertEqual(level, "CLOSE")
        XCTAssertEqual(api.requestEndpoints, ["/relations/u-grace"])
        XCTAssertEqual(api.requestMethods, ["GET"])
    }

    func test_servedLevel_realProvider_publicIsServedAsIs_andPaintsNothing() async {
        let api = MockAPIClientForApp()
        let served: APIResponse<ServedRelationLevel> = JSONStub.decode("""
        {"success":true,"data":{"userId":"u-grace","effectiveLevel":"PUBLIC"}}
        """)
        api.stub("/relations/u-grace", result: served)

        let level = await StoryExportAuthorIdentity.servedLevel(
            of: grace(), levels: RelationLevelProvider(api: api))
        let content = StoryExportIntroFactory.unresolvedContent(
            for: StoryExportAuthorIdentity.source(for: grace(), profile: nil, servedLevel: level))

        XCTAssertEqual(level, "PUBLIC")
        XCTAssertNil(content.relationLogo)
    }

    func test_servedLevel_realProvider_serverError_servesNothing() async {
        let api = MockAPIClientForApp()
        api.errorToThrow = URLError(.badServerResponse)

        let level = await StoryExportAuthorIdentity.servedLevel(
            of: grace(), levels: RelationLevelProvider(api: api))

        XCTAssertNil(level)
        XCTAssertEqual(api.requestCount, 1)
    }

    func test_servedLevel_realProvider_unsuccessfulEnvelope_servesNothing() async {
        let api = MockAPIClientForApp()
        let served: APIResponse<ServedRelationLevel> = JSONStub.decode("""
        {"success":false,"data":{"userId":"u-grace","effectiveLevel":"BLOOD"}}
        """)
        api.stub("/relations/u-grace", result: served)

        let level = await StoryExportAuthorIdentity.servedLevel(
            of: grace(), levels: RelationLevelProvider(api: api))

        XCTAssertNil(level)
    }

    func test_servedLevel_realProvider_authorWithoutIdentifier_makesNoRequest() async {
        let api = MockAPIClientForApp()

        let level = await StoryExportAuthorIdentity.servedLevel(
            of: StoryExportAuthor(userId: nil, name: "grace"), levels: RelationLevelProvider(api: api))

        XCTAssertNil(level)
        XCTAssertEqual(api.requestCount, 0)
    }

    func test_servedLevel_authorWithoutIdentifier_isNeverAsked() async {
        let anonymous = StoryExportAuthor(userId: nil, name: "grace")

        let level = await StoryExportAuthorIdentity.servedLevel(of: anonymous, levels: StubRelationLevels(level: "CLOSE"))

        XCTAssertNil(level)
    }

    func test_servedLevel_slowerThanTheBound_isGivenUp_withoutWaiting() async {
        let slow = StubRelationLevels(level: "CLOSE", delay: .seconds(3))
        let start = Date()

        let level = await StoryExportAuthorIdentity.servedLevel(of: grace(), levels: slow, timeout: .milliseconds(100))

        XCTAssertNil(level)
        XCTAssertLessThan(Date().timeIntervalSince(start), 1.5, "l'export n'attend jamais le niveau au-delà de sa borne")
    }
}

// MARK: - StoryExportPathsDressingTests

/// **Un témoin par chemin qui sort une STORY en vidéo** (#10536) : le moteur
/// injecté reçoit un interlude et `appendsBrandOutro == true`. Les chemins
/// réel / post ont leurs témoins de non-régression dans `ReelSceneRoutingTests`
/// (`test_savePost_…`, `test_renderSceneFile_…`), la scène de post dans
/// `StoryPhotoSaveServiceTests` (`test_saveScene_…`).
@MainActor
final class StoryExportPathsDressingTests: XCTestCase {

    private func content(_ username: String) -> StoryExportIntroContent {
        StoryExportIntroContent(displayName: username.capitalized, username: username, accentColorHex: "6366F1")
    }

    private func makeStory() -> StoryItem {
        StoryItem(id: "story-\(UUID().uuidString)",
                  content: "Bonjour",
                  storyEffects: StoryEffects(textObjects: [StoryTextObject(text: "Bonjour")]))
    }

    /// Un auteur qui ne peut pas être l'utilisateur connecté, quelle que soit
    /// la session résiduelle du simulateur.
    private func someoneElse() -> StoryExportAuthor {
        StoryExportAuthor(userId: "u-\(UUID().uuidString)", name: "Grace Hopper")
    }

    private func makeService(
        exporter: ScriptedStoryExporter,
        viewerIntro: @escaping StoryExportDressingResolver.ViewerIntro,
        authorIntro: @escaping StoryExportDressingResolver.AuthorIntro
    ) -> StoryPhotoSaveService {
        StoryPhotoSaveService(exporter: exporter, photoSaver: StubPhotoSaver(), toasts: MockFeedbackToast(),
                              preferredLanguages: { [] }, intro: viewerIntro, authorIntro: authorIntro,
                              watermark: { _ in nil })
    }

    private func waitUntilIdle(_ sut: StoryPhotoSaveService, storyId: String) async {
        for _ in 0..<200 where sut.progress(for: storyId) != nil { await Task.yield() }
        XCTAssertNil(sut.progress(for: storyId), "le job n'a jamais été retiré")
    }

    // MARK: Rail de l'auteur et « Mes stories » — `save(story:)`

    func test_saveStory_ownStory_bakesWithTheInterludeAndTheBrandOutro() async {
        let exporter = ScriptedStoryExporter()
        let ada = content("ada")
        let sut = makeService(exporter: exporter, viewerIntro: { ada },
                              authorIntro: { _ in XCTFail("sa propre story"); return nil })
        let story = makeStory()

        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertEqual(exporter.lastIntro?.username, "ada", "le prélude d'identité précède la story")
        XCTAssertEqual(exporter.lastAppendsBrandOutro, true, "la carte de fin la ferme")
    }

    // MARK: Enregistrer la story d'un autre — `save(story:author:)`

    func test_saveStory_ofAnotherAuthor_bakesWithTheAuthorInterludeAndTheBrandOutro() async {
        let exporter = ScriptedStoryExporter()
        let grace = content("grace")
        let sut = makeService(exporter: exporter,
                              viewerIntro: { XCTFail("le lecteur ne signe pas de son visage"); return nil },
                              authorIntro: { _ in grace })
        let story = makeStory()

        sut.save(story: story, author: someoneElse())
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertEqual(exporter.lastIntro?.username, "grace")
        XCTAssertEqual(exporter.lastAppendsBrandOutro, true)
    }

    // MARK: Feuille de partage du système — `renderStoryFile(of:author:)`

    /// LE défaut relevé : « Enregistrer la vidéo », Fichiers et AirDrop
    /// passaient `intro: nil` — la story sortait comme un réel.
    func test_renderStoryFile_ownStory_bakesWithTheInterludeAndTheBrandOutro() async {
        let exporter = ScriptedStoryExporter()
        let ada = content("ada")
        let sut = makeService(exporter: exporter, viewerIntro: { ada },
                              authorIntro: { _ in XCTFail("sa propre story"); return nil })

        let url = await sut.renderStoryFile(of: makeStory(), author: nil)

        XCTAssertNotNil(url)
        XCTAssertEqual(exporter.lastIntro?.username, "ada", "la feuille de partage emporte le prélude")
        XCTAssertEqual(exporter.lastAppendsBrandOutro, true)
        if let url { exporter.cleanupExport(at: url) }
    }

    func test_renderStoryFile_storyOfSomeoneElse_bakesWithTheAuthorInterludeAndTheBrandOutro() async {
        let exporter = ScriptedStoryExporter()
        let grace = content("grace")
        let sut = makeService(exporter: exporter,
                              viewerIntro: { XCTFail("le lecteur ne signe pas de son visage"); return nil },
                              authorIntro: { _ in grace })

        let url = await sut.renderStoryFile(of: makeStory(), author: someoneElse())

        XCTAssertNotNil(url)
        XCTAssertEqual(exporter.lastIntro?.username, "grace")
        XCTAssertEqual(exporter.lastAppendsBrandOutro, true)
        if let url { exporter.cleanupExport(at: url) }
    }

    // MARK: « Exporter en vidéo » — `StoryExportShareViewModel.startExport`

    func test_startExport_ownStory_bakesWithTheInterludeAndTheBrandOutro() async {
        let exporter = MockShareExporter(behavior: .success)
        let ada = content("ada")
        let sut = StoryExportShareViewModel(exporter: exporter, brandIntro: { ada },
                                            authorIntro: { _ in XCTFail("sa propre story"); return nil })

        await sut.startExport(story: makeStory())

        XCTAssertEqual(exporter.lastIntro?.username, "ada")
        XCTAssertEqual(exporter.lastAppendsBrandOutro, true)
        sut.finishSharing(success: true)
    }

    func test_startExport_storyOfSomeoneElse_bakesWithTheAuthorInterludeAndTheBrandOutro() async {
        let exporter = MockShareExporter(behavior: .success)
        let grace = content("grace")
        let sut = StoryExportShareViewModel(
            exporter: exporter,
            brandIntro: { XCTFail("le lecteur ne signe pas de son visage"); return nil },
            authorIntro: { _ in grace })

        await sut.startExport(story: makeStory(), author: someoneElse())

        XCTAssertEqual(exporter.lastIntro?.username, "grace", "l'interlude présente l'AUTEUR de la story")
        XCTAssertEqual(exporter.lastAppendsBrandOutro, true)
        sut.finishSharing(success: true)
    }
}
