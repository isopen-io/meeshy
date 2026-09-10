import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK

/// L'ENTRÉE MEESH de l'en-tête (#5839) — l'icône et le solde qui remplacent le
/// trophée, et le sous-menu qui raconte les deux bornes de frappe.
///
/// **Pourquoi un montage réel et pas une garde de source.** Le défaut que ces
/// témoins ferment n'était pas une ligne manquante : `ProgressionMeeshHero`
/// EXISTAIT, complète, avec son solde, son prix et son bouton — montée par
/// personne. Swift n'avertit pas sur une `View` déclarée et jamais rendue, et
/// aucun test ne l'interrogeait : la carte était donc VERTE et INVISIBLE.
/// Seul un test qui parcourt l'arbre RENDU distingue « le code existe » de
/// « l'utilisateur le voit ».
@MainActor
final class ProgressionMeeshEntryTests: XCTestCase {

    // MARK: - Fixture


    // MARK: - Les libellés, résolus par le MÊME chemin que la vue

    /// **Ces témoins affirmaient des littéraux FRANÇAIS** — `contains("Première
    /// frappe")` — alors que `String(localized:)` résout contre les langues
    /// préférées de l'HÔTE, et que l'hôte de test EST l'app. Sur un simulateur
    /// créé par `simctl create`, sans langue configurée, l'arbre rend
    /// « First mint, 19 Aug 2026 » : les assertions cherchaient un mot qui ne
    /// pouvait pas s'y trouver. Rouges sur `main` depuis leur écriture, et
    /// invisibles depuis `dev`, dont le travail s'arrête à `Build for testing`.
    ///
    /// La parade n'est pas de pincer la locale (le dépôt l'a déjà tranché dans
    /// `ComposerSelectionMarkerWiringGuardTests`) : c'est de demander au
    /// catalogue LA MÊME CLÉ que la vue. Le témoin parle alors la langue de
    /// l'hôte, quelle qu'elle soit, et continue de garder le CÂBLAGE — qui est
    /// son sujet.
    private var premiereFrappe: String {
        String(localized: "progression.meesh.first_mint", defaultValue: "Première frappe", bundle: .main)
    }
    private var derniereFrappe: String {
        String(localized: "progression.meesh.last_mint", defaultValue: "Dernière frappe", bundle: .main)
    }
    private var aucuneFrappe: String {
        String(localized: "progression.meesh.never_minted", defaultValue: "Aucune frappe pour l’instant.", bundle: .main)
    }

    /// Un compte qui a frappé deux fois — assez pour que les deux bornes
    /// diffèrent, ce qui est le seul cas où la seconde ligne s'affiche.
    private func payload(
        balance: Int = 2,
        debitablePoints: Int = 1300,
        firstMintedAt: String? = "2026-08-19T10:30:00.000Z",
        lastMintedAt: String? = "2026-09-01T08:15:00.000Z"
    ) -> APIEngagementProgress {
        APIEngagementProgress(
            counters: [
                .init(axisKey: "content.text_message", count: 240, points: 480),
                .init(axisKey: "content.story", count: 18, points: 162),
                .init(axisKey: "social.friendship", count: 24, points: 168),
                .init(axisKey: "conversation.private", count: 12, points: 60)
            ],
            milestones: [
                .init(milestoneType: .badge, milestoneKey: "content.text_message:100", reachedAt: "2026-08-30T08:00:00.000Z"),
                .init(milestoneType: .badge, milestoneKey: "content.story:10", reachedAt: "2026-09-02T09:00:00.000Z"),
                .init(milestoneType: .achievement, milestoneKey: "achievement.first_voice", reachedAt: "2026-09-05T18:20:00.000Z")
            ],
            streak: .init(currentStreakDays: 6, longestStreakDays: 11),
            level: .init(engagementScore: 1244),
            meesh: .init(
                balance: balance,
                mintedLifetime: balance,
                debitablePoints: debitablePoints,
                floorPoints: 60,
                missingPoints: max(0, 1221 - debitablePoints),
                mintCost: 1221,
                firstMintedAt: firstMintedAt,
                lastMintedAt: lastMintedAt
            ),
            elan: .init(factor: 3, activeFamilyCount: 3, hasStanding: true, windowDays: 7)
        )
    }

