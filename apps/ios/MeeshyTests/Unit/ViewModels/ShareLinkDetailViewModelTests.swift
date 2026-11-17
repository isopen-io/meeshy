import XCTest
@testable import Meeshy
import MeeshySDK

/// La fiche détails + édition d'un lien (#7797) : cache-first, statistiques
/// dégradées sans plantage, enregistrement optimiste avec retour arrière.
@MainActor
final class ShareLinkDetailViewModelTests: XCTestCase {

    private enum ProbeError: Error { case offline }

    private final class ChangeRecorder {
        var changes: [MyShareLink] = []
        var deletedIds: [String] = []
    }

    private func makeLink(
        name: String? = "Nova — Discord",
        isActive: Bool = true,
        maxUses: Int? = 100,
        currentUses: Int = 12
    ) -> MyShareLink {
        MyShareLink(
            id: "row-1", linkId: "mshy_Kq7Rb2Xn", identifier: "nova", name: name,
            isActive: isActive, currentUses: currentUses, maxUses: maxUses,
            expiresAt: nil, createdAt: Date(timeIntervalSince1970: 1_756_800_000),
            conversationTitle: "Nova Club",
            description: "Viens !", maxConcurrentUsers: 50,
            allowAnonymousMessages: true, allowAnonymousFiles: false,
            allowAnonymousImages: true, allowViewHistory: true,
            requireAccount: false, requireNickname: true, requireEmail: false, requireBirthday: false,
            allowedLanguages: []
        )
    }

    private func makeSUT(link: MyShareLink? = nil) -> (ShareLinkDetailViewModel, MockShareLinkManager, ChangeRecorder) {
        let service = MockShareLinkManager()
        let recorder = ChangeRecorder()
        let sut = ShareLinkDetailViewModel(
            link: link ?? makeLink(),
            service: service,
            removeParticipant: { _, _ in },
            onLinkChanged: { recorder.changes.append($0) },
            onLinkDeleted: { recorder.deletedIds.append($0) }
        )
        return (sut, service, recorder)
    }

    // MARK: - Cache-first

    func test_init_showsTheCachedLinkImmediately_withADraftOfItsSettings() {
        let (sut, service, _) = makeSUT()

        XCTAssertEqual(sut.link.linkId, "mshy_Kq7Rb2Xn")
        XCTAssertEqual(sut.draft, sut.link.settings)
        XCTAssertFalse(sut.hasChanges)
        XCTAssertEqual(sut.stats, .loading)
        XCTAssertEqual(service.fetchLinkStatsCallCount, 0, "nothing blocks the first frame")
    }

    // MARK: - Stats

    func test_loadStats_success_exposesTheArrivals() async {
        let (sut, service, _) = makeSUT()
        let stats = ShareLinkArrivalStats(visits: 1284, arrivals: 412, anonymousArrivals: 157)
        service.fetchLinkStatsResult = .success(stats)

        await sut.loadStats()

        XCTAssertEqual(sut.stats, .loaded(stats))
    }

    func test_loadStats_endpointNotShippedYet_degradesToUnavailable() async {
        let (sut, service, _) = makeSUT()
        service.fetchLinkStatsResult = .failure(MeeshyError.server(statusCode: 404, message: "Not Found"))

        await sut.loadStats()

        XCTAssertEqual(sut.stats, .unavailable)
    }

    // MARK: - Save (optimistic + rollback)

    func test_save_success_appliesTheDraftAndSendsTheWholeSettings() async {
        let (sut, service, recorder) = makeSUT()
        sut.draft.maxUses = nil
        sut.draft.guestRights.files = true
        sut.draft.allowedLanguages = ["fr", "ko"]

        let saved = await sut.save()

        XCTAssertTrue(saved)
        XCTAssertNil(sut.link.maxUses)
        XCTAssertEqual(sut.link.settings.guestRights.files, true)
        XCTAssertEqual(service.lastUpdatedSettings?.allowedLanguages, ["fr", "ko"])
        XCTAssertFalse(sut.hasChanges)
        XCTAssertEqual(recorder.changes.count, 1, "the list sees the new value once")
    }

