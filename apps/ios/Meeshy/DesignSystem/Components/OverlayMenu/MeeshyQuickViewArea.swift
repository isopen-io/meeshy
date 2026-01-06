//
//  MeeshyQuickViewArea.swift
//  Meeshy
//
//  Swipeable top area with page indicators for emoji, message info, and reactions
//  iOS 16+
//

import SwiftUI

// MARK: - Lazy View Wrapper

/// Defers view creation until it's actually rendered
/// This prevents TabView from initializing all pages at once
private struct LazyView<Content: View>: View {
    let build: () -> Content

    init(_ build: @autoclosure @escaping () -> Content) {
        self.build = build
    }

    var body: some View {
        build()
    }
}

// MARK: - Quick View Area

struct MeeshyQuickViewArea: View {
    let pages: [QuickViewPage]
    @Binding var currentPage: Int

    init(pages: [QuickViewPage], currentPage: Binding<Int>) {
        self.pages = pages
        self._currentPage = currentPage
    }

    var body: some View {
        VStack(spacing: 0) {
            // Swipeable content with lazy loading
            TabView(selection: $currentPage) {
                ForEach(Array(pages.enumerated()), id: \.element.id) { index, page in
                    // Wrap in LazyView to defer initialization until page is shown
                    LazyView(pageView(for: page))
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            // Background is now handled by parent MeeshyOverlayMenu

            // Custom page indicators
            if pages.count > 1 {
                HStack(spacing: 6) {
                    ForEach(0..<pages.count, id: \.self) { index in
                        Circle()
                            .fill(currentPage == index ? Color.blue : Color.gray.opacity(0.4))
                            .frame(width: 6, height: 6)
                            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: currentPage)
                    }
                }
                .padding(.top, 8)
            }
        }
        .padding(.horizontal, 8)
    }

    @ViewBuilder
    private func pageView(for page: QuickViewPage) -> some View {
        switch page {
        case .emoji(let config):
            EmojiGridView(config: config)

        case .messageInfo(let config):
            MessageInfoView(config: config)

        case .reactions(let config):
            ReactionsDetailView(config: config)

        case .translations(let config):
            TranslationsQuickView(config: config)

        case .sentimentAnalysis(let config):
            SentimentAnalysisQuickView(config: config)

        case .textToSpeech(let config):
            TextToSpeechQuickView(config: config)

        case .imageRetouch(let config):
            ImageRetouchQuickView(config: config)

        case .audioEffects(let config):
            AudioEffectsQuickView(config: config)

        case .editAction(let config):
            EditActionQuickView(config: config)

        case .deleteAction(let config):
            DeleteActionQuickView(config: config)

        case .reportAction(let config):
            ReportActionQuickView(config: config)
        }
    }
}

// MARK: - Preview

#Preview {
    @Previewable @State var currentPage = 0

    ZStack {
        Color.gray.opacity(0.2).ignoresSafeArea()

        MeeshyQuickViewArea(pages: [
            .emoji(.init(
                recentEmojis: ["❤️", "👍", "😂", "🔥", "😮", "🙏", "👏", "🎉"],
                popularEmojis: ["😊", "😍", "🥰", "😘", "🤔", "😢", "😡", "🤯"],
                onSelect: { _ in },
                onBrowseAll: { }
            )),
            .messageInfo(.init(
                message: Message(
                    id: "preview-message-id",
                    conversationId: "conv-1",
                    senderId: "sender-1",
                    content: "Preview message",
                    createdAt: Date()
                ),
                participants: [],
                senderName: "Jean Dupont",
                senderAvatar: nil,
                location: "Paris, France",
                onUserTap: { _ in }
            )),
            .reactions(.init(
                reactions: [
                    ("❤️", [
                        ReactionUserInfo(id: "1", name: "Marie", avatar: nil),
                        ReactionUserInfo(id: "2", name: "Julie", avatar: nil)
                    ]),
                    ("👍", [
                        ReactionUserInfo(id: "3", name: "Pierre", avatar: nil),
                        ReactionUserInfo(id: "4", name: "Marc", avatar: nil)
                    ]),
                    ("😂", [
                        ReactionUserInfo(id: "5", name: "Sophie", avatar: nil)
                    ])
                ],
                recentEmojis: ["🔥", "💯", "✨", "🎉", "💪", "🙌"],
                popularEmojis: ["❤️", "👍", "😂", "🔥", "😮", "🙏", "👏", "😢"],
                onSelectEmoji: { _ in },
                onUserTap: { _ in }
            ))
        ], currentPage: $currentPage)
        .frame(height: 200)
        .padding()
    }
}

