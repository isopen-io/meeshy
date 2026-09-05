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

    var mediaObject: StoryMediaObject? {
        viewModel.currentEffects.mediaObjects?.first { $0.id == objectId }
    }

    /// **Demander au FICHIER sa durée**, comme le fait le meuble pour sa bande
    /// (`mesurerLaSource`). Le modèle ne la porte pas de façon fiable, et c'est
    /// la seule mesure qui laisse un rognage se DÉFAIRE : sans elle, chaque
    /// réouverture montrerait une source rétrécie à la fenêtre précédente —
    /// un rognage qui se referme sur lui-même à chaque visite.
    func measureMediaSource(url: URL) async {
        let asset = AVURLAsset(url: url)
        guard let duree = try? await asset.load(.duration) else { return }
        let secondes = CMTimeGetSeconds(duree)
        guard secondes.isFinite, secondes > 0 else { return }
        mediaSourceDuration = secondes
    }

    @ViewBuilder
    var mediaOptions: some View {
        if let media = mediaObject {
            VStack(alignment: .leading, spacing: 18) {
                // **La grille du SDK, telle quelle** (#5041). `StoryFilterGridView`
                // est autonome — aucun rappel, aucune dépendance à la coquille
                // plein écran — et c'est ce qui la rend montable ici sans rien
                // réécrire. L'aperçu qu'elle teinte est le fond de la slide,
                // comme chez `EmbeddedSceneInspector` : le filtre est un réglage
                // de SLIDE, et lui donner la vignette de l'objet aurait montré
                // un aperçu qui ne correspond pas à ce qui change.
                section(ComposerObjectEditorCopy.media(.filter), .media(.filter)) {
                    StoryFilterGridView(
                        viewModel: viewModel,
                        previewImage: viewModel.currentSlideBackgroundImage)
                }
                if let source = viewModel.sourceTrim(id: objectId) {
                    section(ComposerObjectEditorCopy.trim, .media(.trim)) {
                        trimBand(source)
                    }
                }
                section(ComposerObjectEditorCopy.mediaActions, .media(.actions)) {
                    mediaActionRow(media)
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
            .padding(.horizontal, 16)
            .padding(.bottom, 28)
        }
    }

    private func trimBand(_ source: (url: URL, bounds: MediaTrimBounds,
                                     sourceDuration: Double, isVideo: Bool)) -> some View {
        // La durée servie est la PLUS GRANDE des deux — celle du modèle et
        // celle mesurée sur le fichier. Tant que la mesure n'est pas revenue,
        // la bande travaille sur ce que le modèle sait ; dès qu'elle arrive,
        // la source reprend sa vraie longueur. Prendre la mesure seule ferait
        // clignoter la bande à zéro le temps du chargement.
        let duree = max(mediaSourceDuration, source.sourceDuration)
        return MediaTrimStrip(
            content: source.isVideo ? .video(source.url) : .audio,
            sourceDuration: duree,
            bounds: MediaTrimRule.resolved(start: source.bounds.start,
                                           end: source.bounds.end,
                                           sourceDuration: duree),
            waveform: [],
            accent: MeeshyColors.brandPrimary,
            onChange: { bornes in
                viewModel.setSourceTrim(id: objectId, bounds: bornes, sourceDuration: duree)
            }
        )
        .task(id: source.url) { await measureMediaSource(url: source.url) }
    }

    /// **`◍ MUET` n'est servi que pour une VIDÉO ; `⟲ PIVOTER` pour les deux.**
    ///
    /// Ce n'est pas une symétrie ratée : une image n'a pas de son à couper, et
    /// un bouton muet posé dessus serait un contrôle sans effet. Une photo
    /// prise de travers, en revanche, est le cas nominal du pivotement.
    private func mediaActionRow(_ media: StoryMediaObject) -> some View {
        HStack(spacing: 10) {
            if media.kind == .video {
                mediaAction(symbol: media.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill",
                            title: ComposerObjectEditorCopy.mute,
                            isOn: media.isMuted) {
                    viewModel.toggleMediaMute(id: objectId)
                }
            }
            mediaAction(symbol: "rotate.left",
                        title: ComposerObjectEditorCopy.rotate,
                        isOn: false) {
                viewModel.rotateMedia(id: objectId)
            }
            Spacer(minLength: 0)
        }
    }

    private func mediaAction(symbol: String,
                             title: String,
                             isOn: Bool,
                             action: @escaping () -> Void) -> some View {
        Button {
            action()
            HapticFeedback.light()
        } label: {
            HStack(spacing: 6) {
                // **Taille RELATIVE, pas figée** (`FixedFontSizeGuardTests`). Un
                // glyphe de 13 pt en dur reste à 13 pt quand l'utilisateur
                // demande le plus grand corps de texte — et il est alors le seul
                // élément illisible d'une capsule qui, elle, a grandi. Le
                // préjudice n'est pas esthétique : c'est un contrôle que
                // quelqu'un ne peut pas lire, précisément celui qui en avait
                // besoin. Une taille figée ne se justifierait que par un cadre
                // fixe qui déborderait ; cette capsule s'étire avec son contenu.
                Image(systemName: symbol).font(MeeshyFont.relative(13, weight: .semibold))
                Text(title).font(MeeshyFont.relative(12, weight: .semibold))
            }
            .foregroundStyle(isOn ? Color.white : Color.white.opacity(0.85))
            .padding(.horizontal, 14)
            .frame(height: 40)
            .background {
                if isOn {
                    Capsule().fill(MeeshyColors.brandGradient)
                } else {
                    Capsule().fill(Color.white.opacity(0.12))
                }
            }
            .contentShape(Capsule().inset(by: -2))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
    }
}
