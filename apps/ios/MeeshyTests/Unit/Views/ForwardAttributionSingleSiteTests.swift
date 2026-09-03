import XCTest
import MeeshySDK
@testable import Meeshy

/// **Un message transféré se voit AVEC LE MÊME NOM dans toutes les peaux**
/// (#5058, directive porteur 2026-09-03).
///
/// Trois peaux, trois niveaux de vérité avant ce lot :
///
/// | mode | ce qui s'affichait |
/// |---|---|
/// | bulle | « Transféré de Le Salon » — l'attribution complète |
/// | focal / script | « Transféré » — l'attribution `.anonymous` |
/// | rivière | rien du tout |
///
/// La cause n'était pas dans les peaux. `BubbleContent` ne portait qu'un
/// booléen : la bulle avait le `Message` sous la main et appelait
/// `ForwardBadgePolicy` elle-même, la rangée plate ne l'avait pas et retombait
/// sur le repli sûr. Le doc-comment de `FocalRow` le disait — « écart signalé,
/// pas une seconde résolution inventée » — et il avait raison de refuser : la
/// liste blanche de `ForwardBadgePolicy` échoue FERMÉ, et une peau qui la
/// contourne pour « faire pareil » rouvrirait la fuite qu'elle ferme.
///
/// Ce qui manquait était en AMONT. La résolution remonte au constructeur, et
/// ce fichier garde l'invariant qui empêche qu'elle redescende.
@MainActor
final class ForwardAttributionSingleSiteTests: XCTestCase {

    // MARK: - 1 · L'absence EST le fait

    /// `nil` ⇒ pas un transfert. Il n'y a pas de booléen à côté qui pourrait
    /// dire l'inverse — c'est la règle du dépôt sur les paires redondantes,
    /// appliquée à autre chose qu'un `DateTime?`.
    func test_uneAttributionAbsente_signifieQueLeMessageNEstPasTransfere() {
        XCTAssertFalse(contenu(attribution: nil).isForwarded)
    }

    /// **`.anonymous` est un BADGE, pas une absence de badge.** Le message a
    /// bien été transféré ; c'est la règle de confidentialité qui refuse de
    /// nommer sa source. Confondre les deux ferait disparaître le badge des
    /// transferts venus d'un cercle privé — exactement ceux dont l'origine
    /// compte le plus pour le lecteur.
    func test_uneAttributionAnonyme_resteUnTransfert() {
        XCTAssertTrue(contenu(attribution: .anonymous).isForwarded)
    }

    func test_unGroupeNomme_estUnTransfert() {
        XCTAssertTrue(contenu(attribution: .group("Le Salon")).isForwarded)
    }

    // MARK: - 2 · L'invariant : une seule résolution dans tout le dépôt

    /// **La garde qui empêche la divergence de revenir.**
    ///
    /// Elle ne compte pas « la règle est-elle appliquée ? » — trois peaux
    /// pourraient l'appliquer chacune et rester d'accord un temps. Elle compte
    /// **combien de sites la résolvent**, parce que c'est le nombre qui prédit
    /// la divergence : à deux, une règle de confidentialité finit par avoir
    /// deux seuils.
    ///
    /// Le site autorisé est `BubbleContentBuilder` — celui qui tient le
    /// `Message`, donc sa `ForwardReference`. `MessageViewsDetailView` en est
    /// exempté : il ne rend pas une bulle mais la fiche de détail d'un message,
    /// et n'a pas de `BubbleContent` à lire.
    func test_uneSeuleVueResoutLAttribution_leConstructeur() throws {
        let sitesAutorises: Set<String> = [
            "Meeshy/Features/Main/Views/Bubble/BubbleContentBuilder.swift",
            "Meeshy/Features/Main/Views/Bubble/ForwardBadgePolicy.swift",
            "Meeshy/Features/Main/Components/MessageDetail/MessageViewsDetailView.swift"
        ]
        let peaux = [
            "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift",
            "Meeshy/Features/Main/Focal/Row/FocalRow.swift"
        ]
        for peau in peaux {
            let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(peau))
            XCTAssertFalse(
                code.contains("ForwardBadgePolicy."),
                "\(peau) résout l'attribution elle-même. Une règle de confidentialité "
                    + "résolue à deux endroits est une règle qui divergera : elle doit LIRE "
                    + "`content.forwardAttribution`, tranché une fois par le constructeur."
            )
            XCTAssertTrue(
                code.contains("content.forwardAttribution"),
                "\(peau) doit lire l'attribution portée — sinon elle ne rend aucun badge, "
                    + "ou en rend un anonyme, ce que ce lot corrige."
            )
        }
        XCTAssertTrue(sitesAutorises.contains("Meeshy/Features/Main/Views/Bubble/BubbleContentBuilder.swift"),
                      "Prémisse : le constructeur est le site de résolution.")
    }

    /// **Non-vacuité** — le constructeur résout bien, et les DEUX moitiés sont
    /// lues ensemble : `forwardedFromId` dit QUE c'est un transfert, la
    /// politique dit QUI on nomme. Lire la seconde sans la première rendrait
    /// `.anonymous` sur tout message ordinaire, c'est-à-dire un badge
    /// « Transféré » sous chaque bulle du fil.
    func test_leConstructeur_litLesDeuxMoities() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/Bubble/BubbleContentBuilder.swift"))
        XCTAssertTrue(code.contains("ForwardBadgePolicy.attribution(for: message.forwardedFrom)"),
                      "Le constructeur tranche l'attribution.")
        XCTAssertTrue(code.contains("message.forwardedFromId == nil"),
                      "Et il la garde derrière le fait du transfert : sans cette garde, "
                          + "`.anonymous` s'appliquerait à TOUS les messages.")
    }

    // MARK: - Fabrique

    /// Un `BubbleContent` réduit à ce que ce fichier mesure. Les autres champs
    /// sont neutres — un test qui les remplirait mesurerait leur forme, pas la
    /// règle du transfert.
    private func contenu(attribution: ForwardAttribution?) -> BubbleContent {
        BubbleContent(
            messageId: "m1", kind: .standard, text: nil, translation: nil, reply: nil,
            attachments: .none, location: nil, ephemeral: nil, isBlurred: false,
            isViewOnce: false, isPinned: false, forwardAttribution: attribution, editedAt: nil,
            isEditSaving: false, hasEditHistory: false, reactions: [],
            meta: BubbleContent.Meta(timeString: "10:41", deliveryStatus: nil),
            isMe: false, senderName: "Ali", callNotice: nil, joinNotice: nil
        )
    }
}
