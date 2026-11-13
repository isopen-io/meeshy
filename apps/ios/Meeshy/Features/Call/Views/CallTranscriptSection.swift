import SwiftUI
import MeeshySDK
import MeeshyUI

/// Loads a call's transcript: the encrypted local cache first, the server
/// replay as fallback, re-seeding the cache.
/// App-side cascade (SDK Purity). Shared by both call detail sheets (#8698).
enum CallTranscriptLoader {
    static func load(callId: String) async -> CallTranscript? {
        if let local = await CallTranscriptStore.shared.transcript(for: callId) { return local }
        return await fetchRemote(callId: callId)
    }

    /// Fallback distant du replay : mappe le DTO wire vers le domaine
    /// `CallTranscript`. La traduction affichée est résolue AU PRISME
    /// (langue préférée du lecteur) — si aucune traduction ne matche,
    /// l'original s'affiche (`nil`), jamais `translations.first` (règle
    /// critique n°1 du Prisme). Le transcript récupéré est ré-ensemencé
    /// dans le cache local chiffré.
    private static func fetchRemote(callId: String) async -> CallTranscript? {
        guard let remote = try? await CallTranscriptRemoteService.shared.transcript(callId: callId),
              !remote.segments.isEmpty || !(remote.captures ?? []).isEmpty else { return nil }
        let localUser = AuthManager.shared.currentUser
        let localUserId = localUser?.id ?? ""
        let localName = CallJournalAfterCall.youLabel
        let preferredLanguage = CallLanguagePreference.preferredCallLanguage(for: localUser)
        let fetched = CallTranscript(
            callId: remote.callId,
            conversationId: remote.conversationId,
            callStartedAt: remote.callStartedAt,
            segments: remote.segments.map { seg in
                let isLocal = seg.speakerId == localUserId
                let translation = isLocal
                    ? nil
                    : seg.translations.first(where: { $0.targetLanguage == preferredLanguage })
                return CallTranscriptSegment(
                    speakerId: seg.speakerId,
                    speakerName: isLocal
                        ? localName
                        : (seg.speakerDisplayName
                            ?? String(localized: "call.transcript.participant", defaultValue: "Participant", bundle: .main)),
                    isLocal: isLocal,
                    text: seg.text,
                    translatedText: translation?.translatedText,
                    translatedLanguage: translation?.targetLanguage,
                    language: seg.language,
                    capturedAt: Date(timeIntervalSince1970: Double(seg.capturedAtMs) / 1000)
                )
            },
            captures: CallTranscriptCaptureMapping.captures(remote.captures ?? [], localUserId: localUserId, localName: localName)
        )
        await CallTranscriptStore.shared.saveMerging(fetched)
        return fetched
    }
}

/// Les décisions pures du journal d'après l'appel (A1.8 · A1.11 · A1.15 · A2.3, #17864) : l'original
/// sous chaque traduction, la bascule seulement quand une phrase est traduite, mes lignes sous « Vous »,
/// et la mention de conservation qui dit vrai selon le régime de la conversation.
enum CallJournalAfterCall {
    static var youLabel: String {
        String(localized: "call.transcript.you", defaultValue: "Vous", bundle: .main)
    }

    /// Mes lignes disent « Vous », quel que soit le nom gravé à la fin de l'appel ou au replay ; celles des
    /// autres gardent le leur.
    static func authorName(speakerName: String, isMine: Bool, you: String) -> String {
        isMine ? you : speakerName
    }

    static func isMine(userId: String, localUserId: String) -> Bool {
        !localUserId.isEmpty && userId == localUserId
    }

    /// L'original d'une phrase servie traduite, déplié d'office dessous (#17340). Jamais pour ma phrase,
    /// jamais sans traduction, jamais quand la bascule le montre déjà à la place de la traduction.
    static func originalBelow(_ segment: CallTranscriptSegment, showsOriginalInstead: Bool) -> String? {
        guard servesTranslation(segment), !showsOriginalInstead else { return nil }
        return segment.text
    }

    /// La bascule « Voir l'original » n'a de sens que si au moins une phrase sert une traduction.
    static func offersOriginalToggle(_ segments: [CallTranscriptSegment]) -> Bool {
        segments.contains(where: servesTranslation)
    }

