import SwiftUI
import AVFoundation
import MeeshySDK
import MeeshyUI

/// **Les ÉTAGES du bas**, sortis de `ComposerSceneSurface` (budget de taille) : la frise,
/// les références, les options d'outil, les propriétés et la bande.
extension ComposerSceneSurface {

    /// **La frise prend le bas tant qu'elle est ouverte** : les étages qui outillent la scène image par image n'ont
    /// rien à y faire, et deux zones basses se recouvriraient.
    @ViewBuilder
    var bottomFloors: some View {
        if let timelinePanel {
            timelinePanel
        } else if ComposerToolFocus.lowerFloorsAreShown(writesText: writesText) {
            // **Clavier levé, le bas est au clavier** : références,
            // jetons et rangée basse y seraient couverts ou hors du pouce.
            lowerFloors
                .background {
                    GeometryReader { geo in
                        Color.clear.preference(key: ComposerLowerFloorsHeightKey.self,
                                               value: geo.size.height)
                    }
                }
                .animation(ComposerSelectionChrome.propertiesAnimation(reduceMotion: reduceMotion),
                           value: propertiesSheet != nil)
        }
    }

    @ViewBuilder
    var lowerFloors: some View {
        VStack(alignment: .leading, spacing: 0) {
            // **Ce que la publication EMPORTE** — hashtags et
            // mentions, juste sous la scène libre. Il CÈDE aux options d'un
            // outil, par `ComposerCanonicalZone`, jamais par un
            // `!toolIsOpen` écrit ici.
            if ComposerCanonicalZone.isServed(.references, toolIsOpen: sceneIsFocused), band == nil {
                ComposerSceneReferenceFooter(hashtags: sceneHashtags,
                                             references: sceneReferences,
                                             leadingInset: sceneCardLeading - railLaneLeading,
                                             onOpenHashtags: onOpenHashtags,
                                             onOpenMentions: onOpenMentions)
            }

            // **Le panneau d'options passe AVANT la bande de fond** :
            // l'outil ouvert a la priorité sur le bas, et les deux ne
            // coexistent jamais. L'exclusion se lit sur `railMode`, par
            // `ComposerLowZone`, jamais sur la présence du panneau.
            switch lowZone {
            case .properties:
                if let propertiesSheet { propertiesFloor(propertiesSheet) }
            case .toolOptions:
                // La marge des rails : les options d'un outil ne touchent pas
                // le bord du verre.
                // Sur une PLAQUE DE VERRE, comme les options de l'éditeur
                // d'objet.
                if let toolOptions {
                    toolOptions
                        .padding(MeeshySpacing.smPlus)
                        .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xlPlus, style: .continuous),
                                       tint: plateauTint.opacity(0.55))
                        .padding(.horizontal, ComposerRailGeometry.outerMargin)
                        .padding(.bottom, MeeshySpacing.xsPlus)
                }
            case .band(let ouverte):
                // Sous la scène, qui se réduit au-dessus d'elle, sur tout écran :
                // en carte à côté du rail droit, elle couvrait la scène (#13839, L6).
                bandView(ouverte)
            case .nothing:
                EmptyView()
            }
            // **La rangée basse — une PLACE permanente, un contenu qui change** :
            // outil ouvert, ses contrôleurs ; sinon, les portes
            // qui font ENTRER de la matière ; viseur armé, ses commandes.
            // **Une bande ouverte prend le bas pour elle seule** : la mention, le
            // hashtag et le lieu s'effacent aussi le temps du panneau. Un OUTIL ouvert garde la rangée : elle
            // porte alors ses propres contrôleurs.
            if let drawingBar { drawingBar }
        }
    }

    @ViewBuilder
    var composingFloors: some View {
        ZStack(alignment: .bottom) {
            // Sur grand écran, les rails se CENTRENT en hauteur (maquette
            // iPad : ils ne descendent pas au pouce, qui n'y tient pas l'écran).
            HStack(alignment: isRoomy ? .center : .bottom, spacing: 0) {
                Spacer(minLength: 0)
                if trailingRailIsShown {
                // **Les options EN HAUT, l'historique EN BAS** :
                // la colonne prend la hauteur de la scène libre dès qu'elle a
                // des options, et son pied reste au pouce.
                ComposerTrailingRail(actions: trailingActions,
                                     plateauTint: plateauTint,
                                     onAction: onTrailingAction,
                                     onUndo: historyIsOnTheScene ? nil : onUndo,
                                     onRedo: historyIsOnTheScene ? nil : onRedo,
                                     pushesToThumb: false,
                                     separateButtons: true,
                                     options: trailingOptions,
                                     onOption: onTrailingOption,
                                     onTime: nil,
                                     timeIsOpen: timeIsOpen,
                                     footFollowsOptions: trailingFootFollowsOptions)
                    // **Dans la hauteur de la CARTE** : un outil
                    // ouvert retire la barre haute, et la scène libre remonte
                    // au-dessus de la carte — le rail, lui, n'en sort pas.
                    .padding(.top, trailingBand.top)
                    .padding(.trailing, edge)
                    .padding(.bottom, trailingBand.bottom)
                    .transition(.opacity)
                }
            }
            .frame(maxHeight: .infinity, alignment: isRoomy ? .center : .bottom)
            // **Le volet CÈDE au viseur** : la question passe par la
            // règle, jamais par un `cameraStage != .off` écrit ici.
            // **Un outil ou une bande ouverts prennent le bas pour eux seuls** :
            // la légende s'efface le temps du
            // dessin ou du Cadre, comme la barre canonique sous un panneau.
            if ComposerSceneCameraOverlay.isServed(.description, stage: cameraStage),
               ComposerToolFocus.isShown(.description, toolIsOpen: sceneIsFocused, writing: writing), band == nil {
                descriptionOverlay
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
    }

    /// **Les propriétés montent du bas avec la scène qui se réduit** (#13957) :
    /// un seul mouvement, au ressort de `ComposerSelectionChrome.propertiesAnimation`,
    /// sans glissement sous Réduire les animations. La bande, elle, s'insère
    /// sans animation : son montage reste à part.
    func propertiesFloor(_ sheet: AnyView) -> some View {
        sheet.transition(ComposerSelectionChrome.propertiesTransition(reduceMotion: reduceMotion))
    }

    func bandView(_ ouverte: ComposerSceneBand) -> some View {
        ComposerSceneBandView(band: ouverte,
                              colors: bandColors,
                              onPickColor: onPickBandColor,
                              openingEffect: bandOpeningEffect,
                              onPickOpening: onPickBandOpening,
                              fitMode: bandFitMode,
                              backdrop: bandBackdrop,
                              plateauTint: plateauTint,
                              onPickFitMode: onPickBandFitMode,
                              onPickBackdrop: onPickBandBackdrop,
                              onCloseBand: onCloseBand)
    }
}
