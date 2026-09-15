import Foundation
import Combine
import UIKit
import GRDB
import MeeshySDK
import MeeshyUI
import os

// Extrait de `ConversationViewModel.swift` (#4942, D-MAINT-01), qui portait
// 4 832 lignes — quatre fois le plafond DUR de 1 200 de la directive
// 2026-09-02, que `FileSizeBudgetGuardTests` mesure et qui interdit d'AJOUTER
// à un fichier hors budget. Un chantier de fluidité qui doit toucher le
// chargement, l'envoi et l'observation du magasin ne pouvait pas commencer
// avant : on extrait d'abord, on ajoute ensuite. Le découpage suit une
// RESPONSABILITÉ, jamais une tranche de lignes.
//
// `private` est de portée FICHIER en Swift : les membres de l'hôte que cette
// extension consomme se sont élargis en interne par la découpe, pas par un
// choix de visibilité. Les propriétés STOCKÉES restent chez l'hôte — une
// extension ne peut pas en déclarer.
//
// Responsabilité tenue ici : composer la CITATION OPTIMISTE — celle que porte
// la bulle avant l'écho serveur (les deux chemins d'envoi, texte seul et avec
// pièces jointes) ET la bannière de réponse du composeur (`triggerReply`,
// `ConversationView+MessageRow`). Fabrique UNIQUE, `optimisticReplyReference
// (quoting:)` : les deux producteurs recopiaient chacun trois champs pauvres
// et divergeaient au premier champ ajouté (#4945). Sans miniature ThumbHash,
// sans dimensions ni durée, en langue d'ORIGINE, la citation naissait plate
// puis « sautait » à l'écho serveur, qui la servait riche.

extension ConversationViewModel {

    // MARK: - Reply Reference (citation de la bulle optimiste)

    /// Construit le `ReplyReference` riche destiné à la bulle optimiste à
    /// partir d'un `replyToId` (message normal) ou d'un `storyReplyReference`
    /// pré-fourni (story reply). Single source of truth pour les deux chemins
    /// d'envoi : texte-seul (sendMessage) et avec attachements
    /// (insertOptimisticMediaMessage).
    ///
    /// L'absence de cette helper laissait `replyToJson` à nil dans le chemin
    /// avec attachements, ce qui faisait que la quoted-reply card n'apparaissait
    /// jamais dans la bulle optimiste pour les replies audio/video/image/galerie.
    ///
    /// `citingAttachmentId` — l'ANCRE que l'envoi porte (#6165). La bulle
    /// optimiste doit citer la MÊME pièce que le corps REST, sans quoi elle
    /// montrerait la première photo du carrousel jusqu'à l'écho serveur, puis
    /// « sauterait » sur la troisième : le saut de citation que #4945 a
    /// justement fermé, rouvert par un autre bout.
    func makeReplyReference(
        storyReplyReference: ReplyReference?,
        replyToId: String?,
        citingAttachmentId: String? = nil
    ) -> ReplyReference? {
        if let storyRef = storyReplyReference {
            return storyRef
        }
        guard let rid = replyToId,
              let quoted = messages.first(where: { $0.id == rid }) else {
            return nil
        }
        let named = citingAttachmentId.flatMap { id in quoted.attachments.first { $0.id == id } }
        return optimisticReplyReference(quoting: quoted, citing: named)
    }

    // MARK: - La fabrique unique

