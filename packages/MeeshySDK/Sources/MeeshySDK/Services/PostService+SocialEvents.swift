import Foundation

extension PostService {
    // MARK: - Listing Context

    /// #10501 — une page de listing vient d'être servie : le registre retient
    /// son identifiant et la source de classement de chaque élément, que
    /// l'impression d'une carte recopiera. La page est rendue telle quelle.
    func listed(_ page: PaginatedAPIResponse<[APIPost]>, on surface: ReachSurface) -> PaginatedAPIResponse<[APIPost]> {
        listings.note(
            surface: surface,
            feedRequestId: page.meta?.feedRequestId,
            items: page.data.map { ListedItem(id: $0.id, rankingSource: $0.rankingSource) }
        )
        return page
    }

    // MARK: - Reach Tracking

    /// `POST /social/events` est la SEULE porte par laquelle iOS compte ce qu'il
    /// affiche (#10483) : vues, impressions, engagements d'ouverture et sessions
    /// de consommation (`dwell`). Les anciennes routes (`/posts/:id/view`,
    /// `/impression`, `/impressions/batch`, `/engagement/batch`) restent montées
    /// pour les versions publiées ; aucune source neuve ne les appelle
    /// (`LegacyReachRoutesGuardTests`).
    ///
    /// Un lot vide ne part pas : il n'y a rien à compter.
    public func recordSocialEvents(_ events: [StampedSocialEvent], credential: SocialEventsCredential) async throws -> SocialEventsReceipt {
        guard !events.isEmpty else { return SocialEventsReceipt(recorded: 0, rejected: 0) }
        let body = try SocialEventsBody.encoded(events, sentAt: clock(), consent: await consent.current())
        let response: APIResponse<SocialEventsReceipt> = try await api.requestWithHeaders(
            SocialEndpoint.events,
            method: "POST",
            body: body,
            queryItems: nil,
            headers: credential.headers
        )
        return response.data
    }

    public func recordSocialEventsV2(body: Data, credential: SocialEventsCredential) async throws -> SocialEventsV2Receipt {
        let response: APIResponse<SocialEventsV2Receipt> = try await api.requestWithHeaders(
            SocialEndpoint.events,
            method: "POST",
            body: body,
            queryItems: nil,
            headers: credential.headers
        )
        return response.data
    }
}
