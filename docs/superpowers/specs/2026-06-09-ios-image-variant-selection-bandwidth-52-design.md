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
| Surfaces | **Bulles inline** (`ProgressiveCachedImage`) **+ viewer plein écran** (`ImageViewerView`) |
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
Fichier `packages/MeeshySDK/Sources/MeeshySDK/Media/ImageVariantSelector.swift` (package SPM → **aucune entrée pbxproj**).

```swift
public enum ImageVariantSelector {
    /// Retourne l'URL de la plus petite image dont la largeur en pixels est
    /// >= targetWidthPx, en considérant `variants` PLUS l'original comme plus
    /// grand candidat. Miroir de l'heuristique srcset web (srcset.ts:17-45).
    /// Retourne `originalURL` quand aucune variante n'existe (image chiffrée)
    /// ou qu'aucun candidat ne convient — fallback à régression nulle.
    public static func bestImageURL(
        variants: [MeeshyImageVariant],
        originalURL: String,
        originalWidth: Int?,
        targetWidthPx: Int
    ) -> String
}
```

**Algorithme** (déterministe, sans effet de bord) :
1. Candidats = variantes filtrées (`url` non vide, `width > 0`), triées par `width` croissante, dédupliquées par `width`.
2. Ajouter l'original comme candidat **ssi** `originalWidth != nil && originalWidth > plus grande largeur de variante` (miroir web : on n'ajoute l'original que s'il est strictement plus grand).
3. Choisir la **plus petite largeur de candidat `≥ targetWidthPx`**.
4. Si aucun candidat ne qualifie (target dépasse tout) → **plus grand candidat**.
5. Si aucun candidat du tout (pas de variante ET pas de largeur originale exploitable) → `originalURL`.
6. Défensif : `targetWidthPx <= 0` → plus petit candidat (ou `originalURL` si vide).

Pur, déterministe, entrées `Sendable`, format-agnostique (ne lit jamais `format`). Analogue direct du précédent `MediaDownloadPolicyEngine.shouldAutoDownload` (`MeeshySDK/CLAUDE.md:6-43`, « Rule engines stateless → SDK »).

### 4.2 MeeshyUI — primitive (modifié)
`ProgressiveCachedImage.init` (`CachedAsyncImage.swift:354`) gagne `targetSize: CGSize? = nil` (défaut = comportement actuel inchangé). Threadé vers `maxPixelSize = max(w,h) × UIScreen.main.scale` lors du load cache, **exactement comme `CachedAsyncImage`** (`CachedAsyncImage.swift:25-50`). Rôle : plafonner le **bitmap décodé** (mémoire) à la taille d'affichage — complémentaire au gain d'**octets téléchargés** apporté par la sélection de variante.

### 4.3 Câblage (sélection aux call sites)
- **`BubbleGridImageView`** (app, `BubbleStandardLayout+Media.swift:439-463`) : pour chaque attachment image, `targetWidthPx = cellWidthPoints × UIScreen.main.scale` → `ImageVariantSelector.bestImageURL(variants: att.imageVariants ?? [], originalURL: att.fileUrl, originalWidth: att.width, targetWidthPx:)` → URL passée en `fullUrl` + `targetSize` au `ProgressiveCachedImage`.
- **`ImageViewerView`** (MeeshyUI, `ImageViewerView.swift:90-97`) : reçoit **déjà** l'`attachment: MeeshyMessageAttachment` complet (`ImageViewerView.swift:8`) → accès direct à `imageVariants`/`fileUrl`/`width`, **aucun changement d'API**. `targetWidthPx = screenWidth × scale` → même sélecteur → URL choisie. Le `targetSize` passé à `CachedAsyncImage` passe du **`280×280` hardcodé (sur-downsample, flou) à la taille écran** — fix annexe de qualité. Appel d'un atome pur SDK depuis MeeshyUI = conforme à la pureté (paramètres opaques, pas de cascade, pas de singleton).

