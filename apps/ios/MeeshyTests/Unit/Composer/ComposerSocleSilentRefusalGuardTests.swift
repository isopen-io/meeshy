import XCTest
@testable import Meeshy

/// **La flèche du socle ne rend jamais la main EN SILENCE** (#5285,
/// 2026-09-05).
///
/// ## Le défaut mesuré
///
/// `publishDocument()` commençait par
/// `guard canPublishDocument, let draft = documentDraft else { return }` — un
/// `return` nu. Reproduit deux fois : photo posée, texte tapé par la porte
/// CONTENU, flèche pressée → **aucun post créé, composer resté ouvert, aucun
/// message**.
///
/// > **Un refus muet est pire qu'une donnée perdue.** Une publication
/// > incomplète laisse quelque chose à réparer ; une publication qui n'a pas
/// > eu lieu et ne le dit pas laisse l'auteur croire qu'elle a eu lieu — ou la
/// > relancer, et composer deux fois ce qu'il vient d'écrire.
///
/// ## Ce que ce témoin garde, et pourquoi une garde de SOURCE
///
/// La règle porte sur une ABSENCE — « aucun chemin de ce corps ne sort sans
/// avoir parlé » — et une absence ne se prouve pas en appelant la fonction :
/// il faudrait monter le meuble, lui donner un brouillon nul, et observer
/// qu'un toast paraît. La source, elle, dit l'invariant directement.
///
/// L'étage du DESSOUS l'appliquait déjà deux fois
/// (`ComposerDocumentDurablePublisher.refuse()`,
/// `DocumentComposerDoor.refuse()`, tous deux peignant un toast) ; il manquait
/// à l'étage qui les APPELLE. C'est la forme du jour : une moitié écrite,
/// correcte, qui rassure sur la moitié absente.
final class ComposerSocleSilentRefusalGuardTests: XCTestCase {

    private func socle() throws -> String {
        MyStoriesSourceCorpus.strippingComments(
            try MyStoriesSourceCorpus.text(
                of: "Meeshy/Features/Main/Composer/MeeshyComposerHost+Socle.swift"))
    }

    private func corps(de nom: String, dans source: String) -> String? {
        guard let debut = source.range(of: nom) else { return nil }
        var profondeur = 0
        var resultat = ""
        for c in source[debut.lowerBound...] {
            resultat.append(c)
            if c == "{" { profondeur += 1 }
            if c == "}" {
                profondeur -= 1
                if profondeur == 0 { return resultat }
            }
        }
        return nil
    }

    /// **Un brouillon NUL se dit.** C'est l'anomalie : la flèche était armée
    /// (`canPublishDocument` vrai) et rien n'est parti.
    func test_unBrouillonNul_neRendPasLaMainEnSilence() throws {
        let source = try socle()
        guard let corps = corps(de: "func publishDocument()", dans: source) else {
            return XCTFail("`publishDocument` introuvable — la garde ne mesurerait rien.")
        }
        let compact = corps.components(separatedBy: .whitespacesAndNewlines).joined()

        XCTAssertFalse(
            compact.contains("guardcanPublishDocument,letdraft=documentDraftelse{return}"),
            """
            Les deux refus ne peuvent pas partager un `return` nu : ils n'ont pas la même \
            nature. `canPublishDocument` faux est un état NORMAL — rien à publier — que la \
            flèche grisée dit déjà. Un brouillon NUL est une ANOMALIE, et l'auteur doit \
            l'apprendre autrement qu'en pressant une seconde fois.
            """)
        XCTAssertTrue(
            compact.contains("FeedbackToastManager.shared.showError"),
            "Le refus doit PARLER — même règle que `ComposerDocumentDurablePublisher.refuse()` "
            + "et `DocumentComposerDoor.refuse()`, un étage plus bas.")
    }

    /// **L'état normal reste MUET, et c'est voulu.** Un toast à chaque pression
    /// sur une flèche grisée transformerait une évidence visuelle en
    /// interruption ; le témoin garde donc la DISTINCTION, pas le bruit.
    func test_lEtatNormal_resteMuet() throws {
        let source = try socle()
        guard let corps = corps(de: "func publishDocument()", dans: source) else {
            return XCTFail("`publishDocument` introuvable.")
        }
        let compact = corps.components(separatedBy: .whitespacesAndNewlines).joined()

        XCTAssertTrue(
            compact.contains("guardcanPublishDocumentelse{return}"),
            "« Rien à publier » se voit sur la flèche : le dire en plus serait du bruit.")
    }
}
