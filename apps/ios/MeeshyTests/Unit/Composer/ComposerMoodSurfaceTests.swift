import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// Lot 4 — **la surface du mood**, et les règles pures qui la gouvernent.
///
/// Cette suite éprouve QUATRE choses, et aucune ne monte une vue :
/// 1. les règles PURES du mood (plafond, gate, bascule, déclaration) ;
/// 2. la PARITÉ bloc par bloc avec `StatusComposerView`, par garde de source —
///    c'est elle que le lot 4.8 confrontera avant d'autoriser un retrait ;
/// 3. les gardes NÉGATIVES : aucune seconde liste d'emojis, aucun littéral
///    localisé dans la vue, aucun chemin de publication ;
/// 4. le MONTAGE : le meuble sert bien cette surface, et lui donne sa sortie.
final class ComposerMoodSurfaceTests: XCTestCase {

    // MARK: - Les règles pures — le plafond

    /// Exactement `contentLimit` caractères passe INTACT. Un `>=` ici aurait
    /// rogné la dernière frappe légitime, ce qui se voit à l'usage comme une
    /// touche qui « ne prend pas ».
    func test_plafond_neCoupeQueCeQuiDepasse() {
        let pile = String(repeating: "a", count: ComposerMoodPolicy.contentLimit)
        XCTAssertEqual(
            ComposerMoodPolicy.truncate(pile), pile,
            "122 caractères exactement doivent passer intacts (StatusComposerView : `if newValue.count > 122`)."
        )

        let trop = pile + "b"
        XCTAssertEqual(
            ComposerMoodPolicy.truncate(trop).count, ComposerMoodPolicy.contentLimit,
            "Au-delà du plafond, le mood TRONQUE — il ne refuse pas la frappe, et coller 300 caractères en garde 122."
        )
        XCTAssertEqual(ComposerMoodPolicy.truncate(trop), pile)
        XCTAssertEqual(ComposerMoodPolicy.truncate(""), "")
    }

    /// Le plafond compte en GRAPHÈMES, pas en unités de code : c'est ce que
    /// `String.prefix` faisait déjà, et c'est ce que l'auteur voit. Un mood est
    /// le format le plus susceptible d'en porter — c'est un écran à emojis.
    func test_plafond_compteCeQueLAuteurVoit_pasLesUnitesDeCode() {
        let famille = "👨‍👩‍👧‍👦"
        XCTAssertEqual(famille.count, 1, "Prémisse du test : cette grappe compte pour UN caractère.")

        let pile = String(repeating: famille, count: ComposerMoodPolicy.contentLimit)
        XCTAssertEqual(
            ComposerMoodPolicy.truncate(pile), pile,
            "122 grappes doivent passer : compter en unités UTF-16 aurait coupé au 30e emoji."
        )
    }

    /// Les deux constantes sont celles de l'écran historique, écrites en toutes
    /// lettres — et le seuil d'alerte n'est PAS celui que le compteur
    /// calculerait seul. Sans ce test, remplacer `warningThreshold: 101` par un
    /// `nil` laisserait le compteur virer au rouge trois caractères trop tôt
    /// sans qu'aucune assertion ne tombe.
    /// `@MainActor` sur cette méthode SEULE : `CharacterCountLabel` vit dans la
    /// cible app, dont l'isolation par défaut est le main actor, alors que le
    /// bundle de tests est compilé `nonisolated`. Épingler la CLASSE entière
    /// aurait forcé les règles pures — `nonisolated` à dessein — à s'éprouver
    /// depuis un acteur, c'est-à-dire à ne plus prouver qu'elles s'en passent.
    @MainActor
    func test_lesDeuxConstantes_sontCellesDeLEcranHistorique_etLeSeuilNestPasLeDefaut() {
        XCTAssertEqual(ComposerMoodPolicy.contentLimit, 122, "Plafond dur du mood (StatusComposerView).")
        XCTAssertEqual(ComposerMoodPolicy.warningThreshold, 101, "Seuil d'alerte du compteur (StatusComposerView).")

        XCTAssertNotEqual(
            ComposerMoodPolicy.warningThreshold,
            CharacterCountLabel.resolvedThreshold(limit: ComposerMoodPolicy.contentLimit, warningThreshold: nil),
            "Le seuil du mood est EXPLICITE : le défaut à 80 % du compteur donnerait 98, pas 101."
        )
    }

    // MARK: - Les règles pures — le gate de publication

    /// **Un mood SANS emoji ne part pas.** C'était la seule règle de
    /// publication du format, et elle vivait en DEUX exemplaires dans l'écran
    /// historique (le `guard let emoji` de l'action, le `.disabled(…)` du
    /// bouton). Une seule ici.
    func test_gate_unMoodSansEmoji_nePartPas() {
        XCTAssertFalse(
            ComposerMoodPolicy.canPublish(emoji: nil, isPublishing: false),
            "Sans emoji, rien ne part : c'est la seule matière obligatoire d'un mood."
        )
        XCTAssertFalse(
            ComposerMoodPolicy.canPublish(emoji: "", isPublishing: false),
            "Une chaîne vide n'est pas un emoji — la règle est plus stricte que l'originale, à dessein."
        )
        XCTAssertTrue(ComposerMoodPolicy.canPublish(emoji: "🔥", isPublishing: false))
    }

    /// Un envoi déjà en vol ferme le gate — sans quoi un double tap enverrait
    /// deux moods, et le second superséderait le premier en file.
    func test_gate_unEnvoiEnVol_fermeLeGate_memeAvecUnEmoji() {
        XCTAssertFalse(
            ComposerMoodPolicy.canPublish(emoji: "🔥", isPublishing: true),
            "Publier deux fois le même mood est un doublon que l'outbox ne sait pas défaire."
        )
    }

    // MARK: - Les règles pures — la bascule

    /// **Retaper l'emoji choisi le DÉSÉLECTIONNE.** C'est ce qui permet de
    /// repartir d'un mood vierge sans fermer la feuille — et, par le gate
    /// ci-dessus, cela REDÉSACTIVE la publication.
    func test_bascule_retaperLEmojiChoisi_leDeselectionne() {
        XCTAssertNil(
            ComposerMoodPolicy.toggling("🔥", current: "🔥"),
            "Le même emoji tapé deux fois annule le choix (StatusComposerView : `if selectedEmoji == emoji`)."
        )
        XCTAssertEqual(ComposerMoodPolicy.toggling("🔥", current: "☕"), "🔥")
        XCTAssertEqual(ComposerMoodPolicy.toggling("🔥", current: nil), "🔥")
    }

    /// Le lien entre la bascule et le gate, éprouvé ENSEMBLE : chacun seul
    /// laisse passer la régression que l'autre attrape. Désélectionner sans
    /// refermer le gate laisserait un bouton « Publier » actif sur un mood sans
    /// emoji, que le `guard` de l'envoi rejetterait en silence.
    func test_bascule_deselectionner_refermeLeGate() {
        let apresDeuxTaps = ComposerMoodPolicy.toggling("🔥", current: ComposerMoodPolicy.toggling("🔥", current: nil))
        XCTAssertNil(apresDeuxTaps)
        XCTAssertFalse(
            ComposerMoodPolicy.canPublish(emoji: apresDeuxTaps, isPublishing: false),
            "Deux taps sur le même emoji laissent le mood sans matière : la publication doit se refermer."
        )
    }

    // MARK: - Les règles pures — la déclaration (loi 3)

    /// **`nil` et JAMAIS `[]`.** Un tableau vide est entendu par le serveur
    /// comme un EFFACEMENT des mentions ; l'absence de clé le laisse relire les
    /// `@handle` du texte lui-même. La distinction n'est pas cosmétique : elle
    /// décide si les mentions inline d'un mood survivent à sa publication.
    func test_declaration_aucuneReference_rendNil_etJamaisUnTableauVide() {
        XCTAssertNil(
            ComposerMoodPolicy.declared([]),
            "Un tableau vide effacerait les mentions que le serveur relit du texte."
        )
    }

    /// Les INLINE ne se déclarent pas : le serveur les dérive du texte, et les
    /// déclarer ouvrirait un second chemin vers le même fait. La règle DÉLÈGUE
    /// ce filtrage à `ComposerReferences.payload` — le réécrire ici aurait
    /// donné deux filtres à faire diverger.
    func test_declaration_uneMentionInlineSeule_neDeclareRien() {
        let inline = [ComposerReference(username: "alice", display: .inline)]
        XCTAssertNil(
            ComposerMoodPolicy.declared(inline),
            "Une mention écrite dans le texte n'a rien à déclarer : le serveur la relit du contenu."
        )
    }

