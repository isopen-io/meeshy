import SwiftUI
import MeeshySDK
import MeeshyUI

/// Où mène le billet d'un lien créé : son détail quand l'app en a un, sinon la page de sa famille.
enum ProfileCreatedLinkDestination {
    case share(MyShareLink, onChanged: @MainActor (MyShareLink) -> Void, onDeleted: @MainActor (String) -> Void)
    case tracking(TrackingLink)
    case community(CommunityLink)
    case route(Route)
}

/// Le billet de rangée d'un lien créé (K30, planche `Moi-Liens`) : la pastille de sa famille, son titre, son adresse en
/// chasse fixe, le bouton Copier à droite ; sous la coupe, son chiffre et ce qu'il compte, la jauge d'un lien plafonné
/// (K42) et son échéance. Un lien en pause ou expiré se lit barré et le dit en mots.
struct ProfileCreatedLinkTicket: View {
    let ticket: LinksFaceTicket
    let accent: Color
    let locale: Locale
    let destination: ProfileCreatedLinkDestination
    let onOpen: (Route) -> Void

    @State private var opensDetail = false

    static func tint(of family: LinksFaceFamily) -> Color {
        switch family {
        case .share: return MeeshyColors.shareAccent
        case .tracking: return MeeshyColors.trackingAccent
        case .community: return MeeshyColors.communityAccent
        case .referral: return MeeshyColors.success
        }
    }

    private var isExpired: Bool { ticket.expiresAt.map { $0 <= Date() } ?? false }

    /// Ce qui empêche le lien de servir, dit en mots : la teinte barrée n'est jamais seule.
    private var status: String? {
        if isExpired { return ProfileLinksCopy.expired }
        return ticket.isActive ? nil : ProfileLinksCopy.paused
    }

    private var figureText: String { ticket.figure.value.formatted(.number.locale(locale)) }

    /// Ce que VoiceOver lit d'un billet : le chiffre avec ce qu'il compte, jamais un nombre nu.
    private var spokenLabel: String {
        [ticket.title, ticket.code, "\(figureText) \(ProfileLinksCopy.figureCaption(ticket.figure))", status]
            .compactMap { $0 }
            .joined(separator: ", ")
    }

    var body: some View {
        MeeshyTicket(
            title: ticket.title,
            code: ticket.code,
            tint: Self.tint(of: ticket.family),
            systemImage: ProfileLinksCopy.familyGlyph(ticket.family),
            figure: figureText,
            figureCaption: ProfileLinksCopy.figureCaption(ticket.figure),
            size: .row,
            kind: status == nil ? .normal : .struck,
            isFlipped: false,
            isSelected: false,
            isDragging: false,
            label: spokenLabel,
            statusLabel: status,
            flipLabels: nil,
            onPress: { open() },
            stub: { stub },
            leading: { EmptyView() },
            trailing: { copyButton },
            status: { EmptyView() },
            back: { EmptyView() }
        )
        .accessibilityAction(named: Text(ProfileLinksCopy.copyLink(ticket.title))) { copy() }
        .navigationDestination(isPresented: $opensDetail) { detail }
        .accessibilityIdentifier("profile.links.ticket.\(ticket.id)")
    }

    private var copyButton: some View {
        MeeshyGlassButton(systemImage: "doc.on.doc", label: ProfileLinksCopy.copyLink(ticket.title), size: .s36,
                          glyphTint: Self.tint(of: ticket.family), action: { copy() })
    }

    @ViewBuilder
    private var stub: some View {
        HStack(spacing: MeeshySpacing.sm) {
            if let fill = ticket.figure.fill {
                MeeshyMeter(value: fill, label: ProfileLinksCopy.figureCaption(ticket.figure),
                            tint: Self.tint(of: ticket.family), size: .s5, animatesOnAppear: false)
                    .frame(maxWidth: 96)
            }
            if let status {
                Text(status)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                    .foregroundStyle(ThemeManager.shared.textMuted)
            } else if let expiresAt = ticket.expiresAt {
                Label(ProfileLinksCopy.expires(expiresAt.formatted(.relative(presentation: .named).locale(locale))),
                      systemImage: "clock")
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                    .foregroundStyle(ThemeManager.shared.textSecondary)
            }
        }
    }

    private func copy() {
        LinksClipboard.copy(ticket.copyValue, message: ProfileLinksCopy.copied)
    }

    private func open() {
        if case .route(let route) = destination { return onOpen(route) }
        opensDetail = true
    }

    @ViewBuilder
    private var detail: some View {
        switch destination {
        case .share(let link, let onChanged, let onDeleted):
            ShareLinkDetailView(link: link, onLinkChanged: onChanged, onLinkDeleted: onDeleted)
        case .tracking(let link):
            TrackingLinkDetailView(link: link)
        case .community(let link):
            CommunityLinkDetailView(link: link)
        case .route:
            EmptyView()
        }
    }
}
