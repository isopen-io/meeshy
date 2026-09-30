import Foundation
import MeeshySDK
import MeeshyUI

/// **Qui écrit le brouillon du meuble, et quand** (#8848).
///
/// Débounce : chaque mutation réarme une attente ; seule l'accalmie écrit.
/// L'écriture elle-même (copies, JPEG, JSON) part sur la file du magasin — le
/// fil principal ne fait que CAPTURER des valeurs.
///
/// Trois règles, et chacune ferme une perte :
/// - **une session n'écrase jamais un brouillon qu'elle n'a pas fait sien**
///   (`mayWrite`) : une porte semée (média d'une conversation, partage) ne
///   restaure rien, et ne doit pas jeter la création en cours d'hier ;
/// - **vider la création efface le brouillon** — mais seulement celui que la
///   session possède (`ownsStoredDraft`) : le fond de palette posé à
///   l'ouverture est une mutation, et elle ne doit rien effacer ;
/// - **après une publication acceptée, plus rien n'écrit** (`discard`) : un
///   débounce encore en vol ferait renaître le brouillon qu'on vient d'effacer.
@MainActor
final class ComposerAutosaveController: ObservableObject {

    typealias Capture = @MainActor () -> ComposerAutosaveState?

    private let store: ComposerAutosaveProviding
    private let debounceNanoseconds: UInt64
    private var account: ComposerAutosaveAccount?
    private var slot = ComposerAutosaveSlot.creation
    private var mayWrite = false
    private(set) var ownsStoredDraft = false
    private(set) var isDiscarded = false
    private(set) var didBind = false
    nonisolated(unsafe) private var pending: Task<Void, Never>?
    private var latestCapture: Capture?
    private var deadline: UInt64 = 0

    init(store: ComposerAutosaveProviding = ComposerAutosaveStore.shared,
         debounceNanoseconds: UInt64 = 1_200_000_000) {
        self.store = store
        self.debounceNanoseconds = debounceNanoseconds
    }

    nonisolated deinit {
        pending?.cancel()
    }

    /// Rattache la session à son tiroir. Rend le brouillon à restaurer quand la
    /// session a le droit d'en reprendre un — et en devient alors propriétaire.
    func bind(account: ComposerAutosaveAccount?,
              slot: ComposerAutosaveSlot = .creation,
              opening: ComposerAutosaveOpening) -> ComposerAutosaveRestored? {
        guard !didBind else { return nil }
        didBind = true
        self.account = account
        self.slot = slot
        guard let account, opening != .disabled else { return nil }
        if opening == .restores, let restored = store.load(account: account, slot: slot) {
            mayWrite = true
            ownsStoredDraft = true
            return restored
        }
        mayWrite = opening == .restores || !store.hasDraft(account: account, slot: slot)
        return nil
    }

    /// La restauration n'a rien pu relire (format inconnu, version future) :
    /// la session repart vierge et ne revendique pas le tiroir.
    func abandonRestoredDraft() {
        ownsStoredDraft = false
    }

    /// Une mutation. Elle ne crée pas de tâche : un geste de scène en émet une
    /// par image, et recréer une attente à 120 Hz coûterait plus que d'écrire.
    /// Elle recule l'ÉCHÉANCE ; une seule attente, déjà en vol, la relit.
    func schedule(_ capture: @escaping Capture) {
        guard mayWrite, !isDiscarded else { return }
        latestCapture = capture
        deadline = DispatchTime.now().uptimeNanoseconds &+ debounceNanoseconds
        guard pending == nil else { return }
        pending = Task { @MainActor [weak self] in
            while let attente = self?.remainingWait(), attente > 0 {
                try? await Task.sleep(nanoseconds: attente)
                if Task.isCancelled { return }
            }
            self?.fireScheduledWrite()
        }
    }

    /// Passage en arrière-plan, fermeture : l'écriture n'attend pas l'accalmie.
    func flushNow(_ capture: Capture) {
        cancelPending()
        write(capture)
    }

    private func remainingWait() -> UInt64 {
        let maintenant = DispatchTime.now().uptimeNanoseconds
        return deadline > maintenant ? deadline - maintenant : 0
    }

    private func fireScheduledWrite() {
        pending = nil
        guard let capture = latestCapture else { return }
        latestCapture = nil
        write(capture)
    }

    /// La capture tient l'hôte, qui tient ce contrôleur : la relâcher à chaque
    /// sortie est ce qui empêche le cycle de survivre à l'écran.
    private func cancelPending() {
        pending?.cancel()
        pending = nil
        latestCapture = nil
    }

    /// Passage en arrière-plan : l'OS peut tuer l'app dans la seconde, la
    /// dernière écriture doit être sur disque avant de rendre la main.
    func waitForPendingWrites() {
        store.waitForPendingWrites()
    }

    /// Publication acceptée : le brouillon a rempli son office.
    func discard() {
        isDiscarded = true
        cancelPending()
        guard let account, ownsStoredDraft || mayWrite else { return }
        store.delete(account: account, slot: slot)
        ownsStoredDraft = false
    }

    private func write(_ capture: Capture) {
        guard mayWrite, !isDiscarded, let account, let state = capture() else { return }
        guard state.hasContent else {
            guard ownsStoredDraft else { return }
            store.delete(account: account, slot: slot)
            ownsStoredDraft = false
            return
        }
        store.save(ComposerAutosaveCodec.write(from: state), account: account, slot: slot)
        ownsStoredDraft = true
    }
}

/// Ce que l'OUVERTURE permet au brouillon — décision pure, lue une fois.
nonisolated enum ComposerAutosaveOpening: Equatable, Sendable {
    /// Porte vierge : on reprend la création en cours.
    case restores
    /// Porte qui arrive avec sa matière (graine, partage, reprise d'humeur) :
    /// on ne reprend rien, et on n'écrit que si le tiroir est libre.
    case preservesStoredDraft
    /// L'atelier du SDK tient son propre brouillon (`StoryDraftStore`) :
    /// reprise de « Mes stories », édition, viseur vidéo, republication.
    case disabled

    static func decide(opensOnAtelier: Bool,
                       isHydrated: Bool,
                       resumesDraft: Bool,
                       isSeeded: Bool,
                       opensOnMood: Bool) -> ComposerAutosaveOpening {
        if opensOnAtelier || isHydrated || resumesDraft { return .disabled }
        if isSeeded || opensOnMood { return .preservesStoredDraft }
        return .restores
    }
}

/// **Rouvrir « Modifier » reprend l'édition en cours** (#8848).
///
/// L'atelier autosauvegarde l'édition d'une story sous `editingPostId` depuis
/// le 2026-08-02 ; mais chaque « Modifier » hydratait de nouveau depuis le
/// serveur, si bien que le brouillon d'édition s'écrivait et ne se relisait
/// jamais. La session d'édition ADOPTE désormais le brouillon de son post —
/// le plus récent, hors d'une publication en vol (gelé, il appartient à la file).
nonisolated enum ComposerEditDraftResumption {
    static func draftId(editingPostId: String?, drafts: [StoryDraftSummary]) -> String? {
        guard let editingPostId else { return nil }
        return drafts
            .filter { $0.editingPostId == editingPostId && $0.pendingPublishAt == nil }
            .max { $0.updatedAt < $1.updatedAt }?
            .id
    }
}