// MARK: - Translations Quick View

struct TranslationsQuickView: View {
    let config: TranslationsConfig
    @State private var selectedTab: Int = 0

    private var originalFlag: String {
        LanguageHelper.getLanguageFlag(code: config.originalLanguage)
    }

    private var originalLanguageName: String {
        LanguageHelper.getLanguageName(code: config.originalLanguage)
    }

    // Languages available for translation (excluding original and already translated)
    private var availableTargetLanguages: [SupportedLanguage] {
        let existingLanguages = Set(config.translations.map { $0.targetLanguage } + [config.originalLanguage])
        return LanguageHelper.supportedLanguages.filter { !existingLanguages.contains($0.code) }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Tab selector
            HStack(spacing: 0) {
                TranslationTabButton(title: "Traductions", isSelected: selectedTab == 0) {
                    withAnimation(.easeInOut(duration: 0.2)) { selectedTab = 0 }
                }
                TranslationTabButton(title: "Demander", isSelected: selectedTab == 1) {
                    withAnimation(.easeInOut(duration: 0.2)) { selectedTab = 1 }
                }
            }
            .padding(.horizontal, 8)
            .padding(.top, 8)

            Divider()
                .padding(.top, 8)

            // Tab content
            if selectedTab == 0 {
                translationsListView
            } else {
                requestTranslationView
            }
        }
    }

    // MARK: - Translations List Tab

    private var translationsListView: some View {
        ScrollView {
            VStack(spacing: 8) {
                // Original
                TranslationRowView(
                    flag: originalFlag,
                    languageName: "\(originalLanguageName) (Original)",
                    preview: config.originalContent,
                    isSelected: config.selectedLanguage == nil || config.selectedLanguage?.isEmpty == true,
                    onTap: { config.onSelectTranslation("") }
                )

                // Available translations
                ForEach(config.translations, id: \.id) { translation in
                    TranslationRowView(
                        flag: translation.languageFlag,
                        languageName: translation.languageName,
                        preview: translation.translatedContent,
                        isSelected: config.selectedLanguage == translation.targetLanguage,
                        onTap: { config.onSelectTranslation(translation.targetLanguage) }
                    )
                }

                if config.translations.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "character.bubble")
                            .font(.system(size: 32))
                            .foregroundColor(.secondary.opacity(0.5))
                        Text("Aucune traduction")
                            .font(.system(size: 14))
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 20)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 8)
        }
    }

    // MARK: - Request Translation Tab

    private var requestTranslationView: some View {
        ScrollView {
            VStack(spacing: 6) {
                ForEach(availableTargetLanguages, id: \.code) { lang in
                    HStack(spacing: 10) {
                        Text(lang.flag)
                            .font(.system(size: 22))

                        Text(lang.name)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.primary)

                        Spacer()

                        // Quality options
                        HStack(spacing: 6) {
                            TranslationQualityBtn(icon: "star", color: .gray) {
                                config.onRequestTranslation(lang.code, .basic)
                            }
                            TranslationQualityBtn(icon: "star.leadinghalf.filled", color: .orange) {
                                config.onRequestTranslation(lang.code, .medium)
                            }
                            TranslationQualityBtn(icon: "star.fill", color: .yellow) {
                                config.onRequestTranslation(lang.code, .premium)
                            }
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(Color(.systemGray6))
                    .cornerRadius(10)
                }

                if availableTargetLanguages.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "checkmark.circle")
                            .font(.system(size: 32))
                            .foregroundColor(.green.opacity(0.7))
                        Text("Toutes les langues traduites")
                            .font(.system(size: 14))
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 20)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 8)
        }
    }
}

// MARK: - Translation Tab Button

private struct TranslationTabButton: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 14, weight: isSelected ? .semibold : .regular))
                .foregroundColor(isSelected ? .blue : .secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(isSelected ? Color.blue.opacity(0.1) : Color.clear)
                )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Translation Row View

private struct TranslationRowView: View {
    let flag: String
    let languageName: String
    let preview: String
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .top, spacing: 10) {
                Text(flag)
                    .font(.system(size: 22))

                VStack(alignment: .leading, spacing: 2) {
                    Text(languageName)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.primary)

                    Text(preview)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.blue)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(isSelected ? Color.blue.opacity(0.08) : Color(.systemGray6))
            .cornerRadius(10)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Translation Quality Button

