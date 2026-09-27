import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI
import os

// Les sous-titres de l'appel : panneau audio, bandeau vidéo, lignes, et le
// cycle du bouton Sous-titres. Sortis de `CallView.swift` (#8276).

extension CallView {
    /// Audio-call captions surface — a real layout element (NOT a floating
    /// overlay) occupying the space between `compactAudioCallHeader` and
    /// `controlBar`. Video calls use `transcriptOverlay` instead (a bottom
    /// glass banner that doesn't shrink the video) — see that property's doc
    /// comment. User-requested 2026-07-11: "la zone de transcription ne doit
    /// pas être en overlay des autres points d'action".
    var transcriptPanel: some View {
        ScrollView {
            transcriptSegmentsList
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 12))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Transcript Overlay

    /// Video calls only — floating glass banner over the bottom of the video,
    /// like traditional subtitles. Audio calls use `transcriptPanel` (structural,
    /// non-overlay) instead — see that property's doc comment.
    var transcriptOverlay: some View {
        transcriptSegmentsList
            .padding(12)
            // iOS 26 Liquid Glass — floating live-transcript panel over the video
            // stream (same chrome-over-content family as the duration badge / effects
            // toolbar). SDK Compatibility wrapper gates native effect / fallback.
            .adaptiveGlass(in: RoundedRectangle(cornerRadius: 12))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal, 16)
            .padding(.bottom, 100)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            .opacity(showTranscript ? 1 : 0)
            .accessibilityHidden(!showTranscript)
            .animation(.easeInOut(duration: 0.2), value: showTranscript)
    }

    /// Shared, reused by both the video banner (`transcriptOverlay`) and the
    /// audio structural panel (`transcriptPanel`).
    var transcriptSegmentsList: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(transcriptionService.displayedSegments) { segment in
                transcriptSegmentRow(segment)
            }
        }
    }

    /// One transcript line: visible speaker name (colored) + text. `<Moi>` in
    /// `MeeshyColors.indigo400` (this codebase's established "secondary
    /// elements" tone), the interlocutor's name in `MeeshyColors.brandPrimary`
    /// (the signature brand color) — user-requested 2026-07-11, replaces the
    /// previous colored-dot-only distinction.
    /// My own speech is never translated for myself (`text` is already in my
    /// language); the interlocutor's speech shows `translatedText ?? text` by
    /// default, or `text` (original) when `showOriginalText` is on.
    /// Rendu journalisé `displayName (heure): message` — l'heure est
    /// l'HORLOGE MURALE de capture (`segment.capturedAt`, estampillée par le
    /// device du locuteur et transportée par le wire), jamais
    /// `startTime`/`endTime` (ASR-buffer-relatifs, voir le doc comment de
    /// `TranscriptionSegment.capturedAt`). Le nom du locuteur distant vient
    /// du roster local d'abord (source de confiance), puis du
    /// `speakerDisplayName` transporté par le wire en fallback. Chaque ligne
    /// porte le tag de la langue affichée : langue de transcription pour
    /// l'original, langue cible quand la traduction est affichée — prépare
    /// la traduction live + resynthèse TTS.
    @ViewBuilder
    func transcriptSegmentRow(_ segment: TranscriptionSegment) -> some View {
        let localUserId = AuthManager.shared.currentUser?.id ?? ""
        let isLocal = segment.speakerId == localUserId
        let localName = AuthManager.shared.currentUser?.displayName ?? AuthManager.shared.currentUser?.username ?? String(localized: "call.transcript.you", defaultValue: "Vous", bundle: .main)
        let remoteName = callManager.remoteUsername
            ?? segment.speakerDisplayName
            ?? String(localized: "call.incoming.unknown_caller", defaultValue: "Inconnu", bundle: .main)
        let speakerName = isLocal ? localName : remoteName
        let speakerColor = isLocal ? MeeshyColors.indigo400 : MeeshyColors.brandPrimary
        let showsTranslation = !isLocal && !showOriginalText && segment.translatedText != nil
        let displayText = isLocal ? segment.text : (showOriginalText ? segment.text : (segment.translatedText ?? segment.text))
        let displayedLanguage = showsTranslation ? (segment.translatedLanguage ?? segment.language) : segment.language
        let timeLabel = segment.capturedAt.formatted(date: .omitted, time: .shortened)

        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Text("\(speakerName) (\(timeLabel))")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(speakerColor)
                Spacer()
                Text(displayedLanguage.uppercased())
                    .font(.caption2.weight(.semibold).monospaced())
                    .foregroundColor(.white.opacity(0.7))
                    .padding(.horizontal, 5)
                    .padding(.vertical, 1)
                    .background(Capsule().fill(Color.white.opacity(0.12)))
                    .accessibilityLabel(Text(String(
                        localized: "call.transcript.language_tag",
                        defaultValue: "Langue : \(displayedLanguage.uppercased())",
                        bundle: .main
                    )))
            }
            Text(displayText)
                .font(.callout.weight(segment.isFinal ? .regular : .light))
                .foregroundColor(.white)
                .opacity(segment.isFinal ? 1.0 : 0.7)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(speakerName) (\(timeLabel)) : \(displayText)")
    }

    /// Derived from `transcriptionService.isShowingOverlay` (le panneau de
    /// l'utilisateur LOCAL) and `showOriginalText` (local display flag) — see
    /// CaptionsMode's own doc comment. Surtout PAS `isTranscribing` : depuis
    /// que ce device capture aussi pour servir un pair qui écoute
    /// (`TranscriptionCapturePolicy`), `isTranscribing` peut être vrai sans
    /// que l'utilisateur local ait rien demandé — le bouton s'allumerait seul.
    var captionsMode: CaptionsMode {
        CaptionsMode(isShowingCaptions: transcriptionService.isShowingOverlay, showOriginalText: showOriginalText)
    }

    /// Advances the 3-state cycle. Le tap POSE l'état du panneau, puis
    /// `toggleTranscription()` réconcilie la capture avec l'écoute réelle de
    /// l'appel (panneau local OU pair à l'écoute). L'ancien `willStart`, lu
    /// sur `isTranscribing`, n'a plus de sens : la capture peut déjà tourner
    /// pour servir un pair alors que l'utilisateur local n'a rien ouvert.
    func advanceCaptionsMode() {
        // Plus de branche « réception seule » : le cycle est piloté par le
        // PANNEAU (`isShowingOverlay`), que ce tap vient de poser — il est
        // donc toujours cohérent, et un panneau ouvert reste fermable même
        // quand le moteur local a échoué (permission refusée, langue non
        // supportée on-device). C'est cette dérivation qui rendait le panneau
        // infermable, pas l'absence de rustine.
        switch captionsMode.next {
        case .translated:
            showOriginalText = false
            showTranscript = true
            // PERF-005: single authoritative place that flips this — the audio
            // structural transcript panel and the video floating banner both key
            // off it, so it must not depend on either view's own lifecycle
            // (onAppear/onChange copies would drift).
            transcriptionService.isShowingOverlay = true
            callManager.toggleTranscription()
        case .original:
            showOriginalText = true
        case .off:
            showOriginalText = false
            showTranscript = false
            transcriptionService.isShowingOverlay = false
            callManager.toggleTranscription()
        }
    }

    /// Live captions — cycles off → captions (translated) → captions (original) → off
    /// on tap. Replaces the old transcriptionToggleButton + translationToggleButton pair
    /// (2 buttons collapsed into 1 — task #17). Ce bouton commande ce que
    /// l'utilisateur LIT ; ce qu'il ÉMET suit l'écoute réelle de l'appel
    /// depuis 2026-08-19 (`TranscriptionCapturePolicy`) — sans quoi activer
    /// les sous-titres ne faisait de lui qu'un émetteur et jamais un lecteur.
    /// Floats on the trailing edge, not in controlButtonsRow — see the
    /// call site's comment.
    var captionsCycleButton: some View {
        let mode = captionsMode
        let (icon, tint): (String, Color) = {
            switch mode {
            case .off: return ("captions.bubble", .white)
            case .translated: return ("captions.bubble.fill", MeeshyColors.indigo400)
            case .original: return ("character.bubble.fill", MeeshyColors.indigo400)
            }
        }()
        let valueLabel: String = {
            switch mode {
            case .off: return String(localized: "call.control.captions.state.off", defaultValue: "Désactivés", bundle: .main)
            case .translated: return String(localized: "call.control.captions.state.translated", defaultValue: "Traduction", bundle: .main)
            case .original: return String(localized: "call.control.captions.state.original", defaultValue: "Texte original", bundle: .main)
            }
        }()

        // Invitation : le pair transcrit alors que MES sous-titres sont
        // désactivés — point indigo sur l'icône (même patron que le dot
        // "video-autopaused" web). Statique, pas d'animation continue (audit
        // P2-iOS-9 : les pulsations indéfinies brûlaient la batterie et
        // ignoraient Reduce Motion). Disparaît dès que j'active
        // (mode != .off) ou que le pair coupe (`active: false` / fin d'appel).
        let showsPeerInvite = callManager.remoteTranscriptionActive && mode == .off

        return Button(action: advanceCaptionsMode) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 22, weight: .medium))
                    .foregroundColor(mode == .off ? .white.opacity(0.9) : tint)
                    .callControlGlass(diameter: 56, isActive: mode != .off, tint: tint)
                    .overlay(alignment: .topTrailing) {
                        if showsPeerInvite {
                            Circle()
                                .fill(MeeshyColors.indigo400)
                                .frame(width: 12, height: 12)
                                .overlay(Circle().stroke(Color.black.opacity(0.6), lineWidth: 2))
                                .accessibilityLabel(Text(String(
                                    localized: "call.control.captions.peer_active",
                                    defaultValue: "Votre interlocuteur a activé la transcription",
                                    bundle: .main
                                )))
                        }
                    }
                Text(String(localized: "call.control.transcript.caption", defaultValue: "Sous-titres", bundle: .main))
                    .font(.caption2.weight(.medium))
                    .foregroundColor(.white.opacity(0.7))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(width: 68)
        }
        .pressable()
        // Constant label (the feature's name) + a live value (its current state) — NOT
        // .toggleStateAccessibility(isToggle: true, ...): that helper's .isToggle trait +
        // on/off value is for binary toggles. This is a 3-state cycle, so VoiceOver hears
        // "Sous-titres, Traduction" today and "Sous-titres, Texte original" after the next
        // double-tap — the default Button action already IS the cycle-forward gesture, so
        // no .accessibilityAdjustableAction is added: a 3-state cycle has no natural
        // "backward", and mapping both increment AND decrement to the same forward step
        // would teach a VoiceOver user that swiping down also advances — worse than not
        // offering the swipe gesture at all.
        .accessibilityLabel(String(localized: "call.control.transcript.caption", defaultValue: "Sous-titres", bundle: .main))
        .accessibilityValue(valueLabel)
    }
}