    private static func servesTranslation(_ segment: CallTranscriptSegment) -> Bool {
        guard !segment.isLocal, let translated = segment.translatedText else { return false }
        return !translated.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Ce que l'appareil et le serveur gardent d'un appel : chiffré de bout en bout, rien ne quitte
    /// l'appareil ; en clair, le serveur garde les phrases finales pour le journal ; régime inconnu,
    /// la mention n'affirme rien.
    static func retentionNotice(for gate: CallCaptionsGate) -> CallTranscriptRetentionNotice {
        switch gate {
        case .endToEnd: return .deviceOnly
        case .open: return .serverKeepsFinalSentences
        case .unresolved: return .hidden
        }
    }
}

enum CallTranscriptRetentionNotice: Equatable {
    case deviceOnly
    case serverKeepsFinalSentences
    case hidden

    var text: String? {
        switch self {
        case .deviceOnly:
            return String(localized: "call.transcript.disclaimer.endToEnd", defaultValue: "Transcription gardée sur cet appareil seulement : dans une conversation chiffrée de bout en bout, rien ne le quitte — peut figurer dans une sauvegarde iCloud/Finder de cet appareil. Inclut les paroles de votre interlocuteur, telles que reçues pendant l'appel.", bundle: .main)
        case .serverKeepsFinalSentences:
            return String(localized: "call.transcript.disclaimer.server", defaultValue: "Transcription gardée sur cet appareil ; le serveur Meeshy garde aussi les phrases finales de l'appel pour ce journal — peut figurer dans une sauvegarde iCloud/Finder de cet appareil. Inclut les paroles de votre interlocuteur, telles que reçues pendant l'appel.", bundle: .main)
        case .hidden:
            return nil
        }
    }
}

/// « Transcription » of a call — shared by the call-log detail
/// (`CallDetailSheet`) and the in-chat call notice detail
/// (`CallSummaryDetailSheet`), so the two never drift (#8698).
struct CallTranscriptSection: View {
    let transcript: CallTranscript
    let accentHex: String
    let tint: Color
    let onDeleted: () -> Void

    @State private var showOriginalText = false
    @State private var showDeleteConfirmation = false
    @State private var retentionNotice: CallTranscriptRetentionNotice = .hidden
    private let localUserId = AuthManager.shared.currentUser?.id ?? ""
    @ResolvedThemePalette private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            Text(String(localized: "calls.detail.transcript", defaultValue: "Transcription", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                .foregroundStyle(theme.textPrimary)

            VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
                // id: \.offset, not \.capturedAt (recommended, plan review) — saveMerging's dedup
                // key deliberately allows two segments to share a capturedAt (different
                // speaker/text at the same instant), which would collide as a ForEach id.
                ForEach(Array(journal.enumerated()), id: \.offset) { _, item in
                    switch item {
                    case .speech(let segment):
                        transcriptRow(segment, callStartedAt: transcript.callStartedAt)
                    case .capture(let capture):
                        captureRow(capture, callStartedAt: transcript.callStartedAt)
                    }
                }
            }
            .padding(MeeshySpacing.md)
            .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous), tint: tint.opacity(MeeshyOpacity.subtle))

            if CallJournalAfterCall.offersOriginalToggle(transcript.segments) {
                originalToggle
            }

            if let notice = retentionNotice.text {
                HStack(spacing: MeeshySpacing.xsPlus) {
                    Image(systemName: "info.circle")
                        .font(.caption2)
                    Text(notice)
                        .font(.caption2)
                }
                .foregroundStyle(theme.textMuted)
                .transition(.opacity)
            }

