import XCTest
import MeeshySDK
// `ComposerTopBarControl` et `ComposerChromeOwner` vivent dans MeeshyUI, et
// `PostVisibility` aussi. L'inventaire les NOMME — s'appuyer sur la visibilite
// transitive de `@testable import Meeshy` casse au premier renommage.
import MeeshyUI
@testable import Meeshy

/// **Tache 7.8 — l'inventaire de parite AVANT le retrait, et le mensonge de la
/// table nomme.**
///
/// Deux choses, et une seule les tient ensemble : on ne retire une feuille que
/// lorsqu'une autre surface tient ce qu'elle tenait, et on ne peut pas le dire
/// tant que la table de routage designe la mauvaise feuille.
///
/// **Le mensonge.** `ComposerProfile.profile(for: .edit(...))` rendait
/// `routesToLegacy: .storyEdit` QUEL QUE SOIT le format. Or `.storyEdit`
/// designe `storyEditComposerCover` (`StoryTrayView`, quatre montages), qui est
/// l'edition d'une STORY. Editer un POST ou un REEL — ce que font les cinq
/// montages d'`EditPostSheet` — n'avait AUCUNE representation dans la table.
/// Une porte qui nomme la mauvaise feuille est pire qu'une porte muette : elle
/// a l'air d'avoir ete decidee.
///
/// **Ce que ce defaut n'est PAS, et il faut le dire pour ne pas se mentir en
/// sens inverse** : aucun site de production ne construit
/// `ComposerIntent(origin: .edit(...))` — zero occurrence, mesuree. Les deux
/// feuilles d'edition sont montees directement, hors du routeur. Le defaut est
/// donc STRUCTUREL et se juge en fonction pure ; il ne corrige aucun symptome
/// visible aujourd'hui, et le presenter autrement serait une victoire inventee.
///
/// **L'inventaire.** Les SEPT capacites que la feuille tient (paragraphe A.7 du
/// plan du lot 7), chacune avec le site qui la tient chez la feuille et une
/// MESURE du meuble en face. La mesure porte sur des symboles de PRODUCTION,
/// jamais sur un booleen recopie : c'est ce qui la fait rougir le jour ou une
/// capacite arrive — le seul signal qui vaille, parce qu'il dit que le retrait
/// se rapproche sans que personne ait eu a y penser.
///
/// **Remesure obligatoire, et elle a change deux lignes.** Le plan avertissait
/// que sa table serait perimee des le merge du lot 4. Elle l'est : deux
/// capacites y sont passees de « non » a « tenue » — mais COTE CREATION
/// seulement. La porte d'edition ouvre en `.resume`, que
/// `ComposerSurfaceRouting` fait atterrir sur la SCENE, ou le socle ne peint
/// rien du tout. Une capacite tenue par le meuble et inatteignable depuis la
/// porte qui en aurait besoin n'est pas une capacite acquise pour le retrait :
/// c'est le decalage que `test_lesCapacitesDeChromeSocle_leSontCoteCreation_...`
/// grave, pour qu'un lecteur pressé ne compte pas 2 sur 7 comme un progres vers
/// le retrait de la feuille d'EDITION.
@MainActor
final class EditParityInventoryTests: XCTestCase {

    // MARK: - Lecture des sources

    /// `apps/ios` — quatre niveaux au-dessus de `MeeshyTests/Unit/Composer/`.
    private static let iosRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()   // Composer
        .deletingLastPathComponent()   // Unit
        .deletingLastPathComponent()   // MeeshyTests
        .deletingLastPathComponent()   // apps/ios

    private static let feuille = "Meeshy/Features/Main/Components/EditPostSheet.swift"
    private static let surfaceDocument = "Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift"
    private static let gardeQuiLitLaFeuille = "MeeshyTests/Unit/Views/SheetToolbarSemanticsTests.swift"