private struct TranslationQualityBtn: View {
    let icon: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .fill(color.opacity(0.15))
                    .frame(width: 28, height: 28)

                Image(systemName: icon)
                    .font(.system(size: 12))
                    .foregroundColor(color == .yellow ? .orange : color)
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Edit Action Quick View

struct EditActionQuickView: View {
    let config: EditActionConfig
    @State private var editText: String = ""

    var body: some View {
        VStack(spacing: 12) {
            Text("Modifier le message")
                .font(.system(size: 16, weight: .semibold))
                .padding(.top, 12)

            TextEditor(text: $editText)
                .font(.system(size: 15))
                .padding(8)
                .background(Color(.systemGray6))
                .cornerRadius(10)
                .frame(maxHeight: 100)
                .padding(.horizontal, 12)

            Button {
                if !editText.isEmpty {
                    config.onSave(editText)
                }
            } label: {
                Text("Enregistrer")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(editText.isEmpty ? Color.gray : Color.blue)
                    .cornerRadius(10)
            }
            .disabled(editText.isEmpty)
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
        }
        .onAppear {
            editText = config.initialText
        }
    }
}

// MARK: - Delete Action Quick View

struct DeleteActionQuickView: View {
    let config: DeleteActionConfig

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "trash.circle.fill")
                .font(.system(size: 50))
                .foregroundColor(.red)
                .padding(.top, 16)

            Text("Supprimer ce message ?")
                .font(.system(size: 16, weight: .semibold))

            Text("Cette action est irréversible.")
                .font(.system(size: 14))
                .foregroundColor(.secondary)

            Button {
                config.onConfirm()
            } label: {
                Text("Supprimer")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.red)
                    .cornerRadius(10)
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
        }
    }
}

// MARK: - Report Action Quick View

struct ReportActionQuickView: View {
    let config: ReportActionConfig
    @State private var selectedReason: String?
    @State private var reportDescription: String = ""
    @FocusState private var isDescriptionFocused: Bool

    private let reportReasons = [
        ("spam", "Spam", "message.badge.filled.fill"),
        ("harassment", "Harcèlement", "exclamationmark.bubble.fill"),
        ("inappropriate", "Contenu inapproprié", "eye.slash.fill"),
        ("violence", "Violence", "hand.raised.slash.fill"),
        ("other", "Autre", "ellipsis.circle.fill")
    ]

    private let minDescriptionLength = 20

    private var canSubmit: Bool {
        selectedReason != nil && reportDescription.count >= minDescriptionLength
    }

    private var descriptionCharCount: Int {
        reportDescription.count
    }

    var body: some View {
        VStack(spacing: 12) {
            Text("Signaler ce message")
                .font(.system(size: 16, weight: .semibold))
                .padding(.top, 12)

            ScrollView {
                VStack(spacing: 6) {
                    // Reasons list
                    ForEach(reportReasons, id: \.0) { reason in
                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                selectedReason = reason.0
                            }
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: reason.2)
                                    .font(.system(size: 18))
                                    .foregroundColor(selectedReason == reason.0 ? .red : .secondary)
                                    .frame(width: 24)

                                Text(reason.1)
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(.primary)

                                Spacer()

                                if selectedReason == reason.0 {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundColor(.red)
                                }
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(selectedReason == reason.0 ? Color.red.opacity(0.1) : Color(.systemGray6))
                            .cornerRadius(10)
                        }
                        .buttonStyle(.plain)
                    }

                    // Description field (appears when a reason is selected)
                    if selectedReason != nil {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text("Décrivez le problème")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(.primary)

                                Spacer()

                                Text("\(descriptionCharCount)/\(minDescriptionLength) min")
                                    .font(.system(size: 12))
                                    .foregroundColor(descriptionCharCount >= minDescriptionLength ? .green : .orange)
                            }

                            TextEditor(text: $reportDescription)
                                .font(.system(size: 14))
                                .frame(minHeight: 80, maxHeight: 120)
                                .padding(8)
                                .background(Color(.systemGray6))
                                .cornerRadius(10)
                                .focused($isDescriptionFocused)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10)
                                        .stroke(
                                            descriptionCharCount >= minDescriptionLength ? Color.green.opacity(0.5) : Color.orange.opacity(0.5),
                                            lineWidth: 1
                                        )
                                )

                            if descriptionCharCount < minDescriptionLength && descriptionCharCount > 0 {
                                Text("Minimum \(minDescriptionLength) caractères requis")
                                    .font(.system(size: 11))
                                    .foregroundColor(.orange)
                            }
                        }
                        .padding(.top, 8)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    }
                }
                .padding(.horizontal, 12)
            }

            Button {
                if let reason = selectedReason, reportDescription.count >= minDescriptionLength {
                    config.onReport(reason, reportDescription)
                }
            } label: {
                Text("Envoyer le signalement")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(canSubmit ? Color.red : Color.gray)
                    .cornerRadius(10)
            }
            .disabled(!canSubmit)
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
        }
    }
}

