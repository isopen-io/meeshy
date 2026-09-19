import Foundation

/// **Un apaisement différé, réarmable, QUI NE CHAÎNE PAS** (#7034).
///
/// ## Le défaut qu'il existe pour supprimer
///
/// Douze débordements de pile en seize jours sur l'appareil du porteur, dont six
/// de la même forme exacte — `originalLength` 18 219 à 18 305 frames,
/// `recursionInfoArray.depth` 3 035 à 3 048, la pile de 1008 Ko entièrement
/// consommée. Le cycle répété tient en onze frames :
///
/// ```
/// DispatchWorkItem.__deallocating_deinit
///   _Block_release → block_destroy_helper
///     outlined destroy of DispatchWorkItem?   ← le bloc en tenait un AUTRE
/// DispatchWorkItem.__deallocating_deinit      ← le maillon suivant
/// ```
///
/// **Comment la chaîne se forme.** Une fermeture écrite à l'intérieur d'une
/// `View` ou d'un `ViewModifier` — une STRUCT — capture la struct ENTIÈRE, tous
/// ses champs compris. Un `@State private var settleWork: DispatchWorkItem?`
/// range sa valeur EN LIGNE dans la struct : le bloc du work item qu'on vient
/// de créer retient donc celui d'avant, qui retient celui d'encore avant. La
/// chaîne s'allonge à chaque réarmement, et sa libération est récursive.
///
/// **Pourquoi « allouer moins » ne corrige rien.** 1008 Ko / 18 300 frames font
/// ~56 octets par frame : la profondeur mesurée n'est pas la longueur de la
/// chaîne, c'est ce que la pile encaisse avant sa page de garde. La chaîne est
/// plus longue que ce qu'on voit, et le plantage tombera toujours au même
/// endroit tant qu'elle existe. Il faut qu'elle n'existe pas.
///
/// ## Ce que ce type garantit
///
/// Le work item est tenu par une **classe**, jamais par l'état d'une vue, et son
/// bloc ne capture **que l'action de l'appelant** — ni `self`, ni le work item
/// précédent. Un réarmement annule le précédent et le relâche ; rien ne le
/// retient plus. C'est le patron que `LentilleSceneActivity` et
/// `MessageListViewController` appliquaient déjà à la main.
///
/// `nonisolated` + `@unchecked Sendable` : même patron que les registres de la
/// Lentille — armé et annulé depuis le main thread par ses hôtes, jamais
/// ailleurs.
public nonisolated final class Debouncer: @unchecked Sendable {

    private var pending: DispatchWorkItem?

    public init() {}

    /// Arme (ou RÉARME) l'apaisement. Un appel annule le précédent : à tout
    /// instant, au plus UN work item est retenu par ce debouncer.
    ///
    /// - Important: `action` ne doit pas capturer ce `Debouncer` fortement,
    ///   sous peine de cycle — les hôtes le tiennent en `@State`, donc la
    ///   fermeture capture la struct de vue, qui ne porte qu'une RÉFÉRENCE.
    public func arm(after delay: TimeInterval, _ action: @escaping () -> Void) {
        pending?.cancel()
        // `DispatchWorkItem(block:)` ne capture QUE `action`. Ne jamais écrire
        // ici une fermeture qui lise `pending` : ce serait très exactement le
        // maillon que ce type existe pour supprimer.
        let work = DispatchWorkItem(block: action)
        pending = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    /// Annule l'apaisement en attente. Idempotent.
    public func cancel() {
        pending?.cancel()
        pending = nil
    }

    /// Le work item en attente, pour les témoins seulement — il permet de
    /// mesurer par une référence FAIBLE qu'un réarmement relâche bien le
    /// précédent, ce qu'aucune observation extérieure ne peut prouver.
    var pendingForTests: DispatchWorkItem? { pending }

    // La deinit d'une classe `nonisolated` ne peut pas être isolée : garde
    // `MeeshyUIDeinitSourceGuardTests`.
    deinit { pending?.cancel() }
}
