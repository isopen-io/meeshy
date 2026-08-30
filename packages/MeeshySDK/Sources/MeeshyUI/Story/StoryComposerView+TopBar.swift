import SwiftUI
import UIKit
import os
import PhotosUI
import UniformTypeIdentifiers
import AVFoundation
import MeeshySDK

// MARK: - StoryComposerView + TopBar

/// Une commande de la rangée haute. Le type existe pour que la question « qui
/// assemble quoi » se pose à un prédicat PUR : la barre vit dans un `body`
/// SwiftUI, et `StoryComposerView` n'est pas hostable en XCTest.
public nonisolated enum ComposerTopBarControl: Sendable, CaseIterable, Equatable {
    case audience
    case preview
    case publish
    case overflow
}

/// Qui peint le chrome de publication du composer.
///
/// `.atelier` — l'atelier du SDK est autonome : sa rangée haute porte
/// l'audience, l'œil et la flèche. C'est le comportement de tous les appelants
/// existants, et la valeur par défaut des init publics le garantit.
///
/// `.host` — un meuble app-side peint ces trois commandes lui-même. La rangée
/// du SDK ne les assemble PAS : deux barres, dont une inerte, seraient une
/// régression sèche sur la surface de création la plus utilisée. Une commande
/// reprise par le meuble est ABSENTE, jamais grisée ni transparente (loi 4).
public nonisolated enum ComposerChromeOwner: Sendable, Equatable {
    case atelier
    case host

    public func assembles(_ control: ComposerTopBarControl) -> Bool {
        switch self {
        case .atelier:
            return true
        case .host:
            // Le ⋯ outille la COMPOSITION (transitions, timeline, brouillon,
            // purge des slides) : le meuble ne reprend que la publication.
            return control == .overflow
        }
    }

    /// Y a-t-il quelqu'un pour publier ? En `.atelier`, la flèche de la rangée,
    /// qui existe toujours. En `.host`, le déclencheur externe — et lui seul :
    /// sans armement la composition n'a AUCUN chemin de départ, et le taire
    /// laisserait pour seul symptôme un bouton d'hôte sans effet.
    public func hasPublisher(triggerIsArmed: Bool) -> Bool {
        switch self {
        case .atelier:
            return true
        case .host:
            return triggerIsArmed
        }
    }
}

extension StoryComposerView {
    // `showTopBar` a déménagé en `StoryComposerView+Chrome.swift` : il lit
    // désormais le contexte de chrome unique, comme la barre de FABs.

    // MARK: - Top Bar (icônes flottantes — directive user 2026-07-10)

