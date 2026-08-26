import SwiftUI
import Combine
import AVFoundation
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

// MARK: - Audio Post Composer

/// Composer d'un post/réel audio. Depuis 2026-08-13 la CAPTURE passe par la
/// feuille unifiée (`UnifiedAudioRecorderSheet`, MeeshyUI) — le même composant
/// que le composer de story — qui apporte aussi les portes « Fichiers » et
/// « Bibliothèque » : un post/réel peut désormais RÉUTILISER un son de la
/// bibliothèque au lieu d'enregistrer. La transcription on-device, le sélecteur
/// de locale et le flux de publication restent propres à ce composer.
struct AudioPostComposerView: View {
    /// Duration (ms) feeds `ReelComposition`'s 3-second qualification floor —
    /// without it the composer couldn't tell a short clip from a long one.
    let onPublish: (URL, String, Int, MobileTranscriptionPayload?) -> Void
    /// Publication d'un son EMPRUNTÉ à la bibliothèque : aucun fichier à
    /// uploader — le parent publie un post/réel dont la piste référence
    /// `sound.id` (voir `FeedView+Attachments.publishBorrowedSoundPost`).
    let onPublishBorrowed: (APISound) -> Void

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
    @StateObject private var audioRecorder = AudioRecorderManager()

    @State private var transcription: OnDeviceTranscription?
    @State private var transcriptionError: String?
    @State private var recordedURL: URL?
    @State private var recordedDuration: TimeInterval = 0
    @State private var recordedMimeType = "audio/mp4"
    @State private var borrowedSound: APISound?
    @State private var phase: ComposerPhase = .idle
    @State private var selectedLocale: Locale = AudioPostComposerView.initialLocale()
    @State private var showLanguagePicker = false
    @State private var showAudioImporter = false
    @State private var showSoundLibrary = false

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
                        if phase == .idle || phase == .recording {
                            // LA feuille unifiée d'enregistrement (partagée avec
                            // le composer de story) : record/stop/cancel,
                            // waveform live, durée sans plafond, chips Fichiers
                            // et Bibliothèque. La strip de langue est masquée —
                            // ce composer possède son propre sélecteur de locale
                            // de transcription, plus riche (disponibilité
                            // on-device + picker complet).
                            UnifiedAudioRecorderSheet(
                                recorder: audioRecorder,
                                preferredLanguage: Self.shortDisplayName(for: selectedLocale).lowercased(),
                                showsLanguageStrip: false,
                                onImportAudioFile: { showAudioImporter = true },
                                onOpenSoundLibrary: { showSoundLibrary = true },
                                onRecordComplete: { url, _ in
                                    acceptRecording(url: url, mimeType: "audio/mp4")
                                }
                            )
                            .frame(minHeight: 320)
                        } else {
                            statusCard
                        }
                        if borrowedSound == nil {
                            languageSelector
                        }
                        contentPanel
                        Color.clear.frame(height: 100)
                    }
                    .padding(.horizontal, MeeshySpacing.xl)
                    .padding(.top, MeeshySpacing.lg)
                }
                .fileImporter(isPresented: $showAudioImporter,
                              allowedContentTypes: [.audio]) { result in
                    if case .success(let url) = result {
                        importAudioFile(from: url)
                    }
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
        .sheet(isPresented: $showSoundLibrary) {
            SoundLibraryPicker(
                onPick: { sound in
                    borrowedSound = sound
                    phase = .preview
                    showSoundLibrary = false
                },
                onCancel: { showSoundLibrary = false }
            )
        }
        .adaptiveOnChange(of: audioRecorder.isRecording) { _, isRecording in
            // La feuille unifiée possède le flux record/stop ; le composer ne
            // fait que suivre pour griser son sélecteur de langue.
            if phase == .idle || phase == .recording {
                phase = isRecording ? .recording : .idle
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

    // MARK: - Status Card (transcription / préview)

    /// Carte d'état hors capture : la phase idle/recording est entièrement
    /// portée par la feuille unifiée (`UnifiedAudioRecorderSheet`).
    private var statusCard: some View {
        VStack(spacing: 18) {
            ZStack {
                Circle()
                    .fill(haloColor.opacity(0.12))
                    .frame(width: 168, height: 168)
                    .blur(radius: 4)

                Circle()
                    .fill(haloColor.opacity(0.08))
                    .frame(width: 132, height: 132)

                centerContent
                    // Visualisation d'état purement décorative (sceau / note /
                    // spinner). L'état parlé est porté par `durationLabel` juste
                    // en dessous → on masque le décor pour éviter le bruit
                    // VoiceOver.
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
        if phase == .transcribing {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: MeeshyColors.indigo500))
                .scaleEffect(1.6)
        } else if borrowedSound != nil {
            Image(systemName: "music.note.list")
                .font(MeeshyFont.relative(56))
                .foregroundStyle(MeeshyColors.brandGradient)
        } else {
            Image(systemName: "checkmark.seal.fill")
                .font(MeeshyFont.relative(56))
                .foregroundStyle(
                    LinearGradient(
                        colors: [MeeshyColors.success, MeeshyColors.success.opacity(0.7)],
                        startPoint: .top, endPoint: .bottom
                    )
                )
        }
    }

    private var haloColor: Color {
        if phase == .preview { return borrowedSound != nil ? MeeshyColors.indigo500 : MeeshyColors.success }
        return MeeshyColors.indigo500
    }

    @ViewBuilder
    private var durationLabel: some View {
        if phase == .preview, let borrowedSound {
            VStack(spacing: 4) {
                Text(borrowedSound.hasAuthoredTitle
                     ? borrowedSound.title
                     : String(localized: "Son original", defaultValue: "Son original"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
                Text(borrowedSound.authorLabel.map { "@\($0)" } ?? "")
                    .font(.caption)
                    .foregroundColor(theme.textSecondary)
                Text(formattedDuration)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundColor(theme.textMuted)
            }
        } else if phase == .preview {
            Text(formattedDuration)
                .font(.system(.largeTitle, design: .monospaced).weight(.light))
                .foregroundColor(theme.textPrimary)
                // A bare monospaced "0:34" reads to VoiceOver as a context-less
                // number. Name what the timer measures via the label and expose
                // the running time as the value.
                .accessibilityLabel(String(localized: "Durée enregistrée",
                                           defaultValue: "Dur\u{00E9}e enregistr\u{00E9}e"))
                .accessibilityValue(spokenDuration)
        } else if phase == .transcribing {
            VStack(spacing: 4) {
                Text(String(localized: "Transcription en cours...", defaultValue: "Transcription en cours..."))
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(theme.textSecondary)
                Text(formattedDuration)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundColor(theme.textMuted)
            }
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
            // Le bouton record vit dans la feuille unifiée — plus de doublon.
            EmptyView()
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

    private var elapsedSeconds: TimeInterval {
        borrowedSound?.durationSeconds ?? recordedDuration
    }

    private var formattedDuration: String {
        LocalizedNumber.duration(seconds: elapsedSeconds)
    }

    /// Ce que VoiceOver ENTEND — « 34 secondes », jamais l'horloge « 0:34 »,
    /// que le synthétiseur lirait comme une heure.
    private var spokenDuration: String {
        LocalizedNumber.spokenDuration(seconds: elapsedSeconds)
    }

    /// Entrée UNIQUE des fichiers audio propres — enregistrement (feuille
    /// unifiée) comme import Fichiers : durée native lue de l'asset (même
    /// méthode que le composer de story), puis transcription on-device.
    private func acceptRecording(url: URL, mimeType: String) {
        transcription = nil
        transcriptionError = nil
        borrowedSound = nil
        recordedURL = url
        recordedMimeType = mimeType
        recordedDuration = audioRecorder.duration
        phase = .transcribing
        HapticFeedback.light()
        Task {
            if let seconds = try? await AVURLAsset(url: url).load(.duration).seconds,
               seconds.isFinite, seconds > 0 {
                recordedDuration = seconds
            }
            runTranscription(url: url)
        }
    }

    /// Import depuis Fichiers : copie locale (l'URL security-scoped du picker
    /// ne survit pas à la feuille), MIME dérivé de l'extension.
    private func importAudioFile(from pickedURL: URL) {
        let accessing = pickedURL.startAccessingSecurityScopedResource()
        defer { if accessing { pickedURL.stopAccessingSecurityScopedResource() } }
        let ext = pickedURL.pathExtension.isEmpty ? "m4a" : pickedURL.pathExtension
        let localURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString + "." + ext)
        do {
            try? FileManager.default.removeItem(at: localURL)
            try FileManager.default.copyItem(at: pickedURL, to: localURL)
        } catch {
            transcriptionError = String(localized: "Import du fichier audio impossible",
                                        defaultValue: "Import du fichier audio impossible")
            phase = .preview
            return
        }
        acceptRecording(url: localURL, mimeType: Self.mimeType(forExtension: ext))
    }

    private static func mimeType(forExtension ext: String) -> String {
        switch ext.lowercased() {
        case "mp3": return "audio/mpeg"
        case "wav": return "audio/wav"
        case "aac": return "audio/aac"
        case "ogg", "oga": return "audio/ogg"
        default: return "audio/mp4"
        }
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
        borrowedSound = nil
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
        if let borrowedSound {
            onPublishBorrowed(borrowedSound)
            return
        }
        guard let url = recordedURL else { return }
        let payload = transcription.map { buildPayload($0) }
        onPublish(url, recordedMimeType, Int(recordedDuration * 1000), payload)
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
