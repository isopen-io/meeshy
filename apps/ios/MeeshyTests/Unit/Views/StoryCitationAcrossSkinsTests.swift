import XCTest
import MeeshySDK
@testable import Meeshy

/// **Une story citée garde sa SCÈNE dans les quatre modes, jamais aplatie**
/// (#5059, directive porteur 2026-09-03).
///
/// > « les réponses de mood, story, media doivent avoir la citation complète, le
/// > thumbnail complet du média ou story correctement (actuellement en mode
/// > bulle on voit le mini de la story, ce doit être pareil en mode script et
/// > focal) »
///
/// ## Ce qui manquait n'était ni la règle ni la carte
///
/// La règle d'orthographe d'une citation est un site unique depuis #4946
/// (`QuotedReplyPresentation`), et la carte de scène existe depuis #4098
/// (`BubbleStoryCitationCard`, vue `3h`). Ce qui manquait était le PRÉDICAT qui
/// décide de détacher : il vivait en `private var` dans `BubbleStandardLayout`,
/// et son propre doc-comment se disait « site UNIQUE de la décision ».
///
/// Il l'était — pour la bulle. Les deux autres peaux ne pouvaient pas l'appeler.
///
/// > **Un « site unique » à portée `private` n'est unique que dans son fichier.**
/// > La question à poser à une règle qu'on déclare partagée n'est pas « combien
/// > de fois est-elle écrite ? » mais **« qui peut l'appeler ? »**. Une règle
/// > que ses consommateurs n'atteignent pas se fait réécrire — ou, comme ici,
/// > se fait ignorer, et le défaut passe pour une décision.
@MainActor
final class StoryCitationAcrossSkinsTests: XCTestCase {

    private func reference(isStory: Bool, moodEmoji: String? = nil) -> ReplyReference {
        ReplyReference(
            messageId: "story-1",
            authorName: "Alice",
            previewText: "Bon début de semaine",
            isStoryReply: isStory,
            moodEmoji: moodEmoji
        )
    }

    /// `visualHostsReply` / `audioHostsReply` ne sont PAS des paramètres : ce
    /// sont des propriétés CALCULÉES depuis `attachments`. Une fabrique qui
    /// prétendrait les poser mentirait sur le type. Les deux refus qu'elles
    /// gouvernent sont donc éprouvés sur la règle PURE, plus bas — là où ils
    /// sont exprimables sans monter une pièce jointe.
    private func contenu(reply: ReplyReference?, isStory: Bool) -> BubbleContent {
        BubbleContent(
            messageId: "m1", kind: .standard, text: nil, translation: nil,
            reply: reply.map { BubbleContent.Reply(reference: $0, isStory: isStory) },
            attachments: .none, location: nil, ephemeral: nil, isBlurred: false,
            isViewOnce: false, isPinned: false, forwardAttribution: nil, editedAt: nil,
            isEditSaving: false, hasEditHistory: false, reactions: [],
            meta: BubbleContent.Meta(timeString: "10:41", deliveryStatus: nil),
            isMe: false, senderName: "Ali", callNotice: nil, joinNotice: nil
        )
    }

    // MARK: - 1 · La règle, portée par le CONTENU

    func test_uneStoryCitee_seDetache() {
        let citation = contenu(reply: reference(isStory: true), isStory: true).detachedStoryCitation
        XCTAssertEqual(citation?.messageId, "story-1",
                       "Une story citée est une SCÈNE : elle quitte la bulle pour se rendre en 9:16.")
    }

    func test_uneCitationDeMessage_neSeDetachePas() {
        XCTAssertNil(contenu(reply: reference(isStory: false), isStory: false).detachedStoryCitation,
                     "Une citation de message garde sa carte plate — elle n'a pas de scène.")
    }

