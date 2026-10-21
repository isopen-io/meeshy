import SwiftUI
import MeeshySDK

// MARK: - Le lien touché dans un contenu social (#10505)

/// Ce qu'un lien touché DIT au catalogue v2 : le DOMAINE enregistrable d'un
/// lien sortant, l'identifiant d'un lien de suivi Meeshy (`/l/<jeton>`) —
/// jamais l'URL, son chemin ni sa requête. Un lien interne à Meeshy (profil,
/// post, conversation) n'est pas un clic sortant : rien ne part.
nonisolated enum OutboundLinkEvents {
    static let ownDomains: Set<String> = ["meeshy.me"]

    static func event(for url: URL, surface: SocialSurface?, at date: Date = Date()) -> SocialEventV2? {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https",
              let domain = RegistrableDomain.of(url) else { return nil }
        guard ownDomains.contains(domain) else {
            return SocialEventV2(
                occurredAt: date,
                target: SocialTarget(kind: .link, id: domain),
                surface: surface,
                payload: .link(SocialLinkEvent(action: .outboundClick, domain: domain))
            )
        }
        let parts = url.pathComponents.filter { $0 != "/" }
        guard parts.count >= 2, parts[0] == "l", !parts[1].isEmpty else { return nil }
        let token = String(parts[1].prefix(64))
        return SocialEventV2(
            occurredAt: date,
            target: SocialTarget(kind: .link, id: token),
            surface: surface,
            payload: .link(SocialLinkEvent(action: .trackingLinkFollowed, domain: domain, trackingLinkId: token))
        )
    }
}

/// Intercepte les liens ouverts sous une surface sociale, émet l'événement,
/// puis remet le lien au gestionnaire PARENT — le comportement d'ouverture ne
/// change pas.
struct OutboundLinkTelemetryModifier: ViewModifier {
    let surface: SocialSurface
    @Environment(\.openURL) private var parentOpenURL

    func body(content: Content) -> some View {
        let surface = surface
        let parent = parentOpenURL
        return content.environment(\.openURL, OpenURLAction { url in
            // Un lien s'ouvre toujours depuis le fil principal (geste).
            MainActor.assumeIsolated {
                if let event = OutboundLinkEvents.event(for: url, surface: surface) {
                    SocialEventsV2Reporter.shared.emit(event)
                }
                parent(url)
            }
            return .handled
        })
    }
}

extension View {
    func tracksOutboundLinks(surface: SocialSurface) -> some View {
        modifier(OutboundLinkTelemetryModifier(surface: surface))
    }
}
