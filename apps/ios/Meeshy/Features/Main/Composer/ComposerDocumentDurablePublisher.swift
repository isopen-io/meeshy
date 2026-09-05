import Foundation
import MeeshySDK

/// **Publier un DOCUMENT depuis une porte qui n'a pas de fil** (#4751).
///
/// ## Pourquoi ce site existe
///
/// Le socle du meuble publie par `MeeshyComposerHost.onPublishDocument`, une
/// fermeture que chaque porte fournit. `DocumentComposerDoor` la sert en
/// appelant `FeedViewModel.publish(_:)`, qui fait DEUX choses : insérer un post
/// optimiste dans le fil qu'il tient, puis enfiler l'envoi durable.
///
/// La porte du TRAY n'a pas de fil. Elle est appliquée par `RootView` et
/// `iPadRootView`, où aucun `FeedViewModel` ne vit : les deux qui existent sont
/// des `@StateObject` d'écrans plus bas (`RootViewComponents`, `FeedView`). En
/// fabriquer un troisième pour ce cover produirait un modèle du fil que
/// personne n'affiche, et dont l'insertion optimiste ne serait vue par aucun
/// œil.
///
/// Elle servait donc `onPublishDocument: { _ in false }` — un REFUS, honnête
/// tant que la porte n'atteignait pas le socle. Elle l'atteint depuis que
/// `.cameraReady` route vers le meuble : sans ce site, un auteur qui ouvre
/// « Créer une story », bascule l'éventail sur « Post » et écrit du texte
/// presse une flèche qui ne publie RIEN.
///
/// > Une règle de routage qui ouvre un chemin doit livrer ce que ce chemin
/// > promet. Router sans publier déplace le défaut au lieu de le corriger — et
/// > le déplace vers la loi 4, « un contrôle existe s'il a un effet », dans sa
/// > forme la plus dure : la flèche d'envoi.
///
/// ## Ce qu'il ne fait PAS, et pourquoi
///
/// Il n'insère aucun post optimiste. Il n'y a pas de liste à mettre à jour au
/// moment où il s'exécute — le fil n'est pas monté sous ce cover. Le post
/// apparaîtra au prochain chargement du feed, et la file DURABLE garantit
/// l'envoi entre-temps ; c'est la même garantie que le chemin du fil, moins
/// l'anticipation visuelle qu'aucun écran ne pourrait recevoir ici.
///
/// Il ne réécrit ni la règle d'envoi (`ComposerDocumentSendPlan`) ni la fabrique
/// de la charge (`PublishIntent.document`) : les deux chemins de publication de
/// document partagent la même loi et la même matière, seul l'aval diffère.
/// `ComposerDocumentTrayPublishTests` verrouille ce partage — deux fabriques
/// pour un même envoi divergeraient dès leur naissance, pas un jour.
enum ComposerDocumentDurablePublisher {

    /// - Returns: `true` si l'envoi est ACCEPTÉ (enfilé durablement), `false`
    ///   sinon — la même acceptation que `onPublishDocument` attend, et jamais
    ///   « le serveur a répondu ». Un `true` sur un refus fermerait le composer
    ///   sur une publication qui n'a pas eu lieu.
    static func publish(
        _ draft: ComposerDocumentDraft,
        queue: OfflineQueueing = OfflineQueue.shared,
        isOffline: Bool = NetworkMonitor.shared.isOffline
    ) async -> Bool {
        guard case .send = ComposerDocumentSendPlan.plan(for: draft, isOffline: isOffline) else {
            return refuse()
        }

        // Mêmes arguments que `DocumentComposerDoor.publishDocument`, dans le
        // même ordre : c'est la porte jumelle, et l'écart entre les deux serait
        // un champ perdu en silence chez l'une des deux.
        let intent = PublishIntent.document(
            localMedia: draft.localMedia,
            declaredType: draft.format.postType,
            forcePlainPost: draft.forcePlainPost,
            content: draft.text,
            visibility: draft.visibility.rawValue,
            visibilityUserIds: draft.visibilityUserIds,
            originalLanguage: draft.originalLanguage,
            mentions: draft.mentions,
            location: draft.location,
            discoverabilityPrecision: draft.discoverabilityPrecision,
            transcription: draft.mobileTranscription,
            // **Le canvas suit la voie durable** (#4756) — c'est la SEULE que
            // prenne un post du meuble, en ligne comme hors ligne. Un blob
            // qui s'arrêterait au brouillon serait perdu au premier flush.
            storyEffects: draft.storyEffects,
            mediaCaptions: draft.mediaCaptions
        )

        do {
            _ = try await queue.enqueuePostMedia(
                sourceMediaURLs: intent.localMediaURLs,
                sourceMediaMimeTypes: intent.localMediaMimeTypes,
                clientMutationId: intent.clientMutationId,
                content: intent.content,
                visibility: intent.visibility,
                visibilityUserIds: intent.visibilityUserIds,
                originalLanguage: intent.originalLanguage,
                type: intent.type,
                location: intent.location,
                mentions: (intent.mentions?.isEmpty ?? true) ? nil : intent.mentions,
                discoverabilityPrecision: intent.discoverabilityPrecision,
                mobileTranscription: intent.mobileTranscription,
                // Le canvas (#4756) — cette porte enfile DIRECTEMENT, sans
                // passer par `FeedViewModel.publish` : le champ doit donc être
                // remis ici AUSSI, ou la moitié des posts du meuble perdrait
                // encore sa scène. C'est le mode de panne que la règle « aucune
                // valeur par défaut » existe pour rendre impossible.
                storyEffects: intent.storyEffects,
                mediaCaptions: intent.mediaCaptions
            )
        } catch {
            return refuse()
        }

        HapticFeedback.success()
        return true
    }

    /// Un refus qui se DIT — même raison, mot pour mot, que celui de la porte
    /// jumelle : rendre `false` sans rien dire laisse l'auteur devant une
    /// flèche qui semble ne rien faire, et il la presse encore.
    private static func refuse() -> Bool {
        FeedbackToastManager.shared.showError(ComposerDocumentCopy.publishError)
        return false
    }
}
