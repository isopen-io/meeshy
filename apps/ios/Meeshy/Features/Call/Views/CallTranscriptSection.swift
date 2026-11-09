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
        let localName = localUser?.displayName ?? localUser?.username
            ?? String(localized: "call.transcript.you", defaultValue: "Vous", bundle: .main)
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
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            HStack {
                Text(String(localized: "calls.detail.transcript", defaultValue: "Transcription", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .foregroundStyle(theme.textPrimary)
                Spacer()
                Button {
                    withAnimation { showOriginalText.toggle() }
                } label: {
                    Image(systemName: showOriginalText ? "character.bubble.fill" : "captions.bubble.fill")
                        .foregroundStyle(Color(hex: accentHex))
                }
                .accessibilityLabel(showOriginalText
                    ? String(localized: "call.control.translation.showTranslated", defaultValue: "Afficher la traduction", bundle: .main)
                    : String(localized: "call.control.translation.showOriginal", defaultValue: "Afficher le texte original", bundle: .main))
            }

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

            HStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: "info.circle")
                    .font(.caption2)
                Text(String(localized: "call.transcript.disclaimer", defaultValue: "Transcription locale à cet appareil, jamais envoyée au serveur Meeshy — peut figurer dans une sauvegarde iCloud/Finder de cet appareil. Inclut les paroles de votre interlocuteur, telles que reçues pendant l'appel.", bundle: .main))
                    .font(.caption2)
            }
            .foregroundStyle(theme.textMuted)

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
    }

    /// #16665 — les captures à leur heure parmi les phrases, comme pendant l'appel.
    private var journal: [CallJournalItem<CallTranscriptSegment>] {
        CallJournalTimeline.merged(transcript.segments, time: \.capturedAt, captures: transcript.captures)
    }

    /// « Awa · a capturé l'écran » : le pseudo à sa couleur, la phrase en encre
    /// secondaire, jamais colorée ; une borne d'enregistrement ne nomme personne.
    private func captureRow(_ capture: CallTranscriptCapture, callStartedAt: Date) -> some View {
        let elapsedLabel = CallManager.formatDuration(max(0, capture.capturedAt.timeIntervalSince(callStartedAt)))
        let name = capture.kind.namesCapturer ? CallCaptureJournalCopy.who(capture.displayName) : ""
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
        return VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Text(segment.speakerName)
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
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(segment.speakerName), \(elapsedLabel) : \(displayText)")
    }

    /// La couleur d'une personne, la même avant et après la fin de l'appel,
    /// adaptée au schéma du fil (loi 4).
    private func authorColor(_ userId: String) -> Color {
        Color(hex: CallSpeakerColor.hex(for: userId, mode: theme.mode))
    }
}
