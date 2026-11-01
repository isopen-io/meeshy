import SwiftUI
import MeeshySDK
import MeeshyUI

/// La ligne d'un lien (#13938) : la personne, son niveau, ce qui manque pour monter, et l'action de montée quand la loi
/// de demande la laisse proposer. Toucher la ligne ouvre la fiche du lien.
struct CircleRowView: View {
    @ObservedObject var viewModel: CirclesViewModel
    let row: CirclesViewModel.Row
    let onOpen: () -> Void
    private var theme: ThemeManager { ThemeManager.shared }

    private var name: String { viewModel.name(of: row.id, fallback: row.person?.name) }
    private var summary: CircleProgressSummary { CircleProgressSummary.make(row.link) }

    var body: some View {
        HStack(spacing: MeeshySpacing.mdPlus) {
            Button(action: onOpen) {
                HStack(spacing: MeeshySpacing.mdPlus) {
                    MeeshyAvatar(
                        name: name,
                        context: .userListItem,
                        accentColor: DynamicColorGenerator.colorForName(name),
                        avatarURL: row.person?.avatarURL
                    )
                    .accessibilityHidden(true)
                    texts
                    Spacer(minLength: MeeshySpacing.sm)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityDescription)
            .accessibilityAddTraits(.isButton)

            trailing
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.vertical, MeeshySpacing.md)
        .animation(.easeOut(duration: 0.2), value: viewModel.pendingLevel(for: row.id))
    }

    private var texts: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
            Text(name)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(theme.textPrimary)
                .lineLimit(1)
            if let line = summary.text(levelTitle: { viewModel.title(of: $0) }) {
                Text(line)
                    .font(.footnote)
                    .foregroundStyle(theme.textSecondary)
                    .lineLimit(2)
            }
        }
    }

    @ViewBuilder
    private var trailing: some View {
        if let waiting = viewModel.pendingLevel(for: row.id) {
            Text(String(format: String(localized: "circles.pending", defaultValue: "Demande envoyée · %@", bundle: .main), viewModel.title(of: waiting)))
                .font(.caption.weight(.semibold))
                .foregroundStyle(theme.textMuted)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 120, alignment: .trailing)
        } else if case .available(let target) = row.link.raiseOffer() {
            let targetTitle = viewModel.title(of: target)
            Button {
                Task { await viewModel.requestRaise(row.link) }
            } label: {
                Text(String(format: String(localized: "circles.action.request", defaultValue: "Demander %@", bundle: .main), targetTitle))
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, MeeshySpacing.md)
                    .frame(minHeight: MeeshyControlSize.tapTarget)
                    .background(Capsule().fill(CircleLevelColor.color(for: target)))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(format: String(localized: "circles.action.request.a11y", defaultValue: "Demander le niveau %1$@ à %2$@", bundle: .main), targetTitle, name))
        }
    }

    private var accessibilityDescription: String {
        [name, viewModel.title(of: row.link.effectiveLevel), summary.text(levelTitle: { viewModel.title(of: $0) })]
            .compactMap { $0 }
            .joined(separator: ", ")
    }
}

/// La ligne d'une demande de montée (#13938) : reçue (accepter / refuser) ou envoyée (annuler). Une demande de SANG
/// n'a pas de « accepter » : c'est le rituel qui la scelle.
struct CircleRequestRow: View {
    enum Direction { case incoming, outgoing }

    @ObservedObject var viewModel: CirclesViewModel
    let request: FriendRequest
    let direction: Direction
    private var theme: ThemeManager { ThemeManager.shared }

    private var otherId: String { direction == .incoming ? request.senderId : request.receiverId }
    private var other: FriendRequestUser? { direction == .incoming ? request.sender : request.receiver }
    private var name: String { viewModel.name(of: otherId, fallback: other?.name) }
    private var levelTitle: String { viewModel.title(of: request.requestedLevel ?? .friend) }
    private var isBlood: Bool { request.requestedLevel == .blood }

    var body: some View {
        HStack(spacing: MeeshySpacing.mdPlus) {
            MeeshyAvatar(
                name: name,
                context: .userListItem,
                accentColor: DynamicColorGenerator.colorForName(name),
                avatarURL: other?.avatar
            )
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(name).font(.subheadline.weight(.semibold)).foregroundStyle(theme.textPrimary).lineLimit(1)
                Text(caption).font(.footnote).foregroundStyle(theme.textSecondary).lineLimit(2)
            }
            Spacer(minLength: MeeshySpacing.sm)
            actions
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.vertical, MeeshySpacing.md)
        .accessibilityElement(children: .contain)
        .transition(.opacity.combined(with: .move(edge: .trailing)))
    }

    private var caption: String {
        let key = direction == .incoming
            ? String(localized: "circles.requests.incoming", defaultValue: "Demande le niveau %@", bundle: .main)
            : String(localized: "circles.requests.outgoing", defaultValue: "En attente · %@", bundle: .main)
        return String(format: key, levelTitle)
    }

    @ViewBuilder
    private var actions: some View {
        switch direction {
        case .incoming:
            HStack(spacing: MeeshySpacing.sm) {
                roundButton(icon: "xmark", tint: theme.textMuted, label: String(localized: "circles.requests.decline", defaultValue: "Refuser", bundle: .main)) {
                    Task { await viewModel.decline(request) }
                }
                if isBlood {
                    ritualButton
                } else {
                    roundButton(icon: "checkmark", tint: MeeshyColors.success, label: String(localized: "circles.requests.accept", defaultValue: "Accepter", bundle: .main)) {
                        Task { await viewModel.accept(request) }
                    }
                }
            }
        case .outgoing:
            HStack(spacing: MeeshySpacing.sm) {
                if isBlood { ritualButton }
                roundButton(icon: "xmark", tint: theme.textMuted, label: String(localized: "circles.requests.cancel", defaultValue: "Annuler la demande", bundle: .main)) {
                    Task { await viewModel.cancel(request) }
                }
            }
        }
    }

    private var ritualButton: some View {
        roundButton(icon: "drop.fill", tint: MeeshyColors.error, label: String(localized: "circles.requests.ritual", defaultValue: "Ouvrir le rituel", bundle: .main)) {
            viewModel.openRitual(with: otherId, fallbackName: other?.name)
        }
    }

    private func roundButton(icon: String, tint: Color, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.caption.weight(.bold))
                .foregroundStyle(tint)
                .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                .background(Circle().fill(tint.opacity(MeeshyOpacity.light)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(label) — \(name)")
    }
}
