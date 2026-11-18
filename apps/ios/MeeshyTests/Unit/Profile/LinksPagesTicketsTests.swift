import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// Les pages « tous mes liens » de partage, de suivi et de communauté (#19601) : ce qu'elles montrent sous leur
/// en-tête selon ce qu'elles savent, l'interrupteur d'un lien en pause posé depuis son billet, et la loi 12 de la
/// planche — chaque rangée est le billet du kit, jamais une rangée redessinée sur place.
@MainActor
final class LinksPagesTicketsTests: XCTestCase {

    private func shareLink(_ id: String, active: Bool = true, uses: Int = 23, cap: Int? = 50,
                           expiresAt: Date? = nil) -> MyShareLink {
        MyShareLink(id: id, linkId: "mshy_\(id)", identifier: nil, name: "Studio \(id)", isActive: active,
                    currentUses: uses, maxUses: cap, expiresAt: expiresAt, createdAt: Date(timeIntervalSince1970: 0),
                    conversationTitle: nil)
    }

    private func trackingLink(_ id: String, active: Bool) throws -> TrackingLink {
        let json = """
        {"id":"\(id)","token":"tok-\(id)","name":"Réel","originalUrl":"https://a.io","shortUrl":"https://meeshy.me/l/tok-\(id)",
         "totalClicks":412,"uniqueClicks":3,"isActive":\(active),"createdAt":0}
        """
        return try JSONDecoder().decode(TrackingLink.self, from: Data(json.utf8))
    }

    // MARK: - Ce que la page montre sous son en-tête

    func test_phase_coldCacheWhileLoading_showsGhostTickets() {
        XCTAssertEqual(LinksPageLaw.phase(isLoading: true, didFail: false, hasLinks: false), .skeleton)
    }

    func test_phase_anyCachedLink_isTheList_evenWhileLoadingOrAfterAFailure() {
        XCTAssertEqual(LinksPageLaw.phase(isLoading: true, didFail: false, hasLinks: true), .list,
                       "jamais de squelette sur un cache non vide")
        XCTAssertEqual(LinksPageLaw.phase(isLoading: false, didFail: true, hasLinks: true), .list,
                       "un échec réseau ne cache pas ce que le cache montrait")
    }

    func test_phase_nothingToShowAfterAFailure_isTheErrorWithRetry() {
        XCTAssertEqual(LinksPageLaw.phase(isLoading: false, didFail: true, hasLinks: false), .failed)
    }

    func test_phase_nothingReadAndNothingFailed_isTheEmptyStateWithCreate() {
        XCTAssertEqual(LinksPageLaw.phase(isLoading: false, didFail: false, hasLinks: false), .empty)
    }

    func test_kept_aFailedFetchKeepsTheListShown_aSuccessfulOneReplacesIt() {
        XCTAssertEqual(LinksPageLaw.kept(current: [1, 2], fetched: nil), [1, 2])
        XCTAssertEqual(LinksPageLaw.kept(current: [1, 2], fetched: []), [], "le serveur a dit : plus aucun lien")
    }

    func test_split_servingTicketsFirst_thenThoseAtAStop_inTheirOrder() {
        let tickets = [
            LinksFaceSummary.ticket(share: shareLink("a", active: false)),
            LinksFaceSummary.ticket(share: shareLink("b")),
            LinksFaceSummary.ticket(share: shareLink("c", uses: 50, cap: 50)),
            LinksFaceSummary.ticket(share: shareLink("d", cap: nil)),
        ]

        let split = LinksPageLaw.split(tickets)

        XCTAssertEqual(split.serving.map(\.id), ["share:b", "share:d"])
        XCTAssertEqual(split.stopped.map(\.id), ["share:a", "share:c"], "en pause, puis complet : l'ordre de la page")
    }

    // MARK: - L'interrupteur d'un lien en pause, posé depuis son billet

    func test_shareLinks_switchingAPausedLinkOn_appliesAtOnce_andSendsItsLinkId() async {
        let log = PageSwitchLog()
        let model = ShareLinksViewModel(switches: ProfileLinksSwitches(
            share: { id, isActive in await log.note("\(id):\(isActive)") }, tracking: { _, _ in }))
        model.links = [shareLink("a", active: false)]

        let accepted = await model.setActive(true, linkId: "a")

        XCTAssertTrue(accepted)
        XCTAssertEqual(model.links.first?.isActive, true)
        let sent = await log.sent
        XCTAssertEqual(sent, ["mshy_a:true"])
    }

