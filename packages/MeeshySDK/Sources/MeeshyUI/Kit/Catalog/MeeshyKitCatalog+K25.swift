#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK25 = MeeshyKitCatalogEntry(
        key: "K25",
        name: "MeeshyDragTargets",
        states: [
            MeeshyKitCatalogState(id: "glisse", boardView: "O3", backdrop: .dark),
            MeeshyKitCatalogState(id: "poubelle-chaude", boardView: "O12", backdrop: .dark),
            MeeshyKitCatalogState(id: "duplication-chaude", backdrop: .dark),
            MeeshyKitCatalogState(id: "poubelle-seule", backdrop: .dark),
            MeeshyKitCatalogState(id: "scene-claire", backdrop: .light),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK25(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyDragTargetsSample(stateID: state.id)
    }
}

/// Ce que l'hôte passerait aux cibles pour un état du catalogue : la cible
/// survolée, celles qui sont offertes, où repose l'objet, et le ton de la scène.
private nonisolated struct MeeshyDragTargetsSampleSetting: Sendable, Equatable {
    let hovered: MeeshyDragTarget?
    let offersDuplicate: Bool
    let objectCenter: CGPoint
    let isLightScene: Bool

    static func setting(for stateID: String) -> MeeshyDragTargetsSampleSetting {
        let middle = CGPoint(x: 98, y: 174)
        switch stateID {
        case "poubelle-chaude":
            return Self(hovered: .remove, offersDuplicate: true, objectCenter: CGPoint(x: 98, y: 236), isLightScene: false)
        case "duplication-chaude":
            return Self(hovered: .duplicate, offersDuplicate: true, objectCenter: CGPoint(x: 98, y: 112), isLightScene: false)
        case "poubelle-seule":
            return Self(hovered: nil, offersDuplicate: false, objectCenter: middle, isLightScene: false)
        case "scene-claire":
            return Self(hovered: nil, offersDuplicate: true, objectCenter: middle, isLightScene: true)
        default:
            return Self(hovered: nil, offersDuplicate: true, objectCenter: middle, isLightScene: false)
        }
    }
}

/// L'échantillon d'un état : une scène 9:16 portant un objet qu'on glisse
/// VRAIMENT. Le geste appelle `begin` / `move` / `end` ; l'état de départ est
/// figé pour que l'image de référence soit déterministe. L'objet est un disque
/// de la palette : aucune image n'est embarquée.
private struct MeeshyDragTargetsSample: View {
    let stateID: String

    @StateObject private var targets: MeeshyDragTargetsState
    @State private var offset: CGSize = .zero
    @State private var isDragging = false
    private let setting: MeeshyDragTargetsSampleSetting

    private static let sceneSize = CGSize(width: 196, height: 348)
    private static let objectSide: CGFloat = 56

    init(stateID: String) {
        self.stateID = stateID
        let setting = MeeshyDragTargetsSampleSetting.setting(for: stateID)
        self.setting = setting
        _targets = StateObject(wrappedValue: MeeshyDragTargetsState(isActive: true, hovered: setting.hovered))
    }

    var body: some View {
        ZStack {
            (setting.isLightScene ? MeeshyColors.onMedia : MeeshyColors.indigo950)
            object
            MeeshyDragTargets(
                state: targets,
                labels: Self.labels,
                onDuplicate: setting.offersDuplicate ? {} : nil,
                onRemove: {}
            )
        }
        .frame(width: Self.sceneSize.width, height: Self.sceneSize.height)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
        .meeshyGlassTone(setting.isLightScene ? .onLight : .deep)
    }

    private var object: some View {
        Circle()
            .fill(MeeshyColors.purple500)
            .frame(width: Self.objectSide, height: Self.objectSide)
            .meeshyDragged(over: targets.hovered)
            .position(x: setting.objectCenter.x + offset.width, y: setting.objectCenter.y + offset.height)
            .gesture(drag)
    }

    private var drag: some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .global)
            .onChanged { value in
                if !isDragging {
                    isDragging = true
                    targets.begin()
                }
                offset = value.translation
                targets.move(to: value.location)
            }
            .onEnded { _ in
                isDragging = false
                targets.end()
                offset = .zero
            }
    }

    private static let labels = MeeshyDragTargetsLabels(
        duplicate: "Déposer ici pour dupliquer",
        duplicateHot: "Lâcher pour dupliquer",
        remove: "Déposer ici pour retirer",
        removeHot: "Lâcher pour retirer"
    )
}
#endif