    func test_save_failure_rollsTheLinkBack_butKeepsTheDraftForARetry() async {
        let original = makeLink(maxUses: 100)
        let (sut, service, recorder) = makeSUT(link: original)
        service.updateLinkResult = .failure(ProbeError.offline)
        sut.draft.maxUses = 5

        let saved = await sut.save()

        XCTAssertFalse(saved)
        XCTAssertEqual(recorder.changes.map(\.maxUses), [5, 100], "optimistic first, then the snapshot")
        XCTAssertEqual(sut.link, original)
        XCTAssertEqual(sut.draft.maxUses, 5)
        XCTAssertTrue(sut.hasChanges)
        XCTAssertFalse(sut.isSaving)
    }

    func test_save_withoutChanges_doesNotHitTheNetwork() async {
        let (sut, service, _) = makeSUT()

        let saved = await sut.save()

        XCTAssertFalse(saved)
        XCTAssertEqual(service.updateLinkCallCount, 0)
    }

    func test_save_invalidLimit_isRefusedLocally() async {
        let (sut, service, _) = makeSUT()
        sut.draft.maxConcurrentUsers = 0

        XCTAssertFalse(sut.canSave)
        let saved = await sut.save()

        XCTAssertFalse(saved)
        XCTAssertEqual(service.updateLinkCallCount, 0)
    }

    func test_discardChanges_restoresTheServedSettings() {
        let (sut, _, _) = makeSUT()
        sut.draft.name = "autre"

        sut.discardChanges()

        XCTAssertFalse(sut.hasChanges)
    }

    // MARK: - Activation

    func test_toggleActive_success_flipsImmediately() async {
        let (sut, service, _) = makeSUT(link: makeLink(isActive: true))

        let done = await sut.toggleActive()

        XCTAssertTrue(done)
        XCTAssertFalse(sut.link.isActive)
        XCTAssertEqual(service.lastToggledActive, false)
    }

    func test_toggleActive_failure_rollsBack() async {
        let (sut, service, recorder) = makeSUT(link: makeLink(isActive: true))
        service.toggleLinkResult = .failure(ProbeError.offline)

        let done = await sut.toggleActive()

        XCTAssertFalse(done)
        XCTAssertTrue(sut.link.isActive)
        XCTAssertEqual(recorder.changes.map(\.isActive), [false, true])
    }

    // MARK: - Deletion

    func test_delete_success_marksDeletedAndTellsTheList() async {
        let (sut, _, recorder) = makeSUT()

        let done = await sut.delete()

        XCTAssertTrue(done)
        XCTAssertTrue(sut.isDeleted)
        XCTAssertEqual(recorder.deletedIds, ["row-1"])
    }

    func test_delete_failure_keepsTheLink() async {
        let (sut, service, recorder) = makeSUT()
        service.deleteLinkResult = .failure(ProbeError.offline)

        let done = await sut.delete()

        XCTAssertFalse(done)
        XCTAssertFalse(sut.isDeleted)
        XCTAssertEqual(recorder.deletedIds, [])
    }
}

/// La fiche d'un lien de partage faite du kit (planche `Lien-Partage`, #18871) : la jauge des entrées,
/// l'échéance, « Qui peut entrer », les arrivées par pays, et le retrait optimiste d'un arrivant.
@MainActor
final class ShareLinkEntrySummaryTests: XCTestCase {

    private enum ProbeError: Error { case refused }

    private actor RemovalRecorder {
        private(set) var calls: [String] = []
        func record(_ conversationId: String, _ key: String) { calls.append("\(conversationId)/\(key)") }
    }

    private func settings(requireAccount: Bool = false, nickname: Bool = false, email: Bool = false,
                          history: Bool = true, files: Bool = false, concurrent: Int? = nil,
                          languages: [String] = []) -> ShareLinkSettings {
        ShareLinkSettings(name: "Studio", description: "", expiresAt: nil, maxUses: 50, maxConcurrentUsers: concurrent,
                          requireAccount: requireAccount, requireNickname: nickname, requireEmail: email,
                          requireBirthday: false, allowedLanguages: languages,
                          guestRights: ShareLinkGuestRights(messages: true, images: true, files: files, history: history))
    }