    func test_shareLinks_aRefusedSwitchIsUndone() async {
        let model = ShareLinksViewModel(switches: ProfileLinksSwitches(
            share: { _, _ in throw URLError(.notConnectedToInternet) }, tracking: { _, _ in }))
        model.links = [shareLink("a", active: false)]

        let accepted = await model.setActive(true, linkId: "a")

        XCTAssertFalse(accepted)
        XCTAssertEqual(model.links.first?.isActive, false, "le serveur a refusé : le lien reste en pause")
    }

    func test_trackingLinks_switchingAPausedLinkOn_sendsItsToken_andARefusalIsUndone() async throws {
        let log = PageSwitchLog()
        let accepting = TrackingLinksViewModel(switches: ProfileLinksSwitches(
            share: { _, _ in }, tracking: { token, isActive in await log.note("\(token):\(isActive)") }))
        let paused = try trackingLink("t1", active: false)
        accepting.links = [paused]

        let accepted = await accepting.setActive(true, linkId: "t1")

        XCTAssertTrue(accepted)
        XCTAssertEqual(accepting.links.first?.isActive, true)
        let sent = await log.sent
        XCTAssertEqual(sent, ["tok-t1:true"])

        let refusing = TrackingLinksViewModel(switches: ProfileLinksSwitches(
            share: { _, _ in }, tracking: { _, _ in throw URLError(.timedOut) }))
        refusing.links = [paused]
        let refused = await refusing.setActive(true, linkId: "t1")
        XCTAssertFalse(refused)
        XCTAssertEqual(refusing.links.first?.isActive, false)
    }

    // MARK: - Loi 12 : chaque page est faite du kit

    private static let pages = [
        "Meeshy/Features/Links/Views/ShareLinksView.swift",
        "Meeshy/Features/Links/Views/TrackingLinksView.swift",
        "Meeshy/Features/Links/Views/CommunityLinksView.swift",
    ]

    func test_everyPage_mountsTheKitSection_andRedrawsNoRowInPlace() throws {
        for page in Self.pages {
            let source = AppSourceGuard.stripComments(try AppSourceGuard.unit(page))
            XCTAssertTrue(source.contains("LinksPageSection("), "\(page) : l'en-tête et les états ne sont pas ceux du kit")
            XCTAssertTrue(source.contains("LinksPageTicketList("), "\(page) : les rangées ne sont pas des billets")
            for redrawn in ["RoundedRectangle(", "Circle()", ".kerning(", "EmptyStateView(", "SkeletonLinkList(",
                            "ProgressView(", "NavigationLink("] {
                XCTAssertFalse(source.contains(redrawn), "\(page) redessine sur place : \(redrawn)")
            }
        }
    }

    func test_theSharedSection_isMadeOfTheKit() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Links/Views/LinksPageTickets.swift"))
        for piece in ["MeeshySectionHeader(", "MeeshySkeletonColumn(", "MeeshySkeletonLaw.shows(", "MeeshyStateBlock(kind: .error",
                      "MeeshyStateBlock(kind: .empty", "ProfileLinksCopy.retry", "ProfileCreatedLinkTicket(",
                      "ProfileLinksCopy.stoppedTitle", ".ticket(cut:"] {
            XCTAssertTrue(source.contains(piece), "la section des pages de liens ne monte pas \(piece)")
        }
    }

    func test_everyPage_keepsItsActions_openCreateCopyAndDelete() throws {
        let share = AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.pages[0]))
        XCTAssertTrue(share.contains(".share(link, onChanged:"), "le détail d'un lien de partage s'ouvre, et y supprimer se reflète")
        XCTAssertTrue(share.contains("onDeleted: { viewModel.remove($0) }"))
        XCTAssertTrue(share.contains("showCreate = true"))
        let tracking = AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.pages[1]))
        XCTAssertTrue(tracking.contains(".tracking(link)"))
        XCTAssertTrue(tracking.contains("showCreate = true"))
        let community = AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.pages[2]))
        XCTAssertTrue(community.contains(".community(link)"))
        XCTAssertTrue(community.contains("router.push(.communityCreate)"))
        XCTAssertTrue(community.contains("MeeshyFigureBand("), "les chiffres de mes communautés sont la bande du kit (K34)")
    }
}

/// Les interrupteurs posés depuis les billets des pages, dans leur ordre.
private actor PageSwitchLog {
    private(set) var sent: [String] = []

    func note(_ entry: String) { sent.append(entry) }
}