    /// **Une HUMEUR voyage avec `isStoryReply == true`**, parce que c'est ce
    /// drapeau qui route son ENVOI (`storyReplyToId`). Sans ce second refus,
    /// toutes les humeurs seraient devenues des cartes VIDES.
    func test_uneHumeurCitee_neSeDetachePas_malgreSonDrapeauDeStory() {
        let humeur = contenu(reply: reference(isStory: true, moodEmoji: "🔥"), isStory: true)
        XCTAssertNil(humeur.detachedStoryCitation)
    }

    /// La citation est DÉJÀ logée dans le conteneur média ou le lecteur audio :
    /// la détacher la rendrait EN DOUBLE. Éprouvé sur la règle pure — les deux
    /// drapeaux sont calculés depuis `attachments`, pas posables.
    func test_uneCitationDejaLogee_neSeDetachePas() {
        XCTAssertFalse(StoryCitationPlacement.isDetached(
            isStoryReply: true, hasMoodEmoji: false,
            visualHostsReply: true, audioHostsReply: false))
        XCTAssertFalse(StoryCitationPlacement.isDetached(
            isStoryReply: true, hasMoodEmoji: false,
            visualHostsReply: false, audioHostsReply: true))
        XCTAssertTrue(StoryCitationPlacement.isDetached(
            isStoryReply: true, hasMoodEmoji: false,
            visualHostsReply: false, audioHostsReply: false),
            "Non-vacuité : les deux refus ci-dessus doivent venir des drapeaux, "
                + "pas d'une règle qui refuserait tout.")
    }

    func test_sansCitation_riemANeDetacher() {
        XCTAssertNil(contenu(reply: nil, isStory: false).detachedStoryCitation)
    }

    // MARK: - 2 · Les TROIS peaux montent la carte

    /// **Le témoin qui portait le défaut.** Avant #5059, seule la bulle
    /// apparaissait dans cette liste ; les deux autres rendaient l'aperçu plat.
    func test_lesTroisPeaux_montentLaCarteDeScene() throws {
        let peaux = [
            "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift",
            "Meeshy/Features/Main/Focal/Row/FocalRow.swift",
            "Meeshy/Features/Main/Riviere/View/RiverBubbleView.swift"
        ]
        for peau in peaux {
            let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(peau))
            XCTAssertTrue(
                code.contains("BubbleStoryCitationCard("),
                "\(peau) doit monter la carte de scène : sans elle, une story citée s'y rend "
                    + "APLATIE — le mot exact de la doctrine de la vue `3h`."
            )
        }
    }

    /// **La moitié qui empêche la double citation.** Chaque peau doit rendre la
    /// carte OU l'aperçu plat, jamais les deux : le `else if` est la forme qui
    /// l'assure par construction, là où deux `if` gardés par des prédicats
    /// jumeaux finiraient par diverger.
    func test_aucunePeau_neRendLesDeuxFormes() throws {
        for (peau, plate) in [
            ("Meeshy/Features/Main/Focal/Row/FocalRow.swift", "FocalQuotedReplyView("),
            ("Meeshy/Features/Main/Riviere/View/RiverBubbleView.swift", "quotedReply(replyPreview)")
        ] {
            let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(peau))
            XCTAssertTrue(
                code.contains("} else if"),
                "\(peau) : la carte et l'aperçu plat (`\(plate)`) doivent s'exclure par un "
                    + "`else if`, pas par la coïncidence de deux prédicats."
            )
        }
    }

    /// **Aucune peau ne réécrit le prédicat.** C'est l'invariant qui a coûté
    /// #5059 : trois peaux, une règle atteignable par une seule.
    func test_aucunePeau_neReecritLePredicat() throws {
        for peau in [
            "Meeshy/Features/Main/Focal/Row/FocalRow.swift",
            "Meeshy/Features/Main/Riviere/View/RiverBubbleView.swift"
        ] {
            let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(peau))
            XCTAssertFalse(
                code.contains("StoryCitationPlacement.isDetached"),
                "\(peau) doit LIRE la décision, jamais la recalculer."
            )
        }
    }
}