    private func arrival(_ id: String, anonymous: Bool) -> ShareLinkArrivalStats.Arrival {
        ShareLinkArrivalStats.Arrival(participantId: id, displayName: id, isAnonymous: anonymous,
                                      joinedAt: Date(timeIntervalSince1970: 1_763_000_000))
    }

    private func linkWithConversation(_ conversationId: String?) -> MyShareLink {
        MyShareLink(id: "row-1", linkId: "mshy_studio", identifier: nil, name: "Studio — invités",
                    isActive: true, currentUses: 23, maxUses: 50, expiresAt: nil,
                    createdAt: Date(timeIntervalSince1970: 1_762_000_000), conversationTitle: "Studio",
                    conversation: conversationId.map { ShareLinkConversationSummary(id: $0, title: "Studio") })
    }

    // MARK: - La jauge

    func test_quota_23of50_reads46PercentAnd27PlacesLeft() {
        let quota = ShareLinkEntryQuota(used: 23, limit: 50)

        XCTAssertEqual(quota.percent, 46)
        XCTAssertEqual(quota.remaining, 27)
        XCTAssertFalse(quota.isFull)
    }

    func test_quota_overTheLimit_isFullAndNeverOverflows() {
        let quota = ShareLinkEntryQuota(used: 60, limit: 50)

        XCTAssertEqual(quota.fraction, 1)
        XCTAssertEqual(quota.remaining, 0)
        XCTAssertTrue(quota.isFull)
    }

    func test_quota_withoutLimit_hasNoShareNorRemainder() {
        let quota = ShareLinkEntryQuota(used: 12, limit: nil)

        XCTAssertNil(quota.fraction)
        XCTAssertNil(quota.remaining)
        XCTAssertFalse(quota.isFull)
    }

    // MARK: - L'échéance

    func test_expiry_sixDaysAhead_isSoon() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        let now = Date(timeIntervalSince1970: 1_763_380_800)
        let expiry = ShareLinkExpiry.resolve(expiresAt: now.addingTimeInterval(6 * 86_400), now: now, calendar: calendar)