    private func loadedViewModel(_ charge: APIEngagementProgress) async -> ProgressionViewModel {
        let service = MockEngagementProgressService()
        service.fetchProgressResult = .success(charge)
        let vm = ProgressionViewModel(
            service: service,
            networkMonitor: FakeNetworkMonitor(isOnline: true),
            currentUserId: "meesh-entry-\(UUID().uuidString)"
        )
        await vm.load(forceNetwork: true)
        return vm
    }

    // MARK: - Montage

    /// **La fenêtre n'est pas une précaution, c'est une condition** : hors
    /// fenêtre, `UIHostingController` ne matérialise pas toute sa hiérarchie et
    /// l'arbre parcouru serait muet — vert par omission garanti.
    private var window: UIWindow?

    private func render(_ vue: some View, size: CGSize = CGSize(width: 402, height: 874)) -> UIView {
        let host = UIHostingController(rootView: vue)
        let window = UIWindow(frame: CGRect(origin: .zero, size: size))
        window.rootViewController = host
        window.isHidden = false
        window.makeKeyAndVisible()
        self.window = window
        host.view.frame = CGRect(origin: .zero, size: size)
        window.setNeedsLayout()
        window.layoutIfNeeded()
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        return host.view
    }

    override func tearDown() {
        window?.rootViewController = nil
        window?.isHidden = true
        window = nil
        super.tearDown()
    }

    /// **SwiftUI ne pose ni identifiant ni libellé sur les `UIView`.** Son
    /// texte est dessiné, pas encapsulé dans des `UILabel`, et
    /// `.accessibilityIdentifier` atterrit sur des ÉLÉMENTS d'accessibilité
    /// synthétisés — invisibles pour une descente qui ne parcourt que
    /// `subviews`. Une telle descente rend toujours `nil` : les témoins
    /// d'ABSENCE passent alors au vert sans rien mesurer, ce qui est
    /// exactement ce qui est arrivé à la première version de ce fichier.
    ///
    /// La descente ci-dessous interroge donc les DEUX arbres — les sous-vues
    /// ET `accessibilityElementCount()` / `accessibilityElement(at:)`, l'API
    /// que SwiftUI implémente réellement.
    private struct Noeud {
        let identifiant: String?
        let libelle: String?
    }

    private func elements(de objet: NSObject) -> [NSObject] {
        if let listes = objet.accessibilityElements as? [NSObject], !listes.isEmpty { return listes }
        let compte = objet.accessibilityElementCount()
        guard compte != NSNotFound, compte > 0 else { return [] }
        return (0..<compte).compactMap { objet.accessibilityElement(at: $0) as? NSObject }
    }

    private func noeuds(_ objet: NSObject, profondeur: Int = 0) -> [Noeud] {
        guard profondeur < 60 else { return [] }
        // Les éléments que SwiftUI synthétise ne DÉCLARENT pas
        // `UIAccessibilityIdentification` : le cast échouait en silence et
        // rendait `nil` pour tout l'arbre, alors que les objets répondent bien
        // au sélecteur. On interroge donc la réponse, pas le type.
        let identifiant: String? = objet.responds(to: Selector(("accessibilityIdentifier")))
            ? objet.value(forKey: "accessibilityIdentifier") as? String
            : nil
        var trouves = [Noeud(identifiant: identifiant, libelle: objet.accessibilityLabel)]
        for element in elements(de: objet) {
            trouves.append(contentsOf: noeuds(element, profondeur: profondeur + 1))
        }
        if let vue = objet as? UIView {
            for sous in vue.subviews {
                trouves.append(contentsOf: noeuds(sous, profondeur: profondeur + 1))
            }
        }
        return trouves
    }

