// MARK: - Extracted from ConversationView.swift
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Longpress Menu Presentation (#4004)

extension ConversationView {

    /// Sous ce seuil (fraction de la hauteur d'écran), le message est jugé
    /// assez haut pour que le menu s'affiche entièrement sans remonter la
    /// liste. Au-delà, le message est trop bas — la liste remonte jusqu'à ce
    /// qu'il soit proche du centre vertical AVANT que le menu ne s'ouvre.
    static let longPressRepositionThreshold: CGFloat = 0.6

    /// Le temps laissé à `scrollToItem(at: .centeredVertically, animated:
    /// true)` (`MessageListViewController.beginVerifiedScroll`) pour amener
    /// le message vers le centre avant de présenter le menu par-dessus.
    static let longPressRepositionDelay: TimeInterval = 0.3

    /// **Le point d'entrée UNIQUE du menu longpress (#4004).**
    ///
    /// Deux ajustements AVANT présentation, jamais après (sinon le menu
    /// s'ouvrirait mal placé puis se recalerait sous les yeux de l'auteur) :
    /// 1. Le clavier (et le panneau d'options du composer, même geste) se
    ///    ferme — un clavier actif mange une partie de l'écran que le menu
    ///    doit pouvoir occuper.
    /// 2. Si le message est trop bas (`longPressRepositionThreshold`), la
    ///    liste remonte vers son centre AVANT que `showOverlayMenu` ne passe
    ///    à `true` — réutilise le mécanisme de scroll centré déjà existant
    ///    (`scrollState.scrollToMessageId`/`scrollToMessageTrigger`, la MÊME
    ///    voie que le saut vers une citation ou un message non lu), qui
    ///    centre déjà verticalement sa cible
    ///    (`collectionView.scrollToItem(at: .centeredVertically:)`).
    ///
    /// `cellFrame` (`nil` si la cellule n'est pas matérialisée) vient du
    /// SITE D'APPEL UIKit (`MessageListViewController.cellFrameInWindow`,
    /// même patron qu'`onAddReaction`) — **pas** de `frameTracker` (revue
    /// 2026-08-27) : `MessageFramePreferenceKey` ne traverse la frontière
    /// UIKit qu'en mode Rivière (`RiverBubbleView`, seul site qui la publie
    /// réellement) ; la liste standard (`MessageListView`/
    /// `MessageListViewController`) a RETIRÉ sa propre publication au profit
    /// de `cellFrameInWindow` — lire `frameTracker.frame(for:)` ici aurait
    /// rendu ce correctif un NO-OP silencieux dans le mode de lecture le
    /// plus courant.
    ///
    /// `cellFrame == nil` : aucun ajustement de scroll n'a de sens, le menu
    /// se présente directement.
    ///
    /// L'état désactivé ici (clavier, panneau d'options) est mémorisé dans
    /// `overlayState.restoreAfterLongPress` et restitué par
    /// `restoreStateAfterLongPressIfNeeded()`, appelée quand le menu se
    /// referme.
    func presentLongPressMenu(for message: Message, cellFrame: CGRect?) {
        overlayState.overlayMessage = message
        overlayState.restoreAfterLongPress = (isTyping: isTyping, showOptions: composerState.showOptions)
        isTyping = false
        composerState.showOptions = false

        guard let frame = cellFrame,
              frame.midY > UIScreen.main.bounds.height * Self.longPressRepositionThreshold
        else {
            overlayState.showOverlayMenu = true
            return
        }

        scrollState.scrollToMessageId = message.id
        scrollState.scrollToMessageTrigger += 1
        // `self` est une struct SwiftUI : la fermeture copie la vue, mais
        // `@State` porte un stockage PARTAGÉ — muter `overlayState` ici
        // touche bien l'état affiché, sans risque de cycle (pas de classe).
        // Même patron que `ComposerSendFlyPreview`/`triggerSendFlyAnimation`.
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.longPressRepositionDelay) {
            self.overlayState.showOverlayMenu = true
        }
    }

    /// **Restitue le clavier/panneau d'options désactivés par
    /// `presentLongPressMenu` (#4004).** Appelée quand le menu longpress se
    /// referme (`.onChange(of: overlayState.showOverlayMenu)`, câblé au site
    /// de montage du menu).
    ///
    /// **Sauf en cas d'entrée en édition** : `beginEdit` (appelé par l'action
    /// « Éditer » du menu, sur le MÊME dismiss) veut le clavier OUVERT pour
    /// que l'auteur tape sa modification — restituer l'état PRÉ-longpress
    /// écraserait ce choix. `editingMessageId != nil` juste après la
    /// fermeture est le signal que cette action a été prise.
    func restoreStateAfterLongPressIfNeeded() {
        guard let saved = overlayState.restoreAfterLongPress else { return }
        overlayState.restoreAfterLongPress = nil
        guard composerState.editingMessageId == nil else {
            isTyping = true
            return
        }
        isTyping = saved.isTyping
        composerState.showOptions = saved.showOptions
    }
}
