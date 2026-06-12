import SwiftUI
import MeeshyUI
import AVFoundation
import CoreLocation
import Combine

// MARK: - Extracted from UniversalComposerBar.swift

// ============================================================================
// MARK: - Attachment Views & Logic
// ============================================================================

extension UniversalComposerBar {

    // MARK: - Attachments Preview

    var attachmentsPreview: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(allAttachments) { attachment in
                    attachmentChip(attachment)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
        }
    }

    func attachmentChip(_ attachment: ComposerAttachment) -> some View {
        HStack(spacing: 6) {
            // Type icon
            Image(systemName: iconForType(attachment.type))
                .font(.caption)
                .foregroundColor(Color(hex: attachment.thumbnailColor))

            Text(attachment.name)
                .font(.caption.weight(.medium))
                .lineLimit(1)
                .frame(maxWidth: 120)

            if let size = attachment.size {
                Text(formatFileSize(size))
                    .font(.caption2)
                    .opacity(0.6)
            }

            // Remove button
            Button {
                HapticFeedback.light()
                withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) {
                    attachments.removeAll { $0.id == attachment.id }
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.caption2.weight(.bold))
                    .foregroundColor(mutedColor)
                    .frame(width: 18, height: 18)
                    .background(
                        Circle().fill(style == .dark ? Color.white.opacity(0.15) : theme.textMuted.opacity(0.15))
                    )
            }
            .accessibilityLabel(String(localized: "composer.a11y.removeAttachment", defaultValue: "Retirer la pi\u{00E8}ce jointe", bundle: .main))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(style == .dark ? Color.white.opacity(0.12) : theme.inputBackground)
                .overlay(
                    Capsule()
                        .stroke(
                            style == .dark ? Color.white.opacity(0.15) : theme.textMuted.opacity(0.2),
                            lineWidth: 0.5
                        )
                )
        )
        .foregroundColor(style == .dark ? .white : theme.textPrimary)
    }

    // MARK: - Attachment Ladder

    var attachmentLadder: some View {
        VStack(spacing: 8) {
            // Emoji picker
            attachLadderButton(icon: "face.smiling.fill", color: "FF9F43", delay: 0.0) {
                closeAttachMenu()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                    onRequestTextEmoji?()
                }
            }
            .accessibilityLabel(String(localized: "composer.a11y.emojiPicker", defaultValue: "Ouvrir le s\u{00E9}lecteur d'emojis", bundle: .main))
            // File picker
            attachLadderButton(icon: "doc.fill", color: "45B7D1", delay: 0.04) {
                closeAttachMenu()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { onFilePicker?() }
            }
            .accessibilityLabel(String(localized: "composer.a11y.filePicker", defaultValue: "Joindre un fichier", bundle: .main))
            // Location
            attachLadderButton(icon: "location.fill", color: "2ECC71", delay: 0.08) {
                closeAttachMenu()
                HapticFeedback.light()
                onLocationRequest?()
            }
            .accessibilityLabel(String(localized: "composer.a11y.shareLocation", defaultValue: "Partager ma position", bundle: .main))
            // Camera
            attachLadderButton(icon: "camera.fill", color: "F8B500", delay: 0.12) {
                closeAttachMenu()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { onCamera?() }
            }
            .accessibilityLabel(String(localized: "composer.a11y.camera", defaultValue: "Prendre une photo", bundle: .main))
            // Photo library
            attachLadderButton(icon: "photo.fill", color: "9B59B6", delay: 0.16) {
                closeAttachMenu()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { onPhotoLibrary?() }
            }
            .accessibilityLabel(String(localized: "composer.a11y.photoLibrary", defaultValue: "Choisir dans la phototh\u{00E8}que", bundle: .main))
            // Voice recording
            attachLadderButton(icon: "mic.fill", color: "E74C3C", delay: 0.20) {
                closeAttachMenu()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { startRecording() }
            }
            .accessibilityLabel(String(localized: "composer.a11y.startRecording", defaultValue: "Enregistrer un message vocal", bundle: .main))
        }
        .padding(.bottom, 52)
    }

    func attachLadderButton(icon: String, color: String, delay: Double, action: @escaping () -> Void) -> some View {
        Button(action: {
            onAnyInteraction?()
            HapticFeedback.light()
            action()
        }) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: color), Color(hex: color).opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 42, height: 42)
                    .shadow(color: Color(hex: color).opacity(0.45), radius: 8, y: 3)

                Image(systemName: icon)
                    .font(.callout.weight(.semibold))
                    .foregroundColor(.white)
            }
        }
        .menuAnimation(showMenu: showAttachOptions, delay: delay)
    }

    // MARK: - Attach Button

    var attachButton: some View {
        let accent = Color(hex: accentColor)
        let iconColor = style == .dark ? Color.white.opacity(0.7) : accent
        let bgFill = style == .dark ? Color.white.opacity(0.1) : accent.opacity(0.1)
        let borderColor = style == .dark ? Color.white.opacity(0.2) : accent.opacity(0.2)

        return Button(action: {
            onAnyInteraction?()
            let impact = UIImpactFeedbackGenerator(style: .light)
            impact.impactOccurred()
            if showAttachOptions {
                closeAttachMenu()
            } else {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                    attachRotation += 90
                }
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showAttachOptions = true
                }
            }
        }) {
            Image(systemName: showAttachOptions ? "xmark" : "plus")
                .font((showAttachOptions ? Font.callout : Font.title3).weight(.semibold))
                .foregroundColor(iconColor)
                .rotationEffect(.degrees(showAttachOptions ? 0 : attachRotation))
                .frame(width: 44, height: 44)
                .background(
                    Circle()
                        .fill(bgFill)
                        .overlay(
                            Circle()
                                .stroke(borderColor, lineWidth: 1)
                        )
                )
                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: showAttachOptions)
        }
        .accessibilityLabel(showAttachOptions
            ? String(localized: "composer.a11y.closeAttachMenu", defaultValue: "Fermer le menu des pi\u{00E8}ces jointes", bundle: .main)
            : String(localized: "composer.a11y.openAttachMenu", defaultValue: "Ouvrir le menu des pi\u{00E8}ces jointes", bundle: .main))
    }

    // MARK: - Close Attach Menu

    func closeAttachMenu() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            showAttachOptions = false
        }
    }

    // MARK: - Clipboard Content Handling

    func handleClipboardCheck(_ newText: String) {
        // Detect if a paste of 2000+ chars just happened
        let delta = newText.count - (text.count - (newText.count - text.count))
        if newText.count > 2000 && delta > 500 {
            // Likely a paste — create clipboard content
            let clip = ClipboardContent(text: newText)
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                clipboardContent = clip
            }
            // Clear the text field since it's now an attachment
            DispatchQueue.main.async {
                text = ""
            }
            onClipboardContent?(clip)
            HapticFeedback.medium()
        }
    }

    func clipboardContentPreview(_ clip: ClipboardContent) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "doc.plaintext.fill")
                .font(.body)
                .foregroundColor(MeeshyColors.indigo500)

            VStack(alignment: .leading, spacing: 2) {
                Text(String(localized: "composer.clipboard.title", defaultValue: "Contenu du presse-papier", bundle: .main))
                    .font(.caption2.weight(.bold))
                    .foregroundColor(style == .dark ? .white : theme.textPrimary)

                Text(clip.truncatedPreview)
                    .font(.caption2)
                    .foregroundColor(style == .dark ? .white.opacity(0.6) : theme.textSecondary)
                    .lineLimit(2)

                Text(String(localized: "composer.clipboard.charCount", defaultValue: "\(clip.charCount) caract\u{00E8}res", bundle: .main))
                    .font(.caption2.weight(.medium))
                    .foregroundColor(MeeshyColors.indigo500)
            }

            Spacer()

            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    clipboardContent = nil
                }
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.callout)
                    .foregroundColor(MeeshyColors.error)
            }
            .accessibilityLabel(String(localized: "composer.a11y.removeClipboardContent", defaultValue: "Retirer le contenu du presse-papier", bundle: .main))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(style == .dark ? Color.white.opacity(0.06) : Color.black.opacity(0.03))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(MeeshyColors.indigo500.opacity(0.3), lineWidth: 1)
                )
        )
        .padding(.horizontal, 12)
        .padding(.bottom, 4)
    }

    // MARK: - Helpers

    func iconForType(_ type: ComposerAttachmentType) -> String {
        switch type {
        case .voice: return "mic.fill"
        case .location: return "location.fill"
        case .image: return "photo.fill"
        case .file: return "doc.fill"
        case .video: return "video.fill"
        }
    }

    func formatFileSize(_ bytes: Int) -> String {
        if bytes < 1024 { return "\(bytes) B" }
        if bytes < 1024 * 1024 { return String(format: "%.1f KB", Double(bytes) / 1024) }
        return String(format: "%.1f MB", Double(bytes) / Double(1024 * 1024))
    }
}
