import SwiftUI
import Photos
import MeeshySDK
import MeeshyUI

// MARK: - Dernière photo de la pellicule (amorce de page blanche, S5)
//
// PhotoKit, l'autorisation (y compris `.limited`) et le tri sont de
// l'orchestration UX produit : app-side, comme le picker de lieu et la caméra.
// Le SDK ne reçoit qu'un identifiant opaque et une vignette déjà décodée.

/// Ferry le `UIImage` non-`Sendable` à travers la frontière de complétion
/// PhotoKit (les callbacks arrivent hors de l'acteur appelant). L'image n'est
/// lue qu'après la reprise de la continuation. Jumeau de l'`ImageBox` de
/// `RecentMediaStrip`, dupliqué plutôt que partagé : les deux fichiers
/// n'exposent rien l'un à l'autre et un type de 40 caractères ne justifie pas
/// une surface commune.
private struct ImageBox: @unchecked Sendable { let image: UIImage? }

/// Loquet de reprise UNIQUE. `withCheckedContinuation` plante si on le reprend
/// deux fois, et PhotoKit peut rappeler plusieurs fois (mode `.opportunistic`)
/// depuis des files quelconques — un simple `var resumed` capturé ne serait ni
/// sûr ni compilable dans une closure `@Sendable`.
///
/// `internal` et non `private` : c'est la seule pièce DÉCIDABLE de ce seam, et
/// un loquet qui laisserait passer deux appelants est un crash — il mérite un
/// test, pas une garde de source.
///
/// `nonisolated` sur le TYPE (même précédent que `RecentMediaSelection`) : la
/// cible compile sous isolation MainActor par défaut, et un loquet qu'il
/// faudrait `await` depuis la complétion PhotoKit — laquelle est `@Sendable` et
/// synchrone — ne serait pas un loquet.
nonisolated final class PhotoKitResumeLatch: @unchecked Sendable {
    private let lock = NSLock()
    private var claimed = false

    /// `true` pour le PREMIER appelant seulement.
    func claim() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard !claimed else { return false }
        claimed = true
        return true
    }
}

enum RecentCameraRollAsset {

    /// Vignette de la photo la plus récente. `nil` — et donc AUCUNE vignette —
    /// dès qu'un des trois cas se présente : autorisation absente ou refusée,
    /// pellicule vide, ou requête image en échec. On ne demande JAMAIS
    /// l'autorisation ici : afficher le composer ne doit pas déclencher une
    /// alerte système que l'utilisateur n'a pas provoquée — un prompt sans
    /// contexte est le meilleur moyen d'obtenir un refus DÉFINITIF. La demande
    /// vit dans `requestAccess()`, appelée depuis le tap sur la capsule.
    static func latest() async -> StoryRecentCameraRollAsset? {
        guard isReadAuthorized else { return nil }
        return await resolveLatest()
    }

    /// Geste EXPLICITE (tap sur la capsule « Galerie ») : on demande l'accès en
    /// lecture, puis on rend la dernière photo si l'accès est accordé.
    /// `announcesRefusal: false` — même recette que `RecentMediaStrip` : le SDK
    /// enchaîne déjà sur le `PhotosPicker` système, un toast de refus en plus
    /// ferait doublon sur le même geste et parlerait d'une impasse qui n'existe
    /// pas.
    static func requestAccess() async -> StoryRecentCameraRollAsset? {
        guard await MediaPermissionCoordinator.ensurePhotoLibraryRead(announcesRefusal: false)
        else { return nil }
        return await resolveLatest()
    }

    /// Bitmap plein format (borné à 1080 pt de côté, comme le chemin picker) de
    /// l'asset désigné, pour l'insérer dans la slide au tap.
    static func fullImage(for identifier: String) async -> UIImage? {
        guard isReadAuthorized else { return nil }
        guard let asset = PHAsset.fetchAssets(
            withLocalIdentifiers: [identifier], options: nil).firstObject else { return nil }
        return await requestImage(
            asset, targetSize: CGSize(width: 1080, height: 1080), deliveryMode: .highQualityFormat)
    }

    private static func resolveLatest() async -> StoryRecentCameraRollAsset? {
        guard let asset = fetchLatestAsset() else { return nil }
        // **`.opportunistic` et non `.fastFormat` (#4036).**
        //
        // `.fastFormat` ne rend que ce qui est DÉJÀ local, et ne télécharge
        // jamais — `isNetworkAccessAllowed` ne le gouverne pas. Un asset iCloud
        // dont la vignette locale a été purgée (bibliothèque « optimiser le
        // stockage », le réglage par défaut) rendait donc `nil`, et l'amorce
        // disparaissait SANS UN MOT : l'auteur voyait « Galerie » là où l'ancre
        // A4 promet « la dernière photo en 1 geste ».
        //
        // Mesuré au simulateur le 2026-08-28, autorisation COMPLÈTE accordée,
        // dans le log de PhotoKit :
        //
        //     [ImageManager] no resource found matching image request spec
        //       … choose: fast-single, load: img, ver: curr, resize: fast
        //
        // `.opportunistic` livre un aperçu dégradé puis le final, et honore le
        // rapatriement réseau que la ligne suivante autorise déjà. Le protocole
        // « dégradé puis final » est exactement celui que la couture ci-dessous
        // sait tenir — elle le documente, et n'attendait qu'un mode qui l'emploie.
        guard let thumbnail = await requestImage(
            asset, targetSize: CGSize(width: 176, height: 176), deliveryMode: .opportunistic)
        else { return nil }
        return StoryRecentCameraRollAsset(identifier: asset.localIdentifier, thumbnail: thumbnail)
    }

