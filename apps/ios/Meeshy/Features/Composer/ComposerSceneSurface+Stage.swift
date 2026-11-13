import SwiftUI
import AVFoundation
import MeeshySDK
import MeeshyUI

/// **Le calque de la SCÈNE**, sorti de `ComposerSceneSurface` (budget de taille) : le sol,
/// la couche cadrée, le canvas et le calque de chrome.
extension ComposerSceneSurface {

    /// **Le SOL de la scène : le thumbhash de son propre résultat** (directive
    /// porteur : « la scène doit avoir un sol peint en thumbhash du
    /// résultat de la scène »).
    ///
    /// Une scène 9:16 est moins haute qu'un iPhone, et elle se cadre entre la
    /// barre haute et le socle : ce qu'elle laisse du viewport n'est pas un
    /// plateau, c'est son SOL — la loi du lecteur (`SceneBackdropView`,
    /// `.thumbHash`), peinte du hachage du COMPOSITE de la slide, ce que la
    /// publication emportera. Le composer et le lecteur posent ainsi la même
    /// scène sur le même sol.
    ///
    /// Tapable comme le fond du canvas, dont il prolonge l'apparence ; inerte
    /// pendant un tracé, qui possède l'écran entier.
    var sceneLetterbox: some View {
        // **Le sol est BORNÉ par un calque neutre** : en dessin, les
        // contrôleurs ne doivent pas « s'étirer et sortir » du viewport.
        // `SceneBackdropView` peint le thumbhash en `.scaledToFill()` et laisse
        // l'hôte clipper : une image en fill ANNONCE la taille de son
        // remplissage, plus large que l'écran dès que son rapport diffère —
        // et le calque de la surface s'élargissait d'autant, emportant la
        // croix, la carte et les pinceaux hors de l'écran. `Color.clear`
        // prend la taille proposée ; l'`overlay` ne peut plus la changer.
        Color.clear
            .overlay {
                if let teinte = ComposerSceneFloorRules.backdropColor(slide: slide) {
                    teinte
                } else {
                    SceneBackdropView(backdrop: .thumbHash, thumbHash: floorHash)
                }
            }
            .clipped()
            .ignoresSafeArea()
            .contentShape(Rectangle())
            .onTapGesture { onBackgroundTapped?() }
            .allowsHitTesting(drawingSurface == nil && timelinePanel == nil)
            .modifier(ComposerIntakeVeil(veiled: intakeBlocks, dims: false))
            .task(id: ComposerSceneFloorRules.key(slide: slide, imagesVersion: sceneImagesVersion)) {
                // Anti-rebond : un geste de cadrage change la clé à chaque image,
                // et le sol n'a pas à suivre le doigt — il suit la COMPOSITION.
                try? await Task.sleep(for: .milliseconds(200))
                guard !Task.isCancelled else { return }
                floorHash = StorySlideRenderer.computeThumbHash(slide: slide,
                                                                bgImage: nil,
                                                                loadedImages: sceneImages)
            }
    }

    /// **La scène est le plus grand 9:16 de la zone** (#13839) : ni carte ni
    /// couloir, et elle descend sous le socle, qui se pose dessus. Le clavier
    /// ou une feuille la RÉDUISENT par une échelle ancrée en haut et un décalage —
    /// une seule transaction, sans nouvelle mise en page du canvas : aucun
    /// objet ne saute pendant le geste (`ComposerSceneFit`).
    var sceneLayer: some View {
        GeometryReader { geo in
            let zone = ComposerSceneFit.stageZone(in: geo.size, aspectRatio: aspectRatio, concealed: chromeIsConcealed)
            let scene = ComposerSceneFit.frame(in: zone, aspectRatio: aspectRatio)
            let lift = chromeIsConcealed
                ? ComposerSceneFit.Lift.identity
                : ComposerSceneFit.lift(scene: scene, visibleBottom: visibleBottom(in: geo))
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
        .padding(chromeIsConcealed
                 ? EdgeInsets()
                 : ComposerSceneRailsInsets.insets(arrangement: arrangement, showsSlideRow: showsRailsSlideRow))
        .ignoresSafeArea(.container, edges: ComposerSceneFit.ignoredEdges(rails: arrangement == .rails,
                                                                          concealed: chromeIsConcealed))
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
    func keyboardMoved(_ note: Notification, hidden: Bool = false) {
        keyboard.moved(duration: note.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double,
                       endFrame: note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect,
                       windowFrame: WindowMetrics.activeWindowFrameInScreen, hidden: hidden, at: Date())
    }

    /// Le bas visible de la scène, dans son propre repère : le haut des étages
    /// du bas — celui du repos sous un étage posé par-dessus (#15226) —, sinon
    /// le bas de la zone. Une feuille ancrée du meuble borne aussi la scène
    /// (#13839, L3) : le plus haut des obstacles gagne (`ComposerSceneFraming`).
    func visibleBottom(in geo: GeometryProxy) -> CGFloat {
        let panneau = ComposerSceneLift.floorTop(measured: freeZoneFrame.isNull ? nil : freeZoneFrame.maxY,
                                                 rest: restFloorTop, overlaid: sceneIsOverlaid)
        // La barre et le clavier — ou le panneau qui le remplace, de la même
        // hauteur — bornent la scène pendant qu'on écrit SUR elle.
        let clavier: CGFloat? = editingTextId != nil ? keyboard.top : nil
        return ComposerSceneFraming.visibleBottom(zoneHeight: geo.size.height,
                                                  zoneMinY: geo.frame(in: .global).minY,
                                                  obstructionTops: [panneau, anchoredSheetTop, clavier])
    }

    var sceneCanvas: some View {
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

    var chromeLayer: some View {
        VStack(alignment: .leading, spacing: 0) {
            // **Ni barre haute ni trace du son** (#13839) : ✕, la rangée des
            // diapos et ↶ ↷ se posent sur la scène (`restChrome`), le son de
            // fond se lit au point du bouton Son et se règle de son menu.
            freeZone

            // **Sur grand écran, le bas reste dans la colonne de la scène** (#13839, L6) : une bande, la frise, les
            // réglages d'un outil ou la barre de dessin posés sous un rail y seraient couverts et intouchables.
            bottomFloors
                .padding(ComposerSceneRailsInsets.lowerFloors(arrangement: arrangement))
        }
    }
}
