import XCTest
@testable import Meeshy

/// #4065 — **la description devient un calque de LECTURE, dépliée en édition au
/// tap.**
///
/// C'est la loi 6 (« le lecteur EST l'aperçu ») portée au TEXTE. Ce que ces
/// témoins gardent n'est donc pas une valeur calculée mais une STRUCTURE de vue
/// — d'où des gardes de source, et d'où le fusible qui les précède.
final class ComposerDescriptionLayerTests: XCTestCase {

    // MARK: - Les libellés

    /// **Deux libellés, et ils ne disent pas la même chose.** L'amorce décrit le
    /// GESTE et appartient au calque ; l'invite du champ décrit le CONTENU et
    /// appartient à l'hôte. Les confondre donnerait soit une amorce muette sur
    /// ce qu'il faut faire, soit une invite qui parle d'un tap déjà fait.
    func test_lesLibellesDuCalque_sontDistinctsEtNonVides() {
        let libelles = [ComposerDescriptionCopy.amorce,
                        ComposerDescriptionCopy.editHint,
                        ComposerDescriptionCopy.done]
        for libelle in libelles {
            XCTAssertFalse(libelle.isEmpty)
        }
        XCTAssertEqual(Set(libelles).count, 3, "Trois rôles, trois phrases.")
    }

    /// L'amorce n'est PAS l'invite du champ du document : la première nomme le
    /// geste, la seconde le contenu attendu.
    func test_lAmorce_nEstPasLInviteDuChamp() {
        XCTAssertNotEqual(ComposerDescriptionCopy.amorce, ComposerDocumentCopy.placeholder)
    }

    // MARK: - Les sources

