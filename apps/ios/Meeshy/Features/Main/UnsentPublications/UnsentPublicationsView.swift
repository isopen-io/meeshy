import SwiftUI
import MeeshySDK
import MeeshyUI

/// **« Publications non envoyées »** (#13415), sur le modèle des échecs de
/// `MyStoriesView` : chaque post ou réel que le serveur n'a pas confirmé, avec
/// son état et ce qui l'a arrêté — rouvrir en brouillon, réessayer, supprimer.
struct UnsentPublicationsView: View {
    @ObservedObject var viewModel: UnsentPublicationsViewModel
    /// L'hôte ferme cette feuille puis ouvre le composeur, qui reprend le brouillon.
    let onReopen: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var deleteCandidate: UnsentPublication?

    var body: some View {
        NavigationStack {
            content
                .navigationTitle(UnsentPublicationsCopy.title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button {
                            dismiss()
                        } label: {
                            Image(systemName: "xmark")
                        }
                        .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
                    }
                }
        }
        .task { await viewModel.load() }
        .confirmationDialog(UnsentPublicationsCopy.deleteConfirmTitle,
                            isPresented: Binding(get: { deleteCandidate != nil },
                                                 set: { if !$0 { deleteCandidate = nil } }),
                            titleVisibility: .visible,
                            presenting: deleteCandidate) { publication in
            Button(UnsentPublicationsCopy.delete, role: .destructive) {
                Task { UnsentPublicationsToast.deletion(await viewModel.delete(publication.id)) }
            }
            Button(UnsentPublicationsCopy.cancel, role: .cancel) {}
        } message: { _ in
            Text(UnsentPublicationsCopy.deleteConfirmMessage)
        }
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.hasLoaded && viewModel.publications.isEmpty {
            AdaptiveContentUnavailableView(UnsentPublicationsCopy.empty, systemImage: "checkmark.circle")
        } else {
            List(viewModel.publications) { publication in
                UnsentPublicationRow(
                    publication: publication,
                    canReopen: viewModel.canReopen(publication.id),
                    onReopen: { reopen(publication.id) },
                    onRetry: {
                        Task {
                            guard await viewModel.retry(publication.id) else {
                                return FeedbackToastManager.shared.showError(UnsentPublicationsCopy.retryError)
                            }
                        }
                    },
                    onDelete: { deleteCandidate = publication }
                )
            }
            .listStyle(.plain)
            .refreshable { await viewModel.load() }
        }
    }

    private func reopen(_ id: String) {
        Task {
            switch await viewModel.reopen(id) {
            case .reopened:
                HapticFeedback.success()
                onReopen()
                dismiss()
            case .composerBusy:
                FeedbackToastManager.shared.showError(UnsentPublicationsCopy.composerBusy)
            case .alreadySending:
                FeedbackToastManager.shared.showError(UnsentPublicationsCopy.alreadySending)
            case .failed:
                FeedbackToastManager.shared.showError(UnsentPublicationsCopy.deleteError)
            }
        }
    }
}

enum UnsentPublicationsToast {
    static func deletion(_ verdict: PublicationCancellation) {
        switch verdict {
        case .removed, .cancelRequested: FeedbackToastManager.shared.showSuccess(UnsentPublicationsCopy.deleted)
        case .notFound: FeedbackToastManager.shared.showError(UnsentPublicationsCopy.alreadySent)
        case .failed: FeedbackToastManager.shared.showError(UnsentPublicationsCopy.deleteError)
        }
    }
}

/// Une publication en attente : vignette du premier média, extrait, état.
struct UnsentPublicationRow: View {
    let publication: UnsentPublication
    let canReopen: Bool
    let onReopen: () -> Void
    let onRetry: () -> Void
    let onDelete: () -> Void

    private var excerpt: String {
        let texte = publication.draft.content.trimmingCharacters(in: .whitespacesAndNewlines)
        return texte.isEmpty ? UnsentPublicationsCopy.typeLabel(publication.draft.type) : texte
    }

    private var stateLabel: String {
        switch publication.state {
        case .waiting: return UnsentPublicationsCopy.waiting
        case .sending: return UnsentPublicationsCopy.sending
        case .failed: return UnsentPublicationsCopy.failed
        }
    }

    private var stateColor: Color {
        publication.state == .failed ? MeeshyColors.error : Color.secondary
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            HStack(alignment: .top, spacing: MeeshySpacing.md) {
                UnsentPublicationThumbnail(url: publication.draft.localMediaURLs.first)
                VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                    Text(excerpt)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .lineLimit(2)
                    Text("\(UnsentPublicationsCopy.typeLabel(publication.draft.type)) · \(RelativeTimeFormatter.fullString(for: publication.draft.createdAt))")
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                        .foregroundStyle(Color.secondary)
                    Label(stateLabel, systemImage: publication.state == .failed ? "exclamationmark.triangle.fill" : "clock")
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .foregroundStyle(stateColor)
                    if publication.state == .failed {
                        Text(UnsentPublicationFailureReason(lastError: publication.lastError).message)
                            .font(MeeshyFont.relative(MeeshyFont.smallSize))
                            .foregroundStyle(Color.secondary)
                            .lineLimit(2)
                    }
                }
                Spacer(minLength: 0)
            }
            .accessibilityElement(children: .combine)
            actions
        }
        .padding(.vertical, MeeshySpacing.xs)
    }

    private var actions: some View {
        HStack(spacing: MeeshySpacing.sm) {
            if canReopen {
                Button(action: onReopen) {
                    Label(UnsentPublicationsCopy.reopen, systemImage: "square.and.pencil")
                        .frame(minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
            }
            if publication.state == .failed {
                Button(action: onRetry) {
                    Label(UnsentPublicationsCopy.retry, systemImage: "arrow.clockwise")
                        .frame(minHeight: 44)
                }
                .buttonStyle(.bordered)
            }
            Spacer(minLength: 0)
            Button(role: .destructive, action: onDelete) {
                Image(systemName: "trash")
                    .frame(minWidth: 44, minHeight: 44)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(UnsentPublicationsCopy.delete)
        }
        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
    }
}

/// La vignette du premier média encore sur l'appareil, décodée hors du fil
/// principal et à la taille de la case.
private struct UnsentPublicationThumbnail: View {
    let url: URL?
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: MeeshyRadius.sm).fill(Color.secondary.opacity(0.15))
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Image(systemName: url == nil ? "text.alignleft" : "photo")
                    .foregroundStyle(Color.secondary)
            }
        }
        .frame(width: 56, height: 56)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
        .accessibilityHidden(true)
        .task(id: url) {
            guard let url else { return }
            image = await Self.decode(url)
        }
    }

    @concurrent
    private static func decode(_ url: URL) async -> UIImage? {
        SceneImageDownsampling.image(fileAt: url, maxPixelSize: 168)
    }
}
