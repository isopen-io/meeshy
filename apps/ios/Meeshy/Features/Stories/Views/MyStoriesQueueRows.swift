import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Active Upload Row

/// Same `StoryViewModel.StoryUploadState` the tray's `StoryUploadOverlay`
/// renders as a circular badge, shown here as a list row. The badge is
/// purely informative (`.allowsHitTesting(false)`, directive 2026-08-01) —
/// this row is the ONLY surface carrying retry/cancel for an in-flight or
/// failed upload attempt.
struct ActiveUploadRow: View {
    let upload: StoryViewModel.StoryUploadState
    @ObservedObject var progress: StoryUploadProgressStore
    let onRetry: () -> Void
    let onCancel: () -> Void

    private var isFailed: Bool { upload.phase.isFailed }

    private var isWaiting: Bool { upload.phase.isWaiting }

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            Image(uiImage: upload.thumbnailImage)
                .resizable()
                .scaledToFill()
                .frame(width: 44, height: 44)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                        .stroke(isFailed ? MeeshyColors.error : MeeshyColors.indigo400, lineWidth: 1)
                )

            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                Text(StoryUploadPresentation.statusTitle(for: upload.phase))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                if !isFailed, !isWaiting {
                    Text("\(Int(progress.fraction(for: upload.id) * 100))%")
                        .font(MeeshyFont.relative(MeeshyFont.smallSize))
                        .foregroundStyle(Color.secondary)
                }
            }

            Spacer()

            if isFailed {
                Button(action: onRetry) {
                    Label(String(localized: "story.tray.retry", defaultValue: "Réessayer", bundle: .main), systemImage: "arrow.clockwise")
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                }
                .buttonStyle(.bordered)
                Button(role: .destructive, action: onCancel) {
                    Image(systemName: "xmark")
                }
                .buttonStyle(.bordered)
                .accessibilityLabel(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
            } else {
                ProgressView()
            }
        }
        .padding(.vertical, MeeshySpacing.xs)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Failed Story Row

/// One entry in the permanently-failed publish history
/// (`StoryPublishService.failedItems`). No rich thumbnail for the MVP — the
/// local media backing `item` is preserved on disk but decoding a preview
/// frame from it is a separate feature.
///
/// « Reprendre » (incrément 5) est l'action PRIMAIRE : convertir l'échec en
/// brouillon éditable est le seul chemin qui débloque un rejet serveur
/// déterministe (4xx) — rejouer le payload identique ré-échouera. Le retry
/// reste disponible en action secondaire (icône seule) pour les échecs
/// transitoires (réseau).
struct FailedStoryRow: View {
    let item: StoryPublishQueueItem
    let isResuming: Bool
    let onResume: () -> Void
    let onRetry: () -> Void

    private var relativeTime: String {
        RelativeTimeFormatter.fullString(for: item.createdAt)
    }

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            ZStack {
                Circle().fill(MeeshyColors.error.opacity(0.15))
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(MeeshyColors.error)
            }
            .frame(width: 44, height: 44)

            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                Text(String(localized: "story.mine.failed.title", defaultValue: "Story non publiée"))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                if let lastError = item.lastError {
                    Text(lastError)
                        .font(MeeshyFont.relative(MeeshyFont.smallSize))
                        .foregroundStyle(Color.secondary)
                        .lineLimit(2)
                }
                Text(relativeTime)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                    .foregroundStyle(Color.secondary)
            }

            Spacer()

            Button(action: onResume) {
                Label(MyStoriesView.resumeActionTitle, systemImage: "square.and.pencil")
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
            }
            .buttonStyle(.borderedProminent)
            .disabled(isResuming)

            Button(action: onRetry) {
                Image(systemName: "arrow.clockwise")
                    .font(MeeshyFont.relative(13, weight: .semibold))
            }
            .buttonStyle(.bordered)
            .accessibilityLabel(String(localized: "story.tray.retry", defaultValue: "Réessayer", bundle: .main))
        }
        .padding(.vertical, MeeshySpacing.xs)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            String(
                localized: "story.mine.failed.a11y",
                defaultValue: "Story non publiée, il y a \(relativeTime). \(item.lastError ?? "")"
            )
        )
    }
}
