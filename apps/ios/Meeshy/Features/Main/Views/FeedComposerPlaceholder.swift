import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'entrée du composer en tête du fil iPad : son propre visage, le champ
/// « Partager quelque chose… » et le menu « + ». Toutes ses entrées ouvrent le
/// même composer (`onCompose`), sauf l'enregistrement audio (`onRecordAudio`).
struct FeedComposerPlaceholder: View {
    let onCompose: () -> Void
    let onRecordAudio: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            avatar
            promptButton
            addContentMenu
        }
        .padding(MeeshySpacing.lg)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.xl)
                .fill(theme.surfaceGradient(tint: MeeshyColors.brandPrimaryHex))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.xl)
                        .stroke(theme.border(tint: MeeshyColors.brandPrimaryHex, intensity: 0.25), lineWidth: 1)
                )
        )
        .padding(.horizontal, MeeshySpacing.lg)
    }

    /// Son propre visage devant « Quoi de neuf ? », avec son contour équipé (#10946).
    private var avatar: some View {
        MeeshyAvatar(
            name: getUserDisplayName(AuthManager.shared.currentUser, fallback: "M"),
            context: .custom(40),
            avatarURL: AuthManager.shared.currentUser?.avatar,
            ring: AuthManager.shared.currentUser?.profileDecor?.avatarRing
        )
        .accessibilityHidden(true)
    }

    private var promptButton: some View {
        Button(action: onCompose) {
            HStack {
                Text(String(localized: "feed.compose.subtitle", defaultValue: "Partager quelque chose avec le monde…"))
                    .font(.subheadline)
                    .foregroundColor(theme.textMuted)
                Spacer()
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.md)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.xl)
                    .fill(theme.inputBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.xl)
                            .stroke(theme.inputBorder, lineWidth: 1)
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
        .accessibilityLabel(String(localized: "a11y.feed.compose.open", defaultValue: "Partager quelque chose", bundle: .main))
        .accessibilityHint(String(localized: "a11y.feed.compose.open.hint", defaultValue: "Ouvre l'éditeur de publication", bundle: .main))
    }

    private var addContentMenu: some View {
        Menu {
            entry(String(localized: "feed.attach.photo-or-video", defaultValue: "Photo ou vidéo"), systemImage: "photo.fill", action: onCompose)
            entry(String(localized: "feed.attach.camera", defaultValue: "Appareil photo"), systemImage: "camera.fill", action: onCompose)
            entry(String(localized: "feed.attach.audio-recording", defaultValue: "Enregistrement audio"), systemImage: "mic.fill", action: onRecordAudio)
            entry(String(localized: "feed.attach.file-short", defaultValue: "Fichier"), systemImage: "doc.fill", action: onCompose)
            entry(String(localized: "feed.attach.location-short", defaultValue: "Position"), systemImage: "location.fill", action: onCompose)
        } label: {
            addContentBadge
        }
        .accessibilityLabel(String(localized: "feed.compose.add-content", defaultValue: "Ajouter du contenu"))
    }

    private func entry(_ title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
        }
    }

    private var addContentBadge: some View {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [MeeshyColors.indigo300, MeeshyColors.info],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 40, height: 40)
                .shadow(color: MeeshyColors.indigo300.opacity(0.4), radius: 8, y: 4)

            Image(systemName: "plus")
                // Doctrine 86i : glyphe du FAB dans un cercle de dimension fixe 40×40 → figé
                // (l'icône ne doit pas déborder du bouton flottant). Bouton déjà labellisé.
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(.white)
        }
    }
}
