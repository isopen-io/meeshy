import SwiftUI
import Combine
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
    var onSaveMedia: (() -> Void)? = nil
    var onDeleteMedia: (() -> Void)? = nil
    var onPin: (() -> Void)? = nil
    var onToggleStar: (() -> Void)? = nil
    /// Suppression du message entier — route vers le dialogue riche
    /// (« pour tous » / « pour moi ») de `ConversationView`.
    var onDeleteMessage: (() -> Void)? = nil
    var onEdit: (() -> Void)? = nil
    var onCopy: (() -> Void)? = nil
    var onShare: (() -> Void)? = nil
    /// Ajout d'une réaction depuis la vue « Réactions » de « Plus… » (voir + ajouter).
    var onReact: ((String) -> Void)? = nil
    var onSelectTranslation: ((MessageTranslation?) -> Void)? = nil
    var onSelectAudioLanguage: ((String?) -> Void)? = nil
    var onReport: ((String, String?) -> Void)? = nil
    /// See `MessageLanguageDetailView` — ViewModel-owned in-flight state so
    /// the "Traduire" loader survives this sheet being dismissed/reopened.
    var translatingTextLanguages: Set<String> = []
    var translatingAudioLanguages: Set<String> = []
    var translationRequestFailedPublisher: AnyPublisher<ConversationViewModel.TranslationRequestFailure, Never>? = nil
    var onRequestTextTranslation: ((_ targetLanguage: String, _ sourceLanguage: String) -> Void)? = nil
    var onRequestAudioTranslation: ((_ targetLanguage: String, _ attachmentId: String) -> Void)? = nil

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
            // Bouton de fermeture Liquid Glass en HAUT À DROITE (req 2026-07-25)
            // — parité avec le « Close » du sheet réactions et le « X » de la vue
            // Traduire. Remplace l'ancienne capsule « Annuler » épinglée en bas.
            HStack {
                Spacer()
                closeButton
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)

            ScrollView(showsIndicators: false) {
                VStack(spacing: 16) {
                    if let selectedItem, isExploration(selectedItem) {
                        // Morph (req 2026-07-24) : au tap d'un item explorable, la
                        // grille complète se replie en une BANDE D'ICÔNES horizontale
                        // scrollable (Liquid Glass) — le contenu de l'item sélectionné
                        // s'affiche dessous, laissant la place au détail.
                        explorableTabStrip(selected: selectedItem)
                            .padding(.horizontal, 14)
                            .padding(.top, 8)
                        inlineContent(for: selectedItem)
                            .id(selectedItem)
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    } else {
                        glassGridCard
                            .padding(.horizontal, 14)
                            .padding(.top, 8)
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
            String(localized: "message-more.media.title", defaultValue: "Ce média", bundle: .main),
            isPresented: $showDeleteMediaConfirm,
            titleVisibility: .visible
        ) {
            if message.attachments.filter({ $0.type != .location }).count == 1 {
                Button(String(localized: "media.save.title", defaultValue: "Enregistrer", bundle: .main)) {
                    onSaveMedia?()
                    dismiss()
                }
            }
            if message.isForwardable {
                Button(String(localized: "message-detail.tab.forward", defaultValue: "Transférer", bundle: .main)) {
                    onForward?()
                    dismiss()
                }
            }
            Button(String(localized: "action.delete_media", defaultValue: "Supprimer le média", bundle: .main), role: .destructive) {
                onDeleteMedia?()
                dismiss()
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) { }
        }
    }

    // MARK: - Close Button (Liquid Glass, haut-droite)

    /// Bouton de fermeture en cercle Liquid Glass, aligné en HAUT À DROITE —
    /// même chrome que le « X » des vues de détail (`MessageLanguageDetailView`,
    /// composer story) et le « Close » du sheet réactions. Glyphe nu dans un
    /// cercle verre. Remplace l'ancienne capsule « Annuler » du bas (req
    /// 2026-07-25). Ferme la feuille.
    private var closeButton: some View {
        Button {
            HapticFeedback.light()
            dismiss()
        } label: {
            Image(systemName: "xmark")
                .font(.subheadline.weight(.bold))
                .foregroundColor(theme.textMuted)
                .frame(width: 30, height: 30)
                .adaptiveGlass(in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
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

    // MARK: - Bande d'icônes horizontale (morph)

    /// TOUS les items des sections — la bande horizontale (morph) les affiche
    /// tous (feedback 2026-07-24 : « il faut toute la liste en horizontal »).
    /// Les actions s'exécutent au tap, les explorables basculent le contenu.
    private var allMoreItems: [MoreItem] {
        sections.flatMap { section -> [MoreItem] in
            switch section { case .actions(let i), .info(let i), .moderation(let i): return i }
        }
    }

    /// Bande d'icônes horizontale scrollable (Liquid Glass) : un onglet par item
    /// explorable, l'actif teinté à sa couleur. Le retour à la grille complète se
    /// fait via le bouton de fermeture de `inlineContent`.
    private func explorableTabStrip(selected: MoreItem) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(allMoreItems, id: \.self) { item in
                    let color = colorFor(item)
                    let isActive = item == selected
                    Button {
                        handleMoreItemTap(item)
                    } label: {
                        Image(systemName: symbol(item))
                            .font(.callout.weight(.semibold))
                            .foregroundColor(isActive ? color : theme.textSecondary)
                            .frame(width: 44, height: 44)
                            .background(
                                Circle().fill(isActive
                                    ? color.opacity(isDark ? 0.35 : 0.18)
                                    : (isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.05)))
                            )
                            .overlay(Circle().stroke(isActive ? color.opacity(0.5) : .clear, lineWidth: 1.5))
                    }
                    .buttonStyle(MorePelletButtonStyle())
                    .accessibilityLabel(labelText(item))
                    .accessibilityAddTraits(isActive ? [.isSelected] : [])
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .adaptiveGlass(in: Capsule(), tint: accent.opacity(0.10))
        .shadow(color: accent.opacity(0.10), radius: 8, x: 0, y: 3)
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

    /// Action commune d'un item (grille OU bande horizontale) : explorable →
    /// bascule le contenu inline ; média → confirmation ; sinon → exécute
    /// le callback + ferme la feuille.
    private func handleMoreItemTap(_ item: MoreItem) {
        if isExploration(item) {
            HapticFeedback.light()
            withAnimation(.easeInOut(duration: 0.2)) {
                selectedItem = (selectedItem == item) ? nil : item
            }
        } else if item == .media {
            // Ouvre le sous-menu média (enregistrer / transférer / supprimer) —
            // jamais de suppression directe (feedback device 2026-07-14).
            HapticFeedback.medium()
            showDeleteMediaConfirm = true
        } else {
            HapticFeedback.medium()
            switch item {
            case .reply: onReply?()
            case .forward: onForward?()
            case .thread: onThread?()
            case .pin, .unpin: onPin?()
            case .star, .unstar: onToggleStar?()
            case .delete: onDeleteMessage?()
            case .edit: onEdit?()
            case .copy: onCopy?()
            case .share: onShare?()
            default: break
            }
            dismiss()
        }
    }

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
            handleMoreItemTap(item)
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
        case .reply, .forward, .thread, .media, .pin, .unpin, .star, .unstar, .delete, .edit, .copy, .share: return false
        case .views, .reactions, .language, .transcription, .sentiment, .history, .report: return true
        }
    }

    private func colorFor(_ item: MoreItem) -> Color {
        switch item {
        case .reply: return MeeshyColors.indigo400
        case .forward: return MeeshyColors.indigo500
        case .thread: return MeeshyColors.warning
        case .media: return theme.textSecondary
        case .pin, .unpin: return MeeshyColors.indigo400
        case .star, .unstar: return MeeshyColors.warning
        case .delete: return MeeshyColors.error
        case .edit: return MeeshyColors.indigo500
        case .copy: return MeeshyColors.indigo400
        case .share: return MeeshyColors.info
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
                    // « X » en cercle Liquid Glass (référence : boutons de
                    // fermeture glass de l'app) — glyphe nu dans un cercle verre.
                    Image(systemName: "xmark")
                        .font(.caption.weight(.bold))
                        .foregroundColor(theme.textMuted)
                        .frame(width: 28, height: 28)
                        .adaptiveGlass(in: Circle())
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                // Bouton icône seule qui replie le contenu d'exploration inline —
                // sans label texte, VoiceOver lisait le nom du symbole. Clé SSOT
                // réutilisée (0 clé neuve).
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
                onSelectTranslation: onSelectTranslation, onSelectAudioLanguage: onSelectAudioLanguage,
                translatingTextLanguages: translatingTextLanguages, translatingAudioLanguages: translatingAudioLanguages,
                translationRequestFailedPublisher: translationRequestFailedPublisher,
                onRequestTextTranslation: onRequestTextTranslation, onRequestAudioTranslation: onRequestAudioTranslation)
        case .views:
            MessageViewsDetailView(message: message, contactColor: contactColor, conversationId: conversationId)
        case .reactions:
            MessageReactionsDetailView(message: message, contactColor: contactColor, conversationId: conversationId, onReact: onReact)
        case .transcription:
            MessageTranscriptionDetailView(message: message, contactColor: contactColor, conversationId: conversationId,
                transcription: transcription, translatedAudios: translatedAudios, onSelectAudioLanguage: onSelectAudioLanguage)
        case .sentiment:
            MessageDetailSentimentTab(content: message.content, isDark: colorScheme == .dark).equatable()
        case .history:
            MessageEditsDetailView(message: message, editRevisions: editRevisions)
        case .report:
            MessageReportDetailView(message: message, onReport: { onReport?($0, $1); dismiss() }, onDismiss: { dismiss() })
        case .reply, .forward, .thread, .media, .pin, .unpin, .star, .unstar, .delete, .edit, .copy, .share:
            EmptyView()
        }
    }

    private func symbol(_ item: MoreItem) -> String {
        switch item {
        case .reply: return "arrowshape.turn.up.left"
        case .forward: return "arrowshape.turn.up.right"
        case .thread: return "bubble.left.and.bubble.right"
        case .media: return "paperclip.badge.ellipsis"
        case .pin: return "pin"
        case .unpin: return "pin.slash"
        case .star: return "star"
        case .unstar: return "star.slash"
        case .delete: return "trash"
        case .edit: return "pencil"
        case .copy: return "doc.on.doc"
        case .share: return "square.and.arrow.up"
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
        case .media: return String(localized: "action.media", defaultValue: "Média", bundle: .main)
        case .pin: return String(localized: "action.pin", defaultValue: "Épingler", bundle: .main)
        case .unpin: return String(localized: "action.unpin", defaultValue: "Désépingler", bundle: .main)
        case .star: return String(localized: "action.favorite", defaultValue: "Favori", bundle: .main)
        case .unstar: return String(localized: "action.unfavorite", defaultValue: "Retirer le favori", bundle: .main)
        case .delete: return String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main)
        case .edit: return String(localized: "action.edit", defaultValue: "Éditer", bundle: .main)
        case .copy: return String(localized: "action.copy", defaultValue: "Copier", bundle: .main)
        case .share: return String(localized: "action.share", defaultValue: "Partager", bundle: .main)
        case .language: return String(localized: "message-detail.tab.language", defaultValue: "Traduire", bundle: .main)
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