    /// Le header n'est PLUS une barre : plus de fond `.ultraThinMaterial`
    /// pleine largeur ni de hauteur réservée — chaque commande est une icône
    /// de verre individuelle qui FLOTTE au-dessus du canvas plein écran
    /// (parité IMG_0944 : X à gauche, actions à droite). La bande de slides
    /// vit SUR la même rangée, ENTRE le X et le sélecteur d'audience
    /// (directive user 2026-07-10), présente uniquement quand elle est utile
    /// (« les éléments apparaissent et quittent selon le besoin »). Les
    /// commandes d'annulation ont quitté le header pour la colonne verticale
    /// du flanc droit (`historyColumn`).
    var topBar: some View {
        HStack(alignment: .center, spacing: 0) {
            dismissButton

            // **Le type de publication se pose ICI, contre la fermeture**
            // (#4124, directive porteur 2026-08-28 : « mettre le choix du type
            // de la scène à côté du bouton de fermeture »).
            //
            // Il flottait jusqu'ici sur une rangée à part, AU-DESSUS du
            // composer — deux barres pour un seul en-tête, et la seconde
            // n'appartenait même pas à l'atelier. C'est exactement ce que #4047
            // avait déjà corrigé sur la surface document ; l'atelier rejoint la
            // règle.
            //
            // La vue vient de l'app (`storyComposerHeaderLeadingAccessory`) :
            // ce qu'elle porte lit l'éventail, la mémoire de format et le
            // plafond d'audience — le SDK n'a pas à les connaître.
            if let leading = headerLeadingAccessory {
                leading.makeView()
                    .padding(.leading, ComposerControlMetrics.groupSpacing)
                    // **`fixedSize` + priorité, sinon le rail des slides le
                    // comprime.** Mesuré à l'écran : le rail occupe TOUT
                    // l'interstice entre la fermeture et les actions, et le chip
                    // de type s'y réduisait à son chevron — « Story » disparu,
                    // le seul mot qui dise ce qu'on est en train de composer.
                    .fixedSize(horizontal: true, vertical: false)
                    .layoutPriority(1)
            }

            // Bande de slides — entre le bouton de fermeture et le choix de la
            // cible d'audience. Le rail scrolle horizontalement et occupe tout
            // l'interstice ; sur un composer vierge (empty-state picker), il
            // disparaît et laisse l'espace vide. PAS de surface de verre :
            // les vignettes flottent nues par-dessus le canvas, comme les
            // icônes du header (directive user 2026-07-10).
            if shouldShowFloatingSlideStrip {
                slideStrip
                    .padding(.vertical, 5)
                    .padding(.horizontal, 8)
                    .transition(.opacity)
            } else {
                Spacer(minLength: 12)
            }

            // Unified Liquid Glass action group (iOS 26 GlassEffectContainer →
            // adjacent glass morphs into one continuous surface; iOS 16–25 falls
            // back to material/solid via the adaptiveGlass wrappers). Publish keeps
            // the primary brand tint via prominent glass; overflow (⋯) sits last,
            // right of Publish.
            // Interstice de LAYOUT ramené à zéro : chaque pastille porte
            // désormais une boîte de 44 pt qui inclut 4 pt de marge transparente
            // par côté, si bien que l'écart VISUEL passe de 6 à 8 pt et que deux
            // cibles voisines sont exactement jointives — jamais chevauchantes,
            // ce qui aurait laissé SwiftUI arbitrer par ordre de dessin et fait
            // déclencher « Aperçu » sur un tap au bord de « Publier ». Le
            // paramètre du conteneur reste une distance d'EFFET (morphing du
            // verre iOS 26) et suit l'écart visuel réel.
            // V3-1 — les trois commandes de publication sortent de la rangée
            // quand un meuble app-side les peint (`chromeOwner == .host`).
            // ABSENTES, jamais grisées : une pastille inerte au-dessus d'un
            // socle qui publie vraiment est le pire des deux mondes.
            AdaptiveGlassContainer(spacing: ComposerControlMetrics.glassBlendSpacing) {
                HStack(spacing: ComposerControlMetrics.groupSpacing) {
                    if chromeOwner.assembles(.audience) { visibilityMenu }
                    if chromeOwner.assembles(.preview) { previewButton }
                    if chromeOwner.assembles(.publish) { publishButton }
                    overflowMenu
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 6)
        .animation(.spring(response: 0.3, dampingFraction: 0.85),
                   value: shouldShowFloatingSlideStrip)
    }

    /// La bande n'apparaît que quand elle est UTILE : navigation entre
    /// plusieurs slides, ou slide courant avec du contenu (vignette d'état +
    /// affordance « + » C6). Composer vierge = canvas nu, zéro chrome inutile.
    var shouldShowFloatingSlideStrip: Bool {
        viewModel.slides.count > 1 || composerHasContent
    }

    var dismissButton: some View {
        Button { handleDismiss() } label: {
            Image(systemName: "xmark")
                .font(.system(size: 15, weight: .bold))
                .glassControlForeground()
                .frame(width: ComposerControlMetrics.visualDiameter,
                       height: ComposerControlMetrics.visualDiameter)
                .adaptiveGlass(in: Circle())
                .composerHitTarget()
        }
    }

    /// **L'aperçu, en UN site** (#4135). La rangée de l'atelier le presse, et la
    /// télécommande du meuble aussi — deux écritures du même geste auraient
    /// divergé au premier ajustement, et l'une des deux se serait mise à rendre
    /// un aperçu qui ne dit pas la vérité sur ce qui sera publié (loi 6).
    ///
    /// Il vit ICI, jamais chez le presseur : `snapshotAllSlides()` rabat les
    /// effets du canvas courant, et `viewModel.loadedImages` / `loadedVideoURLs`
    /// / `loadedAudioURLs` sont les médias PRÉCHARGÉS de l'atelier.
    func presentPreview() {
        NotificationCenter.default.post(name: .storyComposerMuteCanvas, object: nil)
        Task { @MainActor in
            let snapshot = await snapshotAllSlides()
            onPreview(snapshot.slides, snapshot.bgImages, viewModel.loadedImages, viewModel.loadedVideoURLs, viewModel.loadedAudioURLs)
        }
    }

    var previewButton: some View {
        Button {
            presentPreview()
        } label: {
            Image(systemName: "play.fill")
                .font(.system(size: 12, weight: .bold))
                .glassControlForeground()
                .frame(width: ComposerControlMetrics.visualDiameter,
                       height: ComposerControlMetrics.visualDiameter)
                .adaptiveGlass(in: Circle())
                .composerHitTarget()
        }
    }

    /// Icône seule (directive user 2026-07-11 « enlever le terme Publier —
    /// juste la flèche et la couleur primaire ») : cercle 36 pt aligné sur les
    /// autres actions du header, le verre proéminent teinté brand restant le
    /// SEUL marqueur d'action primaire. Le libellé survit en accessibilité.
    var publishButton: some View {
        let isPublishing = didHandOffPublish
        return Button { publishAllSlides() } label: {
            Group {
                if isPublishing {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(.white)
                        .scaleEffect(0.7)
                } else {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.white)
                }
            }
            .frame(width: ComposerControlMetrics.visualDiameter,
                   height: ComposerControlMetrics.visualDiameter)
            .adaptiveGlassProminent(in: Circle(), tint: MeeshyColors.brandPrimary)
            .composerHitTarget()
        }
        // `canPublish`, et jamais `composerHasContent` : la story « fond +
        // musique » ne porte aucun contenu visuel au sens de S2 et doit rester
        // publiable — les quatre autres consommateurs de `composerHasContent`,
        // eux, gardent l'arbitrage S2 intact.
        .disabled(isPublishing || !canPublish)
        .accessibilityLabel(isEditingExistingStory
            ? String(localized: "story.composer.updateStory", defaultValue: "Mettre à jour", bundle: .module)
            : String(localized: "story.composer.publish", defaultValue: "Publier", bundle: .module))
    }

    /// Audiences réellement proposées — `allowedVisibilities` quand un plafond
    /// est posé (republication), sinon toutes les sélectionnables.
    ///
    /// L'intersection est faite dans l'ordre de `composerSelectableCases` pour
    /// que le menu garde toujours le même ordre de lecture, quel que soit
    /// l'ordre de la liste autorisée.
    private var selectableVisibilities: [PostVisibility] {
        guard let allowedVisibilities else { return PostVisibility.composerSelectableCases }
        let allowed = Set(allowedVisibilities)
        return PostVisibility.composerSelectableCases.filter(allowed.contains)
    }

    var visibilityMenu: some View {
        Menu {
            ForEach(selectableVisibilities) { mode in
                Button {
                    visibility = mode.rawValue
                    if mode.requiresUserSelection { audiencePickerMode = mode }
                } label: {
                    Label(mode.label, systemImage: visibility == mode.rawValue ? "checkmark" : mode.icon)
                }
            }
        } label: {
            let current = PostVisibility(rawValue: visibility) ?? .public
            let showCount = current.requiresUserSelection && !visibilityUserIds.isEmpty
            HStack(spacing: 4) {
                Image(systemName: current.icon)
                    .font(.system(size: 12, weight: .semibold))
                Text(showCount ? "\(current.label) (\(visibilityUserIds.count))" : current.label)
                    .font(.system(size: 12, weight: .semibold))
                    .lineLimit(1)
            }
            .glassControlForeground()
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .adaptiveGlass(in: Capsule(), tint: MeeshyColors.brandPrimary.opacity(0.18))
            // Capsule d'environ 27 pt de haut (paddings 10/6 sur une police 12) :
            // le débord de contact la porte à 44 sans changer sa hauteur rendue.
            .composerHitTarget()
        }
        .sheet(item: $audiencePickerMode) { mode in
            AudienceUserPickerView(mode: mode, initialSelection: visibilityUserIds) { ids in
                visibilityUserIds = ids
            }
        }
    }

    // MARK: - Undo/redo global (C9 Inc.4)

    /// Colonne verticale annuler/rétablir, ancrée en bas à droite sur le flanc
    /// droit du canvas (directive user 2026-07-10 — libère le header pour la
    /// bande de slides). Même règle d'apparition que le header (chrome plein
    /// écran au repos) ; chaque commande n'existe à l'écran QUE quand la
    /// trajectoire le permet (canUndo/canRedo — C9 Inc.4).
    var historyColumn: some View {
        AdaptiveGlassContainer(spacing: 10) {
            // Interstice de layout réduit de la marge de contact des deux
            // pastilles : l'écart VISUEL de 10 pt est conservé à l'identique.
            VStack(spacing: ComposerControlMetrics.columnSpacing) {
                if viewModel.canUndoGlobal {
                    historyButton(
                        icon: "arrow.uturn.backward",
                        label: String(localized: "story.composer.undo",
                                      defaultValue: "Annuler", bundle: .module),
                        action: performUndo
                    )
                }
                if viewModel.canRedoGlobal {
                    historyButton(
                        icon: "arrow.uturn.forward",
                        label: String(localized: "story.composer.redo",
                                      defaultValue: "Rétablir", bundle: .module),
                        action: performRedo
                    )
                }
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.85),
                       value: viewModel.canUndoGlobal)
            .animation(.spring(response: 0.3, dampingFraction: 0.85),
                       value: viewModel.canRedoGlobal)
        }
    }

