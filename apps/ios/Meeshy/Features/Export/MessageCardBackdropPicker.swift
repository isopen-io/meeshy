import SwiftUI
import PhotosUI
import AVFoundation
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

/// **LE FOND CHOISI D'UNE CARTE « IMAGER »** (#18672) — une photo ou une vidéo
/// de la photothèque, copiée sur l'appareil : sa première image peint
/// l'aperçu et l'image fixe, son fichier anime le GIF, la vidéo et la vidéo
/// qui défile. Rien ne quitte l'appareil.
nonisolated struct MessageCardChosenBackdrop: Equatable, Sendable {
    let token: UUID
    let media: MessageCardMedia
    /// La première image, portée comme les pixels des médias de la carte.
    private let still: MessageCardPictures
    /// Le fichier d'une vidéo, dans le `tmp` de l'app — `nil` pour une photo.
    let videoFile: URL?
    var veil: Double

    init(token: UUID, media: MessageCardMedia, poster: CGImage, videoFile: URL?, veil: Double) {
        self.token = token
        self.media = media
        self.still = MessageCardPictures([MessageCardBackdrop.mediaID: poster])
        self.videoFile = videoFile
        self.veil = veil
    }

    var poster: CGImage? { still.images[MessageCardBackdrop.mediaID] }

    var backdrop: MessageCardBackdrop { MessageCardBackdrop(media: media, veil: veil) }
    var isVideo: Bool { videoFile != nil }
    /// Ce qui repeint l'aperçu : un autre fond, ou un autre voile.
    var key: String { "\(token.uuidString)@\(Int((veil * 100).rounded()))" }

    static func == (lhs: MessageCardChosenBackdrop, rhs: MessageCardChosenBackdrop) -> Bool {
        lhs.token == rhs.token && lhs.veil == rhs.veil
    }

    func discard() {
        guard let videoFile else { return }
        PickedMediaStaging.discard(videoFile)
    }
}

/// Charge l'élément choisi HORS du MainActor : une photo réduite à 2 048 px,
/// ou une vidéo copiée avec sa première image, sa durée et son rapport.
nonisolated enum MessageCardBackdropLoader {
    static let maxPixels = 2048

    static func load(_ item: PhotosPickerItem, veil: Double) async -> MessageCardChosenBackdrop? {
        let isVideo = item.supportedContentTypes.contains { $0.conforms(to: .movie) }
        if isVideo, let file = try? await PickedMedia.loadVideoFile(item) {
            guard let chosen = await video(file, veil: veil) else {
                PickedMediaStaging.discard(file)
                return nil
            }
            return chosen
        }
        guard let data = try? await PickedMedia.loadImageData(item), let image = downsampled(data) else { return nil }
        let media = MessageCardMedia(id: MessageCardBackdrop.mediaID, kind: .image, aspect: Double(image.width) / Double(max(1, image.height)))
        return MessageCardChosenBackdrop(token: UUID(), media: media, poster: image, videoFile: nil, veil: veil)
    }

    private static func video(_ file: URL, veil: Double) async -> MessageCardChosenBackdrop? {
        let asset = AVURLAsset(url: file)
        let request = VideoThumbnailRequest.firstFrame(of: file, maxDimension: CGFloat(maxPixels), cachesResult: false)
        guard let poster = await VideoThumbnailGenerator.shared.image(for: request)?.cgImage else { return nil }
        let duration = (try? await asset.load(.duration)).map(CMTimeGetSeconds)
        let media = MessageCardMedia(
            id: MessageCardBackdrop.mediaID, kind: .video,
            aspect: Double(poster.width) / Double(max(1, poster.height)),
            duration: duration
        )
        return MessageCardChosenBackdrop(token: UUID(), media: media, poster: poster, videoFile: file, veil: veil)
    }

    private static func downsampled(_ data: Data) -> CGImage? {
        ImageDownsampler.thumbnail(data: data, maxPixelSize: CGFloat(maxPixels), decodeImmediately: false)
    }
}

/// La rangée « Fond » du plateau : choisir une photo ou une vidéo, régler son
/// voile, la retirer. Les palettes restent dessous : elles teintent le voile.
struct MessageCardBackdropPanel: View {
    let chosen: MessageCardChosenBackdrop?
    let loading: Bool
    @Binding var item: PhotosPickerItem?
    let onVeil: @MainActor @Sendable (Double) -> Void
    let onRemove: () -> Void
    /// Recadrer le fond choisi (#18810) — `nil` tant que la carte ne le peint pas encore.
    var onCrop: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            PhotosPicker(selection: $item, matching: .any(of: [.images, .videos]), preferredItemEncoding: .current,
                         photoLibrary: .shared()) { [chosen, loading] in
                MessageCardBackdropThumb(chosen: chosen, loading: loading)
            }
            .buttonStyle(MessageCardPressStyle())
            .accessibilityLabel(chosen == nil
                ? MessageCardExportText.text("export.card.backdrop.pick", "Photo ou vidéo en fond")
                : MessageCardExportText.text("export.card.backdrop.change", "Changer le fond"))
            if let chosen {
                VStack(alignment: .leading, spacing: 2) {
                    Text(MessageCardExportText.text("export.card.backdrop.veil", "Voile"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Slider(value: Binding(get: { chosen.veil }, set: onVeil), in: MessageCardBackdrop.veilRange)
                        .accessibilityLabel(MessageCardExportText.text("export.card.backdrop.veil", "Voile"))
                }
                if let onCrop {
                    Button(action: onCrop) {
                        Image(systemName: "crop")
                            .font(.title3)
                            .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.primary)
                    .accessibilityLabel(MessageCardExportText.text("export.card.crop", "Recadrer"))
                    .accessibilityIdentifier("export.card.backdrop.crop")
                }
                Button {
                    HapticFeedback.light()
                    onRemove()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title3)
                        .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .accessibilityLabel(MessageCardExportText.text("export.card.backdrop.remove", "Retirer le fond"))
            } else {
                Text(MessageCardExportText.text("export.card.backdrop.pick", "Photo ou vidéo en fond"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
    }
}

/// La vignette du fond : `PhotosPicker` construit son libellé dans une
/// fermeture `@Sendable` non isolée, d'où l'`init` non isolé.
private struct MessageCardBackdropThumb: View {
    let chosen: MessageCardChosenBackdrop?
    let loading: Bool

    nonisolated init(chosen: MessageCardChosenBackdrop?, loading: Bool) {
        self.chosen = chosen
        self.loading = loading
    }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous)
                .fill(Color.primary.opacity(0.07))
            if let chosen, let poster = chosen.poster {
                Image(decorative: poster, scale: 1)
                    .resizable()
                    .scaledToFill()
                if chosen.isVideo {
                    Image(systemName: "play.fill").font(.caption2).foregroundStyle(.white).shadow(radius: 2)
                }
            } else if loading {
                ProgressView()
            } else {
                Image(systemName: "photo.badge.plus").font(.title3).foregroundStyle(.primary)
            }
        }
        .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous))
    }
}
