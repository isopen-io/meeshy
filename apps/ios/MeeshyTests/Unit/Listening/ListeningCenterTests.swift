import Combine
import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// L'écoute de mes Proches et de mes Sangs sur iOS (#16755, iso web #16729) : ce qui s'affiche est ce que la passerelle a
/// servi, jamais plus ; une montée fait apparaître le titre, une baisse le retire, `cleared` et l'échéance l'effacent,
/// et le rattrapage départage ce qui arrive pendant sa demande.
@MainActor
final class ListeningCenterTests: XCTestCase {

    final class Clock: @unchecked Sendable {
        var now = Date(timeIntervalSince1970: 1_800_000_000)
    }

    private struct Rig {
        let sut: ListeningCenter
        let clock: Clock
    }

    private func makeRig(viewer: String = "me", snapshot: [NowPlayingChanged] = []) -> Rig {
        let clock = Clock()
        let sut = ListeningCenter(
            viewerId: { viewer },
            snapshot: { snapshot },
            changedEvents: Empty().eraseToAnyPublisher(),
            clearedEvents: Empty().eraseToAnyPublisher(),
            connected: Empty().eraseToAnyPublisher(),
            now: { clock.now }
        )
        return Rig(sut: sut, clock: clock)
    }

    private let t0 = Date(timeIntervalSince1970: 1_800_000_000)

    private func served(
        _ userId: String = "alice",
        _ category: NowPlayingCategory = .music,
        title: String? = nil,
        source: String? = nil,
        at offset: TimeInterval = 0,
        lifetime: TimeInterval = 900
    ) -> NowPlayingChanged {
        NowPlayingChanged(
            userId: userId, category: category, title: title, source: source,
            updatedAt: t0.addingTimeInterval(offset), expiresAt: t0.addingTimeInterval(offset + lifetime)
        )
    }

    // MARK: - Lu hors du fil principal (#17042)

    /// `AvatarListeningLive` lit le bandeau par `.values` : l'itérateur Combine demande hors du fil principal, et le
    /// centre y remet sa valeur courante. Un maillon isolé au MainActor y piégeait l'app à l'ouverture d'un direct.
    func test_band_readOffTheMainActor_deliversTheServedBand() async {
        let rig = makeRig()
        rig.sut.receive(served(title: "Clair de lune", source: "Spotify"))
        let band = OffMainPublisher(publisher: rig.sut.band(for: "alice"))

        let first = await Task.detached { () -> AvatarListening? in
            for await value in band.publisher.values { return value }
            return nil
        }.value

        XCTAssertEqual(first?.text, "Clair de lune · Spotify")
    }

    // MARK: - Ce qui est servi, et rien de plus

    func test_aProche_showsTheCategoryAlone() {
        let rig = makeRig()

        rig.sut.receive(served())

        let band = ListeningBandText.band(for: rig.sut.byUser["alice"])
        XCTAssertNil(rig.sut.byUser["alice"]?.title)
        XCTAssertEqual(band?.text, ListeningBandText.categoryLabel(.music))
        XCTAssertEqual(band?.glyph, "🎵")
    }

    func test_aSang_showsTitleAndSource() {
        let rig = makeRig()

        rig.sut.receive(served(title: "Clair de lune", source: "Spotify"))

        XCTAssertEqual(ListeningBandText.band(for: rig.sut.byUser["alice"])?.text, "Clair de lune · Spotify")
    }

    func test_aRaise_bringsTheTitleUp_withoutReloading_andALowerTakesItBack() {
        let rig = makeRig()
        rig.sut.receive(served())

        rig.sut.receive(served(title: "Clair de lune", source: "Spotify", at: 1))
        XCTAssertEqual(rig.sut.byUser["alice"]?.title, "Clair de lune")

        rig.sut.receive(served(at: 2))
        XCTAssertNil(rig.sut.byUser["alice"]?.title)
        XCTAssertNil(rig.sut.byUser["alice"]?.source)
        XCTAssertEqual(ListeningBandText.band(for: rig.sut.byUser["alice"])?.text, ListeningBandText.categoryLabel(.music))
    }

    func test_anOlderState_neverOverwritesTheKeptOne() {
        let rig = makeRig()
        rig.sut.receive(served(title: "Nouveau", at: 10))

        rig.sut.receive(served(title: "Ancien", at: 5))

        XCTAssertEqual(rig.sut.byUser["alice"]?.title, "Nouveau")
    }

