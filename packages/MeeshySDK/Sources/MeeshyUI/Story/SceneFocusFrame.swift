import SwiftUI

/// **Montrer une ZONE d'une scène 9:16, à la taille d'une carte de fil.**
///
/// `SceneFraming` dit QUELLE zone ; ce cadre la met à l'échelle. Les deux sont
/// séparés parce qu'ils répondent à deux questions et se testent autrement :
/// la règle est arithmétique et s'éprouve sans écran ; ce cadre est une
/// transformation de vue et ne s'éprouve qu'en le regardant.
///
/// ## Ce qu'il fait, et ce qu'il ne fait pas
///
/// Il **agrandit** la scène jusqu'à ce que la zone remplisse la carte, puis la
/// **décale** pour amener la zone à l'origine, et **rogne**. La scène rendue
/// reste donc entière et intacte — c'est le CADRAGE qui bouge, jamais le
/// contenu. Un lecteur qui ouvre le plein écran retrouve la scène complète,
/// et l'export n'en sait rien.
///
/// > **Ne jamais recomposer la scène pour la cadrer.** Redessiner un canvas
/// > « à plat » pour le fil produirait une seconde vérité visuelle, à tenir
/// > d'accord avec la première — c'est ce que la loi 6 interdit à l'aperçu du
/// > composer, et le fil n'a pas de raison d'y échapper.
///
/// La carte doit adopter `SceneFraming.cardAspect(...)` : sans quoi le cadre
/// remplit une boîte au mauvais rapport et rogne de nouveau ce qu'il venait de
/// choisir.
public struct SceneFocusFrame<Contenu: View>: View {

    /// La zone à montrer, en fractions de la scène. `nil` ⇒ la scène entière,
    /// et le cadre s'efface complètement : aucune couche, aucun rognage, aucun
    /// coût pour les cartes qui n'en ont pas besoin.
    public let focus: CGRect?
    @ViewBuilder public let contenu: () -> Contenu

    public init(focus: CGRect?, @ViewBuilder contenu: @escaping () -> Contenu) {
        self.focus = focus
        self.contenu = contenu
    }

    public var body: some View {
        if let focus, focus.width > 0, focus.height > 0 {
            GeometryReader { geo in
                // **La zone COUVRE la boîte — elle ne s'y ajuste pas.**
                //
                // Une première version calait la zone sur la seule LARGEUR.
                // Vu au simulateur : dans une tuile de mosaïque, dont le
                // rapport vient de la GÉOMÉTRIE quand celui de la zone vient du
                // CONTENU, les deux ne coïncident pas — et la scène laissait
                // paraître le fond de la tuile en bas et sur les bords.
                //
                // > Une fenêtre de cadrage se comporte comme un `.fill`, jamais
                // > comme un `.fit` : elle montre la zone en entier ET remplit
                // > ce qu'on lui donne, quitte à déborder sur les côtés. Un
                // > `.fit` laisse du vide, et du vide dans un cadrage est
                // > exactement ce qu'on venait retirer.
                //
                // L'arithmétique est `SceneFraming.placement` : pure, pour
                // qu'une carte se vérifie sans écran (#6708). Une boîte plus
                // HAUTE que la zone agrandit la scène — l'hôte doit donc lui
                // donner le rapport de la zone.
                let scene = SceneFraming.placement(of: focus, covering: geo.size)
                contenu()
                    .frame(width: scene.width, height: scene.height)
                    .offset(x: scene.minX, y: scene.minY)
                    .frame(width: geo.size.width, height: geo.size.height,
                           alignment: .topLeading)
                    .clipped()
            }
        } else {
            contenu()
        }
    }
}
