// apps/ios/Meeshy/Features/Main/Views/ConversationView+Keyboard.swift

import SwiftUI
import UIKit

// MARK: - Ce que la conversation sait du clavier

extension ConversationView {

    /// Hauteur du clavier présenté, 0 quand il est absent.
    ///
    /// Elle ne sert qu'à GELER la mesure du composeur (voir
    /// `resolvedComposerHeight`) : le fil, lui, ne réserve jamais la place du
    /// clavier — SwiftUI remonte déjà tout le conteneur par son évitement natif.
    var keyboardHeight: CGFloat { keyboardTransition?.height ?? 0 }

    /// La courbe sur laquelle la réserve basse du fil rejoint sa nouvelle
    /// valeur.
    ///
    /// `nil` tant qu'aucun clavier n'a parlé : le montage de l'écran et la
    /// première mesure du composeur sont des causes SÈCHES, et les animer
    /// ferait glisser le fil à chaque ouverture de conversation.
    ///
    /// Ensuite, c'est la DERNIÈRE annonce du clavier qui donne le tempo — mais
    /// SEULEMENT le temps du mouvement qu'elle annonce (`isLive`). Le pas de
    /// `safeAreaBottom` (~34 pt, la fenêtre les perd clavier levé et les
    /// reprend au masquage) n'est PAS lu réactivement : `bottomInset` le relit
    /// sur `DeviceLayout.safeAreaBottom` à chaque passe de `body`, donc il
    /// atterrit dans une passe ULTÉRIEURE à la notification — pendant le
    /// mouvement, et c'est précisément ce pas-là que #4949 empêche de se
    /// téléporter. La marge de `KeyboardTransition.liveSlack` le couvre.
    ///
    /// Passé ce mouvement, la transition n'est plus servie. Servie sans fin,
    /// elle animait sur la courbe du clavier des pas qui ne lui appartenaient
    /// pas : une croissance du composeur clavier BAISSÉ (tiroir de pièces
    /// jointes, bandeau de réponse, options, tuile de lieu) rejouait sa courbe
    /// à chaque fois qu'un clavier avait parlé une fois. Son `GeometryReader`
    /// republie déjà la hauteur à CHAQUE frame de l'animation SwiftUI — l'inset
    /// la suit donc image par image, et la doubler d'une animation UIKit de la
    /// durée annoncée la faisait TRAÎNER de 0,25 s au lieu de coller.
    var listInsetTransition: ListInsetTransition? {
        guard let keyboardTransition, keyboardTransition.isLive() else { return nil }
        return keyboardTransition.listInset
    }
}

// MARK: - Observation des notifications clavier

/// Suit les deux notifications clavier et n'en retient qu'un fait : la
/// transition annoncée (hauteur d'arrivée, durée, courbe).
///
/// Un modificateur plutôt que deux `onReceive` posés dans le corps de
/// `ConversationView` : le décodage a UN site (`KeyboardTransition`), la vue
/// hôte n'en garde qu'une ligne, et la règle « une présentation sans frame ne
/// touche à rien » est vérifiable sans monter la vue.
struct KeyboardTransitionObserver: ViewModifier {

    @Binding var transition: KeyboardTransition?

    func body(content: Content) -> some View {
        content
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { notification in
                guard let next = KeyboardTransition(userInfo: notification.userInfo, isPresenting: true) else { return }
                transition = next
            }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { notification in
                guard let next = KeyboardTransition(userInfo: notification.userInfo, isPresenting: false) else { return }
                transition = next
            }
    }
}

extension View {

    /// Tient à jour la transition clavier courante de l'écran.
    func observingKeyboardTransition(_ transition: Binding<KeyboardTransition?>) -> some View {
        modifier(KeyboardTransitionObserver(transition: transition))
    }
}
