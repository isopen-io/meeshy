import SwiftUI
import MeeshySDK
import MeeshyUI

// Extrait de `ConversationInfoSheet.swift` (1 267 lignes, hors budget) : la
// directive de taille interdit d'ajouter à un fichier hors budget, et #8103
// devait y brancher l'écran « Médias, liens et documents ». Responsabilité
// tenue ici : les messages ÉPINGLÉS — l'aperçu au-dessus des onglets et la
// feuille qui les liste tous. Rien d'autre.
//
// Membres de l'hôte ouverts (`private` → interne) pour cette extension :
// `pinnedMessages`, `showAllPinnedMessages`, `appearAnimation`, `theme`,
// `isDark`, `accent`, `attachmentIcon(_:)`, `attachmentLabel(_:)`,
// `relativeTime(from:)`.

extension ConversationInfoSheet {

    // MARK: - Pinned Preview (before tabs)

    @ViewBuilder
    var pinnedPreview: some View {
        let pinned = pinnedMessages
        if !pinned.isEmpty {
            Button {
                HapticFeedback.light()
                showAllPinnedMessages = true
            } label: {
                VStack(spacing: 0) {
                    ForEach(pinned.prefix(2)) { msg in
                        pinnedPreviewRow(msg)
                    }
                    if pinned.count > 2 {
                        HStack(spacing: 4) {
                            Text(String(format: String(localized: "conversation.info.pinned.see-all", defaultValue: "Voir les %d messages épinglés", bundle: .main), pinned.count))
                                .font(MeeshyFont.relative(11, weight: .semibold))
                                .foregroundColor(accent)
                            Image(systemName: "chevron.forward")
                                .font(MeeshyFont.relative(9, weight: .bold))
                                .foregroundColor(accent)
                        }
                        .padding(.vertical, 6)
                    }
                }
                .padding(.vertical, 4)
                .padding(.horizontal, 14)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(accent.opacity(isDark ? 0.08 : 0.05))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(accent.opacity(0.12), lineWidth: 1)
                )
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
            .opacity(appearAnimation ? 1 : 0)
            .animation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.04), value: appearAnimation)
        }
    }

    func pinnedPreviewRow(_ msg: Message) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "pin.fill")
                .font(MeeshyFont.relative(10, weight: .semibold))
                .foregroundColor(accent)
                .rotationEffect(.degrees(45))

            Text(msg.senderName ?? "?")
                .font(MeeshyFont.relative(12, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .lineLimit(1)

            if !msg.content.isEmpty {
                Text(msg.content)
                    .font(MeeshyFont.relative(12))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            } else if let att = msg.attachments.first {
                HStack(spacing: 3) {
                    Image(systemName: attachmentIcon(att.type))
                        .font(MeeshyFont.relative(9))
                    Text(attachmentLabel(att.type))
                        .font(MeeshyFont.relative(11, weight: .medium))
                }
                .foregroundColor(theme.textMuted)
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, 7)
    }

    // MARK: - All Pinned Messages Sheet

    var allPinnedMessagesSheet: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(pinnedMessages) { msg in
                        fullPinnedRow(msg)
                        if msg.id != pinnedMessages.last?.id {
                            Divider()
                                .padding(.horizontal, 20)
                        }
                    }
                }
                .padding(.top, 8)
            }
            .background(theme.backgroundPrimary)
            .navigationTitle(String(localized: "conversation.info.pinned.title", defaultValue: "Messages épinglés", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showAllPinnedMessages = false
                    } label: {
                        Image(systemName: "xmark")
                            .font(MeeshyFont.relative(10, weight: .bold))
                            .foregroundColor(theme.textMuted)
                            .frame(width: 28, height: 28)
                            .background(Circle().fill(theme.textMuted.opacity(0.12)))
                    }
                    .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
                }
            }
        }
        .presentationDragIndicator(.visible)
    }

    func fullPinnedRow(_ msg: Message) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(accent.opacity(isDark ? 0.2 : 0.12))
                    .frame(width: 36, height: 36)

                Image(systemName: "pin.fill")
                    .font(MeeshyFont.relative(14, weight: .semibold))
                    .foregroundColor(accent)
                    .rotationEffect(.degrees(45))
            }

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Text(msg.senderName ?? "?")
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundColor(theme.textPrimary)

                    MetaSeparator()
                        .foregroundColor(theme.textMuted)

                    Text(relativeTime(from: msg.createdAt))
                        .font(MeeshyFont.relative(11, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }

                if !msg.content.isEmpty {
                    Text(msg.content)
                        .font(MeeshyFont.relative(13))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(4)
                } else if let att = msg.attachments.first {
                    HStack(spacing: 4) {
                        Image(systemName: attachmentIcon(att.type))
                            .font(MeeshyFont.relative(10))
                        Text(attachmentLabel(att.type))
                            .font(MeeshyFont.relative(12, weight: .medium))
                    }
                    .foregroundColor(accent)
                }
            }

            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }
}
