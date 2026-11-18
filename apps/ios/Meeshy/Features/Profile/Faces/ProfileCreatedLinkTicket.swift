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
/// (K42) et son échéance. Un lien en pause ou expiré se lit barré et le dit en mots. À droite de la coupe, ce que le
/// billet dit à côté de son chiffre (#19496) : la courbe de la semaine et les pays d'un lien de suivi, ou sa
/// destination ; les visages d'une communauté (K48) ; le QR d'un code de parrainage.
struct ProfileCreatedLinkTicket: View {
    let ticket: LinksFaceTicket
    let accent: Color
    let locale: Locale
    let destination: ProfileCreatedLinkDestination
    let onOpen: (Route) -> Void
    /// « Lien actif » posé depuis le billet d'un lien en pause.
    let onSwitch: (Bool) -> Void

    @State private var opensDetail = false
    @State private var qrShareImage: QRShareImage?

    static func tint(of family: LinksFaceFamily) -> Color {
        switch family {
        case .share: return MeeshyColors.shareAccent
        case .tracking: return MeeshyColors.trackingAccent
        case .community: return MeeshyColors.communityAccent
        case .referral: return MeeshyColors.success
        }
    }

    private var stoppage: LinksFaceStoppage? { ticket.stoppage() }

    /// Ce qui empêche le lien de servir, dit en mots : la teinte barrée n'est jamais seule.
    private var status: String? { stoppage.map { ProfileLinksCopy.stoppage($0) } }

    private var figureText: String { ticket.figure.value.formatted(.number.locale(locale)) }

    /// Ce que VoiceOver lit d'un billet : le chiffre avec ce qu'il compte, jamais un nombre nu.
    private var spokenLabel: String {
        [ticket.title, ticket.code, "\(figureText) \(ProfileLinksCopy.figureCaption(ticket.figure))",
         ProfileLinksCopy.spokenAside(ticket.aside, locale: locale), status]
            .compactMap { $0 }
            .joined(separator: ", ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            billet
            if let stoppage, Self.switchesInPlace(stoppage, family: ticket.family) {
                activeSwitch(of: stoppage)
            } else if let stoppage {
                consequence(of: stoppage)
            }
        }
    }

    /// Un lien de partage ou de suivi en pause se rallume depuis son billet (planche `Etat-Erreur` vue 4) : les autres
    /// arrêts ouvrent leur détail, seul à savoir les régler.
    static func switchesInPlace(_ stoppage: LinksFaceStoppage, family: LinksFaceFamily) -> Bool {
        stoppage == .paused && (family == .share || family == .tracking)
    }

