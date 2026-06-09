# Design — Bandwidth lever 5.2 : sélection de variante d'image iOS

> Date : 2026-06-09 · Branche : `dev` · Statut : approuvé (design), spec en relecture

## 1. Contexte & objectif

Le levier 5.2 du plan `apps/ios/tasks/test-plan-current-development.md` : sur réception d'une image, le client iOS doit **charger une variante allégée adaptée à la taille d'affichage** plutôt que l'original multi-Mo, pour les previews inline et le viewer plein écran. Critère PASS : « Variante légère utilisée si dispo ; pas de régression d'affichage ».

**Fait structurant (vérité terrain)** : les `imageVariants` sont **déjà transmises (REST + socket), décodées dans `MeeshyMessageAttachment.imageVariants`, mais totalement inutilisées** côté device. 5.2 est donc un **pur build client**, sans prérequis gateway.

- Décodage : `MessageModels.swift:194` (`decodeIfPresent([MeeshyImageVariant])`) → conversion API→domain `ConversationModels.swift:262` → `MeeshyMessageAttachment.imageVariants` (`CoreModels.swift:950`).
- Transmission : REST `attachmentIncludes.ts:79` (`imageVariants: true`) + socket `serializeAttachmentForSocket.ts:65` (`imageVariants: raw.imageVariants ?? null`).
- Génération serveur : WebP uniquement, largeurs `[640, 1080, 1920]`, pas d'upscale, **images plaintext seulement** (`UploadProcessor.ts:407-420`, `thumbnail.ts:30-31`).

## 2. Scope (décidé)

| Décision | Choix |
|---|---|
| Surfaces | **Bulles inline** (grille `ProgressiveCachedImage`) **+ plein écran** (`.fullScreenCover` → `ImageFullscreen`, PAS `ImageViewerView` qui est inutilisé pour les images de conv) |
| Images chiffrées (E2EE) | **Hors scope** — aucune variante générée côté serveur → sélecteur renvoie l'URL originale (fallback, zéro régression) |
| Formats | Gateway = WebP ; **sélecteur format-agnostique** (le champ `format` existe déjà, AVIF futur sans changement de modèle) |
| Heuristique | Miroir exact du web (`srcset.ts:17-45`) |

**Hors scope explicite** : génération de variantes pour images chiffrées (workstream gateway+crypto), avatars/autres surfaces `CachedAsyncImage` non-message, instrumentation de mesure des octets économisés.

## 3. Modèle de données (existant, non modifié)

`MeeshyImageVariant` (`CoreModels.swift:913-927`), tous champs non-optionnels :
```swift
public struct MeeshyImageVariant: Codable, Sendable, Hashable {
    public let width: Int      // px — clé de sélection primaire
    public let height: Int
    public let url: String     // URL indépendante par variante
    public let size: Int       // octets — clé secondaire (réservé)
    public let format: String  // "webp" par défaut
}
```
`MeeshyMessageAttachment` porte `width: Int?` (dimension originale), `fileUrl: String` (original), `imageVariants: [MeeshyImageVariant]?`.

## 4. Architecture (approche A — sélecteur pur SDK + câblage aux call sites)

Approches écartées :
- **B** (loaders sélectionnent en interne) : met la logique produit + fallback dans le primitive UI → alourdit / borderline pureté.
- **C** (helper sur le modèle `attachment.bestImageURL(forWidth:scale:)`) : le modèle devient conscient du contexte d'affichage + cascade `resolveMediaURL` → **viole la pureté SDK** (précédent `VideoAvailabilityResolver`/`AttachmentDownloader` rollback, `MeeshySDK/CLAUDE.md:43`).

### 4.1 SDK — atome pur (nouveau)
Fichier `packages/MeeshySDK/Sources/MeeshySDK/Networking/ImageVariantSelector.swift` — **co-localisé avec `MediaDownloadPolicyEngine`** (le précédent cité vit dans `Networking/`, pas dans un `Media/` inexistant). Package SPM → **aucune entrée pbxproj**.