    /// La citation OPTIMISTE d'un message EN MÉMOIRE — la seule que la bulle
    /// optimiste et la bannière du composeur aient le droit de composer.
    ///
    /// Elle porte tout ce que l'écho serveur portera (`APIMessageReplyTo
    /// .toReplyReference`), depuis ce que le client tient déjà :
    /// - les sept FAITS du média représentatif (`QuotedAttachmentFacts`), pour
    ///   que le flou ThumbHash et la ligne « 1024×768 · 0:42 » soient là dès
    ///   le premier rendu — ce qui manquait produisait un saut visible ;
    /// - le `previewText` ÉLU par le Prisme du lecteur — « qui AFFICHE ce
    ///   qu'il élit ? » : la bulle rend `preferredTranslation(for:)`, donc la
    ///   citation cite CE texte-là, résolu par la même règle (`nil` ⇒
    ///   l'original, jamais `translations.first`, bascule manuelle comprise) ;
    /// - le placeholder d'un message PROTÉGÉ — vue unique, flouté, chiffré —
    ///   dans le vocabulaire d'`APIMessageReplyTo` et de `protectedPreview`
    ///   côté passerelle : une réponse ne republie pas le secret le temps que
    ///   le serveur accuse. Aucune vignette ni ThumbHash ne part alors avec la
    ///   citation : un flou reste une image.
    ///
    /// Le média REPRÉSENTATIF (premier hors localisation) est la MÊME règle
    /// que l'ouverture `openQuotedMedia`, pour que l'icône désigne la pièce
    /// jointe que le plein écran ouvrira. La protection d'une PIÈCE JOINTE
    /// seule (vue unique posée sur la photo, message en clair) masque sa
    /// vignette sans masquer le texte — la même lecture à deux niveaux que
    /// `mediaMayTravel` côté passerelle.
    ///
    /// **L'ANCRE est GRAVÉE (#6164).** Cette fabrique décrivait la pièce
    /// (vignette, faits, protection) sans jamais NOMMER celle qu'elle décrit,
    /// pendant que le constructeur serveur (`APIMessageReplyTo
    /// .toReplyReference`) pose `attachmentId` depuis l'instantané du fil. Les
    /// deux références décrivaient donc la même pièce par deux dérivations
    /// INDÉPENDANTES, et contre deux sources différentes : le tableau tenu en
    /// mémoire à la composition d'un côté, celui du magasin au moment du tap de
    /// l'autre. `citedAttachment(among:)` — le site UNIQUE que `openQuotedMedia`
    /// interroge — retombait sur `quotedRepresentative` de la liste COURANTE :
    /// la pièce décrite ayant disparu, la citation ouvrait sa VOISINE, c'est-à-dire
    /// une photo que cette réponse ne cite pas. Avec l'ancre, les deux ne font
    /// qu'une résolution, et le troisième cas de `citedAttachment` s'applique
    /// enfin ici aussi : pièce nommée INTROUVABLE ⇒ `nil`, jamais un emprunt.
    ///
    /// L'ancre est posée MÊME sur un média protégé : elle n'est pas un secret —
    /// le verrou vit dans `openQuotedMedia`, qui refuse d'ouvrir une pièce à vue
    /// unique après relecture du message RÉEL dans le magasin.
    /// `citing` — la pièce que le lecteur REGARDE (#6165). Elle l'emporte sur
    /// le représentatif : répondre à la troisième photo d'un carrousel de cinq
    /// depuis son plein écran doit citer CELLE-LÀ.
    ///
    /// Nommer une pièce qui n'appartient PAS au message cité retombe sur le
    /// représentatif, sans faire d'histoire : c'est une ancre que
    /// `admitAttachmentReply` REFUSERAIT (« la pièce jointe citée n'appartient
    /// pas au message cité »), donc un envoi rejeté plutôt qu'une citation
    /// pauvre. Le filtre passe par le tableau du message CITÉ, jamais par ce
    /// que l'appelant tient en main — la galerie de la conversation montre les
    /// pièces de TOUS les messages, et sa page courante peut donc désigner un
    /// autre porteur que celui qu'on cite.
    ///
    /// `nil` (le défaut) ⇒ le représentatif, la règle d'avant ce lot, à quoi
    /// aucun appelant existant ne touche.
    func optimisticReplyReference(quoting quoted: Message,
                                  citing named: MessageAttachment? = nil) -> ReplyReference {
        let representative = named
            .flatMap { piece in quoted.attachments.first { $0.id == piece.id } }
            ?? quoted.attachments.quotedRepresentative
        let messageIsProtected = quoted.isViewOnce || quoted.isBlurred || quoted.isEncrypted
        let representativeIsProtected = representative.map { $0.isViewOnce || $0.isBlurred } ?? false
        let mediaMayTravel = !messageIsProtected && !representativeIsProtected
        return ReplyReference(
            messageId: quoted.id,
            authorName: quoted.senderName ?? String(localized: "common.unknown_user", defaultValue: "Utilisateur", bundle: .main),
            previewText: messageIsProtected
                ? Self.protectedPlaceholder(for: quoted, representative: representative)
                : servedPreviewText(for: quoted, representative: representative),
            isMe: quoted.isMe,
            authorColor: quoted.senderColor,
            // Le message cité est déjà en mémoire, son avatar avec. Sans ce
            // report, la citation s'affichait en initiales puis « sautait » à
            // la photo au premier refresh serveur.
            authorAvatarUrl: quoted.senderAvatarURL,
            attachmentType: representative?.type.rawValue,
            attachmentId: representative?.id,
            attachmentThumbnailUrl: mediaMayTravel ? Self.quotedThumbnailUrl(of: representative) : nil,
            // Le message cité est en mémoire : sa protection est CONNUE, pas
            // déclarée par le fil. Sans ce report, la bulle optimiste d'une
            // réponse à un média à vue unique en montrait la vignette le temps
            // que le serveur accuse.
            attachmentIsProtected: messageIsProtected ? true : representative.map { $0.isViewOnce || $0.isBlurred },
            attachmentFacts: representative.map { Self.quotedFacts(of: $0, mediaMayTravel: mediaMayTravel) }
        )
    }

