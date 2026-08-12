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
                }
            }

            Text(label)
                .font(MeeshyFont.relative(10, weight: .medium))
                .foregroundColor(ThemeManager.shared.textSecondary)
                .lineLimit(1)
                .frame(width: max(size, 60))
        }
        .animation(.easeInOut(duration: 0.2), value: stageKey)
        // VoiceOver reads the tile as ONE element: the media kind is the label
        // and the preparation stage is the value, so the spinner, terse on-tile
        // glyph labels and decorative icons no longer fragment into separate
        // swipes. `.updatesFrequently` makes VoiceOver re-announce the value on
        // refocus as the stage advances (loading → compressing → …). Cancel is a
        // rotor action so it no longer relies on hitting the 18pt corner button.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(kindLabel)
        .accessibilityValue(accessibilityStageValue)
        .accessibilityAddTraits(isPreparing ? .updatesFrequently : [])
        .accessibilityActions {
            if let onCancel {
                Button(String(localized: "attachment.loading.cancel-a11y", defaultValue: "Annuler le chargement", bundle: .main)) {
                    HapticFeedback.light()
                    onCancel()
                }
            }
        }
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

    /// Media kind, independent of stage — used both as the on-tile fallback
    /// label and as the VoiceOver accessibility label (which must stay the
    /// media kind even in the `.failed` state, where the error goes to value).
    private var kindLabel: String {
        switch prep.kind {
        case .image: return String(localized: "attachment.kind.photo", defaultValue: "Photo", bundle: .main)
        case .video: return String(localized: "attachment.kind.video", defaultValue: "Video", bundle: .main)
        case .audio: return String(localized: "attachment.kind.audio", defaultValue: "Audio", bundle: .main)
        case .file:  return String(localized: "attachment.kind.file", defaultValue: "File", bundle: .main)
        case .location: return String(localized: "attachment.kind.location", defaultValue: "Location", bundle: .main)
        }
    }

    // MARK: - Accessibility

    /// Preparation stage as a full VoiceOver phrase (the on-tile `stageLabel`
    /// is terse — "Preview", "Hash" — to fit the 56pt tile; VoiceOver gets the
    /// unabbreviated wording instead). Read as the accessibility *value* so it
    /// pairs with `kindLabel` → "Photo, Compressing".
    private var accessibilityStageValue: String {
        switch prep.stage {
        case .loading:
            return String(localized: "attachment.loading.a11y-loading", defaultValue: "Chargement en cours", bundle: .main)
        case .compressing:
            return String(localized: "attachment.loading.a11y-compressing", defaultValue: "Compression en cours", bundle: .main)
        case .thumbnailing:
            return String(localized: "attachment.loading.a11y-thumbnailing", defaultValue: "Génération de l'aperçu", bundle: .main)
        case .hashing:
            return String(localized: "attachment.loading.a11y-hashing", defaultValue: "Finalisation", bundle: .main)
        case .ready:
            return String(localized: "attachment.loading.a11y-ready", defaultValue: "Prêt", bundle: .main)
        case .failed(let message):
            let base = String(localized: "attachment.loading.a11y-failed", defaultValue: "Échec du chargement", bundle: .main)
            return message.isEmpty ? base : "\(base) — \(message)"
        }
    }

    /// True while the attachment is still moving toward a terminal state, so
    /// VoiceOver keeps the `.updatesFrequently` trait and re-announces stage
    /// changes on refocus. Cleared on `.ready` / `.failed`.
    private var isPreparing: Bool {
        switch prep.stage {
        case .ready, .failed: return false
        default: return true
        }
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
