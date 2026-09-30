import SwiftUI
import MeeshySDK
import MeeshyUI

/// #8072 — la carte de note d'après-appel : posée en bas de l'écran, elle ne
/// couvre rien et ne bloque aucun geste. Cinq étoiles (4 ou 5 partent d'un
/// toucher), les motifs en dessous pour une note basse, « Plus tard » pour
/// fermer. Elle se retire seule si personne n'y touche.
struct CallFeedbackCard: View {
    @ObservedObject var viewModel: CallFeedbackViewModel
    let prompt: CallFeedbackPrompt

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let starColor = MeeshyColors.warning
    private static let issueColumns = [GridItem(.adaptive(minimum: 132), spacing: MeeshySpacing.sm)]

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            header
            stars
            if viewModel.pendingRating != nil {
                issues
            }
        }
        .padding(MeeshySpacing.lg)
        .frame(maxWidth: 420)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous))
        .shadow(color: .black.opacity(0.18), radius: 16, y: 8)
        .padding(.horizontal, MeeshySpacing.lg)
        .accessibilityElement(children: .contain)
        .animation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.85), value: viewModel.pendingRating)
        .task(id: prompt.callId) {
            try? await Task.sleep(for: CallFeedbackViewModel.idleTimeout)
            guard !Task.isCancelled else { return }
            viewModel.expire()
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: MeeshySpacing.sm) {
            Text(title)
                .font(.headline)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader)
            Button { viewModel.dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(-10)
            .accessibilityLabel(String(localized: "call.feedback.later", defaultValue: "Plus tard", bundle: .main))
        }
    }

    private var title: String {
        guard let name = prompt.peerName, !name.isEmpty else {
            return String(localized: "call.feedback.title.anonymous", defaultValue: "Comment était l'appel ?", bundle: .main)
        }
        return String(localized: "call.feedback.title", defaultValue: "Comment était l'appel avec \(name) ?", bundle: .main)
    }

    private var stars: some View {
        HStack(spacing: MeeshySpacing.xs) {
            ForEach(Array(CallQualityFeedback.ratingRange), id: \.self) { value in
                starButton(value)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func starButton(_ value: Int) -> some View {
        let lit = (viewModel.pendingRating ?? 0) >= value
        return Button {
            HapticFeedback.light()
            viewModel.rate(value)
        } label: {
            Image(systemName: lit ? "star.fill" : "star")
                .font(.title2)
                .foregroundStyle(lit ? Self.starColor : Color.secondary)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "call.feedback.star", defaultValue: "\(value) sur 5", bundle: .main))
        .accessibilityAddTraits(viewModel.pendingRating == value ? .isSelected : [])
    }

    private var issues: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
            Text(String(localized: "call.feedback.issues.title", defaultValue: "Qu'est-ce qui a gêné ?", bundle: .main))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            LazyVGrid(columns: Self.issueColumns, alignment: .leading, spacing: MeeshySpacing.sm) {
                ForEach(viewModel.availableIssues) { issue in
                    issueChip(issue)
                }
            }
            HStack {
                Spacer()
                Button { viewModel.send() } label: {
                    Text(String(localized: "call.feedback.send", defaultValue: "Envoyer", bundle: .main))
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, MeeshySpacing.xl)
                        .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .background(MeeshyColors.brandPrimary, in: Capsule())
            }
        }
        .transition(.opacity)
    }

    private func issueChip(_ issue: CallFeedbackIssue) -> some View {
        let selected = viewModel.selectedIssues.contains(issue)
        return Button {
            viewModel.toggle(issue)
        } label: {
            Text(Self.label(for: issue))
                .font(.subheadline)
                .foregroundStyle(selected ? Color.white : Color.primary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .padding(.horizontal, MeeshySpacing.md)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(
            selected ? MeeshyColors.brandPrimary : Color.primary.opacity(0.08),
            in: RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous)
        )
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    static func label(for issue: CallFeedbackIssue) -> String {
        switch issue {
        case .audioQuality:
            return String(localized: "call.feedback.issue.audio_quality", defaultValue: "Son de mauvaise qualité", bundle: .main)
        case .videoQuality:
            return String(localized: "call.feedback.issue.video_quality", defaultValue: "Vidéo figée ou floue", bundle: .main)
        case .echo:
            return String(localized: "call.feedback.issue.echo", defaultValue: "Écho", bundle: .main)
        case .dropped:
            return String(localized: "call.feedback.issue.dropped", defaultValue: "Coupures", bundle: .main)
        case .sync:
            return String(localized: "call.feedback.issue.sync", defaultValue: "Son et image décalés", bundle: .main)
        case .other:
            return String(localized: "call.feedback.issue.other", defaultValue: "Autre chose", bundle: .main)
        }
    }
}
