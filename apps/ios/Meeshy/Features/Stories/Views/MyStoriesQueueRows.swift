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
                    Image(systemName: "arrow.clockwise")
                        .font(MeeshyFont.relative(13, weight: .semibold))
                }
                .buttonStyle(.bordered)
                .accessibilityLabel(String(localized: "story.tray.retry", defaultValue: "Réessayer", bundle: .main))
            } else if !isWaiting {
                ProgressView()
            }
            if StoryUploadPresentation.offersCancelSend(upload.phase) {
                WaitingStoryCancelButton(onCancel: onCancel)
            }
        }
        .padding(.vertical, MeeshySpacing.xs)
        .accessibilityElement(children: .combine)
        .accessibilityAction(named: WaitingStoryCopy.cancel, onCancel)
    }
}

/// « Annuler l'envoi » — le même bouton pour une story en attente dans la
/// file et pour un envoi en cours d'essai qui attend ou a échoué (#14879).
struct WaitingStoryCancelButton: View {
    let onCancel: () -> Void

    var body: some View {
        Button(role: .destructive, action: onCancel) {
            Text(WaitingStoryCopy.cancel)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
        }
        .buttonStyle(.bordered)
        .frame(minHeight: 44)
        .accessibilityIdentifier("story.mine.waiting.cancel")
    }
}

// MARK: - Failed Story Row

/// One entry in the permanently-failed publish history
/// (`StoryPublishService.failedItems`), with the thumbnail of the media the
/// queue keeps on disk (#15095).
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
            StoryQueueThumbnailView(item: item, stroke: MeeshyColors.error) {
                ZStack {
                    Circle().fill(MeeshyColors.error.opacity(0.15))
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(MeeshyColors.error)
                }
            }

            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                Text(String(localized: "story.mine.failed.title", defaultValue: "Story non publiée"))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                if let lastError = StoryFailureText.display(item.lastError) {
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
                defaultValue: "Story non publiée, il y a \(relativeTime). \(StoryFailureText.display(item.lastError) ?? "")"
            )
        )
    }
}

// MARK: - Waiting Story Row

/// Une story EN ATTENTE d'envoi (#10331) — dans la file, que rien ne
/// téléverse en ce moment (hors ligne, ou relancée au prochain réseau).
/// « Annuler l'envoi » la retire : rien ne partira au retour du réseau.
struct WaitingStoryRow: View {
    let item: StoryPublishQueueItem
    let onCancel: () -> Void

    private var relativeTime: String {
        RelativeTimeFormatter.fullString(for: item.createdAt)
    }

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            StoryQueueThumbnailView(item: item, stroke: MeeshyColors.indigo400) {
                ZStack {
                    Circle().fill(Color.secondary.opacity(0.15))
                    Image(systemName: "clock.arrow.circlepath")
                        .foregroundStyle(Color.secondary)
                }
            }
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                Text(UnsentPublicationsCopy.waiting)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                Text(relativeTime)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                    .foregroundStyle(Color.secondary)
            }

            Spacer()

            WaitingStoryCancelButton(onCancel: onCancel)
        }
        .padding(.vertical, MeeshySpacing.xs)
        .accessibilityElement(children: .combine)
        .accessibilityAction(named: WaitingStoryCopy.cancel, onCancel)
    }
}

enum WaitingStoryCopy {
    static var cancel: String {
        UnsentPublicationsCopy.cancelSend
    }
}

/// **Ce qu'un échec de story DIT à l'auteur** (#14879) : la trace que la file
/// persiste est une donnée, pas un texte d'interface. Celles qu'on reconnaît
/// passent par le catalogue, dans la langue de l'interface.
enum StoryFailureText {
    static func display(_ lastError: String?) -> String? {
        guard let lastError else { return nil }
        guard lastError == StoryPublishQueue.missingLocalMediaError else { return lastError }
        return String(localized: "story.mine.failed.missingMedia", defaultValue: "Un média local est introuvable", bundle: .main)
    }
}

// MARK: - Vignette d'une story dans la file

/// **Une story en attente ou en échec se reconnaît à sa vignette** (#15095) :
/// le premier visuel que la file garde sur l'appareil, réduit à la taille de
/// la ligne. Sans visuel (story de texte) ou sans fichier lisible, l'icône
/// d'état de la ligne reste.
nonisolated enum StoryQueueThumbnail {
    static let side: CGFloat = 44

    static func source(in references: [StoryMediaReference]) -> StoryMediaReference? {
        references.first { $0.mediaType == "image" || $0.mediaType == "video" }
    }

    @concurrent
    static func image(for reference: StoryMediaReference, maxPixel: CGFloat) async -> UIImage? {
        let file = URL(fileURLWithPath: reference.localFilePath)
        guard FileManager.default.fileExists(atPath: file.path) else { return nil }
        if reference.mediaType == "video" {
            return try? await StoryMediaDecoder.firstFrame(of: file, maxDimension: maxPixel)
        }
        return ImageDownsampler.thumbnail(fileURL: file, maxPixelSize: maxPixel, decodeImmediately: true)
            .map(UIImage.init(cgImage:))
    }
}

struct StoryQueueThumbnailView<Fallback: View>: View {
    let item: StoryPublishQueueItem
    let stroke: Color
    @ViewBuilder let fallback: () -> Fallback

    @Environment(\.displayScale) private var displayScale
    @State private var thumbnail: UIImage?

    var body: some View {
        Group {
            if let thumbnail {
                Image(uiImage: thumbnail)
                    .resizable()
                    .scaledToFill()
                    .frame(width: StoryQueueThumbnail.side, height: StoryQueueThumbnail.side)
                    .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                            .stroke(stroke, lineWidth: 1)
                    )
                    .accessibilityIdentifier("story.mine.queue.thumbnail")
            } else {
                fallback()
                    .frame(width: StoryQueueThumbnail.side, height: StoryQueueThumbnail.side)
            }
        }
        .task(id: item.id) {
            guard let reference = StoryQueueThumbnail.source(in: item.mediaReferences) else { return }
            thumbnail = await StoryQueueThumbnail.image(for: reference, maxPixel: StoryQueueThumbnail.side * displayScale)
        }
    }
}
