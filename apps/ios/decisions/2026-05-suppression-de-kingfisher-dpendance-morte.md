## 2026-05: Suppression de Kingfisher (dpendance morte)
**Statut**: Accept
**Contexte**: Kingfisher 7.10 tait dclare dans `apps/ios/Package.swift` depuis le dbut du projet, mais l'audit SOTA 2026-05-06 a dcouvert qu'**aucun fichier Swift ne l'importait** (`grep "import Kingfisher"` = 0 rsultats). L'image loading tait dj fait via `AsyncImage` natif SwiftUI + `CachedAsyncImage` custom (`packages/MeeshySDK/Sources/MeeshyUI/Primitives/CachedAsyncImage.swift`) qui utilise `DiskCacheStore` et `CacheCoordinator.shared.images` (3-tier cache du SDK).
**Decision**: Supprimer Kingfisher de `apps/ios/Package.swift` (dependencies + target product). Aucun changement de code Swift requis (zro import). Conserver `CachedAsyncImage` + `CacheCoordinator` qui sont la stratgie d'image loading active.
**Alternatives rejet** :
- **Bumper Kingfisher 7.10 → 8.9** (recommandation initiale de l'audit) : inutile puisque la lib n'est pas utilise. Maintenir une dpendance non-utilise = dette tech qui pollue le SPM graph et augmente le bundle.
- **Migrer tout vers Kingfisher** : ajouterait une dpendance redondante alors que `CacheCoordinator` 3-tier est dj en place et test.
- **Migrer vers Nuke 13** : non justifi (mme raisonnement).
**Justification SOTA (audit 2026-05-06)** :
- Le pattern actuel (`AsyncImage` SwiftUI + `CachedAsyncImage` + `DiskCacheStore`) est natif iOS 15+ et SOTA 2026
- Le `CacheCoordinator` 3-tier (mmoire NSCache + disk FileManager + rseau) est plus performant qu'une simple `KFImage` car coupl  l'invalidation Socket.IO
- Suppression d'une dpendance morte = -1 paquet SPM, build plus rapide, moins de surface d'attaque
**Cons**: aucun. Le retrait est purement bnfique (rien ne casse, dette tech limine).
**Source**: `docs/superpowers/specs/2026-05-06-composer-based-story-repost-sota-audit.md` Pilier 11 (rvis post-investigation)
