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

    /// **L'état normal reste MUET AU TOAST, et c'est voulu.** Un toast à chaque
    /// pression sur une flèche grisée transformerait une évidence visuelle en
    /// interruption ; le témoin garde donc la DISTINCTION, pas le bruit.
    ///
    /// « Muet » n'y qualifie que le TOAST. La raison du grisé, elle, s'affiche
    /// en permanence au-dessus de la flèche — voir la section suivante, dont
    /// c'est tout l'objet.
    func test_lEtatNormal_neLeveAucunToast() throws {
        let source = try socle()
        guard let corps = corps(de: "func publishDocument()", dans: source) else {
            return XCTFail("`publishDocument` introuvable.")
        }
        let compact = corps.components(separatedBy: .whitespacesAndNewlines).joined()

        XCTAssertTrue(
            compact.contains("guardcanPublishDocumentelse{return}"),
            "« Rien à publier » se voit sur la flèche : le dire en plus serait du bruit.")
    }

    // MARK: - …et il ne le dit pas QU'À VOIX BASSE

    /// **LE témoin du lot du 2026-09-05.** Le refus muet avait une seconde
    /// moitié, et elle était plus insidieuse que la première : la raison du
    /// grisé EXISTAIT — calculée, localisée en sept langues, capable de
    /// distinguer les surfaces — et n'était servie qu'à `.accessibilityHint`.
    ///
    /// Un utilisateur de VoiceOver s'entendait donc expliquer pourquoi la
    /// flèche ne part pas ; **un utilisateur voyant voyait une flèche grise et
    /// rien d'autre.**
    ///
    /// > **Une explication réservée à VoiceOver n'est pas une explication,
    /// > c'est une asymétrie.** Le travail était fait — la règle, la phrase,
    /// > les traductions — et il manquait le pixel. Le défaut est invisible
    /// > depuis le site qui l'a introduit : `publishBlockedHint` a l'air
    /// > CONSOMMÉE, elle l'est même correctement, et le modificateur qui la
    /// > consomme ne peint rien.
    ///
    /// La garde interroge donc l'AUTRE côté : la valeur atteint-elle au moins
    /// un consommateur qui rende des pixels ? Elle ne compte pas les appels —
    /// elle exige qu'il en existe un hors accessibilité.
    func test_laRaisonDuGrise_atteintUnPixelEtPasSeulementVoiceOver() throws {
        let source = try socle()

        let sites = source.components(separatedBy: "publishBlockedHint").count - 1
        XCTAssertGreaterThan(sites, 1, "`publishBlockedHint` a disparu — la garde ne mesurerait rien.")

        XCTAssertTrue(
            source.contains("Text(publishBlockedHint)"),
            """
            La raison du grisé doit être RENDUE. Servie au seul \
            `.accessibilityHint`, elle n'explique qu'à VoiceOver : l'utilisateur \
            voyant garde une flèche grise sans motif, et pressera une seconde \
            fois. Le travail — la règle, la phrase, les sept traductions — \
            existait déjà tout entier ; il ne manquait que le pixel.
            """)
    }

    /// **Et elle est rendue là où on la cherche : sur la capsule elle-même.**
    ///
    /// Un `Text` posé ailleurs dans le fichier satisferait le témoin précédent
    /// sans rien résoudre — c'est la forme « une vue construite puis jetée ».
    /// La capsule est le seul ancrage juste : elle porte déjà le grisé et le
    /// `.disabled`, donc l'explication voisine ce qu'elle explique.
    func test_laRaison_estMonteeSurLaCapsuleQuElleExplique() throws {
        let source = try socle()
        guard let corps = corps(de: "func publishCapsule", dans: source) else {
            return XCTFail("`publishCapsule` introuvable — la garde ne mesurerait rien.")
        }
        let compact = corps.components(separatedBy: .whitespacesAndNewlines).joined()

        XCTAssertTrue(
            compact.contains("publishBlockedNotice"),
            "L'explication se monte SUR la capsule grisée, pas ailleurs dans l'écran.")
        XCTAssertTrue(
            compact.contains(".disabled(!canPublishDocument)"),
            "…et la capsule reste `.disabled` : aucun tap ne l'atteint, donc la raison "
            + "doit être là AVANT l'essai. C'est pourquoi elle ne peut pas être un toast.")
    }

    /// **Rien à dire ⇒ rien de peint.** `publishBlockedHint` rend `""` dès que
    /// la flèche est armée, et aussi quand l'indice serait FAUX (audience
    /// nominative incomplète). La vue ne re-décide pas cette règle : elle la
    /// LIT, et se retire.
    ///
    /// Sans ce `if`, une bulle vide flotterait au-dessus d'une flèche armée —
    /// un contrôle qui affirme un blocage inexistant, exactement ce que la
    /// loi 4 interdit.
    func test_sansRienADire_laVueSeRetire() throws {
        let source = try socle()
        guard let corps = corps(de: "var publishBlockedNotice", dans: source) else {
            return XCTFail("`publishBlockedNotice` introuvable.")
        }
        let compact = corps.components(separatedBy: .whitespacesAndNewlines).joined()

        XCTAssertTrue(
            compact.contains("if!publishBlockedHint.isEmpty"),
            "La vue se retire quand l'indice est vide — elle ne redécide pas la règle.")
    }
}