```swift
public enum ImageVariantSelector {
    /// Retourne l'URL de la plus petite image dont la largeur en pixels est
    /// >= targetWidthPx, en considérant `variants` PLUS l'original comme plus
    /// grand candidat. Retourne `originalURL` quand aucune variante n'existe
    /// (image chiffrée) ou qu'aucun candidat ne convient — fallback à
    /// régression nulle.
    public static func bestImageURL(
        variants: [MeeshyImageVariant],
        originalURL: String,
        originalWidth: Int?,
        targetWidthPx: Int
    ) -> String
}
```

**Algorithme** (déterministe, sans effet de bord) :
1. Candidats = variantes filtrées (`url` non vide, `width > 0`), triées par un **comparateur total `(width, url)` croissant** (Swift `sort(by:)` n'est PAS stable, contrairement à V8), puis **dédupliquées par `width` en gardant le dernier en ordre croissant** (last-write-wins, miroir de `srcset.ts:33`). Cela garantit le déterminisme run-to-run même sur égalité de width.
2. Ajouter l'original comme candidat **ssi** `originalWidth != nil && originalWidth > plus grande largeur de variante` (**strict `>`**, miroir `srcset.ts:40` — un original de largeur égale à la plus grande variante n'est jamais ajouté).
3. Choisir la **plus petite largeur de candidat `≥ targetWidthPx`** (borne `≥`, pas `>` — sémantique HTML « select an image source » : un match exact est servi, pas la taille au-dessus).
4. Si aucun candidat ne qualifie (target dépasse tout) → **plus grand candidat**.
5. Si aucun candidat du tout (pas de variante ET pas de largeur originale exploitable) → `originalURL`.
6. **Défensif (pas un miroir web)** : `targetWidthPx <= 0` (cible dégénérée, jamais vue par un navigateur) → **plus petit candidat** (le moins d'octets) ; si aucun candidat → `originalURL`.

> **Provenance** : les étapes 1-2 reproduisent la **construction de candidats** de `buildImageSrcSet` (`srcset.ts:26-42` : filtre, tri, dédupe, append-original-si-strictement-plus-large). Les étapes 3-4 répliquent la **sélection navigateur** HTML (plus petit descripteur `≥ CSS-px × DPR`) — `srcset.ts` ne contient PAS ce picker, c'est le navigateur via `sizes`/DPR. L'étape 6 est une politique défensive locale sans analogue web.

Pur, déterministe, entrées `Sendable`, format-agnostique (ne lit jamais `format`). Analogue direct du précédent `MediaDownloadPolicyEngine.shouldAutoDownload` (`MeeshySDK/Sources/MeeshySDK/Networking/`, `MeeshySDK/CLAUDE.md:6-43`, « Rule engines stateless → SDK »).

### 4.2 MeeshyUI — primitive (modifié)
`ProgressiveCachedImage.init` (`CachedAsyncImage.swift:354`) gagne `targetSize: CGSize? = nil` (défaut = comportement actuel inchangé). Threadé vers `maxPixelSize` lors du load cache, **comme `CachedAsyncImage`** (`CachedAsyncImage.swift:25-50`). Rôle : **filet secondaire** plafonnant le bitmap décodé. ⚠ Ce cap est **neutralisé pour un bitmap déjà résident** : `warmedImage` (`DiskCacheStore.swift:393-402`, appelé à chaque init) décode en pleine résolution via `UIImage(contentsOfFile:)` et seede la NSCache en ignorant `maxPixelSize`, et `image(for:maxPixelSize:)` retourne le hit NSCache **avant** d'appliquer le cap (`DiskCacheStore.swift:432-435`). Le vrai levier mémoire+octets reste la **sélection de variante** (URL plus petite → image physiquement plus petite), pas ce downsample.

### 4.3 Câblage (sélection aux call sites)
**Chemin réel des images de conversation** (vérifié) : elles passent par `.visualGrid` / `.mixed.visual` (`BubbleContentBuilder.swift:137-145` — `nonMedia` = `.file`/`.location` seulement). `ImageViewerView` (atteint via `BubbleAttachmentView.swift:33`, réservé aux `nonMediaAttachments`) **n'est PAS utilisé pour les images de conv** → on ne le touche pas.

- **Grille inline** (`BubbleStandardLayout+Media.swift`) : la largeur en points est décidée dans **`visualMediaGrid`** (lignes 33-88 : solo=`gridMaxWidth`(300, h≤240), 2-up=`(gridMaxWidth−spacing)/2`, 3-up=`×0.6`/`×0.4`, 4-up=moitiés). `BubbleGridImageView` (439-463) ne porte **que** `attachment`. → Calculer `targetWidthPx = cellPointWidth × UIScreen.main.scale` **dans `visualMediaGrid`** et threader `let cellPointWidth: CGFloat` via `makeGridCell → BubbleGridCell → BubbleGridImageView`. Au point de rendu : `ImageVariantSelector.bestImageURL(variants: att.imageVariants ?? [], originalURL: att.fileUrl, originalWidth: att.width, targetWidthPx:)` → URL en `fullUrl` + `targetSize` au `ProgressiveCachedImage`.
- **Plein écran** : le vrai chemin est le `.fullScreenCover` à **`BubbleStandardLayout.swift:471`** → `ImageFullscreen(imageUrl: MeeshyConfig.resolveMediaURL(urlStr))` (construit depuis l'original `attachment.fileUrl`), `ImageFullscreen` (`ImageViewerView.swift:177-199`) ne prend qu'un `imageUrl: URL?` (pas de variantes). Second appelant : `ConversationView.swift:694`. → Sélectionner la variante **au call site** : `targetWidthPx = screenWidth × UIScreen.main.scale` → sélecteur → URL choisie passée à `ImageFullscreen(imageUrl:)`. **Aucun changement d'API `ImageFullscreen`** (URL pré-résolue côté appelant). Pour le viewer, cible large → souvent l'original ou la 1920 (gain modeste vs gain bulle).

### 4.4 Cache (clé par URL — collision sur la dimension bitmap)
Chaque URL de variante est une clé distincte (`DiskCacheStore.swift:509-514`, SHA256 de l'URL) → la **dimension téléchargement/disque** est sans collision (largeurs ≠ → URLs ≠ → clés ≠), aucune modification du cache requise. **Mais `maxPixelSize` ne participe PAS à la clé** : pour une même URL de variante, le premier décodeur gagne le slot mémoire ; deux surfaces demandant la même variante à des `targetSize` différents partagent le même bitmap résident. C'est pourquoi le gain repose sur la **sélection de variante** (l'URL plus petite contraint octets ET pixels), pas sur le cap `targetSize`. Un keying `(url, maxPixelSize)` est **hors scope**. Gain concret : télécharger ~640px (dizaines de Ko) au lieu de l'original (Mo) dans une cellule 180-240pt.

## 5. Justification pureté SDK

| Élément | Placement | Raison (test du grain, `MeeshySDK/CLAUDE.md:6-43`) |
|---|---|---|
| `ImageVariantSelector.bestImageURL` | **SDK** (`Networking/`, co-localisé `MediaDownloadPolicyEngine`) | Fonction pure stateless `nonisolated`, params opaques, agnostique produit, pas de singleton, pas de cascade → atome (précédent `MediaDownloadPolicyEngine`) |
| `targetSize` sur `ProgressiveCachedImage` | **MeeshyUI** | Paramètre UI pur d'un primitive (comme `CachedAsyncImage`) |
| Choix de la frame + appel sélecteur + fallback | **App / call site** | Décision UX produit « quelle taille cible, quoi charger » (précédent `VideoAvailabilityResolver`) |

## 6. Plan de test (TDD)

`ImageVariantSelectorTests` (Swift Testing, pur, package SPM → pas de pbxproj) :
1. Plus petite variante `≥ target` choisie (target 700, variantes 640/1080/1920 → 1080).
2. Match exact multi-variantes (target 640 → 640, prouve la borne `≥`).
3. Target entre deux (target 641 → 1080).
4. Target > toutes **et** original plus grand → original (target 1921, orig 4000 → original).
5. Target > toutes **et** original ≤ plus grande variante → plus grande variante (target 1921, orig 1500 → 1920).
6. Aucune variante → `originalURL` (cas chiffré).
7. Variantes `width=0` / `url` vide filtrées.
8. `originalWidth == nil` + toutes variantes < target → plus grande variante (cas pur, sans le sous-cas no-variante).
9. Format-agnostique : un mix `webp`/`avif` sélectionne par width seule.
10. `targetWidthPx <= 0` → plus petit candidat (défensif).
11. **[N3]** `originalWidth == plus grande variante` (égalité), target > tout → la **variante** (PAS l'original) — prouve le `>` strict de l'append (régression bande passante sinon).
12. **[N3]** Variante unique exactement à la cible (`[640]`, target 640 → 640).
13. **[N2]** Deux variantes de **width égale**, urls différentes → gagnant documenté (last-write-wins en ordre `(width, url)`), exécuté 2× → même résultat (déterminisme).
14. **[N3]** Bornes retina réelles : solo 300pt @3x → target 900 → 1080 ; 3-up-droite (`×0.4`) ~120pt @3x → target ~360 → 640 (documente le plancher 640).
15. **[N3]** Variantes vides + `originalURL` vide + target ≤ 0 → contrat documenté (retourne `""`, no-op côté `CachedAsyncImage`).

Validation build : `meeshy.sh build` (app + edits ProgressiveCachedImage + grille `visualMediaGrid`/satellites + 2 call sites plein écran) + suite SDK pour le sélecteur. Pas de régression sur les suites existantes.

## 7. Edge cases & risques

- **Chiffré** : `imageVariants == nil` → `bestImageURL` renvoie `originalURL` → comportement actuel, zéro régression.
- **`width` original nil** : l'original n'est pas ajouté comme candidat upscale ; on sert la plus grande variante (ou l'original si aucune variante).
- **Risque visuel** : une variante trop petite = flou. Écarté par la règle « plus petite `≥ target` » (jamais sous la cible) + downsampling `targetSize`. **Check visuel device recommandé** (hors environnement build).
- **Cohérence dimensions** : la variante choisie a son propre `width/height` ; les vues utilisent déjà des frames fixes (cellules), pas de reflow.
- **Zoom du viewer** : la cible plein écran = largeur écran × scale (image de défaut nette). Le pinch-zoom au-delà interpole ; on ne charge pas l'original 4000px pour un écran ~1200px si une variante 1920 suffit.
- **[N6] Double-download thumbnail** : si la variante full choisie est la plus petite (640, dizaines de Ko) ET qu'un `thumbnailUrl` distinct existe, `ProgressiveCachedImage` fetch les deux. Le `thumbHash` couvrant déjà le remplissage instantané, **passer `thumbnailUrl: nil` quand une variante allégée est sélectionnée** (thumbHash → 640 direct) évite le téléchargement redondant. À décider au câblage ; sinon documenter le compromis.

## 8. Fichiers touchés

| Fichier | Type | Changement | pbxproj |
|---|---|---|---|
| `MeeshySDK/Sources/MeeshySDK/Networking/ImageVariantSelector.swift` | nouveau (SPM) | sélecteur pur | non |
| `MeeshySDK/Tests/MeeshySDKTests/Networking/ImageVariantSelectorTests.swift` | nouveau (SPM) | tests (15 cas) | non |
| `MeeshyUI/Primitives/CachedAsyncImage.swift` | edit | `targetSize` sur `ProgressiveCachedImage.init` (défaut nil) | non |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift` | edit | `targetWidthPx` dans `visualMediaGrid` + thread `cellPointWidth` via `makeGridCell`/`BubbleGridCell`/`BubbleGridImageView` + sélection | non |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift` | edit | sélection variante au `.fullScreenCover` (L471) | non |
| `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` | edit | sélection variante au 2e call site plein écran (L694) | non |

**Zéro édition pbxproj** : nouveaux fichiers dans le package SPM (auto-découverts) ; edits sur fichiers existants. **`ImageViewerView.swift` n'est PAS touché** (chemin inutilisé pour les images de conv — B1).
