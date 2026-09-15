import XCTest
import SwiftUI
import MeeshyUI
@testable import Meeshy

/// **LA BANDE DU HAUT, MESURÉE EN PIXELS (#6579).**
///
/// Les témoins de `TopChromeBandGuardTests` interrogent la PROPRIÉTÉ de la bande
/// et la RÉSOLUTION de sa teinte — deux questions justes, et deux questions qui
/// ne disent rien de ce qui arrive à l'écran. Le contrôleur du lot l'a établi par
/// deux mutations :
///
/// • bande à `.opacity(0)` — elle ne peint plus UN pixel : **13/13 verts** ;
/// • `onDisplayedContextChange: { _ in }` — la bande d'ÉCOUTE, c'est-à-dire
///   exactement l'écran que le porteur a photographié, ne se peint plus JAMAIS :
///   **33/33 verts**.
///
/// Ce fichier rend les vues et LIT LES PIXELS. Chacun de ses témoins a été
/// éprouvé par ces deux mutations exactes et rougit sur chacune.
@MainActor
final class TopChromeBandRenderTests: XCTestCase {

    private var ecran: RenderedPixels?

    override func tearDown() {
        ecran?.dismount()
        ecran = nil
        super.tearDown()
    }

    // MARK: - Couleurs témoins

    /// La couleur que la bande DOIT porter — lue depuis la production, jamais
    /// recopiée : un littéral ici ferait passer le témoin pour un test de
    /// constante alors qu'il mesure une peinture.
    private var bande: Color { TopChromeTint.call.bandColor }

    /// Sentinelle du CONTENU. Sa présence à l'écran est ce qui prouve qu'une
    /// frame a été peinte — sans quoi un témoin d'ABSENCE (« pas de bande »)
    /// serait vert sur une frame simplement pas encore rendue.
    private static let sentinelle = Color(.sRGB, red: 0, green: 0.85, blue: 0.35, opacity: 1)

    /// Le volet Rivière du témoin de DÉFAUT 5 : un aplat qui monte au bord
    /// physique haut (`.ignoresSafeArea(edges: .top)`), comme `ConversationView`.
    private static let volet = Color(.sRGB, red: 0.95, green: 0.15, blue: 0.15, opacity: 1)

    // MARK: - Compositions

    /// L'écran PHOTOGRAPHIÉ : `CallPresentationLayer` réel, sa pile réelle, son
    /// `MiniAudioPlayerBar` réel, sur un coordinateur d'écoute injecté.
    private struct EcranReel: View {
        let coordinateur: ConversationAudioCoordinator?
        let conversationCourante: String?
        var avecVolet: Bool = false

        var body: some View {
            ZStack {
                TopChromeBandRenderTests.sentinelle
                if avecVolet {
                    TopChromeBandRenderTests.volet
                        .ignoresSafeArea(edges: .top)
                        .zIndex(80)
                }
            }
            .modifier(CallPresentationLayer(
                miniPlayerOnTapBody: {},
                miniPlayerCurrentConversationId: { conversationCourante },
                miniPlayerCoordinator: coordinateur
            ))
        }
    }

    /// La route courante, MUTABLE — ce que `Router.currentConversationId` est à
    /// la racine réelle. Sans elle, on ne peut monter que des états FIXES, et le
    /// seul chemin où la remontée s'observe vraiment est une TRANSITION.
    private final class Route: ObservableObject {
        @Published var conversationId: String?
        init(_ id: String?) { conversationId = id }
    }

    /// Le même écran réel, mais dont la conversation courante peut CHANGER
    /// pendant que la vue est montée.
    private struct EcranAvecRoute: View {
        @ObservedObject var route: Route
        let coordinateur: ConversationAudioCoordinator

        var body: some View {
            TopChromeBandRenderTests.sentinelle
                .modifier(CallPresentationLayer(
                    miniPlayerOnTapBody: {},
                    miniPlayerCurrentConversationId: { route.conversationId },
                    miniPlayerCoordinator: coordinateur
                ))
        }
    }

    /// La bande SEULE, sur un contenu neutre : la géométrie sans la pile.
    private struct BandeSeule: View {
        let callIsActive: Bool

        var body: some View {
            TopChromeBandRenderTests.sentinelle
                .modifier(TopChromeBand(callIsActive: callIsActive, audio: nil))
        }
    }