        XCTAssertEqual(expiry, .inDays(6))
        XCTAssertTrue(expiry.isSoon)
    }

    func test_expiry_inThePast_isExpired_andWithoutDate_isNever() {
        let now = Date(timeIntervalSince1970: 1_763_380_800)

        XCTAssertEqual(ShareLinkExpiry.resolve(expiresAt: now.addingTimeInterval(-60), now: now, calendar: .current), .expired)
        XCTAssertEqual(ShareLinkExpiry.resolve(expiresAt: nil, now: now, calendar: .current), .never)
    }

    // MARK: - Qui peut entrer

    func test_rules_openLink_saysGuestsTheirRightsAndAllLanguages() {
        let rules = ShareLinkEntryRule.rules(for: settings(nickname: true))

        XCTAssertEqual(rules, [.guestsWithoutAccount, .askedFields, .historyVisible, .guestMessages, .guestImages,
                               .allLanguages])
    }

    func test_rules_accountRequired_neverListsGuestRights() {
        let rules = ShareLinkEntryRule.rules(for: settings(requireAccount: true, history: false, files: true,
                                                           concurrent: 20, languages: ["fr", "pt"]))

        XCTAssertEqual(rules, [.accountRequired, .concurrentLimit(20), .languages(["fr", "pt"])])
    }

    // MARK: - Arrivées par pays

    func test_countryShares_keepTheFourLargest_theFirstBarFull() {
        let counts = [("FR", 6), ("SN", 11), ("PT", 3), ("CI", 3), ("BE", 1), ("DE", 0)]
            .map { ShareLinkArrivalStats.CountryCount(country: $0.0, count: $0.1) }

        let shares = ShareLinkCountryShare.top(counts)

        XCTAssertEqual(shares.map(\.country), ["SN", "FR", "CI", "PT"])
        XCTAssertEqual(shares.first?.share, 1)
        XCTAssertEqual(ShareLinkCountryShare.countryCount(counts), 5)
    }

    // MARK: - Retirer un arrivant

    func test_removeArrival_leavesAtOnce_andCountsDrop() async {
        let recorder = RemovalRecorder()
        let service = MockShareLinkManager()
        let sut = ShareLinkDetailViewModel(link: linkWithConversation("conv-1"), service: service,
                                           removeParticipant: { conversationId, key in
                                               await recorder.record(conversationId, key)
                                           })
        service.fetchLinkStatsResult = .success(ShareLinkArrivalStats(
            visits: 40, arrivals: 2, anonymousArrivals: 1,
            recentArrivals: [arrival("kora", anonymous: true), arrival("mina", anonymous: false)]))
        await sut.loadStats()

        let removed = await sut.removeArrival(participantId: "kora")

        XCTAssertTrue(removed)
        guard case .loaded(let stats) = sut.stats else { return XCTFail("stats chargées") }
        XCTAssertEqual(stats.recentArrivals.map(\.participantId), ["mina"])
        XCTAssertEqual(stats.arrivals, 1)
        XCTAssertEqual(stats.anonymousArrivals, 0)
        let calls = await recorder.calls
        XCTAssertEqual(calls, ["conv-1/kora"])
    }

    func test_removeArrival_refused_bringsTheRowBack() async {
        let service = MockShareLinkManager()
        let sut = ShareLinkDetailViewModel(link: linkWithConversation("conv-1"), service: service,
                                           removeParticipant: { _, _ in throw ProbeError.refused })
        let served = ShareLinkArrivalStats(visits: 40, arrivals: 1, anonymousArrivals: 1,
                                           recentArrivals: [arrival("kora", anonymous: true)])
        service.fetchLinkStatsResult = .success(served)
        await sut.loadStats()

        let removed = await sut.removeArrival(participantId: "kora")

        XCTAssertFalse(removed)
        XCTAssertEqual(sut.stats, .loaded(served))
    }

    func test_removeArrival_withoutConversation_isNotOffered() async {
        let sut = ShareLinkDetailViewModel(link: linkWithConversation(nil), service: MockShareLinkManager(),
                                           removeParticipant: { _, _ in })

        XCTAssertFalse(sut.canRemoveArrivals)
        let removed = await sut.removeArrival(participantId: "kora")
        XCTAssertFalse(removed)
    }
}

/// #9195 — un lien créé depuis « Mes liens › Liens de partage › + » n'apparaissait
/// pas : la feuille rappelait `load()`, qui servait le cache `.fresh` (une liste
/// VIDE relevée moins de cinq minutes plus tôt) SANS interroger le réseau ; et un
/// échec réseau écrasait la liste et le cache par `[]`.
final class ShareLinksReloadLawTests: XCTestCase {

    private func makeLink(id: String) -> MyShareLink {
        MyShareLink(
            id: id, linkId: "mshy_\(id)", identifier: id, name: nil,
            isActive: true, currentUses: 0, maxUses: nil, expiresAt: nil,
            createdAt: Date(timeIntervalSince1970: 1_759_430_000),
            conversationTitle: "Soirée internationale"
        )
    }

    func test_mustFetch_afterALinkWasCreated_evenOnAFreshCache() {
        XCTAssertTrue(ShareLinksReloadLaw.mustFetch(.linkCreated, cacheIsFresh: true))
    }

    func test_mustFetch_onPullToRefresh_evenOnAFreshCache() {
        XCTAssertTrue(ShareLinksReloadLaw.mustFetch(.pullToRefresh, cacheIsFresh: true))
    }

    func test_mustFetch_onAppear_onlyWhenTheCacheIsNotFresh() {
        XCTAssertFalse(ShareLinksReloadLaw.mustFetch(.appear, cacheIsFresh: true))
        XCTAssertTrue(ShareLinksReloadLaw.mustFetch(.appear, cacheIsFresh: false))
    }

    func test_linksAfterFetch_servesWhatTheServerReturned() {
        let created = makeLink(id: "invites-de-samedi")
        XCTAssertEqual(ShareLinksReloadLaw.linksAfterFetch(current: [], fetched: [created]), [created])
    }