    func test_myOwnListening_fromAnotherDevice_isNotShown() {
        let rig = makeRig(viewer: "me")

        rig.sut.receive(served("me"))

        XCTAssertNil(rig.sut.byUser["me"])
    }

    // MARK: - Ce qui s'éteint

    func test_cleared_removesTheBand() {
        let rig = makeRig()
        rig.sut.receive(served())

        rig.sut.clear("alice")

        XCTAssertNil(ListeningBandText.band(for: rig.sut.byUser["alice"]))
    }

    func test_aClearedForSomeoneNotShown_changesNothingElse() {
        let rig = makeRig()
        rig.sut.receive(served("bob", title: "Nocturne"))

        rig.sut.clear("alice")

        XCTAssertEqual(rig.sut.byUser["bob"]?.title, "Nocturne")
        XCTAssertNil(rig.sut.byUser["alice"])
    }

    func test_withoutANewSend_theStateFadesAtItsDeadline_countedOnTheDeviceClock() {
        let rig = makeRig()
        rig.sut.receive(served(at: -3_600, lifetime: 120))

        rig.clock.now = t0.addingTimeInterval(119)
        rig.sut.expireDue()
        XCTAssertNotNil(rig.sut.byUser["alice"])

        rig.clock.now = t0.addingTimeInterval(120)
        rig.sut.expireDue()
        XCTAssertNil(rig.sut.byUser["alice"])
    }

    func test_anAbsurdExpiry_isBoundedByTheContractTTL() {
        let rig = makeRig()
        rig.sut.receive(served(lifetime: 86_400))

        XCTAssertEqual(rig.sut.byUser["alice"]?.deadline, t0.addingTimeInterval(NowPlayingContract.ttl))
    }

    // MARK: - Le rattrapage

    func test_theCatchUp_removesWhatEndedDuringTheOutage_andKeepsWhatArrivedDuringTheRequest() {
        let rig = makeRig()
        rig.sut.receive(served("bob"))
        let mark = rig.sut.mark()
        rig.sut.receive(served("carol", .video, at: 1))

        rig.sut.reconcile([served("dave", title: "Nocturne", source: "Deezer")], mark: mark)

        XCTAssertNil(rig.sut.byUser["bob"])
        XCTAssertNotNil(rig.sut.byUser["carol"])
        XCTAssertEqual(rig.sut.byUser["dave"]?.title, "Nocturne")
    }

    func test_catchUp_readsTheSnapshot_andSkipsMyOwnListening() async {
        let rig = makeRig(viewer: "me", snapshot: [served("alice", title: "Clair de lune"), served("me")])

        await rig.sut.catchUp()

        XCTAssertEqual(Set(rig.sut.byUser.keys), ["alice"])
    }

    func test_eachSocketConnection_triggersACatchUp() async {
        let connected = PassthroughSubject<Bool, Never>()
        let fetched = expectation(description: "rattrapage")
        let sut = ListeningCenter(
            viewerId: { "me" },
            snapshot: {
                fetched.fulfill()
                return []
            },
            changedEvents: Empty().eraseToAnyPublisher(),
            clearedEvents: Empty().eraseToAnyPublisher(),
            connected: connected.eraseToAnyPublisher()
        )

        connected.send(false)
        connected.send(true)

        await fulfillment(of: [fetched], timeout: 2)
        XCTAssertTrue(sut.byUser.isEmpty)
    }

    // MARK: - Le bandeau

    func test_theSpokenPhrase_carriesTheActivity() {
        let band = ListeningBandText.band(for: ListeningEntry(
            category: .video, title: "Le Mépris", source: nil, updatedAt: t0, deadline: t0
        ))

        XCTAssertEqual(band?.text, "Le Mépris")
        XCTAssertTrue(band?.spoken.contains("Le Mépris") ?? false)
        XCTAssertEqual(band?.glyph, "🎬")
    }

    func test_theBand_isNotLaidOnASmallAvatar() {
        XCTAssertFalse(AvatarListeningBand.isShown(avatarSize: 32))
        XCTAssertTrue(AvatarListeningBand.isShown(avatarSize: AvatarContext.conversationHeaderExpanded.size))
        XCTAssertTrue(AvatarListeningBand.isShown(avatarSize: AvatarContext.profileSheet.size))
    }

