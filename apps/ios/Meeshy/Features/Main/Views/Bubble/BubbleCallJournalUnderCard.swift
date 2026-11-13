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
}

enum BubbleCallJournalPhase: Equatable {
    case closed
    case loading
    case shown
    case nothingKept
}

/// Ce que rend le chargement du journal. `abandoned` : la bascule s'est repliée (ou la cellule est partie) pendant
/// l'attente — le `nil` d'un replay annulé ne dit rien de l'appel, et ne doit pas s'afficher « Aucune transcription ».
enum BubbleCallJournalOutcome: Equatable {
    case served(CallTranscript)
    case nothingKept
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
        replay: @MainActor (String) async -> CallTranscript? = { await CallTranscriptLoader.load(callId: $0) },
        willWaitOnNetwork: @MainActor () -> Void
    ) async -> BubbleCallJournalOutcome {
        if let cached = await readCache(callId) { return .served(cached) }
        guard !Task.isCancelled else { return .abandoned }
        willWaitOnNetwork()
        let replayed = await replay(callId)
        guard !Task.isCancelled else { return .abandoned }
        return replayed.map(BubbleCallJournalOutcome.served) ?? .nothingKept
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
        .task(id: LoadKey(callId: callId, isOpen: isOpen)) { await load() }
    }

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
                .foregroundStyle(Color(hex: accentHex))
                .padding(.horizontal, MeeshySpacing.sm)
                .meeshyTapTarget()
        }
        .buttonStyle(.plain)
        .accessibilityLabel(toggleTitle)
    }

    @ViewBuilder private var journal: some View {
        if BubbleCallJournalOffer.saysNothingWasKept(phase) {
            Text(String(localized: "audio.fullscreen.transcription.empty", defaultValue: "Aucune transcription", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                .foregroundStyle(theme.textMuted)
                .frame(maxWidth: .infinity)
                .padding(.vertical, MeeshySpacing.sm)
        } else if let transcript {
            CallTranscriptSection(transcript: transcript, accentHex: accentHex, tint: Color(hex: accentHex)) {
                self.transcript = nil
                phase = .nothingKept
            }
        } else if phase == .loading {
            ProgressView().controlSize(.small).frame(maxWidth: .infinity).padding(.vertical, MeeshySpacing.sm)
        }
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
        case .abandoned:
            return
        }
    }
}