    private static var isReadAuthorized: Bool {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        return status == .authorized || status == .limited
    }

    private static func fetchLatestAsset() -> PHAsset? {
        let options = PHFetchOptions()
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        options.fetchLimit = 1
        return PHAsset.fetchAssets(with: .image, options: options).firstObject
    }

    // MARK: - PhotoKit request seam
    //
    // La complétion est déclarée comme une variable locale explicitement typée
    // `@Sendable`, JAMAIS écrite en closure suiveuse. Ce n'est pas stylistique.
    //
    // La cible compile sous isolation MainActor par défaut : une closure
    // littérale écrite ici en hérite, et Swift 6 place alors une assertion
    // d'isolation dynamique dans son PROLOGUE (`swift_task_isCurrentExecutor`)
    // — elle trappe à l'instant où PhotoKit l'invoque depuis sa propre file,
    // avant même que le corps ne tourne. `Task { @MainActor in }` n'y change
    // rien : le piège est à l'entrée. C'est le crash de prod
    // Meeshy-2026-07-11-131634.ips, vu 7× sur les builds 1201→1235.
    //
    // Même seam, même raison que `RecentMediaStrip` et
    // `CallTranscriptionService.requestPermission()`.
    private static func requestImage(
        _ asset: PHAsset,
        targetSize: CGSize,
        deliveryMode: PHImageRequestOptionsDeliveryMode
    ) async -> UIImage? {
        let options = PHImageRequestOptions()
        options.deliveryMode = deliveryMode
        options.resizeMode = .fast
        options.isSynchronous = false
        // Un asset iCloud non téléchargé rendrait `nil` en silence : on autorise
        // le rapatriement réseau plutôt que de faire disparaître l'amorce sans
        // raison visible.
        options.isNetworkAccessAllowed = true
        return await withCheckedContinuation { (continuation: CheckedContinuation<ImageBox, Never>) in
            let latch = PhotoKitResumeLatch()
            let completion: @Sendable (UIImage?, [AnyHashable: Any]?) -> Void = { image, info in
                // EXACTEMENT une reprise, quel que soit le nombre d'appels.
                // PhotoKit livre en `.opportunistic` un aperçu DÉGRADÉ puis le
                // résultat final ; reprendre deux fois est un crash, ne jamais
                // reprendre est une fuite de continuation (« SWIFT TASK
                // CONTINUATION MISUSE ») qui laisse l'appelant sans retour et
                // fait disparaître l'amorce en silence.
                //
                // Deux façons de terminer, et deux seulement :
                // - un échec explicite (erreur, ou annulation) → `nil` tout de
                //   suite : attendre un final qui ne viendra pas serait la fuite ;
                // - un résultat NON dégradé → c'est le final, y compris pour
                //   `.fastFormat` qui ne promet qu'un seul appel.
                // Un aperçu dégradé sans échec ne termine RIEN : le rendre
                // abandonnerait au passage le rapatriement iCloud qu'on vient
                // d'autoriser.
                let failed = info?[PHImageErrorKey] != nil
                    || (info?[PHImageCancelledKey] as? Bool) ?? false
                let isDegraded = (info?[PHImageResultIsDegradedKey] as? Bool) ?? false
                guard failed || !isDegraded else { return }
                guard latch.claim() else { return }
                continuation.resume(returning: ImageBox(image: failed ? nil : image))
            }
            PHImageManager.default().requestImage(
                for: asset, targetSize: targetSize,
                contentMode: .aspectFit, options: options,
                resultHandler: completion
            )
        }.image
    }
}

extension View {
    /// Fournit au composer de story (SDK) l'accès en lecture à la dernière
    /// photo de la pellicule. Sans cet appel, la vignette n'est pas rendue et
    /// l'amorce retombe sur la capsule « Galerie » qui ouvre le `PhotosPicker`
    /// système : aucune capacité perdue.
    func storyRecentCameraRollProvided() -> some View {
        environment(\.storyRecentCameraRollAsset, StoryRecentCameraRollProvider(
            latest: { await RecentCameraRollAsset.latest() },
            fullImage: { await RecentCameraRollAsset.fullImage(for: $0) },
            requestAccess: { await RecentCameraRollAsset.requestAccess() }
        ))
    }
}
