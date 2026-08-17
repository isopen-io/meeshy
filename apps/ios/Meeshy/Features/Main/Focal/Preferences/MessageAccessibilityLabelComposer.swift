import Foundation
import MeeshySDK

/// Réplique fidèle, en fonction PURE de `BubbleContent`, de
/// `BubbleStandardLayout.messageAccessibilityLabel` — contrat
/// `focal-implementation-contract.md` §WS-1. Ordre gelé : sender → reply →
/// text → images → videos → audios → location/files → time → delivery →
/// edited → pinned → ephemeral → reactions. `FocalRow` (WS-4, lot
/// ultérieur) appellera ce composeur plutôt que de recopier l'ordre.
///
/// **Écart assumé vs la source** (F-080, documenté plutôt que corrigé en
/// silence — le contrat demande explicitement une fonction de `BubbleContent`
/// SEUL, pas de `Message`) :
/// - `deliveryStatusAccessibilityLabel` lit `message.deliveryStatus` côté
///   `BubbleStandardLayout` ; ici `content.meta.deliveryStatus` (le seul
///   canal disponible sans `Message`). `Meta` documente `deliveryStatus`
///   comme `nil` uniquement pour un message REÇU — pour `content.isMe`
///   (seul cas où ce composeur lit ce champ), il est donc attendu non-nil ;
///   `nil` inattendu se replie sur le libellé "en cours d'envoi" plutôt que
///   de planter.
/// - la mention éphémère se déclenche sur `content.ephemeral != nil`, pas
///   `message.expiresAt` (indisponible ici). `BubbleStandardLayout` note que
///   son propre `content.ephemeral` peut être nil pour un message déjà
///   expiré — cette bulle-là masque alors le badge visuel MAIS resterait
///   silencieuse ici sur la mention VoiceOver « éphémère ». Écart mineur,
///   sans perte de sécurité (le contenu réel reste lisible), à corriger si
///   WS-4 constate une régression VoiceOver sur ce cas précis.
/// PAS `nonisolated` : `BubbleContent` (`Bubble/BubbleContent.swift`) n'est
/// pas marqué `nonisolated` — dans la cible `Meeshy`
/// (`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, `project.yml`), il est donc
/// implicitement isolé `@MainActor`, comme `BubbleStandardLayout` (la source
/// que ce composeur réplique) l'est déjà en tant que `View`. Rester sur
/// l'isolation par défaut de la cible évite toute friction de frontière —
/// WS-4 (`FocalRow`, une `View`, donc déjà `@MainActor`) l'appellera sans
/// jamais avoir à traverser d'acteur.
enum MessageAccessibilityLabelComposer {

    static func compose(_ content: BubbleContent) -> String {
        var parts: [String] = []

        if !content.isMe, let senderName = content.senderName {
            parts.append(senderName)
        } else if !content.isMe {
            parts.append(String(localized: "a11y.message.unknown_sender", bundle: .main))
        }

        if let replyLabel = replyAccessibilityLabel(content.reply) {
            parts.append(replyLabel)
        }

        if let raw = content.text?.raw, !raw.isEmpty {
            parts.append(raw)
        }

        let visual = visualAttachments(content.attachments)
        if !visual.isEmpty {
            let imageCount = visual.filter { $0.type == .image }.count
            let videoCount = visual.filter { $0.type == .video }.count
            if imageCount > 0 {
                parts.append(String(format: String(localized: "a11y.message.images", bundle: .main), imageCount))
            }
            if videoCount > 0 {
                parts.append(String(format: String(localized: "a11y.message.videos", bundle: .main), videoCount))
            }
        }

        let audio = audioAttachments(content.attachments)
        if !audio.isEmpty {
            parts.append(String(format: String(localized: "a11y.message.audios", bundle: .main), audio.count))
        }

        parts.append(contentsOf: nonMediaAccessibilityParts(
            hasSharedPlace: content.location != nil,
            nonMedia: nonMediaAttachments(content.attachments)
        ))

        parts.append(content.meta.timeString)

        if content.isMe {
            parts.append(deliveryStatusAccessibilityLabel(content.meta.deliveryStatus))
        }
        if content.editedAt != nil {
            parts.append(String(localized: "a11y.message.edited", bundle: .main))
        }
        if content.isPinned {
            parts.append(String(localized: "a11y.message.pinned", bundle: .main))
        }
        if content.ephemeral != nil {
            parts.append(String(localized: "a11y.message.ephemeral", bundle: .main))
        }

        if !content.reactions.isEmpty {
            let reactionText = content.reactions.map { "\($0.emoji) \($0.count)" }.joined(separator: ", ")
            parts.append(String(format: String(localized: "a11y.message.reactions", bundle: .main), reactionText))
        }

        return parts.joined(separator: ", ")
    }

