import SwiftUI
import MeeshyUI

// MARK: - Registre des candidats

/// Boîte mutable **INERTE** : les `GeometryReader` des rangs y écrivent leur
/// milieu à chaque layout (défilement compris) sans déclencher la moindre
/// invalidation SwiftUI. Même patron — et même raison d'être — que
/// `SectionFrameRegistry` (`ConversationListView.swift`), auquel elle
/// n'emprunte que l'idée : un `@State [String: CGFloat]` re-évaluerait la
/// liste entière à chaque tick de défilement, c'est-à-dire tous les rangs, à
/// la fréquence de rafraîchissement de l'écran.
///
/// **Pourquoi mesurer les rangs plutôt que d'interroger le défilement.**
/// L'élection a besoin du `midY` de CHAQUE rang candidat — la géométrie du
/// conteneur de défilement (offset, taille du contenu, région visible) ne la
/// donne pas, quelle que soit l'API qui la publie. Toute solution passe donc
/// par une mesure des rangs ; celle-ci s'appuie sur les `GeometryReader` que
/// le layout évalue de toute façon, et n'ajoute AUCUN observateur de
/// défilement au seul qui existe (`onScrollOffsetChange` de
/// `MeeshyRefreshableScroll` → `ScrollOffsetRelay`).
///
/// Seuls les rangs RÉELLEMENT montés s'y inscrivent : le `LazyVStack` de la
/// liste n'en matérialise qu'une poignée à la fois, et `onDisappear` les
/// retire. Le registre ne grandit donc pas avec le compte de conversations.
final class LentilleFocusCandidateRegistry {

    private(set) var midYById: [String: CGFloat] = [:]

    /// Enregistre ou MET À JOUR la position d'un rang. Un id déjà présent est
    /// remplacé, jamais dupliqué : deux entrées pour un même rang fausseraient
    /// toute élection ultérieure.
    func register(id: String, midY: CGFloat) {
        midYById[id] = midY
    }

    /// Un rang sorti de l'écran cesse d'être candidat — sinon il resterait
    /// éligible depuis une position périmée.
    func unregister(id: String) {
        midYById.removeValue(forKey: id)
    }

    /// Vue du registre dans la forme que l'électeur du miroir attend. L'ordre
    /// d'itération d'un dictionnaire n'est pas stable : c'est le départage par
    /// `id` de `FocalFocusCurve.electFocusRow` qui rend le résultat
    /// déterministe, et c'est pour cela qu'on ne trie pas ici.
    var candidates: [FocalFocusCurve.RowCandidate] {
        midYById.map { FocalFocusCurve.RowCandidate(id: $0.key, midY: $0.value) }
    }
}

// MARK: - Magasin de l'élu

/// L'état d'élu — publié à chaque CHANGEMENT, et à eux seuls.
///
/// Il vit ici, dans un petit objet dédié, et non dans le body de la liste :
/// l'y porter re-diffuserait tous les rangs à chaque tick de défilement,
/// précisément le défaut que `ScrollOffsetRelay` a été créé pour éliminer
/// (arbitrage LWS-6/I-063bis, repris tel quel). `ConversationListView` en
/// retient la RÉFÉRENCE dans un `@State` — donc sans s'abonner ; seuls les
/// consommateurs réels de la carte s'abonneront (focus card, LWS-8/I-071).
///
/// `nonisolated` sur le TYPE, pas par membre — même piège et même remède que
/// `ScrollOffsetRelay` (`MeeshyUI/Primitives`) : sous
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, Swift 6.2 dote la `deinit`
/// d'une isolation, que le shim de rétro-déploiement des OS antérieurs
/// exécute en libérant DEUX FOIS le scope task-local — le démontage de la
/// liste tuait alors le processus. Un magasin qui ne porte qu'un identifiant
/// n'a rien à démonter sur le main actor.
///
/// `willSet { objectWillChange.send() }` plutôt que `@Published` : le
/// compilateur refuse `nonisolated` sur une propriété enveloppée. C'est
/// exactement ce que `@Published` fait — publier avant l'écriture.
nonisolated final class LentilleFocusElection: ObservableObject {

    /// `nil` tant qu'aucune élection n'a eu lieu (liste vide, premier rendu
    /// avant le premier tick).
    private(set) var electedId: String? {
        willSet { objectWillChange.send() }
    }

    init(electedId: String? = nil) {
        self.electedId = electedId
    }

    /// Écriture GARDÉE par l'inégalité — même discipline que
    /// `SectionScrollPillHost.applyLaw`. Sans elle, un défilement soutenu
    /// publierait une invalidation par tick à tous les abonnés de la carte
    /// pour zéro changement visible : l'élu ne change qu'une fois par rang
    /// franchi, pas une fois par frame.
    func adopt(_ id: String?) {
        guard id != electedId else { return }
        electedId = id
    }
}

// MARK: - Candidature d'un rang

extension View {

    /// Inscrit le rang comme candidat à la focus card — ou ne monte RIEN.
    ///
    /// Sous drapeau OFF le rang est rendu nu : ni `background`, ni
    /// `GeometryReader`, ni mesure. Un modificateur « inerte » coûterait quand
    /// même une lecture de géométrie par rang et par layout, et le rendu hors
    /// Lentille doit rester celui d'aujourd'hui au bit près.
    ///
    /// La mesure est prise en coordonnées GLOBALES : c'est le seul repère
    /// commun au rang (dans le défilement) et à l'hôte d'élection (posé sur le
    /// conteneur, donc hors du contenu qui défile). Écrire dans le registre
    /// n'invalide rien — c'est une boîte inerte, pas un état de vue.
    @ViewBuilder
    func lentilleFocusCandidate(
        id: String,
        registry: LentilleFocusCandidateRegistry,
        isEnabled: Bool
    ) -> some View {
        if isEnabled {
            background(
                GeometryReader { geo in
                    Color.clear
                        .onAppear { registry.register(id: id, midY: geo.frame(in: .global).midY) }
                        .adaptiveOnChange(of: geo.frame(in: .global).midY) { _, midY in
                            registry.register(id: id, midY: midY)
                        }
                        .onDisappear { registry.unregister(id: id) }
                }
            )
        } else {
            self
        }
    }
}
