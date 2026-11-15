import SwiftUI
import MeeshySDK
import MeeshyUI

/// Quelle bulle d'appel du fil se déplie en journal d'après l'appel (R1.11, planche A1 ; Android
/// `FocalCallJournalOffer`, web `system-notice`) : seulement un appel connecté, terminé et qui a réellement
/// duré. Un appel manqué, refusé, interrompu ou en cours n'a rien dit.
enum BubbleCallJournalOffer {
    static func isOffered(_ summary: CallSummaryMetadata) -> Bool {
        !summary.isLive
            && summary.outcome == .completed
            && summary.durationSeconds > 0
            && !summary.callId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Un appel qui n'a rien gardé (ni phrase ni capture, conversation chiffrée, transcription supprimée de
    /// l'appareil) le dit au lieu de s'ouvrir sur du vide. Le chargement, lui, ne dit rien.
    static func saysNothingWasKept(_ phase: BubbleCallJournalPhase) -> Bool {
        phase == .nothingKept
    }

    /// A1.13 — un serveur injoignable n'est pas « rien gardé » : la bulle le dit et propose Réessayer, comme
    /// Android et le web.
    static func offersRetry(_ phase: BubbleCallJournalPhase) -> Bool {
        phase == .unreachable
    }
}

/// Les mots de la bascule et de l'échec, tous déjà traduits dans les sept langues.
enum BubbleCallJournalCopy {
    /// A1.3 — l'état que le lecteur d'écran annonce avec « Masquer / Afficher la transcription ».
    static func toggleValue(isOpen: Bool) -> String {
        isOpen
            ? String(localized: "message.long.expanded", defaultValue: "Déplié", bundle: .main)
            : String(localized: "message.long.collapsed", defaultValue: "Replié", bundle: .main)
    }

    static var unavailable: String {
        String(localized: "composer.audio.transcription.unavailable", defaultValue: "Transcription indisponible", bundle: .main)
    }

    static var retry: String {
        String(localized: "call.action.retry", defaultValue: "Réessayer", bundle: .main)
    }
}

enum BubbleCallJournalPhase: Equatable {
    case closed
    case loading
    case shown
    case nothingKept
    case unreachable
}

/// Ce que rend le chargement du journal. `abandoned` : la bascule s'est repliée (ou la cellule est partie) pendant
/// l'attente — l'échec d'un replay annulé ne dit rien de l'appel, et ne doit pas s'afficher « Aucune transcription ».
/// `unreachable` : le serveur n'a pas répondu, la bulle propose Réessayer (A1.13).
enum BubbleCallJournalOutcome: Equatable {
    case served(CallTranscript)
    case nothingKept
    case unreachable
    case abandoned
}

/// Le journal d'un appel, cache chiffré d'abord (aucune attente affichée), replay serveur ensuite. Le cache est lu
/// ICI pour savoir s'il faut annoncer une attente ; la cascade complète reste `CallTranscriptLoader`, partagée
/// avec la feuille « Détails de l'appel ».
enum BubbleCallJournalLoading {
    @MainActor
    static func load(
        callId: String,
        readCache: @MainActor (String) async -> CallTranscript? = { await CallTranscriptStore.shared.transcript(for: $0) },
        replay: @MainActor (String) async -> CallTranscriptReplay = { await CallTranscriptLoader.replay(callId: $0) },
        willWaitOnNetwork: @MainActor () -> Void
    ) async -> BubbleCallJournalOutcome {
        if let cached = await readCache(callId) { return .served(cached) }
        guard !Task.isCancelled else { return .abandoned }
        willWaitOnNetwork()
        let replayed = await replay(callId)
        guard !Task.isCancelled else { return .abandoned }
        switch replayed {
        case .served(let transcript): return .served(transcript)
        case .nothingKept: return .nothingKept
        case .unreachable: return .unreachable
        }
    }
}

/// Les journaux d'appel ouverts sous leur bulle, pour la session (#17802). Le fil UIKit recycle ses cellules
/// `UIHostingConfiguration` : sans cette mémoire, un journal déplié se repliait dès que sa bulle quittait l'écran
/// (Android le garde par `rememberSaveable`). Elle ne retient que des identifiants d'appel — jamais le texte du
/// journal —, bornée, et n'est jamais observée : rien ne se re-rend quand elle change.
@MainActor
final class BubbleCallJournalMemory {
    nonisolated deinit {}

    static let shared = BubbleCallJournalMemory()
    nonisolated static let defaultCapacity = 32

    private let capacity: Int
    private var openedOldestFirst: [String] = []

    init(capacity: Int = BubbleCallJournalMemory.defaultCapacity) {
        self.capacity = max(1, capacity)
    }

    func isOpen(_ callId: String) -> Bool {
        openedOldestFirst.contains(callId)
    }