    /// Le texte que la BULLE du message cité rend en ce moment : sa traduction
    /// préférée quand le Prisme en sert une, sinon l'original — et, pour un
    /// message sans texte, la nature de son média représentatif.
    private func servedPreviewText(for quoted: Message, representative: MessageAttachment?) -> String {
        if !quoted.content.isEmpty {
            return preferredTranslation(for: quoted.id)?.translatedContent ?? quoted.content
        }
        if let first = representative {
            return MediaKindLabel.summary(MediaKindLabel.kind(for: first.type))
        }
        return ""
    }

    /// Une photo tout juste envoyée n'a pas encore de vignette serveur : la
    /// citation montre le fichier lui-même plutôt qu'un carré vide.
    private static func quotedThumbnailUrl(of representative: MessageAttachment?) -> String? {
        representative?.thumbnailUrl ?? (representative?.type == .image ? representative?.fileUrl : nil)
    }

    /// Les sept faits, moins le ThumbHash quand le média ne peut pas voyager :
    /// dimensions, durée et taille décrivent le média sans le montrer ; le
    /// ThumbHash EST une image.
    private static func quotedFacts(of representative: MessageAttachment, mediaMayTravel: Bool) -> ReplyReference.QuotedAttachmentFacts {
        let facts = ReplyReference.QuotedAttachmentFacts(representative)
        guard !mediaMayTravel else { return facts }
        return ReplyReference.QuotedAttachmentFacts(
            thumbHash: nil,
            width: facts.width,
            height: facts.height,
            durationMs: facts.durationMs,
            fileSize: facts.fileSize,
            pageCount: facts.pageCount,
            mimeType: facts.mimeType
        )
    }

    /// Même vocabulaire que `APIMessageReplyTo.protectedPlaceholder` et que
    /// `PROTECTION_ICON` + `CONTENT_TYPE_ICON` (`NotificationService.ts`),
    /// même précédence (vue unique, puis flouté, puis chiffré) — une citation
    /// optimiste, son écho serveur et une bannière décrivent le même secret
    /// avec les mêmes mots, sinon le texte change au moment de l'accusé.
    private static func protectedPlaceholder(for quoted: Message, representative: MessageAttachment?) -> String {
        let protectionIcon: String = {
            if quoted.isViewOnce { return "👁️" }
            if quoted.isBlurred { return "🌫️" }
            return "🔒"
        }()
        let contentTypeIcon: String = {
            switch representative?.type {
            case .image: return "🖼️"
            case .video: return "🎬"
            case .audio: return "🎵"
            case .location: return "📍"
            case .file: return "📎"
            case .none: return "💬"
            }
        }()
        return "\(protectionIcon) \(contentTypeIcon)"
    }
}
