import SwiftUI
import MeeshySDK

// MARK: - AudioPlayerView — Transcription block
//
// Extrait de AudioPlayerView.swift (budget de taille, #4950 / D-AUDIO-03) :
// le bloc de transcription (shimmer, texte karaoké, boutons Transcrire /
// Re-transcrire / Voir plus) et ses helpers purs. Tous les `@State` qu'il lit
// ou mute (`isTranscribing`, `isRetranscribing`, `isTranscriptionExpanded`,
// `transcriptionPulsePhase`) restent déclarés dans le struct principal
// (une extension ne peut pas porter de propriété stockée) et sont devenus
// `internal` là-bas pour rester lisibles/mutables ici — même règle pour
// `player`, `isDark`, `accent`, `chromePlan`, `slotDivider`, `systemReduce`,
// `userForced`.

extension AudioPlayerView {

    /// Habillage typographique de la transcription à plat — guillemets
    /// français, espaces insécables (maquette Focal « … »). Pur, testable.
    nonisolated public static func flatTranscriptionQuote(_ text: String) -> String {
        "\u{00AB}\u{00A0}\(text)\u{00A0}\u{00BB}"
    }

    var displaySegments: [TranscriptionDisplaySegment] {
        AudioPlayerView.resolveDisplaySegments(
            selectedLanguage: selectedAudioLanguage,
            transcription: transcription,
            translatedAudios: translatedAudios
        )
    }

    /// Pure resolution of the transcription strip segments. Falls back to a
    /// single synthesized segment from the full text when the per-segment
    /// list is empty — symmetrically for the original transcription AND for a
    /// selected translated audio (otherwise stub-segment translated audios
    /// would render a blank strip).
    nonisolated public static func resolveDisplaySegments(
        selectedLanguage: String,
        transcription: MessageTranscription?,
        translatedAudios: [MessageTranslatedAudio]
    ) -> [TranscriptionDisplaySegment] {
        if selectedLanguage != "orig",
           let translated = translatedAudios.first(where: {
               $0.targetLanguage.lowercased() == selectedLanguage.lowercased()
           }) {
            let builtTranslated = TranscriptionDisplaySegment.buildFrom(segments: translated.segments)
            if builtTranslated.isEmpty,
               !translated.transcription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return [TranscriptionDisplaySegment(
                    text: translated.transcription,
                    startTime: 0,
                    endTime: Double(translated.durationMs) / 1000.0,
                    speakerId: nil,
                    speakerColor: TranscriptionDisplaySegment.speakerPalette[0]
                )]
            }
            return builtTranslated
        }
        guard let t = transcription else { return [] }
        let built = TranscriptionDisplaySegment.buildFrom(t)
        if built.isEmpty, !t.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
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

    private var fullTranscriptionText: String {
        displaySegments.map(\.text).joined(separator: " ")
    }

    /// Seuil de la tenue CARTE — celui du chevron qui déplie en ligne. Sans
    /// rapport avec `transcriptionWordLimit`, qui est la coupe de la rangée
    /// plate : deux surfaces, deux places disponibles, deux réponses.
    private var isLongTranscription: Bool {
        fullTranscriptionText.count > 255
    }