    private func node(_ identifiant: String, in root: UIView) -> Noeud? {
        noeuds(root).first { $0.identifiant == identifiant }
    }

    /// Tout ce que l'écran DIT, dans l'ordre de l'arbre.
    private func labels(in root: UIView) -> [String] {
        noeuds(root).compactMap(\.libelle)
    }

    /// **Le harnais doit pouvoir ÉCHOUER.** Un arbre muet rendrait les témoins
    /// d'absence verts sans rien prouver — ce témoin-ci mesure l'instrument
    /// avant les autres, et tombe si la descente ne voit plus rien.
    func test_theHarnessActuallyReadsTheRenderedTree() async {
        let vm = await loadedViewModel(payload())
        let root = render(ProgressionView(viewModel: vm))

        XCTAssertFalse(
            labels(in: root).isEmpty,
            "La descente ne lit aucun libellé : tout témoin d'absence de ce fichier serait vert par omission."
        )
    }

    // MARK: - Témoins

    /// LE témoin central : l'entrée est RENDUE, pas seulement déclarée.
    func test_header_mountsTheMeeshEntry_notADecorativeTrophy() async {
        let vm = await loadedViewModel(payload())
        // Deux causes rendraient l'entrée absente — un modèle sans bloc Meesh,
        // ou un en-tête qui ne le monte pas. On les sépare AVANT d'accuser.
        XCTAssertNotNil(vm.progress?.meesh, "Le modèle n'a pas de bloc Meesh : ce n'est pas la vue qui est en cause.")
        let root = render(ProgressionView(viewModel: vm))

        let identifiants = noeuds(root).compactMap(\.identifiant)
        XCTAssertNotNil(
            node("progression.meesh.entry", in: root),
            "L'entrée Meesh n'est pas dans l'arbre rendu. Identifiants vus : \(identifiants)"
        )
    }

    /// Le solde VOYAGE jusqu'au libellé : une entrée qui n'annonce pas le
    /// nombre est une icône, pas ce que le porteur a demandé.
    func test_theEntryAnnouncesTheBalance() async {
        let vm = await loadedViewModel(payload(balance: 3))
        let root = render(ProgressionView(viewModel: vm))

        // Interroger TOUT l'arbre laisserait « 3 » venir du niveau ou d'un
        // compteur : la première version de ce témoin passait ainsi au vert
        // alors que l'entrée n'existait pas. On interroge l'entrée SEULE.
        let entree = node("progression.meesh.entry", in: root)
        let dit = entree?.libelle ?? ""
        XCTAssertTrue(dit.contains("3"), "Le solde n'est pas dans ce que l'entrée annonce : « \(dit) ».")
    }

    /// La passerelle qui ne sert PAS le bloc ⇒ aucune entrée. Un solde de zéro
    /// affiché à quelqu'un qui en a deux serait pire qu'une absence.
    func test_withoutTheMeeshBlock_noEntryIsMounted() async {
        let sans = APIEngagementProgress(
            counters: [],
            milestones: [],
            streak: .init(currentStreakDays: 0, longestStreakDays: 0),
            level: .init(engagementScore: 10)
        )
        let vm = await loadedViewModel(sans)
        let root = render(ProgressionView(viewModel: vm))

        XCTAssertNil(
            node("progression.meesh.entry", in: root),
            "Une entrée Meesh est montée alors que la passerelle ne sert pas le bloc."
        )
    }

    // MARK: - Le sous-menu, mesuré sur son CONTENU

    /// Le contenu est séparé de son bouton : sans quoi le mesurer exigerait de
    /// simuler un tap, ce qui ferait tester le GESTE quand on veut tester ce
    /// qui est DIT.
    func test_theDetail_tellsBothMintBounds() {
        let meesh = EngagementProgressResolver.resolve(payload()).meesh!
        let root = render(
            ProgressionMeeshDetail(meesh: meesh, isMinting: false, onMint: {})
                .frame(width: 300),
            size: CGSize(width: 320, height: 420)
        )

        let dit = labels(in: root).joined(separator: " | ")
        XCTAssertTrue(dit.contains(premiereFrappe), "La première borne manque : « \(dit) »")
        XCTAssertTrue(dit.contains(derniereFrappe), "La seconde borne manque : « \(dit) »")
    }

