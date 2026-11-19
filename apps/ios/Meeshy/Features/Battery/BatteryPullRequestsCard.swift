import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Mina demande ta batterie · Sang · à l'instant — Envoyer » (#19565, planche `Moi-Actions`) : une carte K39 par
/// demande NOMMÉE, sous « Ma batterie ». « Envoyer » la retire aussitôt ; un échec la rend et le dit. Une demande
/// échue disparaît d'elle-même. Sans demande nommée, rien ne s'affiche.
struct BatteryPullRequestsCard: View {
    @ObservedObject var inbox: BatteryPullInbox
    let send: @MainActor (String) async -> Bool

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        TimelineView(.everyMinute) { context in
            let requests = inbox.visible(at: context.date)
            if !requests.isEmpty {
                VStack(spacing: MeeshySpacing.sm) {
                    ForEach(requests) { request in
                        row(request, now: context.date)
                    }
                }
            }
        }
    }

    private func row(_ request: BatteryPullRequest, now: Date) -> some View {
        let isDark = colorScheme == .dark
        let name = request.requester.displayName
        let detail = BatteryPullWording.detail(circle: request.requester.circle, requestedAt: request.requestedAt, now: now)
        return MeeshyPersonRow(
            title: BatteryPullWording.title(name: name),
            subtitle: detail,
            subtitleImage: "battery.50",
            showsDivider: false,
            label: [BatteryPullWording.title(name: name), detail].joined(separator: ", ")
        ) {
            MeeshyAvatar(name: name, context: .custom(36), avatarURL: request.requester.avatar,
                         presenceState: PresenceManager.shared.knownPresenceState(for: request.requester.id),
                         enablePulse: false, isDark: isDark)
        } trailing: {
            MeeshyButton(BatteryPullWording.send, kind: .primary, size: .s36, action: { dispatch(request.id) })
                .accessibilityHint(BatteryPullWording.sendHint(name: name))
                .accessibilityIdentifier("battery.pull.send.\(request.id)")
        }
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.lgPlus)
                .fill(MeeshyColors.controlFill(isDark: isDark))
                .overlay(RoundedRectangle(cornerRadius: MeeshyRadius.lgPlus)
                    .strokeBorder(MeeshyColors.hairline(isDark: isDark), lineWidth: 1))
        )
    }

    private func dispatch(_ id: String) {
        Task {
            let sent = await send(id)
            if !sent { FeedbackToastManager.shared.showError(BatteryPullWording.sendFailed) }
        }
    }
}

nonisolated enum BatteryPullWording {

    static func title(name: String) -> String {
        String(format: String(localized: "battery.pull.title", defaultValue: "%@ demande ta batterie", bundle: .main), name)
    }

    /// « Sang · à l'instant » : le cercle quand la passerelle le sert, puis depuis quand.
    static func detail(circle: RelationLevel?, requestedAt: Date, now: Date) -> String {
        let when = now.timeIntervalSince(requestedAt) < 60
            ? String(localized: "battery.pull.justNow", defaultValue: "à l'instant", bundle: .main)
            : requestedAt.formatted(.relative(presentation: .named, unitsStyle: .abbreviated))
        guard let circle else { return when }
        return "\(CircleLevelNames.title(of: circle)) · \(when)"
    }

    static var send: String {
        String(localized: "battery.pull.send", defaultValue: "Envoyer", bundle: .main)
    }

    static func sendHint(name: String) -> String {
        String(format: String(localized: "battery.pull.sendHint", defaultValue: "Envoie le niveau de ta batterie à %@", bundle: .main), name)
    }

    static var sendFailed: String {
        String(localized: "battery.pull.sendFailed", defaultValue: "Batterie non envoyée, réessaie", bundle: .main)
    }
}