    /// « Lien actif », éteint, avec ce que la pause veut dire, puis ce que le lien garde : l'interrupteur répond tout
    /// de suite, et le billet remonte parmi ceux qui servent.
    private func activeSwitch(of stoppage: LinksFaceStoppage) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
            MeeshyToggleRow(ProfileLinksCopy.linkActive,
                            subtitle: ProfileLinksCopy.stoppageConsequence(stoppage),
                            accessory: .toggle(isOn: false),
                            tint: Self.tint(of: ticket.family),
                            action: { onSwitch(true) })
                .accessibilityIdentifier("profile.links.switch.\(ticket.id)")
            if let kept = ticket.keptFigure() {
                Text(ProfileLinksCopy.kept(kept, locale: locale))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                    .foregroundStyle(ThemeManager.shared.textMuted)
                    .padding(.horizontal, MeeshySpacing.xs)
                    .accessibilityIdentifier("profile.links.kept")
            }
        }
    }

    /// Sous le billet d'un lien à l'arrêt (planche `Etat-Erreur` vue 4) : ce que l'arrêt veut dire pour qui le reçoit,
    /// et le geste qui le relance — il ouvre le détail, où la limite se règle.
    private func consequence(of stoppage: LinksFaceStoppage) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.sm) {
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(ProfileLinksCopy.stoppageConsequence(stoppage))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                    .foregroundStyle(ThemeManager.shared.textSecondary)
                if let kept = ticket.keptFigure() {
                    Text(ProfileLinksCopy.kept(kept, locale: locale))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                        .foregroundStyle(ThemeManager.shared.textMuted)
                        .accessibilityIdentifier("profile.links.kept")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let relaunch = Self.relaunchTitle(stoppage, family: ticket.family) {
                MeeshyButton(relaunch, systemImage: "plus", kind: .outline, size: .s36,
                             tint: Self.tint(of: ticket.family), action: { open() })
            }
        }
        .padding(.horizontal, MeeshySpacing.xs)
    }

    /// Le geste qui relance un lien arrêté depuis son détail : la limite d'un lien de partage plein. Un lien en pause
    /// a son interrupteur sur le billet ; un lien expiré ne se relance pas d'un geste.
    static func relaunchTitle(_ stoppage: LinksFaceStoppage, family: LinksFaceFamily) -> String? {
        switch (stoppage, family) {
        case (.full, .share): return ProfileLinksCopy.raiseLimit
        default: return nil
        }
    }

    private var billet: some View {
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
        .modifier(CodeQRAction(payload: codeQRPayload, show: { showCodeQR() }))
        .navigationDestination(isPresented: $opensDetail) { detail }
        .sheet(item: $qrShareImage) { qr in ShareSheet(activityItems: [qr.image]) }
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
            Spacer(minLength: 0)
            aside
        }
    }

    // MARK: - À côté du chiffre (#19496)

    @ViewBuilder
    private var aside: some View {
        switch ticket.aside {
        case .reach(let days, let countries)?:
            reach(days: days, countries: countries)
        case .destination(let destination)?:
            MeeshyBadge(.label(ProfileLinksCopy.destination(destination)),
                        leading: .systemImage(ProfileLinksCopy.destinationGlyph(destination)), size: .s28)
        case .members(let members)?:
            LinksFaceStack(members: members, label: ProfileLinksCopy.members(members.map(\.name)),
                           tint: Self.tint(of: ticket.family))
        case .codeQR?:
            MeeshyButton(ProfileLinksCopy.codeQR, systemImage: "qrcode", kind: .tinted, size: .s36,
                         tint: Self.tint(of: ticket.family), action: { showCodeQR() })
                .accessibilityIdentifier("profile.links.codeQR.\(ticket.id)")
        case nil:
            EmptyView()
        }
    }

    /// La courbe des derniers jours (K50, taille billet) avec sa période, puis le nombre de pays (K41).
    private func reach(days: [Int], countries: Int?) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            if !days.isEmpty {
                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    MeeshyChart(kind: .line, points: Self.curvePoints(days),
                                summary: ProfileLinksCopy.curveSummary(days.count, locale: locale),
                                tint: Self.tint(of: ticket.family), size: .spark, markers: [.today],
                                animatesEntry: false)
                    Text(ProfileLinksCopy.days(days.count, locale: locale))
                        .font(MeeshyFont.relative(MeeshyFont.captionSize))
                        .foregroundStyle(ThemeManager.shared.textMuted)
                        .accessibilityHidden(true)
                }
                .frame(maxWidth: 140)
            }
            if let countries {
                MeeshyBadge(.label(ProfileLinksCopy.countries(countries, locale: locale)), leading: .systemImage("flag"),
                            size: .s28)
            }
        }
    }

    /// Un point par jour, le plus ancien d'abord ; chacun se dit avec ce qu'il compte.
    static func curvePoints(_ days: [Int]) -> [MeeshyChartPoint] {
        days.enumerated().map { index, count in
            MeeshyChartPoint(id: "day\(index)", value: Double(count), label: "\(count)",
                             spoken: "\(count) \(ProfileLinksCopy.figureCaption(.clicks(count)))")
        }
    }

    private var codeQRPayload: String? {
        guard case .codeQR(let payload)? = ticket.aside else { return nil }
        return payload
    }

    private func showCodeQR() {
        guard let codeQRPayload else { return }
        qrShareImage = LinkQRCode.shareImage(for: codeQRPayload)
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

/// « QR du code » offert à VoiceOver sur le billet d'un parrainage, et à lui seul.
private struct CodeQRAction: ViewModifier {
    let payload: String?
    let show: () -> Void

    @ViewBuilder
    func body(content: Content) -> some View {
        if payload != nil {
            content.accessibilityAction(named: Text(ProfileLinksCopy.codeQR)) { show() }
        } else {
            content
        }
    }
}
