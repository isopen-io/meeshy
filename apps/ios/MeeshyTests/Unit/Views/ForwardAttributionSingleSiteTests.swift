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
    /// pourraient l'appliquer chacune et rester d'accord un temps. Elle énumère
    /// **qui la résout**, parce que c'est ce nombre qui prédit la divergence : à
    /// deux endroits, une règle de confidentialité finit par avoir deux seuils.
    ///
    /// ## Une PROJECTION a le droit de résoudre ; une PEAU, non
    ///
    /// La liste s'est allongée d'un site au #5058-rivière, et il faut dire
    /// pourquoi ce n'est pas un relâchement. Il y a deux MODÈLES de message dans
    /// l'app : `BubbleContent` (bulle, focal, script) et `RiverBubbleContent`
    /// (rivière). Chacun a sa projection, et une projection est le seul endroit
    /// qui tienne encore la `ForwardReference` — la vue, elle, ne voit que le
    /// modèle projeté.
    ///
    /// > La règle « un seul site » ne veut pas dire « un seul appelant » : elle
    /// > veut dire **la règle vit à un seul endroit, et personne ne la
    /// > réécrit**. Deux projections qui APPELLENT `ForwardBadgePolicy` la
    /// > partagent ; une vue qui la rappellerait fabriquerait un second chemin
    /// > que rien ne tient d'accord avec le premier.
    ///
    /// Le balayage est RÉCURSIF et sans liste de chemins : c'est ce qui lui
    /// permet d'attraper une résolution rouverte dans un fichier qui n'existe
    /// pas encore.
    func test_seulesLesProjections_resolventLAttribution() throws {
        let projectionsAutorisees: Set<String> = [
            // Le constructeur de `BubbleContent` — bulle, focal, script.
            "BubbleContentBuilder.swift",
            // La projection de la rivière, qui a son propre modèle (#5058).
            "RiverConversationMapping.swift",
            // La règle elle-même.
            "ForwardBadgePolicy.swift",
            // La fiche de détail d'un message : elle ne rend pas une bulle et
            // n'a aucun modèle projeté à lire.
            "MessageViewsDetailView.swift"
        ]
        let resolveurs = Set(fichiersContenant("ForwardBadgePolicy."))
        XCTAssertTrue(
            resolveurs.isSubset(of: projectionsAutorisees),
            "Un site NON autorisé résout l'attribution lui-même : "
                + "\(resolveurs.subtracting(projectionsAutorisees)). Une peau doit LIRE la "
                + "valeur tranchée par sa projection, jamais la recalculer."
        )
    }

    /// **Non-vacuité du balayage** — sans elle, un chemin faux rendrait zéro
    /// fichier et l'assertion ci-dessus serait vraie en ne mesurant rien
    /// (`Set()` est sous-ensemble de tout).
    func test_leBalayage_trouveBienLesResolveurs() {
        let resolveurs = Set(fichiersContenant("ForwardBadgePolicy."))
        XCTAssertTrue(resolveurs.contains("BubbleContentBuilder.swift"),
                      "Le constructeur DOIT apparaître : c'est la prémisse du test au-dessus.")
        XCTAssertTrue(resolveurs.contains("RiverConversationMapping.swift"),
                      "La projection de la rivière aussi — sans elle, la rivière n'affiche "
                          + "aucun badge, ce que #5058 vient de corriger.")
    }

    /// **Les TROIS peaux LISENT l'attribution portée par leur modèle.**
    func test_lesTroisPeaux_lisentLAttributionPortee() throws {
        for (peau, champ) in [
            ("Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift", "content.forwardAttribution"),
            ("Meeshy/Features/Main/Focal/Row/FocalRow.swift", "content.forwardAttribution"),
            ("Meeshy/Features/Main/Riviere/View/RiverBubbleView.swift", "content.forwardAttribution")
        ] {
            let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(peau))
            XCTAssertTrue(
                code.contains(champ),
                "\(peau) doit lire `\(champ)` — sinon elle ne rend aucun badge (rivière avant "
                    + "#5058) ou en rend un anonyme (focal avant ce lot)."
            )
            XCTAssertTrue(
                code.contains("BubbleForwardedIndicator("),
                "\(peau) doit RENDRE le badge : lire la valeur sans la peindre serait le "
                    + "même silence, une couche plus bas."
            )
        }
    }

    /// Balayage récursif de la cible app : les noms de fichiers où le motif
    /// apparaît hors commentaires.
    private func fichiersContenant(_ motif: String) -> [String] {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // …/Unit/Views  (retire le FICHIER)
            .deletingLastPathComponent()   // …/Unit
            .deletingLastPathComponent()   // …/MeeshyTests
            .deletingLastPathComponent()   // …/apps/ios
            .appendingPathComponent("Meeshy")
        guard let marcheur = FileManager.default.enumerator(
            at: racine, includingPropertiesForKeys: nil) else { return [] }
        return marcheur.compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
            .compactMap { url in
                guard let brut = try? String(contentsOf: url, encoding: .utf8) else { return nil }
                return AppSourceGuard.stripComments(brut).contains(motif) ? url.lastPathComponent : nil
            }
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
