import SwiftUI
import MeeshySDK
import MeeshyUI

/// La ligne du cercle sur le profil d'un Ami ou d'un Proche (#13940), posée là où la fiche disait « Connectés » :
/// le niveau commun, ce qui manque pour monter, et « Demander X » quand c'est possible. Sans lien servi, la fiche garde
/// son badge d'avant.
struct ProfileCircleSection: View {
    @StateObject private var viewModel: ProfileCircleViewModel
    let displayName: String
    private var theme: ThemeManager { ThemeManager.shared }

    init(userId: String, displayName: String) {
        _viewModel = StateObject(wrappedValue: ProfileCircleViewModel(userId: userId))
        self.displayName = displayName
    }

    var body: some View {
        Group {
            if let level = viewModel.shownLevel {
                row(level)
            } else {
                ProfileConnectedBadge()
            }
        }
        .animation(.easeOut(duration: 0.2), value: viewModel.pendingLevel)
        .task(id: viewModel.userId) { await viewModel.load() }
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
            trailing
        }
        .padding(MeeshySpacing.md)
        .background(CircleLevelColor.color(for: level).opacity(MeeshyOpacity.subtle))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
    }

    @ViewBuilder
    private var trailing: some View {
        if let waiting = viewModel.pendingLevel {
            Text(String(format: String(localized: "circles.pending", defaultValue: "Demande envoyée · %@", bundle: .main), CircleLevelNames.title(of: waiting)))
                .font(.caption.weight(.semibold))
                .foregroundStyle(theme.textMuted)
                .multilineTextAlignment(.trailing)
        } else if let target = viewModel.offeredRaise {
            let targetTitle = CircleLevelNames.title(of: target)
            Button {
                Task { await viewModel.requestRaise() }
            } label: {
                Text(String(format: String(localized: "circles.action.request", defaultValue: "Demander %@", bundle: .main), targetTitle))
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, MeeshySpacing.md)
                    .frame(minHeight: MeeshyControlSize.tapTarget)
                    .background(Capsule().fill(CircleLevelColor.color(for: target)))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(format: String(localized: "circles.action.request.a11y", defaultValue: "Demander le niveau %1$@ à %2$@", bundle: .main), targetTitle, displayName))
        }
    }

    private func levelAccessibility(_ level: RelationLevel) -> String {
        [CircleLevelNames.title(of: level), viewModel.summary].compactMap { $0 }.joined(separator: ", ")
    }
}
