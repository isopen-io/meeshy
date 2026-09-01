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
    /// Publication d'un son EMPRUNTÉ, **avec son rognage** (#4657).
    ///
    /// L'intervalle est `nil` quand rien n'a été rogné. Il ne voyage PAS comme
    /// un fichier : un son de la bibliothèque garde son `soundId`, et son
    /// rognage se porte par `sourceStart`/`sourceEnd` sur l'objet audio — le
    /// crédit de son auteur survit au découpage, ce qu'un ré-upload aurait
    /// détruit.
    let onPublishBorrowed: (APISound, ClosedRange<TimeInterval>?) -> Void
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
    /// **Supprimer le son qu'on ÉDITE.** `nil` ⇒ la feuille crée, elle n'édite
    /// pas : le bouton ne se monte pas du tout (voir `+Deletion`).
    var onDelete: (() -> Void)? = nil
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
        /// Le texte DÉJÀ écrit pour cette piste. Sans lui, rouvrir un son
        /// affichait une feuille muette sur une transcription qui existait.
        let transcription: MobileTranscriptionPayload?

        init(url: URL, duration: TimeInterval, mimeType: String = "audio/mp4",
             transcription: MobileTranscriptionPayload? = nil) {
            self.url = url
            self.duration = duration
            self.mimeType = mimeType
            self.transcription = transcription
        }
    }

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    var theme: ThemeManager { ThemeManager.shared }
    @StateObject private var audioRecorder = AudioRecorderManager()

    @State var transcription: OnDeviceTranscription?
    @State var transcriptionError: String?
    @State var recordedURL: URL?
    @State var recordedDuration: TimeInterval = 0
    @State var recordedMimeType = "audio/mp4"
    @State var borrowedSound: APISound?
    @State var phase: ComposerPhase = .idle
    @State var selectedLocale: Locale = AudioPostComposerView.initialLocale()
    @State var showLanguagePicker = false
    @State private var showAudioImporter = false
    @State private var showSoundLibrary = false
    /// L'intervalle CONSERVÉ de la piste (#4657). Il vaut la piste entière tant
    /// que l'auteur n'a pas touché une poignée — la sélection par défaut est
    /// « tout », jamais un rognage qu'on n'a pas demandé.
    @State var trimRange: ClosedRange<TimeInterval> = 0...0
    /// L'éditeur de transcription manuelle — le repli « Rédiger » (#4657).
    @State var showManualTranscription = false
    /// La suppression se CONFIRME : un son enregistré est unique, et un doigt
    /// posé de travers ne doit pas l'effacer.
    @State var showDeleteConfirmation = false
    @State private var isExportingTrim = false
    /// **Où en est le rapatriement de la piste** (#4667). `direct` pour un
    /// enregistrement ou un import — leur fichier est déjà là.
    @State var acquisition: AudioTrackAcquisition = .direct
    /// Le son emprunté que « Réessayer » relance. Distinct de `borrowedSound`,
    /// qui reste posé pendant l'échec : celui-ci dit ce qu'il faut RETENTER.
    @State private var pendingBorrowedDownload: APISound?

    enum ComposerPhase {
        case idle, recording, transcribing, preview
    }

    // Washes sombres intentionnels — pas de token MeeshyColors equivalent
    private let darkCanvasTop = Color(hex: "0F0D19")
    private let darkCanvasBase = Color(hex: "13111C")

    var isDark: Bool { colorScheme == .dark }

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
                            // Rétréci (directive porteur 2026-09-01) : ce carré
                            // porte UN bouton et un compteur ; la place qu'il
                            // prenait est celle dont le placement et le rognage
                            // ont besoin, plus bas.
                            .frame(minHeight: 220)
                        } else {
                            statusCard
                        }
                        // **Le placement suit immédiatement le carré du son**
                        // (directive porteur 2026-09-01) : c'est la décision qui
                        // dit ce que la publication DEVIENT, et elle se prend en
                        // regardant ce qu'on vient d'enregistrer — pas en bas
                        // d'un écran qu'il faut faire défiler.
                        placementSection
                        if offersTranscription {
                            languageSelector
                        }
                        contentPanel
                        trimSection
                        // `safeAreaInset` ci-dessous retranche la hauteur RÉELLE
                        // de la barre, mesurée par SwiftUI — jamais un nombre
                        // écrit à la main, qui mentirait au premier changement de
                        // Dynamic Type. Ce ressort n'est donc PAS une réserve de
                        // hauteur : c'est la RESPIRATION entre le dernier bloc et
                        // la barre.
                        //
                        // Portée de `md` à `xxl` (#4676) : mesuré à l'écran, les
                        // pilules « Refaire » / « Ajouter » venaient au contact
                        // des poignées de rognage et rognaient leur arrondi bas.
                        // L'inset réservait bien la place — il ne laissait aucun
                        // air, et un contrôle collé à un autre se lit comme un
                        // recouvrement.
                        Color.clear.frame(height: MeeshySpacing.xxl)
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
                // **La barre d'action RÉSERVE sa place, sur le DÉFILEMENT**
                // (#4657). En overlay dans le `ZStack`, elle recouvrait le
                // dernier bloc dès que le contenu ne défilait pas — un ressort
                // au bas du défilement ne réserve rien quand il n'y a rien à
                // faire défiler.
                //
                // Et l'inset se pose ICI, pas sur le `ZStack` : posé sur le
                // conteneur, il en emportait la LARGEUR avec lui et tout le
                // contenu se décalait, bords gauche et droit rognés — mesuré à
                // l'écran, pas déduit.
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    actionBar
                        .padding(.horizontal, MeeshySpacing.xl)
                        .padding(.top, MeeshySpacing.md)
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
                ToolbarItem(placement: .destructiveAction) { deleteButton }
            }
        }
        .sheet(isPresented: $showSoundLibrary) {
            SoundLibraryPicker(
                onPick: { sound in
                    showSoundLibrary = false
                    adopterSonEmprunte(sound)
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
            .frame(height: 132)

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

    // MARK: - Rognage et placement

    /// **La zone de rognage** — montée dès qu'une piste existe, quelle que soit
    /// sa provenance : un enregistrement, un fichier, un son de bibliothèque.
    @ViewBuilder
    private var trimSection: some View {
        // **Ce que la zone rend est une DÉCISION, prise ailleurs** (#4667) :
        // quatre cas exclusifs, éprouvables sans monter l'écran. Les conditions
        // écrites dans un `@ViewBuilder` ne s'interrogent qu'à la garde de
        // source, et une garde de source ne dit pas ce que l'auteur VOIT.
        switch AudioTrimSection.resolve(acquisition: acquisition,
                                        hasLocalTrack: recordedURL != nil,
                                        duration: recordedDuration) {
        case .hidden:
            EmptyView()
        case .loading:
            trimPlaceholder {
                HStack(spacing: 8) {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: MeeshyColors.indigo500))
                    Text(String(localized: "composer.audio.trim.loading",
                                defaultValue: "Chargement du son…", bundle: .main))
                        .font(.caption)
                        .foregroundColor(theme.textSecondary)
                }
            }
        case .failed:
            trimPlaceholder {
                VStack(alignment: .leading, spacing: 8) {
                    Text(String(localized: "composer.audio.trim.load-failed",
                                defaultValue: "Le son n'a pas pu être chargé.", bundle: .main))
                        .font(.caption)
                        .foregroundColor(theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Button(String(localized: "common.retry",
                                  defaultValue: "Réessayer", bundle: .main)) {
                        retryBorrowedDownload()
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundColor(MeeshyColors.indigo500)
                }
            }
        case .trimmer:
            VStack(alignment: .leading, spacing: 10) {
                trimHeader
                if let url = recordedURL {
                    MeeshyAudioTrimmer(
                        url: url,
                        duration: recordedDuration,
                        range: $trimRange,
                        tint: MeeshyColors.indigo500
                    )
                }
            }
        }
    }

    private var trimHeader: some View {
        HStack(spacing: 6) {
            Image(systemName: "scissors")
                .font(.caption.weight(.semibold))
                .accessibilityHidden(true)
            Text(String(localized: "composer.audio.trim.title",
                        defaultValue: "Rogner", bundle: .main))
                .font(.caption.weight(.semibold))
            Spacer()
            if acquisition == .direct {
                Text(Self.rangeLabel(trimRange))
                    .font(.caption.monospacedDigit())
                    .foregroundColor(theme.textMuted)
            }
        }
        .foregroundColor(theme.textSecondary)
    }

    /// **L'attente et l'échec occupent la MÊME place que les poignées.** Une
    /// zone qui apparaît d'un coup pousse tout ce qui la suit ; en réservant sa
    /// hauteur, le placement et le panneau de contenu ne sautent pas quand la
    /// piste arrive.
    @ViewBuilder
    private func trimPlaceholder<Contenu: View>(@ViewBuilder _ contenu: () -> Contenu) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            trimHeader
            contenu()
                .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
                .padding(.horizontal, 12)
                .background(
                    RoundedRectangle(cornerRadius: 14)
                        .fill(theme.surface(tint: "C7D2FE"))
                )
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
            VStack(alignment: .leading, spacing: 6) {
                // **Sans titre** (directive porteur 2026-09-01). « Place du
                // son » nommait ce que les deux libellés disent déjà — « fond
                // de publication », « contenu de publication » se lisent seuls.
                // Un en-tête qui répète son contenu vole une ligne au rognage.
                HStack(spacing: 0) {
                    ForEach(ComposerAudioRole.allCases, id: \.self) { role in
                        placementHalf(role, binding: placement)
                    }
                }
                .background(
                    RoundedRectangle(cornerRadius: 14)
                        .fill(theme.surface(tint: "C7D2FE"))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(MeeshyColors.indigo400.opacity(0.25), lineWidth: 1)
                )

                // La définition passe SOUS l'interrupteur, sur une ligne, pour
                // celle qui est choisie — c'est ce qui divise sa hauteur par
                // deux. Le prix est réel et assumé : il faut choisir une moitié
                // pour lire ce qu'elle fait. Les deux libellés étant explicites,
                // la ligne CONFIRME plutôt qu'elle n'enseigne.
                Text(borrowedSound != nil
                     ? ComposerSoundRoleCopy.borrowedForegroundRefusal
                     : ComposerSoundRoleCopy.description(placement.wrappedValue))
                    .font(.caption2)
                    .foregroundColor(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// Une moitié de l'interrupteur — son libellé, et rien d'autre.
    ///
    /// La description a quitté chaque moitié pour la ligne unique sous
    /// l'interrupteur : deux titres et deux sous-titres empilés faisaient un
    /// bloc de 88 pt là où la décision en mérite 44.
    @ViewBuilder
    private func placementHalf(_ role: ComposerAudioRole,
                               binding: Binding<ComposerAudioRole>) -> some View {
        let choisi = binding.wrappedValue == role
        // Le premier plan fait du son une pièce jointe, c'est-à-dire un FICHIER
        // de la publication : un son de la bibliothèque devrait être ré-uploadé
        // pour en devenir une, donc détaché de son `soundId` et du crédit de son
        // auteur. La moitié reste MONTRÉE et désactivée — une option absente se
        // lit comme une capacité qui n'existe pas.
        let refuse = (role == .foreground && borrowedSound != nil)

        Button {
            guard !refuse else { return }
            binding.wrappedValue = role
            HapticFeedback.light()
        } label: {
            Text(ComposerSoundRoleCopy.label(role))
                .font(.footnote.weight(.semibold))
                .foregroundColor(choisi ? .white : theme.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 11)
                .padding(.horizontal, 8)
                .background(
                    RoundedRectangle(cornerRadius: 14)
                        .fill(choisi ? AnyShapeStyle(MeeshyColors.brandGradient) : AnyShapeStyle(Color.clear))
                )
                .contentShape(RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .disabled(refuse)
        .opacity(refuse ? 0.4 : 1)
        .accessibilityLabel(ComposerSoundRoleCopy.label(role))
        .accessibilityHint(refuse
                           ? ComposerSoundRoleCopy.borrowedForegroundRefusal
                           : ComposerSoundRoleCopy.description(role))
        .accessibilityAddTraits(choisi ? [.isSelected] : [])
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

                // **« Ajouter », pas « Publier »** (directive porteur
                // 2026-09-01). Cette feuille ne publie rien : elle remet un son
                // au composer, qui publiera plus tard. Un bouton qui dit
                // « Publier » promet un envoi que le tap ne déclenche pas — et
                // c'est le genre de promesse qui fait fermer l'app en croyant
                // avoir posté.
                // **Il ATTEND la piste** (#4667). Valider pendant le
                // rapatriement posait le son ENTIER : `needsExport` refuse de
                // découper une durée encore nulle, donc les poignées — que
                // l'auteur n'a pas encore pu bouger — n'auraient rien changé.
                // Un bouton grisé pendant deux secondes dit ce qui se passe ;
                // un bouton qui répond en ignorant l'intention ne le dit pas.
                let attend = acquisition != .direct
                Button(action: publish) {
                    Text(String(localized: "composer.audio.confirm",
                                defaultValue: "Ajouter", bundle: .main))
                        .font(.callout.weight(.bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(
                            Capsule()
                                .fill(MeeshyColors.brandGradient)
                                .shadow(color: MeeshyColors.indigo500.opacity(0.4), radius: 12, y: 4)
                        )
                        .opacity(attend ? 0.5 : 1)
                }
                .disabled(attend)
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
        acquisition = .direct
        recordedURL = initialAudio.url
        recordedMimeType = initialAudio.mimeType
        recordedDuration = initialAudio.duration
        trimRange = 0...max(0.001, initialAudio.duration)
        transcription = Self.adopt(initialAudio.transcription)
        phase = .preview
    }

    /// **Rapatrier un son de la bibliothèque pour le rendre ROGNABLE**
    /// (directive porteur 2026-09-01).
    ///
    /// Le rognage se règle à l'oreille : il faut ENTENDRE le segment qu'on
    /// délimite, et une bande dessinée depuis `sound.waveform` sans fichier
    /// derrière ne se joue pas. On copie donc la piste dans le dossier
    /// temporaire — la même matière que pour un enregistrement ou un import,
    /// donc le MÊME composant sans cas particulier.
    ///
    /// Ce fichier ne PART jamais : il ne sert qu'à écouter et à viser. Ce qui
    /// voyage à la publication reste le `soundId` et l'intervalle
    /// (`sourceStart`/`sourceEnd`), qui préservent le crédit de l'auteur.
    ///
    /// Un échec de téléchargement n'est pas fatal : la vue retombe sur ce
    /// qu'elle faisait avant — le son est adopté, non rognable — plutôt que de
    /// refuser un emprunt qui marchait.
    private func adopterSonEmprunte(_ sound: APISound) {
        borrowedSound = sound
        // Le premier plan lui est refusé : le laisser SÉLECTIONNÉ afficherait
        // un choix que la publication ne peut pas honorer.
        if placement?.wrappedValue == .foreground { placement?.wrappedValue = .background }
        recordedURL = nil
        transcription = nil
        transcriptionError = nil
        phase = .preview
        let duree = sound.durationSeconds ?? 0
        recordedDuration = duree
        trimRange = 0...max(0.001, duree)

        rapatrier(sound)
    }

    /// **Le rapatriement, et ses trois issues NOMMÉES** (#4667).
    ///
    /// Il n'en avait qu'une avant : un `return` muet, servi aussi bien pour une
    /// URL irrésolue que pour un réseau coupé ou un fichier vide. L'écran
    /// affichait alors ce qu'il affiche quand il n'y a rien à rogner — et le
    /// porteur en a conclu, à raison, que le rognage ne marchait pas.
    ///
    /// Ce fichier ne PART jamais : il ne sert qu'à écouter et à viser. Ce qui
    /// voyage à la publication reste le `soundId` et l'intervalle
    /// (`sourceStart`/`sourceEnd`), qui préservent le crédit de l'auteur.
    private func rapatrier(_ sound: APISound) {
        pendingBorrowedDownload = sound
        guard let distante = MeeshyConfig.resolveMediaURL(sound.fileUrl) else {
            acquisition = .failed
            return
        }
        acquisition = .loading
        Task {
            guard let (donnees, _) = try? await URLSession.shared.data(from: distante),
                  !donnees.isEmpty else {
                acquisition = .failed
                return
            }
            let extension_ = distante.pathExtension.isEmpty ? "m4a" : distante.pathExtension
            let locale = FileManager.default.temporaryDirectory
                .appendingPathComponent("meeshy-borrowed-\(sound.id).\(extension_)")
            try? donnees.write(to: locale, options: .atomic)
            guard FileManager.default.fileExists(atPath: locale.path) else {
                acquisition = .failed
                return
            }
            // **L'auteur a pu changer de son pendant le téléchargement.**
            // Écrire la piste d'un son qu'il ne regarde plus lui ferait rogner
            // le mauvais extrait, sans que rien ne le dise.
            guard borrowedSound?.id == sound.id else { return }
            recordedURL = locale
            recordedMimeType = Self.mimeType(forExtension: extension_)
            if let secondes = try? await AVURLAsset(url: locale).load(.duration).seconds,
               secondes.isFinite, secondes > 0 {
                recordedDuration = secondes
                trimRange = 0...secondes
            }
            acquisition = .direct
        }
    }

    /// « Réessayer » relance le MÊME son — celui que l'échec a retenu.
    private func retryBorrowedDownload() {
        guard let sound = pendingBorrowedDownload else { return }
        HapticFeedback.light()
        rapatrier(sound)
    }

    private func acceptRecording(url: URL, mimeType: String) {
        transcription = nil
        transcriptionError = nil
        borrowedSound = nil
        // Un enregistrement n'a rien à rapatrier : son fichier vient d'être
        // écrit. Sans cette remise à zéro, l'échec d'un emprunt PRÉCÉDENT
        // masquerait les poignées d'une piste pourtant présente.
        pendingBorrowedDownload = nil
        acquisition = .direct
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

    func retryTranscription() {
        guard let url = recordedURL else { return }
        transcriptionError = nil
        phase = .transcribing
        runTranscription(url: url)
    }

    func runTranscription(url: URL) {
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

    func cancelTranscription() {
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
        // Sans cette remise à zéro, un échec de rapatriement survivrait à
        // « Refaire » et masquerait les poignées de l'enregistrement suivant.
        pendingBorrowedDownload = nil
        acquisition = .direct
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
            // Rogné ou non : c'est `needsExport` qui tranche, la même règle que
            // pour un fichier local. `nil` ⇒ le son part entier, comme avant.
            let rogne = AudioSegmentExporter.needsExport(range: trimRange, fullDuration: recordedDuration)
            onPublishBorrowed(borrowedSound, rogne ? trimRange : nil)
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

    func buildPayload(_ t: OnDeviceTranscription) -> MobileTranscriptionPayload {
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
