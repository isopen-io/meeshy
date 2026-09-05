// packages/MeeshySDK/Sources/MeeshyUI/Primitives/WarmImageProbe.swift

import UIKit
import MeeshySDK

/// **Aucune sonde disque synchrone ne se répète dans un `body` (#4617).**
///
/// `CacheCoordinator.warmedImage(for:)` regarde d'abord le NSCache, puis —
/// s'il manque — le DISQUE : `cachedFileURL` fait un `lstat` via
/// `URL.appendingPathComponent` et `attributesOfItem(atPath:)`. Les quatre
/// composants d'image de `CachedAsyncImage.swift` l'appellent depuis leur
/// `init` et depuis leurs `onChange`, c'est-à-dire à CHAQUE évaluation du
/// `body` de leur hôte.
///
/// Mesuré au Time Profiler sur iPhone 16 Pro Max le 2026-08-31 :
/// `DiskCacheStore.cachedFileURL` sous `LentilleRailEntryView.avatarContent`,
/// puis sous `LentilleRailSelfEntryView.avatarContent`.
///
/// **Ce qui se répète est l'ABSENCE, pas la présence.** Un avatar déjà résident
/// est rendu par le NSCache et ne touche jamais le disque ; c'est l'avatar que
/// le disque n'a PAS qui refait son `lstat` indéfiniment — et c'est le cas le
/// plus fréquent sur un rail que l'on vient d'ouvrir. C'est exactement le piège
/// que `StoryCoverURLMemo` documente pour la couverture de story (#4002) :
/// mémoriser l'absence, sans quoi le correctif ne sert que la minorité.
///
/// **Pourquoi une PORTE et non un mémo par composant.** #4002 a mémoïsé la
/// couverture, où le symptôme avait été VU ; l'avatar du même rail, qui fait la
/// même sonde, n'a rien reçu. La règle n'est pas « la couverture ne sonde pas »
/// mais « rien ne sonde le disque dans un `body` ». Les dix appels de
/// `CachedAsyncImage.swift` passent donc par ici, et une garde de source refuse
/// qu'on appelle `CacheCoordinator.warmedImage` directement — une image neuve
/// est couverte parce qu'elle passe par la porte, pas parce qu'on a pensé à
/// elle.
///
/// **Pourquoi c'est SÛR sans aucun signal d'invalidation.** Le NSCache est
/// consulté AVANT le mémo, et il l'efface dès qu'il répond. Or tout chemin qui
/// écrit l'image sur le disque la met aussi en mémoire (`cacheIfWithinBudget`
/// dans `DiskCacheStore.warmedImage`, les insertions du téléchargeur) : une
/// entrée « absente » devenue fausse est donc effacée par la première lecture
/// qui réussit, sans qu'aucun site d'écriture ait à connaître cette mémoire.
///
/// Et si elle survivait malgré tout — mémoire évincée puis fichier écrit — le
/// coût est **une passe par le chargeur asynchrone déjà branché** (`.task(id:)`
/// dans chaque composant), c'est-à-dire le chemin nominal d'une image pas
/// encore résidente. Une entrée périmée dégrade, elle ne casse pas. C'est ce
/// qui permet de se passer d'un `bumpGeneration()` que quelqu'un oublierait
/// d'appeler.
@MainActor
public enum WarmImageProbe {

    /// Clés dont la sonde DISQUE a rendu `nil`. Un `Set` et non un
    /// dictionnaire : on ne mémorise que l'absence, jamais l'image — la
    /// retenir doublerait le NSCache et sa comptabilité d'éviction.
    private static var missing: Set<String> = []

    /// Le mémo ne doit pas devenir une fuite : un fil qui défile longtemps voit
    /// passer beaucoup d'adresses. Au plafond on VIDE plutôt qu'on n'évince —
    /// une politique d'éviction ici coûterait plus que le `lstat` qu'elle
    /// épargne, et le pire cas d'un vidage est une sonde de plus par clé.
    private static let cap = 512

    /// Point d'accès de test — `internal`, lu par `@testable import MeeshyUI`.
    static var memoizedMissCountForTesting: Int { missing.count }

    static func reset() { missing.removeAll() }

    /// L'image résidente pour cette adresse, sans jamais refaire une sonde
    /// disque dont on connaît déjà la réponse négative.
    ///
    /// L'ordre des trois étapes EST la sûreté de ce mémo — le NSCache d'abord,
    /// le mémo ensuite, le disque en dernier. Inverser les deux premières
    /// rendrait `nil` pour une image que la mémoire tient, et l'avatar
    /// clignoterait au retour de chaque écran.
    public static func warmedImage(for resolved: String) -> UIImage? {
        warmedImage(
            for: resolved,
            resident: { DiskCacheStore.cachedImage(for: $0) },
            probe: { CacheCoordinator.warmedImage(for: $0) }
        )
    }

    /// La forme TESTABLE : la mémoire résidente et la sonde DISQUE sont
    /// injectées. Sans elle, un témoin ne pourrait affirmer que « le disque
    /// n'est sondé qu'une fois » — il ne verrait que la valeur rendue, qui est
    /// `nil` dans les deux cas, avec et sans mémo.
    static func warmedImage(
        for resolved: String,
        resident: (String) -> UIImage?,
        probe: (String) -> UIImage?
    ) -> UIImage? {
        if let cached = resident(resolved) {
            missing.remove(resolved)
            return cached
        }
        if missing.contains(resolved) { return nil }
        if let warmed = probe(resolved) { return warmed }
        if missing.count >= cap { missing.removeAll() }
        missing.insert(resolved)
        return nil
    }
}
