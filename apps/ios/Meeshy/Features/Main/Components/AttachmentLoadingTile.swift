import SwiftUI
import MeeshySDK

/// Loading tile shown in the composer tray while an attachment is being
/// prepared (image decoded, video compressed, thumbnail extracted, ThumbHash
/// computed). Renders the same way for messages, posts and stories so the
/// preparation feedback is uniform across surfaces.
///
/// Lifecycle is driven by the upstream `PreparingAttachment`:
/// - `.loading` / `.compressing` / `.thumbnailing` / `.hashing` → spinner + label
/// - `.failed` → red badge with retry-or-dismiss affordance
/// - `.ready` → the tile is normally replaced by the caller's regular preview;
///   if it is still on screen, the final thumbnail is displayed without overlay.
struct AttachmentLoadingTile: View {
    @ObservedObject var prep: PreparingAttachment
    var size: CGFloat = 56
    var cornerRadius: CGFloat = 10
    var onCancel: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 4) {
            ZStack(alignment: .topTrailing) {
                tileBody
                    .frame(width: size, height: size)
                    .clipShape(RoundedRectangle(cornerRadius: cornerRadius))

                if let onCancel {
                    Button {
                        HapticFeedback.light()
                        onCancel()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 18, height: 18)
                            .background(
                                Circle()
                                    .fill(MeeshyColors.error)
                                    .shadow(color: MeeshyColors.error.opacity(0.4), radius: 3, y: 1)
                            )
                    }
                    .offset(x: 5, y: -5)
                    .accessibilityLabel("Annuler le chargement")
                }
            }

            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(ThemeManager.shared.textSecondary)
                .lineLimit(1)
                .frame(width: max(size, 60))
        }
        .animation(.easeInOut(duration: 0.2), value: stageKey)
    }

    // MARK: - Tile body

    @ViewBuilder
    private var tileBody: some View {
        ZStack {
            background

            switch prep.stage {
            case .failed:
                failureOverlay
            case .ready:
                readyOverlay
            default:
                loadingOverlay
            }
        }
    }

    @ViewBuilder
    private var background: some View {
        if let thumb = prep.thumbnail {
            Image(uiImage: thumb)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: size, height: size)
                .clipped()
                .overlay(
                    Color.black.opacity(prep.stage == .ready ? 0 : 0.35)
                )
        } else {
            Color(hex: prep.accentColor)
                .shimmer()
        }
    }

    @ViewBuilder
    private var loadingOverlay: some View {
        VStack(spacing: 3) {
            ProgressView()
                .progressViewStyle(.circular)
                .tint(.white)
                .scaleEffect(0.75)
            Text(stageLabel)
                .font(.system(size: 8, weight: .semibold))
                .foregroundColor(.white.opacity(0.9))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.horizontal, 4)
        }
    }

    @ViewBuilder
    private var failureOverlay: some View {
        VStack(spacing: 2) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.white)
            Text("Erreur")
                .font(.system(size: 8, weight: .semibold))
                .foregroundColor(.white)
        }
        .padding(6)
        .background(
            RoundedRectangle(cornerRadius: cornerRadius)
                .fill(MeeshyColors.error.opacity(0.65))
        )
    }

    @ViewBuilder
    private var readyOverlay: some View {
        if prep.kind == .video {
            Image(systemName: "play.circle.fill")
                .font(.system(size: 20))
                .foregroundStyle(.white, .black.opacity(0.4))
        }
    }

    // MARK: - Labels

    private var label: String {
        if case .failed(let msg) = prep.stage, !msg.isEmpty { return msg }
        switch prep.kind {
        case .image: return "Photo"
        case .video: return "Vidéo"
        case .audio: return "Audio"
        case .file:  return "Fichier"
        case .location: return "Position"
        }
    }

    private var stageLabel: String {
        switch prep.stage {
        case .loading:      return "Chargement"
        case .compressing:  return "Compression"
        case .thumbnailing: return "Aperçu"
        case .hashing:      return "Hash"
        case .ready:        return ""
        case .failed:       return "Erreur"
        }
    }

    private var stageKey: String {
        switch prep.stage {
        case .loading:      return "loading"
        case .compressing:  return "compressing"
        case .thumbnailing: return "thumbnailing"
        case .hashing:      return "hashing"
        case .ready:        return "ready"
        case .failed:       return "failed"
        }
    }
}