    /// Et une référence DÉCLARABLE passe — sans quoi la garde précédente
    /// resterait verte sur une règle qui rendrait toujours `nil`.
    func test_declaration_uneReferenceDeclarable_estTransmise() {
        let declarables = [
            ComposerReference(username: "alice", userId: "u-1", display: .pinned),
            ComposerReference(username: "bob", display: .inline)
        ]

        let charge = ComposerMoodPolicy.declared(declarables)
        XCTAssertEqual(charge?.count, 1, "Seule la non-INLINE se déclare.")
        XCTAssertEqual(charge?.first?.userId, "u-1")
        XCTAssertNil(charge?.first?.username, "Une référence choisie par un sélecteur voyage par son id.")
    }

    // MARK: - Gardes de SOURCE — le fusible

    private func surfaceSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerMoodSurface.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func hostSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    /// Le corps d'un BLOC, et non le fichier : celui-ci porte aussi
    /// `ComposerMoodPolicy` et `ComposerMoodCopy`, dont la raison d'être est
    /// justement de NOMMER ce que la vue s'interdit. Une garde ancrée sur le
    /// fichier condamnerait ces voisins en croyant protéger la vue. `nil` quand
    /// l'ancre a disparu — l'appelant fait alors rougir, jamais passer.
    private func blockBody(startingAt anchor: String, in code: String) -> String? {
        guard let start = code.range(of: anchor) else { return nil }
        var depth = 0
        var body = ""
        for character in code[start.lowerBound...] {
            body.append(character)
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { return body }
            }
        }
        return nil
    }

    /// Une ancre disparue lève une ERREUR, jamais un `XCTSkip` : un test sauté
    /// est vert au tableau, et une garde négative qui se saute est une garde
    /// morte sans le dire.
    private struct AncreIntrouvable: Error, LocalizedError {
        let quoi: String
        var errorDescription: String? {
            "Ancre « \(quoi) » introuvable — la garde ne mesurerait RIEN"
        }
    }

    private func surfaceBlock() throws -> String {
        guard let bloc = blockBody(startingAt: "struct ComposerMoodSurface", in: try surfaceSource()) else {
            throw AncreIntrouvable(quoi: "struct ComposerMoodSurface")
        }
        return bloc
    }

    /// Les ARGUMENTS d'un appel, par appariement de PARENTHÈSES.
    ///
    /// `blockBody` ne sait pas les lire : un appel de vue n'ouvre aucune
    /// accolade, si bien qu'un appariement d'accolades partant de
    /// `CharacterCountLabel(` filerait jusqu'à la fin du fichier et rendrait
    /// `nil`. La garde aurait alors rougi pour la mauvaise raison — le pire
    /// des rouges, celui qu'on « corrige » en retirant l'assertion.
    private func callArguments(startingAt anchor: String, in code: String) -> String? {
        guard let start = code.range(of: anchor) else { return nil }
        var depth = 0
        var body = ""
        for character in code[start.lowerBound...] {
            body.append(character)
            if character == "(" { depth += 1 }
            if character == ")" {
                depth -= 1
                if depth == 0 { return body }
            }
        }
        return nil
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    /// Le garde-fou des gardes NÉGATIVES ci-dessous : sans lui, un chemin
    /// devenu faux les ferait toutes passer sur une chaîne vide. Il mesure le
    /// BLOC autant que le fichier — une ancre renommée rendrait les gardes de
    /// bloc vertes sur une chaîne vide exactement de la même façon.
    func test_lesGardesLisentUneSourceNonVide() throws {
        let code = try surfaceSource()
        XCTAssertGreaterThan(code.count, 800, "La source de la surface est introuvable ou vide.")
        XCTAssertTrue(code.contains("struct ComposerMoodSurface"), "Le fichier lu n'est pas celui de la surface.")
        XCTAssertTrue(code.contains("enum ComposerMoodPolicy"), "Le fichier lu ne porte pas les règles du mood.")

        let bloc = try surfaceBlock()
        XCTAssertGreaterThan(bloc.count, 800, "Le bloc lu est vide : l'appariement d'accolades a échoué.")
        XCTAssertTrue(bloc.contains("var body"), "Le bloc lu n'est pas celui de la vue.")
        XCTAssertFalse(
            bloc.contains("enum ComposerMoodPolicy"),
            "Le bloc déborde sur les types voisins — les gardes ne seraient plus ancrées sur la vue."
        )
    }

    // MARK: - La PARITÉ, bloc par bloc (le DoD du lot 4.8)

    /// **Bloc 1 — le bandeau de republication.** Monté seulement quand la porte
    /// a nommé une source, et son pictogramme reste DÉCORATIF : le texte dit
    /// déjà la republication, et laisser le symbole lisible ferait annoncer son
    /// nom SF par VoiceOver.
    func test_parite_bandeauDeRepublication() throws {
        let bloc = try surfaceBlock()
        XCTAssertTrue(bloc.contains("viaUsername"), "Le bandeau tient à la source nommée par la porte.")
        XCTAssertTrue(
            bloc.contains("ComposerMoodCopy.repostVia"),
            "Le libellé « Status de @X » passe par le catalogue, jamais par un littéral."
        )
        XCTAssertTrue(
            bloc.contains("arrow.2.squarepath"),
            "Le pictogramme de republication est celui de l'écran historique."
        )
        XCTAssertTrue(
            bloc.contains(".accessibilityHidden(true)"),
            "Le glyphe est décoratif : le texte adjacent porte déjà le sens."
        )
    }

    /// **Bloc 2 — la grille d'emojis.** Cinq colonnes, cellules 56×56, et
    /// SURTOUT : la liste vient de `StatusViewModel.moodOptions`.
    func test_parite_grilleDEmojis() throws {
        let bloc = try surfaceBlock()
        XCTAssertTrue(
            bloc.contains("ForEach(StatusViewModel.moodOptions"),
            "La grille itère la liste PARTAGÉE — une seconde divergerait au premier emoji ajouté."
        )
        XCTAssertTrue(bloc.contains("LazyVGrid"), "La grille est une `LazyVGrid`, comme l'écran historique.")
        XCTAssertTrue(bloc.contains("count: 5"), "Cinq colonnes.")
        XCTAssertTrue(bloc.contains("56"), "Cellules de 56 pt de côté.")
        XCTAssertTrue(
            bloc.contains("ComposerMoodPolicy.toggling"),
            "La sélection passe par la règle de bascule, éprouvée plus haut — pas par un `if` recopié dans la vue."
        )
    }

    /// **La garde NÉGATIVE de la liste d'emojis.** Une seconde liste ne se
    /// détecte pas à son nom : elle se détecte à ses emojis. Aucun des dix ne
    /// doit apparaître en littéral dans la source de la surface.
    /// `@MainActor` : `StatusViewModel` est isolé au main actor, et c'est LUI
    /// qui porte la liste — la lire d'ailleurs serait précisément ce qu'on
    /// s'interdit.
    @MainActor
    func test_parite_aucuneSecondeListeDEmojis() throws {
        let code = try surfaceSource()
        XCTAssertFalse(StatusViewModel.moodOptions.isEmpty, "Prémisse : la liste partagée n'est pas vide.")

        for emoji in StatusViewModel.moodOptions {
            XCTAssertFalse(
                code.contains(emoji),
                "« \(emoji) » est écrit en littéral dans la surface : c'est une seconde liste, et elle divergera."
            )
        }
    }

    /// **Bloc 3 — l'audience et sa MÉMOIRE.**
    ///
    /// Elle assertait le LITTÉRAL `"lastStatusVisibility"` dans la vue. Le lot
    /// 4.9 lui retire ce littéral : la clé est devenue une constante partagée
    /// (`ComposerAudienceMemory.statusKey`), parce que le socle du document a
    /// désormais SA mémoire et que l'`init` du meuble relit celle du format
    /// d'ouverture. Deux orthographes d'une clé, c'est deux mémoires — le
    /// meuble sèmerait depuis l'une pendant que la vue écrirait dans l'autre.
    ///
    /// La garde n'y perd rien, elle y gagne : elle vérifie maintenant la VALEUR
    /// de la constante (ce qu'un `.contains` ne pouvait pas faire) et que la vue
    /// la lit, plutôt qu'un littéral qui aurait pu être n'importe où.
    func test_parite_audienceEtSaMemoire() throws {
        let bloc = try surfaceBlock()
        XCTAssertEqual(
            ComposerAudienceMemory.statusKey, "lastStatusVisibility",
            "L'audience se souvient sous la MÊME clé que l'écran historique — loi 10, une mémoire par format."
        )
        XCTAssertTrue(
            bloc.contains("ComposerAudienceMemory.statusKey"),
            "La vue lit la clé PARTAGÉE : un littéral recopié ici divergerait de ce que le meuble sème."
        )
        XCTAssertTrue(
            bloc.contains("allowedAudiences"),
            "Les niveaux peints sont ceux que le MEUBLE offre. La surface en décidait elle-même — elle "
                + "peignait les six du SDK, y compris sous une REPUBLICATION, où deux d'entre eux sont des "
                + "contrôles sans effet et quatre un 403 que rien à l'écran n'annonce."
        )
        XCTAssertFalse(
            bloc.contains("PostVisibility.composerSelectableCases"),
            "La vue décide encore de son offre : le plafond d'une republication vaudrait pour le socle et "
                + "pas pour le ruban, sur le seul écran d'où l'on republie."
        )
        XCTAssertEqual(
            occurrences(of: "ComposerAudienceMemory.remembered(", in: bloc), 0,
            "La surface RELIT la mémoire : depuis que l'éventail descend (lot 4.7), `surface` est un `switch` "
                + "sous `@ViewBuilder` — changer de format DÉTRUIT cette vue et la recrée —, si bien qu'une "
                + "relecture à l'apparition écrase l'audience que l'auteur vient de choisir sur l'autre "
                + "surface. Un ÉLARGISSEMENT silencieux (Privé choisi sous « Post » → PUBLIC au retour sous "
                + "« Mood »), sur le lot dont tout le sujet est l'audience. La relecture appartient à "
                + "`MeeshyComposerHost.init`, qui l'applique UNE fois, au format d'ouverture."
        )
        XCTAssertEqual(
            occurrences(of: ".onAppear", in: bloc), 0,
            "La surface a repris un `.onAppear` : c'est la forme même que l'`init` du meuble proscrit dans "
                + "son commentaire — « le moment de son application dépendrait de la surface montée »."
        )
        XCTAssertTrue(
            bloc.contains("lastVisibility = candidate.rawValue"),
            "Le geste de CHOISIR doit toujours ÉCRIRE la mémoire : sans lui, la loi 10 n'aurait plus aucun "
                + "écrivain pour le format status, et retirer la relecture aurait retiré la mémoire entière."
        )
        XCTAssertTrue(
            bloc.contains("AudienceUserPickerView("),
            "ONLY/EXCEPT ouvrent le sélecteur nominatif — sans lui, le gateway rejette la publication."
        )
        XCTAssertTrue(
            bloc.contains("requiresUserSelection"),
            "C'est le mode qui décide d'ouvrir le sélecteur, pas un `if` sur deux cas écrits à la main."
        )
        XCTAssertTrue(
            bloc.contains("visibilityUserIds"),
            "La liste nominative voyage AVEC l'audience : séparées, un ONLY repartirait vide."
        )
    }

    /// **Bloc 4 — la saisie plafonnée et son compteur.** Les deux nombres
    /// viennent de la règle : posés en littéral dans la vue, ils
    /// divergeraient de `ComposerMoodPolicy` au premier ajustement.
    func test_parite_saisiePlafonneeEtCompteur() throws {
        let bloc = try surfaceBlock()
        XCTAssertTrue(
            bloc.contains("ComposerMoodPolicy.truncate"),
            "Le plafond est TRONCATURE, et il passe par la règle éprouvée."
        )
        XCTAssertTrue(
            bloc.components(separatedBy: .whitespacesAndNewlines).joined()
                .contains("adaptiveOnChange(of:text,initial:true)"),
            "La troncature doit se déclencher AU (RE)MONTAGE, pas seulement à la frappe. Depuis que "
                + "l'éventail descend (lot 4.7), le texte est l'état du MEUBLE et peut avoir grandi sous la "
                + "surface document — dont le `TextEditor` n'a aucun plafond — pendant que cette vue était "
                + "hors de l'arbre. Sans `initial:`, le compteur revenait en alerte à côté d'une flèche "
                + "ARMÉE, `ComposerMoodPolicy.canPublish` ne regardant que l'emoji."
        )
        XCTAssertTrue(bloc.contains("CharacterCountLabel("), "Le compteur est le composant partagé, pas un `Text` refait.")
        XCTAssertTrue(
            bloc.contains("ComposerMoodPolicy.contentLimit"),
            "Le plafond du compteur vient de la règle."
        )
        XCTAssertTrue(
            bloc.contains("ComposerMoodPolicy.warningThreshold"),
            "Le seuil d'alerte aussi — sinon le compteur virerait au rouge à 98 au lieu de 101."
        )
        XCTAssertEqual(
            occurrences(of: "122", in: bloc), 0,
            "Le plafond ne se réécrit pas en littéral dans la vue : deux valeurs jumelles se corrigent à moitié."
        )
        XCTAssertEqual(occurrences(of: "101", in: bloc), 0, "Le seuil non plus.")
    }

    /// **Le compteur reçoit son premier plan, il ne le devine pas.**
    ///
    /// `CharacterCountLabel` peint `theme.textMuted` par défaut, c'est-à-dire
    /// un jeton du thème de l'APP. Le plateau du composer est sombre quel que
    /// soit ce thème : en thème clair, ce jeton y mesure **1,68:1** — illisible.
    /// Sans cette garde, retirer `mutedColor:` d'un revers de refactor
    /// rendrait le compteur invisible sans qu'aucune assertion ne tombe.
    func test_parite_leCompteur_recoitSonPremierPlan_pourLePlateau() throws {
        let bloc = try surfaceBlock()
        guard let compteur = callArguments(startingAt: "CharacterCountLabel(", in: bloc) else {
            throw AncreIntrouvable(quoi: "CharacterCountLabel(")
        }
        XCTAssertTrue(
            compteur.contains("mutedColor:"),
            "Le compteur doit recevoir sa couleur du site de montage : le jeton de thème n'a pas été mesuré sur ce fond."
        )
    }

    /// **Bloc 5 — les références.** Les deux entrées de l'écran historique, et
    /// le badge reste hors jeu : un mood n'a pas plus de canevas qu'un post.
    func test_parite_lesDeuxEntreesDeReference() throws {
        let bloc = try surfaceBlock()
        XCTAssertTrue(bloc.contains("ReferenceMentionSuggestions("), "La frappe `@` ouvre la liste.")
        XCTAssertTrue(bloc.contains("ReferenceComposerBar("), "Le chip « Mentionner » ouvre la même feuille.")
        XCTAssertFalse(
            bloc.contains("hasCanvas: true"),
            "Un mood n'a pas de couche de positionnement : le badge n'y est pas proposé."
        )
    }

    /// **La SORTIE** — peinte, pas seulement portée. Un rappel stocké que rien
    /// ne déclenche laisserait un écran dont on ne sort pas, et le meuble n'a
    /// pas d'atelier sous cette surface pour peindre la croix à sa place.
    func test_parite_laSurface_peintSaSortie_etLeCorpsLaMonte() throws {
        let bloc = try surfaceBlock()
        XCTAssertGreaterThanOrEqual(
            occurrences(of: "onClose", in: bloc), 2,
            "`onClose` doit être déclaré ET déclenché : un rappel que rien n'appelle ne fait sortir personne."
        )
        XCTAssertGreaterThanOrEqual(
            occurrences(of: "header", in: bloc), 2,
            "L'issue doit être une propriété NOMMÉE et montée dans le corps de la vue."
        )

        guard let corps = blockBody(startingAt: "var body", in: bloc) else {
            throw AncreIntrouvable(quoi: "var body")
        }
        XCTAssertTrue(
            corps.contains("header"),
            "L'issue est déclarée mais absente du corps : la surface resterait un écran dont on ne sort pas."
        )
    }

    /// **RTL** — `ar` est au catalogue. Les placements de barre de navigation
    /// figés (`.navigationBarLeading` / `.navigationBarTrailing`) ne mirroitent
    /// pas ; cette surface n'a de toute façon pas de barre, et cette garde
    /// interdit d'en réintroduire une par ce chemin-là.
    func test_laSurface_nUtiliseAucunPlacementFige_quiCasseraitLeRTL() throws {
        let bloc = try surfaceBlock()
        for interdit in [".navigationBarLeading", ".navigationBarTrailing"] {
            XCTAssertFalse(
                bloc.contains(interdit),
                "« \(interdit) » ne mirroite pas en arabe : les placements sémantiques existent pour ça."
            )
        }
    }

    // MARK: - Gardes NÉGATIVES

    /// **Aucun littéral localisé dans la vue.** Même idiome que
    /// `ComposerDocumentCopy`, et pour la raison qu'il écrit lui-même : un
    /// libellé posé en ligne échappe au cliquet de complétude et n'est jamais
    /// traduit. Le compte est fait sur le BLOC — `ComposerMoodCopy` en porte
    /// six, c'est son rôle.
    func test_laVue_neposeAucunLibelleEnLigne() throws {
        let bloc = try surfaceBlock()
        XCTAssertEqual(
            occurrences(of: "String(localized:", in: bloc), 0,
            "La vue résout un libellé elle-même : il échappera au cliquet et ne sera jamais traduit."
        )
    }

    /// **Zéro clé neuve au catalogue.** Les quatre libellés du mood sont ceux
    /// de `StatusComposerView`, plus `common.close` que la surface document lit
    /// déjà. Le cliquet français est à ZÉRO tolérance et le catalogue est
    /// épinglé à un plafond : une clé de plus pour une phrase déjà traduite
    /// sept fois l'en rapproche pour rien.
    ///
    /// **`status.composer.title` n'y est plus depuis le 2026-08-28** — le
    /// titre affiche directement `status.composer.mood.question`, et la clé
    /// « Status » devenue sans lecteur a été retirée du catalogue dans le MÊME
    /// commit (voir `ComposerMoodCopy`).
    func test_lesLibelles_reutilisentLesClesDejaTraduites() throws {
        let code = try surfaceSource()
        let attendues: Set<String> = [
            "status.composer.title.repost",
            "status.composer.mood.question", "status.composer.placeholder",
            "status.composer.repost.via", "common.close"
        ]

        for cle in attendues {
            XCTAssertTrue(
                code.contains("\"\(cle)\""),
                "Le mood doit parler le vocabulaire déjà traduit : « \(cle) » manque."
            )
        }

        // Et AUCUNE autre. Un compte, ou une recherche de préfixe, aurait
        // laissé passer une clé neuve glissée à côté des six — c'est
        // l'ENSEMBLE qui est asserté, dans les deux sens.
        let motif = try NSRegularExpression(
            pattern: #"String\(\s*localized:\s*"([A-Za-z0-9_][A-Za-z0-9_.\-]*)""#
        )
        var trouvees: Set<String> = []
        for resultat in motif.matches(in: code, range: NSRange(code.startIndex..., in: code)) {
            guard let plage = Range(resultat.range(at: 1), in: code) else { continue }
            trouvees.insert(String(code[plage]))
        }

        XCTAssertEqual(
            trouvees, attendues,
            "Le mood n'ajoute AUCUNE clé au catalogue : le cliquet français est à zéro tolérance et le "
                + "catalogue est épinglé à un plafond. Toute clé hors de cet ensemble est neuve ou perdue."
        )
    }

    /// **La consolidation du 2026-08-28** : le titre EST la question du mood,
    /// et la flèche PUBLIER — reçue déjà composée, jamais construite ici —
    /// vit à côté de la croix, dans le MÊME en-tête. Sans cette garde, un
    /// retour en arrière referait deux lignes pour une seule question et
    /// laisserait la feuille sans flèche accessible depuis son premier écran.
    func test_leTitre_estDirectementLaQuestion_etLaFlecheRejointLaCroixDansLEnTete() throws {
        let bloc = try surfaceBlock()
        guard let entete = blockBody(startingAt: "private var header", in: bloc) else {
            throw AncreIntrouvable(quoi: "private var header")
        }
        XCTAssertTrue(
            entete.contains("ComposerMoodCopy.moodQuestion"),
            "Le titre affiche directement la question — sans elle, la consolidation qui libère la hauteur "
                + "sous la saisie n'a pas eu lieu."
        )
        XCTAssertTrue(
            entete.contains("ComposerMoodCopy.repostTitle"),
            "Une republication garde son propre titre, distinct de la question du mood."
        )
        XCTAssertTrue(
            entete.contains("headerPublishButton"),
            "La flèche PUBLIER doit être montée dans l'en-tête — c'est elle que le socle ne peint plus "
                + "sous le mood (`ComposerChromeOwnership.socleZones(for: .mood)` est vide)."
        )
        XCTAssertTrue(
            entete.contains(".adaptiveGlass(in: Circle())"),
            "La croix devient un vrai bouton de verre — LiquidGlass sur iOS 26+, repli translucide avant, "
                + "par le wrapper partagé plutôt qu'un `if #available` réécrit ici."
        )
    }

    /// **Garde NÉGATIVE — la question ne se répète plus au-dessus de la
    /// grille.** Elle vit désormais dans le TITRE (garde ci-dessus) ; la
    /// répéter ici reprendrait exactement la hauteur que la consolidation
    /// visait à rendre.
    func test_laGrilleDEmojis_neRepeteplusLaQuestionDuTitre() throws {
        let bloc = try surfaceBlock()
        guard let grille = blockBody(startingAt: "private var emojiGrid", in: bloc) else {
            throw AncreIntrouvable(quoi: "private var emojiGrid")
        }
        XCTAssertFalse(
            grille.contains("ComposerMoodCopy.moodQuestion"),
            "La grille ne doit plus peindre la question : elle est montée UNE fois, dans le titre de l'en-tête."
        )
    }

    /// La surface reçoit son bouton PUBLIER tout fait — même règle que
    /// `onClose`, `viaUsername` ou `allowedAudiences` : la matière décidée par
    /// le site de montage arrive en PARAMÈTRE, jamais reconstruite ici. Sans
    /// ce paramètre, `header` n'aurait rien à monter à droite de la feuille.
    func test_laSurface_recoitSaFlecheDejaComposee_etNeLaFabriquePas() throws {
        let bloc = try surfaceBlock()
        XCTAssertTrue(
            bloc.contains("let headerPublishButton: AnyView"),
            "Le bouton Publier de l'en-tête est un PARAMÈTRE reçu du site de montage."
        )
    }

    /// Garde NÉGATIVE — la surface PRÉSENTE, elle ne publie pas. Une surface
    /// qui publierait elle-même ouvrirait le second chemin d'envoi que la
    /// doctrine, C2 et le lot 7 interdisent tous les trois.
    ///
    /// **Ancrée sur le BLOC** : le fichier porte aussi
    /// `ComposerMoodPolicy.declared`, dont la raison d'être est de NOMMER ce
    /// que la publication déclarera. Une garde de fichier aurait interdit de
    /// l'écrire.
    func test_laSurface_nOuvreAucunCheminDePublication() throws {
        let bloc = try surfaceBlock()
        for interdit in ["StatusService", "PostService", "APIClient", "OutboxFlusher",
                         "TusUploadManager", "setStatus(", "ComposerMoodPolicy.declared"] {
            XCTAssertFalse(
                bloc.contains(interdit),
                "La surface touche « \(interdit) » : c'est un second chemin de publication."
            )
        }
    }

    /// Garde NÉGATIVE — la surface ne possède ni modèle, ni reprise de
    /// brouillon. La reprise hors-ligne touche `StatusViewModel` et l'outbox,
    /// deux choses qu'une présentation ne connaît pas : elle reste au site de
    /// montage (lot 4.6). Sa condition de levée est nommée — le jour où la
    /// surface deviendrait propriétaire de son état, ce test se RETOURNE ; il
    /// ne se supprime pas.
    func test_laSurface_nePossedeNiModeleNiRepriseDeBrouillon() throws {
        let bloc = try surfaceBlock()
        for interdit in ["@ObservedObject", "@StateObject", "StatusViewModel(",
                         "recoverUnsentStatus", "supersedeRecoveredStatus"] {
            XCTAssertFalse(
                bloc.contains(interdit),
                "La surface porte « \(interdit) » : la reprise et le modèle appartiennent au site qui la monte."
            )
        }
    }

    /// La règle de déclaration DÉLÈGUE le filtrage au SDK au lieu de le
    /// réécrire. Deux filtres pour un même fait divergeraient au premier mode
    /// de référence ajouté — et l'un des deux se corrigerait sans l'autre.
    func test_laRegleDeDeclaration_delegueLeFiltrage_auLieuDeLeReecrire() throws {
        let code = try surfaceSource()
        guard let regles = blockBody(startingAt: "enum ComposerMoodPolicy", in: code) else {
            throw AncreIntrouvable(quoi: "enum ComposerMoodPolicy")
        }
        XCTAssertTrue(
            regles.contains("ComposerReferences.payload("),
            "La déclaration passe par le filtre du SDK — le réécrire ici en ferait un second à faire diverger."
        )
        XCTAssertFalse(
            regles.contains(".inline"),
            "La règle ne connaît pas les modes de référence : c'est `payload` qui écarte les INLINE."
        )
    }

    // MARK: - Le MONTAGE — le meuble sert bien cette surface

    /// Une surface qu'aucun meuble ne monte est du code mort testé vert — le
    /// motif que ce dépôt a déjà gravé. Le meuble la monte, et lui donne SA
    /// sortie plutôt qu'une seconde fabriquée sur place.
    func test_leMeuble_monteLaSurfaceDuMood_etLuiDonneSaSortie() throws {
        let code = try hostSource()
        XCTAssertTrue(
            code.contains("ComposerMoodSurface("),
            "Le meuble doit monter la surface du mood — sinon la branche `.mood` du routage n'aurait nulle part où aller."
        )

        guard let bloc = blockBody(startingAt: "private var moodSurface", in: code) else {
            throw AncreIntrouvable(quoi: "private var moodSurface")
        }
        XCTAssertTrue(bloc.contains("ComposerMoodSurface("), "Le bloc lu n'est pas celui de la surface mood.")
        XCTAssertTrue(
            bloc.contains("onClose"),
            "La surface doit recevoir une fermeture — sans elle, c'est un écran dont on ne sort pas."
        )
        XCTAssertTrue(
            bloc.contains("onDismiss"),
            "Et cette fermeture est celle du MEUBLE, pas une seconde sortie fabriquée sur place."
        )
        XCTAssertTrue(
            bloc.contains("headerPublishButton: AnyView(moodHeaderPublishButton)"),
            "La flèche de l'en-tête doit être fournie par le meuble — sans elle, la surface n'aurait aucun "
                + "moyen de partir depuis son en-tête, et le socle ne la peint plus sous le mood."
        )
    }

    /// Le meuble choisit sa surface par la règle PARTAGÉE, et le mood n'y fait
    /// pas exception : une condition écrite dans le `body` serait invisible aux
    /// tests, et c'est ainsi qu'une règle produit se met à exister deux fois.
    ///
    /// **Ancre déplacée au lot 4.5.** Le meuble lisait la règle DANS `surface` ;
    /// le socle et le gate de publication en avaient besoin à leur tour, et trois
    /// lectures de la même expression auraient été trois occasions de diverger.
    /// La lecture unique vit désormais dans `mountedSurface`, et `surface` la
    /// consomme. La garde suit le fait : elle exige que la règle soit lue là où
    /// elle l'est, et que le corps se contente d'aiguiller.
    func test_leMeuble_choisitLeMood_parLaRegleEprouvable_etNonParUnIfDansLeCorps() throws {
        let code = try hostSource()
        guard let lecture = blockBody(startingAt: "private var mountedSurface", in: code) else {
            throw AncreIntrouvable(quoi: "private var mountedSurface")
        }
        XCTAssertTrue(
            lecture.contains("ComposerSurfaceRouting.surface("),
            "Le choix de surface passe par la règle — elle est éprouvée là, une seule fois."
        )

        // **Ancre RENDUE EXACTE au #4120**, et c'est le piège que la garde du
        // socle documente déjà : `"private var surface"` est un PRÉFIXE. Le
        // meuble déclare désormais `surfaceWithIntakePortals` AVANT
        // l'aiguillage — la garde lisait donc le corps des portails, où il n'y a
        // ni `case .mood` ni `mountedSurface`, et rougissait sur un bloc qui
        // n'était pas le sien. Le type de retour referme l'ancre.
        guard let corps = blockBody(startingAt: "private var surface: some View", in: code) else {
            throw AncreIntrouvable(quoi: "private var surface: some View")
        }
        XCTAssertTrue(corps.contains("mountedSurface"), "Le corps consomme la lecture unique, il n'en refait pas une seconde.")
        XCTAssertTrue(corps.contains("case .mood"), "Et la troisième issue est servie.")
        XCTAssertFalse(
            corps.contains("profile.initialFormat"),
            "Le corps ne relit pas le format de la porte : il gouverne par `selectedFormat`, qui respire avec l'offre."
        )
    }

    // MARK: - Lot 4.6/4.7 — la GRAINE et son adoption

    private func vierge() -> ComposerMoodComposition {
        ComposerMoodComposition(emoji: nil, text: "", visibility: .public, visibilityUserIds: [])
    }

    /// La graine d'une REPUBLICATION : elle apporte un emoji et une phrase, et
    /// aucune audience — l'écran historique n'en semait pas non plus.
    func test_graine_uneCompositionVierge_recoitToutCeQueLaGraineApporte() {
        let adoptee = ComposerMoodSeeding.adopt(
            ComposerMoodSeed(emoji: "🔥", text: "ça brûle", viaUsername: "alice", audioUrl: "https://x/a.m4a"),
            into: vierge()
        )

        XCTAssertEqual(adoptee.emoji, "🔥")
        XCTAssertEqual(adoptee.text, "ça brûle")
        XCTAssertEqual(
            adoptee.visibility, .public,
            "Une graine sans audience ne touche pas l'audience : le sélecteur repart sur la mémoire du FORMAT (loi 10)."
        )
    }

    /// **L'invariant de l'adoption, et il vaut par CHAMP.**
    ///
    /// La reprise hors-ligne interroge la file durable : sa graine arrive une ou
    /// plusieurs boucles APRÈS la première image, quand l'auteur a déjà pu poser
    /// un emoji et taper un mot. `StatusComposerView` tenait cette règle en
    /// quatre `if` dispersés dans son `.onAppear`, où aucun test ne pouvait la
    /// lire.
    ///
    /// **Le nom de ce test dit ce que ses trois assertions mesurent, et rien de
    /// plus.** Il s'appelait `test_graine_neRemplaceJamaisCeQueLAuteurAPose`,
    /// alors que sa troisième assertion exige justement que l'AUDIENCE soit
    /// remplacée : un nom de test est la première loi que lit la session
    /// suivante, et celui-là énonçait le contraire de sa propre mesure.
    func test_graine_neRemplaceQueLAudience_jamaisLEmojiNiLeTexte() {
        let composee = ComposerMoodComposition(
            emoji: "💪", text: "déjà tapé", visibility: .friends, visibilityUserIds: []
        )
        let adoptee = ComposerMoodSeeding.adopt(
            ComposerMoodSeed(emoji: "😴", text: "repris de la file", visibility: .private),
            into: composee
        )

        XCTAssertEqual(adoptee.emoji, "💪", "L'emoji posé par l'auteur tient — la graine ne remplit que le vide.")
        XCTAssertEqual(adoptee.text, "déjà tapé", "La phrase tapée tient, pour la même raison.")
        XCTAssertEqual(
            adoptee.visibility, .private,
            "L'audience, elle, est bien reprise ET elle ÉCRASE celle de l'auteur — sans quoi un mood "
                + "ONLY/EXCEPT repris de la file repartirait avec une liste vide que le gateway rejette. "
                + "La contrepartie est consignée sur `ComposerMoodSeeding` : une audience choisie pendant "
                + "que la file répond est perdue."
        )
    }

    func test_graine_absente_laisseLaCompositionIntacte() {
        let composee = ComposerMoodComposition(
            emoji: "☕", text: "un mot", visibility: .community, visibilityUserIds: ["u1"]
        )
        XCTAssertEqual(
            ComposerMoodSeeding.adopt(nil, into: composee), composee,
            "Une création fraîche n'a rien à adopter — et l'adoption ne doit rien inventer."
        )
    }

    /// Le plafond s'applique AUSSI à ce qui est semé. L'écran historique
    /// l'obtenait par effet de bord (son `adaptiveOnChange` se déclenchait sur
    /// l'écriture programmatique), et compter là-dessus aurait laissé partir une
    /// ligne de file de 300 caractères telle quelle.
    func test_graine_unTexteTropLong_estPlafonneCommeUneFrappe() {
        let tropLong = String(repeating: "a", count: 300)
        let adoptee = ComposerMoodSeeding.adopt(ComposerMoodSeed(text: tropLong), into: vierge())

        XCTAssertEqual(adoptee.text.count, ComposerMoodPolicy.contentLimit)
    }

    /// Une audience que le sélecteur ne sait pas peindre laisserait un chip sans
    /// marque et une audience que l'auteur ne pourrait plus changer.
    func test_graine_uneAudienceHorsOffre_estIgnoree() {
        let horsOffre = PostVisibility.allCases.first { !PostVisibility.composerSelectableCases.contains($0) }
        guard let horsOffre else {
            // Le sélecteur offre les six cas : il n'y a rien hors offre à
            // écarter, et la règle est alors sans objet plutôt que fausse.
            return XCTAssertEqual(
                Set(PostVisibility.allCases), Set(PostVisibility.composerSelectableCases),
                "Aucun cas hors offre trouvé, et pourtant les deux ensembles diffèrent — la garde ne mesure RIEN."
            )
        }
        let adoptee = ComposerMoodSeeding.adopt(
            ComposerMoodSeed(visibility: horsOffre), into: vierge()
        )
        XCTAssertEqual(adoptee.visibility, .public, "Une audience hors du sélecteur n'est pas adoptée.")
    }

    /// **La ligne la plus facile à perdre dans un portage**, et l'écran
    /// historique la nommait déjà : sans elle, un mood `ONLY`/`EXCEPT` repris de
    /// la file repartirait avec une liste vide, que le gateway rejette.
    func test_graine_laListeNominative_voyageAvecSonAudience() {
        let adoptee = ComposerMoodSeeding.adopt(
            ComposerMoodSeed(visibility: .only, visibilityUserIds: ["u1", "u2"]),
            into: vierge()
        )

        XCTAssertEqual(adoptee.visibility, .only)
        XCTAssertEqual(adoptee.visibilityUserIds, ["u1", "u2"])
    }

    func test_graine_uneListeAbsente_neVidePasCelleDeLAuteur() {
        let composee = ComposerMoodComposition(
            emoji: nil, text: "", visibility: .only, visibilityUserIds: ["deja-choisi"]
        )
        let adoptee = ComposerMoodSeeding.adopt(ComposerMoodSeed(emoji: "🎉"), into: composee)

        XCTAssertEqual(
            adoptee.visibilityUserIds, ["deja-choisi"],
            "Une graine muette sur la liste ne l'efface pas : `nil` dit « je ne sais pas », jamais « personne »."
        )
    }

    // MARK: - Lot 4.7 — ce que l'auteur a AJOUTÉ à une republication

    /// **Le cas NOMINAL de l'ancrage : republier une humeur sans y toucher.**
    ///
    /// Les deux sites de republication sèment `text: entry.content` — la phrase
    /// de l'humeur —, `adopt` la pose dans `documentText`, et les deux surfaces
    /// du meuble PARTAGENT ce texte (loi 9). Presser la flèche sous « Post »
    /// sans avoir rien tapé transmettait donc ce texte comme COMMENTAIRE, ce qui
    /// déclare une citation (`isQuote`) que personne n'a écrite : le post
    /// affichait deux fois la même phrase — une en commentaire, une dans la
    /// carte citée — et sa langue était re-détectée au lieu d'être héritée de la
    /// déclaration de la source (`inheritStatusBody`, `PostService.repostPost`).
    ///
    /// C'est bien le cas NOMINAL et non un cas limite : `StatusEntry.content`
    /// est optionnel, mais les humeurs en portent une dans la grande majorité.
    func test_lAncrage_dUnTexteQueLAuteurNaPasTOUCHE_neDeclareAucuneCitation() {
        XCTAssertNil(
            ComposerAnchorComment.authored(draftText: "Coffee time", seededText: "Coffee time"),
            "Le texte SEMÉ n'est pas un commentaire d'auteur : le transmettre déclarerait une citation que "
                + "personne n'a écrite, et le post afficherait deux fois la même phrase."
        )
    }

    /// … et un texte ÉDITÉ en est un, sans quoi la garde ci-dessus resterait
    /// verte sur une règle qui ne citerait plus jamais.
    func test_lAncrage_dUnTexteEDITE_estBienUnCommentaire() {
        XCTAssertEqual(
            ComposerAnchorComment.authored(draftText: "Coffee time !!", seededText: "Coffee time"),
            "Coffee time !!"
        )
        XCTAssertEqual(
            ComposerAnchorComment.authored(draftText: "je garde", seededText: nil),
            "je garde",
            "Sans graine, tout ce qui est tapé est de l'auteur."
        )
    }

    /// **La comparaison porte sur ce qui a été ADOPTÉ, pas sur ce qui a été
    /// semé** — et la nuance mord exactement là où le défaut faisait le plus de
    /// bruit.
    ///
    /// `ComposerMoodSeeding.adopt` fait passer la graine par
    /// `ComposerMoodPolicy.truncate` : sous une source de plus de 122
    /// caractères, `documentText` porte les 122 premiers. Comparer au texte BRUT
    /// rendrait « différent » et rétablirait la citation fantôme.
    func test_lAncrage_dUneSourceTropLONGUE_compareCeQuiAEteADOPTE() {
        let source = String(repeating: "a", count: 300)
        let adopte = ComposerMoodSeeding.adopt(
            ComposerMoodSeed(text: source),
            into: ComposerMoodComposition(emoji: nil, text: "", visibility: .public, visibilityUserIds: [])
        ).text

        XCTAssertEqual(adopte.count, ComposerMoodPolicy.contentLimit, "Prémisse : la graine est plafonnée à l'adoption.")
        XCTAssertNil(
            ComposerAnchorComment.authored(draftText: adopte, seededText: source),
            "Comparer au texte BRUT de la graine ferait passer toute source de plus de 122 caractères pour "
                + "une édition de l'auteur."
        )
    }

    /// Le blanc n'est pas un commentaire — ni du côté du brouillon, ni du côté
    /// de la graine. Un retour à la ligne ajouté à la phrase de la source ne
    /// fait pas d'elle une citation.
    func test_lAncrage_leBLANC_nEstJamaisUnCommentaire() {
        XCTAssertNil(ComposerAnchorComment.authored(draftText: nil, seededText: "Coffee time"))
        XCTAssertNil(ComposerAnchorComment.authored(draftText: "", seededText: nil))
        XCTAssertNil(ComposerAnchorComment.authored(draftText: "   \n ", seededText: nil))
        XCTAssertNil(
            ComposerAnchorComment.authored(draftText: " Coffee time\n", seededText: "Coffee time "),
            "Les espaces de bord ne comptent d'aucun côté."
        )
    }

    // MARK: - Lot 4.6 — LA PORTE, et ce qui lui appartient

    private func doorBlock() throws -> String {
        guard let bloc = blockBody(startingAt: "struct MoodComposerDoor", in: try surfaceSource()) else {
            throw AncreIntrouvable(quoi: "struct MoodComposerDoor")
        }
        return bloc
    }

    /// Le fusible des gardes de porte — même rôle que
    /// `test_lesGardesLisentUneSourceNonVide` pour la surface : une ancre
    /// renommée les rendrait toutes vertes sur une chaîne vide.
    func test_lesGardesDeLaPorte_lisentUnBlocNonVide() throws {
        let bloc = try doorBlock()
        XCTAssertGreaterThan(bloc.count, 800, "Le bloc de la porte est vide : l'appariement d'accolades a échoué.")
        XCTAssertTrue(bloc.contains("var body"), "Le bloc lu n'est pas celui de la porte.")
        XCTAssertFalse(
            bloc.contains("struct ComposerMoodSurface"),
            "Le bloc déborde sur la surface — les gardes ne seraient plus ancrées sur la porte."
        )
    }

    /// La porte monte le MEUBLE, et lui donne les deux choses sans lesquelles il
    /// ne saurait ni quoi ouvrir ni où envoyer.
    func test_laPorte_monteLeMeuble_etLuiDonneSaGraineEtSonCanal() throws {
        let bloc = try doorBlock()

        XCTAssertTrue(bloc.contains("MeeshyComposerHost("), "La porte monte le meuble — sans lui elle ne présente rien.")
        XCTAssertTrue(bloc.contains("moodSeed:"), "Elle lui dit ce qu'elle sème.")
        XCTAssertTrue(bloc.contains("onPublishDocument:"), "Et où le brouillon doit partir.")
        XCTAssertFalse(
            bloc.contains("ComposerMoodSurface("),
            "La porte ne monte PAS la surface elle-même : c'est le meuble qui choisit ce qu'il montre, par une "
                + "règle éprouvée. Court-circuiter le routage rendrait la surface indépendante du format."
        )
    }

    /// **La reprise hors-ligne appartient à la PORTE**, et son ordre est
    /// load-bearing : supplanter AVANT d'envoyer. L'inverse laisserait la ligne
    /// bloquée partir à la reconnexion, en double.
    func test_laPorte_porteLaRepriseHorsLigne_etSupplanteAvantDEnvoyer() throws {
        let bloc = try doorBlock()

        guard let reprise = bloc.range(of: "recoverUnsentStatus"),
              let supplante = bloc.range(of: "supersedeRecoveredStatus"),
              let envoi = bloc.range(of: "setStatus(") else {
            return XCTFail(
                "La porte ne porte plus la reprise hors-ligne ou son envoi : le mood bloqué serait perdu, ou "
                    + "renvoyé en double à la reconnexion."
            )
        }
        _ = reprise
        XCTAssertTrue(
            supplante.lowerBound < envoi.lowerBound,
            "`supersedeRecoveredStatus` doit précéder `setStatus` : sinon la ligne bloquée part AUSSI à la "
                + "reconnexion, et l'auteur voit son mood deux fois."
        )
    }

    /// La reprise ne se déclenche QUE sur une composition fraîche. Préremplir une
    /// republication avec un mood bloqué en file écraserait la source qu'on
    /// venait de choisir — c'est la condition exacte que l'écran historique
    /// posait (`initialEmoji == nil, initialText == nil, viaUsername == nil`).
    func test_laPorte_neRecupereQueSurUneCompositionFraiche() throws {
        let bloc = try doorBlock()
        XCTAssertTrue(
            bloc.contains("guard seed == nil"),
            "La reprise doit être gardée par l'absence de graine — sans quoi une republication se ferait "
                + "écraser par le dernier mood bloqué hors ligne."
        )
    }

    /// **Garde RETOURNÉE le 2026-08-25 (lot 4.7, fin).** Elle exigeait un REFUS
    /// (`guard draft.format == .status`) ; elle exige désormais un AIGUILLAGE.
    ///
    /// Le refus était juste tant qu'aucun écran ne peignait l'éventail sous le
    /// mood — supposer plutôt que refuser aurait publié un ANCRAGE sous le type
    /// STATUS, c'est-à-dire un post qui expire en une heure. L'éventail descend
    /// désormais, et la porte a son second chemin.
    ///
    /// **Les DEUX formats qu'elle ne sait pas publier restent refusés**, et
    /// c'est la moitié de cette garde qui ne doit jamais se perdre : router
    /// `.story` ou `.reel` vers `anchor` ancrerait une story en post depuis une
    /// porte qui n'en reçoit jamais.
    func test_laPorteDuMood_aiguilleSurLeFORMAT_etRefuseLesDeuxQuElleNeSaitPasPublier() throws {
        let bloc = try doorBlock()
        let compacte = bloc.components(separatedBy: .whitespacesAndNewlines).joined()

        XCTAssertTrue(
            compacte.contains("switchdraft.format"),
            "L'envoi doit AIGUILLER sur le format du brouillon : un chemin unique publierait l'un des deux "
                + "sous le type de l'autre."
        )
        XCTAssertTrue(
            compacte.contains("case.status:returnawaitpublishMood(draft)"),
            "Le MIROIR doit rester sur `setStatus` — c'est ce qui garde une republication de mood éphémère."
        )
        XCTAssertTrue(
            compacte.contains("case.post:returnawaitanchor(draft)"),
            "L'ANCRAGE doit avoir son chemin propre — sans lui, le chip « Post » arme une flèche qui ne "
                + "publie rien."
        )
        XCTAssertTrue(
            compacte.contains("case.story,.reel:returnfalse"),
            "Les deux formats que cette porte ne sait pas publier doivent être REFUSÉS, jamais avalés par un "
                + "`default` : ancrer une story en post depuis la porte du mood serait un contenu d'un AUTRE "
                + "type que celui que l'auteur a composé."
        )
    }

    /// **L'ancrage passe par le MODÈLE, jamais par un service.**
    ///
    /// C'est le raccourci évident — `PostService.repost` est `public` et tourne
    /// déjà sur huit sites — et c'est celui qui contournerait le cache, la
    /// réconciliation et la file. `test_laPorte_neTouchePasLesServicesDirectement`
    /// l'interdit déjà en NÉGATIF ; celle-ci nomme le positif, sans quoi la
    /// négative resterait verte sur une porte qui ne publierait plus rien.
    func test_laPorteDuMood_ancre_enPassantParLeMODELE_jamaisParUnService() throws {
        let bloc = try doorBlock()
        XCTAssertTrue(
            bloc.contains("viewModel.anchorStatusAsPost("),
            "L'ancrage doit passer par `StatusViewModel` : le modèle possède déjà `PostServiceProviding`, son "
                + "double de test et le seul étage où cette règle est éprouvable."
        )
    }

    /// **Ce que l'ancrage transmet est ce que l'auteur a AJOUTÉ, jamais le
    /// brouillon nu.**
    ///
    /// `content: draft.text` est l'écriture évidente — et c'est celle qui fut
    /// livrée. Elle renvoyait au serveur la phrase que la PORTE venait de semer,
    /// déclarant ainsi une citation que personne n'avait écrite sur le cas
    /// nominal. La règle est
    /// `ComposerAnchorComment.authored(draftText:seededText:)`, éprouvée plus
    /// haut sans monter la moindre vue ; cette garde tient le fait qu'elle est
    /// APPELÉE — une règle juste que le site d'envoi contourne ne corrige
    /// personne.
    ///
    /// Le second terme est NÉGATIF, et il n'est pas un doublon du premier : on
    /// pourrait appeler la règle pour un champ et passer `draft.text` pour
    /// l'autre. C'est le libellé `content:` qui compte.
    func test_lAncrage_neTransmetPasLeBrouillonNU_maisCeQueLAuteurAAjoute() throws {
        guard let ancrage = blockBody(startingAt: "private func anchor(_ draft: ComposerDocumentDraft)", in: try surfaceSource()) else {
            throw AncreIntrouvable(quoi: "private func anchor(_ draft: ComposerDocumentDraft)")
        }
        XCTAssertTrue(
            ancrage.contains("anchorStatusAsPost("),
            "Le bloc lu n'est pas celui de l'ancrage — la garde ne mesurerait RIEN."
        )
        XCTAssertTrue(
            ancrage.contains("ComposerAnchorComment.authored("),
            "L'ancrage doit demander à la règle ce que l'auteur a ajouté : sans elle, republier sans un mot "
                + "déclare une CITATION dont le texte est celui de la source."
        )
        let compacte = ancrage.components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertFalse(
            compacte.contains("content:draft.text"),
            "L'ancrage transmet le brouillon NU : le texte semé par la porte repartirait en commentaire, et "
                + "le post afficherait deux fois la même phrase."
        )
    }

    /// La graine EFFECTIVE est nommée UNE fois — le montage du meuble et
    /// l'ancrage la lisent tous deux.
    ///
    /// Deux écritures de `seed ?? recoveredSeed` seraient deux occasions d'en
    /// corriger une seule, et le défaut serait MUET : l'ancrage comparerait
    /// contre une graine que le meuble n'a pas adoptée, donc citerait un texte
    /// que l'auteur n'a pas écrit. Le compte est de TROIS mentions — la
    /// déclaration et ses deux lecteurs.
    func test_laGraineEffective_estNommeeUneFois_etLueParSesDeuxLecteurs() throws {
        let bloc = try doorBlock()
        XCTAssertEqual(
            occurrences(of: "seed ?? recoveredSeed", in: bloc), 1,
            "La graine effective doit être calculée à UN seul endroit : le montage du meuble et l'ancrage "
                + "mesurent tous deux contre elle, et deux écritures s'en corrigeraient une seule."
        )
        XCTAssertTrue(
            bloc.contains("moodSeed: graine"),
            "Premier lecteur : le meuble adopte la graine EFFECTIVE — celle de la porte, ou la ligne reprise."
        )
        let compacte = bloc.components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(
            compacte.contains("seededText:graine?.text"),
            "Second lecteur : l'ancrage mesure contre la MÊME graine. Contre une autre — la seule de la "
                + "porte, par exemple — il citerait un texte que l'auteur n'a pas écrit."
        )
    }

    /// **Un refus d'ancrage ne FERME pas et ne jette pas la saisie.**
    ///
    /// La sortie appartient au meuble, qui la conditionne à l'acceptation
    /// (`publishDocument` ne referme que sur `accepted`). Un `dismiss()` posé
    /// dans la branche d'ancrage court-circuiterait ce gate — et un composer
    /// refermé sur un envoi perdu reste PLAUSIBLE : il se ferme exactement
    /// comme quand tout va bien.
    func test_lAncrage_neFermePas_surUnRefus_etNeJettePasLaSaisie() throws {
        guard let ancrage = blockBody(startingAt: "private func anchor(_ draft: ComposerDocumentDraft)", in: try surfaceSource()) else {
            throw AncreIntrouvable(quoi: "private func anchor(_ draft: ComposerDocumentDraft)")
        }
        XCTAssertTrue(
            ancrage.contains("anchorStatusAsPost("),
            "Le bloc lu n'est pas celui de l'ancrage — la garde ne mesurerait RIEN."
        )
        XCTAssertFalse(
            ancrage.contains("dismiss("),
            "L'ancrage referme lui-même la porte : un 403 `REPOST_AUDIENCE_WIDENING` jetterait alors la "
                + "saisie, l'emoji, l'audience et les mentions."
        )
    }

    /// **Un ancrage ne SUPPLANTE aucune ligne de file.**
    ///
    /// `supersedeRecoveredStatus` annule une ligne d'outbox de type STATUS ; un
    /// ancrage n'enfile RIEN — il appelle le modèle, qui appelle le réseau.
    /// L'appeler ici détruirait un mood bloqué que l'auteur n'a pas renvoyé.
    ///
    /// La rédaction précédente motivait cela par « `OutboxKind` n'a pas de ligne
    /// pour `POST /posts/:id/repost` ». C'était vrai le 2026-08-24 et le fil
    /// rouge du repost (lot 7) y a depuis posé sa ligne : le fait qui porte
    /// cette garde n'est PAS l'absence d'un kind — c'est que cet envoi-ci
    /// n'enfile pas, quel que soit ce que la file sait porter.
    ///
    /// Preuve structurelle, en plus de la règle :
    /// `recoverStuckMoodIfComposingFresh` s'ouvre sur `guard seed == nil`, et
    /// les deux sites de republication passent une graine non nulle —
    /// `recoveredCmid` est donc toujours `nil` sous une republication.
    func test_lAncrage_neSupplantePasLaLigneBLOQUEE_carUneRepublicationNaJamaisDeReprise() throws {
        guard let ancrage = blockBody(startingAt: "private func anchor(_ draft: ComposerDocumentDraft)", in: try surfaceSource()) else {
            throw AncreIntrouvable(quoi: "private func anchor(_ draft: ComposerDocumentDraft)")
        }
        XCTAssertTrue(
            ancrage.contains("anchorStatusAsPost("),
            "Le bloc lu n'est pas celui de l'ancrage — la garde ne mesurerait RIEN."
        )
        for interdit in ["supersedeRecoveredStatus", "recoveredCmid", "setStatus("] {
            XCTAssertFalse(
                ancrage.contains(interdit),
                "L'ancrage touche « \(interdit) » : il annulerait une ligne d'outbox STATUS qu'il n'envoie "
                    + "pas, ou publierait le mood en plus du post."
            )
        }
    }

    /// La porte n'OBSERVE pas son modèle : elle n'affiche rien qui en dépende.
    /// L'observer ferait re-rendre le composer entier à chaque `status:created`
    /// reçu par la socket, pendant que l'auteur tape.
    func test_laPorte_nObservePasSonModele() throws {
        let bloc = try doorBlock()
        for interdit in ["@ObservedObject", "@StateObject", "StatusViewModel("] {
            XCTAssertFalse(
                bloc.contains(interdit),
                "La porte porte « \(interdit) » : elle n'a rien à observer, et en fabriquer un second modèle "
                    + "dédoublerait la file de reprise."
            )
        }
    }

    /// La porte ne publie pas non plus par un chemin à elle : elle passe par le
    /// modèle, qui possède l'outbox et le cache. Un appel direct au service
    /// contournerait la file durable — un mood composé hors ligne serait perdu.
    func test_laPorte_neTouchePasLesServicesDirectement() throws {
        let bloc = try doorBlock()
        for interdit in ["StatusService", "PostService", "APIClient", "OfflineQueue"] {
            XCTAssertFalse(
                bloc.contains(interdit),
                "La porte touche « \(interdit) » : l'envoi passe par `StatusViewModel`, qui sait basculer sur "
                    + "la file durable quand le réseau manque."
            )
        }
    }
}

