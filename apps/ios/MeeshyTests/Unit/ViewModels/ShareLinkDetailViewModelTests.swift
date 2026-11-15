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