    private func lire(_ relativePath: String) throws -> String {
        try String(contentsOf: Self.iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    /// Source depouillee de ses commentaires. Une capacite documentee dans un
    /// doc-comment n'est pas une capacite tenue, et une garde qui lirait le
    /// commentaire se satisferait de la promesse.
    private func code(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(try lire(relativePath))
    }

    // MARK: - L'inventaire

    /// Une capacite de la feuille d'edition, et l'etat MESURE du meuble en face.
    private struct Capacite {
        let nom: String
        /// Litteraux de CODE qui prouvent que la FEUILLE la tient encore. Leur
        /// disparition fait rougir : la feuille aurait perdu la capacite avant
        /// que le meuble ne l'ait reprise, ce qui est la regression que cet
        /// inventaire existe pour interdire — dans les deux sens.
        let chezLaFeuille: [String]
        /// Ce que le meuble tient, MESURE sur des symboles de production.
        let mesuree: Bool
        /// Le verdict de l'inventaire. `mesuree != attendue` rougit : soit une
        /// capacite est arrivee (le retrait se rapproche, il faut le dire), soit
        /// une capacite est partie.
        let attendue: Bool
        /// Ce que la mesure interroge, en une phrase — lu dans le message
        /// d'echec, la ou un lecteur en aura besoin.
        let mesureDit: String
    }

    private func inventaire() throws -> [Capacite] {
        let sourceDuDocument = try code(Self.surfaceDocument)

        // 1 — CHAMP CONTENU + VALIDITE.
        // Le meuble a les deux : `ComposerDocumentDraft` porte un texte, le plan
        // d'envoi refuse un brouillon blanc, et le socle peint la fleche sous le
        // document. C'est une capacite REPRISE, la premiere des sept.
        let brouillonBlanc = ComposerDocumentDraft.document(
            format: .post, forcePlainPost: false, text: "   ", visibility: .public, visibilityUserIds: [], repostOfId: nil, localMedia: [], location: nil, originalLanguage: nil
        )
        let brouillonPlein = ComposerDocumentDraft.document(
            format: .post, forcePlainPost: false, text: "un texte", visibility: .public, visibilityUserIds: [], repostOfId: nil, localMedia: [], location: nil, originalLanguage: nil
        )
        let refuseLeBlanc = ComposerDocumentSendPlan.plan(for: brouillonBlanc, isOffline: false)
            == .refuse(.emptyDraft)
        let accepteLaMatiere = ComposerDocumentSendPlan.plan(for: brouillonPlein, isOffline: false)
            == .send(.textOnly)
        let contenuEtValidite = refuseLeBlanc
            && accepteLaMatiere
            && ComposerChromeOwnership.socleZones(for: .document).contains(.publish)

        // 2 — LANGUE SOURCE (relance du Prisme).
        // La seule porte-document de production pose une CONSTANTE. Tant que ce
        // litteral est la, l'auteur ne declare pas la langue de son post : un
        // « Hello everyone » repart etiquete francais, et le Prisme le traduit
        // FR vers EN sur un texte deja anglais.
        let langueEnDur = sourceDuDocument.contains("originalLanguage: DefaultComposerLanguage.resolve()")
        let langueDeclarable = !langueEnDur && sourceDuDocument.contains("originalLanguage: draft.originalLanguage")

        // 3 — EVENTAIL POST/REEL GATE.
        // L'eventail EXISTE et se peint (lot 4). Ce qui manque est la MOITIE
        // REPOST de son gate : la feuille retire le choix sur un repost
        // (`showTypePicker` : `!isRepost && ...`), et `ComposerOrigin.edit` ne
        // porte rien qui permette de le savoir. La table offre donc les deux
        // formats a TOUT reel, repost compris — le serveur miroite le type d'un
        // repost et l'auteur n'a pas a en choisir un.
        let offreDuReel = ComposerProfile.profile(
            for: .edit(postId: "document-quelconque", documentFormat: .reel)
        ).offeredFormats
        let gateDuRepost = offreDuReel != [.reel, .post]

        // 4 — REPLI AUTOMATIQUE DU REEL.
        // La feuille rebascule sur POST des qu'un retrait de media de-qualifie la
        // composition — le gateway rejette (422) un reel non qualifiant. Le gate
        // de la table AJOUTE le reel, il ne le RETIRE jamais : editer un reel
        // dont plus rien ne qualifie ouvrirait encore sur `.reel`.
        let sansQualification = ComposerProfile.profile(
            for: .edit(postId: "document-quelconque", documentFormat: .reel),
            compositionQualifiesAsReel: false
        )
        let repliAutomatique = !sansQualification.offeredFormats.contains(.reel)
            && sansQualification.initialFormat != .reel

        // 5 — RETRAIT DE MEDIAS.
        // La PRECONDITION (l'ingestion) est tombee au lot T2.3 : les trois
        // outils d'attache portent desormais un effet (`.attachesLocalMedia`).
        // Continuer a mesurer `effect != nil` ferait dire au vert que le
        // RETRAIT est tenu — le mode d'echec PROXY : la precondition et la
        // capacite ont cesse d'etre equivalentes le jour ou l'une des deux a
        // bouge sans l'autre. Ce que la feuille tient et que le meuble ne
        // tient toujours pas, c'est un CANAL de retrait sur une composition
        // REPRISE (l'equivalent de `removeMediaIds`) —
        // `ComposerDocumentDraft.document(...)` n'en porte aucun, et la porte
        // d'edition n'atteint de toute facon jamais cette surface
        // (`test_lesCapacitesDeChromeSocle_leSontCoteCreation_...` : `.edit`
        // route vers `.scene`).
        let retraitDeMedias = sourceDuDocument.contains("removeMediaIds")

        // 6 — POSITION TRI-ETAT.
        // La feuille distingue TROIS etats (`PostLocationUpdate` : remplacer,
        // retirer, ne pas toucher) — c'est ce qui empeche une reouverture de
        // vider une position que l'auteur n'a pas regardee. Le meuble n'a meme
        // pas le premier : son outil de lieu ne declenche rien.
        let positionTriEtat = ComposerDocumentTool.place.effect != nil

        // 7 — AUDIENCE + LISTE NOMMEE.
        // Reprise au lot 4.9 : le socle peint un vrai selecteur sous le
        // document, et le brouillon porte la liste nominative que ONLY et EXCEPT
        // exigent. Seconde des deux capacites tenues.
        let brouillonNomme = ComposerDocumentDraft.document(
            format: .post, forcePlainPost: false, text: "x", visibility: .only, visibilityUserIds: ["u1"], repostOfId: nil, localMedia: [], location: nil, originalLanguage: nil
        )
        let audienceEtListe = ComposerChromeOwnership.socleZones(for: .document).contains(.audience)
            && brouillonNomme.visibilityUserIds == ["u1"]

        return [
            Capacite(
                nom: "champ contenu + validite",
                chezLaFeuille: ["private var isValid: Bool", "draftContent"],
                mesuree: contenuEtValidite,
                attendue: true,
                mesureDit: "le plan d'envoi refuse un brouillon blanc, accepte la matiere, et le socle peint "
                    + "la fleche sous le document"
            ),
            Capacite(
                nom: "langue source",
                chezLaFeuille: ["showLanguagePicker = true", "language: languageChanged ? selectedLanguage : nil"],
                mesuree: langueDeclarable,
                attendue: true,
                mesureDit: "T2.2 : la porte-document poste `draft.originalLanguage`, ecrit par la capsule "
                    + "et le selecteur que le meuble monte desormais — le litteral "
                    + "`DefaultComposerLanguage.resolve()` a quitte le corps de `publish`"
            ),
            Capacite(
                nom: "eventail POST/REEL gate",
                chezLaFeuille: [
                    "private var showTypePicker: Bool",
                    "!isRepost && (remainingQualifiesAsReel || normalizedOriginalType == \"REEL\")"
                ],
                mesuree: gateDuRepost,
                attendue: false,
                mesureDit: "la table offre `[.reel, .post]` a TOUT reel edite : `ComposerOrigin.edit` ne "
                    + "porte pas de quoi savoir qu'un document est un repost"
            ),
            Capacite(
                nom: "repli automatique du reel",
                chezLaFeuille: [
                    "if selectedType == \"REEL\" && !remainingQualifiesAsReel {",
                    "selectedType = (normalizedOriginalType == \"REEL\" && !remainingQualifiesAsReel)"
                ],
                mesuree: repliAutomatique,
                attendue: false,
                mesureDit: "le gate de qualification AJOUTE le reel et ne le RETIRE jamais : sans "
                    + "qualification, l'edition ouvre encore sur `.reel`"
            ),
            Capacite(
                nom: "retrait de medias",
                chezLaFeuille: ["private func toggleRemove(_ id: String) {", "removeMediaIds: Array(removedMediaIds)"],
                mesuree: retraitDeMedias,
                attendue: false,
                mesureDit: "la precondition (ingestion) est tombee au T2.3, mais `ComposerDocumentDraft` "
                    + "ne porte toujours aucun canal de retrait — mesuree sur le texte source, pas sur "
                    + "`effect != nil` (qui serait devenu un mode d'echec PROXY depuis T2.3)"
            ),
            Capacite(
                nom: "position tri-etat",
                chezLaFeuille: ["private var locationSection: some View {", "locationEdit = originalLocation == nil ? nil : .remove"],
                mesuree: positionTriEtat,
                attendue: false,
                mesureDit: "l'outil de lieu du document ne declenche rien"
            ),
            Capacite(
                nom: "audience + liste nommee",
                chezLaFeuille: ["private var audienceSection: some View {", "visibilityUserIds: audienceChanged ? draftAudience : nil"],
                mesuree: audienceEtListe,
                attendue: true,
                mesureDit: "le socle peint l'audience sous le document et le brouillon porte la liste "
                    + "nominative"
            )
        ]
    }

    // MARK: - Le mensonge, nomme

    /// **Editer un POST route desormais vers la feuille qui edite un post.**
    ///
    /// Les quatre formats sont ecrits en toutes lettres plutot qu'en compte : un
    /// compte serait reste vert le jour ou un format en remplacerait un autre,
    /// et c'est exactement la substitution qui a produit le defaut d'origine.
    func test_lEdition_routeParFORMAT_etCesseDeFairePasserUnPostPourUneStory() {
        XCTAssertEqual(
            ComposerIntent(origin: .edit(postId: "d", documentFormat: .story)).routesToLegacy,
            .storyEdit,
            "Editer une STORY monte `storyEditComposerCover` — quatre montages de production. C'est le "
            + "seul format dont `.storyEdit` dise la verite."
        )
        XCTAssertEqual(
            ComposerIntent(origin: .edit(postId: "d", documentFormat: .post)).routesToLegacy,
            .editPostSheet,
            "Editer un POST monte `EditPostSheet` — cinq montages de production. Router ce format vers "
            + "`.storyEdit` faisait dire a la table qu'un post s'edite dans l'atelier d'une story."
        )
        XCTAssertEqual(
            ComposerIntent(origin: .edit(postId: "d", documentFormat: .reel)).routesToLegacy,
            .editPostSheet,
            "Editer un REEL monte la meme feuille (`ReelsPlayerView`), et c'est la seule surface du depot "
            + "qui sache basculer POST vers REEL."
        )
        XCTAssertEqual(
            ComposerIntent(origin: .edit(postId: "d", documentFormat: .status)).routesToLegacy,
            .editPostSheet,
            "Aucun site du depot n'offre d'editer un mood — mesure : zero etat d'edition de statut, zero "
            + "montage. La table nomme donc la seule feuille qui edite une ligne de post qui n'est pas une "
            + "story ; c'est un ROUTAGE, jamais la promesse qu'une affordance existe."
        )
    }

    /// **La garde NEGATIVE, reformulee et jamais supprimee.**
    ///
    /// Elle balaie les quatre formats plutot que d'interroger le seul post : le
    /// retour du mensonge ne se ferait pas necessairement sur la ligne qu'on
    /// vient de modifier. `.storyEdit` doit rester atteignable par la story, et
    /// par elle seule.
    ///
    /// Elle exige que les DEUX cas restent declares dans `LegacyComposer` : une
    /// garde negative privee du symbole qu'elle cherche passe au vert en perdant
    /// sa protection, et le retour du routage passerait alors sans un mot.
    func test_aucunFormatSaufLaStory_neRetombeSurLEditionDeStory() {
        let formats: [ComposerFormat] = [.story, .post, .reel, .status]

        for format in formats {
            let route = ComposerIntent(origin: .edit(postId: "d", documentFormat: format)).routesToLegacy
            let estUneStory = format == .story

            XCTAssertEqual(
                route == LegacyComposer.storyEdit, estUneStory,
                "L'edition en \(format) route vers `.storyEdit` : `storyEditComposerCover` monte "
                + "`StoryComposerView` sur une `StoryEditSession`, qu'un post n'a pas."
            )
            XCTAssertEqual(
                route == LegacyComposer.editPostSheet, !estUneStory,
                "L'edition en \(format) route vers `.editPostSheet` : la feuille prend un contenu, une "
                + "langue, des medias, un lieu et une audience — pas un canvas."
            )
        }
    }

    /// Les huit AUTRES portes ne touchent ni l'une ni l'autre feuille
    /// d'edition. Un cas neuf dans `LegacyComposer` est une valeur que n'importe
    /// quelle ligne de la table peut se mettre a rendre ; l'interdire ici est ce
    /// qui empeche une porte de creation d'atterrir sur une surface d'edition.
    func test_aucunePorteDeCreation_neRetombeSurUneFeuilleDEdition() {
        let portesQuiNEditentRien: [ComposerOrigin] = [
            .storyTray,
            .feedComposer,
            .reelTab,
            .moodChip,
            .repost(ofPostId: "post-source", sourceFormat: .story),
            .draft(id: "brouillon-42"),
            .share,
            .conversationMedia(messageId: "msg-7", attachmentId: "piece-3")
        ]

        for origin in portesQuiNEditentRien {
            let route = ComposerIntent(origin: origin).routesToLegacy
            XCTAssertNotEqual(
                route, LegacyComposer.editPostSheet,
                "Une porte qui ne reprend aucune publication publiee route vers la feuille d'EDITION."
            )
            XCTAssertNotEqual(
                route, LegacyComposer.storyEdit,
                "Une porte qui ne reprend aucune publication publiee route vers l'edition de STORY."
            )
        }
    }

    // MARK: - L'inventaire de parite

    /// **La table, parcourue.** Deux affirmations par ligne, et elles rougissent
    /// pour deux regressions opposees : la feuille perd un site (elle cesserait
    /// de tenir ce que le meuble ne tient pas encore), ou le meuble gagne une
    /// capacite (le retrait se rapproche, et personne ne l'avait dit).
    func test_lInventaireDeParite_decritLEtatMESURE_desSeptCapacites() throws {
        let capacites = try inventaire()
        let sourceDeLaFeuille = try code(Self.feuille)

        XCTAssertEqual(
            capacites.count, 7,
            "Le paragraphe A.7 du plan en compte SEPT. Une ligne perdue ici est une capacite qui "
            + "disparaitrait de l'inventaire sans que le retrait cesse d'etre interdit pour autant."
        )

        for capacite in capacites {
            for site in capacite.chezLaFeuille {
                XCTAssertTrue(
                    sourceDeLaFeuille.contains(site),
                    "« \(capacite.nom) » : `EditPostSheet.swift` ne porte plus `\(site)`. La feuille est la "
                    + "REFERENCE de cet inventaire — si elle perd un site, l'inventaire mesure une parite "
                    + "avec un fantome."
                )
            }

            XCTAssertEqual(
                capacite.mesuree, capacite.attendue,
                "« \(capacite.nom) » : l'inventaire attend \(capacite.attendue ? "TENUE" : "NON TENUE") et "
                + "la mesure rend \(capacite.mesuree ? "TENUE" : "NON TENUE"). Mesure : \(capacite.mesureDit). "
                + "Si une capacite vient d'arriver, c'est le signal que le retrait se rapproche : mettre "
                + "`attendue` a jour ICI, dans le meme commit que la capacite."
            )
        }
    }

    /// **Le STOP, opposable.** Trois capacites sur sept depuis T2.2 (« langue
    /// source » a rejoint « champ contenu + validite » et « audience + liste
    /// nommee »). Le retrait d'`EditPostSheet.swift` retirerait les quatre
    /// autres a l'utilisateur.
    ///
    /// Le compte ET les noms : un compte seul serait reste vert le jour ou une
    /// capacite en remplacerait une autre, et c'est precisement ce qui vient
    /// d'arriver du cote creation.
    func test_leRetraitDeLaFeuille_resteINTERDIT_tantQueQuatreCapacitesManquent() throws {
        let capacites = try inventaire()
        let tenues = Set(capacites.filter(\.mesuree).map(\.nom))
        let manquantes = capacites.filter { !$0.mesuree }.map(\.nom)

        XCTAssertEqual(
            tenues, ["champ contenu + validite", "audience + liste nommee", "langue source"],
            "Les capacites tenues par le meuble ont change. Le retrait de la feuille reste interdit tant "
            + "que les sept n'y sont pas ; ce test dit LESQUELLES manquent, pour qu'un lot suivant sache "
            + "quoi lever plutot que de recompter."
        )
        XCTAssertEqual(
            manquantes.count, 4,
            "Quatre capacites manquent : \(manquantes.joined(separator: ", ")). Retirer la feuille les "
            + "retirerait a l'utilisateur, sans qu'aucun test d'ecran ne le dise."
        )
    }

    /// **Les capacites de CHROME tenues le sont cote CREATION — la porte
    /// d'edition ne les atteint pas.**
    ///
    /// C'est la remesure que le plan exigeait, et elle ne dit pas ce qu'on
    /// attendait. Le lot 4 a fait deriver le proprietaire du chrome de la
    /// surface montee : sous `.document`, le socle peint l'audience et la
    /// fleche. Mais la porte d'edition ouvre en `.resume`, et
    /// `ComposerSurfaceRouting` fait atterrir toute reprise sur la SCENE — ou le
    /// socle ne peint RIEN et l'atelier assemble tout.
    ///
    /// Compter « 3 sur 7 » comme un progres vers le retrait de la feuille
    /// d'EDITION serait donc faux. Les trois capacites tenues (T2.2 ajoute
    /// « langue source ») ont muri sur le chemin de CREATION ; le chemin
    /// d'edition n'en a exerce aucune. Ce test-ci n'en remesure que DEUX :
    /// « langue source » ne depend pas du CHROME (`ComposerChromeOwnership`)
    /// mais d'un canal distinct (`documentLanguage` + capsule superposee), donc
    /// hors de ce que `socleZones` peut dire.
    func test_lesCapacitesDeChromeSocle_leSontCoteCreation_etLaPorteDEditionNeLesAtteintPas() {
        let profil = ComposerProfile.profile(for: .edit(postId: "d", documentFormat: .post))

        XCTAssertEqual(
            profil.opensWith, .resume,
            "Editer, c'est reprendre un document deja constitue."
        )

        let surface = ComposerSurfaceRouting.surface(opening: profil.opensWith, format: profil.initialFormat)

        XCTAssertEqual(
            surface, .scene,
            "Une REPRISE monte la surface ou la composition reprise vit reellement, et le seul mecanisme "
            + "de reprise du meuble repeuple l'ATELIER."
        )
        XCTAssertEqual(
            ComposerChromeOwnership.owner(for: surface), .atelier,
            "Sous la scene, le chrome appartient a l'atelier : le meuble n'y peint ni audience ni fleche."
        )
        XCTAssertTrue(
            ComposerChromeOwnership.socleZones(for: surface).isEmpty,
            "Le socle ne peint AUCUNE zone sous la scene — en peindre une seconde serie donnerait deux "
            + "audiences et deux fleches, dont une inerte."
        )

        XCTAssertEqual(
            ComposerChromeOwnership.socleZones(for: .document), [.audience, .publish],
            "La contre-epreuve : sous le DOCUMENT, les deux capacites tenues sont bien peintes. C'est ce "
            + "contraste qui dit qu'elles ont muri cote creation, jamais cote edition."
        )
    }

    // MARK: - Le cout annexe du retrait

    /// **Supprimer la feuille ferait rougir une garde par un THROW de lecture,
    /// pas par une assertion.**
    ///
    /// `SheetToolbarSemanticsTests` lit `EditPostSheet.swift` PAR CHEMIN et
    /// l'erige en reference doctrinale de la feuille-composer. Un echec de
    /// lecture ne dit pas « la doctrine est perdue » : il dit « fichier
    /// introuvable », et c'est le genre de rouge qu'on repare en supprimant le
    /// test. Le nommer ici met le cout dans l'inventaire, la ou un lot de
    /// retrait le lira.
    func test_leCoutAnnexeDuRetrait_estUneGardeQuiLitLaFeuilleParCHEMIN() throws {
        let garde = try code(Self.gardeQuiLitLaFeuille)

        XCTAssertTrue(
            garde.contains(Self.feuille),
            "`SheetToolbarSemanticsTests` ne lit plus la feuille par chemin. Si cette lecture a disparu, le "
            + "cout annexe du retrait a change et l'inventaire doit le redire — pas se taire."
        )
    }
}