// MARK: - Sentiment Analysis Quick View

struct SentimentAnalysisQuickView: View {
    let config: SentimentAnalysisConfig

    // Internal state for on-demand analysis
    @State private var localSentiment: SentimentResult?
    @State private var isAnalyzing: Bool = false

    /// Current sentiment (local state or initial from config)
    private var currentSentiment: SentimentResult? {
        localSentiment ?? config.sentiment
    }

    private var sentimentColor: Color {
        guard let sentiment = currentSentiment else { return .gray }
        switch sentiment.category {
        case .veryPositive, .positive: return .green
        case .negative, .veryNegative: return .red
        case .neutral: return .orange
        case .unknown: return .blue
        }
    }

    private var sentimentIcon: String {
        guard let sentiment = currentSentiment else { return "face.dashed" }
        return sentiment.category.iconName
    }

    private var sentimentLabel: String {
        if isAnalyzing { return "Analyse en cours..." }
        guard let sentiment = currentSentiment else { return "Non analysé" }
        switch sentiment.category {
        case .veryPositive: return "Très positif"
        case .positive: return "Positif"
        case .negative: return "Négatif"
        case .veryNegative: return "Très négatif"
        case .neutral: return "Neutre"
        case .unknown: return "Inconnu"
        }
    }

    var body: some View {
        VStack(spacing: 16) {
            // Sentiment indicator
            VStack(spacing: 8) {
                ZStack {
                    Circle()
                        .fill(sentimentColor.opacity(0.15))
                        .frame(width: 70, height: 70)

                    if isAnalyzing {
                        ProgressView()
                            .scaleEffect(1.5)
                    } else {
                        Image(systemName: sentimentIcon)
                            .font(.system(size: 36))
                            .foregroundColor(sentimentColor)
                    }
                }

                Text(sentimentLabel)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(sentimentColor)

                if let sentiment = currentSentiment, !isAnalyzing {
                    // Score intensity bar (using absolute value of score for intensity)
                    let intensity = abs(sentiment.score)
                    VStack(spacing: 4) {
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color(.systemGray5))
                                    .frame(height: 8)

                                RoundedRectangle(cornerRadius: 4)
                                    .fill(sentimentColor)
                                    .frame(width: geo.size.width * intensity, height: 8)
                            }
                        }
                        .frame(height: 8)

                        Text("Intensité: \(Int(intensity * 100))%")
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 40)
                }
            }
            .padding(.top, 16)

            // Message preview
            if let sentiment = currentSentiment, !isAnalyzing {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Justification")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.secondary)

                    Text(generateJustification(for: sentiment))
                        .font(.system(size: 14))
                        .foregroundColor(.primary)
                        .multilineTextAlignment(.leading)
                        .padding(12)
                        .background(Color(.systemGray6))
                        .cornerRadius(10)
                }
                .padding(.horizontal, 16)
            }

            Spacer()

            // Analyze button (always show, allows re-analysis)
            Button {
                performAnalysis()
            } label: {
                HStack(spacing: 8) {
                    if isAnalyzing {
                        ProgressView()
                            .tint(.white)
                    }
                    Text(currentSentiment == nil ? "Analyser le sentiment" : "Ré-analyser")
                        .font(.system(size: 15, weight: .semibold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(isAnalyzing ? Color.gray : Color.purple)
                .cornerRadius(10)
            }
            .disabled(isAnalyzing)
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
        .onAppear {
            // Initialize local state from config's initial value
            if localSentiment == nil {
                localSentiment = config.sentiment
            }
        }
    }

    /// Perform sentiment analysis on-demand
    private func performAnalysis() {
        guard !isAnalyzing else { return }

        isAnalyzing = true

        // Use the onAnalyze callback which handles the actual analysis
        // and also updates the parent's state
        Task {
            // The config.onAnalyze callback performs the analysis
            // We need to wait for it and get the result
            await MainActor.run {
                config.onAnalyze()
            }

            // Give the analyzer time to complete and cache
            try? await Task.sleep(nanoseconds: 500_000_000) // 0.5s

            // Try to get the cached result
            if let result = await SentimentAnalyzer.shared.getCached(messageId: config.messageId) {
                await MainActor.run {
                    localSentiment = result
                    isAnalyzing = false
                }
            } else {
                // Fallback: perform analysis directly
                let result = await SentimentAnalyzer.shared.analyze(
                    messageId: config.messageId,
                    content: config.content
                )
                await MainActor.run {
                    localSentiment = result
                    isAnalyzing = false
                }
            }
        }
    }

    private func generateJustification(for sentiment: SentimentResult) -> String {
        switch sentiment.category {
        case .veryPositive:
            return "Ce message exprime une tonalité très positive. Les mots utilisés suggèrent un enthousiasme ou une grande satisfaction."
        case .positive:
            return "Ce message exprime une tonalité positive. Les mots utilisés et le contexte suggèrent un état d'esprit optimiste ou satisfait."
        case .negative:
            return "Ce message contient des éléments à connotation négative. Le ton général suggère une insatisfaction ou une préoccupation."
        case .veryNegative:
            return "Ce message exprime une tonalité très négative. Le contenu suggère une forte insatisfaction ou frustration."
        case .neutral:
            return "Ce message est factuel et neutre. Il ne contient pas d'éléments émotionnels marqués."
        case .unknown:
            return "L'analyse du sentiment n'a pas pu déterminer le ton de ce message."
        }
    }
}

// MARK: - Text To Speech Quick View

struct TextToSpeechQuickView: View {
    let config: TextToSpeechConfig

    @State private var isPlaying = false
    @State private var speechRate: Double = 0.5
    @State private var selectedVoice: String = "default"

    private let voices = [
        ("default", "Voix par défaut"),
        ("male", "Voix masculine"),
        ("female", "Voix féminine")
    ]

    var body: some View {
        VStack(spacing: 16) {
            // Header
            HStack {
                Image(systemName: "speaker.wave.3.fill")
                    .font(.system(size: 24))
                    .foregroundColor(.cyan)

                Text("Lecture vocale")
                    .font(.system(size: 18, weight: .bold))
            }
            .padding(.top, 16)

            // Message preview
            Text(config.content)
                .font(.system(size: 14))
                .foregroundColor(.secondary)
                .lineLimit(3)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)

            // Language indicator
            HStack(spacing: 6) {
                Text(LanguageHelper.getLanguageFlag(code: config.language))
                    .font(.system(size: 20))
                Text(LanguageHelper.getLanguageName(code: config.language))
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Color(.systemGray6))
            .cornerRadius(8)

            // Speed control
            VStack(spacing: 8) {
                HStack {
                    Image(systemName: "tortoise.fill")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)

                    Slider(value: $speechRate, in: 0.1...1.0)
                        .tint(.cyan)

                    Image(systemName: "hare.fill")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }
                .padding(.horizontal, 20)

                Text("Vitesse: \(Int(speechRate * 100))%")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }

            Spacer()

            // Play/Stop button
            Button {
                if isPlaying {
                    config.onStop()
                    isPlaying = false
                } else {
                    config.onPlay()
                    isPlaying = true
                }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: isPlaying ? "stop.fill" : "play.fill")
                        .font(.system(size: 18))

                    Text(isPlaying ? "Arrêter" : "Lire le message")
                        .font(.system(size: 16, weight: .semibold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    LinearGradient(
                        colors: [.cyan, .blue],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .cornerRadius(12)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
    }
}

// MARK: - Image Retouch Quick View

struct ImageRetouchQuickView: View {
    let config: ImageRetouchConfig

    var body: some View {
        VStack(spacing: 16) {
            // Header
            HStack {
                Image(systemName: "photo.fill")
                    .font(.system(size: 24))
                    .foregroundColor(.purple)
                Text("Retoucher l'image")
                    .font(.system(size: 18, weight: .semibold))
            }
            .padding(.top, 16)

            // Action buttons
            VStack(spacing: 10) {
                Button {
                    config.onRetouch()
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "paintbrush.fill")
                            .font(.system(size: 18))
                        Text("Modifier l'image")
                            .font(.system(size: 15, weight: .medium))
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14))
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(Color(.systemGray6))
                    .cornerRadius(12)
                }
                .buttonStyle(.plain)

                Button {
                    config.onResend()
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 18))
                        Text("Renvoyer l'image")
                            .font(.system(size: 15, weight: .medium))
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14))
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(Color(.systemGray6))
                    .cornerRadius(12)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 12)
        }
    }
}

