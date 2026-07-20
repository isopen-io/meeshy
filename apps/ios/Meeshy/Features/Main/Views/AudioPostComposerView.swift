import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Audio Post Composer

struct AudioPostComposerView: View {
    let onPublish: (URL, String, MobileTranscriptionPayload?) -> Void

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
    @StateObject private var audioRecorder = AudioRecorderManager()

    @State private var transcription: OnDeviceTranscription?
    @State private var transcriptionError: String?
    @State private var recordedURL: URL?
    @State private var recordedDuration: TimeInterval = 0
    @State private var phase: ComposerPhase = .idle
    @State private var selectedLocale: Locale = AudioPostComposerView.initialLocale()
    @State private var showLanguagePicker = false

    private enum ComposerPhase {
        case idle, recording, transcribing, preview
    }

    // Washes sombres intentionnels — pas de token MeeshyColors equivalent
    private let darkCanvasTop = Color(hex: "0F0D19")
    private let darkCanvasBase = Color(hex: "13111C")

    private var isDark: Bool { colorScheme == .dark }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ZStack {
                background

                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 24) {
                        recordingCard
                        languageSelector
                        contentPanel
                        Color.clear.frame(height: 100)
                    }
                    .padding(.horizontal, MeeshySpacing.xl)
                    .padding(.top, MeeshySpacing.lg)
                }

                VStack {
                    Spacer()
                    actionBar
                        .padding(.horizontal, MeeshySpacing.xl)
                        .padding(.bottom, MeeshySpacing.lg)
                        .background(
                            LinearGradient(
                                colors: [Color.clear, backgroundBaseColor.opacity(0.7), backgroundBaseColor],
                                startPoint: .top, endPoint: .bottom
                            )
                            .ignoresSafeArea(edges: .bottom)
                        )
                }
            }
            .navigationTitle(String(localized: "Post audio", defaultValue: "Post audio"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(String(localized: "Annuler", defaultValue: "Annuler")) {
                        cancelAndDismiss()
                    }
                    .foregroundColor(theme.textSecondary)
                }
            }
        }
        .adaptiveOnChange(of: colorScheme) { _, newScheme in
            theme.syncWithSystem(newScheme)
        }
        .onDisappear {
            // Swipe-down interactif de la sheet : contourne le bouton Annuler
            // (`cancelAndDismiss`). On coupe micro + transcription — idempotent,
            // et on ne supprime PAS le fichier : le chemin publish vient de le
            // remettre au parent pour upload.
            if audioRecorder.isRecording {
                audioRecorder.cancelRecording()
            }
            if EdgeTranscriptionService.shared.isTranscribing {
                EdgeTranscriptionService.shared.cancel()
            }
        }
    }

    // MARK: - Background

    private var backgroundBaseColor: Color {
        isDark ? darkCanvasBase : MeeshyColors.indigo50
    }

    private var background: some View {
        LinearGradient(
            colors: isDark
                ? [darkCanvasTop, darkCanvasBase, MeeshyColors.indigo950.opacity(0.85)]
                : [MeeshyColors.indigo50, MeeshyColors.indigo100, MeeshyColors.indigo200.opacity(0.55)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    // MARK: - Recording Card

    private var recordingCard: some View {
        VStack(spacing: 18) {
            ZStack {
                Circle()
                    .fill(haloColor.opacity(audioRecorder.isRecording ? 0.28 : 0.12))
                    .frame(width: 168, height: 168)
                    .blur(radius: audioRecorder.isRecording ? 10 : 4)

                Circle()
                    .fill(haloColor.opacity(0.08))
                    .frame(width: 132, height: 132)

                centerContent
                    // Visualisation d'état purement décorative (waveform / sceau / micro /
                    // spinner). L'état parlé est porté par `durationLabel` juste en dessous
                    // → on masque le décor pour éviter le bruit VoiceOver.
                    .accessibilityHidden(true)
            }
            .frame(height: 168)

            durationLabel
        }
        .padding(.vertical, MeeshySpacing.xxl)
        .padding(.horizontal, MeeshySpacing.xl)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.xxl)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.xxl)
                        .stroke(MeeshyColors.indigo300.opacity(isDark ? 0.25 : 0.4), lineWidth: 1)
                )
        )
    }

    @ViewBuilder
    private var centerContent: some View {
        if audioRecorder.isRecording {
            WaveformView(levels: audioRecorder.audioLevels)
                .frame(width: 100, height: 60)
        } else if phase == .transcribing {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: MeeshyColors.indigo500))
                .scaleEffect(1.6)
        } else if phase == .preview {
            Image(systemName: "checkmark.seal.fill")
                .font(MeeshyFont.relative(56))
                .foregroundStyle(
                    LinearGradient(
                        colors: [MeeshyColors.success, MeeshyColors.success.opacity(0.7)],
                        startPoint: .top, endPoint: .bottom
                    )
                )
        } else {
            Image(systemName: "mic.fill")
                .font(MeeshyFont.relative(48))
                .foregroundStyle(MeeshyColors.brandGradient)
        }
    }

    private var haloColor: Color {
        if audioRecorder.isRecording { return MeeshyColors.error }
        if phase == .preview { return MeeshyColors.success }
        return MeeshyColors.indigo500
    }

    @ViewBuilder
    private var durationLabel: some View {
        if audioRecorder.isRecording || phase == .preview {
            Text(formattedDuration)
                .font(.system(.largeTitle, design: .monospaced).weight(.light))
                .foregroundColor(theme.textPrimary)
        } else if phase == .transcribing {
            VStack(spacing: 4) {
                Text(String(localized: "Transcription en cours...", defaultValue: "Transcription en cours..."))
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(theme.textSecondary)
                Text(formattedDuration)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundColor(theme.textMuted)
            }
        } else {
            Text(String(localized: "Appuyez pour enregistrer", defaultValue: "Appuyez pour enregistrer"))
                .font(.subheadline.weight(.medium))
                .foregroundColor(theme.textSecondary)
        }
    }

    // MARK: - Language Selector

    private var languageSelector: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "globe")
                    .font(.caption.weight(.semibold))
                    .accessibilityHidden(true)
                Text(String(localized: "Langue de transcription",
                            defaultValue: "Langue de transcription"))
                    .font(.caption.weight(.semibold))
                Spacer()
            }
            .foregroundColor(theme.textSecondary)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(suggestedLocales, id: \.identifier) { loc in
                        languageChip(for: loc)
                    }
                    moreLanguagesButton
                }
                .padding(.horizontal, 2)
            }
        }
        .disabled(phase == .recording || phase == .transcribing)
        .opacity(phase == .recording || phase == .transcribing ? 0.5 : 1)
        .sheet(isPresented: $showLanguagePicker) {
            AudioLanguagePickerView(selectedLocale: $selectedLocale)
        }
    }

    private func languageChip(for loc: Locale) -> some View {
        let isSelected = loc.identifier == selectedLocale.identifier
        return Button {
            selectedLocale = loc
            HapticFeedback.light()
        } label: {
            Text(Self.shortDisplayName(for: loc))
                .font(.footnote.weight(.semibold))
                .foregroundColor(isSelected ? .white : theme.textPrimary)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(
                    Capsule().fill(
                        isSelected
                            ? AnyShapeStyle(MeeshyColors.brandGradient)
                            : AnyShapeStyle(theme.surface(tint: "C7D2FE"))
                    )
                )
                .overlay(
                    Capsule()
                        .stroke(MeeshyColors.indigo400.opacity(isSelected ? 0 : 0.3), lineWidth: 1)
                )
        }
        // Le libellé visuel est un code court (« FR ») ; VoiceOver annonce le nom
        // complet localisé. L'état sélectionné n'était signalé que par la couleur
        // (fond gradient) → invisible sans la vue : on ajoute le trait `.isSelected`.
        .accessibilityLabel(Self.fullDisplayName(for: loc))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var moreLanguagesButton: some View {
        Button {
            showLanguagePicker = true
            HapticFeedback.light()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "line.3.horizontal.decrease.circle.fill")
                    .font(.footnote)
                    .accessibilityHidden(true)
                Text(String(localized: "Plus", defaultValue: "Plus"))
                    .font(.footnote.weight(.semibold))
            }
            .foregroundColor(MeeshyColors.indigo500)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                Capsule().stroke(MeeshyColors.indigo400.opacity(0.4), lineWidth: 1)
            )
        }
        // « Plus » seul est ambigu en VoiceOver → intention explicite.
        .accessibilityLabel(String(localized: "Plus de langues", defaultValue: "Plus de langues"))
    }

    private var suggestedLocales: [Locale] {
        var seeds: [String] = []
        let user = AuthManager.shared.currentUser
        if let lang = user?.systemLanguage { seeds.append(lang) }
        if let lang = user?.regionalLanguage, lang != user?.systemLanguage {
            seeds.append(lang)
        }
        if let kbd = UITextInputMode.activeInputModes.first?.primaryLanguage {
            seeds.append(String(kbd.prefix(2)))
        }
        seeds.append(contentsOf: ["fr", "en"])

        let normalized = seeds.map { code in
            EdgeTranscriptionService.normalizedLocale(for: Locale(identifier: code))
        }

        var seen = Set<String>()
        return normalized.filter { seen.insert($0.identifier).inserted }.prefix(4).map { $0 }
    }

    private static func shortDisplayName(for locale: Locale) -> String {
        if let lang = locale.language.languageCode?.identifier {
            return lang.uppercased()
        }
        return locale.identifier.uppercased()
    }

    // Nom complet localisé (« Français ») pour l'annonce VoiceOver — le chip
    // n'affiche visuellement que le code court.
    private static func fullDisplayName(for locale: Locale) -> String {
        if let name = Locale.current.localizedString(forIdentifier: locale.identifier),
           !name.isEmpty {
            return name.prefix(1).uppercased() + name.dropFirst()
        }
        return shortDisplayName(for: locale)
    }

    // MARK: - Content Panel

    @ViewBuilder
    private var contentPanel: some View {
        if let error = transcriptionError {
            errorPanel(error)
        } else if phase == .preview, let transcription {
            transcriptionPreview(transcription)
        }
    }

    private func transcriptionPreview(_ t: OnDeviceTranscription) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "text.bubble.fill")
                    .font(.footnote)
                    .foregroundColor(MeeshyColors.indigo400)
                    .accessibilityHidden(true)
                Text(String(localized: "Transcription", defaultValue: "Transcription"))
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(MeeshyColors.indigo400)
                Spacer()
                Text(t.language.uppercased())
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(theme.textMuted)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(theme.surface(tint: "A5B4FC")))
            }

            Text(t.text.isEmpty
                 ? String(localized: "Aucune transcription disponible.",
                          defaultValue: "Aucune transcription disponible.")
                 : t.text)
                .font(.subheadline)
                .foregroundColor(theme.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .lineSpacing(4)
                // La transcription est du contenu utilisateur → copiable (sélection native).
                .textSelection(.enabled)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(MeeshyColors.indigo300.opacity(isDark ? 0.25 : 0.35), lineWidth: 1)
                )
        )
        .transition(.opacity.combined(with: .move(edge: .top)))
    }

    private func errorPanel(_ error: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.callout)
                    .foregroundColor(MeeshyColors.error)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(String(localized: "Transcription indisponible",
                                defaultValue: "Transcription indisponible"))
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(theme.textPrimary)
                    Text(error)
                        .font(.caption)
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(4)
                }
                Spacer(minLength: 0)
            }

            if recordedURL != nil {
                Button(action: retryTranscription) {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.clockwise")
                        Text(String(localized: "Reessayer",
                                    defaultValue: "R\u{00E9}essayer"))
                    }
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(MeeshyColors.brandGradient))
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(MeeshyColors.error.opacity(isDark ? 0.12 : 0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(MeeshyColors.error.opacity(0.3), lineWidth: 1)
                )
        )
    }

    // MARK: - Action Bar

    @ViewBuilder
    private var actionBar: some View {
        switch phase {
        case .preview:
            HStack(spacing: 12) {
                Button(action: resetToIdle) {
                    Label(
                        String(localized: "Refaire", defaultValue: "Refaire"),
                        systemImage: "arrow.counterclockwise"
                    )
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 14)
                    .background(
                        Capsule()
                            .fill(.ultraThinMaterial)
                            .overlay(
                                Capsule()
                                    .stroke(MeeshyColors.indigo300.opacity(0.4), lineWidth: 1)
                            )
                    )
                }

                Button(action: publish) {
                    Text(String(localized: "Publier", defaultValue: "Publier"))
                        .font(.callout.weight(.bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(
                            Capsule()
                                .fill(MeeshyColors.brandGradient)
                                .shadow(color: MeeshyColors.indigo500.opacity(0.4), radius: 12, y: 4)
                        )
                }
            }
        case .transcribing:
            Button(action: cancelTranscription) {
                Label(
                    String(localized: "Annuler la transcription",
                           defaultValue: "Annuler la transcription"),
                    systemImage: "xmark.circle.fill"
                )
                .font(.subheadline.weight(.semibold))
                .foregroundColor(MeeshyColors.error)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    Capsule()
                        .fill(.ultraThinMaterial)
                        .overlay(
                            Capsule().stroke(MeeshyColors.error.opacity(0.4), lineWidth: 1)
                        )
                )
            }
        case .idle, .recording:
            HStack {
                Spacer()
                Button(action: toggleRecording) {
                    ZStack {
                        Circle()
                            .fill(
                                audioRecorder.isRecording
                                    ? AnyShapeStyle(MeeshyColors.error)
                                    : AnyShapeStyle(MeeshyColors.brandGradient)
                            )
                            .frame(width: 76, height: 76)
                            .shadow(
                                color: (audioRecorder.isRecording
                                            ? MeeshyColors.error
                                            : MeeshyColors.indigo500).opacity(0.45),
                                radius: 16, y: 6
                            )
                        if audioRecorder.isRecording {
                            RoundedRectangle(cornerRadius: 5)
                                .fill(.white)
                                .frame(width: 26, height: 26)
                        } else {
                            Image(systemName: "mic.fill")
                                .font(.title)
                                .foregroundColor(.white)
                        }
                    }
                }
                .accessibilityLabel(
                    audioRecorder.isRecording
                        ? String(localized: "Arreter l'enregistrement",
                                 defaultValue: "Arr\u{00EA}ter l'enregistrement")
                        : String(localized: "Demarrer l'enregistrement",
                                 defaultValue: "D\u{00E9}marrer l'enregistrement")
                )
                Spacer()
            }
        }
    }

    // MARK: - Helpers

    private static func initialLocale() -> Locale {
        let user = AuthManager.shared.currentUser
        if let lang = user?.systemLanguage {
            return EdgeTranscriptionService.normalizedLocale(for: Locale(identifier: lang))
        }
        if let kbd = UITextInputMode.activeInputModes.first?.primaryLanguage {
            return EdgeTranscriptionService.normalizedLocale(
                for: Locale(identifier: String(kbd.prefix(2)))
            )
        }
        return Locale(identifier: "fr-FR")
    }

    private var formattedDuration: String {
        let d = audioRecorder.isRecording ? audioRecorder.duration : recordedDuration
        let minutes = Int(d) / 60
        let seconds = Int(d) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    private func toggleRecording() {
        if audioRecorder.isRecording {
            stopAndTranscribe()
        } else {
            startRecording()
        }
    }

    private func startRecording() {
        transcription = nil
        transcriptionError = nil
        recordedURL = nil
        phase = .recording
        audioRecorder.startRecording()
        HapticFeedback.medium()
    }

    private func stopAndTranscribe() {
        recordedDuration = audioRecorder.duration
        guard let url = audioRecorder.stopRecording() else {
            phase = .idle
            return
        }
        recordedURL = url
        phase = .transcribing
        HapticFeedback.light()
        runTranscription(url: url)
    }

    private func retryTranscription() {
        guard let url = recordedURL else { return }
        transcriptionError = nil
        phase = .transcribing
        runTranscription(url: url)
    }

    private func runTranscription(url: URL) {
        Task {
            do {
                let result = try await EdgeTranscriptionService.shared.transcribe(
                    audioURL: url,
                    locale: selectedLocale
                )
                transcription = result
                transcriptionError = nil
                phase = .preview
            } catch let error as EdgeTranscriptionError {
                transcriptionError = error.errorDescription
                phase = .preview
            } catch {
                transcriptionError = error.localizedDescription
                phase = .preview
            }
        }
    }

    private func cancelTranscription() {
        EdgeTranscriptionService.shared.cancel()
        transcriptionError = String(
            localized: "Transcription annulee",
            defaultValue: "Transcription annul\u{00E9}e"
        )
        phase = .preview
    }

    private func resetToIdle() {
        audioRecorder.cancelRecording()
        if let url = recordedURL {
            try? FileManager.default.removeItem(at: url)
        }
        recordedURL = nil
        transcription = nil
        transcriptionError = nil
        phase = .idle
    }

    private func cancelAndDismiss() {
        if audioRecorder.isRecording {
            audioRecorder.cancelRecording()
        }
        if EdgeTranscriptionService.shared.isTranscribing {
            EdgeTranscriptionService.shared.cancel()
        }
        if let url = recordedURL {
            try? FileManager.default.removeItem(at: url)
        }
        dismiss()
    }

    private func publish() {
        guard let url = recordedURL else { return }
        let payload = transcription.map { buildPayload($0) }
        onPublish(url, "audio/mp4", payload)
    }

    private func buildPayload(_ t: OnDeviceTranscription) -> MobileTranscriptionPayload {
        let segments = t.segments.map { seg in
            MobileTranscriptionSegment(
                text: seg.text,
                start: seg.timestamp,
                end: seg.timestamp + seg.duration
            )
        }
        return MobileTranscriptionPayload(
            text: t.text,
            language: t.language,
            confidence: t.confidence,
            segments: segments
        )
    }
}

