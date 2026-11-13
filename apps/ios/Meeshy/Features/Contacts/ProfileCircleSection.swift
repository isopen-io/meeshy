import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le cercle sur le profil d'une personne liée, Connaissance comprise (#13940, #14910), posé là où la fiche disait
/// « Connectés » ou proposait la demande de connexion : le niveau commun, ce qui manque pour monter, puis en bas
/// un libellé impératif par cercle visé quand c'est possible (« Soyons proches ») et, pour descendre, « Restons amis »
/// (ou « Annuler le lien » à Connaissance), chacun confirmé. Sans lien servi, rien : `linked` reste faux et la fiche garde ce qu'elle montrait avant.
struct ProfileCircleSection: View {
    @StateObject private var viewModel: ProfileCircleViewModel
    let displayName: String
    @Binding var linked: Bool
    @State private var confirmsLowering = false
    private var theme: ThemeManager { ThemeManager.shared }

    init(userId: String, displayName: String, linked: Binding<Bool>) {
        _viewModel = StateObject(wrappedValue: ProfileCircleViewModel(userId: userId))
        self.displayName = displayName
        _linked = linked
    }

    var body: some View {
        Group {
            if let level = viewModel.shownLevel {
                VStack(spacing: MeeshySpacing.smPlus) {
                    row(level)
                    if viewModel.offersTalkie {
                        ProfileTalkieRow(userId: viewModel.userId, displayName: displayName)
                    }
                    if viewModel.offersBring {
                        ProfileBringRow(userId: viewModel.userId, displayName: displayName)
                    }
                    if viewModel.offersTogether {
                        ProfileTogetherRow(userId: viewModel.userId, displayName: displayName)
                    }
                    promoteButton
                    loweringButton(from: level)
                }
            } else if viewModel.offersTalkie || viewModel.offersBring || viewModel.offersTogether {
                VStack(spacing: MeeshySpacing.smPlus) {
                    if viewModel.offersTalkie {
                        ProfileTalkieRow(userId: viewModel.userId, displayName: displayName)
                    }
                    if viewModel.offersBring {
                        ProfileBringRow(userId: viewModel.userId, displayName: displayName)
                    }
                    if viewModel.offersTogether {
                        ProfileTogetherRow(userId: viewModel.userId, displayName: displayName)
                    }
                }
            } else {
                Color.clear.frame(height: 0)
            }
        }
        .animation(.easeOut(duration: 0.2), value: viewModel.pendingLevel)
        .animation(.easeOut(duration: 0.2), value: viewModel.shownLevel)
        .task(id: viewModel.userId) { await viewModel.load() }
        .adaptiveOnChange(of: viewModel.claimsTheSlot, initial: true) { _, claims in linked = claims }
        .adaptiveOnChange(of: viewModel.notice) { _, new in
            guard let new else { return }
            FeedbackToastManager.shared.showError(new)
            viewModel.notice = nil
        }
    }

    private func row(_ level: RelationLevel) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text("\(CircleLevelNames.icon(of: level)) \(CircleLevelNames.title(of: level))")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(CircleLevelColor.color(for: level))
                if let summary = viewModel.summary {
                    Text(summary)
                        .font(.footnote)
                        .foregroundStyle(theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(levelAccessibility(level))
            Spacer(minLength: MeeshySpacing.sm)
            if let waiting = viewModel.pendingLevel {
                Text(String(format: String(localized: "circles.requests.outgoing", defaultValue: "En attente · %@", bundle: .main), CircleLevelNames.title(of: waiting)))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(theme.textMuted)
                    .multilineTextAlignment(.trailing)
            }
        }
        .padding(MeeshySpacing.md)
        .background(CircleLevelColor.color(for: level).opacity(MeeshyOpacity.subtle))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
    }

    @ViewBuilder
    private var promoteButton: some View {
        if let target = viewModel.offeredRaise, let label = ProfileCircleWording.promote(to: target) {
            actionButton(
                icon: "arrow.up.circle.fill",
                label: label,
                color: CircleLevelColor.color(for: target)
            ) {
                Task { await viewModel.requestRaise() }
            }
            .accessibilityLabel(ProfileCircleWording.promoteAccessibility(to: target, name: displayName) ?? label)
        }
    }

    @ViewBuilder
    private func loweringButton(from level: RelationLevel) -> some View {
        if let lowering = viewModel.offeredLowering {
            actionButton(icon: loweringIcon(lowering), label: lowering.label, color: theme.error) {
                confirmsLowering = true
            }
            .disabled(viewModel.isLowering)
            .confirmationDialog(
                lowering.confirmationTitle(name: displayName),
                isPresented: $confirmsLowering,
                titleVisibility: .visible
            ) {
                Button(lowering.label, role: .destructive) {
                    Task { await viewModel.lower() }
                }
                Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
            } message: {
                Text(confirmationBody(lowering, from: level))
            }
        }
    }

    private func actionButton(icon: String, label: String, color: Color, action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.medium()
            action()
        } label: {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: icon)
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                Text(label)
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
            }
            .foregroundStyle(color)
            .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.tapTarget)
            .background(color.opacity(MeeshyOpacity.subtle))
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                    .stroke(color.opacity(MeeshyOpacity.medium), lineWidth: MeeshyBorder.emphasis)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private func loweringIcon(_ lowering: ProfileCircleLowering) -> String {
        switch lowering {
        case .demote: return "arrow.down.circle.fill"
        case .unlink: return "person.crop.circle.badge.xmark"
        }
    }

    private func confirmationBody(_ lowering: ProfileCircleLowering, from level: RelationLevel) -> String {
        switch lowering {
        case .demote(let target):
            return String(
                format: String(localized: "circles.demote.confirm.body", defaultValue: "%1$@ passera de %2$@ à %3$@. Vous perdrez ce que %2$@ partage. %1$@ n'en sera pas averti(e) et ne pourra pas vous redemander de remonter avant 30 jours.", bundle: .main),
                displayName, CircleLevelNames.title(of: level), CircleLevelNames.title(of: target)
            )
        case .unlink:
            return String(format: String(localized: "circles.unlink.confirm.body", defaultValue: "Vous ne serez plus liés : plus aucun cercle commun. %@ n'en sera pas averti(e) et ne pourra pas vous redemander de lien avant 30 jours.", bundle: .main), displayName)
        }
    }

    private func levelAccessibility(_ level: RelationLevel) -> String {
        [CircleLevelNames.title(of: level), viewModel.summary].compactMap { $0 }.joined(separator: ", ")
    }
}
