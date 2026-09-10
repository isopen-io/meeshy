import Darwin
import SwiftUI
import UIKit
import XCTest

/// **L'ÉCRAN RENDU — ce que l'utilisateur VOIT, pas ce que le code DÉCLARE.**
///
/// Swift n'avertit jamais sur une `View` déclarée et montée par personne :
/// `ProgressionMeeshHero` existait, complète, avec son solde, son prix et son
/// bouton — et la suite était VERTE (#5839). Seul un témoin qui parcourt l'arbre
/// RENDU sépare « le code existe » de « l'utilisateur le voit ».
///
/// **Pourquoi UN harnais.** Deux fichiers écrivaient ce montage à quelques lignes
/// près, et ils avaient déjà DIVERGÉ : l'un rattachait sa fenêtre à la
/// `UIWindowScene`, l'autre montait une `UIWindow(frame:)` nue. Ce dépôt a mesuré
/// ce que coûtent deux vérités pour un même geste — les trois familles de
/// résolveurs du Prisme ont divergé sur trois clients faute d'un site UNIQUE.
///
/// ## Les trois conditions que ce harnais tient
///
/// **1 — SwiftUI ne pose ni identifiant ni libellé sur ses `UIView`.** Son texte
/// est DESSINÉ, pas encapsulé dans des `UILabel`, et `.accessibilityIdentifier`
/// atterrit sur des ÉLÉMENTS d'accessibilité synthétisés, invisibles pour une
/// descente qui ne parcourt que `subviews`. Une telle descente rend toujours
/// `nil` : les témoins d'ABSENCE passent alors au vert sans rien mesurer, ce qui
/// est exactement ce qui est arrivé à la première version de ces fichiers. La
/// descente ci-dessous interroge donc les DEUX arbres.
///
/// **2 — Cet arbre d'accessibilité n'existe QUE si un client le réclame** — et
/// c'est ce qui séparait la CI d'une machine de développement (#5998). Voir
/// `arbreAccessibiliteActive` ci-dessous, qui pose la condition lui-même.
///
/// **3 — Une attente FIXE est un pari sur la vitesse de la MACHINE.** Elle
/// n'était PAS la cause des sept rouges — portée à dix secondes pleines, l'arbre
/// restait muet, et c'est cette mesure-là qui a envoyé chercher ailleurs. Elle
/// reste néanmoins remplacée : `RunLoop.run(until: +0,35 s)` ne mesure rien
/// d'autre que l'hôte, et il se trouve qu'attendre la CONDITION est aussi plus
/// RAPIDE — la boucle rend la main dès que l'arbre parle, ce qui a fait passer
/// ces douze témoins de 3,4 s à 2,6 s sur le simulateur le plus lent.
///
/// Et si la borne est atteinte, le harnais le DIT, en énumérant ce qu'il a vu :
/// un arbre muet ne doit jamais laisser un témoin d'absence conclure au vert, et
/// un message qui dit « muet » sans dire ce qu'il a trouvé force une itération de
/// plus. C'est ce diagnostic-là — « racine 402 × 874, huit sous-vues, zéro
/// élément a11y » — qui a nommé la vraie cause en un seul run.
///
@MainActor
final class RenderedScreen {

    /// Un nœud de l'arbre rendu, vu par les deux chemins que SwiftUI alimente.
    struct Node {
        let identifier: String?
        let label: String?
    }

    /// La vue racine de l'hôte — le point d'entrée de toute descente.
    let root: UIView

    private var window: UIWindow?

    /// Monte `vue` dans une fenêtre RÉELLE et rend la main quand l'arbre parle.
    ///
    /// La fenêtre n'est pas une précaution, c'est une CONDITION : hors fenêtre,
    /// `UIHostingController` ne matérialise pas toute sa hiérarchie et l'arbre
    /// parcouru serait muet — vert par omission garanti. Elle se rattache à la
    /// `UIWindowScene` active quand il y en a une, une fenêtre sans scène se
    /// matérialisant inégalement selon la version d'iOS.
    ///
    /// - Parameter borne: temps maximal accordé à SwiftUI pour parler. Dépassée,
    ///   le montage échoue explicitement plutôt que de rendre un arbre muet.
    /// **L'arbre d'accessibilité n'existe que si un CLIENT le réclame.**
    ///
    /// UIKit ne le construit pas tant qu'aucun client d'accessibilité n'est
    /// actif : `accessibilityElementCount()` rend alors `0` sur une hiérarchie
    /// pourtant ENTIÈREMENT rendue. Mesuré sur un simulateur iOS 18.2 créé à
    /// neuf, la racine faisait ses 402 × 874 avec ses huit sous-vues, et l'arbre
    /// d'accessibilité était vide.
    ///
    /// C'est ce qui séparait la CI d'une machine de développement, et rien
    /// d'autre : un simulateur `simctl create` neuf n'a jamais eu de client
    /// a11y, tandis qu'un simulateur de travail en a gardé un d'un passage de
    /// l'Accessibility Inspector ou d'un test UI — un réglage qui PERSISTE dans
    /// l'appareil. Sept témoins étaient donc verts chez tout le monde et rouges
    /// chez le seul hôte qui n'avait pas ce passé.
    ///
    /// Le harnais pose la condition LUI-MÊME, dans son propre processus, plutôt
    /// que de l'hériter de l'état de l'appareil : un témoin qui dépend d'un
    /// réglage que personne ne déclare n'est pas reproductible, et il ment dans
    /// le sens le plus coûteux — vert là où on le regarde, rouge là où on ne
    /// regarde pas.
    ///
    /// `_AXSSetAutomationEnabled` est le levier qu'XCUITest actionne pour la
    /// même raison ; on l'atteint par `dlsym` parce qu'il n'a pas d'en-tête
    /// public. Un échec est SILENCIEUX à dessein — sur un hôte où l'arbre existe
    /// déjà, il n'y a rien à activer, et l'attente conditionnelle du montage
    /// dira de toute façon si l'arbre parle.
    private static let arbreAccessibiliteActive: Bool = {
        guard let handle = dlopen("/usr/lib/libAccessibility.dylib", RTLD_NOW) else { return false }
        defer { dlclose(handle) }
        guard let symbole = dlsym(handle, "_AXSSetAutomationEnabled") else { return false }
        typealias Bascule = @convention(c) (Bool) -> Void
        unsafeBitCast(symbole, to: Bascule.self)(true)
        return true
    }()

