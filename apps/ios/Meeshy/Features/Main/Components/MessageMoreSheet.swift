import SwiftUI
import MeeshySDK
import MeeshyUI

/// Feuille « Plus… » — grille de pastilles colorées sur surface Liquid Glass,
/// avec contenu d'exploration inline sous la grille. Reprend l'esthétique de
/// l'ancien menu détaillé (`MessageDetailSheet.unifiedGrid`), verre iOS 26.
/// Réutilise les vues MessageDetail comme contenu inline. 100 % design système.
struct MessageMoreSheet: View {
    let message: Message
    let contactColor: String
    let conversationId: String
    let sections: [MoreSection]
    var initialItem: MoreItem? = nil
    var textTranslations: [MessageTranslation] = []
    var transcription: MessageTranscription? = nil
    var translatedAudios: [MessageTranslatedAudio] = []
    var editRevisions: [EditRevision] = []
    var onReply: (() -> Void)? = nil
    var onForward: (() -> Void)? = nil
    var onThread: (() -> Void)? = nil
    var onDeleteMedia: (() -> Void)? = nil
    var onSelectTranslation: ((MessageTranslation?) -> Void)? = nil
    var onSelectAudioLanguage: ((String?) -> Void)? = nil
    var onReport: ((String, String?) -> Void)? = nil

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @State private var selectedItem: MoreItem?
    @State private var gridAppeared = false
    /// Confirmation avant suppression d'un média — action destructive, JAMAIS
    /// de suppression directe (feedback device 2026-07-14).
    @State private var showDeleteMediaConfirm = false

