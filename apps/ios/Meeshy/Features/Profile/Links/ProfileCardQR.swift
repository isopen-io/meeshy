import Foundation
import MeeshySDK
import MeeshyUI

/// Ce que montre le QR de ma carte (planche `Carte-Profil`, tuiles K47) : ma vitrine publique, ou une invitation à me
/// rejoindre — scanner envoie alors une demande d'amis.
nonisolated enum ProfileCardQRShows: String, CaseIterable, Hashable, Sendable {
    case showcase
    case invitation
}

/// Les actions de ma carte, dans l'ordre de la planche. « Envoyer dans une conversation » demande ma fiche servie.
nonisolated enum ProfileCardAction: String, CaseIterable, Hashable, Sendable {
    case copy
    case send
    case story
    case save
    case more

    static func offered(canSend: Bool) -> [ProfileCardAction] {
        allCases.filter { $0 != .send || canSend }
    }
}

/// Ce qu'un QR Meeshy lu contient d'une invitation : le jeton du partage sans contact (#19205), et la fiche seule.
nonisolated struct ProfileInvitationScan: Equatable, Sendable {
    let token: String
    let profile: URL
}

/// L'adresse d'invitation : celle de ma fiche, `meeshy.me/@pseudo`, qui porte le jeton bref en `?ce=`. Une caméra ou
/// un navigateur qui ignore `ce` ouvre ma vitrine, comme avant (#19486) ; le lecteur de l'app accepte le jeton.
nonisolated enum ProfileInvitationLink {
    static let tokenQueryName = "ce"
    private static let hosts: Set<String> = [ProfileLink.host, "www.\(ProfileLink.host)"]

    /// `nil` pour un jeton hors motif : il n'entre jamais dans une adresse.
    static func url(for link: ProfileLink, token: String) -> URL? {
        guard ContactExchangeToken.isWellFormed(token),
              var components = URLComponents(url: link.url, resolvingAgainstBaseURL: false) else { return nil }
        components.queryItems = [URLQueryItem(name: tokenQueryName, value: token)]
        return components.url
    }

    /// Une fiche Meeshy en https qui porte un jeton bien formé ; tout le reste n'est pas une invitation.
    static func invitation(in url: URL) -> ProfileInvitationScan? {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.scheme?.lowercased() == "https",
              let host = components.host?.lowercased(), hosts.contains(host),
              components.path.hasPrefix("/@"), components.path.count > 2,
              let token = components.queryItems?.first(where: { $0.name == tokenQueryName })?.value,
              ContactExchangeToken.isWellFormed(token) else { return nil }
        components.queryItems = nil
        guard let profile = components.url else { return nil }
        return ProfileInvitationScan(token: token, profile: profile)
    }

    /// L'échéance que le jeton porte lui-même (`ce1.<aléa>.<offres>.<échéance>.<signature>`).
    static func expiry(of token: String) -> Date? {
        guard ContactExchangeToken.isWellFormed(token) else { return nil }
        let parts = token.split(separator: ".", omittingEmptySubsequences: false)
        return TimeInterval(String(parts[3])).map { Date(timeIntervalSince1970: $0) }
    }
}

/// Le QR de ma carte, sans rien d'autre que des valeurs. Tant que l'invitation n'est pas servie (en préparation, ou
/// refusée par une passerelle qui ne sert pas l'échange), le QR garde ma vitrine : il n'est jamais vide.
nonisolated struct ProfileCardQRState: Equatable, Sendable {
    nonisolated enum Invitation: Equatable, Sendable {
        case notIssued
        case issued(token: String)
        case unavailable
    }

    static let refreshMargin: TimeInterval = 15
    static let minimumRefresh: TimeInterval = 5
    static let unknownExpiryRefresh: TimeInterval = 60

    var shows: ProfileCardQRShows = .showcase
    var invitation: Invitation = .notIssued

    /// Choisir remet l'invitation à zéro : un jeton ne survit pas au retour sur la vitrine.
    func choosing(_ next: ProfileCardQRShows) -> ProfileCardQRState {
        guard next != shows else { return self }
        return ProfileCardQRState(shows: next, invitation: .notIssued)
    }

    func payload(for link: ProfileLink) -> URL {
        invitationURL(for: link) ?? link.url
    }

    func carriesInvitation(for link: ProfileLink) -> Bool {
        invitationURL(for: link) != nil
    }

    var isPreparingInvitation: Bool { shows == .invitation && invitation == .notIssued }
    var isInvitationUnavailable: Bool { shows == .invitation && invitation == .unavailable }

    /// Le jeton se renouvelle un peu avant son échéance, jamais en rafale.
    func refreshDelay(now: Date) -> TimeInterval {
        guard case .issued(let token) = invitation,
              let expiry = ProfileInvitationLink.expiry(of: token) else { return Self.unknownExpiryRefresh }
        return max(expiry.timeIntervalSince(now) - Self.refreshMargin, Self.minimumRefresh)
    }

    private func invitationURL(for link: ProfileLink) -> URL? {
        guard shows == .invitation, case .issued(let token) = invitation else { return nil }
        return ProfileInvitationLink.url(for: link, token: token)
    }
}