    /// Bloc de transcription : trois états mutuellement exclusifs (transition
    /// animée par `withAnimation` sur les state changes) :
    /// 1. `(isTranscribing || reserveTranscriptionHeight) && displaySegments.isEmpty`
    ///    → shimmer skeleton (3 lignes qui pulsent). `isTranscribing` couvre la
    ///    requête déclenchée localement (tap "Transcrire"/"Re-transcrire") ;
    ///    `reserveTranscriptionHeight` (D-AUDIO-03, #4950) couvre la fenêtre
    ///    PASSIVE d'un audio reçu récemment sans transcription encore posée —
    ///    sans elle, le bloc ne rendait RIEN tant que le serveur n'avait pas
    ///    répondu, et la hauteur de la bulle sautait à l'arrivée du texte.
    /// 2. `!displaySegments.isEmpty` → texte transcrit + bouton "Re-transcrire".
    /// 3. `onRequestTranscription != nil` → bouton "Transcrire" initial.
    ///
    /// `isTranscribing` est reset automatiquement par `.onChange(of: transcription)`
    /// quand la transcription arrive du serveur, ce qui déclenche la transition
    /// fluide skeleton → texte sans flash intermédiaire ; `reserveTranscriptionHeight`
    /// se retire de son côté dès que `displaySegments` n'est plus vide (branche 1
    /// exige les deux conditions).
    /// **Ne rend jamais le `bottomSlot`** — il est ancré par `mainPlayer`.
    @ViewBuilder
    var transcriptionBlock: some View {
        if (isTranscribing || reserveTranscriptionHeight) && displaySegments.isEmpty {
            VStack(spacing: 0) {
                slotDivider
                transcriptionShimmer
            }
            .padding(.bottom, 6)
            .transition(.opacity)
        } else if !displaySegments.isEmpty {
            VStack(spacing: 0) {
                slotDivider

                let segments = isLongTranscription && !isTranscriptionExpanded
                    ? truncatedSegments
                    : displaySegments

                inlineFlowTranscription(segments: segments)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)

                if isLongTranscription {
                    expandToggleButton
                }
                retranscribeButton
            }
            .padding(.bottom, 6)
            .transition(.opacity)
        } else if let onRequest = onRequestTranscription {
            // No transcription yet AND none in flight: ONLY the initial
            // "Transcribe" affordance is shown. Re-transcribe is hidden
            // here — there is nothing to re-transcribe yet, and stacking
            // both buttons would be confusing. The "Re-transcribe" CTA
            // reappears in the transcription-present branch above once a
            // transcription lands.
            VStack(spacing: 0) {
                slotDivider

                Button {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                        isTranscribing = true
                    }
                    onRequest()
                    HapticFeedback.light()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "text.badge.plus")
                            .font(.system(size: 10, weight: .medium))
                        Text(String(localized: "media.audio.transcribe", defaultValue: "Transcrire", bundle: .module))
                            .font(.system(size: 10, weight: .medium))
                    }
                    .foregroundColor(isDark ? .white.opacity(0.45) : .black.opacity(0.35))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                }
            }
            .transition(.opacity)
        }
    }

    /// Transcription À PLAT des tenues `.flatMinimal` / `.flatFocused`
    /// (maquette Focal). Tenue minimale : texte statique en italique entre
    /// guillemets français, tronqué (`flatTranscriptionLineLimit`), aucune
    /// affordance. Tenue complète (`flatTranscriptionFollowsPlayback`) : le
    /// MÊME bloc karaoké que la carte (`inlineFlowTranscription`) — segments
    /// interactifs (tap = seek), surlignage synchronisé sur la lecture, et
    /// les segments suivent déjà la langue sélectionnée
    /// (`resolveDisplaySegments`) : basculer le drapeau bascule le texte ET
    /// la piste surlignée d'un même mouvement.
    ///
    /// N'honore PAS `reserveTranscriptionHeight` (D-AUDIO-03 est scopé aux
    /// bulles de conversation, tenue `.card` — voir `transcriptionBlock`) :
    /// aucun site d'appel de cette tenue (posts, reels, commentaires) ne le
    /// passe aujourd'hui.
    @ViewBuilder
    var flatTranscriptionBlock: some View {
        if isTranscribing && displaySegments.isEmpty {
            transcriptionShimmer
                .padding(.top, 2)
                .transition(.opacity)
        } else if !displaySegments.isEmpty {
            VStack(alignment: .leading, spacing: 2) {
                if chromePlan.flatTranscriptionFollowsPlayback {
                    inlineFlowTranscription(segments: renderedSegments)
                    seeMoreButton
                } else {
                    Text(Self.flatTranscriptionQuote(fullTranscriptionText))
                        .font(.system(size: 12.5))
                        .italic()
                        .foregroundColor(isDark ? .white.opacity(0.55) : .black.opacity(0.5))
                        .lineLimit(chromePlan.flatTranscriptionLineLimit)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                if chromePlan.showsRetranscribe {
                    retranscribeButton
                }
            }
            .padding(.top, 2)
            .transition(.opacity)
        } else if chromePlan.showsTranscribeCTA, let onRequest = onRequestTranscription {
            Button {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                    isTranscribing = true
                }
                onRequest()
                HapticFeedback.light()
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "text.badge.plus")
                        .font(.system(size: 10, weight: .medium))
                    Text(String(localized: "media.audio.transcribe", defaultValue: "Transcrire", bundle: .module))
                        .font(.system(size: 10, weight: .medium))
                }
                .foregroundColor(isDark ? .white.opacity(0.45) : .black.opacity(0.35))
                .padding(.vertical, 4)
            }
            .transition(.opacity)
        }
    }

    /// Shimmer placeholder displayed while a transcription request is in flight.
    /// Three rounded lines (the third truncated to ~120pt) pulse opacity in
    /// sync. Pure SwiftUI, iOS 16+ compatible. The pulse is driven by a
    /// `@State` flipped in `onAppear` so it starts immediately on mount.
    @ViewBuilder
    private var transcriptionShimmer: some View {
        let lineColor: Color = isDark ? Color.white.opacity(0.10) : Color.black.opacity(0.08)
        VStack(alignment: .leading, spacing: 6) {
            shimmerLine(color: lineColor, width: nil)
            shimmerLine(color: lineColor, width: nil)
            shimmerLine(color: lineColor, width: 120)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .opacity(transcriptionPulsePhase ? 0.55 : 1.0)
        .animation(
            .easeInOut(duration: 0.9).repeatForever(autoreverses: true),
            value: transcriptionPulsePhase
        )
        .onAppear {
            // Reduce Motion (system or in-app): static placeholder lines,
            // no perpetual opacity pulse.
            guard !MeeshyMotion.shouldReduce(system: systemReduce, userForced: userForced) else { return }
            transcriptionPulsePhase = true
        }
        .onDisappear { transcriptionPulsePhase = false }
        .accessibilityLabel(Text(String(
            localized: "media.audio.transcribing",
            defaultValue: "Transcription en cours",
            bundle: .module
        )))
    }

    private func shimmerLine(color: Color, width: CGFloat?) -> some View {
        RoundedRectangle(cornerRadius: 4)
            .fill(color)
            .frame(width: width, height: 9)
            .frame(maxWidth: width == nil ? .infinity : nil, alignment: .leading)
    }

    // MARK: - Chevron de la tenue CARTE — déplie la transcription EN LIGNE

    /// La bulle a la place de s'étendre : son chevron reste (arbitrage user
    /// 2026-08-24). La rangée plate, elle, renvoie au plein écran
    /// (`seeMoreButton` ci-dessous) — elle n'a pas cette place.
    @ViewBuilder
    private var expandToggleButton: some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                isTranscriptionExpanded.toggle()
            }
            HapticFeedback.light()
        } label: {
            Image(systemName: isTranscriptionExpanded ? "chevron.up" : "chevron.down")
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(isDark ? .white.opacity(0.35) : .black.opacity(0.25))
                .frame(maxWidth: .infinity)
                .frame(height: 20)
        }
    }

    /// Coupe de la carte : 255 caractères, ellipse sur le segment coupé.
    private var truncatedSegments: [TranscriptionDisplaySegment] {
        var charCount = 0
        var result: [TranscriptionDisplaySegment] = []
        for segment in displaySegments {
            charCount += segment.text.count
            if charCount > 255 {
                let overflow = charCount - 255
                let trimmed = String(segment.text.dropLast(overflow))
                if !trimmed.isEmpty {
                    result.append(segment.replacingText(trimmed + "..."))
                }
                break
            }
            result.append(segment)
        }
        return result
    }

    // MARK: - « Voir plus » — la suite se lit EN PLEIN ÉCRAN

    /// Remplace le chevron qui dépliait la transcription EN LIGNE (directive
    /// 2026-08-24). Déplier sur place repoussait tout le fil vers le bas pour
    /// un texte qui n'a jamais la place d'y tenir ; le plein écran
    /// (`onFullscreen`, la MÊME destination que la pastille de pourcentage)
    /// lui donne l'espace, le karaoké déroulant et le bandeau de langues.
    ///
    /// Ne se monte QUE s'il y a une suite à lire : `transcriptionIsTruncated`
    /// exige à la fois la coupe et la destination.
    @ViewBuilder
    private var seeMoreButton: some View {
        if transcriptionIsTruncated, let onFullscreen {
            Button {
                HapticFeedback.light()
                onFullscreen()
            } label: {
                HStack(spacing: 4) {
                    Text(String(localized: "media.audio.transcription.see_more",
                                defaultValue: "Voir plus", bundle: .module))
                        .font(.system(size: 10, weight: .semibold))
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 9, weight: .semibold))
                }
                .foregroundColor(accent)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "media.audio.transcription.see_more.a11y",
                                       defaultValue: "Lire la transcription entière en plein écran",
                                       bundle: .module))
        }
    }

    // MARK: - Re-transcribe Button
    @ViewBuilder
    private var retranscribeButton: some View {
        if let onRetranscribe {
            Button {
                guard !isRetranscribing else { return }
                isRetranscribing = true
                onRetranscribe()
                HapticFeedback.light()
            } label: {
                HStack(spacing: 4) {
                    if isRetranscribing {
                        ProgressView().scaleEffect(0.6)
                    } else {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 10, weight: .medium))
                    }
                    Text(String(localized: "media.audio.retranscribe",
                                 defaultValue: "Re-transcrire", bundle: .module))
                        .font(.system(size: 10, weight: .medium))
                }
                .foregroundColor(isDark ? .white.opacity(0.45) : .black.opacity(0.35))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
            }
            .disabled(isRetranscribing)
        }
    }

    // MARK: - Coupe de la transcription (loi pure, partagée carte / rangée plate)

    /// Nombre de mots portés par une liste de segments.
    nonisolated static func wordCount(_ segments: [TranscriptionDisplaySegment]) -> Int {
        segments.reduce(0) { $0 + $1.text.split(whereSeparator: \.isWhitespace).count }
    }

    /// La transcription dépasse-t-elle la coupe ? `wordLimit <= 0` = pas de
    /// coupe du tout (garde : une limite nulle ne doit jamais vider le bloc).
    nonisolated static func exceedsWordLimit(_ segments: [TranscriptionDisplaySegment], wordLimit: Int) -> Bool {
        wordLimit > 0 && wordCount(segments) > wordLimit
    }

    /// Les `wordLimit` premiers mots, ellipse posée sur le dernier segment
    /// gardé. Les TIMINGS du segment coupé sont conservés tels quels : le
    /// karaoké s'appuie dessus pour surligner et pour le seek au toucher —
    /// les recalculer au prorata inventerait une donnée que la
    /// transcription n'a pas.
    nonisolated static func limitedSegments(_ segments: [TranscriptionDisplaySegment], wordLimit: Int) -> [TranscriptionDisplaySegment] {
        guard exceedsWordLimit(segments, wordLimit: wordLimit) else { return segments }
        var remaining = wordLimit
        var kept: [TranscriptionDisplaySegment] = []
        for segment in segments {
            guard remaining > 0 else { break }
            let words = segment.text.split(whereSeparator: \.isWhitespace)
            if words.count <= remaining {
                remaining -= words.count
                kept.append(segment)
            } else {
                kept.append(segment.replacingText(words.prefix(remaining).joined(separator: " ")))
                remaining = 0
            }
        }
        guard let last = kept.popLast() else { return kept }
        kept.append(last.replacingText(last.text + "\u{2026}"))
        return kept
    }

    /// Segments effectivement rendus : coupés quand la tenue pose une limite
    /// ET qu'une destination plein écran existe pour lire la suite. Sans
    /// cette destination, la coupe ne serait pas une invitation mais une
    /// perte — la transcription reste entière.
    private var renderedSegments: [TranscriptionDisplaySegment] {
        guard let limit = chromePlan.transcriptionWordLimit, onFullscreen != nil else { return displaySegments }
        return Self.limitedSegments(displaySegments, wordLimit: limit)
    }

    /// Y a-t-il une suite à lire en plein écran ?
    private var transcriptionIsTruncated: Bool {
        guard let limit = chromePlan.transcriptionWordLimit, onFullscreen != nil else { return false }
        return Self.exceedsWordLimit(displaySegments, wordLimit: limit)
    }

    /// Index du segment de transcription en cours de lecture (karaoké), résolu
    /// depuis l'état live du moteur. Délègue au helper pur testable ci-dessous.
    private func activeTranscriptionIndex(in segments: [TranscriptionDisplaySegment]) -> Int? {
        Self.activeSegmentIndex(
            segments: segments,
            currentTime: player.currentTime,
            progress: player.progress,
            isPlaying: player.isPlaying
        )
    }

    /// Index du segment actif à un instant donné — fonction PURE (testable).
    ///
    /// Utilise les timestamps réels dès qu'au moins un segment en porte un valide
    /// (`endTime > startTime`). Quand la transcription n'a AUCUNE découpe temporelle
    /// — segments à `startTime == endTime == 0`, fréquent sur les audios transcrits
    /// sans alignement mot-à-mot — le prédicat `currentTime < endTime` resterait
    /// toujours faux et plus AUCUN segment ne s'allumerait (tout gris, désynchronisé).
    /// On retombe alors sur une progression proportionnelle pilotée par `progress`
    /// pour que le surlignage avance quand même avec la lecture. `nil` à l'arrêt.
    nonisolated public static func activeSegmentIndex(
        segments: [TranscriptionDisplaySegment],
        currentTime: TimeInterval,
        progress: Double,
        isPlaying: Bool
    ) -> Int? {
        guard isPlaying, !segments.isEmpty else { return nil }
        if segments.contains(where: { $0.endTime > $0.startTime }) {
            return segments.firstIndex { currentTime >= $0.startTime && currentTime < $0.endTime }
        }
        let idx = Int(progress * Double(segments.count))
        return min(max(idx, 0), segments.count - 1)
    }

    @ViewBuilder
    private func inlineFlowTranscription(segments: [TranscriptionDisplaySegment]) -> some View {
        // Cas fallback synthesized : `resolveDisplaySegments` renvoie un
        // unique segment qui porte tout le texte quand la transcription n'a
        // pas de découpe par segment (audio sans segments structurés).
        // `FlowLayout` propose `.unspecified` à chaque subview, qui retourne
        // alors sa largeur native une-ligne — un seul Button énorme ne peut
        // donc plus être wrappé et le texte est tronqué visuellement.
        // On rend directement un Text qui wrap naturellement dans ce cas.
        // La couleur suit le même contrat que les segments multiples :
        // idle (avant), actif (pendant lecture), past (après) — pour qu'un
        // audio sans segments soit aussi lisible pendant la lecture.
        if segments.count == 1, let single = segments.first {
            // Activité résolue par le helper partagé : timing réel si disponible,
            // sinon proportionnel (un segment unique non-timé reste actif toute la
            // lecture au lieu de ne jamais s'allumer faute de `endTime`).
            let isActive = activeTranscriptionIndex(in: segments) == 0
            let hasRealTiming = single.endTime > single.startTime
            let isPast = !isActive && (hasRealTiming
                ? player.currentTime >= single.endTime
                : (!player.isPlaying && player.progress >= 0.999))
            Button {
                player.seekToTime(single.startTime)
                HapticFeedback.light()
            } label: {
                Text(single.text)
                    .font(.system(size: 13, weight: isActive ? .bold : .regular))
                    .foregroundColor(inlineSegmentColor(isActive: isActive, isPast: isPast))
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, isActive ? 2 : 0)
                    .padding(.vertical, isActive ? 1 : 0)
                    .background(
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color(hex: accentColor).opacity(isActive ? 0.12 : 0))
                    )
            }
            .buttonStyle(.plain)
            .animation(.easeInOut(duration: 0.15), value: isActive)
            .animation(.easeInOut(duration: 0.15), value: isPast)
        } else {
            // Activité résolue par le helper partagé : timing réel quand au moins un
            // segment en porte, sinon fallback proportionnel sur `player.progress`
            // (transcription sans découpe temporelle → karaoké quand même synchronisé).
            // Gate sur `isPlaying` conservé (BUG D : sur une page carousel idle,
            // `currentTime == 0` + segment 0 à `startTime == 0` faussait l'allumage).
            let activeIdx = activeTranscriptionIndex(in: segments)
            FlowLayout(spacing: 0) {
                ForEach(Array(segments.enumerated()), id: \.element.id) { index, segment in
                    let isActive = index == activeIdx
                    let isPast = activeIdx != nil && index < activeIdx!

                    Button {
                        player.seekToTime(segment.startTime)
                        HapticFeedback.light()
                    } label: {
                        Text(segment.text + " ")
                            .font(.system(size: 13, weight: isActive ? .bold : .regular))
                            .foregroundColor(inlineSegmentColor(isActive: isActive, isPast: isPast))
                            .padding(.horizontal, isActive ? 2 : 0)
                            .padding(.vertical, isActive ? 1 : 0)
                            .background(
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color(hex: accentColor).opacity(isActive ? 0.12 : 0))
                            )
                    }
                    .buttonStyle(.plain)
                    .animation(.easeInOut(duration: 0.15), value: isActive)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func inlineSegmentColor(isActive: Bool, isPast: Bool) -> Color {
        if isActive { return Color(hex: accentColor) }
        if isPast { return isDark ? Color.white.opacity(0.7) : Color.black.opacity(0.6) }
        return isDark ? Color.white.opacity(0.35) : Color.black.opacity(0.25)
    }
}

// MARK: - AudioTranscriptionPending

/// **La règle pure de réservation de hauteur — D-AUDIO-03 (#4950).**
///
/// Sans elle, une bulle audio REÇUE sans transcription encore posée ne
/// rendait AUCUNE des trois branches de `transcriptionBlock` (`isTranscribing`
/// restait `false` côté récepteur — seul un tap "Transcrire" local le posait) :
/// hauteur nulle, puis saut quand Whisper répond quelques secondes plus tard.
///
/// `AudioBubbleRouter` (app) calcule `AudioPlayerView.reserveTranscriptionHeight`
/// UNE FOIS à la construction du router, avec cette règle, à partir de ce
/// qu'il connaît déjà — la date de la pièce jointe et la présence d'une
/// transcription — jamais en relisant `Date()` dans un `body` (Zero
/// Unnecessary Re-render).
public nonisolated enum AudioTranscriptionPending {

    /// Fenêtre nominale d'attente de la transcription serveur (Whisper).
    /// Passé ce délai sans transcription, on tient l'échec/le timeout pour
    /// acquis : un shimmer éternel serait pire que l'absence de réservation
    /// qu'il corrige.
    public static let nominalTimeout: TimeInterval = 90

    /// `true` quand la hauteur du bloc de transcription doit être réservée
    /// pour la fenêtre PASSIVE — celle que personne n'a demandée.
    ///
    /// La règle ne connaît PAS l'attente ACTIVE (`isTranscribing`, posé par le
    /// tap "Transcrire" / "Re-transcrire") : cet état vit dans
    /// `AudioPlayerView`, qui l'ajoute lui-même à ce booléen
    /// (`isTranscribing || reserveTranscriptionHeight`). Lui en passer une
    /// copie donnerait deux sources pour un même affichage — et un contrat
    /// mensonger, puisque la vue montrerait le shimmer d'un tap local même là
    /// où cette règle rend `false` (brouillon local, par exemple).
    ///
    /// - `hasTranscription`: une transcription est déjà affichée — la
    ///   réservation se retire immédiatement, elle n'a plus d'objet.
    /// - `receivedAt` / `now`: la fenêtre — un audio reçu il y a moins de
    ///   `nominalTimeout` sans transcription réserve la place ; au delà,
    ///   faux (pas de shimmer éternel sur un échec/timeout serveur).
    /// - `isLocalDraft`: brouillon local optimiste, pas encore envoyé — la
    ///   transcription locale (D-AUDIO-01, #4938) le remplit avant l'envoi ;
    ///   rien à réserver ici.
    public static func shouldReserveHeight(
        hasTranscription: Bool,
        receivedAt: Date,
        now: Date,
        isLocalDraft: Bool
    ) -> Bool {
        guard !hasTranscription, !isLocalDraft else { return false }
        return now.timeIntervalSince(receivedAt) < nominalTimeout
    }
}
