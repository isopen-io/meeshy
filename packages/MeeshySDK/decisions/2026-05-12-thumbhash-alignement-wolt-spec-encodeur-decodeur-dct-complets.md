## 2026-05-12: ThumbHash — alignement Wolt spec (encodeur + decodeur DCT complets)

**Statut** : Accepté

**Contexte** : Le pipeline placeholder image bout en bout était cassé. Côté gateway (`services/gateway/src/services/attachments/ThumbHashGenerator.ts`), `rgbaToThumbHash` du package npm `thumbhash@0.1.1` (Wolt spec, auteur Evan Wallace) produit des hashes ~22-30 octets : 5 octets de header (24-bit + 16-bit) + nibbles AC encodés via DCT, persistés dans `Attachment.thumbHash` / `StorySlideMedia.thumbHash`. Côté iOS, `packages/MeeshySDK/Sources/MeeshySDK/Utils/ThumbHash.swift` :
- L'encodeur retournait seulement `[h0, h1, h2, h3, h4]` (5 octets DC), perdant tous les coefficients AC. Incompatibilité totale avec le format gateway.
- Le décodeur (`thumbHashToRGBA`) ignorait les AC et remplissait toute la sortie avec la couleur moyenne ; le layout des helpers (`thumbHashToAverageRGBA`) était également incorrect (`header24` dérivé de 4 octets au lieu de 3 ; P/Q remappés sur [0,1] au lieu de [-1,+1]).
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift` : le seam `ThumbHashDecoder.decodeIfAvailable(_:size:)` était un no-op (`return nil`) malgré la présence de `Utils/ThumbHash.swift` dans le SDK.

Conséquence : sur tout backdrop image de story (et tout `ProgressiveCachedImage`/`CachedAsyncImage` consommant `thumbHash`), l'utilisateur voyait un fond noir pendant le chargement réseau au lieu du blur preview "Instagram-like" promis par l'axe "optimistic preview" du brief.

**Décision** : porter l'implémentation Swift de référence d'Evan Wallace (https://github.com/evanw/thumbhash/blob/main/swift/ThumbHash.swift, MIT) dans `Utils/ThumbHash.swift`. Le port :
- **Encodeur** : DCT complet sur les canaux L/P/Q (et A si alpha présent), packing header 24 bits sur bytes [0..2], header 16 bits sur bytes [3..4], puis AC sur nibbles successifs (deux nibbles par byte). Largeur typique 25-28 octets — byte-compatible avec `thumbhash` npm.
- **Décodeur** : lecture inverse des deux headers, extraction de `lScale`/`pScale`/`qScale`/`hasAlpha`/`isLandscape`/`lx`/`ly`, IDCT à 32 px sur le plus long côté. Retourne `(0, 0, [])` si le hash est tronqué (manque d'octets AC) au lieu de fabriquer des pixels.
- **API publique inchangée** : `rgbaToThumbHash(w:h:rgba:)`, `thumbHashToRGBA(hash:)`, `thumbHashToAverageRGBA(hash:)`, `thumbHashToApproximateAspectRatio(hash:)`, `UIImage.toThumbHash()`, `UIImage.fromThumbHash(_:)`, `UIImage.thumbHashAverageColor(_:)`. Les call-sites (`StorySlideRenderer.computeThumbHash`, `StoryComposerView`, `ProgressiveCachedImage`, `CachedAsyncImage`, `InlineVideoPlayerView`) n'ont rien à changer.
- **Seam UI** : `StoryBackgroundLayer.ThumbHashDecoder.decodeIfAvailable(_:size:)` devient `nonisolated static func` et délègue à `UIImage.fromThumbHash(_:)`. Le paramètre `size:` est volontairement ignoré : `CALayer` gère le resampling via `contentsGravity = .resizeAspectFill`, pré-scaler ici gaspille du CPU et dégrade la qualité sur retina.

**Alternatives rejetées** :
- **Option B — "couleur moyenne floutée"** : renommer en `AverageColorHash`, garder 5 octets, ajouter `@available(*, deprecated, renamed:)`. Incompatible avec la prod : tous les hashes existants en MongoDB ont été générés par le gateway au format Wolt complet. Les 5 premiers octets sont juste un préfixe — interpréter le reste comme alpha DC + nibbles serait incorrect et produirait des couleurs fausses. De plus, l'UX "fond noir → image" est strictement pire que "blur preview → image".
- **Ajouter un package SPM `evanw/thumbhash`** : pas de `Package.swift` publié dans le repo de référence (un seul fichier `ThumbHash.swift` standalone). Le coût de vendoring + maintenance license MIT est négligeable vs. ajouter une dépendance SPM exotique.
- **Demander au gateway d'émettre un format compact 5 octets** : casse le contrat avec `apps/web` (consomme `thumbHash` via la lib npm officielle pour ses placeholders Next.js) et avec d'éventuels clients tiers/forward-compat.

**Conséquences** :
- Le décodeur strict refuse les hashes tronqués (≥ 5 octets de header sans AC). Les anciens tests qui forgeaient un 5-byte hash artificiel ont été remplacés par des roundtrip tests utilisant des buffers RGBA réels — l'intent (valider qu'un hash décode) est mieux servi par cette approche.
- Coût CPU encodeur : ~5-15 ms sur une image 100×100 (vs. ~2-5 ms pour l'ancien encodeur DC-only). Acceptable : appelé une seule fois par slide à la publication (`StorySlideRenderer.computeThumbHash`), jamais sur chemin de rendu. Décodeur : ~1-3 ms (IDCT 32px), bien sous le budget frame 16 ms.
- Le hash passe d'environ 8 caractères base64 (5 octets) à ~36-40 caractères (25-28 octets). Toujours sous le seuil "tiny string" — la colonne MongoDB `thumbHash` est déjà dimensionnée pour `~33 chars` (cf. commentaire schema `attachments` ligne 725 / `storySlideMedia` ligne 2805).
- `nonisolated` sur `ThumbHashDecoder.decodeIfAvailable` requis car `MeeshyUI` applique `.defaultIsolation(MainActor)` (SE-0466) et le seam doit être appelable sans hop d'actor depuis les chemins de `Task { @MainActor in ... }` de `StoryBackgroundLayer.configure`. Pure CPU + `UIImage` immutable = sûr sans isolation.

**Fichiers concernés** :
- `Sources/MeeshySDK/Utils/ThumbHash.swift` (réécrit, ~450 LoC) : port Wolt complet, licence MIT vendored en en-tête, helper `clampNibble` privé pour borner les quantizations.
- `Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift` (lignes 174-191) : `ThumbHashDecoder.decodeIfAvailable` → `UIImage.fromThumbHash(_:)`, marqué `nonisolated static`.
- `Tests/MeeshySDKTests/Utils/ThumbHashTests.swift` : remplacement de `test_fromThumbHash_validBase64_createsImage` par un test de roundtrip + ajout `test_fromThumbHash_truncatedFiveByteHeader_returnsNil` ; remplacement de `test_thumbHashToRGBA_validHash_returnsNonEmptyPixels` par un roundtrip + ajout `test_thumbHashToRGBA_truncatedAfterHeader_returnsEmpty`.
- `Tests/MeeshySDKTests/Utils/ThumbHashPipelineTests.swift` (nouveau) : roundtrip simple, roundtrip avec alpha, landscape preserve aspect, négatifs (invalid/empty/truncated), simulation gateway 100×100, préservation couleur dominante.
- `Tests/MeeshyUITests/Story/Canvas/ThumbHashDecoderIntegrationTests.swift` (nouveau) : seam `ThumbHashDecoder` (empty/invalid/valid) ; `StoryBackgroundLayer.configure(kind: .image(...))` assigne ou non `CALayer.contents` selon la validité du hash.
