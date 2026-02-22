import SwiftUI
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
                .font(.system(size: 12))
                .foregroundColor(Color(hex: attachment.thumbnailColor))

            Text(attachment.name)
                .font(.system(size: 12, weight: .medium))
                .lineLimit(1)
                .frame(maxWidth: 120)

            if let size = attachment.size {
                Text(formatFileSize(size))
                    .font(.system(size: 10))
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
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(mutedColor)
                    .frame(width: 18, height: 18)
                    .background(
                        Circle().fill(style == .dark ? Color.white.opacity(0.15) : theme.textMuted.opacity(0.15))
                    )
            }
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
            // File picker
            attachLadderButton(icon: "doc.fill", color: "45B7D1", delay: 0.04) {
                closeAttachMenu()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { onFilePicker?() }
            }
            // Location
            attachLadderButton(icon: "location.fill", color: "2ECC71", delay: 0.08) {
                closeAttachMenu()
                HapticFeedback.light()
                locationHelper.requestLocation()
                onLocationRequest?()
            }
            // Camera
            attachLadderButton(icon: "camera.fill", color: "F8B500", delay: 0.12) {
                closeAttachMenu()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { onCamera?() }
            }
            // Photo library
            attachLadderButton(icon: "photo.fill", color: "9B59B6", delay: 0.16) {
                closeAttachMenu()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { onPhotoLibrary?() }
            }
            // Voice recording
            attachLadderButton(icon: "mic.fill", color: "E74C3C", delay: 0.20) {
                closeAttachMenu()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { startRecording() }
            }
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
                    .font(.system(size: 16, weight: .semibold))
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
                .font(.system(size: showAttachOptions ? 16 : 20, weight: .semibold))
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
                .font(.system(size: 18))
                .foregroundColor(Color(hex: "9B59B6"))

            VStack(alignment: .leading, spacing: 2) {
                Text("Contenu du presse-papier")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(style == .dark ? .white : theme.textPrimary)

                Text(clip.truncatedPreview)
                    .font(.system(size: 10))
                    .foregroundColor(style == .dark ? .white.opacity(0.6) : theme.textSecondary)
                    .lineLimit(2)

                Text("\(clip.charCount) caract\u{00E8}res")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(Color(hex: "9B59B6"))
            }

            Spacer()

            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    clipboardContent = nil
                }
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 16))
                    .foregroundColor(Color(hex: "FF6B6B"))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(style == .dark ? Color.white.opacity(0.06) : Color.black.opacity(0.03))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color(hex: "9B59B6").opacity(0.3), lineWidth: 1)
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
