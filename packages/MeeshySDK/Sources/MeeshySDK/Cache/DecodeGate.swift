import Foundation

/// **Le nombre de décodages d'image qui tournent en même temps** (#9872).
///
/// Les décodages se faisaient sur l'exécuteur de l'acteur `DiskCacheStore` :
/// un écran de cinquante avatars les rangeait l'un derrière l'autre, et les
/// `load`/`store` des autres cellules attendaient la fin de chacun. Hors de
/// l'acteur, rien ne les bornerait plus — cinquante décodages simultanés
/// pèseraient cinquante bitmaps de travail. Ce portier ne fait que compter :
/// le décodage lui-même ne passe jamais par lui, donc il ne se sérialise pas.
///
/// Un permis libéré passe DIRECTEMENT au premier qui attend : le compte ne
/// redescend pas entre deux, et aucun nouveau venu ne double la file.
actor DecodeGate {
    let limit: Int
    private var running = 0
    private var waiters: [CheckedContinuation<Void, Never>] = []

    init(limit: Int) {
        self.limit = max(1, limit)
    }

    var runningCount: Int { running }
    var waitingCount: Int { waiters.count }

    func acquire() async {
        guard running >= limit else {
            running += 1
            return
        }
        await withCheckedContinuation { continuation in
            waiters.append(continuation)
        }
    }

    func release() {
        guard waiters.isEmpty else {
            waiters.removeFirst().resume()
            return
        }
        running = max(0, running - 1)
    }
}