    init(
        _ vue: some View,
        size: CGSize = CGSize(width: 402, height: 874),
        borne: TimeInterval = 10,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        _ = RenderedScreen.arbreAccessibiliteActive
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        let window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: .zero)
        window.frame = CGRect(origin: .zero, size: size)

        let host = UIHostingController(rootView: vue)
        window.rootViewController = host
        window.isHidden = false
        window.makeKeyAndVisible()
        host.view.frame = CGRect(origin: .zero, size: size)
        window.setNeedsLayout()
        window.layoutIfNeeded()
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()

        self.window = window
        self.root = host.view

        let aParle = RenderedScreen.attendre(borne: borne) {
            RenderedScreen.noeuds(host.view).contains { $0.label != nil || $0.identifier != nil }
        }
        if !aParle {
            let etats = scenes.map { "\($0.activationState.rawValue)" }.joined(separator: ",")
            XCTFail(
                """
                L'arbre rendu est resté MUET \(borne) s après le montage : ni libellé ni \
                identifiant. Tout témoin d'absence serait vert par omission.
                Ce que le harnais a vu — scènes: \(scenes.count) [états \(etats)] · \
                fenêtre rattachée: \(scene != nil) · clé: \(window.isKeyWindow) · \
                racine \(host.view.bounds.size) · \
                sous-vues: \(host.view.subviews.count) · \
                éléments a11y: \(host.view.accessibilityElementCount())
                """,
                file: file,
                line: line
            )
        }
    }

    /// À appeler depuis `tearDown` : une fenêtre laissée clé retient son hôte.
    func dismount() {
        window?.rootViewController = nil
        window?.isHidden = true
        window = nil
    }

    // MARK: - Ce que l'écran dit

    /// Tout ce que l'écran ANNONCE, dans l'ordre de l'arbre.
    var labels: [String] { RenderedScreen.noeuds(root).compactMap(\.label) }

    /// Tous les identifiants POSÉS, dans l'ordre de l'arbre.
    var identifiers: [String] { RenderedScreen.noeuds(root).compactMap(\.identifier) }

    /// Le nœud portant cet identifiant, s'il est rendu.
    func node(_ identifier: String) -> Node? {
        RenderedScreen.noeuds(root).first { $0.identifier == identifier }
    }

    /// L'écran prononce-t-il ce fragment, où que ce soit ?
    func says(_ fragment: String) -> Bool {
        labels.contains { $0.contains(fragment) }
    }

    // MARK: - La descente

    /// Les éléments d'accessibilité d'un objet — la liste explicite quand elle
    /// existe, sinon l'API indexée que SwiftUI implémente réellement.
    private static func elements(de objet: NSObject) -> [NSObject] {
        if let listes = objet.accessibilityElements as? [NSObject], !listes.isEmpty { return listes }
        let compte = objet.accessibilityElementCount()
        guard compte != NSNotFound, compte > 0 else { return [] }
        return (0..<compte).compactMap { objet.accessibilityElement(at: $0) as? NSObject }
    }

    private static func noeuds(_ objet: NSObject, profondeur: Int = 0) -> [Node] {
        guard profondeur < 60 else { return [] }
        // Les éléments que SwiftUI synthétise ne DÉCLARENT pas
        // `UIAccessibilityIdentification` : le cast échouait en silence et rendait
        // `nil` pour tout l'arbre, alors que les objets répondent bien au
        // sélecteur. On interroge donc la réponse, pas le type.
        let identifier: String? = objet.responds(to: Selector(("accessibilityIdentifier")))
            ? objet.value(forKey: "accessibilityIdentifier") as? String
            : nil
        var trouves = [Node(identifier: identifier, label: objet.accessibilityLabel)]
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

    /// Attend une CONDITION plutôt qu'une durée — voir le doc-comment du type.
    ///
    /// Le pas de 0,05 s laisse le RunLoop principal traiter le layout et la
    /// construction de l'arbre d'accessibilité entre deux vérifications ; la
    /// condition est réévaluée une dernière fois à l'échéance, pour qu'un arbre
    /// qui parle à la toute fin ne soit pas déclaré muet.
    private static func attendre(borne: TimeInterval, _ condition: () -> Bool) -> Bool {
        let echeance = Date().addingTimeInterval(borne)
        while Date() < echeance {
            if condition() { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.05))
        }
        return condition()
    }
}
