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
    /// cité (le NOM ne l'ouvre plus). L'identité vient du message cité quand le
    /// store local le porte, sinon de la citation (`authorUserId`) ; sans
    /// identifiant d'auteur, RIEN ne s'ouvre (`QuotedAuthorProfileTarget`).
    /// La porte est `router.openProfile(_:inConversation:)`, comme celle de
    /// l'avatar du pied : une visiteuse sans compte atteint sa fiche de
    /// participation, jamais une feuille de compte vide.
    func openQuotedAuthorProfile(_ reference: ReplyReference) {
        let localId = resolveLocalId(reference.messageId)
        let quoted = store.domainMessage(for: localId, currentUserId: currentUserId)
        let conversationId = quoted?.conversationId ?? conversationViewModel?.conversationId
        let username = quoted?.senderUsername ?? quoted?.senderName ?? reference.authorName
        let displayName = quoted?.senderName ?? reference.authorName
        let avatarURL = quoted?.senderAvatarURL ?? reference.authorAvatarUrl
        if let quoted, quoted.senderIsAnonymous {
            router.openProfile(ProfileSheetUser(
                username: username, displayName: displayName, avatarURL: avatarURL,
                accentColor: reference.authorColor, participantId: quoted.senderId, isAnonymous: true
            ), inConversation: conversationId)
            return
        }
        guard let userId = QuotedAuthorProfileTarget.userId(
            quotedSenderUserId: quoted?.senderUserId,
            referenceAuthorUserId: reference.authorUserId
        ) else { return }
        router.openProfile(ProfileSheetUser(
            userId: userId, username: username, displayName: displayName,
            avatarURL: avatarURL, accentColor: reference.authorColor
        ), inConversation: conversationId)
    }

    /// Tap sur la zone MÉDIA d'une citation. Image et vidéo s'ouvrent EN PLEIN
    /// ÉCRAN (#8230) par `onMediaTap`. Un AUDIO se joue SUR PLACE (#8320,
    /// directive porteur du 2026-09-27, qui supplante le plein écran audio de
    /// #8230) : un toucher joue, un second met en pause, par le lecteur PARTAGÉ
    /// (`ConversationViewModel.toggleQuotedAudio`). Rien à jouer (protégé,
    /// expiré, sans adresse) → saut à l'original, comme la zone 3.
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
        // Le geste, l'élection et le verrou vivent dans `QuotedMediaOpening`,
        // partagé avec la Rivière (#8283). Miroir de `BubbleGridCell.handleTap`,
        // qui refuse d'ouvrir un attachement protégé tant qu'il n'a pas été
        // révélé : élargir une porte sans son verrou serait une régression
        // d'exposition. Le repli est le saut à l'original, où le média garde son
        // propre geste de révélation et où la carte document offre
        // téléchargement/partage.
        switch QuotedMediaOpening.gesture(for: reference, quoted: quoted) {
        case .playInPlace:
            if conversationViewModel?.toggleQuotedAudio(reference) != true {
                scrollToMessage(localId: localId)
            }
        case .open(let attachment):
            onMediaTap?(attachment)
        case .followQuote:
            scrollToMessage(localId: localId)
        }
    }

    /// **Le saut vers le message cité** — zone 3 d'une citation (#9911). La
    /// cellule qui porte la citation remet SA référence : si elle nomme une
    /// pièce, la tuile s'allumera quand le saut se posera (`flashCell`).
    func followQuote(_ reference: ReplyReference?, to targetId: String) {
        pendingPieceSpotlight = QuotedPieceSpotlight.pieceId(of: reference, jumpingTo: targetId)
            .map { (localId: resolveLocalId(targetId), pieceId: $0) }
        scrollToMessage(localId: targetId)
    }

    /// Le saut s'est posé sur `indexPath` : la pièce citée s'allume, une fois.
    func releasePieceSpotlight(at indexPath: IndexPath) {
        guard let pending = pendingPieceSpotlight,
              dataSource?.itemIdentifier(for: indexPath) == .message(localId: pending.localId) else { return }
        pendingPieceSpotlight = nil
        let pieceId = pending.pieceId
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            self?.pieceSpotlight.send(pieceId)
        }
    }
}
