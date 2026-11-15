import QuartzCore

// **Le FANTÔME de la frise** (#8370, lot 6 — maquette
// `docs/product/composer-plein-ecran/Main.dc.html` : hors de sa fenêtre, un
// objet est caché en lecture et « fantôme » à .25 à l'arrêt). Seul l'aperçu du
// composer à l'arrêt passe `outOfWindowGhostOpacity` ; le lecteur et l'export
// gardent `nil` — l'objet n'y existe pas.
extension StoryRenderer {

    static let ghostKey = "meeshy.timeline.ghost"

    /// Pose le fantôme en ABSOLU, et le RETIRE d'une couche réutilisée par le
    /// cache qui rentre dans sa fenêtre : sans ce retrait, un objet revenu à
    /// l'écran garderait l'opacité .25 du tick précédent. Le retrait rend
    /// l'opacité pleine ; les post-passes de fondu ou de pose, qui l'écrivent
    /// en absolu, repassent au tick suivant.
    static func applyGhost(_ ghost: Float?, inWindow: Bool, to layer: CALayer) {
        if !inWindow, let ghost {
            layer.opacity = ghost
            layer.setValue(true, forKey: ghostKey)
        } else if layer.value(forKey: ghostKey) as? Bool == true {
            layer.opacity = 1
            layer.setValue(nil, forKey: ghostKey)
        }
    }
}
