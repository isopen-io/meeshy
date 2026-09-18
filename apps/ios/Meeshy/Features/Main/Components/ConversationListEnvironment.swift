import SwiftUI

// MARK: - Le modèle de LISTE, remis SANS abonnement (#7006)
//
// `@EnvironmentObject` s'abonne à `objectWillChange` dès sa DÉCLARATION — bien
// avant qu'une ligne de `body` ne lise quoi que ce soit. `ConversationView` et
// `MessageListView` le déclaraient pour des usages qui ne lisent AUCUN
// `@Published` : deux ré-injections vers des covers, un hôte d'aperçu, la
// bannière de connexion, la recherche d'un DM déjà ouvert (hors `body`), et
// une seule construction de contrôleur UIKit. Elles payaient pourtant chaque
// mutation des dix-huit `@Published` du modèle — dont `typingUsernames` et
// `typingUsers`, mutés à CHAQUE `typing:start` / `typing:stop` de N'IMPORTE
// QUELLE conversation. Un contact qui tape ailleurs ré-évaluait donc les 7 333
// lignes de la conversation OUVERTE, et rejouait `updateUIViewController`.
//
// `EnvironmentValues` ne transporte que la RÉFÉRENCE : elle ne change jamais de
// la vie de la fenêtre, donc aucune ré-évaluation. Même patron que
// `SocialChromeEnvironment.swift`, et pour la seconde raison qu'il documente :
// une feuille hérite des EnvironmentValues, jamais des EnvironmentObject.

/// `nil` est un ABSENT LÉGITIME, pas une erreur : le flux invité
/// (`GuestConversationContainer`, présenté par `MeeshyApp` HORS de `RootView`)
/// n'a jamais monté de liste de conversations. L'absence DÉGRADE — pas de DM
/// déjà ouvert à retrouver dans le cache, pas de file d'envoi à peindre — là où
/// `EnvironmentObject.wrappedValue` trappait sur un objet manquant.
private struct MeeshyConversationListKey: EnvironmentKey {
    static let defaultValue: ConversationListViewModel? = nil
}

extension EnvironmentValues {
    /// Le `ConversationListViewModel` de la fenêtre, en LECTURE SEULE et SANS
    /// abonnement. Pour les vues qui n'en veulent que la référence : la passer
    /// plus bas, la remettre à un contrôleur, ou la lire dans une fermeture
    /// hors `body`. Une vue qui affiche l'ÉTAT de la liste (la liste elle-même,
    /// ses lignes, le picker de partage) garde `@EnvironmentObject` — c'est
    /// l'abonnement qui la rend vivante.
    var meeshyConversationList: ConversationListViewModel? {
        get { self[MeeshyConversationListKey.self] }
        set { self[MeeshyConversationListKey.self] = newValue }
    }
}

extension View {
    /// Pose le modèle de liste sur les DEUX canaux d'un seul geste : l'OBJET
    /// pour les vues qui lisent son état, la VALEUR pour celles qui n'en
    /// veulent que la référence.
    ///
    /// Les séparer, c'est laisser un hôte en oublier un — et l'oubli de la
    /// VALEUR est SILENCIEUX : la vue ne rougit pas, elle dégrade (pas de
    /// bannière, pas de chemin rapide). À appeler partout où
    /// `.environmentObject(conversationListViewModel)` était posé pour un hôte
    /// qui monte une `ConversationView`.
    func meeshyConversationList(_ viewModel: ConversationListViewModel) -> some View {
        environmentObject(viewModel)
            .environment(\.meeshyConversationList, viewModel)
    }

    /// Repose l'OBJET une couche plus bas depuis un optionnel, sans que l'hôte
    /// s'y abonne. Voir `ConversationListObjectInjection`.
    func conversationListObject(_ viewModel: ConversationListViewModel?) -> some View {
        modifier(ConversationListObjectInjection(viewModel: viewModel))
    }
}

/// **Remet l'objet aux enfants qui le lisent encore, `nil` compris.**
///
/// Un `fullScreenCover` n'hérite pas des EnvironmentObject de son présentateur,
/// et une cellule UIKit (`UIHostingConfiguration`) n'hérite de RIEN : les vues
/// qui déclarent `@EnvironmentObject ConversationListViewModel`
/// (`StoryViewerView` → `SharePickerView`, les bulles) doivent le recevoir
/// explicitement. Leur hôte, lui, n'a plus qu'un optionnel.
///
/// Un `ViewModifier` NOMINAL, et non un `if let` posé dans le `body` de l'hôte :
/// la profondeur de type des `body` de cet écran est MESURÉE
/// (`ConversationViewBodyTypeDepthTests` — dix-huit rapports de débordement de
/// pile sur device), et un `_ConditionalContent` de plus s'y paierait en pile.
/// Ici la branche vit dans le type du MODIFICATEUR ; l'hôte n'en voit qu'un
/// niveau, exactement ce que coûtait le `.environmentObject(...)` remplacé.
struct ConversationListObjectInjection: ViewModifier {
    let viewModel: ConversationListViewModel?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let viewModel {
            content.environmentObject(viewModel)
        } else {
            content
        }
    }
}
