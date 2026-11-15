import Foundation
import Combine
import MeeshySDK

/// **Ce qui fait un pas d'historique, et quand ↶ ↷ paraissent** (#14208).
///
/// - Le DOCUMENT seul réarme la capture : les diapos, la sortie du dessin, et
///   la fin d'un geste du canvas. Toute autre publication — l'horloge de
///   lecture, la sélection, la progression d'un envoi — repoussait la capture
///   tant qu'elle publiait, et plusieurs actions finissaient en un seul pas.
/// - Les boutons suivent le document AU MOMENT de l'action, pas une demi-seconde
///   plus tard : un document qui diffère de l'état capturé a un pas à annuler,
///   et plus rien à rétablir — une nouvelle action efface la branche.
/// - Un geste du canvas suspend la capture jusqu'à sa fin : un glissé, même
///   lent, même arrêté sous le doigt, compte UN pas.
///
/// Le compositeur garde la pile et les ressources mises de côté ; ce type tient
/// le RYTHME de la capture et les règles pures d'un pas : son encodage, ce qu'il
/// peut encore ressusciter, et la diapo qui garde la main quand il s'applique.
@MainActor
final class StoryComposerHistoryPace {
    nonisolated deinit {}

    struct Buttons: Equatable {
        let canUndo: Bool
        let canRedo: Bool
    }

    /// Réarme la capture sans changement du document : la fin d'un geste.
    let nudge = PassthroughSubject<Void, Never>()
    /// Un geste du canvas est en cours : ses états intermédiaires ne sont pas des pas.
    private(set) var captureHeld = false
    /// Un instantané est en cours d'application : ce n'est pas une action.
    var isApplying = false
    private var observers: Set<AnyCancellable> = []

    /// La capture débouncée : le document, la sortie du dessin, la fin d'un geste.
    func trigger(document: AnyPublisher<Void, Never>, drawing: AnyPublisher<Void, Never>,
                 interval: TimeInterval) -> AnyPublisher<Void, Never> {
        document
            .merge(with: drawing, nudge.eraseToAnyPublisher())
            .debounce(for: .seconds(interval), scheduler: DispatchQueue.main)
            .eraseToAnyPublisher()
    }

    /// Suit le document et les gestes du canvas, une seule fois.
    /// `released` part à la fin d'un geste, avant le réarmement de la capture.
    func observe(document: Published<[StorySlide]>.Publisher,
                 changed: @escaping @MainActor ([StorySlide]) -> Void,
                 released: @escaping @MainActor () -> Void) {
        guard observers.isEmpty else { return }
        document
            .sink { nouvelles in changed(nouvelles) }
            .store(in: &observers)
        NotificationCenter.default
            .publisher(for: .storyCanvasManipulationDidChange)
            .sink { [weak self] note in
                let actif = note.userInfo?[StoryCanvasManipulation.activeKey] as? Bool ?? false
                MainActor.assumeIsolated {
                    guard let self, self.hold(actif) else { return }
                    released()
                    self.nudge.send()
                }
            }
            .store(in: &observers)
    }

    /// Tient ou relâche la capture ; `true` quand un geste vient de finir.
    @discardableResult
    func hold(_ tenu: Bool) -> Bool {
        guard captureHeld != tenu else { return false }
        captureHeld = tenu
        return !tenu
    }

    /// Les boutons au moment de l'action, pour un document comparé à l'état capturé.
    static func buttons(for document: [StorySlide], captured: Data,
                        canUndo: Bool, canRedo: Bool) -> Buttons {
        let modifie = encode(document) != captured
        return Buttons(canUndo: modifie || canUndo, canRedo: !modifie && canRedo)
    }

    /// **Ce qu'un pas peut encore ressusciter.** Les bitmaps et octets animés
    /// mis de côté par une suppression ne servent qu'à un undo : quand plus aucun
    /// pas ne les référence — évincés par le cap, ou branche de rétablissement
    /// tronquée —, ils restaient en mémoire jusqu'à la sortie du composer. Un
    /// identifiant présent dans les octets d'un pas est conservé (un faux
    /// positif garde, jamais ne perd).
    static func retained<Value>(_ retired: [String: Value], reachableFrom states: [Data]) -> [String: Value] {
        retired.filter { entree in
            let aiguille = Data(entree.key.utf8)
            return states.contains { $0.range(of: aiguille) != nil }
        }
    }

    /// Le document d'un pas ; `nil` s'il ne se lit pas ou ne porte aucune diapo.
    static func decode(_ data: Data) -> [StorySlide]? {
        guard let slides = try? JSONDecoder().decode([StorySlide].self, from: data), !slides.isEmpty else { return nil }
        return slides
    }

    /// La diapo éditée garde la main par son IDENTIFIANT : l'index seul glissait
    /// (supprimer A sous C, puis annuler, montrait B).
    static func index(of editedSlideId: String?, in restored: [StorySlide], previous: Int) -> Int {
        if let editedSlideId, let index = restored.firstIndex(where: { $0.id == editedSlideId }) { return index }
        return min(max(0, previous), restored.count - 1)
    }

    /// Encodage déterministe (`.sortedKeys` — l'ordre des clés JSONEncoder
    /// est instable sur iOS 26, la dédup de la pile exige des octets stables).
    nonisolated static func encode(_ slides: [StorySlide]) -> Data? {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try? encoder.encode(slides)
    }
}