// MARK: - Audio Effects Quick View

struct AudioEffectsQuickView: View {
    let config: AudioEffectsConfig
    @State private var selectedEffect: AudioEffectsConfig.AudioEffect = .normal
    @State private var isPlaying = false
    @State private var showExistingEffects = false

    var body: some View {
        ZStack {
            // Front: Apply effects view
            applyEffectsView
                .opacity(showExistingEffects ? 0 : 1)
                .rotation3DEffect(
                    .degrees(showExistingEffects ? 180 : 0),
                    axis: (x: 0, y: 1, z: 0)
                )

            // Back: Existing effects view
            existingEffectsView
                .opacity(showExistingEffects ? 1 : 0)
                .rotation3DEffect(
                    .degrees(showExistingEffects ? 0 : -180),
                    axis: (x: 0, y: 1, z: 0)
                )
        }
        .animation(.spring(response: 0.5, dampingFraction: 0.8), value: showExistingEffects)
    }

    // MARK: - Apply Effects View (Front)

    private var applyEffectsView: some View {
        VStack(spacing: 12) {
            // Header with toggle
            headerView(title: "Appliquer un effet", icon: "waveform.badge.plus")

            // Effects grid
            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible()),
                GridItem(.flexible()),
                GridItem(.flexible())
            ], spacing: 10) {
                ForEach(AudioEffectsConfig.AudioEffect.allCases, id: \.self) { effect in
                    effectButton(effect)
                }
            }
            .padding(.horizontal, 12)

            // Apply button
            Button {
                config.onApplyEffect(selectedEffect)
            } label: {
                Text("Appliquer l'effet")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        LinearGradient(
                            colors: [.orange, .red],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .cornerRadius(10)
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
        }
    }

    // MARK: - Existing Effects View (Back)

    private var existingEffectsView: some View {
        VStack(spacing: 12) {
            // Header with toggle
            headerView(title: "Effets appliqués", icon: "waveform.circle.fill")

            Spacer()

            // Placeholder for existing effects
            VStack(spacing: 12) {
                Image(systemName: "waveform.slash")
                    .font(.system(size: 40))
                    .foregroundColor(.secondary.opacity(0.5))

                Text("Aucun effet pour cet audio")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.secondary)

                Text("Les effets appliqués à cet audio apparaîtront ici")
                    .font(.system(size: 13))
                    .foregroundColor(.secondary.opacity(0.7))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }

            Spacer()

            // TODO: When effects exist, show segments/timeline here
            // AudioSegmentsView(segments: config.existingSegments)
        }
        .padding(.bottom, 8)
    }

    // MARK: - Header View

    private func headerView(title: String, icon: String) -> some View {
        HStack {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundColor(.orange)

            Text(title)
                .font(.system(size: 16, weight: .semibold))

            Spacer()

            // Toggle button
            Button {
                showExistingEffects.toggle()
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: showExistingEffects ? "slider.horizontal.3" : "list.bullet")
                        .font(.system(size: 14))
                    Text(showExistingEffects ? "Ajouter" : "Voir effets")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundColor(.orange)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color.orange.opacity(0.15))
                .cornerRadius(8)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.top, 12)
    }

    // MARK: - Effect Button

    @ViewBuilder
    private func effectButton(_ effect: AudioEffectsConfig.AudioEffect) -> some View {
        Button {
            selectedEffect = effect
            config.onPreview(effect)
        } label: {
            VStack(spacing: 4) {
                Image(systemName: effect.icon)
                    .font(.system(size: 20))
                    .foregroundColor(selectedEffect == effect ? .white : .primary)

                Text(effect.rawValue)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(selectedEffect == effect ? .white : .secondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(selectedEffect == effect ? Color.orange : Color(.systemGray6))
            .cornerRadius(10)
        }
        .buttonStyle(.plain)
    }
}