    func historyButton(icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .bold))
                .glassControlForeground()
                .frame(width: ComposerControlMetrics.visualDiameter,
                       height: ComposerControlMetrics.visualDiameter)
                .adaptiveGlass(in: Circle())
                .composerHitTarget()
        }
        .transition(.scale.combined(with: .opacity))
        .accessibilityLabel(label)
    }

    /// L'application d'un snapshot est VM-side ; les side-effects de
    /// présentation (état canvas local, timeline chargée) sont View-side —
    /// même séquence que la sélection d'une vignette du strip.
    func performUndo() {
        guard viewModel.undoGlobal() else { return }
        restoreCanvas(from: viewModel.currentSlide)
        viewModel.loadCurrentSlideIntoTimeline()
        HapticFeedback.light()
    }

    func performRedo() {
        guard viewModel.redoGlobal() else { return }
        restoreCanvas(from: viewModel.currentSlide)
        viewModel.loadCurrentSlideIntoTimeline()
        HapticFeedback.light()
    }

    var overflowMenu: some View {
        Menu {
            // Slide tools — le filtre GLOBAL a été retiré : les filtres
            // s'appliquent désormais par média via l'éditeur unitaire (crayon
            // sur chaque image/vidéo), chacun avec son propre aperçu live.
            Button { showTransitionSheet = true } label: {
                Label(
                    String(localized: "story.composer.transitions", defaultValue: "Transitions", bundle: .module),
                    systemImage: "rectangle.2.swap"
                )
            }
            // Intention UNIQUE d'ouverture (S4) : `openTimeline` synchronise
            // machine + flag ViewModel, quel que soit l'état d'où le menu est
            // ouvert (le menu ⋯ n'est visible qu'à `.hidden` aujourd'hui, mais
            // le seul point de vérité reste la fonction partagée).
            Button { bandStateMachine.openTimeline(isTimelineVisible: &viewModel.isTimelineVisible) } label: {
                Label(
                    String(localized: "story.composer.timeline", defaultValue: "Timeline", bundle: .module),
                    systemImage: "clock"
                )
            }

            Divider()

            // 2026-08-02 (point c) : « Sauvegarder » s'offre AUSSI en édition —
            // le brouillon porte `editingPostId` et rouvre le mode édition.
            Button { saveDraft() } label: {
                Label(String(localized: "story.composer.saveDraft", defaultValue: "Sauvegarder le brouillon", bundle: .module), systemImage: "square.and.arrow.down")
            }
            Divider()
            Button(role: .destructive) {
                // Bug fix: viewModel.reset() wipes ViewModel data (slides, effects,
                // images), but composer-local @State (selectedFilter,
                // openingEffect, closingEffect, selectedImage, audio inputs, drawing
                // canvas, picker scratch) survives. The canvasSyncFingerprint chain
                // (.onChange → syncCurrentSlideEffects → buildEffects) re-injects
                // those stale local values into the fresh empty slide, making
                // "deleted" elements reappear. resetLocalState() clears them in
                // lock-step so the sync writes back a truly empty effects payload.
                viewModel.reset()
                resetLocalState()
            } label: {
                Label(String(localized: "story.composer.deleteAllSlides", defaultValue: "Supprimer tous les slides", bundle: .module), systemImage: "trash")
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 13, weight: .bold))
                .glassControlForeground()
                .frame(width: ComposerControlMetrics.visualDiameter,
                       height: ComposerControlMetrics.visualDiameter)
                .adaptiveGlass(in: Circle())
                .composerHitTarget()
        }
    }
}