    /// Une BARRE de 64 pt portant le fond donné, sous la bande — le joint que
    /// le défaut 2 met en cause, isolé pour pouvoir le comparer à son ancêtre.
    private struct BarreEtBande<Fond: ShapeStyle>: View {
        let fond: Fond

        var body: some View {
            VStack(spacing: 0) {
                // `ignoresSafeAreaEdges: []` comme les deux barres de production
                // (#6579) : sans lui, le défaut `.all` de `.background(_:)` fait
                // peindre l'encart par la BARRE, et le témoin mesurerait la
                // couture d'une barre avec elle-même.
                Color.clear.frame(height: 64).background(fond, ignoresSafeAreaEdges: [])
                TopChromeBandRenderTests.sentinelle
            }
            .modifier(TopChromeBand(callIsActive: true, audio: nil))
        }
    }

    // MARK: - Harnais

    private func coordinateur(actif: Bool, conversation: String = "conv-A")
        -> (ConversationAudioCoordinator, MockAudioPlaybackEngine) {
        let moteur = MockAudioPlaybackEngine()
        let coord = ConversationAudioCoordinator(engine: moteur)
        if actif { coord.test_setActiveContext(attachmentId: "a1", conversationId: conversation) }
        return (coord, moteur)
    }

    /// Monte, puis attend que l'ANCRE soit peinte. Ce qui suit peut alors
    /// conclure à une absence sans risquer de mesurer une frame manquante.
    ///
    /// L'ancre est paramétrable parce que le témoin du volet (défaut 5) recouvre
    /// justement la sentinelle : un volet plein écran EST la preuve de peinture
    /// dans ce montage-là.
    private func monter(
        _ vue: some View,
        ancre: Color? = nil,
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws -> RenderedPixels {
        let rendu = try RenderedPixels(vue, file: file, line: line)
        ecran = rendu
        let couleur = ancre ?? Self.sentinelle
        let milieu = Int(rendu.root.bounds.width / 2)
        let bas = Int(rendu.root.bounds.height) - 90
        let peint = rendu.settle(borne: 4) {
            rendu.pixel(milieu, bas, matches: couleur)
        }
        XCTAssertTrue(
            peint,
            "L'ancre de peinture n'est jamais apparue (\(rendu.hex(x: milieu, y: bas)) " +
            "au lieu de \(RenderedPixels.hex(couleur))) : la composition n'a pas été " +
            "peinte, aucun verdict sur la bande n'est recevable.",
            file: file, line: line
        )
        return rendu
    }

    /// **La barre ne peint QUE sa propre hauteur — mesuré, bande absente.**
    ///
    /// Ce témoin isole ce que le défaut de `.background(_:)` (`ignoresSafeAreaEdges:
    /// .all`) rendait invisible : rendue SANS aucune bande, la barre ne doit
    /// laisser aucun pixel dans l'encart système. Tant qu'elle y étendait sa
    /// couleur, tout témoin de bande était vert pour la peinture de la BARRE —
    /// et la neutralisation de la bande ne rougissait rien.
    func test_laBarreSeule_sansAucuneBande_neTeintePasLEncart() throws {
        let (coord, _) = coordinateur(actif: true)
        let rendu = try monter(VStack(spacing: 0) {
            MiniAudioPlayerBar(coordinatorForTesting: coord, currentConversationId: { nil })
            Self.sentinelle
        })
        let x = Int(rendu.root.bounds.width / 2)
        let encart = Int(rendu.safeAreaTop)

        XCTAssertTrue(
            rendu.settle(borne: 4) { rendu.pixel(x, encart + 10, matches: bande) },
            "Préalable : la barre doit être rendue sous l'encart — " +
            "\(rendu.hex(x: x, y: encart + 10))."
        )
        XCTAssertFalse(
            rendu.pixel(x, 2, matches: bande),
            "…et l'encart doit rester VIERGE (\(rendu.hex(x: x, y: 2))). S'il porte " +
            "la couleur de la barre alors qu'aucune bande n'est montée, c'est que " +
            "la barre a repris la propriété de la bande — le défaut que ce lot ferme."
        )
    }

    // MARK: - DÉFAUT 1 — la bande PEINT, et seulement quand une barre est là

    /// **LE témoin de ce lot.** L'écran du porteur : une écoute en cours, hors de
    /// la conversation qui joue, aucun appel. La bande doit peindre l'encart haut.
    ///
    /// Rouge sur les DEUX mutations du contrôleur : `.opacity(0)` sur la bande
    /// (elle ne peint plus), et `onDisplayedContextChange: { _ in }` sur
    /// `CallPresentationLayer` (le contexte affiché ne remonte plus, donc
    /// `TopChromeTint.resolve` rend `nil`).
    func test_uneEcouteEnCours_PEINT_laBandeDeLEncartHaut() throws {
        let (coord, _) = coordinateur(actif: true)
        let rendu = try monter(EcranReel(coordinateur: coord, conversationCourante: nil))
        let largeur = Int(rendu.root.bounds.width)

        let apparue = rendu.settle(borne: 4) { rendu.pixel(largeur / 2, 2, matches: bande) }
        XCTAssertTrue(
            apparue,
            "À 2 pt du bord haut, l'écran d'ÉCOUTE doit porter \(RenderedPixels.hex(bande)) — " +
            "mesuré \(rendu.hex(x: largeur / 2, y: 2)). C'est l'écran que le porteur a " +
            "photographié : une barre occupe le sommet et la bande la prolonge."
        )
        for x in [8, largeur / 2, largeur - 8] {
            XCTAssertTrue(
                rendu.pixel(x, 2, matches: bande),
                "…et sur TOUTE la largeur : à x=\(x), \(rendu.hex(x: x, y: 2))."
            )
        }
    }

    /// Aucune barre ⇒ aucune bande. La sentinelle prouve d'abord que la frame est
    /// peinte, donc que l'absence mesurée en est une.
    func test_aucuneBarreActive_neLaissePasUnPixelDeBande() throws {
        let (coord, _) = coordinateur(actif: false)
        let rendu = try monter(EcranReel(coordinateur: coord, conversationCourante: nil))
        let largeur = Int(rendu.root.bounds.width)

        for x in [8, largeur / 2, largeur - 8] {
            XCTAssertFalse(
                rendu.pixel(x, 2, matches: bande),
                "Sans barre active, le haut de l'app ne doit porter AUCUNE teinte de " +
                "chrome — mesuré \(rendu.hex(x: x, y: 2)) à x=\(x). Une bande permanente " +
                "recouvrirait le fond thématique de tous les écrans."
            )
        }
    }

    /// La bande occupe l'encart système, et s'y ARRÊTE. L'offset de `-safeAreaTop`
    /// est ce qui le garantit ; ce témoin le mesure au lieu de le relire.
    func test_laBandeRemplitLEncart_etNeDescendPasDessous() throws {
        let rendu = try monter(BandeSeule(callIsActive: true))
        let x = Int(rendu.root.bounds.width / 2)
        let encart = Int(rendu.safeAreaTop)

        XCTAssertTrue(
            rendu.pixel(x, 2, matches: bande),
            "Le haut de l'encart doit être peint — \(rendu.hex(x: x, y: 2))."
        )
        XCTAssertTrue(
            rendu.pixel(x, encart - 3, matches: bande),
            "…jusqu'à son bord bas (y=\(encart - 3)) — \(rendu.hex(x: x, y: encart - 3)). " +
            "Une bande plus courte laisserait une lisière du fond thématique."
        )
        XCTAssertTrue(
            rendu.pixel(x, encart + 4, matches: Self.sentinelle),
            "…et PAS au-delà (y=\(encart + 4)) — \(rendu.hex(x: x, y: encart + 4)). " +
            "Sans l'offset, l'overlay recouvrirait les premiers points de la barre " +
            "qu'il prolonge."
        )
    }

    // MARK: - DÉFAUT 2 — la COUTURE, mesurée de part et d'autre du joint

    /// Le joint entre la bande et la barre d'ÉCOUTE — avec une barre RÉELLEMENT
    /// rendue, ce que la mesure du lot n'avait pas (sa capture relevait `#FAF9F9`
    /// sous la bande : aucune barre n'était à l'écran, donc le joint n'a jamais
    /// été observé).
    func test_laCoutureEstContinue_avecLaBarreDEcouteREELLEMENTRendue() throws {
        let (coord, _) = coordinateur(actif: true)
        let rendu = try monter(EcranReel(coordinateur: coord, conversationCourante: nil))
        let largeur = Int(rendu.root.bounds.width)
        let encart = Int(rendu.safeAreaTop)

        XCTAssertTrue(
            rendu.settle(borne: 4) { rendu.pixel(largeur / 2, 2, matches: bande) },
            "La barre d'écoute doit être rendue avant toute mesure de couture — " +
            "sans elle, le joint n'existe pas et le témoin mesure le fond."
        )

        for x in [6, largeur / 2, largeur - 6] {
            let dessus = rendu.rgb(x: x, y: encart - 4)
            let dessous = rendu.rgb(x: x, y: encart + 5)
            XCTAssertEqual(
                dessus.r, dessous.r, accuracy: 6,
                "x=\(x) — rouge : bande \(rendu.hex(x: x, y: encart - 4)), " +
                "barre \(rendu.hex(x: x, y: encart + 5))."
            )
            XCTAssertEqual(dessus.g, dessous.g, accuracy: 6, "x=\(x) — vert.")
            XCTAssertEqual(dessus.b, dessous.b, accuracy: 6, "x=\(x) — bleu.")
            XCTAssertTrue(
                rendu.pixel(x, encart + 5, matches: bande),
                "…et les deux valent l'unique couleur du chrome haut — x=\(x) : " +
                "\(rendu.hex(x: x, y: encart + 5)) au lieu de \(RenderedPixels.hex(bande))."
            )
        }
    }

    /// La barre d'APPEL porte le MÊME aplat, et le joint y est continu lui aussi.
    ///
    /// La pilule elle-même n'est pas rendue ici : `CallManager` a un `init` privé
    /// et `callState` en `private(set)`, donc aucun témoin de ce bundle ne peut
    /// forcer un appel. Ce qui est rendu est le FOND que la pilule pose
    /// (`TopChromeTint.call.bandColor`, le producteur unique) ; que la pilule
    /// pose bien celui-là, et rien d'autre, est tenu par
    /// `FloatingCallPillViewTests.test_banner_isFullIndigo_noScrimNoFade`.
    func test_laCoutureEstContinue_avecLAplatDeLaBarreDAppel() throws {
        let rendu = try monter(BarreEtBande(fond: TopChromeTint.call.bandColor))
        let largeur = Int(rendu.root.bounds.width)
        let encart = Int(rendu.safeAreaTop)

        for x in [6, largeur / 2, largeur - 6] {
            let dessus = rendu.rgb(x: x, y: encart - 4)
            let dessous = rendu.rgb(x: x, y: encart + 5)
            XCTAssertEqual(dessus.r, dessous.r, accuracy: 6, "x=\(x) — rouge.")
            XCTAssertEqual(dessus.g, dessous.g, accuracy: 6, "x=\(x) — vert.")
            XCTAssertEqual(dessus.b, dessous.b, accuracy: 6, "x=\(x) — bleu.")
        }
    }

    /// **Le témoin de couture DISCRIMINE-T-IL ?** Le même montage, avec le dégradé
    /// DIAGONAL que la barre d'appel portait avant ce lot : le joint doit être
    /// mesurablement ROMPU sur la droite de l'écran.
    ///
    /// Sans ce contre-témoin, les deux précédents pourraient être verts parce
    /// qu'ils comparent deux lectures d'un même aplat trivialement égal — c'est-
    /// à-dire pour une raison étrangère à ce qu'ils prétendent mesurer.
    func test_leTemoinDeCouture_rougiraitSurLeDegradeDiagonalDAvant() throws {
        let degradeDAvant = LinearGradient(
            colors: [CallBannerContrast.bannerTop, CallBannerContrast.bannerBottom],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        let rendu = try monter(BarreEtBande(fond: degradeDAvant))
        let encart = Int(rendu.safeAreaTop)
        let droite = Int(rendu.root.bounds.width) - 6

        let dessus = rendu.rgb(x: droite, y: encart - 4)
        let dessous = rendu.rgb(x: droite, y: encart + 5)
        let ecart = max(abs(dessus.r - dessous.r), abs(dessus.g - dessous.g), abs(dessus.b - dessous.b))
        XCTAssertGreaterThan(
            ecart, 6,
            "Le bord droit du dégradé d'avant doit ROMPRE la couture — écart mesuré " +
            "\(ecart) entre \(rendu.hex(x: droite, y: encart - 4)) et " +
            "\(rendu.hex(x: droite, y: encart + 5)). Si cet écart passe sous la " +
            "tolérance, les deux témoins de couture ci-dessus ne mesurent plus rien."
        )
    }

    // MARK: - DÉFAUT 3 — la remontée `MiniAudioPlayerBar` → hôte

    /// Le seul fil runtime neuf du lot, exercé pour ce qu'il FAIT : la barre
    /// montée dans une vraie fenêtre remonte-t-elle à son hôte ce qu'elle AFFICHE ?
    private final class Journal {
        var recus: [ActiveAudioContext?] = []
        var dernier: ActiveAudioContext?? { recus.last }
    }

    private func monterLaBarre(
        coord: ConversationAudioCoordinator,
        conversationCourante: String?,
        journal: Journal
    ) throws -> RenderedPixels {
        let vue = VStack(spacing: 0) {
            MiniAudioPlayerBar(
                coordinatorForTesting: coord,
                currentConversationId: { conversationCourante },
                onDisplayedContextChange: { journal.recus.append($0) }
            )
            Self.sentinelle
        }
        return try monter(vue)
    }

    func test_laBarreRemonteSonContexte_horsDeLaConversationQuiJoue() throws {
        let (coord, _) = coordinateur(actif: true, conversation: "conv-A")
        let journal = Journal()
        let rendu = try monterLaBarre(coord: coord, conversationCourante: "conv-B", journal: journal)
        rendu.attendre(borne: 3) { !journal.recus.isEmpty }

        XCTAssertFalse(journal.recus.isEmpty, "La barre n'a rien remonté du tout.")
        XCTAssertEqual(
            (journal.recus.last ?? nil)?.conversationId, "conv-A",
            "Hors de la conversation qui joue, la barre OCCUPE le sommet : elle doit " +
            "remonter son contexte, sans quoi la bande ne se peint au-dessus de rien."
        )
    }

    /// Dans la conversation qui joue, la barre se MASQUE (la bulle du fil porte
    /// les mêmes contrôles) — et la bande ne doit alors peindre AUCUN pixel.
    ///
    /// Mesuré à l'écran et non sur ce que la barre remet, parce qu'elle ne remet
    /// RIEN dans ce cas : son `Group` ne rend aucun contenu, donc son `.onAppear`
    /// ne tire jamais au montage à froid. Ce qui compte n'est pas l'appel, c'est
    /// le résultat : l'hôte reste à `nil` et l'encart reste au fond thématique.
    /// Une barre qui remonterait `coordinator.activeContext` au lieu de ce
    /// qu'elle AFFICHE peindrait ici un ruban indigo au-dessus de rien.
    func test_dansLaConversationQuiJoue_laBandeNePeintAucunPixel() throws {
        let (coord, _) = coordinateur(actif: true, conversation: "conv-A")
        let rendu = try monter(EcranReel(coordinateur: coord, conversationCourante: "conv-A"))
        let largeur = Int(rendu.root.bounds.width)

        for x in [8, largeur / 2, largeur - 8] {
            XCTAssertFalse(
                rendu.pixel(x, 2, matches: bande),
                "La barre est masquée dans la conversation qui joue : l'encart haut " +
                "doit rester au fond thématique — mesuré \(rendu.hex(x: x, y: 2)) à x=\(x)."
            )
        }
    }

    /// **Le témoin de la remontée, sur le chemin où elle s'observe réellement :
    /// une TRANSITION.** L'utilisateur écoute depuis un autre écran (la barre
    /// occupe le sommet, la bande est peinte), puis OUVRE la conversation qui
    /// joue : la barre se masque, et la bande doit s'effacer avec elle.
    ///
    /// Un montage à froid ne peut pas porter ce témoin : quand la barre est
    /// masquée, son `Group` ne rend rien et son `.onAppear` ne tire jamais — une
    /// barre qui remonterait `coordinator.activeContext` au lieu de ce qu'elle
    /// AFFICHE rendrait exactement le même écran. Éprouvé : cette mutation-là
    /// laisse tous les témoins d'état fixe verts, et ne rougit qu'ici.
    func test_enEntrantDansLaConversationQuiJoue_laBandeSEfface() throws {
        let (coord, _) = coordinateur(actif: true, conversation: "conv-A")
        let route = Route("conv-B")
        let rendu = try monter(EcranAvecRoute(route: route, coordinateur: coord))
        let largeur = Int(rendu.root.bounds.width)

        XCTAssertTrue(
            rendu.settle(borne: 4) { rendu.pixel(largeur / 2, 2, matches: bande) },
            "Préalable : hors de la conversation qui joue, la bande doit être peinte " +
            "— mesuré \(rendu.hex(x: largeur / 2, y: 2))."
        )

        route.conversationId = "conv-A"

        let effacee = rendu.settle(borne: 4) { !rendu.pixel(largeur / 2, 2, matches: bande) }
        XCTAssertTrue(
            effacee,
            "En entrant dans la conversation qui joue, la barre se masque : la bande " +
            "doit s'effacer AVEC elle. Elle est restée à " +
            "\(rendu.hex(x: largeur / 2, y: 2)) — un ruban indigo au-dessus d'une " +
            "barre absente, ce qui arrive dès que la barre remonte ce que le " +
            "coordinateur JOUE au lieu de ce qu'elle AFFICHE."
        )
    }

    func test_laBarreResteRemontee_pendantLaFenetreDeGrace() throws {
        let (coord, _) = coordinateur(actif: true, conversation: "conv-A")
        let journal = Journal()
        let rendu = try monterLaBarre(coord: coord, conversationCourante: nil, journal: journal)
        rendu.attendre(borne: 3) { !journal.recus.isEmpty }
        XCTAssertNotNil(journal.recus.last ?? nil, "Préalable : la barre doit d'abord remonter.")

        coord.close()
        // Attente BORNÉE, et assumée : on mesure ici qu'il ne se passe RIEN
        // pendant la fenêtre de grâce. Une borne trop courte ne peut que rendre
        // le témoin indulgent, jamais instable — l'inverse d'un pari sur la
        // vitesse de la machine.
        rendu.attendre(borne: 1) { (journal.recus.last ?? nil) == nil }

        XCTAssertNotNil(
            journal.recus.last ?? nil,
            "La barre se MAINTIENT 5 s après la fin de la file pour un fondu propre. " +
            "Si elle remontait `nil` tout de suite, la bande disparaîtrait d'un coup " +
            "au-dessus d'une barre encore visible. Reçu : " +
            "\(String(describing: journal.recus.last ?? nil))."
        )
    }

    // MARK: - DÉFAUT 5 — l'ordre de peinture face à un volet plein bord

    /// La bande est devenue un `.overlay` du `VStack` : elle se peint APRÈS tout
    /// contenu, alors que le débord de la pilule (enfant n°1) passait DESSOUS.
    /// Le volet Rivière (`ConversationView`, `.ignoresSafeArea(edges: .top)` +
    /// `.zIndex(80)`) est la surface atteignable pendant une écoute.
    ///
    /// Ce témoin MESURE jusqu'où le volet monte, plutôt que de le déduire de son
    /// modificateur — et c'est la mesure qui décide s'il y a régression.
    ///
    /// Pendant une ÉCOUTE, la barre occupe la tête du `VStack` : le contenu qui
    /// ignore la safe area haute ne remonte que de la hauteur de l'encart, donc
    /// s'arrête SOUS la barre. Le volet n'atteint jamais l'encart système, la
    /// bande ne recouvre donc aucun pixel de volet — et la bande ne peut pas non
    /// plus être trouée par lui.
    func test_pendantUneEcoute_leVoletNeMonteJamaisDansLEncart_etLaBandeLeCouvrePas() throws {
        let (coord, _) = coordinateur(actif: true)
        let rendu = try monter(
            EcranReel(coordinateur: coord, conversationCourante: nil, avecVolet: true),
            ancre: Self.volet
        )
        let largeur = Int(rendu.root.bounds.width)
        let encart = Int(rendu.safeAreaTop)

        XCTAssertTrue(
            rendu.settle(borne: 4) { rendu.pixel(largeur / 2, 2, matches: bande) },
            "L'encart haut doit rester la BANDE, volet ouvert ou non — mesuré " +
            "\(rendu.hex(x: largeur / 2, y: 2))."
        )

        let hautDuVolet = rendu.premiereLigne(x: largeur / 2, matching: Self.volet)
        XCTAssertNotNil(hautDuVolet, "Le volet doit être rendu quelque part.")
        XCTAssertGreaterThanOrEqual(
            hautDuVolet ?? -1, encart,
            "Le volet ne doit pas entrer dans l'encart système (il commence à " +
            "y=\(hautDuVolet.map(String.init) ?? "nulle part"), encart = \(encart)). " +
            "S'il y entrait, la bande — devenue `.overlay`, donc peinte APRÈS tout " +
            "contenu — le recouvrirait : c'est l'inversion d'ordre de peinture à " +
            "traiter, et ce témoin est l'endroit où elle se voit."
        )
    }
}