/// Lot 4 — le CONTRASTE de la surface du mood, sur les trois teintes du plateau.
///
/// Jumelle de `ComposerDocumentSurfaceContrastTests`, et pour la même raison :
/// le plateau se CHOISIT, donc ce qu'on écrit dessus doit se lire sur les trois
/// teintes. Le mood est la première surface à porter des chips et un compteur —
/// mesurer le texte long sans les mesurer, eux, aurait laissé l'audience et le
/// décompte hors de toute garde.
///
/// `@MainActor` : le bundle de tests est compilé en isolation `nonisolated`, et
/// `WCAGContrast` est épinglé au main actor pour reproduire le contexte d'appel
/// des ponts `UIColor(_: Color)`.
@MainActor
final class ComposerMoodSurfaceContrastTests: XCTestCase {

    /// Les premiers plans que la surface REMET — arrimés à la source par
    /// `test_laListeMesuree_couvreToutCeQueLaSurfaceRemetEnPremierPlan`.
    ///
    /// `MeeshyColors.error` y figure sans être écrit dans la surface : c'est
    /// l'état d'ALERTE du compteur, atteint dès le 101e caractère, et il est
    /// donc visible depuis cet écran. Le mesurer ici est la seule façon de
    /// savoir que le seuil d'alerte reste lisible sur le plateau.
    private let remis: [(String, Color)] = [
        ("textPrimary(isDark: true)", MeeshyColors.textPrimary(isDark: true)),
        ("textSecondary(isDark: true)", MeeshyColors.textSecondary(isDark: true)),
        ("indigo400", MeeshyColors.indigo400),
        ("error (état d'alerte du compteur)", MeeshyColors.error)
    ]