    func test_linksAfterFetch_aFailedFetchKeepsTheListShown() {
        let shown = [makeLink(id: "a"), makeLink(id: "b")]
        XCTAssertEqual(ShareLinksReloadLaw.linksAfterFetch(current: shown, fetched: nil), shown)
    }
}

/// La fiche d'un lien de communauté (planche `Lien-Communaute`, #18871) : les entrées se lisent sur la date
/// d'arrivée des membres, la fiche s'ouvre sur le lien déjà connu, et « Fermer les entrées » est optimiste.
@MainActor
final class CommunityLinkDetailTests: XCTestCase {

    private enum ProbeError: Error { case offline }

    private static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        return calendar
    }()

    private static let now = Date(timeIntervalSince1970: 1_763_380_800)

    private func entry(_ id: String, daysAgo days: Double, userId: String? = nil) -> CommunityLinkEntry {
        CommunityLinkEntry(id: id, userId: userId ?? "user-\(id)", name: "Membre \(id)", username: id, avatar: nil,
                           joinedAt: Self.now.addingTimeInterval(-days * 86_400))
    }

    private func makeLink(memberCount: Int = 342) -> CommunityLink {
        CommunityLink(id: "c-1", name: "Beatmakers Dakar", identifier: "beatmakers", baseUrl: "https://meeshy.me",
                      memberCount: memberCount, isActive: true, createdAt: Date(timeIntervalSince1970: 1_750_000_000))
    }

    private final class Calls {
        var closed: [Bool] = []
    }

    private func makeSUT(
        details: Result<CommunityLinkDetails, Error> = .success(CommunityLinkDetails(isPrivate: false, role: "admin",
                                                                                     memberCount: 350, avatar: nil,
                                                                                     settingsCommunity: nil)),
        entries: Result<[CommunityLinkEntry], Error> = .success([]),
        setPrivate: Result<Void, Error> = .success(())
    ) -> (CommunityLinkDetailViewModel, Calls) {
        let calls = Calls()
        let sut = CommunityLinkDetailViewModel(
            link: makeLink(),
            viewerId: "me",
            loadDetails: { _ in try details.get() },
            loadEntries: { _ in try entries.get() },
            setPrivate: { _, closed in
                await MainActor.run { calls.closed.append(closed) }
                try setPrivate.get()
            }
        )
        return (sut, calls)
    }

    // MARK: - Les entrées

    func test_entries_areRecentFirst_andLeaveTheViewerOut() {
        let entries = CommunityLinkEntries(entries: [entry("a", daysAgo: 3), entry("b", daysAgo: 1),
                                                     entry("me", daysAgo: 0, userId: "me")],
                                           excludingUserId: "me")
        XCTAssertEqual(entries.recent.map(\.id), ["b", "a"])
    }

    func test_recent_keepsOnlyTheFiveLatest() {
        let entries = CommunityLinkEntries(entries: (0..<8).map { entry("m\($0)", daysAgo: Double($0)) },
                                           excludingUserId: nil)
        XCTAssertEqual(entries.recent.map(\.id), ["m0", "m1", "m2", "m3", "m4"])
    }

    func test_weekCount_countsTheArrivalsOfTheLastSevenDays() {
        let entries = CommunityLinkEntries(entries: [entry("a", daysAgo: 0.2), entry("b", daysAgo: 6),
                                                     entry("c", daysAgo: 7.5), entry("d", daysAgo: 40)],
                                           excludingUserId: nil)
        XCTAssertEqual(entries.count(lastDays: 7, now: Self.now, calendar: Self.calendar), 2)
        XCTAssertEqual(entries.count(lastDays: 30, now: Self.now, calendar: Self.calendar), 3)
    }

    func test_days_drawThirtyDays_withTheArrivalsOfEachDay() {
        let entries = CommunityLinkEntries(entries: [entry("a", daysAgo: 0), entry("b", daysAgo: 0),
                                                     entry("c", daysAgo: 2)],
                                           excludingUserId: nil)
        let days = entries.days(now: Self.now, calendar: Self.calendar)
        XCTAssertEqual(days.count, 30)
        XCTAssertEqual(days.last?.count, 2)
        XCTAssertEqual(days[days.count - 3].count, 1)
    }

    func test_dailyAverage_isTheThirtyDayCountOverThirty() {
        let entries = CommunityLinkEntries(entries: (0..<60).map { entry("m\($0)", daysAgo: Double($0) / 2) },
                                           excludingUserId: nil)
        XCTAssertEqual(entries.dailyAverage(now: Self.now, calendar: Self.calendar), 2, accuracy: 0.01)
    }

    func test_latestPageOffset_readsTheLastPage_becauseTheServerSortsTheOldestFirst() {
        XCTAssertNil(CommunityLinkEntries.latestPageOffset(total: 40, pageSize: 100))
        XCTAssertNil(CommunityLinkEntries.latestPageOffset(total: nil, pageSize: 100))
        XCTAssertEqual(CommunityLinkEntries.latestPageOffset(total: 342, pageSize: 100), 242)
    }

    // MARK: - Les règles et le rôle

    func test_rules_sayWhetherTheEntryIsFreeOrByInvitation() {
        XCTAssertEqual(CommunityEntryRule.rules(isPrivate: false), [.open, .roleMember, .everyCountry, .noExpiry])
        XCTAssertEqual(CommunityEntryRule.rules(isPrivate: true).first, .invitationOnly)
    }

    func test_stewardship_followsTheViewerRole() {
        XCTAssertEqual(CommunityLinkStewardship(role: "admin"), .animates)
        XCTAssertEqual(CommunityLinkStewardship(role: "creator"), .animates)
        XCTAssertEqual(CommunityLinkStewardship(role: "moderator"), .moderates)
        XCTAssertEqual(CommunityLinkStewardship(role: nil), .member)
    }

    // MARK: - La fiche

    func test_init_showsTheKnownLinkAtOnce_andWaitsForTheEntries() {
        let (sut, _) = makeSUT()
        XCTAssertEqual(sut.link.name, "Beatmakers Dakar")
        XCTAssertEqual(sut.memberCount, 342)
        XCTAssertEqual(sut.entries, .loading)
        XCTAssertNil(sut.isClosed)
    }

    func test_load_servesTheDetails_andTheEntries() async {
        let (sut, _) = makeSUT(entries: .success([entry("a", daysAgo: 1)]))
        await sut.load()
        XCTAssertEqual(sut.memberCount, 350)
        XCTAssertEqual(sut.isClosed, false)
        XCTAssertEqual(sut.stewardship, .animates)
        XCTAssertEqual(sut.entries, .loaded(CommunityLinkEntries(entries: [entry("a", daysAgo: 1)], excludingUserId: "me")))
    }

    func test_load_aFailedEntriesFetch_saysSo_withoutLosingTheDetails() async {
        let (sut, _) = makeSUT(entries: .failure(ProbeError.offline))
        await sut.load()
        XCTAssertEqual(sut.entries, .failed)
        XCTAssertEqual(sut.isClosed, false)
    }

    func test_closeEntries_isOptimistic_andTellsTheServer() async {
        let (sut, calls) = makeSUT()
        await sut.load()
        let succeeded = await sut.setEntriesClosed(true)
        XCTAssertTrue(succeeded)
        XCTAssertEqual(sut.isClosed, true)
        XCTAssertEqual(calls.closed, [true])
    }

    func test_closeEntries_comesBack_whenTheServerRefuses() async {
        let (sut, _) = makeSUT(setPrivate: .failure(ProbeError.offline))
        await sut.load()
        let succeeded = await sut.setEntriesClosed(true)
        XCTAssertFalse(succeeded)
        XCTAssertEqual(sut.isClosed, false)
    }

    func test_closeEntries_beforeTheDetailsAreKnown_doesNothing() async {
        let (sut, calls) = makeSUT()
        let succeeded = await sut.setEntriesClosed(true)
        XCTAssertFalse(succeeded)
        XCTAssertTrue(calls.closed.isEmpty)
    }
}
