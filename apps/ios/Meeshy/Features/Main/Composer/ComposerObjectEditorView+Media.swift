import AVFoundation
import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Les trois gestes d'un MÉDIA, dans le même écran que ceux d'un texte**
/// (#4082, vue `2d`).
///
/// > « Un seul écran pour les trois gestes. Le cadre porte le recadrage, la
/// > bande porte le rognage, la coupe scinde à la tête de lecture — l'ordre des
/// > rangées suit l'ordre des décisions, pas trois écrans successifs. »
///
/// ## Ce que ce lot sert, et ce qu'il ne sert PAS
///
/// La planche en dessine cinq. QUATRE existent de bout en bout et sont ici :
///
/// | geste | où il vit |
/// |---|---|
/// | ✦ FILTRER | `StoryFilterGridView` (SDK) + `viewModel.applyFilter` — #5041 |
/// | ✂ ROGNER | `MediaTrimStrip` (SDK) + `viewModel.setSourceTrim` |
/// | ◍ MUET | `viewModel.toggleMediaMute` — no-op sur une image, rien à couper |
/// | ⟲ PIVOTER | `viewModel.rotateMedia` — vaut pour une image AUSSI |
///
/// **Ce paragraphe affirmait, jusqu'au 2026-09-04, que « ⌗ RECADRER et ✂ COUPER
/// manquent au CONTRAT : aucun champ du modèle ne les porte ». C'est faux pour
/// RECADRER depuis `a0f2a86aa9`** — `MediaCropRect`, `StoryMediaObject.crop`, le
/// round-trip `CanvasV3Migration` et `StoryMediaLayer.applyCrop` sont posés. La
/// table à jour, avec la raison exacte de chaque refus, vit à un seul endroit :
/// `MediaEditTool` (`ComposerObjectEditorRail.swift`).
///
/// > **Une affirmation périmée ne se corrige pas là où on la relit, mais partout
/// > où elle a été ÉCRITE.** Celle-ci vivait en deux exemplaires, à deux mots
/// > près ; corriger le premier donne le sentiment d'avoir fini, et c'est
/// > précisément ce sentiment qui laisse le second en place. La question qui
/// > l'attrape n'est pas « ai-je corrigé la ligne ? » mais **« combien de sites
/// > portent cette phrase ? »** — et elle se répond par un `grep` sur
/// > l'AFFIRMATION, jamais sur le fichier qu'on a sous les yeux.
///
/// Le verdict, lui, ne change pas : ni recadrage ni scission ne sont servis. Les
/// monter inertes ferait pire que leur absence — la loi 4 bannit un contrôle sans
/// effet, et ici l'auteur croirait avoir recadré.
///
/// L'écran ne sera donc pas déclaré conforme sur ce lot : quatre gestes sur cinq
/// est un Status, pas un livrable.
extension ComposerObjectEditorView {

    /// Ce que l'OBJET admet, lu une fois pour le rail et pour la sélection :
    /// « Rogner » borne une source qui a une durée, le filtre se cuit dans une
    /// image (retour porteur 2026-09-28).
    var objectHasTrimmableSource: Bool { viewModel.sourceTrim(id: objectId) != nil }
    var objectOffersFilter: Bool { mediaObject?.kind != .video }

    var mediaObject: StoryMediaObject? {
        viewModel.currentEffects.mediaObjects?.first { $0.id == objectId }
    }

    @ViewBuilder
    var mediaOptions: some View {
        if let media = mediaObject {
            VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
                // **La grille du SDK, telle quelle** (#5041). `StoryFilterGridView`
                // est autonome — aucun rappel, aucune dépendance à la coquille
                // plein écran — et c'est ce qui la rend montable ici sans rien
                // réécrire. L'aperçu qu'elle teinte est le fond de la slide,
                // comme chez `EmbeddedSceneInspector` : le filtre est un réglage
                // de SLIDE, et lui donner la vignette de l'objet aurait montré
                // un aperçu qui ne correspond pas à ce qui change.
                // **Le filtre de CET objet** (retour porteur 2026-09-28 : « les
                // modifications impactent cet objet-là et non toute la scène »).
                // Un média POSÉ règle son propre `filter`, prévisualisé sur sa
                // propre image ; seul le FOND garde le filtre de slide.
                section(ComposerObjectEditorCopy.media(.filter), .media(.filter)) {
                    ComposerMediaFilterGrid(viewModel: viewModel, media: media,
                                            isBackground: media.isBackground)
                }
                if let source = viewModel.sourceTrim(id: objectId) {
                    section(ComposerObjectEditorCopy.trim, .media(.trim)) {
                        trimBand(source)
                    }
                }
                section(ComposerObjectEditorCopy.mediaActions, .media(.actions)) {
                    ComposerMediaActionRow(viewModel: viewModel, media: media)
                }
                // **⌾ DÉCRIRE** (#4756) — l'atome du SDK, tel quel. Il porte
                // déjà son étiquette, son invite et son indice VoiceOver dans
                // les sept langues du catalogue `.module` ; en réécrire un ici
                // aurait fait diverger deux champs au premier réglage, ce que
                // le composer a déjà payé sur les légendes.
                //
                // La section ne se peint que si le meuble a remis son binding :
                // sans lui, le champ n'écrirait nulle part — un contrôle sans
                // effet, que la loi 4 bannit.
                if let alt = mediaAltText {
                    section(ComposerObjectEditorCopy.media(.altText), .media(.altText)) {
                        MediaAltTextField(kind: .alt, text: alt.wrappedValue) { saisi in
                            alt.wrappedValue = saisi
                        }
                    }
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.bottom, 28)
        }
    }

    /// **Les options d'une PUCE DE SON posée** (2026-09-05).
    ///
    /// Elle n'en avait aucune : `options` ne rendait que pour `.media` et pour
    /// un texte, donc sélectionner un son dans l'éditeur ouvrait un écran dont
    /// la zone basse restait vide. Le rognage d'un son vivait dans la bande
    /// `timeline` du bas de scène — que la directive du jour retire.
    ///
    /// La bande est la MÊME que celle d'un média (`trimBand`), et c'est le
    /// point : deux bandes de rognage écrites côte à côte auraient divergé au
    /// premier ajustement de poignée.
    @ViewBuilder
    var audioOptions: some View {
        if let source = viewModel.sourceTrim(id: objectId) {
            VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
                section(ComposerObjectEditorCopy.trim, .media(.trim)) {
                    trimBand(source)
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.bottom, 28)
        }
    }

    /// **L'ONDE d'un son, quand elle a été analysée** — reprise du meuble, qui
    /// la servait à sa bande et ne la sert plus à personne.
    ///
    /// Une vidéo n'en porte pas sur le modèle : la bande montre alors ses
    /// vignettes seules, ce qui suffit à repérer un plan. La passer à `[]` pour
    /// tout le monde — ce que ce fichier faisait — perdait, sur un son, le seul
    /// repère visuel qu'il ait.
    private var trimWaveform: [Float] {
        ComposerMediaTrimBand.waveform(viewModel: viewModel, objectId: objectId)
    }

    /// La bande PARTAGÉE avec la scène (`ComposerMediaTrimBand`, #8847) : le
    /// fond s'y rogne sous la scène avec la même bande que l'éditeur sert ici.
    private func trimBand(_ source: (url: URL, bounds: MediaTrimBounds,
                                     sourceDuration: Double, isVideo: Bool)) -> some View {
        ComposerMediaTrimBand(viewModel: viewModel, objectId: objectId,
                              source: source, waveform: trimWaveform)
    }
}