### 4.4 Cache (inchangé)
Chaque URL de variante est une clé distincte (`DiskCacheStore.swift:509-514`, SHA256 de l'URL) → caching séparé naturel, aucune collision, aucune modification du cache. Le gain = télécharger ~640px (dizaines de Ko) au lieu de l'original (Mo) dans une cellule 180-240pt.

## 5. Justification pureté SDK

| Élément | Placement | Raison (test du grain, `MeeshySDK/CLAUDE.md:6-43`) |
|---|---|---|
| `ImageVariantSelector.bestImageURL` | **SDK** | Fonction pure stateless, params opaques, agnostique produit, pas de singleton, pas de cascade → atome (précédent `MediaDownloadPolicyEngine`) |
| `targetSize` sur `ProgressiveCachedImage` | **MeeshyUI** | Paramètre UI pur d'un primitive (comme `CachedAsyncImage`) |
| Choix de la frame + appel sélecteur + fallback | **App / call site** | Décision UX produit « quelle taille cible, quoi charger » (précédent `VideoAvailabilityResolver`) |

## 6. Plan de test (TDD)

`ImageVariantSelectorTests` (Swift Testing, pur, package SPM → pas de pbxproj) :
1. Plus petite variante `≥ target` choisie (ex. target 700, variantes 640/1080/1920 → 1080).
2. Match exact (target 640 → 640).
3. Target entre deux (target 641 → 1080).
4. Target > toutes **et** original plus grand → original.
5. Target > toutes **et** original ≤ plus grande variante → plus grande variante.
6. Aucune variante → `originalURL` (cas chiffré).
7. Variantes `width=0` / `url` vide filtrées.
8. `originalWidth == nil` → pas d'upscale candidate, plus grande variante (ou original si pas de variante).
9. Format-agnostique : un mix `webp`/`avif` sélectionne par width seule.
10. `targetWidthPx <= 0` → plus petit candidat (défensif).

Validation build : `meeshy.sh build` (app + edits ProgressiveCachedImage/ImageViewerView/BubbleGridImageView) + suite SDK pour le sélecteur. Pas de régression sur les suites existantes.

## 7. Edge cases & risques

- **Chiffré** : `imageVariants == nil` → `bestImageURL` renvoie `originalURL` → comportement actuel, zéro régression.
- **`width` original nil** : l'original n'est pas ajouté comme candidat upscale ; on sert la plus grande variante (ou l'original si aucune variante).
- **Risque visuel** : une variante trop petite = flou. Écarté par la règle « plus petite `≥ target` » (jamais sous la cible) + downsampling `targetSize`. **Check visuel device recommandé** (hors environnement build).
- **Cohérence dimensions** : la variante choisie a son propre `width/height` ; les vues utilisent déjà des frames fixes (cellules), pas de reflow.
- **Zoom du viewer** : la cible plein écran = largeur écran × scale (image de défaut nette). Le pinch-zoom au-delà interpole — acceptable et déjà bien meilleur que le `280×280` actuel ; on ne charge pas l'original 4000px pour un écran ~1200px si une variante 1920 suffit.

## 8. Fichiers touchés

| Fichier | Type | Changement | pbxproj |
|---|---|---|---|
| `MeeshySDK/Sources/MeeshySDK/Media/ImageVariantSelector.swift` | nouveau (SPM) | sélecteur pur | non |
| `MeeshySDK/Tests/MeeshySDKTests/Media/ImageVariantSelectorTests.swift` | nouveau (SPM) | tests | non |
| `MeeshyUI/Primitives/CachedAsyncImage.swift` | edit | `targetSize` sur `ProgressiveCachedImage` | non |
| `MeeshyUI/Media/ImageViewerView.swift` | edit | sélection variante vs 280×280 | non |
| `apps/ios/.../Bubble/BubbleStandardLayout+Media.swift` | edit | câblage `BubbleGridImageView` | non |

**Zéro édition pbxproj** : nouveaux fichiers dans le package SPM (auto-découverts) ; edits sur fichiers existants.