// MARK: - Waveform View

private struct WaveformView: View {
    let levels: [CGFloat]

    var body: some View {
        HStack(alignment: .center, spacing: 3) {
            ForEach(levels.indices, id: \.self) { i in
                Capsule()
                    .fill(MeeshyColors.error)
                    .frame(width: 4, height: max(4, levels[i] * 56))
                    .animation(.easeInOut(duration: 0.08), value: levels[i])
            }
        }
    }
}

// MARK: - Audio Language Picker

struct AudioLanguagePickerView: View {
    @Binding var selectedLocale: Locale
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""
    @State private var showAllLanguages = false

    private var listedLocales: [(locale: Locale, name: String)] {
        let locales = showAllLanguages
            ? EdgeTranscriptionService.shared.supportedLocales
            : EdgeTranscriptionService.shared.availableLocales
        return locales.compactMap { locale -> (Locale, String)? in
            guard let name = Locale.current.localizedString(forIdentifier: locale.identifier) else {
                return nil
            }
            let cap = name.prefix(1).uppercased() + name.dropFirst()
            return (locale, cap)
        }
        .sorted { $0.1 < $1.1 }
    }

    private var filteredLocales: [(locale: Locale, name: String)] {
        guard !searchText.isEmpty else { return listedLocales }
        let q = searchText.lowercased()
        return listedLocales.filter {
            $0.name.lowercased().contains(q) ||
            $0.locale.identifier.lowercased().contains(q)
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Toggle(isOn: $showAllLanguages) {
                        Text(String(localized: "Afficher toutes les langues",
                                    defaultValue: "Afficher toutes les langues"))
                            .font(.subheadline)
                            .foregroundColor(theme.textPrimary)
                    }
                    .tint(MeeshyColors.indigo500)
                } footer: {
                    Text(String(
                        localized: "Par defaut, seules les langues disponibles sur cet appareil sont listees.",
                        defaultValue: "Par d\u{00E9}faut, seules les langues disponibles sur cet appareil sont list\u{00E9}es."
                    ))
                    .font(.caption)
                    .foregroundColor(theme.textMuted)
                }

                Section {
                    ForEach(filteredLocales, id: \.locale.identifier) { item in
                        Button {
                            selectedLocale = item.locale
                            HapticFeedback.light()
                            dismiss()
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.name)
                                        .font(.callout.weight(
                                            selectedLocale.identifier == item.locale.identifier
                                                ? .semibold : .regular
                                        ))
                                        .foregroundColor(theme.textPrimary)
                                    Text(item.locale.identifier)
                                        .font(.caption)
                                        .foregroundColor(theme.textMuted)
                                }
                                Spacer()
                                if selectedLocale.identifier == item.locale.identifier {
                                    Image(systemName: "checkmark")
                                        .font(.subheadline.weight(.bold))
                                        .foregroundColor(MeeshyColors.indigo500)
                                }
                            }
                        }
                    }
                }
            }
            .searchable(text: $searchText,
                        prompt: String(localized: "Rechercher une langue",
                                       defaultValue: "Rechercher une langue"))
            .navigationTitle(String(localized: "Langue de l'audio",
                                    defaultValue: "Langue de l'audio"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(String(localized: "Fermer", defaultValue: "Fermer")) {
                        dismiss()
                    }
                    .foregroundColor(MeeshyColors.indigo500)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}
