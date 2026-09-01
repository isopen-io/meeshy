import SwiftUI
import Combine
import AVFoundation
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

// MARK: - Audio Post Composer

/// Composer d'un post/réel audio. Depuis 2026-08-13 la CAPTURE passe par la
/// feuille unifiée (`AudioRecorderSheet`, MeeshyUI) — le même composant
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
    /// **Le PLACEMENT du son** (#4657) — en fond ou au premier plan.
    ///
    /// `nil` ⇒ l'hôte n'a qu'une destination et n'offre donc pas le choix : la
    /// section ne se monte pas. C'est ce qui permet à cette vue de servir
    /// l'entrée « Vocal » ET l'entrée « Ajouter un son » sans que la seconde
    /// hérite d'un contrôle sans effet chez la première.
    var placement: Binding<ComposerAudioRole>? = nil
    /// **Un son DÉJÀ acquis, à rogner** (#4657).
    ///
    /// C'est ce qui rend cette vue réutilisable partout où l'on doit rogner :
    /// l'appelant qui tient déjà un fichier n'a pas à passer par la capture. La
    /// vue s'ouvre alors directement sur l'aperçu, ses poignées et son
    /// placement.
    var initialAudio: ExistingAudio? = nil
    /// La transcription est-elle OFFERTE ? Un rognage pur ne transcrit pas — et
    /// monter le sélecteur de langue d'une transcription qui n'aura pas lieu
    /// serait un contrôle sans effet.
    var offersTranscription: Bool = true
    /// Le titre de l'écran. « Création audio » par défaut ; un appelant qui ne
    /// fait que rogner dit ce qu'il fait.
    var title: String = String(localized: "composer.audio.title",
                               defaultValue: "Création audio", bundle: .main)

    /// Une piste déjà acquise, remise à la vue pour être rognée.
    struct ExistingAudio {
        let url: URL
        let duration: TimeInterval
        let mimeType: String

        init(url: URL, duration: TimeInterval, mimeType: String = "audio/mp4") {
            self.url = url
            self.duration = duration
            self.mimeType = mimeType
        }
    }

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
    /// L'intervalle CONSERVÉ de la piste (#4657). Il vaut la piste entière tant
    /// que l'auteur n'a pas touché une poignée — la sélection par défaut est
    /// « tout », jamais un rognage qu'on n'a pas demandé.
    @State private var trimRange: ClosedRange<TimeInterval> = 0...0
    @State private var isExportingTrim = false

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
                            // **Les trois SOURCES au même rang** (#4657).
                            //
                            // « Fichiers » et « Bibliothèque » vivaient SOUS le
                            // titre « Enregistrement », dans le cadre de la
                            // capture : elles s'y lisaient comme deux options de
                            // l'enregistrement, ce qu'elles ne sont pas. Elles
                            // sortent du cadre ; le recorder ne reçoit plus leurs
                            // closures, donc il ne les rend plus — l'absence est
                            // structurelle, pas un drapeau.
                            if phase == .idle {
                                AudioRecorderSourceChips(
                                    onImportAudioFile: { showAudioImporter = true },
                                    onOpenSoundLibrary: { showSoundLibrary = true }
                                )
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            // LA feuille unifiée d'enregistrement (partagée avec
                            // le composer de story) : record/stop/cancel,
                            // waveform live, durée sans plafond. La strip de
                            // langue est masquée — ce composer possède son propre
                            // sélecteur de locale de transcription, plus riche
                            // (disponibilité on-device + picker complet).
                            AudioRecorderSheet(
                                recorder: audioRecorder,
                                preferredLanguage: Self.shortDisplayName(for: selectedLocale).lowercased(),
                                showsLanguageStrip: false,
                                onRecordComplete: { url, _ in
                                    acceptRecording(url: url, mimeType: "audio/mp4")
                                }
                            )
                            .frame(minHeight: 300)
                        } else {
                            statusCard
                        }
                        if borrowedSound == nil, offersTranscription {
                            languageSelector
                        }
                        contentPanel
                        trimSection
                        placementSection
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
            .task { adopterAudioInitial() }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)) {
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
    /// portée par la feuille unifiée (`AudioRecorderSheet`).
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
                     : String(localized: "media.sound.original", defaultValue: "Son original"))
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
                .accessibilityLabel(String(localized: "composer.audio.recorded-duration", defaultValue: "Durée enregistrée"))
                .accessibilityValue(spokenDuration)
        } else if phase == .transcribing {
            VStack(spacing: 4) {
                Text(String(localized: "composer.audio.transcription.running", defaultValue: "Transcription en cours…"))
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
                Text(String(localized: "composer.audio.transcription.language", defaultValue: "Langue de transcription"))
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
                Text(String(localized: "common.more", defaultValue: "Plus"))
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
        .accessibilityLabel(String(localized: "composer.audio.languages.more", defaultValue: "Plus de langues"))
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
        // **Les langues que l'app EXPÉDIE, toutes** (#4657). Le repli valait
        // `["fr", "en"]` et le tout était coupé à quatre : un lecteur
        // germanophone, hispanophone ou italophone devait passer par le « + »
        // pour transcrire dans SA langue, alors que l'app la sert. Les sept
        // locales du catalogue viennent donc en secours, dans l'ordre où
        // `CFBundleLocalizations` les déclare, après ce que le compte et le
        // clavier ont déjà nommé.
        seeds.append(contentsOf: Self.shippedLanguageCodes)

        let normalized = seeds.map { code in
            EdgeTranscriptionService.normalizedLocale(for: Locale(identifier: code))
        }

        var seen = Set<String>()
        return normalized.filter { seen.insert($0.identifier).inserted }
            .prefix(Self.shippedLanguageCodes.count).map { $0 }
    }

    /// Les langues expédiées, LUES au bundle plutôt que retapées : une huitième
    /// locale ajoutée au catalogue apparaîtra ici sans qu'on y pense, et une
    /// retirée disparaîtra — c'est ce qu'une liste recopiée ne fait jamais.
    private static var shippedLanguageCodes: [String] {
        let declarees = Bundle.main.object(forInfoDictionaryKey: "CFBundleLocalizations") as? [String]
        let codes = (declarees ?? []).map { String($0.prefix(2)) }
        return codes.isEmpty ? ["fr", "en", "de", "es", "it", "pt", "ar"] : codes
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

    // MARK: - Rognage et placement

    /// **La zone de rognage** — montée dès qu'une piste existe, quelle que soit
    /// sa provenance : un enregistrement, un fichier, un son de bibliothèque.
    @ViewBuilder
    private var trimSection: some View {
        if let url = recordedURL, recordedDuration > 0 {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    Image(systemName: "scissors")
                        .font(.caption.weight(.semibold))
                        .accessibilityHidden(true)
                    Text(String(localized: "composer.audio.trim.title",
                                defaultValue: "Rogner", bundle: .main))
                        .font(.caption.weight(.semibold))
                    Spacer()
                    Text(Self.rangeLabel(trimRange))
                        .font(.caption.monospacedDigit())
                        .foregroundColor(theme.textMuted)
                }
                .foregroundColor(theme.textSecondary)

                MeeshyAudioTrimmer(
                    url: url,
                    duration: recordedDuration,
                    range: $trimRange,
                    tint: MeeshyColors.indigo500
                )
            }
        }
    }

    /// **Le PLACEMENT, en bas** — c'est lui qui remplace le choix de la porte.
    ///
    /// Avant #4657, « Vocal » et « Ajouter un son » différaient par leur
    /// DESTINATION, et l'auteur devait la deviner au bouton qu'il pressait.
    /// Elle se choisit désormais, à l'endroit où l'on décide de publier.
    @ViewBuilder
    private var placementSection: some View {
        if let placement, recordedURL != nil || borrowedSound != nil {
            VStack(alignment: .leading, spacing: 10) {
                Text(ComposerSoundRoleCopy.title)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(theme.textSecondary)
                HStack(spacing: 8) {
                    ForEach(ComposerAudioRole.allCases, id: \.self) { role in
                        Button {
                            placement.wrappedValue = role
                            HapticFeedback.light()
                        } label: {
                            Text(ComposerSoundRoleCopy.label(role))
                                .font(.footnote.weight(.semibold))
                                .foregroundColor(placement.wrappedValue == role ? .white : theme.textPrimary)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 9)
                                .background(
                                    Capsule().fill(
                                        placement.wrappedValue == role
                                            ? AnyShapeStyle(MeeshyColors.brandGradient)
                                            : AnyShapeStyle(theme.surface(tint: "C7D2FE"))
                                    )
                                )
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(ComposerSoundRoleCopy.label(role))
                        .accessibilityAddTraits(placement.wrappedValue == role ? [.isSelected] : [])
                    }
                }
            }
        }
    }

    /// « 0:03 → 0:41 » — l'intervalle MONTRÉ.
    ///
    /// `LocalizedNumber.duration` et non un `String(format:)` : un format sans
    /// locale grave les chiffres LATINS, et un lecteur arabophone y lirait des
    /// chiffres qui ne sont pas les siens. VoiceOver, lui, lit la valeur PARLÉE
    /// que portent les poignées du composant — jamais cette horloge.
    private static func rangeLabel(_ range: ClosedRange<TimeInterval>) -> String {
        let debut = LocalizedNumber.duration(seconds: range.lowerBound)
        let fin = LocalizedNumber.duration(seconds: range.upperBound)
        return "\(debut) → \(fin)"
    }

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
                Text(String(localized: "composer.audio.transcription.title", defaultValue: "Transcription"))
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
                 ? String(localized: "composer.audio.transcription.none", defaultValue: "Aucune transcription disponible.")
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
                    Text(String(localized: "composer.audio.transcription.unavailable", defaultValue: "Transcription indisponible"))
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
                        Text(String(localized: "common.retry", defaultValue: "Réessayer"))
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
                        String(localized: "common.redo", defaultValue: "Refaire"),
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
                    Text(String(localized: "common.publish", defaultValue: "Publier"))
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
                    String(localized: "composer.audio.transcription.cancel", defaultValue: "Annuler la transcription"),
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
    /// **Adopter un son déjà acquis** — l'entrée « je viens juste rogner ».
    ///
    /// Elle ne transcrit pas : l'appelant qui remet une piste l'a déjà, et lui
    /// faire repayer une reconnaissance vocale qu'il n'a pas demandée serait du
    /// travail chaud pour rien. Elle ne s'exécute qu'UNE fois — `phase` sort de
    /// `.idle` et la garde tombe, ce qui la rend sûre sous un `task` que SwiftUI
    /// peut rejouer.
    private func adopterAudioInitial() {
        guard let initialAudio, phase == .idle, recordedURL == nil else { return }
        recordedURL = initialAudio.url
        recordedMimeType = initialAudio.mimeType
        recordedDuration = initialAudio.duration
        trimRange = 0...max(0.001, initialAudio.duration)
        phase = .preview
    }

    private func acceptRecording(url: URL, mimeType: String) {
        transcription = nil
        transcriptionError = nil
        borrowedSound = nil
        recordedURL = url
        recordedMimeType = mimeType
        recordedDuration = audioRecorder.duration
        // La sélection par défaut est la piste ENTIÈRE : un rognage qu'on n'a
        // pas demandé serait une perte silencieuse (#4657).
        trimRange = 0...max(0.001, audioRecorder.duration)
        phase = .transcribing
        HapticFeedback.light()
        Task {
            if let seconds = try? await AVURLAsset(url: url).load(.duration).seconds,
               seconds.isFinite, seconds > 0 {
                recordedDuration = seconds
                trimRange = 0...seconds
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
            transcriptionError = String(localized: "composer.audio.import.error", defaultValue: "Import du fichier audio impossible")
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
            localized: "composer.audio.transcription.cancelled", defaultValue: "Transcription annulée"
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

    /// **Publier applique le ROGNAGE.**
    ///
    /// Sans cette étape, les poignées seraient un contrôle inerte : l'auteur
    /// déplace deux bornes, voit la sélection changer, et publie la piste
    /// entière. `AudioSegmentExporter` rend l'URL d'origine quand rien n'est
    /// rogné — ne pas ré-encoder pour rien n'est pas une optimisation, c'est ce
    /// qui empêche la durée annoncée de bouger de quelques trames.
    ///
    /// Une découpe NÉCESSAIRE qui échoue fait renoncer : publier la piste
    /// entière ne serait pas ce que l'auteur a demandé, et rien à l'écran ne le
    /// lui dirait.
    private func publish() {
        if let borrowedSound {
            onPublishBorrowed(borrowedSound)
            return
        }
        guard let url = recordedURL, !isExportingTrim else { return }
        let payload = transcription.map { buildPayload($0) }
        let intervalle = trimRange
        let dureeTotale = recordedDuration

        guard AudioSegmentExporter.needsExport(range: intervalle, fullDuration: dureeTotale) else {
            onPublish(url, recordedMimeType, Int(dureeTotale * 1000), payload)
            return
        }

        isExportingTrim = true
        Task {
            let decoupee = await AudioSegmentExporter.export(
                url: url, range: intervalle, fullDuration: dureeTotale
            )
            isExportingTrim = false
            guard let decoupee else {
                transcriptionError = String(localized: "composer.audio.trim.error",
                                            defaultValue: "Le rognage a échoué", bundle: .main)
                return
            }
            let dureeRognee = intervalle.upperBound - intervalle.lowerBound
            onPublish(decoupee, "audio/mp4", Int(dureeRognee * 1000), payload)
        }
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
    /// Le titre de la feuille. Défaut : le contexte d'ORIGINE (la langue d'un
    /// audio). Un hôte qui remonte ce composant dans un AUTRE contexte — le
    /// meuble, dont la feuille nomme la langue du POST — passe le sien, sans
    /// que les trois appelants audio aient à répéter le défaut.
    var title: LocalizedStringResource = "Langue de l'audio"
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
                        Text(String(localized: "composer.audio.languages.show-all", defaultValue: "Afficher toutes les langues"))
                            .font(.subheadline)
                            .foregroundColor(theme.textPrimary)
                    }
                    .tint(MeeshyColors.indigo500)
                } footer: {
                    Text(String(
                        localized: "composer.audio.languages.hint", defaultValue: "Par défaut, seules les langues disponibles sur cet appareil sont listées."
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
                        prompt: String(localized: "composer.audio.languages.search", defaultValue: "Rechercher une langue"))
            .navigationTitle(Text(title))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)) {
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