    // MARK: - Attachments par catégorie — miroir de `BubbleStandardLayout`

    private static func visualAttachments(_ attachments: BubbleContent.Attachments) -> [MeeshyMessageAttachment] {
        switch attachments {
        case .visualGrid(let items): return items
        case .mixed(let visual, _, _): return visual
        case .none, .audio, .nonMedia: return []
        }
    }

    private static func audioAttachments(_ attachments: BubbleContent.Attachments) -> [MeeshyMessageAttachment] {
        switch attachments {
        case .audio(let items): return items
        case .mixed(_, let audio, _): return audio
        case .none, .visualGrid, .nonMedia: return []
        }
    }

    private static func nonMediaAttachments(_ attachments: BubbleContent.Attachments) -> [MeeshyMessageAttachment] {
        switch attachments {
        case .nonMedia(let items): return items
        case .mixed(_, _, let items): return items
        case .none, .visualGrid, .audio: return []
        }
    }

    // MARK: - Segments composés — mêmes règles que `BubbleStandardLayout`

    private static func replyAccessibilityLabel(_ reply: BubbleContent.Reply?) -> String? {
        guard let reference = reply?.reference else { return nil }
        let author: String = reference.isMe
            ? String(localized: "a11y.bubble.replyTo.you", bundle: .main)
            : (reference.authorName.isEmpty
                ? String(localized: "a11y.bubble.replyTo.unknown", bundle: .main)
                : reference.authorName)
        let excerpt = reference.previewText.trimmingCharacters(in: .whitespacesAndNewlines)
        if excerpt.isEmpty {
            return String(format: String(localized: "a11y.bubble.replyTo", bundle: .main), author)
        }
        return String(format: String(localized: "a11y.bubble.replyTo.excerpt", bundle: .main), author, excerpt)
    }

    /// `internal` (pas `private`) : `FocalNonMediaBlock` (`Row/`, correctif
    /// « rangée vide » 2026-08-17) appelle cette MÊME loi pour son repli
    /// visuel — jamais une seconde résolution du couple lieu/fichier. Élargir
    /// l'accès plutôt que dupliquer une troisième fois ce que
    /// `BubbleStandardLayout.nonMediaAccessibilityParts` (§1.3, la loi
    /// d'origine) porte déjà : `FocalRow.swift`/`Focal/**` ne peuvent PAS
    /// référencer `BubbleStandardLayout` en code (garde plein-arbre
    /// `FocalNoBubbleSourceGuardTests.test_noBubbleAnywhereInFocal`, « aucune
    /// bulle nulle part ») — ce miroir WS-1, déjà dans `Focal/`, est le SEUL
    /// point d'accès légal à cette loi pour tout consommateur du chantier.
    static func nonMediaAccessibilityParts(
        hasSharedPlace: Bool,
        nonMedia: [MeeshyMessageAttachment]
    ) -> [String] {
        var parts: [String] = []
        if hasSharedPlace {
            parts.append(String(localized: "a11y.message.location", bundle: .main))
        }
        for attachment in nonMedia {
            if attachment.type == .location {
                parts.append(String(localized: "a11y.message.location", bundle: .main))
            } else {
                parts.append(String(format: String(localized: "a11y.message.file", bundle: .main), attachment.originalName))
            }
        }
        return parts
    }

    private static func deliveryStatusAccessibilityLabel(_ status: MeeshyMessage.DeliveryStatus?) -> String {
        switch status {
        case .sending, .invisible, .clock, nil: return "en cours d'envoi"
        case .slow: return "envoi lent"
        case .sent: return "envoye"
        case .delivered: return "distribue"
        case .read: return "lu"
        case .failed: return "echec d'envoi"
        }
    }
}
