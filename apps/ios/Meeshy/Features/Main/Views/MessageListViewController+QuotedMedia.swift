// apps/ios/Meeshy/Features/Main/Views/MessageListViewController+QuotedMedia.swift

import UIKit
import SwiftUI
import MeeshySDK
import MeeshyUI

//
// Les deux portes d'une citation que le contrôleur résout — l'AUTEUR cité
// (zone 1) et le MÉDIA cité (zone 2). Extraites de `MessageListViewController`
// (hors budget de taille, interdit d'ajout) pour que #8230 puisse y changer la
// résolution du média sans y ajouter une ligne.
//

extension MessageListViewController {

    /// ZONE 1 de la LOI DES ZONES (2026-08-24) — tap sur l'AVATAR de l'auteur
    /// cité (le NOM ne l'ouvre plus). Résout le message cité dans le store
    /// local pour ouvrir le profil RÉEL (username/avatar) ; repli sur une
    /// fiche nom-seul (la sheet profil résout par username) quand le cité
    /// n'est plus dans la fenêtre locale.
    ///
    /// L'avatar de la RÉFÉRENCE est le dernier recours des deux branches : il
    /// voyage avec la citation depuis le 2026-08-24, là où la relecture du
    /// store dépend, elle, de la position de défilement. Sans lui, la fiche
    /// ouverte depuis un message sorti de la fenêtre chargée s'affichait sans
    /// visage — le geste ouvrait bien la porte, mais la pièce était vide.
    func openQuotedAuthorProfile(_ reference: ReplyReference) {
        let localId = resolveLocalId(reference.messageId)
        if let quoted = store.domainMessage(for: localId, currentUserId: currentUserId) {
            router.deepLinkProfileUser = ProfileSheetUser(
                userId: quoted.senderId,
                username: quoted.senderUsername ?? quoted.senderName ?? reference.authorName,
                displayName: quoted.senderName ?? reference.authorName,
                avatarURL: quoted.senderAvatarURL ?? reference.authorAvatarUrl,
                accentColor: reference.authorColor
            )
            return
        }
        router.deepLinkProfileUser = ProfileSheetUser(
            userId: nil,
            username: reference.authorName,
            displayName: reference.authorName,
            avatarURL: reference.authorAvatarUrl,
            accentColor: reference.authorColor
        )
    }

    /// Tap sur la zone MÉDIA d'une citation — EN PLEIN ÉCRAN, quel que soit le
    /// média (#8230) : image et vidéo ouvrent la galerie, un vocal ouvre le
    /// plein écran audio (`ConversationView+AudioFullscreen`). Les deux passent
    /// par `onMediaTap`, que l'hôte route selon le genre. L'audio lançait la
    /// lecture DANS le fil (`playAudio`) : la directive demande le plein écran.
    ///
    /// La pièce est élue par `ReplyReference.citedAttachment(among:)`, site
    /// UNIQUE partagé avec son ICÔNE (#6164). Le message cité HORS de la
    /// fenêtre chargée ne retombe plus sur le saut : la pièce se reconstruit
    /// depuis les faits de la citation (`ReplyReference.quotedAttachment` —
    /// jamais pour un secret, faute d'adresse). Document, pièce nommée
    /// introuvable ou citation sans adresse → saut à l'original (la carte
    /// document y offre téléchargement/partage).
    func openQuotedMedia(_ reference: ReplyReference) {
        let localId = resolveLocalId(reference.messageId)
        let quoted = store.domainMessage(for: localId, currentUserId: currentUserId)
        // L'élection et le verrou vivent dans `QuotedMediaOpening`, partagé avec
        // la Rivière (#8283). Miroir de `BubbleGridCell.handleTap`, qui refuse
        // d'ouvrir un attachement protégé tant qu'il n'a pas été révélé :
        // élargir une porte sans son verrou serait une régression d'exposition.
        // Le repli est le saut à l'original, où le média garde son propre geste
        // de révélation et où la carte document offre téléchargement/partage.
        guard let attachment = QuotedMediaOpening.attachment(for: reference, quoted: quoted) else {
            scrollToMessage(localId: localId)
            return
        }
        onMediaTap?(attachment)
    }
}