    /// **Une frappe UNIQUE a la même date des deux côtés** : la répéter
    /// n'apprend rien et fait douter de la seconde ligne.
    func test_aSingleMint_doesNotRepeatTheSameDateTwice() {
        let uneSeule = payload(
            balance: 1,
            firstMintedAt: "2026-08-19T10:30:00.000Z",
            lastMintedAt: "2026-08-19T10:30:00.000Z"
        )
        let meesh = EngagementProgressResolver.resolve(uneSeule).meesh!
        let root = render(
            ProgressionMeeshDetail(meesh: meesh, isMinting: false, onMint: {})
                .frame(width: 300),
            size: CGSize(width: 320, height: 420)
        )

        let dit = labels(in: root).joined(separator: " | ")
        XCTAssertTrue(dit.contains(premiereFrappe), "La première borne manque : « \(dit) »")
        XCTAssertFalse(dit.contains(derniereFrappe), "La seconde borne répète la première : « \(dit) »")
    }

    /// Aucune frappe ⇒ on le DIT, plutôt que deux lignes vides.
    func test_withoutAnyMint_theDetailSaysSo() {
        let jamais = payload(balance: 0, firstMintedAt: nil, lastMintedAt: nil)
        let meesh = EngagementProgressResolver.resolve(jamais).meesh!
        let root = render(
            ProgressionMeeshDetail(meesh: meesh, isMinting: false, onMint: {})
                .frame(width: 300),
            size: CGSize(width: 320, height: 420)
        )

        let dit = labels(in: root).joined(separator: " | ")
        XCTAssertTrue(dit.contains(aucuneFrappe), "L'absence de frappe n'est pas dite : « \(dit) »")
        XCTAssertFalse(dit.contains(premiereFrappe), "Une borne est annoncée sans frappe : « \(dit) »")
    }

    /// **La frappe ne s'offre QUE si les points la permettent** — la directive
    /// du porteur est une NÉGATION, et une négation se prouve en cherchant
    /// l'absence.
    func test_withoutEnoughPoints_noMintActionIsOffered() {
        let pauvre = payload(debitablePoints: 300)
        let meesh = EngagementProgressResolver.resolve(pauvre).meesh!
        XCTAssertFalse(meesh.canMint, "La fixture ne décrit pas le cas visé.")
        let root = render(
            ProgressionMeeshDetail(meesh: meesh, isMinting: false, onMint: {})
                .frame(width: 300),
            size: CGSize(width: 320, height: 420)
        )

        let dit = labels(in: root).joined(separator: " | ")
        XCTAssertFalse(dit.contains(ProgressionCopy.meeshMintAction(meesh.mintCost)),
                       "La conversion est proposée sans les points : « \(dit) »")
        XCTAssertTrue(dit.contains(ProgressionCopy.meeshMissing(missing: meesh.missingPoints, floor: meesh.floorPoints)),
                      "Ce qui manque n'est pas dit : « \(dit) »")
    }

    func test_withEnoughPoints_theMintActionIsOffered() {
        let riche = payload(debitablePoints: 1300)
        let meesh = EngagementProgressResolver.resolve(riche).meesh!
        XCTAssertTrue(meesh.canMint, "La fixture ne décrit pas le cas visé.")
        let root = render(
            ProgressionMeeshDetail(meesh: meesh, isMinting: false, onMint: {})
                .frame(width: 300),
            size: CGSize(width: 320, height: 420)
        )

        XCTAssertTrue(
            labels(in: root).joined(separator: " | ").contains(ProgressionCopy.meeshMintAction(meesh.mintCost)),
            "La conversion n'est pas proposée alors que les points la permettent."
        )
    }
}