    /// Le SDK parcourt `band(for:).values` depuis une tâche hors du MainActor : la demande remonte le flux et y exécute
    /// ses `map`. Isolées au MainActor, elles arrêtaient l'app à l'ouverture d'un direct (EXC_BREAKPOINT,
    /// `dispatch_assert_queue`, 2026-11-08, #17069).
    func test_theBandStream_isReadableOffTheMainActor() async {
        let rig = makeRig()
        rig.sut.receive(served())
        let first = await Self.firstValueOffMainActor(rig.sut.band(for: "alice"))

        XCTAssertEqual(first??.text, ListeningBandText.categoryLabel(.music))
    }

    @concurrent
    nonisolated private static func firstValueOffMainActor(
        _ stream: sending AnyPublisher<AvatarListening?, Never>
    ) async -> AvatarListening?? {
        for await value in stream.values { return value }
        return nil
    }
}

/// La ligne de liste ne montre l'écoute que du pair d'un direct (#16733) : un groupe n'a pas UN pair, un direct sans
/// pair connu n'a personne à écouter. Ce qui s'affiche reste ce que le serveur a servi (le centre d'écoute juge).
final class ConversationRowListeningTests: XCTestCase {

    private func conversation(type: MeeshyConversation.ConversationType, peer: String?) -> MeeshyConversation {
        MeeshyConversation(id: "c1", identifier: "c1", type: type, participantUserId: peer)
    }

    func test_listenedUserId_direct_isThePeer() {
        XCTAssertEqual(ConversationRowListening.userId(for: conversation(type: .direct, peer: "alice")), "alice")
    }

    func test_listenedUserId_group_isNil() {
        XCTAssertNil(ConversationRowListening.userId(for: conversation(type: .group, peer: "alice")))
    }

    func test_listenedUserId_directWithoutPeer_isNil() {
        XCTAssertNil(ConversationRowListening.userId(for: conversation(type: .direct, peer: nil)))
        XCTAssertNil(ConversationRowListening.userId(for: conversation(type: .direct, peer: "")))
    }
}

/// Les DEUX formes de liste montrent l'écoute (#16733) : la Lentille est la forme par défaut (`LentilleFeatureFlag`
/// allumé sans clé), le rang historique reste choisissable dans les Réglages. Le bandeau se pose dans l'avatar PARTAGÉ
/// des deux rangs, et chaque rang dit l'écoute à VoiceOver par sa valeur — sans quoi la liste par défaut se taisait.
@MainActor
final class ConversationRowListeningWiringTests: XCTestCase {

    private func code(_ repoRelativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let source = try String(contentsOf: root.appendingPathComponent(repoRelativePath), encoding: .utf8)
        return AppSourceGuard.stripComments(source)
    }

    func test_sharedRowAvatar_paintsListening_atItsOwnSize() throws {
        let avatar = try code("apps/ios/Meeshy/Features/Main/Views/ConversationRowAvatar.swift")
        XCTAssertTrue(avatar.contains("AvatarListeningOverlay(userId: listenedUserId, avatarSize: style.context.size)"),
                      "l'avatar partagé des deux rangs pose le bandeau, à la taille de SON contexte (52 ou 44)")
    }

    func test_bothRows_speakListening_inTheirValue() throws {
        for path in [
            "apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift",
            "apps/ios/Meeshy/Features/Lens/Row/LentilleConversationRow.swift",
        ] {
            XCTAssertTrue(try code(path).contains(".modifier(ConversationRowListeningSpeech("),
                          "\(path) : la ligne dit l'écoute du pair dans sa valeur VoiceOver")
        }
    }

    func test_noRow_paintsASecondBand() throws {
        for path in [
            "apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift",
            "apps/ios/Meeshy/Features/Lens/Row/LentilleConversationRow.swift",
        ] {
            XCTAssertFalse(try code(path).contains("AvatarListeningOverlay("),
                           "\(path) : un seul site peint le bandeau d'une ligne, l'avatar partagé")
        }
    }

    func test_bothListForms_carryTheBand_notTheGlyph() {
        XCTAssertEqual(AvatarListeningBand.form(avatarSize: ConversationRowAvatar.Style.classic.context.size), .band)
        XCTAssertEqual(AvatarListeningBand.form(avatarSize: ConversationRowAvatar.Style.lentille.context.size), .band)
    }
}

/// Le publisher du centre n'est pas `Sendable` ; le témoin le remet à une tâche détachée pour le lire hors du fil principal.
private struct OffMainPublisher: @unchecked Sendable {
    let publisher: AnyPublisher<AvatarListening?, Never>
}