/// Le QR vivant : il demande à la passerelle un jeton qui n'offre QUE la demande d'ami, et le renouvelle tant que
/// l'invitation reste choisie. La vue le pilote par `.task(id:)`, qui l'arrête dès qu'on revient à la vitrine.
@MainActor
final class ProfileCardQRModel: ObservableObject {
    typealias Pause = @Sendable (TimeInterval) async throws -> Void

    @Published private(set) var state = ProfileCardQRState()

    private let service: ContactExchangeProviding
    private let pause: Pause
    private let now: @Sendable () -> Date

    init(service: ContactExchangeProviding = ContactExchangeService.shared,
         pause: @escaping Pause = { seconds in try await Task.sleep(for: .seconds(seconds)) },
         now: @escaping @Sendable () -> Date = { Date() }) {
        self.service = service
        self.pause = pause
        self.now = now
    }

    nonisolated deinit {}

    func choose(_ shows: ProfileCardQRShows) {
        state = state.choosing(shows)
    }

    func keepInvitationFresh() async {
        while state.shows == .invitation, !Task.isCancelled {
            guard await issueInvitation() else { return }
            do {
                try await pause(state.refreshDelay(now: now()))
            } catch {
                return
            }
        }
    }

    /// `false` quand il n'y a plus rien à renouveler : l'invitation a été quittée, ou la passerelle l'a refusée.
    private func issueInvitation() async -> Bool {
        do {
            let issued = try await service.issue(offers: [.friendRequest])
            guard state.shows == .invitation, !Task.isCancelled else { return false }
            state.invitation = .issued(token: issued.token)
            return true
        } catch {
            guard state.shows == .invitation else { return false }
            state.invitation = .unavailable
            return false
        }
    }
}

extension ProfileCardQRShows {
    var choiceItem: MeeshyChoiceItem {
        switch self {
        case .showcase:
            return MeeshyChoiceItem(id: rawValue, title: ProfileLinksCopy.qrShowsShowcase,
                                    detail: ProfileLinksCopy.qrShowsShowcaseDetail, systemImage: "globe")
        case .invitation:
            return MeeshyChoiceItem(id: rawValue, title: ProfileLinksCopy.qrShowsInvitation,
                                    detail: ProfileLinksCopy.qrShowsInvitationDetail, systemImage: "person.badge.plus")
        }
    }
}

/// Ce que devient une invitation scannée : la demande d'ami est partie, la fiche s'ouvre seule (la passerelle n'a pas
/// pu l'envoyer, sans dire pourquoi), ou le jeton n'est plus valable — la fiche s'ouvre quand même.
nonisolated enum ProfileInvitationOutcome: Equatable, Sendable {
    case friendRequestSent
    case opened
    case expired

    static func of(_ accepted: ContactExchangeAccepted) -> ProfileInvitationOutcome {
        accepted.friendRequest == .sent ? .friendRequestSent : .opened
    }
}

/// Le lecteur de QR de l'app accepte l'invitation auprès de la passerelle ; la fiche s'ouvre par le routeur.
enum ProfileInvitationAcceptance {
    static func accept(_ token: String,
                       service: ContactExchangeProviding = ContactExchangeService.shared) async -> ProfileInvitationOutcome {
        do {
            return .of(try await service.accept(token: token))
        } catch {
            return .expired
        }
    }

    static func announce(_ outcome: ProfileInvitationOutcome, toasts: FeedbackToastManager = .shared) {
        switch outcome {
        case .friendRequestSent: toasts.showSuccess(ProfileLinksCopy.invitationSent)
        case .expired: toasts.showNotice(ProfileLinksCopy.invitationExpired)
        case .opened: break
        }
    }
}
