import SwiftUI
import MeeshySDK
import MeeshyUI

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
                    // 157i : la tuile s'annonce comme un seul élément VoiceOver cohérent
                    // (« Photo, Compression… » / « Photo, Erreur ») au lieu d'exposer le
                    // spinner, le libellé d'étape et le nom de type en fragments séparés.
                    // Le bouton d'annulation reste un élément distinct (frère du ZStack).
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(kindLabel)
                    .accessibilityValue(stageAccessibilityValue)

                if let onCancel {
                    Button {
                        HapticFeedback.light()
                        onCancel()
                    } label: {
                        Image(systemName: "xmark")
                            // Doctrine 86i : glyphe d'annulation dans un cercle fixe 18×18 → figé.
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
                    .accessibilityLabel(String(localized: "attachment.loading.cancel-a11y", defaultValue: "Annuler le chargement", bundle: .main))
                }
            }

            Text(label)
                .font(MeeshyFont.relative(10, weight: .medium))
                .foregroundColor(ThemeManager.shared.textSecondary)
                .lineLimit(1)
                .frame(width: max(size, 60))
                // La tuile ci-dessus porte déjà le type + l'état pour VoiceOver.
                .accessibilityHidden(true)
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
            // Once the preview lands, keep the photo bright so it reads as
            // already present in the tray — the heavy compression / hashing
            // happens quietly behind a discreet corner spinner, not behind a
            // heavy dimming veil.
            Image(uiImage: thumb)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: size, height: size)
                .clipped()
                .overlay(
                    Color.black.opacity(prep.stage == .ready ? 0 : 0.12)
                )
        } else {
            Color(hex: prep.accentColor)
                .shimmer()
        }
    }

    @ViewBuilder
    private var loadingOverlay: some View {
        if prep.thumbnail != nil {
            // Image already visible — show only a small corner spinner so the
            // tile keeps reading as the selected photo, processing in the
            // background.
            ProgressView()
                .progressViewStyle(.circular)
                .tint(.white)
                .scaleEffect(0.7)
                .padding(5)
                .background(Circle().fill(Color.black.opacity(0.4)))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                .padding(4)
        } else {
            // No preview yet (bytes still loading) — full placeholder + label.
            VStack(spacing: 3) {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(.white)
                    .scaleEffect(0.75)
                Text(stageLabel)
                    // Doctrine 86i : label d'étape borné par la tuile de dimension fixe
                    // `size`×`size` (≈56) → figé (déjà `minimumScaleFactor` pour rétrécir).
                    .font(.system(size: 8, weight: .semibold))
                    .foregroundColor(.white.opacity(0.9))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .padding(.horizontal, 4)
            }
        }
    }

    @ViewBuilder
    private var failureOverlay: some View {
        VStack(spacing: 2) {
            Image(systemName: "exclamationmark.triangle.fill")
                // Doctrine 86i : glyphe d'erreur borné par la tuile fixe → figé ; décoratif
                // (le libellé « Erreur » adjacent porte le sens).
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.white)
                .accessibilityHidden(true)
            Text(String(localized: "attachment.loading.error", defaultValue: "Erreur", bundle: .main))
                // Doctrine 86i : label borné par la tuile de dimension fixe → figé.
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
                // Doctrine 86i : indicateur vidéo décoratif borné par la tuile fixe → figé + masqué.
                .font(.system(size: 20))
                .foregroundStyle(.white, .black.opacity(0.4))
                .accessibilityHidden(true)
        }
    }

    // MARK: - Labels

    private var label: String {
        if case .failed(let msg) = prep.stage, !msg.isEmpty { return msg }
        return kindLabel
    }

    /// Localized attachment-kind noun used both as the VoiceOver label and as the
    /// visible caption fallback (when not in a `.failed` state carrying a message).
    private var kindLabel: String {
        switch prep.kind {
        case .image: return String(localized: "attachment.kind.photo", defaultValue: "Photo", bundle: .main)
        case .video: return String(localized: "attachment.kind.video", defaultValue: "Video", bundle: .main)
        case .audio: return String(localized: "attachment.kind.audio", defaultValue: "Audio", bundle: .main)
        case .file:  return String(localized: "attachment.kind.file", defaultValue: "File", bundle: .main)
        case .location: return String(localized: "attachment.kind.location", defaultValue: "Location", bundle: .main)
        }
    }

    /// VoiceOver value announced after `kindLabel` — the current preparation stage
    /// (« Compression… », « Erreur »…). Empty when `.ready` so the tile simply reads
    /// as its kind once prepared.
    private var stageAccessibilityValue: String {
        if case .failed(let msg) = prep.stage {
            return msg.isEmpty
                ? String(localized: "attachment.loading.error", defaultValue: "Error", bundle: .main)
                : msg
        }
        return stageLabel
    }

    private var stageLabel: String {
        switch prep.stage {
        case .loading:      return String(localized: "attachment.stage.loading", defaultValue: "Loading", bundle: .main)
        case .compressing:  return String(localized: "attachment.stage.compressing", defaultValue: "Compressing", bundle: .main)
        case .thumbnailing: return String(localized: "attachment.stage.thumbnailing", defaultValue: "Preview", bundle: .main)
        case .hashing:      return String(localized: "attachment.stage.hashing", defaultValue: "Hash", bundle: .main)
        case .ready:        return ""
        case .failed:       return String(localized: "attachment.loading.error", defaultValue: "Error", bundle: .main)
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