    func test_lesPremiersPlans_passentAA_surLesTroisTeintesDuPlateau() {
        for tint in PlateauTint.allCases {
            for (nom, premierPlan) in remis {
                let ratio = WCAGContrast.ratioOfTranslucentForeground(premierPlan, on: tint.color)
                XCTAssertGreaterThanOrEqual(
                    ratio, 4.5,
                    "\(nom) sur le plateau \(tint.rawValue) mesure \(WCAGContrast.fmt(ratio)):1 — sous AA texte normal"
                )
            }
        }
    }

    /// **Le jeton que la surface REFUSE**, et la mesure qui le refuse.
    ///
    /// `theme.textMuted` est le défaut de `CharacterCountLabel`. Il suit le
    /// thème de l'APP, pas le plateau : en sombre il mesure 4,41:1 sur le
    /// violet profond, en clair 1,68:1. C'est pourquoi la surface lui passe
    /// `mutedColor:`. Ce test rougirait le jour où quelqu'un jugerait le jeton
    /// « assez bon » et retirerait le paramètre.
    func test_leJetonDeThemeRefuse_estBienSousLeSeuil_surLePlateau() {
        let pire = PlateauTint.violetProfond.color
        for (nom, jeton) in [("textMuted(isDark: true)", MeeshyColors.textMuted(isDark: true)),
                             ("textMuted(isDark: false)", MeeshyColors.textMuted(isDark: false))] {
            let ratio = WCAGContrast.ratioOfTranslucentForeground(jeton, on: pire)
            XCTAssertLessThan(
                ratio, 4.5,
                "\(nom) mesure \(WCAGContrast.fmt(ratio)):1 sur le violet profond — s'il passe désormais AA, "
                    + "la raison d'être de `mutedColor:` a changé et le commentaire de `CharacterCountLabel` ment."
            )
        }
    }

