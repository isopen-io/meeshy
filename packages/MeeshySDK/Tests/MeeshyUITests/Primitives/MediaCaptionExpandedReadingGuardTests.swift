import XCTest
@testable import MeeshyUI

/// **Le corpus déplié est une SURFACE DE LECTURE, pas un panneau posé sur la
/// scène** (directive porteur 2026-09-02).
///
/// > « il faut supprimer le fond sombre progressif et permettre le defilement
/// > sans agir sur les swipe up et down de la story !!! Et voir moins ou voir
/// > plus doit toujours etre visible dans les couleurs de l'application et en
/// > gras et non pas tout en fin du defilement du corpus. Quand le corpus avec
/// > defilement est ouvert, le touche du haut viewport doit le faire defiler
/// > tout en haut ! »
///
/// Trois des quatre clauses vivent dans ce composant ; la quatrième — la cession
/// du geste au défilement — est chez l'hôte, gardée côté app.
final class MediaCaptionExpandedReadingGuardTests: XCTestCase {

    private func source() throws -> String {
        let url = ComposerSourceGuard.packageRoot
            .appendingPathComponent("Sources/MeeshyUI/Primitives/MediaCaptionOverlay.swift")
        return ComposerSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func corps(_ ancre: String, dans code: String) -> String? {
        guard let debut = code.range(of: ancre) else { return nil }
        var profondeur = 0
        var resultat = ""
        for caractere in code[debut.lowerBound...] {
            resultat.append(caractere)
            if caractere == "{" { profondeur += 1 }
            if caractere == "}" {
                profondeur -= 1
                if profondeur == 0 { return resultat }
            }
        }
        return nil
    }

    // MARK: - 1 · Le voile est une décision d'HÔTE

    /// **La directive ne nommait qu'un hôte sur trois.** Retirer le dégradé du
    /// composant l'aurait « appliquée » en dégradant le lecteur de réel et le
    /// plein écran média, qui n'ont pas le mécanisme de la story (sa scène
    /// s'efface d'elle-même) et ne peignent qu'un voile de BAS DE PAGE, presque
    /// transparent là où un corpus déplié monte.
    ///
    /// > Une directive formulée sur UN hôte ne se code pas dans le composant
    /// > PARTAGÉ. Le paramètre est ce qui permet à l'hôte visé de changer d'avis
    /// > sans changer celui des autres.
    func test_leVoile_estUnParamètreDHôte_pasUneSuppression() throws {
        let code = try source()
        XCTAssertTrue(code.contains("dimsBackgroundWhenExpanded: Bool"),
                      "Le voile doit être PARAMÉTRABLE — la story le refuse, les deux autres hôtes le gardent.")
        XCTAssertTrue(code.contains("dimsBackgroundWhenExpanded: Bool = true"),
                      "Défaut `true` : un hôte qui ne dit rien garde ce qu'il avait (loi 1 — préserver et compléter).")
        XCTAssertNil(corps("private var expandedScrim: some View {", dans: code),
                     "`expandedScrim` n'existe plus tel quel : le fond passe par `expandedBackdrop`, qui porte les DEUX cas.")
    }

    /// **Le tap de fermeture vit dans les DEUX branches.** Une branche
    /// transparente qui l'oublierait rendrait la légende irrefermable ailleurs
    /// que sur son invite — et rien ne le montrerait : un fond invisible ne
    /// prouve son existence que par son EFFET.
    func test_leCorpsDéplié_gardeSonTapDeFermeture_peintOuNon() throws {
        let code = try source()
        guard let fond = corps("private var expandedBackdrop: some View {", dans: code) else {
            return XCTFail("`expandedBackdrop` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(fond.contains("LinearGradient"),
                      "La branche PEINTE garde son dégradé — c'est elle que le réel et le plein écran utilisent.")
        XCTAssertTrue(fond.contains("Color.clear"),
                      "La branche transparente ne peint rien — c'est elle que la story utilise.")
        XCTAssertEqual(fond.components(separatedBy: "onTapGesture").count - 1, 2,
                       "Les DEUX branches referment au tap : une seule les rendrait inégales sans qu'on le voie.")
    }

    // MARK: - 2 · L'invite ne se cherche pas au bout du texte

    /// **Le défaut EXACT.** Le bouton vivait DANS la `ScrollView`, après le
    /// corpus : sur un texte long, replier exigeait de défiler jusqu'en bas pour
    /// trouver comment faire.
    ///
    /// > Un contrôle qui ne se voit qu'après avoir parcouru ce qu'il gouverne
    /// > n'est pas un contrôle : c'est une récompense de fin de lecture.
    func test_lInvite_vitHorsDeLaZoneDéfilante() throws {
        let code = try source()
        guard let depliee = corps("private var expandedCaption: some View {", dans: code) else {
            return XCTFail("`expandedCaption` introuvable — la garde ne mesurerait rien.")
        }
        guard let defilante = corps("ScrollView(.vertical", dans: depliee) else {
            return XCTFail("Zone défilante introuvable dans `expandedCaption`.")
        }
        XCTAssertFalse(defilante.contains("seeLessLabel"),
                       "L'invite « voir moins » doit être posée SOUS la zone défilante, jamais dedans.")
        XCTAssertTrue(depliee.contains("seeLessLabel"),
                      "Elle reste montée par l'état déplié — hors du défilement, mais présente.")
    }

    /// Les deux états servent la MÊME invite : une seule fabrique, donc une
    /// seule couleur, une seule graisse, une seule cible de 44 pt. Deux copies
    /// divergent — c'est ce qui a laissé la dépliée en blanc quand la règle a
    /// changé.
    func test_lInvite_estUnSiteUnique_auxCouleursDeLApp_etEnGras() throws {
        let code = try source()
        guard let fabrique = corps("private func affordance(", dans: code) else {
            return XCTFail("La fabrique d'invite est introuvable — les deux états la réécrivent chacun de leur côté.")
        }
        XCTAssertTrue(fabrique.contains("MeeshyColors.indigo"),
                      "L'invite porte les couleurs de l'application, pas un blanc générique.")
        XCTAssertTrue(fabrique.contains("weight: .bold"),
                      "Elle est en GRAS — la directive le nomme explicitement.")
        XCTAssertTrue(fabrique.contains("captionAffordanceHitArea()"),
                      "La cible de 44 pt reste acquise (#4762) : factoriser ne doit pas la perdre.")
        XCTAssertEqual(code.components(separatedBy: "Button(action: onToggle)").count - 1, 1,
                       "UN seul bouton dans le fichier : les deux états passent par la fabrique.")
    }

    // MARK: - 3 · Le retour en tête

    /// L'hôte seul sait ce qu'est « le haut du viewport » — le composant, lui,
    /// ne connaît que sa fenêtre. Le token est donc le contrat : un entier
    /// opaque que l'hôte incrémente, sans qu'aucune décision de produit n'entre
    /// dans l'atome.
    func test_leCorpsDéplié_remonteEnTêteSurDemandeDeLHôte() throws {
        let code = try source()
        XCTAssertTrue(code.contains("scrollToTopToken: Int"),
                      "Le composant expose le token de retour en tête.")
        guard let depliee = corps("private var expandedCaption: some View {", dans: code) else {
            return XCTFail("`expandedCaption` introuvable.")
        }
        XCTAssertTrue(depliee.contains("ScrollViewReader"),
                      "Sans lecteur de défilement, rien ne peut remonter la fenêtre.")
        XCTAssertTrue(depliee.contains("scrollTo("),
                      "Le token doit AGIR — un paramètre lu par personne est un contrôle mort.")
        XCTAssertTrue(depliee.contains("adaptiveOnChange(of: scrollToTopToken)"),
                      "C'est le changement de token qui déclenche la remontée, sur iOS 16 comme sur iOS 17+.")
    }
}
