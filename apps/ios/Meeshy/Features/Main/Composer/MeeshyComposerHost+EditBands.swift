import SwiftUI
import AVFoundation
import MeeshySDK
import MeeshyUI

/// **Les BANDES d'édition de la scène** — styles de texte et rognage.
///
/// Extraites de `MeeshyComposerHost+Surfaces.swift` le 2026-09-01 : ce fichier
/// dépassait le budget de 800–1100 lignes, et la directive interdit d'ajouter à
/// un fichier hors budget avant d'avoir extrait. Le découpage suit une
/// responsabilité, pas une tranche : ces six membres répondent tous à la même
/// question — « que peut-on faire de l'élément SÉLECTIONNÉ ? » — et leurs sites
/// d'appel restent dans `sceneSurface`, où la loi de divulgation progressive
/// les mesure toujours.
extension MeeshyComposerHost {
    /// **Le TEXTE sélectionné, et son style courant** (#4083) — `nil` dès que
    /// la sélection n'est pas un texte.
    ///
    /// Même forme que `trimmableSelection`, et pour la même raison : ce `nil`
    /// tient la loi 4 des deux côtés d'un coup — il retire `.textStyles` du jeu
    /// servi (la bande n'est pas ouvrable) ET laisse `composerTextStylesBand` à
    /// `nil` (elle n'aurait rien à montrer). Une question posée une fois, deux
    /// conséquences.
    var styleableSelection: StoryTextObject? {
        guard let id = selectedSceneItemId else { return nil }
        return viewModel.currentEffects.textObjects.first { $0.id == id }
    }

    /// **Le spécimen des 18 styles, composé pour l'objet sélectionné.**
    ///
    /// Le texte RÉEL voyage jusqu'à la vue : c'est ce que la planche demande —
    /// « l'aperçu en haut applique le style sélectionné au vrai texte de la
    /// scène ». Un spécimen sur un texte fabriqué répondrait à une autre
    /// question que celle que l'auteur se pose.
    var composerTextStylesBand: AnyView? {
        guard let texte = styleableSelection else { return nil }
        return AnyView(
            TextStyleSpecimenBand(
                text: texte.text,
                selection: texte.parsedTextStyle,
                // Le plateau est sombre en permanence — sans ce drapeau les
                // vignettes non choisies peignent du sombre sur du sombre.
                onDarkSurface: true,
                // **La MÊME marge que la rangée de jetons**, qui vit douze
                // points plus bas. Deux rangées voisines qui ne commencent pas
                // à la même abscisse se voient avant de se comprendre.
                horizontalInset: ComposerRailGeometry.outerMargin,
                onSelect: { style in
                    viewModel.updateTextStyle(id: texte.id, style: style)
                }
            )
        )
    }

    var trimmableSelection: (url: URL, bounds: MediaTrimBounds,
                             sourceDuration: Double, isVideo: Bool)? {
        guard let id = selectedSceneItemId else { return nil }
        return viewModel.sourceTrim(id: id)
    }

    /// **La bande : la source entière, la fenêtre gardée, deux poignées.**
    ///
    /// Le composant vient du SDK (`MediaTrimStrip`), qui ne sait rien du
    /// produit : il reçoit une durée, des bornes et rend des bornes. Ce que ce
    /// meuble ajoute est ce que le SDK ne peut pas savoir — quel objet est
    /// sélectionné, où son fichier est chargé, et à qui remettre le résultat.
    ///
    /// **L'écriture est IMMÉDIATE** (loi 7 du milestone) : chaque image du
    /// geste écrit sur le modèle, donc la scène, l'aperçu et la vignette
    /// suivent le doigt. Un « Appliquer » ferait choisir à l'aveugle.
    var composerTrimBand: AnyView? {
        guard let id = selectedSceneItemId, let sel = trimmableSelection else { return nil }
        // La durée MESURÉE prime sur celle du modèle : voir
        // `trimSourceDurations`. Tant que la mesure n'est pas revenue, la
        // valeur du modèle sert de minorant — la bande est utilisable
        // aussitôt, elle s'élargit quand la vérité arrive.
        let duree = max(trimSourceDurations[id] ?? 0, sel.sourceDuration)
        return AnyView(
            MediaTrimStrip(
                content: sel.isVideo ? .video(sel.url) : .audio,
                sourceDuration: duree,
                bounds: MediaTrimRule.resolved(start: sel.bounds.start,
                                               end: sel.bounds.end,
                                               sourceDuration: duree),
                waveform: trimWaveform(for: id),
                accent: MeeshyColors.brandPrimary,
                onChange: { bornes in
                    viewModel.setSourceTrim(id: id, bounds: bornes, sourceDuration: duree)
                }
            )
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .task(id: sel.url) { await mesurerLaSource(id: id, url: sel.url) }
        )
    }

    /// L'onde d'un SON, quand elle a été analysée. Une vidéo n'en porte pas sur
    /// le modèle — la bande montre alors ses vignettes seules, ce qui suffit à
    /// repérer un plan.
    func trimWaveform(for id: String) -> [Float] {
        viewModel.currentEffects.audioPlayerObjects?
            .first(where: { $0.id == id })?
            .waveformSamples ?? []
    }

    /// **Demander au FICHIER sa durée.** Le modèle ne la porte pas de façon
    /// fiable (cf. `trimSourceDurations`), et c'est la seule mesure qui laisse
    /// un rognage se DÉFAIRE : sans elle, chaque réouverture de la bande
    /// montrerait une source rétrécie à la fenêtre précédente.
    func mesurerLaSource(id: String, url: URL) async {
        let asset = AVURLAsset(url: url)
        guard let duree = try? await asset.load(.duration) else { return }
        let secondes = CMTimeGetSeconds(duree)
        guard secondes.isFinite, secondes > 0 else { return }
        trimSourceDurations[id] = secondes
    }
}