    /// L'arrimage. Sans lui, la liste ci-dessus et la vue divergeraient dès
    /// qu'un jeton serait remis : le test resterait vert en ne mesurant plus
    /// tout ce qui est peint.
    ///
    /// **Ce qu'il scanne, et ce qu'il ne scanne PAS.** Une surface remet un
    /// premier plan de QUATRE façons, et de quatre seulement :
    /// `.foregroundColor(`, `.foregroundStyle(`, `.tint(`, et deux paramètres
    /// nommés qui sont des premiers plans chez leur destinataire —
    /// `mutedColor:` (le compteur) et `accentColor:` (le chip « Mentionner »,
    /// que `ReferenceComposerBar` peint en `foregroundStyle`). Les `.fill(`,
    /// `.stroke(` et `background:` sont exclus : ce sont des FONDS, et les
    /// mesurer contre le plateau qu'ils recouvrent n'aurait aucun sens.
    func test_laListeMesuree_couvreToutCeQueLaSurfaceRemetEnPremierPlan() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerMoodSurface.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        XCTAssertTrue(code.contains("struct ComposerMoodSurface"), "Source de la surface introuvable — la garde ne mesurerait rien")

        let porteursDePremierPlan = [".foregroundColor(", ".foregroundStyle(", ".tint(", "mutedColor:", "accentColor:"]
        let mesures = remis.map { $0.0 }
        var lignesVues = 0

        for ligne in code.split(separator: "\n")
        where ligne.contains("MeeshyColors.") && porteursDePremierPlan.contains(where: { ligne.contains($0) }) {
            lignesVues += 1
            XCTAssertTrue(
                mesures.contains(where: { ligne.contains($0) }),
                "La surface remet un premier plan non mesuré : « \(ligne.trimmingCharacters(in: .whitespaces)) »"
            )
        }

        XCTAssertGreaterThanOrEqual(
            lignesVues, 6,
            "L'arrimage n'a trouvé presque aucun premier plan : son motif ne mord plus, et il passerait au vert "
                + "sur une surface entièrement repeinte."
        )
    }
}
