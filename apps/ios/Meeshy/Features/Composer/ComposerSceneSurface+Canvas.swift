import SwiftUI
import AVFoundation
import MeeshySDK
import MeeshyUI

extension ComposerSceneSurface {

    /// **La scène est le plus grand 9:16 de la zone** (#13839) : ni carte ni
    /// couloir, et elle descend sous le socle, qui se pose dessus. Le clavier
    /// ou une feuille la RÉDUISENT par une échelle ancrée en haut et un décalage —
    /// une seule transaction, sans nouvelle mise en page du canvas : aucun
    /// objet ne saute pendant le geste (`ComposerSceneFit`).
    var sceneLayer: some View {
        GeometryReader { geo in
            let zone = ComposerSceneFit.zone(in: geo.size, aspectRatio: aspectRatio)
            let scene = ComposerSceneFit.frame(in: zone, aspectRatio: aspectRatio)
            let lift = ComposerSceneFit.lift(scene: scene, visibleBottom: visibleBottom(in: geo))
            sceneCanvas
                .frame(width: zone.width, height: zone.height)
                .scaleEffect(lift.scale,
                             anchor: UnitPoint(x: 0.5, y: zone.height > 0 ? (scene.minY - zone.minY) / zone.height : 0))
                .offset(y: zone.minY + lift.offsetY)
                .animation(keyboard.liftAnimation(reduceMotion: reduceMotion, now: Date()), value: lift)
                .preference(key: ComposerSceneDrawnOriginKey.self,
                            value: CGPoint(x: ComposerRestChrome.sceneSideInset(layer: geo.frame(in: .global),
                                                                                aspectRatio: aspectRatio,
                                                                                scale: lift.scale),
                                           y: ComposerRestChrome.sceneTop(layer: geo.frame(in: .global),
                                                                          aspectRatio: aspectRatio,
                                                                          offsetY: lift.offsetY)))
        }
        .padding(ComposerSceneRailsInsets.insets(arrangement: arrangement, showsSlideRow: showsRailsSlideRow))
        .ignoresSafeArea(.container, edges: arrangement == .rails ? [] : .bottom)
        .ignoresSafeArea(.keyboard)
        .allowsHitTesting(timelinePanel == nil)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)) {
            keyboardMoved($0)
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) {
            keyboardMoved($0, hidden: true)
        }
    }

    /// **La scène se réduit DANS le mouvement du clavier** (#13839, L4) : la
    /// durée et la courbe de la notification, sinon son propre ressort.
    private func keyboardMoved(_ note: Notification, hidden: Bool = false) {
        keyboard.moved(duration: note.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double,
                       endFrame: note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect,
                       windowFrame: WindowMetrics.activeWindowFrameInScreen, hidden: hidden, at: Date())
    }

    /// Le bas visible de la scène, dans son propre repère : le haut des étages
    /// du bas — celui du repos sous un étage posé par-dessus (#15226) —, sinon
    /// le bas de la zone. Une feuille ancrée du meuble borne aussi la scène
    /// (#13839, L3) : le plus haut des obstacles gagne (`ComposerSceneFraming`).
    private func visibleBottom(in geo: GeometryProxy) -> CGFloat {
        let panneau = ComposerSceneLift.floorTop(measured: freeZoneFrame.isNull ? nil : freeZoneFrame.maxY,
                                                 rest: restFloorTop, overlaid: sceneIsOverlaid)
        // La barre et le clavier — ou le panneau qui le remplace, de la même
        // hauteur — bornent la scène pendant qu'on écrit SUR elle.
        let clavier: CGFloat? = editingTextId != nil ? keyboard.top : nil
        return ComposerSceneFraming.visibleBottom(zoneHeight: geo.size.height,
                                                  zoneMinY: geo.frame(in: .global).minY,
                                                  obstructionTops: [panneau, anchoredSheetTop, clavier])
    }

    private var sceneCanvas: some View {
        EmbeddedSceneCanvas(
            slide: $slide,
            aspectRatio: aspectRatio,
            cornerRadius: MeeshyRadius.xlPlus,
            // **Le dessin se pose DANS la carte, pas sur le cadre** : un
            // trait hors du canvas est perdu à la publication.
            canvasOverlay: drawingSurface,
            // Les sons posés sur la scène — retirés pendant le dessin,
            // dont le calque prend la carte entière.
            objectOverlay: drawingSurface == nil
                ? { taille in AnyView(ComposerSceneSoundChips(
                    slide: $slide, canvasSize: taille, selectedItemId: selectedItemId,
                    onItemTapped: onItemTapped, onItemMenu: onItemMenu)) }
                : nil,
            onItemTapped: onItemTapped,
            onItemDoubleTapped: onItemEdit,
            editableKinds: editableSceneKinds,
            onBackgroundTapped: onBackgroundTapped,
            onBackgroundLongPressed: onBackgroundLongPressed,
            onBackgroundMediaLongPressed: onBackgroundMediaLongPressed,
            onBackgroundLongPressChanged: onBackgroundLongPressChanged,
            onBackgroundLongPressEnded: onBackgroundLongPressEnded,
            loadedImages: sceneImages,
            loadedStickerAnimations: sceneStickerAnimations,
            loadedImagesVersion: sceneImagesVersion,
            // Le canvas retire son calque de dessin persisté pendant qu'une
            // surface live est posée dessus — sinon le trait s'affiche deux fois.
            isDrawingOverlayActive: drawingSurface != nil,
            editingTextId: editingTextId,
            onInlineTextChanged: onInlineTextChanged,
            onInlineTextEditEnded: onInlineTextEditEnded,
            // « Un seul objet à la fois » a son témoin sur la scène.
            selectedItemId: selectedItemId,
            selectionBadge: selectionBadge,
            timelineBridge: timelineBridge,
            onItemTrimRequested: onItemTrim,
            onItemMenuRequested: onItemMenu,
            localMediaAliases: sceneLocalMediaAliases,
            inlineEditInputLink: inlineEditInputLink
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .modifier(ComposerIntakeLayer(ghost: intakeGhost, blocks: intakeBlocks, aspectRatio: aspectRatio))
        .overlay { ComposerSceneHints(quickCapture: quickCaptureHint, quoted: quotedPublication, aspectRatio: aspectRatio) }
        // **La surface PUBLIE la place du viseur, elle ne le peint pas.**
        // Le meuble le monte une seule
        // fois ; `Color.clear` + `aspectRatio(.fit)` reproduit exactement le
        // rectangle du dessin dans le repère où la carte se cadre.
        .overlay {
            Color.clear
                .aspectRatio(aspectRatio, contentMode: .fit)
                .anchorPreference(key: ComposerSceneCameraFrameKey.self,
                                  value: .bounds) { $0 }
                .background {
                    GeometryReader { geo in
                        Color.clear.preference(key: ComposerSceneCardFrameKey.self, value: geo.frame(in: .global))
                    }
                }
                .allowsHitTesting(false)
        }
        // **Le bord gauche du DESSIN, mesuré ici et remonté** : la
        // trace du son et le pied des références s'alignent sur la carte, qui
        // se centre dans le viewport et n'en touche le bord que si la largeur la
        // contraint.
        .background {
            GeometryReader { geo in
                let bordGauche = ComposerRailGeometry.sceneLeadingInset(overlay: geo.size,
                                                                        ratio: aspectRatio,
                                                                        horizontalInset: 0)
                Color.clear
                    .preference(key: ComposerSceneCardLeadingKey.self, value: bordGauche + railLaneLeading)
                    // La carte se CENTRE : sa largeur est ce que les deux bords
                    // lui laissent. Le volet en proportionne sa flèche.
                    .preference(key: ComposerSceneCardWidthPreferenceKey.self,
                                value: max(0, geo.size.width - 2 * bordGauche))
            }
        }
    }
}
