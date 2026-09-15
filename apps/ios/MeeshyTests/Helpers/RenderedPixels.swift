import SwiftUI
import UIKit
import XCTest
@testable import Meeshy

/// **LES PIXELS RENDUS — la seule preuve qu'une peinture atteint l'écran.**
///
/// Jumelle de `RenderedScreen`, qui interroge ce que l'écran ANNONCE (arbre
/// d'accessibilité). Celui-ci interroge ce que l'écran PEINT.
///
/// Il existe parce que la vague précédente a mesuré le coût de son absence : sur
/// le lot de la bande du haut (#6579), treize témoins sont restés VERTS avec la
/// bande à `.opacity(0)` — elle ne peignait plus un seul pixel — et trente-trois
/// sont restés verts avec la remontée du contexte audio neutralisée, c'est-à-dire
/// avec l'écran exact que le porteur avait photographié rendu sans sa bande. Huit
/// de ces témoins étaient des lectures de SOURCE : elles constatent qu'un motif
/// est ÉCRIT, jamais qu'il PEINT.
///
/// ## Les quatre conditions que ce harnais tient
///
/// **1 — La fenêtre doit être PLEIN ÉCRAN et rattachée à la scène.** Ce n'est pas
/// une précaution : `safeAreaInsets` d'une `UIWindow(frame:)` posée à une taille
/// arbitraire ne vaut pas celle de l'appareil, et tout ce qui se mesure contre
/// l'encart haut — la bande du chrome, précisément — deviendrait alors une mesure
/// de la fenêtre de test, pas de l'app.
///
/// **2 — Une vue hors fenêtre ne matérialise pas sa hiérarchie**, donc ne peint
/// rien. Même raison que pour `RenderedScreen`.
///
/// **3 — Un cycle de vie SwiftUI complet, pas un instantané.** `ImageRenderer`
/// évalue le `body` mais n'attache rien : `onAppear` ne tire pas, `onChange` non
/// plus. Or la bande du chrome haut n'existe QUE si `MiniAudioPlayerBar` a remonté
/// son contexte affiché par `onAppear` — un `ImageRenderer` la déclarerait absente
/// sur du code parfaitement juste. Le montage se fait donc dans une vraie fenêtre,
/// et la capture passe par `drawHierarchy(afterScreenUpdates:)`.
///
/// **4 — Attendre une CONDITION, jamais une durée.** Une attente fixe est un pari
/// sur la vitesse de la machine. `settle(until:)` rend la main dès que la
/// condition passe ; pour un témoin d'ABSENCE, on attend d'abord la présence d'un
/// TÉMOIN-ANCRE (une couleur sentinelle que la composition peint à coup sûr) —
/// sans quoi l'absence mesurée serait celle d'une frame pas encore peinte.
/// **5 — L'hôte doit être OPAQUE, et ce n'est pas une coquetterie.**
/// `drawHierarchy(in:afterScreenUpdates: true)` passe par un instantané du
/// SERVEUR DE RENDU puis découpe : là où la vue ne peint rien, ce sont les
/// fenêtres du DESSOUS qui remontent dans le bitmap — celle du témoin PRÉCÉDENT
/// comprise. Mesuré le 2026-09-15, en éprouvant ce fichier par la mutation du
/// contrôleur : bande à `.opacity(0)`, le témoin phare restait VERT parce qu'il
/// relisait la bande du témoin d'avant à travers un hôte transparent. Un fond
/// opaque ferme ce canal, et donne au passage une couleur NOMMÉE à « rien n'est
/// peint ici ».
///
/// **6 — La composition ne doit pas être l'enfant RACINE.** SwiftUI ÉTEND
/// automatiquement dans l'encart système le fond du premier enfant d'un
/// conteneur posé à la racine d'un `UIHostingController`. Mesuré : un simple
/// `Color.clear.frame(height: 64).background(indigo)` en tête d'un `VStack`
/// racine peint `y=0` — SANS aucune bande. Un harnais bâti ainsi rendrait tout
/// témoin de bande VERT pour la peinture de la BARRE, ce que la mutation
/// `.opacity(0)` a démasqué. L'app, elle, n'a jamais ce comportement : la
/// composition y vit sous `RootThemedBackground`, un sol plein bord. Le harnais
/// pose donc le même sol — c'est une condition de FIDÉLITÉ, pas une précaution.
///
/// **7 — Le harnais doit garder la grandeur QUI GOUVERNE, jamais sa voisine.**
/// La bande se dimensionne sur `DeviceLayout.safeAreaTop`, qui ne rend l'encart
/// que si une scène est `.foregroundActive` — sinon **0**. Ce fichier gardait
/// `window.safeAreaInsets.top`, l'encart que la FENÊTRE déclare : deux valeurs
/// distinctes, qui coïncident tant que l'app tient le premier plan et divergent
/// dès qu'elle le perd. Mesuré le 2026-09-15 : app déplacée du premier plan,
/// `activationState` passe 0 → 1 → 2, `DeviceLayout.safeAreaTop` tombe à 0
/// pendant que `window.safeAreaInsets.top` reste à 62 ; la bande fait alors 0 pt
/// de haut, ne peint rien, et **27 assertions de six témoins accusent la bande**
/// sur du code parfaitement juste — la garde d'alors ne pouvant pas tomber,
/// puisqu'elle interrogeait la valeur restée bonne.
///
/// C'est la leçon du lot #6579 retournée contre son propre harnais : *un témoin
/// qui ne mesure pas la quantité gouvernant ce qu'il observe ne mesure rien.*
/// La garde interroge donc désormais `DeviceLayout.safeAreaTop`, et un
/// environnement qui ne peut pas la fournir se solde par un `XCTSkip` qui accuse
/// l'ENVIRONNEMENT — pas la bande. Le skip est dans la SIGNATURE (`init` est
/// `throws`) : on ne peut pas obtenir un `RenderedPixels` là où la mesure n'a
/// pas de sens, donc aucun témoin futur ne peut oublier la garde.
@MainActor
final class RenderedPixels {

