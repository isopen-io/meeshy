import Foundation
import MeeshySDK
import os

// **La pré-montée, branchée sur le DOCUMENT** (#5086, vue `4c`).
//
// > « La composition continue pendant la montée : au moment de publier, il ne
// > reste qu'un accusé à attendre — pas un envoi entier. »
//
// Le déclencheur est un BALAYAGE de l'état atteint, jamais un appel posé sur
// chaque porte d'entrée. Le composer en a cinq — rangée du document, porte du
// rail, photothèque, presse-papier, et le viseur en scène né d'un GESTE, donc
// absent de tout inventaire de portes (#4879, #5069). Les énumérer serait
// recommencer l'inventaire qui a déjà raté une porte deux fois ; balayer ce qui
// est ARRIVÉ est indifférent au chemin.
@MainActor
extension MeeshyComposerHost {

    /// **Lance ce qui attend, et rien d'autre.**
    ///
    /// Appelée après chaque dérivation du document. Idempotente à deux
    /// niveaux, et il faut les deux : le registre refuse un fichier qu'il
    /// connaît déjà, et le balayage ne voit plus un objet dont l'adoption a
    /// remplacé l'URL locale par celle du serveur.
    func startPendingPreUploads() {
        preUploads.configure(makePreUploader())
        preUploads.adopt = { [weak viewModel] local, postMediaId, remote in
            viewModel?.adoptPreUploadedMedia(
                localURL: local.absoluteString,
                postMediaId: postMediaId,
                remoteURL: remote) ?? false
        }
        for slide in viewModel.slides {
            for media in slide.effects.mediaObjects ?? [] {
                guard let fichier = ComposerPreUploadSweep.pendingFile(
                    postMediaId: media.postMediaId, mediaURL: media.mediaURL),
                      let taille = ComposerPreUploadSweep.fileSize(at: fichier)
                else { continue }
                preUploads.begin(
                    url: fichier,
                    mimeType: MimeTypeResolver.mimeType(forURL: fichier),
                    fileSize: taille,
                    // Le prédicat vit dans la règle ; ce site ne fait que lui
                    // remettre le fait. `pendingFile` a déjà écarté les objets
                    // distants, mais le registre le revérifie — deux gardes
                    // pour un doublon serveur, c'est le bon nombre.
                    alreadyRemote: !media.postMediaId.isEmpty)
            }
        }
    }

    /// **L'état de pré-montée de l'objet SÉLECTIONNÉ**, `.idle` quand il n'y en
    /// a pas — ce qui est le cas de la très grande majorité des objets, et de
    /// toutes les familles qui n'ont pas d'asset.
    ///
    /// Le pont entre un registre indexé par FICHIER et une sélection indexée
    /// par OBJET se fait ici, en une ligne, et dans ce sens : l'objet connaît
    /// son fichier (`mediaURL`), le registre ne connaît pas les objets. Faire
    /// tenir des identifiants d'objet au registre l'obligerait à suivre les
    /// créations, suppressions et déplacements du document.
    var selectedSceneItemPreUpload: ComposerPreUploadState {
        guard let id = selectedSceneItemId,
              let media = viewModel.currentSlide.effects.mediaObjects?
                  .first(where: { $0.id == id }),
              let fichier = ComposerPreUploadSweep.pendingFile(
                  postMediaId: media.postMediaId, mediaURL: media.mediaURL)
        else { return .idle }
        return preUploads.state(for: fichier)
    }

    /// **La publication démarre : plus rien ne part tôt.**
    ///
    /// Ce qui est PRÊT reste prêt et sera référencé ; ce qui est en vol est
    /// annulé, parce que la publication va le monter elle-même. Le laisser
    /// courir donnerait deux envois du même fichier en même temps — la moitié
    /// de la bande passante pour celui qui compte.
    func stopPreUploadsForPublication() {
        preUploads.stopForPublication()
    }

    /// Le monteur réel. `ComposerTusPreUploader` ne décide de rien : il adapte
    /// le `TusUploadManager` du SDK, et toutes les règles vivent dans
    /// `ComposerPreUploadPolicy` et le registre.
    ///
    /// Sans origine ni jeton, on rend un monteur INERTE plutôt que de lever :
    /// la pré-montée est une optimisation, et son absence doit coûter une
    /// publication ordinaire, jamais une erreur montrée à l'auteur.
    private func makePreUploader() -> ComposerPreUploadProviding {
        guard let base = URL(string: MeeshyConfig.shared.serverOrigin),
              let jeton = APIClient.shared.authToken else {
            return ComposerInertPreUploader()
        }
        return ComposerTusPreUploader(baseURL: base, token: jeton)
    }
}

/// **Un monteur qui ne monte pas.**
///
/// Il existe pour que « pas de session » soit un ÉTAT et non une branche
/// d'erreur chez chaque appelant. Il échoue immédiatement, donc le registre
/// marque l'asset `failed`, donc la publication le monte — le chemin d'hier,
/// inchangé.
struct ComposerInertPreUploader: ComposerPreUploadProviding {
    func upload(fileURL: URL, mimeType: String) async throws
        -> (postMediaId: String, remoteURL: String) {
        throw URLError(.userAuthenticationRequired)
    }
}
