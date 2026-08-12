import Foundation
import UIKit
import AVFoundation
import MeeshySDK

// MARK: - Story ThumbHash Enricher

/// C3 — les thumbHashes ne bloquent plus le tap « Publier ». Ils sont calculés
/// APRÈS le hand-off, sur une COPIE des slides : le composer se ferme
/// immédiatement, l'enrichissement rattrape l'intent persisté avant le premier
/// octet réseau.
///
/// Atome agnostique (règle du grain, `packages/MeeshySDK/CLAUDE.md`) : aucun
/// singleton Meeshy, aucune règle « quand faire X ». Tout entre en paramètre,
/// tout ressort par la valeur de retour. Le *quand* reste app-side.
public enum StoryThumbHashEnricher {

    /// Provider par défaut : première frame à t=0,1 s, 100×100. `nonisolated`
    /// à dessein — l'extraction et le hachage restent HORS du MainActor, que
    /// l'enrichissement post-dismiss occupe déjà pour le composite de slide
    /// (`StorySlideRenderer` est MainActor-isolé). C'est aussi pourquoi la
    /// borne n'emprunte pas `BoundedAsyncResolution.resolve`, qui est
    /// `@MainActor` et rapatrierait chaque extraction sur le thread principal :
    /// seule la VALEUR de la borne est partagée (`storyThumbHashTimeout`).
    public nonisolated static func videoThumbHash(url: URL) async -> String? {
        let asset = AVURLAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 100, height: 100)
        let time = CMTime(seconds: 0.1, preferredTimescale: 600)
        do {
            let (cgImage, _) = try await generator.image(at: time)
            return UIImage(cgImage: cgImage).toThumbHash()
        } catch {
            return nil
        }
    }

    /// Enrichit une COPIE des slides. Ne lit aucun état extérieur.
    /// - un `thumbHash` déjà présent n'est JAMAIS recalculé (idempotence) ;
    /// - un média sans image ni URL résolvable garde son thumbHash à `nil` ;
    /// - identité et ordre des slides comme des `mediaObjects` sont préservés.
    ///
    /// `videoThumbHashProvider` existe POUR LE TEST (injection de la latence et
    /// de la borne) ; la valeur par défaut est le seul chemin de production.
    public static func enrich(
        slides: [StorySlide],
        bgImages: [String: UIImage],
        loadedImages: [String: UIImage],
        videoURLs: [String: URL],
        videoTimeout: Duration = BoundedAsyncResolution.storyThumbHashTimeout,
        videoThumbHashProvider: @escaping @Sendable (URL) async -> String? = { await videoThumbHash(url: $0) }
    ) async -> [StorySlide] {
        var enriched = slides
        // UN SEUL groupe pour TOUS les jobs vidéo de TOUTES les slides : un
        // groupe par slide sérialisait les extractions d'une story multi-clips.
        var videoJobs: [(slide: Int, media: Int, url: URL)] = []

        for i in enriched.indices {
            enriched[i].effects.thumbHash = StorySlideRenderer.computeThumbHash(
                slide: enriched[i],
                bgImage: bgImages[enriched[i].id],
                loadedImages: loadedImages
            )

            if var medias = enriched[i].effects.mediaObjects {
                for j in medias.indices where medias[j].thumbHash == nil {
                    let mediaId = medias[j].id
                    if let cached = loadedImages[mediaId] {
                        medias[j].thumbHash = cached.toThumbHash()
                        continue
                    }
                    if medias[j].kind == .video, let url = videoURLs[mediaId] {
                        videoJobs.append((i, j, url))
                    }
                }
                enriched[i].effects.mediaObjects = medias
            }

            // R1.4 — `StorySlideRenderer` est MainActor-isolé : sans cette
            // respiration entre slides, une story de 10 slides figerait la
            // trail ~200 ms juste après le retour au feed. Le bug se serait
            // déplacé au lieu de disparaître.
            await Task.yield()
        }

        guard !videoJobs.isEmpty else { return enriched }

        let results = await withTaskGroup(of: (Int, Int, String?).self) { group in
            for job in videoJobs {
                group.addTask {
                    let hash = await bounded(
                        { await videoThumbHashProvider(job.url) },
                        timeout: videoTimeout
                    )
                    return (job.slide, job.media, hash)
                }
            }
            var collected: [(Int, Int, String?)] = []
            for await result in group { collected.append(result) }
            return collected
        }

        for (slideIdx, mediaIdx, hash) in results {
            guard let hash else { continue }
            enriched[slideIdx].effects.mediaObjects?[mediaIdx].thumbHash = hash
        }
        return enriched
    }

    /// Course entre l'extraction et sa borne : la première à finir gagne, et le
    /// perdant est ANNULÉ (contrairement à `BoundedAsyncResolution.resolve`,
    /// qui laisse dormir sa borne entière — 10 médias = 10 réveils programmés
    /// 5 s après le retour au feed).
    private nonisolated static func bounded(
        _ operation: @escaping @Sendable () async -> String?,
        timeout: Duration
    ) async -> String? {
        await withTaskGroup(of: String?.self) { group in
            group.addTask { await operation() }
            group.addTask {
                try? await Task.sleep(for: timeout)
                return nil
            }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
        }
    }
}
