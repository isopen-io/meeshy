import SwiftUI
import Combine

// MARK: - Isolement du texte de recherche (#7158)
//
// Le texte de recherche vivait en `@Published` sur `ConversationListViewModel`
// — le modèle que la racine de la liste déclare en `@EnvironmentObject`. Or
// `@EnvironmentObject` s'abonne à `objectWillChange`, pas à un champ : chaque
// caractère frappé ré-exécutait le corps de la liste entière, soit un
// `flatMap` sur toutes les conversations, six actions de balayage par rangée
// et une copie des catégories par rangée — avant même d'entrer dans la
// comparaison d'égalité.
//
// L'anti-rebond de 16 ms du pipeline protégeait le FILTRAGE, jamais
// l'INVALIDATION : il retarde le calcul, pas la publication qui le déclenche.
//
// Même dispositif que `ConversationComposerTextModel` (#4105) pour le texte du
// composeur : le modèle vit hors de l'arbre de dépendances de la racine, qui
// le porte sans jamais le lire, et un hôte dédié en est l'unique observateur.

/// Stockage du texte de recherche de la liste de conversations, hors de
/// l'arbre de dépendances de la racine.
///
/// Le modèle de liste le TIENT (pour alimenter son pipeline de filtrage) sans
/// le republier : `searchText` y est une propriété calculée, pas un
/// `@Published`. Seul `ConversationSearchFieldHost` s'y abonne.
@MainActor
final class ConversationSearchTextModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` au
    // démontage hors d'une tâche. Même garde que
    // `ConversationComposerTextModel` : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    @Published var text: String = ""
}