    func remember(_ callId: String, isOpen: Bool) {
        let others = openedOldestFirst.filter { $0 != callId }
        let kept = isOpen ? others + [callId] : others
        openedOldestFirst = Array(kept.suffix(capacity))
    }
}

/// Sous la carte d'une bulle d'appel : « Afficher la transcription » déplie le journal d'après l'appel —
/// phrases et lignes de capture, la `CallTranscriptSection` de la feuille —, « Masquer » le replie.
///
/// Feuille de liste : égalité par primitives, aucun observateur d'un singleton global, et rien n'est lu ni
/// chargé tant que la bascule est fermée. La bascule se range du côté de la carte (droite pour un appel
/// sortant), comme Android. L'état ouvert vit dans `BubbleCallJournalMemory` : une cellule recyclée le reprend.
struct BubbleCallJournalUnderCard: View, Equatable {
    let callId: String
    let accentHex: String
    let alignsTrailing: Bool
    private let memory: BubbleCallJournalMemory

    @State private var isOpen: Bool
    @State private var phase: BubbleCallJournalPhase = .closed
    @State private var transcript: CallTranscript?
    @State private var attempt = 0

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    @ResolvedThemePalette private var theme
    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    init(callId: String, accentHex: String, alignsTrailing: Bool, memory: BubbleCallJournalMemory = .shared) {
        self.callId = callId
        self.accentHex = accentHex
        self.alignsTrailing = alignsTrailing
        self.memory = memory
        _isOpen = State(initialValue: memory.isOpen(callId))
    }

    static func == (lhs: BubbleCallJournalUnderCard, rhs: BubbleCallJournalUnderCard) -> Bool {
        lhs.callId == rhs.callId && lhs.accentHex == rhs.accentHex && lhs.alignsTrailing == rhs.alignsTrailing
    }

    private struct LoadKey: Equatable {
        let callId: String
        let isOpen: Bool
        let attempt: Int
    }

    var body: some View {
        VStack(alignment: alignsTrailing ? .trailing : .leading, spacing: MeeshySpacing.xs) {
            toggle
            if isOpen {
                journal
                    .frame(maxWidth: 560, alignment: .leading)
                    .transition(reduceMotion ? .opacity : .opacity.combined(with: .move(edge: .top)))
            }
        }
        .animation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.35, dampingFraction: 0.85), value: isOpen)
        .task(id: LoadKey(callId: callId, isOpen: isOpen, attempt: attempt)) { await load() }
    }

    /// La couleur de la conversation, lue une fois pour la bascule, Réessayer et le journal.
    private var accent: Color { Color(hex: accentHex) }

    private var toggleTitle: String {
        isOpen
            ? String(localized: "story.viewer.transcript.hide", defaultValue: "Masquer la transcription", bundle: .main)
            : String(localized: "story.viewer.transcript.show", defaultValue: "Afficher la transcription", bundle: .main)
    }

    private var toggle: some View {
        Button {
            HapticFeedback.light()
            isOpen.toggle()
            memory.remember(callId, isOpen: isOpen)
        } label: {
            Text(toggleTitle)
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                .foregroundStyle(accent)
                .padding(.horizontal, MeeshySpacing.sm)
                .meeshyTapTarget()
        }
        .buttonStyle(.plain)
        .accessibilityLabel(toggleTitle)
        .accessibilityValue(BubbleCallJournalCopy.toggleValue(isOpen: isOpen))
    }

    @ViewBuilder private var journal: some View {
        if BubbleCallJournalOffer.saysNothingWasKept(phase) {
            Text(String(localized: "audio.fullscreen.transcription.empty", defaultValue: "Aucune transcription", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                .foregroundStyle(theme.textMuted)
                .frame(maxWidth: .infinity)
                .padding(.vertical, MeeshySpacing.sm)
        } else if let transcript {
            CallTranscriptSection(transcript: transcript, accentHex: accentHex, tint: accent) {
                self.transcript = nil
                phase = .nothingKept
            }
        } else if BubbleCallJournalOffer.offersRetry(phase) {
            unreachableNotice
        } else if phase == .loading {
            ProgressView().controlSize(.small).frame(maxWidth: .infinity).padding(.vertical, MeeshySpacing.sm)
        }
    }

    /// A1.13 — « Transcription indisponible · Réessayer ». Réessayer relance la lecture (la tentative entre dans la
    /// clé du chargement) ; le cache étant vide, l'attente s'annonce alors comme au premier chargement.
    private var unreachableNotice: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Text(BubbleCallJournalCopy.unavailable)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                .foregroundStyle(theme.textMuted)
            Button {
                HapticFeedback.light()
                attempt += 1
            } label: {
                Text(BubbleCallJournalCopy.retry)
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                    .foregroundStyle(accent)
                    .padding(.horizontal, MeeshySpacing.sm)
                    .meeshyTapTarget()
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, MeeshySpacing.xs)
        .accessibilityElement(children: .contain)
    }

    @MainActor
    private func load() async {
        guard isOpen else { return }
        guard transcript == nil, phase != .nothingKept else { return }
        switch await BubbleCallJournalLoading.load(callId: callId, willWaitOnNetwork: { phase = .loading }) {
        case .served(let loaded):
            transcript = loaded
            phase = .shown
        case .nothingKept:
            phase = .nothingKept
        case .unreachable:
            phase = .unreachable
        case .abandoned:
            return
        }
    }
}