    private var theme: ThemeManager { ThemeManager.shared }
    private var isDark: Bool { colorScheme == .dark }
    private var accent: Color { Color(hex: contactColor) }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 16) {
                    glassGridCard
                        .padding(.horizontal, 14)
                        .padding(.top, 8)

                    if let selectedItem, isExploration(selectedItem) {
                        inlineContent(for: selectedItem)
                            .id(selectedItem)
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    }
                }
                .padding(.bottom, 24)
            }
            .animation(.easeInOut(duration: 0.2), value: selectedItem)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(theme.backgroundPrimary)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .onAppear {
            if let initialItem, isExploration(initialItem) { selectedItem = initialItem }
            withAnimation(.spring(response: 0.5, dampingFraction: 0.7).delay(0.1)) {
                gridAppeared = true
            }
        }
        .confirmationDialog(
            String(localized: "message-more.delete_media.confirm.title", defaultValue: "Supprimer ce média ?", bundle: .main),
            isPresented: $showDeleteMediaConfirm,
            titleVisibility: .visible
        ) {
            Button(String(localized: "action.delete_media", defaultValue: "Supprimer le média", bundle: .main), role: .destructive) {
                onDeleteMedia?()
                dismiss()
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) { }
        } message: {
            Text(String(localized: "message-more.delete_media.confirm.message", defaultValue: "Cette action est irréversible.", bundle: .main))
        }
    }

    // MARK: - Glass Grid Card

    private var glassGridCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(Array(sections.enumerated()), id: \.offset) { _, section in
                sectionGrid(for: section)
            }
        }
        .padding(.vertical, 16)
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity)
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 20, style: .continuous), tint: accent.opacity(0.14))
        .shadow(color: accent.opacity(0.12), radius: 12, x: 0, y: 4)
        .shadow(color: .black.opacity(0.14), radius: 18, x: 0, y: 8)
    }

    @ViewBuilder
    private func sectionGrid(for section: MoreSection) -> some View {
        switch section {
        case .actions(let items):
            pelletSubGrid(title: String(localized: "message-more.section.actions", defaultValue: "Actions", bundle: .main), items: items)
        case .info(let items):
            pelletSubGrid(title: String(localized: "message-more.section.info", defaultValue: "Infos & Prisme", bundle: .main), items: items)
        case .moderation(let items):
            pelletSubGrid(title: String(localized: "message-more.section.moderation", defaultValue: "Modération", bundle: .main), items: items)
        }
    }

    @ViewBuilder
    private func pelletSubGrid(title: String, items: [MoreItem]) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(title)
                    .font(.caption2.weight(.semibold))
                    .textCase(.uppercase)
                    .foregroundColor(theme.textMuted)
                    .padding(.horizontal, 4)

                let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 5)
                LazyVGrid(columns: columns, spacing: 8) {
                    ForEach(Array(items.enumerated()), id: \.element) { index, item in
                        pellet(item, index: index)
                    }
                }
            }
        }
    }

    // MARK: - Pellet Button

    private func pellet(_ item: MoreItem, index: Int) -> some View {
        let color = colorFor(item)
        let isActive = selectedItem == item && isExploration(item)
        let fillOpacity = isActive
            ? (isDark ? 0.40 : 0.35)
            : (isDark ? 0.25 : 0.15)
        let trailOpacity = isActive
            ? (isDark ? 0.25 : 0.18)
            : (isDark ? 0.12 : 0.06)

        return Button {
            if isExploration(item) {
                HapticFeedback.light()
                withAnimation(.easeInOut(duration: 0.2)) {
                    selectedItem = (selectedItem == item) ? nil : item
                }
            } else if item == .deleteMedia {
                // Destructif → confirmation obligatoire, la feuille reste ouverte
                // jusqu'à la validation (jamais de suppression directe).
                HapticFeedback.medium()
                showDeleteMediaConfirm = true
            } else {
                HapticFeedback.medium()
                switch item {
                case .reply: onReply?()
                case .forward: onForward?()
                case .thread: onThread?()
                default: break
                }
                dismiss()
            }
        } label: {
            VStack(spacing: 5) {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [color.opacity(fillOpacity), color.opacity(trailOpacity)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .overlay(
                            Circle()
                                .stroke(
                                    isActive ? color.opacity(0.5) : color.opacity(0.2),
                                    lineWidth: isActive ? 1.5 : 0.5
                                )
                        )
                        .frame(width: 42, height: 42)

                    Image(systemName: symbol(item))
                        .font(.callout.weight(.semibold))
                        .foregroundColor(color)
                }

                Text(labelText(item))
                    .font(.caption2.weight(.medium))
                    .foregroundColor(isActive ? color : theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, minHeight: 68)
            .opacity(gridAppeared ? 1 : 0)
            .offset(y: gridAppeared ? 0 : 12)
            .animation(
                .spring(response: 0.4, dampingFraction: 0.7).delay(Double(index) * 0.04),
                value: gridAppeared
            )
        }
        .buttonStyle(MorePelletButtonStyle())
        // VoiceOver : annonce le seul libellé (évite la double-lecture
        // « glyphe + texte », ex. « globe, Langue »). Le Button conserve son trait.
        .accessibilityLabel(labelText(item))
        // L'état « ouvert » d'une pastille d'exploration (contenu inline déplié)
        // n'était signalé que par la couleur (fill/stroke/label) — invisible pour
        // VoiceOver (WCAG 1.4.1). Le trait .isSelected l'annonce, iOS le localise.
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }

    // MARK: - Item Classification & Color

    private func isExploration(_ item: MoreItem) -> Bool {
        switch item {
        case .reply, .forward, .thread, .deleteMedia: return false
        case .views, .reactions, .language, .transcription, .sentiment, .history, .report: return true
        }
    }

    private func colorFor(_ item: MoreItem) -> Color {
        switch item {
        case .reply: return MeeshyColors.indigo400
        case .forward: return MeeshyColors.indigo500
        case .thread: return MeeshyColors.warning
        case .deleteMedia: return MeeshyColors.error
        case .language: return MeeshyColors.info
        case .views: return MeeshyColors.success
        case .reactions: return MeeshyColors.warning
        case .sentiment: return MeeshyColors.info
        case .transcription: return MeeshyColors.indigo600
        case .history: return MeeshyColors.warning
        case .report: return MeeshyColors.error
        }
    }

    // MARK: - Inline Content

    /// En-tête discret + contenu réutilisé de `destination(for:)`, posé inline
    /// sous la grille. Le header remplace la barre de navigation absente.
    private func inlineContent(for item: MoreItem) -> some View {
        let color = colorFor(item)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: symbol(item))
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(color)
                Text(labelText(item))
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                Spacer()
                Button {
                    HapticFeedback.light()
                    withAnimation(.easeInOut(duration: 0.2)) { selectedItem = nil }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.subheadline)
                        .foregroundColor(theme.textMuted)
                }
                .buttonStyle(.plain)
                // Bouton icône seule (xmark.circle.fill) qui replie le contenu
                // d'exploration inline — sans label, VoiceOver lisait le nom du
                // symbole. Clé SSOT réutilisée (0 clé neuve).
                .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
            }
            .padding(.horizontal, 4)

            destination(for: item)
        }
        .padding(.horizontal, 18)
    }

    /// Contenu détaillé rendu INLINE sous la grille. La feuille est présentée
    /// sans `NavigationStack` → les `.navigationTitle` / `.navigationBarTitleDisplayMode`
    /// seraient inertes. L'en-tête visible (icône + libellé + fermeture) est
    /// fourni par `inlineContent(for:)`.
    @ViewBuilder
    private func destination(for item: MoreItem) -> some View {
        switch item {
        case .language:
            MessageLanguageDetailView(message: message, contactColor: contactColor, conversationId: conversationId,
                textTranslations: textTranslations, transcription: transcription, translatedAudios: translatedAudios,
                onSelectTranslation: onSelectTranslation, onSelectAudioLanguage: onSelectAudioLanguage)
        case .views:
            MessageViewsDetailView(message: message, contactColor: contactColor, conversationId: conversationId)
        case .reactions:
            MessageReactionsDetailView(message: message, contactColor: contactColor, conversationId: conversationId)
        case .transcription:
            MessageTranscriptionDetailView(message: message, contactColor: contactColor, conversationId: conversationId,
                transcription: transcription, translatedAudios: translatedAudios, onSelectAudioLanguage: onSelectAudioLanguage)
        case .sentiment:
            MessageDetailSentimentTab(content: message.content, isDark: colorScheme == .dark).equatable()
        case .history:
            MessageEditsDetailView(message: message, editRevisions: editRevisions)
        case .report:
            MessageReportDetailView(message: message, onReport: { onReport?($0, $1); dismiss() }, onDismiss: { dismiss() })
        case .reply, .forward, .thread, .deleteMedia:
            EmptyView()
        }
    }

    private func symbol(_ item: MoreItem) -> String {
        switch item {
        case .reply: return "arrowshape.turn.up.left"
        case .forward: return "arrowshape.turn.up.right"
        case .thread: return "bubble.left.and.bubble.right"
        case .deleteMedia: return "paperclip.badge.ellipsis"
        case .language: return "globe"
        case .views: return "eye"
        case .reactions: return "face.smiling"
        case .transcription: return "waveform"
        case .sentiment: return "brain.head.profile"
        case .history: return "clock.arrow.circlepath"
        case .report: return "exclamationmark.triangle"
        }
    }

    private func labelText(_ item: MoreItem) -> String {
        switch item {
        case .reply: return String(localized: "action.reply", defaultValue: "Répondre", bundle: .main)
        case .forward: return String(localized: "message-detail.tab.forward", defaultValue: "Transférer", bundle: .main)
        case .thread: return String(localized: "action.thread", defaultValue: "Discussion", bundle: .main)
        case .deleteMedia: return String(localized: "action.delete_media", defaultValue: "Supprimer le média", bundle: .main)
        case .language: return String(localized: "message-detail.tab.language", defaultValue: "Langue", bundle: .main)
        case .views: return String(localized: "message-detail.tab.views", defaultValue: "Qui a vu", bundle: .main)
        case .reactions: return String(localized: "message-detail.tab.reactions", defaultValue: "Réactions", bundle: .main)
        case .transcription: return String(localized: "message-detail.tab.transcription", defaultValue: "Transcription", bundle: .main)
        case .sentiment: return String(localized: "message-detail.tab.sentiment", defaultValue: "Sentiment", bundle: .main)
        case .history: return String(localized: "message-detail.tab.history", defaultValue: "Historique", bundle: .main)
        case .report: return String(localized: "message-detail.tab.report", defaultValue: "Signaler", bundle: .main)
        }
    }
}

// MARK: - Pellet Button Style

/// Press feedback pour les pastilles de la grille — miroir de
/// `DetailActionButtonStyle` de `MessageDetailSheet`.
private struct MorePelletButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.88 : 1.0)
            .opacity(configuration.isPressed ? 0.7 : 1.0)
            .animation(.spring(response: 0.2, dampingFraction: 0.65), value: configuration.isPressed)
    }
}