    private func source(_ chemin: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(chemin)
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func composer(_ fichier: String) throws -> String {
        // **Le meuble est DÉCOUPÉ (#4102) : son adresse est l'UNITÉ.** Lire le
        // seul fichier principal rendrait vertes, en silence, toutes les gardes
        // négatives dont l'interdit a suivi une extension.
        if fichier == "MeeshyComposerHost.swift" {
            return AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        }
        return try source("Meeshy/Features/Main/Composer/\(fichier)")
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    // MARK: - #5137 — la langue se choisit AU-DESSUS de la coche

    /// **L'ORDRE porte le sens du geste.** On déclare dans quelle langue on
    /// écrit, PUIS on valide ce qu'on a écrit. Empilé dans l'autre sens, le même
    /// couple dirait « je valide — ah, au fait, c'était en quelle langue » : la
    /// langue arriverait après la décision qu'elle qualifie.
    ///
    /// Le témoin porte sur la POSITION relative dans la colonne de queue, pas
    /// sur la présence des deux morceaux : présents mais inversés, ils
    /// satisferaient n'importe quel `contains` séparé.
    func test_laLangue_estPeinte_AU_DESSUS_deLaCoche() throws {
        let calque = compact(try composer("ComposerDescriptionLayer.swift"))
        guard let colonne = calque.range(of: "VStack(alignment:.trailing,spacing:6){") else {
            return XCTFail("La colonne de queue du champ est introuvable — la garde ne mesurerait RIEN.")
        }
        let suite = String(calque[colonne.upperBound...])
        guard let langue = suite.range(of: "ifletlanguageAccessory{languageAccessory}"),
              let coche = suite.range(of: "validationCheck") else {
            return XCTFail("La colonne doit porter l'accessoire de langue ET la coche.")
        }
        XCTAssertLessThan(langue.lowerBound, coche.lowerBound,
                          "La langue se peint AVANT la coche dans le `VStack` — donc AU-DESSUS d'elle.")
    }

    /// **`nil` ⇒ rien de peint, jamais une capsule grisée.** Un site qui ne sait
    /// pas déclarer de langue n'en promet aucune (loi 4) : c'est la différence
    /// entre un contrôle absent et un contrôle INERTE, et l'inerte est pire —
    /// il éteint la question chez le lecteur suivant.
    func test_sansAccessoire_rienNestPeint() throws {
        let calque = compact(try composer("ComposerDescriptionLayer.swift"))
        XCTAssertTrue(calque.contains("varlanguageAccessory:AnyView?"),
                      "L'accessoire est OPTIONNEL et sans valeur par défaut construite ici : "
                        + "le calque ne sait rien de `documentLanguage` ni du portail qui l'ouvre.")
        XCTAssertFalse(calque.contains("documentLanguageCapsule"),
                       "Le calque ne CONSTRUIT pas la capsule — il la reçoit. La fabriquer ici en "
                        + "ferait une seconde, avec sa propre mémoire à faire diverger.")
    }

    /// **Le meuble sert la MÊME capsule aux deux surfaces.** Deux sélecteurs
    /// pour une seule `documentLanguage` auraient deux mémoires ; c'est la
    /// dérive que #4621 a déjà payée sur la clé de son titre.
    func test_leMeuble_sertLaMemeCapsule_ALaScene_etAuDocument() throws {
        let meuble = compact(try composer("MeeshyComposerHost.swift"))
        // **La virgule est le DISCRIMINANT.** Sans elle, l'assertion serait un
        // préfixe de `contentLanguageAccessory:AnyView(documentLanguageCapsule)`
        // et passerait au vert alors que le site de la SCÈNE aurait disparu :
        // une garde qui mesure l'autre moitié de ce qu'elle croit mesurer.
        XCTAssertTrue(meuble.contains(",languageAccessory:AnyView(documentLanguageCapsule)"),
                      "L'éditeur de description de la scène doit recevoir la capsule.")
        XCTAssertTrue(meuble.contains("contentLanguageAccessory:AnyView(documentLanguageCapsule)"),
                      "Le champ de contenu du document doit recevoir la MÊME capsule.")
    }

    /// **Le fusible.** Sans lui, les gardes NÉGATIVES qui suivent seraient vertes
    /// par OMISSION le jour où un chemin change.
    func test_lesSources_sontLisiblesEtNonVides() throws {
        XCTAssertTrue(try composer("ComposerDescriptionLayer.swift")
            .contains("struct ComposerDescriptionLayer"))
        XCTAssertTrue(try composer("ComposerSceneSurface.swift")
            .contains("struct ComposerSceneSurface"))
        XCTAssertGreaterThan(try composer("MeeshyComposerHost.swift").count, 20_000)
    }

    /// **LA garde de #4065.** Au repos, la description est RENDUE avec le
    /// renderer du LECTEUR — pas approchée par une seconde mise en forme « qui
    /// ressemble ». Une jumelle aurait divergé au premier ajustement, et un
    /// `@mention` serait resté du texte brut ici alors qu'il est coloré là-bas :
    /// un aperçu qui ment sur le rendu final, ce que la loi 6 interdit.
    func test_leCalque_renduAvecLeRendererDuLecteur() throws {
        let s = compact(try composer("ComposerDescriptionLayer.swift"))
        XCTAssertTrue(s.contains("MessageTextRenderer.render("),
                      "Le repos doit passer par le renderer du lecteur.")
    }

    /// Vide ⇒ une amorce, **jamais un cadre vide**.
    func test_vide_leCalqueRendUneAmorce() throws {
        let s = compact(try composer("ComposerDescriptionLayer.swift"))
        XCTAssertTrue(s.contains("text.isEmpty"))
        XCTAssertTrue(s.contains("ComposerDescriptionCopy.amorce"))
    }

    /// **Le Prisme ne s'exerce PAS à la composition, et le calque n'en annonce
    /// donc AUCUNE langue.** Poser une pastille ici referait le défaut du cycle
    /// 123 — une surface qui AFFIRME une langue qu'elle ne sert pas — en pire :
    /// la langue affirmée serait celle d'une traduction qui n'existe pas encore.
    func test_leCalque_nAnnonceAucuneLangue() throws {
        let s = compact(try composer("ComposerDescriptionLayer.swift"))
        for interdit in ["preferredLanguages", "TranslationToggle",
                         "resolveTranslation", "LanguageFlag"] {
            XCTAssertFalse(s.contains(interdit),
                           "`\(interdit)` annoncerait une langue que la composition ne sert pas.")
        }
    }

    /// **Un bouton, pas un geste posé sur du texte.** VoiceOver annonce alors le
    /// trait « bouton » — donc que la zone FAIT quelque chose —, et l'indice
    /// nomme l'action. Un `onTapGesture` n'aurait annoncé qu'un texte.
    func test_leCalque_estAnnonceEditableAVoiceOver() throws {
        let s = compact(try composer("ComposerDescriptionLayer.swift"))
        XCTAssertTrue(s.contains(compact(".accessibilityHint(Text(ComposerDescriptionCopy.editHint))")),
                      "Le calque doit annoncer ce que le tap fait.")
        XCTAssertTrue(s.contains(compact(".accessibilityLabel(Text(ComposerDescriptionCopy.done))")),
                      "La fermeture est un contrôle NOMMÉ — sortir par perte de focus n'est atteignable par personne.")
        XCTAssertFalse(s.contains(".onTapGesture"),
                       "Un geste sur du texte n'annonce rien à VoiceOver.")
    }

    /// **UN calque, deux hôtes.** Deux rendus « en mode lecture » auraient
    /// divergé au premier ajustement, et l'un des deux se serait mis à mentir
    /// sur le rendu final — le profil P et le profil S verraient alors deux
    /// aperçus différents du même geste.
    func test_lesDeuxSurfaces_montentLeMemeCalque() throws {
        // #4361 — côté meuble, l'hôte du calque est désormais le TYPE NOMMÉ
        // `ComposerSceneDescriptionEditor` : le monter en fermeture d'`.overlay`
        // dans `body` faisait déborder la pile par profondeur de type SwiftUI.
        // Ce que la garde protège est inchangé — UN calque, consommé par ses
        // hôtes, jamais redessiné — seule son adresse a suivi.
        // **RETOURNÉ le 2026-08-30 : il n'y a plus qu'UN hôte.**
        //
        // > « La zone de description en bas ne doit pas être affichée si on ne
        // > touche pas l'icône description, même si une description existe ! »
        //
        // `ComposerSceneSurface` peignait le calque en PERMANENCE, dès qu'un
        // texte existait — la place que la scène centrée réclame. Elle ne le
        // peint plus : la description s'ouvre par sa PORTE, et le meuble monte
        // l'éditeur en zone basse.
        //
        // Ce que la garde protégeait — un seul rendu « en mode lecture », jamais
        // deux à faire diverger — est RENFORCÉ, pas affaibli : il n'y a plus
        // qu'un site au lieu de deux.
        XCTAssertTrue(
            compact(try composer("ComposerSceneDescriptionEditor.swift"))
                .contains("ComposerDescriptionLayer("),
            "L'éditeur nommé doit CONSOMMER le calque, jamais le redessiner."
        )
        XCTAssertFalse(
            compact(try composer("ComposerSceneSurface.swift")).contains("ComposerDescriptionLayer("),
            "La surface de scène ne peint plus la description : elle s'affichait dès qu'un texte "
                + "existait, sans que personne ne l'ait demandée."
        )
        XCTAssertTrue(
            compact(try composer("MeeshyComposerHost+Surfaces.swift"))
                .contains("ComposerSceneDescriptionEditor("),
            "… et le meuble monte l'éditeur nommé, jamais le calque en direct."
        )
    }

    /// Garde NÉGATIVE : la description n'est plus un champ PERMANENT nulle part.
    /// C'est ce que l'issue demande en une phrase — « au repos : la description
    /// est RENDUE (pas un `TextField`) » — et c'est ce qui libère la place que
    /// l'encastrement vient de dégager (#4061).
    func test_aucuneSurface_neGardeUnChampDeDescriptionPermanent() throws {
        for fichier in ["ComposerSceneSurface.swift", "MeeshyComposerHost.swift"] {
            let s = compact(try composer(fichier))
            XCTAssertFalse(s.contains("TextEditor(text:$description"),
                           "\(fichier) garde un champ de description permanent.")
            XCTAssertFalse(s.contains("TextField(String(localized:\"composer.scene.description.placeholder\""),
                           "\(fichier) garde le champ de la barre repliable que le calque remplace.")
        }
    }

    /// Le chevron est parti avec la barre qu'il repliait : la clé qui le nommait
    /// n'a plus de lecteur, et une clé sans lecteur ferait croire à sept
    /// traductions vivantes pour un contrôle qui n'existe plus.
    func test_laCleDuChevron_aQuitteLeCatalogueAvecSonControle() throws {
        let catalogue = try source("Meeshy/Localizable.xcstrings")
        XCTAssertFalse(catalogue.contains("composer.scene.description.a11y.toggle"))
        XCTAssertTrue(catalogue.contains("composer.description.amorce"),
                      "Le fusible : la garde ci-dessus doit lire un vrai catalogue.")
    }
}