            Button(role: .destructive) {
                showDeleteConfirmation = true
            } label: {
                Text(String(localized: "call.transcript.delete", defaultValue: "Supprimer ce transcript", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
            }
            .alert(String(localized: "call.transcript.delete.confirm.title", defaultValue: "Supprimer ce transcript ?", bundle: .main), isPresented: $showDeleteConfirmation) {
                Button(String(localized: "call.transcript.delete", defaultValue: "Supprimer ce transcript", bundle: .main), role: .destructive) {
                    Task {
                        await CallTranscriptStore.shared.invalidate(for: transcript.callId)
                        onDeleted()
                    }
                }
                Button(String(localized: "story.composer.cancelAction", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
            } message: {
                Text(String(localized: "call.transcript.delete.confirm.message", defaultValue: "Cette action est définitive.", bundle: .main))
            }
        }
        .animation(.easeOut(duration: 0.2), value: retentionNotice)
        .task(id: transcript.conversationId) {
            let gate = await CallCaptionsGateResolver().gate(conversationId: transcript.conversationId)
            retentionNotice = CallJournalAfterCall.retentionNotice(for: gate)
        }
    }

    /// « Voir l'original » au pied du journal : une bascule pour tout l'appel, au libellé et à l'effet
    /// inchangés (#17862).
    private var originalToggle: some View {
        Button {
            withAnimation { showOriginalText.toggle() }
        } label: {
            Text(showOriginalText ? CallCaptionsCopy.showTranslatedHint : CallCaptionsCopy.showOriginalHint)
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                .foregroundStyle(Color(hex: accentHex))
                .meeshyTapTarget()
                .padding(.vertical, -MeeshyTapTarget.inset(forVisualSide: 17))
        }
        .buttonStyle(.plain)
    }

    /// #16665 — les captures à leur heure parmi les phrases, comme pendant l'appel.
    private var journal: [CallJournalItem<CallTranscriptSegment>] {
        CallJournalTimeline.merged(transcript.segments, time: \.capturedAt, captures: transcript.captures)
    }

    /// « Awa · a capturé l'écran » : le pseudo à sa couleur, la phrase en encre
    /// secondaire, jamais colorée ; une borne d'enregistrement ne nomme personne.
    private func captureRow(_ capture: CallTranscriptCapture, callStartedAt: Date) -> some View {
        let elapsedLabel = CallManager.formatDuration(max(0, capture.capturedAt.timeIntervalSince(callStartedAt)))
        let capturer = CallJournalAfterCall.authorName(
            speakerName: capture.displayName,
            isMine: CallJournalAfterCall.isMine(userId: capture.userId, localUserId: localUserId),
            you: CallJournalAfterCall.youLabel
        )
        let name = capture.kind.namesCapturer ? CallCaptureJournalCopy.who(capturer) : ""
        let phrase = CallCaptureJournalCopy.phrase(capture.kind)
        return HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.xsPlus) {
            CallCaptureSentence.text(name: name, nameColor: authorColor(capture.userId), tail: phrase, tailColor: theme.textSecondary)
            Spacer()
            Text(elapsedLabel)
                .font(.caption2.monospacedDigit())
                .foregroundStyle(theme.textMuted)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([name, phrase, elapsedLabel].filter { !$0.isEmpty }.joined(separator: ", "))
    }

    private func transcriptRow(_ segment: CallTranscriptSegment, callStartedAt: Date) -> some View {
        let elapsed = segment.capturedAt.timeIntervalSince(callStartedAt)
        let elapsedLabel = CallManager.formatDuration(max(0, elapsed))
        let speakerColor = authorColor(segment.speakerId)
        let servesTranslation = !segment.isLocal && !showOriginalText && segment.translatedText != nil
        let displayText = servesTranslation ? (segment.translatedText ?? segment.text) : segment.text
        let original = CallJournalAfterCall.originalBelow(segment, showsOriginalInstead: showOriginalText)
        let name = CallJournalAfterCall.authorName(speakerName: segment.speakerName, isMine: segment.isLocal, you: CallJournalAfterCall.youLabel)
        return VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Text(name)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(speakerColor)
                Spacer()
                Text(elapsedLabel)
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(theme.textMuted)
            }
            Text(displayText)
                .font(.callout)
                .foregroundStyle(servesTranslation ? speakerColor : theme.textPrimary)
            if let original {
                CallOriginalBelowText(original: original, ink: theme.textSecondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(rowAccessibilityLabel(name: name, elapsed: elapsedLabel, text: displayText, original: original))
    }

    private func rowAccessibilityLabel(name: String, elapsed: String, text: String, original: String?) -> String {
        let spoken = "\(name), \(elapsed) : \(text)"
        guard let original else { return spoken }
        return "\(spoken). \(CallCaptionsCopy.original) : \(original)"
    }

    /// La couleur d'une personne, la même avant et après la fin de l'appel,
    /// adaptée au schéma du fil (loi 4).
    private func authorColor(_ userId: String) -> Color {
        Color(hex: CallSpeakerColor.hex(for: userId, mode: theme.mode))
    }
}
