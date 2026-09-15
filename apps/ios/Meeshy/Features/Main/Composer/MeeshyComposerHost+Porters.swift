import SwiftUI
import MeeshySDK
import MeeshyUI

// **Les huit porteurs du média, vus depuis le meuble** (#6577).
//
// Ils vivaient en `@State` ; ils vivent désormais dans `ComposerMediaPorterStore`,
// et ces huit projections gardent leurs noms intacts pour les ~170 sites qui les
// lisent et les écrivent. Le déménagement n'est pas cosmétique : un `@State` ne
// s'éprouve pas — son `setter` est `nonmutating` et n'écrit nulle part tant que
// SwiftUI n'a pas installé la vue —, donc tant que l'APPLICATION d'un retrait
// vivait là, la seule preuve possible était un grep, et un grep reste vert sur un
// no-op qui conserve les identifiants. Le doc-comment de chaque porteur a suivi
// la valeur, dans le store : une adresse qui reste derrière fait croire qu'on
// documente encore ce qu'on décrit.

@MainActor
extension MeeshyComposerHost {

    /// **Les huit, vus comme UNE valeur.** Le retrait les réécrit d'un bloc :
    /// `mediaRoleByURL` et `railPosedMediaURLs` portent chacun DEUX charges (la
    /// valeur ET une garde d'idempotence de re-pose), et les traiter séparément
    /// re-pose le média ou bloque en silence sa re-sélection.
    var mediaPorters: ComposerMediaPorters {
        get { mediaPorterStore.porters }
        nonmutating set { mediaPorterStore.porters = newValue }
    }

    /// **Ce que le MODÈLE peint**, relevé pour la règle pure — la seule source
    /// qui connaisse les objets d'une scène, le fichier de chacun, et le fait
    /// qu'un fichier soit peint par PLUSIEURS objets.
    var mediaCensus: ComposerCanvasCensus { .of(viewModel.slides) }

    var documentLocalMedia: [ComposerDocumentMedia] {
        get { mediaPorterStore.localMedia }
        nonmutating set { mediaPorterStore.localMedia = newValue }
    }

    var slideIdByMediaURL: [URL: String] {
        get { mediaPorterStore.slideIdByMediaURL }
        nonmutating set { mediaPorterStore.slideIdByMediaURL = newValue }
    }

    var mediaRoleByURL: [URL: ComposerMediaRole] {
        get { mediaPorterStore.roleByURL }
        nonmutating set { mediaPorterStore.roleByURL = newValue }
    }

    var documentMediaCaptions: ComposerMediaCaptions {
        get { mediaPorterStore.captions }
        nonmutating set { mediaPorterStore.captions = newValue }
    }

    var documentMediaAlts: [String: String] {
        get { mediaPorterStore.altsByObjectId }
        nonmutating set { mediaPorterStore.altsByObjectId = newValue }
    }

    var documentMediaObjectIdBySource: [URL: String] {
        get { mediaPorterStore.objectIdBySource }
        nonmutating set { mediaPorterStore.objectIdBySource = newValue }
    }

    var documentTranscriptions: [URL: MobileTranscriptionPayload] {
        get { mediaPorterStore.transcriptions }
        nonmutating set { mediaPorterStore.transcriptions = newValue }
    }

    var railPosedMediaURLs: Set<URL> {
        get { mediaPorterStore.railPosedURLs }
        nonmutating set { mediaPorterStore.railPosedURLs = newValue }
    }
}