    /// Le fond opaque de l'hôte : ce que porte un point où la composition ne
    /// peint rien. Distinct de tout indigo de chrome.
    static let fondVide = Color(.sRGB, red: 1, green: 1, blue: 1, opacity: 1)

    /// La vue racine de l'hôte, aux dimensions de la fenêtre — encart système
    /// COMPRIS : c'est dans cette bande-là que la bande du chrome se peint.
    let root: UIView

    /// L'encart haut **que la production lit** : `DeviceLayout.safeAreaTop`, la
    /// grandeur qui donne sa hauteur à la bande — jamais `window.safeAreaInsets`,
    /// qui en est la voisine et ne tombe pas quand elle tombe (condition 7).
    let safeAreaTop: CGFloat

    private var window: UIWindow?
    private var octets: [UInt8] = []
    private var largeur = 0
    private var hauteur = 0

    init(
        _ vue: some View,
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        let taille = scene?.screen.bounds.size ?? CGSize(width: 393, height: 852)
        let window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: .zero)
        window.frame = CGRect(origin: .zero, size: taille)

        // Conditions 5 ET 6 (voir l'en-tête) : un SOL plein bord sous la
        // composition. Il ferme la remontée des fenêtres du dessous, et il
        // reproduit `RootThemedBackground` — sans lui, la composition serait
        // l'enfant RACINE, et SwiftUI étendrait alors son premier fond dans
        // l'encart système, peignant la bande à la place de la bande.
        let racine = ZStack {
            RenderedPixels.fondVide.ignoresSafeArea()
            vue
        }
        let host = UIHostingController(rootView: racine)
        window.rootViewController = host
        window.backgroundColor = UIColor(RenderedPixels.fondVide)
        window.isOpaque = true
        window.isHidden = false
        window.makeKeyAndVisible()
        host.view.frame = CGRect(origin: .zero, size: taille)
        host.view.backgroundColor = UIColor(RenderedPixels.fondVide)
        host.view.isOpaque = true
        window.setNeedsLayout()
        window.layoutIfNeeded()

        self.window = window
        self.root = host.view

