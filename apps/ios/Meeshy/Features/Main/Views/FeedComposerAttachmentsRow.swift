import SwiftUI
import MeeshySDK
import MeeshyUI

/// La rangée des pièces en attente de `FeedComposerSheet` : tuiles en cours de
/// préparation, pièces prêtes et lieu choisi. Elle ne mute rien — chaque geste
/// remonte à la feuille par une closure.
struct FeedComposerAttachmentsRow: View {
    let preparingAttachments: [PreparingAttachment]
    let pendingAttachments: [MessageAttachment]
    let pendingPlace: SharedPlace?
    let pendingThumbnails: [String: UIImage]
    let onOpenThumbnail: (MessageAttachment) -> Void
    let onRemoveAttachment: (String) -> Void
    let onRemovePlace: () -> Void
    let onCancelPreparation: (PreparingAttachment) -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: MeeshySpacing.md) {
                ForEach(preparingAttachments) { prep in
                    AttachmentLoadingTile(prep: prep, size: 72) {
                        onCancelPreparation(prep)
                    }
                }
                ForEach(pendingAttachments) { attachment in
                    sheetAttachmentTile(attachment)
                }
                if let place = pendingPlace {
                    sheetPlaceTile(place)
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.smPlus)
        }
        .frame(height: 116)
    }

    private func sheetAttachmentTile(_ attachment: MessageAttachment) -> some View {
        VStack(spacing: MeeshySpacing.xs) {
            ZStack {
                if let thumb = pendingThumbnails[attachment.id] {
                    Button {
                        onOpenThumbnail(attachment)
                    } label: {
                        Image(uiImage: thumb)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 72, height: 72)
                            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
                    }
                    .buttonStyle(MeeshyPointerButtonStyle(shape: .roundedRect(cornerRadius: MeeshyRadius.sm)))
                    .accessibilityLabel(String(
                        localized: "conversation.composer.attachment.edit",
                        defaultValue: "Éditer \(MediaKindLabel.attachmentLabel(for: attachment))",
                        bundle: .main
                    ))

                    if attachment.type == .video {
                        Image(systemName: "play.circle.fill")
                            .font(.system(size: MeeshyIconSize.xxl))
                            .foregroundStyle(.white, .black.opacity(0.4))
                            .accessibilityHidden(true)
                    }
                } else {
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                        .fill(LinearGradient(colors: [Color(hex: attachment.thumbnailColor), Color(hex: attachment.thumbnailColor).opacity(0.7)], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 72, height: 72)
                        .overlay(
                            Image(systemName: attachment.type.composerGlyph)
                                .font(.system(size: 26))
                                .foregroundStyle(Color.white)
                                .accessibilityHidden(true)
                        )
                }
            }
            .frame(width: 72, height: 72)
            .overlay(alignment: .topTrailing) {
                Button {
                    HapticFeedback.light()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        onRemoveAttachment(attachment.id)
                    }
                } label: {
                    // Glyphe chrome dans un cadre de tap fixe 20×20 : figé (doctrine 82i) ; le libellé porte le sens
                    Image(systemName: "xmark")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(Color.white)
                        .frame(width: 20, height: 20)
                        .background(
                            Circle()
                                .fill(MeeshyColors.error)
                                .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                        )
                }
                .accessibilityLabel(String(localized: "feed.attachment.remove", defaultValue: "Retirer la pièce jointe", bundle: .main))
                .offset(x: 6, y: -6)
            }

            Text(MediaKindLabel.attachmentLabel(for: attachment))
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                .foregroundStyle(theme.textSecondary)
                .lineLimit(1)
                .frame(width: 72)
        }
    }

    /// Depuis la Task 11/12, un lieu choisi ne vit plus dans `pendingAttachments`
    /// — cette tuile dédiée (même gabarit 72×72 pin-drop) est ce qui évite que
    /// le choix d'un lieu ne produise plus aucun retour visuel ici.
    private func sheetPlaceTile(_ place: SharedPlace) -> some View {
        VStack(spacing: MeeshySpacing.xs) {
            ZStack {
                RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                    .fill(LinearGradient(colors: [MeeshyColors.success, MeeshyColors.successDeep], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 72, height: 72)
                    .overlay(
                        Image(systemName: "mappin.circle.fill")
                            .font(.system(size: 26))
                            .foregroundStyle(.white, .white.opacity(0.3))
                            .accessibilityHidden(true)
                    )
            }
            .frame(width: 72, height: 72)
            .overlay(alignment: .topTrailing) {
                Button {
                    HapticFeedback.light()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        onRemovePlace()
                    }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(Color.white)
                        .frame(width: 20, height: 20)
                        .background(
                            Circle()
                                .fill(MeeshyColors.error)
                                .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                        )
                }
                .accessibilityLabel(String(localized: "feed.attachment.remove", defaultValue: "Retirer la pièce jointe", bundle: .main))
                .offset(x: 6, y: -6)
            }

            Text(MediaKindLabel.placeLabel(place.name))
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                .foregroundStyle(theme.textSecondary)
                .lineLimit(1)
                .frame(width: 72)
        }
    }
}
