import SwiftUI
import MeeshySDK
import MeeshyUI

// **Le niveau « Fond » du rail d'édition** (#13974, I-E1, grammaire d'édition § 1).
//
// Le toucher ou l'appui long sur un fond image ou vidéo le SÉLECTIONNE : le
// rail des outils cède la place au niveau « Fond » — Modifier · Remplacer ·
// Mettre sur la scène · Retirer —, l'audience, Publier et Fermer se retirent.
// Plus aucun menu flottant : l'ordre et les mots viennent de l'arbre partagé
// (`ComposerBackgroundEdit`), chaque entrée retombe sur la primitive qui
// existait déjà.
@MainActor
extension ComposerSceneSelectionRelay {

    /// Ce que le niveau « Fond » sert pour CET élément ; vide hors d'un fond.
    func backgroundActions(_ id: String) -> [ComposerBackgroundEditAction] {
        guard host.inlineFamily(of: id)?.isBackground == true else { return [] }
        return ComposerBackgroundEdit.served(isLocked: isLocked(id), removable: offered(id).contains(.delete))
    }

    func performBackgroundAction(_ action: ComposerBackgroundEditAction, on id: String) {
        switch action {
        case .modify:
            host.backgroundSourcesAreOpen = false
            host.beginInlineEdit(id, purpose: .modify)
        case .replace:
            host.backgroundSourcesAreOpen.toggle()
        case .putOnScene:
            // `toggleBackground` et NON `bringForward` : un fond se rend depuis
            // `backgroundLayer` quel que soit son z. L'objet posé reste
            // sélectionné, ses actions à la place de celles du fond.
            host.backgroundSourcesAreOpen = false
            host.viewModel.toggleBackground(id: id)
            selectSceneItem(id)
        case .remove:
            host.backgroundSourcesAreOpen = false
            host.backgroundRemovalId = id
        }
        HapticFeedback.light()
    }

    /// **Les sources de « Remplacer », en feuille basse** — la scène réduite
    /// au-dessus, rien ne la recouvre.
    var backgroundSourcesSheet: ComposerBackgroundSourcesSheet? {
        guard host.backgroundSourcesAreOpen, let id = host.selectedSceneItemId,
              host.inlineFamily(of: id)?.isBackground == true else { return nil }
        let sources = ComposerBackgroundEdit.sources(
            cameraTakesPhotos: ComposerSceneCamera.modes(for: host.selectedFormat).contains(.photo))
        return ComposerBackgroundSourcesSheet(
            sources: sources,
            plateauTint: host.tint.color,
            header: ComposerPropertiesHeader(title: ComposerEditTreeCopy.label(.replace), onDone: { goBack() }),
            onChoose: { chooseBackgroundSource($0, replacing: id) })
    }

    /// **La source choisie s'ouvre, et ce qu'elle rapporte REMPLACE le fond** :
    /// l'ancien ne part qu'à la pose — refermer le sélecteur le laisse intact.
    func chooseBackgroundSource(_ source: ComposerBackgroundSource, replacing id: String) {
        host.backgroundSourcesAreOpen = false
        switch source {
        case .camera:
            host.sceneCaptureReplacesBackgroundId = id
            host.armSceneCamera()
        case .photoLibrary, .files:
            host.backgroundReplacementId = id
            if source == .files { host.fileImportIntent = .media }
            host.railPosesNextMedia = true
            host.presentMediaIntake(source.intake)
        }
        HapticFeedback.light()
    }
}

@MainActor
extension MeeshyComposerHost {

    /// **L'appui long sur un fond le sélectionne, comme le toucher** : son
    /// niveau « Fond » prend le rail.
    func selectSceneBackground(_ id: String) {
        sceneSelectionRelay.selectSceneItem(id)
        HapticFeedback.medium()
    }

    /// **Le média posé par « Remplacer » devient le fond** ; l'ancien est
    /// retiré par le meuble (`makeSceneBackground`), et le nouveau fond reste
    /// sélectionné : le niveau « Fond » ne quitte pas l'écran.
    /// Faux ⇒ aucun remplacement en attente : la pose reste une pose.
    func replaceBackgroundIfPending(with posee: String) -> Bool {
        guard backgroundReplacementId != nil else { return false }
        backgroundReplacementId = nil
        makeSceneBackground(posee)
        sceneSelectionRelay.selectSceneItem(posee)
        return true
    }

    /// **Retirer le fond se CONFIRME** (l'arbre le déclare) : le retrait passe
    /// par le meuble (#6577) et l'édition se termine.
    func backgroundRemovalConfirmed<Contenu: View>(_ contenu: Contenu) -> some View {
        contenu.confirmationDialog(
            ComposerEditTreeCopy.removeBackgroundTitle,
            isPresented: Binding(get: { backgroundRemovalId != nil },
                                 set: { if !$0 { backgroundRemovalId = nil } }),
            titleVisibility: .visible,
            presenting: backgroundRemovalId
        ) { id in
            Button(ComposerEditTreeCopy.label(.remove), role: .destructive) { removeBackground(id) }
            Button(ComposerEditTreeCopy.cancel, role: .cancel) {}
        }
    }

    func removeBackground(_ id: String) {
        backgroundRemovalId = nil
        sceneSelectionRelay.deselectSceneItem()
        retractMedia(objectIds: [id])
        HapticFeedback.medium()
    }
}

/// **La feuille basse des sources de « Remplacer »** : Photothèque · Prendre
/// une photo · Fichiers, dans l'ordre de l'arbre partagé, 44 pt minimum.
struct ComposerBackgroundSourcesSheet: View {
    let sources: [ComposerBackgroundSource]
    let plateauTint: Color
    let header: ComposerPropertiesHeader
    let onChoose: (ComposerBackgroundSource) -> Void

    var body: some View {
        ComposerPropertiesSheetPlate(plateauTint: plateauTint) {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                header
                ForEach(sources, id: \.self) { source in
                    Button { onChoose(source) } label: {
                        HStack(spacing: MeeshySpacing.md) {
                            Image(systemName: ComposerEditTreeCopy.symbol(source))
                                .font(.body.weight(.semibold))
                                .frame(width: 24)
                            Text(ComposerEditTreeCopy.label(source)).font(.body)
                            Spacer(minLength: 0)
                        }
                        .foregroundStyle(MeeshyColors.textPrimary(isDark: true))
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("composer.background.source.\(source.rawValue)")
                }
            }
        }
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(ComposerEditTreeCopy.label(.replace)))
        .accessibilityIdentifier("composer.background.sources")
    }
}

/// La feuille basse servie : les sources de « Remplacer » priment sur le
/// panneau du sous-outil, sous UN SEUL effacement de type.
struct ComposerPropertiesSheetBody: View {
    let sources: ComposerBackgroundSourcesSheet?
    let panel: ComposerInlineToolPanel?

    var body: some View {
        if let sources { sources } else if let panel { panel }
    }
}