        // CONDITION 7 — la garde interroge `DeviceLayout.safeAreaTop`, la
        // grandeur dont la bande tient sa hauteur, et NON l'encart de la fenêtre.
        // Une scène peut n'être `.foregroundActive` que par intermittence (fin
        // d'activation au démarrage du bundle, alerte système refermée) : on lui
        // laisse une fenêtre BORNÉE de revenir avant de renoncer. L'attente ne
        // coûte rien quand la condition tient déjà, et elle ne peut pas rendre un
        // témoin indulgent — elle décide de MESURER ou de NE PAS mesurer, jamais
        // d'un verdict.
        var insetProduction = DeviceLayout.safeAreaTop
        if insetProduction <= 0 {
            let echeance = Date().addingTimeInterval(1)
            while Date() < echeance, insetProduction <= 0 {
                RunLoop.current.run(until: Date().addingTimeInterval(0.05))
                insetProduction = DeviceLayout.safeAreaTop
            }
        }
        self.safeAreaTop = insetProduction

        let insetFenetre = window.safeAreaInsets.top
        let etats = UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.activationState.rawValue }
            .map(String.init)
            .joined(separator: ",")

        guard insetProduction > 0 else {
            dismount()
            throw XCTSkip(
                """
                ENVIRONNEMENT — aucune scène n'est au premier plan : \
                `DeviceLayout.safeAreaTop` rend \(insetProduction), ce témoin ne \
                mesure rien ici. Ce n'est PAS un verdict sur la bande du chrome : \
                la fenêtre de test déclare bien son encart (\(insetFenetre) pt), \
                mais `DeviceLayout` ne lit que la scène `.foregroundActive` \
                (états observés : [\(etats)] — 0 = actif, 1 = inactif, 2 = arrière-plan). \
                La bande se dimensionne sur cette valeur : à 0 elle est haute de \
                zéro et ne peint pas un pixel, sur du code parfaitement juste. \
                Cause habituelle : l'app hôte a été déplacée du premier plan de son \
                appareil pendant la suite (une autre app lancée dessus, une alerte \
                système, un `simctl launch` d'une session voisine). Remède : relancer \
                la suite avec l'hôte au premier plan de SON simulateur.
                """,
                file: file, line: line
            )
        }

        guard abs(insetProduction - insetFenetre) < 0.5 else {
            dismount()
            throw XCTSkip(
                """
                ENVIRONNEMENT — la production et le harnais ne mesurent pas la \
                même fenêtre : `DeviceLayout.safeAreaTop` = \(insetProduction) pt, \
                encart de la fenêtre montée = \(insetFenetre) pt. Les coordonnées \
                des témoins se calculent sur l'une et la bande se peint sur \
                l'autre : aucun verdict n'est recevable. Cause habituelle : une \
                fenêtre laissée CLÉ par un témoin précédent qui n'a pas appelé \
                `dismount()`. Scènes : \(scenes.count) · états [\(etats)] · \
                notre fenêtre est clé : \(window.isKeyWindow).
                """,
                file: file, line: line
            )
        }
    }

    /// À appeler depuis `tearDown` : une fenêtre laissée clé retient son hôte.
    func dismount() {
        window?.rootViewController = nil
        window?.isHidden = true
        window = nil
    }

    // MARK: - Attente

    /// Laisse tourner la boucle principale jusqu'à ce que `condition` passe, en
    /// recapturant l'image entre deux essais. Rend `true` si elle a passé.
    @discardableResult
    func settle(borne: TimeInterval = 5, until condition: () -> Bool) -> Bool {
        let echeance = Date().addingTimeInterval(borne)
        while Date() < echeance {
            capture()
            if condition() { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.05))
        }
        capture()
        return condition()
    }

    /// Même attente, SANS capture — pour une condition qui n'interroge pas les
    /// pixels (ce qu'une vue a remis à son hôte, par exemple).
    ///
    /// `drawHierarchy(afterScreenUpdates: true)` force une transaction
    /// CoreAnimation complète à chaque appel : la facturer vingt fois par seconde
    /// à une condition qui ne la lit pas a fait passer un témoin de 2 s à 60 s.
    @discardableResult
    func attendre(borne: TimeInterval = 3, until condition: () -> Bool) -> Bool {
        let echeance = Date().addingTimeInterval(borne)
        while Date() < echeance {
            if condition() { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.02))
        }
        return condition()
    }

    // MARK: - Capture

    /// Rend la hiérarchie VISIBLE dans un bitmap sRGB à l'échelle 1 — un pixel
    /// par point, ce qui rend les coordonnées des témoins lisibles en points.
    func capture() {
        let bounds = root.bounds
        guard bounds.width > 0, bounds.height > 0 else { return }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let image = UIGraphicsImageRenderer(bounds: bounds, format: format).image { _ in
            root.drawHierarchy(in: bounds, afterScreenUpdates: true)
        }
        guard let cg = image.cgImage else { return }
        let w = cg.width
        let h = cg.height
        var buffer = [UInt8](repeating: 0, count: w * h * 4)
        guard let ctx = CGContext(
            data: &buffer,
            width: w, height: h,
            bitsPerComponent: 8,
            bytesPerRow: w * 4,
            space: CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        octets = buffer
        largeur = w
        hauteur = h
    }

    // MARK: - Lecture

    /// La composante sRGB du pixel au point (`x`, `y`), origine en haut à gauche.
    func rgb(x: Int, y: Int) -> (r: Int, g: Int, b: Int) {
        guard largeur > 0, hauteur > 0,
              x >= 0, y >= 0, x < largeur, y < hauteur else { return (-1, -1, -1) }
        let i = (y * largeur + x) * 4
        return (Int(octets[i]), Int(octets[i + 1]), Int(octets[i + 2]))
    }

    /// La PREMIÈRE ligne, de haut en bas, où la colonne `x` porte `couleur` —
    /// `nil` si la couleur n'y est nulle part. C'est ainsi qu'on mesure jusqu'où
    /// une vue MONTE, plutôt que d'inférer sa géométrie de son modificateur.
    func premiereLigne(x: Int, matching couleur: Color, tolerance: Int = 6) -> Int? {
        guard hauteur > 0 else { return nil }
        for y in 0..<hauteur where pixel(x, y, matches: couleur, tolerance: tolerance) {
            return y
        }
        return nil
    }

    func hex(x: Int, y: Int) -> String {
        let p = rgb(x: x, y: y)
        guard p.r >= 0 else { return "(hors cadre)" }
        return String(format: "#%02X%02X%02X", p.r, p.g, p.b)
    }

    /// `true` si le pixel vaut `couleur` à `tolerance` unités près par canal.
    ///
    /// La tolérance n'est pas de la complaisance : un aplat composité par
    /// CoreAnimation puis reprojeté en sRGB dérive d'une unité ou deux (mesuré :
    /// `#4F46E5` rendu `#4F45E4`). Elle reste très en deçà de ce qui sépare les
    /// couleurs que ces témoins doivent distinguer — 13 unités entre `indigo600`
    /// et le milieu du dégradé qu'il remplace, 23 unités avec son bord droit.
    func pixel(_ x: Int, _ y: Int, matches couleur: Color, tolerance: Int = 6) -> Bool {
        let attendu = RenderedPixels.srgb(couleur)
        let obtenu = rgb(x: x, y: y)
        guard obtenu.r >= 0 else { return false }
        return abs(obtenu.r - attendu.r) <= tolerance
            && abs(obtenu.g - attendu.g) <= tolerance
            && abs(obtenu.b - attendu.b) <= tolerance
    }

    /// Les composantes sRGB d'une `Color` SwiftUI, sur 0…255.
    static func srgb(_ couleur: Color) -> (r: Int, g: Int, b: Int) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(couleur).getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Int((r * 255).rounded()), Int((g * 255).rounded()), Int((b * 255).rounded()))
    }

    static func hex(_ couleur: Color) -> String {
        let c = srgb(couleur)
        return String(format: "#%02X%02X%02X", c.r, c.g, c.b)
    }
}
