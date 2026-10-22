import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Ce que le vocal DIT : transcription, langues, sauvegarde (#10383)
//
// Extrait d'`AudioFullscreenView.swift` avec la page (le fichier était à 1 191
// lignes sur 1 200). Rien n'y change de règle : la transcription reste servie
// dans la langue élue par le Prisme (`selectedLanguage`, né de
// `SocialAudioTrack.openingSelection`), la feuille des langues reste celle des
// messages, et l'enregistrement passe toujours par le portillon de sortie.
// Seules les ENCRES changent : elles suivent le thème au lieu d'un blanc figé.

extension AudioFullscreenPage {

    // MARK: - Ce qui est servi

    /// Transcription serveur (item) sinon transcription locale on-device.
    var transcription: MessageTranscription? { item.transcription ?? localTranscription }

    /// Versions traduites du snapshot + celles arrivées en direct (dédupliquées
    /// par langue cible, le snapshot ayant priorité).
    var translatedAudios: [MessageTranslatedAudio] {
        guard !extraTranslatedAudios.isEmpty else { return item.translatedAudios }
        var seen = Set(item.translatedAudios.map { $0.targetLanguage.lowercased() })
        var result = item.translatedAudios
        for audio in extraTranslatedAudios where !seen.contains(audio.targetLanguage.lowercased()) {
            result.append(audio)
            seen.insert(audio.targetLanguage.lowercased())
        }
        return result
    }

    var currentAudioUrl: String {
        if selectedLanguage != SocialAudioTrack.originalSentinel,
           let audio = translatedAudios.first(where: { $0.targetLanguage.lowercased() == selectedLanguage.lowercased() }) {
            return audio.url
        }
        return attachment.fileUrl
    }

    private var currentLangColorHex: String {
        LanguageDisplay.colorHex(for: selectedLanguage == SocialAudioTrack.originalSentinel
                                 ? item.originalLanguage : selectedLanguage)
    }

    private var displaySegments: [TranscriptionDisplaySegment] {
        if selectedLanguage != SocialAudioTrack.originalSentinel,
           let audio = translatedAudios.first(where: { $0.targetLanguage.lowercased() == selectedLanguage.lowercased() }),
           !audio.segments.isEmpty {
            return TranscriptionDisplaySegment.buildFrom(segments: audio.segments)
        }
        guard let t = transcription else { return [] }
        let built = TranscriptionDisplaySegment.buildFrom(t)
        if built.isEmpty, !t.text.isEmpty {
            return [TranscriptionDisplaySegment(
                text: t.text,
                startTime: 0,
                endTime: Double(t.durationMs ?? 0) / 1000.0,
                speakerId: nil,
                speakerColor: TranscriptionDisplaySegment.speakerPalette[0]
            )]
        }
        return built
    }

    /// Message synthétique (contenu vide → chemin audio de la feuille de
    /// traduction) : la feuille de traduction des messages est couplée à
    /// `Message`, mais pour l'audio elle n'a besoin que de l'attachment, de la
    /// langue d'origine et de l'auteur.
    private var translationMessage: Message {
        Message(
            id: item.messageId ?? item.attachment.id,
            conversationId: "",
            content: "",
            originalLanguage: item.originalLanguage,
            messageType: .audio,
            createdAt: item.createdAt,
            attachments: [item.attachment],
            senderName: item.authorName,
            senderColor: item.author.accentColor,
            senderAvatarURL: item.authorAvatarURL,
            senderUserId: item.authorUserId
        )
    }

    // MARK: - La transcription

    @ViewBuilder
    func transcriptBlock(maxHeight: CGFloat, fontSize: CGFloat, asLyrics: Bool,
                         insets: EdgeInsets = EdgeInsets(), anchor: UnitPoint = .center) -> some View {
        // Les segments se bâtissent une fois par rendu de la PAGE, pas à chaque
        // tick de lecture (#10568) : seule la portée relit le moteur.
        let segments = displaySegments
        let languageColor = currentLangColorHex
        if !segments.isEmpty {
            playback { snapshot, _ in
                AudioFullscreenTranscript(
                    segments: segments,
                    playback: snapshot,
                    accentColor: languageColor,
                    maxHeight: maxHeight,
                    fontSize: fontSize,
                    asLyrics: asLyrics,
                    insets: insets,
                    anchor: anchor,
                    onSeek: { time in
                        onChromeInteraction()
                        player.seekToTime(time)
                    }
                )
                .equatable()
            }
        } else {
            transcriptionEmptyState
                .padding(insets)
                .frame(maxHeight: maxHeight, alignment: .top)
        }
    }

    private var transcriptionEmptyState: some View {
        VStack(spacing: MeeshySpacing.sm) {
            Text(String(localized: "audio.fullscreen.transcription.empty", defaultValue: "Aucune transcription", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                .foregroundStyle(MeeshyColors.textMuted(isDark: isDark))

            // Tap = transcription LOCALE (on-device, instantané, sans réseau).
            // Appui long = menu pour transcrire via le SERVEUR (segments
            // horodatés + diarisation + lecture synchronisée).
            Button {
                runLocalTranscription()
            } label: {
                HStack(spacing: MeeshySpacing.xsPlus) {
                    if isRequestingTranscription {
                        ProgressView()
                            .tint(.white)
                            .scaleEffect(0.7)
                    } else {
                        Image(systemName: "waveform.and.mic")
                            .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    }
                    Text(String(localized: "audio.fullscreen.transcription.action", defaultValue: "Transcrire", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.vertical, MeeshySpacing.smPlus)
                .background(Capsule().fill(accent))
                .frame(minHeight: FullscreenChromeMetrics.tapTarget)
            }
            .buttonStyle(.plain)
            .disabled(isRequestingTranscription)
            .contextMenu {
                Button {
                    runLocalTranscription()
                } label: {
                    Label(String(localized: "audio.fullscreen.transcription.local", defaultValue: "Transcrire sur l'appareil", bundle: .main), systemImage: "iphone")
                }
                Button {
                    requestServerTranscription()
                } label: {
                    Label(String(localized: "audio.fullscreen.transcription.server", defaultValue: "Transcrire via le serveur", bundle: .main), systemImage: "cloud")
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, MeeshySpacing.md)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                .fill(MeeshyColors.surfaceFill(isDark: isDark))
        )
    }

    /// Transcription on-device (Apple Speech via `EdgeTranscriptionService`) —
    /// quand aucune transcription serveur n'est disponible. Instantanée, hors
    /// ligne. Produit des segments horodatés → lecture synchronisée.
    func runLocalTranscription() {
        guard !isRequestingTranscription else { return }
        isRequestingTranscription = true
        HapticFeedback.light()
        Task {
            do {
                guard await EdgeTranscriptionService.shared.requestAuthorization() else {
                    await MainActor.run { isRequestingTranscription = false; HapticFeedback.error() }
                    return
                }
                let resolved = MeeshyConfig.resolveMediaURL(attachment.fileUrl)?.absoluteString ?? attachment.fileUrl
                guard let localURL = try? await CacheCoordinator.shared.audio.localFileURLOrThrow(for: resolved) else {
                    await MainActor.run { isRequestingTranscription = false; HapticFeedback.error() }
                    return
                }
                let locale = EdgeTranscriptionService.normalizedLocale(for: Locale(identifier: item.originalLanguage))
                let result = try await EdgeTranscriptionService.shared.transcribe(audioURL: localURL, locale: locale)
                await MainActor.run {
                    let segments = result.segments.map {
                        MessageTranscriptionSegment(
                            text: $0.text,
                            startTime: $0.timestamp,
                            endTime: $0.timestamp + $0.duration,
                            speakerId: nil
                        )
                    }
                    localTranscription = MessageTranscription(
                        attachmentId: attachment.id,
                        text: result.text,
                        language: result.language,
                        confidence: result.confidence,
                        durationMs: Int(estimatedDuration * 1000),
                        segments: segments,
                        speakerCount: nil
                    )
                    isRequestingTranscription = false
                    HapticFeedback.success()
                }
            } catch {
                await MainActor.run { isRequestingTranscription = false; HapticFeedback.error() }
            }
        }
    }

    /// Transcription SERVEUR (Whisper + diarisation) : produit les segments
    /// horodatés persistés. Le résultat revient par socket (`transcriptionReady`).
    func requestServerTranscription() {
        guard !isRequestingTranscription else { return }
        isRequestingTranscription = true
        HapticFeedback.light()
        let requestedAt = Date()
        Task {
            do {
                try await AttachmentService.shared.requestTranscription(attachmentId: attachment.id)
                // Le résultat arrive via l'abonnement socket et lève l'attente
                // (`applyServerTranscription`) ; le plafond ne vaut que pour le
                // silence réel (#10759).
                _ = await cancellableSleep(for: .seconds(ServerTranscriptionWait.silenceCeiling))
                await MainActor.run {
                    guard !ServerTranscriptionWait.isWaiting(requestedAt: requestedAt, now: Date(), hasArrived: localTranscription != nil) else { return }
                    isRequestingTranscription = false
                }
            } catch {
                await MainActor.run { isRequestingTranscription = false; HapticFeedback.error() }
            }
        }
    }

    /// La transcription serveur arrivée par socket.
    func applyServerTranscription(_ event: TranscriptionReadyEvent) {
        let segments = (event.transcription.segments ?? []).map {
            MessageTranscriptionSegment(text: $0.text, startTime: $0.startTime, endTime: $0.endTime, speakerId: $0.speakerId)
        }
        localTranscription = MessageTranscription(
            attachmentId: event.attachmentId,
            text: event.transcription.text,
            language: event.transcription.language,
            confidence: event.transcription.confidence,
            durationMs: event.transcription.durationMs,
            segments: segments,
            speakerCount: event.transcription.speakerCount
        )
        isRequestingTranscription = false
        HapticFeedback.success()
    }

    /// Convertit un événement socket de traduction audio en modèle domaine et
    /// l'ajoute aux versions disponibles (nouveau pill de langue + jouable).
    func appendTranslatedAudio(from event: AudioTranslationEvent) {
        let info = event.translatedAudio
        let segments = (info.segments ?? []).map {
            MessageTranscriptionSegment(text: $0.text, startTime: $0.startTime, endTime: $0.endTime, speakerId: $0.speakerId)
        }
        let audio = MessageTranslatedAudio(
            id: info.id,
            attachmentId: event.attachmentId,
            targetLanguage: info.targetLanguage,
            url: info.url,
            transcription: info.transcription,
            durationMs: info.durationMs,
            format: info.format,
            cloned: info.cloned,
            quality: info.quality,
            voiceModelId: info.voiceModelId,
            ttsModel: info.ttsModel,
            segments: segments
        )
        if !extraTranslatedAudios.contains(where: { $0.targetLanguage.lowercased() == audio.targetLanguage.lowercased() }) {
            extraTranslatedAudios.append(audio)
            HapticFeedback.light()
        }
    }

    /// Bascule la langue écoutée et lance sa lecture (original ou version TTS).
    func selectLanguage(_ code: String) {
        onChromeInteraction()
        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
            selectedLanguage = code
        }
        if code == SocialAudioTrack.originalSentinel {
            playThroughCoordinator(urlString: attachment.fileUrl)
        } else if let audio = translatedAudios.first(where: { $0.targetLanguage.lowercased() == code.lowercased() }) {
            playThroughCoordinator(urlString: audio.url)
        }
        loadWaveform()
        HapticFeedback.light()
    }

    // MARK: - Les langues

    var inlineLanguageFlags: some View {
        // Strip horizontalement scrollable des langues disponibles + bouton
        // "ajouter une langue" ancré à droite (hors du scroll, toujours
        // accessible).
        HStack(spacing: MeeshySpacing.xs) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.xsPlus) {
                    languagePill(flag: LanguageFlagChip.flag(for: item.originalLanguage),
                                 code: SocialAudioTrack.originalSentinel,
                                 label: LanguageDisplay.from(code: item.originalLanguage)?.name ?? String(localized: "audio.fullscreen.language.original", defaultValue: "Original", bundle: .main),
                                 isSelected: selectedLanguage == SocialAudioTrack.originalSentinel)

                    ForEach(translatedAudios, id: \.id) { audio in
                        let display = LanguageDisplay.from(code: audio.targetLanguage)
                        languagePill(
                            flag: LanguageFlagChip.flag(for: audio.targetLanguage),
                            code: audio.targetLanguage,
                            label: display?.name ?? audio.targetLanguage,
                            isSelected: selectedLanguage.lowercased() == audio.targetLanguage.lowercased()
                        )
                    }
                }
                .padding(.horizontal, MeeshySpacing.xxs)
            }

            Button {
                onChromeInteraction()
                showTranslationSheet = true
                HapticFeedback.light()
            } label: {
                // Le disque partagé du chrome (36 pt visibles, cible de 44) :
                // le cercle de 26 pt et son glyphe de 12 se perdaient au pied
                // de l'écran (porteur, 2026-10-13).
                FullscreenChromeDisc(systemImage: "translate", tone: .adaptive)
                    .background(Circle().fill(MeeshyColors.controlFill(isDark: isDark))
                        .frame(width: FullscreenChromeMetrics.discDiameter, height: FullscreenChromeMetrics.discDiameter))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "audio.fullscreen.language.choose", defaultValue: "Traduire l'audio", bundle: .main))
        }
    }

    private func languagePill(flag: String, code: String, label: String, isSelected: Bool) -> some View {
        let langColor = Color(hex: LanguageDisplay.colorHex(
            for: code == SocialAudioTrack.originalSentinel ? item.originalLanguage : code))

        return Button {
            selectLanguage(code)
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                Text(flag).font(MeeshyFont.relative(MeeshyFont.subheadSize))
                Text(label)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: isSelected ? .bold : .semibold))
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
            }
            .foregroundStyle(isSelected ? Color.white : MeeshyColors.textPrimary(isDark: isDark))
            .padding(.horizontal, MeeshySpacing.md)
            .frame(minHeight: FullscreenChromeMetrics.discDiameter)
            .background(Capsule().fill(isSelected ? langColor : MeeshyColors.controlFill(isDark: isDark)))
            .overlay(Capsule().stroke(isSelected ? Color.clear : MeeshyColors.hairline(isDark: isDark),
                                      lineWidth: MeeshyBorder.hairline))
            .frame(minHeight: FullscreenChromeMetrics.tapTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        // La langue écoutée n'est dite que par le remplissage — VoiceOver
        // l'annonce par le trait.
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    // MARK: - Les feuilles

    /// LA feuille de traduction des messages (couleurs par langue + boutons
    /// Traduire / retraduire), réutilisée pour l'audio (Prisme).
    var translationSheet: some View {
        NavigationStack {
            // La vue des langues est un contenu, pas un écran : sans défilement
            // ni marge, elle se collait aux bords de la feuille et sa liste ne
            // se parcourait pas (porteur, 2026-10-13) — même hôte que la galerie.
            ScrollView(showsIndicators: false) {
                MessageLanguageDetailView(
                    message: translationMessage,
                    transcription: transcription,
                    translatedAudios: translatedAudios,
                    onSelectAudioLanguage: { lang in
                        selectLanguage(lang ?? SocialAudioTrack.originalSentinel)
                        showTranslationSheet = false
                    }
                )
                .padding(MeeshySpacing.lg)
            }
            .navigationTitle(String(localized: "audio.fullscreen.languages.title", defaultValue: "Langues", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(String(localized: "common.close", defaultValue: "Fermer", bundle: .main)) { showTranslationSheet = false }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    func profileSheet(_ user: ProfileSheetUser) -> some View {
        UserProfileSheet(
            user: user,
            moodEmoji: moodEmojiProvider?(user.userId ?? ""),
            onMoodTap: moodTapProvider.flatMap { $0(user.userId ?? "") },
            presenceProvider: { PresenceManager.shared.knownPresenceState(for: $0) },
            postsContent: { uid in AnyView(ProfileUserPostsList(
                userId: uid,
                onOpenPost: { post in ProfilePostsOpener.openPost(post) { selectedProfileUser = nil } },
                onOpenReel: { reel, reels in ProfilePostsOpener.openReel(reel, in: reels) { selectedProfileUser = nil } }
            )) }
        )
        .presentationDetents([.large, .medium])
        .presentationDragIndicator(.visible)
    }

    // MARK: - L'enregistrement

    var downloadButton: some View {
        Button { requestSave() } label: {
            if saveCoordinator.isProcessing {
                ProgressView()
                    .tint(MeeshyColors.textPrimary(isDark: isDark))
                    .frame(width: FullscreenChromeMetrics.tapTarget,
                           height: FullscreenChromeMetrics.tapTarget)
            } else {
                FullscreenChromeDisc(systemImage: FullscreenChromeSymbol.save, tone: .adaptive)
            }
        }
        .buttonStyle(.plain)
        .disabled(saveCoordinator.isProcessing)
        .accessibilityLabel(String(localized: "media.download", defaultValue: "Télécharger", bundle: .main))
        // Composant UNIFIÉ « Enregistrer » : même sheet de destinations que
        // les images, vidéos et documents (issue via toast + haptics).
        .mediaSaveFlow(saveCoordinator)
    }

    private func requestSave() {
        saveCoordinator.exitGate = exitGate
        guard exitGate.mayLeave(attachment.id) else { return }
        HapticFeedback.light()
        saveCoordinator.requestSave(MediaSaveRequest(
            kind: .audio,
            origin: .transmitted,
            remoteURLString: currentAudioUrl,
            suggestedFileName: attachment.originalName.isEmpty ? nil : attachment.originalName,
            attachmentId: attachment.id.isEmpty ? nil : attachment.id
        ))
    }
}
