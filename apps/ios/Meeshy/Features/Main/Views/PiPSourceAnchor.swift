//
//  PiPSourceAnchor.swift
//  Meeshy
//
//  Ancre servant de `sourceView` au PiP système : le rect d'où la fenêtre
//  flottante émerge, et — c'est le point non évident — la vue dont AVKit lit
//  « layout frame and visibility » pour décider de démarrer automatiquement le
//  PiP au passage en arrière-plan.
//
//  Elle est montée à DEUX endroits, et c'est délibéré (lot C, C1) :
//
//  • `CallView` — plein écran. Le `fullScreenCover` qui la porte est démonté dès
//    que l'appel est réduit ; `pipConfiguredSource` étant `weak`, il passe alors
//    à nil et plus rien ne reconfigure. Un appel réduit ne pouvait donc PLUS
//    ouvrir de PiP, ce qui est précisément le geste qui devrait le déclencher.
//  • `CallParticipantVisual` — pilule et bulle. Le flux distant y est déjà rendu
//    à l'écran quand la caméra du pair est allumée : c'est une ancre visible et
//    correctement dimensionnée, pas un rect dégénéré.
//
//  Déplacer l'ancre dans `RootView` au lieu d'en avoir deux échangerait un
//  défaut contre un autre : le `fullScreenCover` présente en
//  `UIModalPresentationFullScreen`, UIKit détache la hiérarchie présentante, et
//  l'ancre serait hors fenêtre pendant que `CallView` est affichée — le bouton
//  PiP manuel resterait alors visible et inerte au tap.
//
//  La cohabitation n'est sûre que grâce à `CallPiPPolicy.shouldReconfigure`, qui
//  refuse toute reconfiguration pendant qu'une fenêtre PiP est active :
//  `PiPCallController.configure()` commence par `tearDown()`.
//

import SwiftUI
import UIKit

struct PiPSourceAnchor: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        CallManager.shared.attachSystemPiP(sourceView: uiView)
    }
}
