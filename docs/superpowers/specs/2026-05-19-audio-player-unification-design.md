# Refonte du lecteur audio iOS — vue unifiée & lecture après envoi

Date : 2026-05-19
Statut : design validé par l'utilisateur

## 1. Contexte & problème

Le widget audio d'une bulle de message (`AudioMediaView`) présente **deux sous-vues
totalement séparées** :

- `audioPlaceholder` — carte avec un bouton « télécharger » + waveform statique ;
- `audioPlayer` — le vrai lecteur (`AudioPlayerView`).

Le choix entre les deux est piloté par :

```swift
isPlayable = isCached || attachment.fileUrl.hasPrefix("file://")
```

où `isCached` est un `@State` alimenté par un `.task` one-shot qui poll
`CacheCoordinator.audio.isCached(resolved)`.

### Symptôme

Juste après l'envoi d'un message audio, l'utilisateur **ne peut pas lire l'audio** :
le placeholder « télécharger » reste affiché alors que l'enregistrement est local.
Il faut quitter la conversation et y revenir pour que le lecteur apparaisse.

### Cause racine

L'audio local (`file://`, message optimiste) et l'audio serveur (`https://`, après
réconciliation) suivent **deux chemins de code distincts**, avec des cas particuliers
éparpillés (`playLocal`, le fast-path du `.task`, le `playButton`).

1. À l'envoi, le message optimiste porte un attachment `fileUrl = file://…`.
   `.task` voit le préfixe `file://` → `isCached = true` → le lecteur s'affiche.
2. Le serveur confirme (`message:new`) → la réconciliation **remplace l'attachment** :
   `fileUrl` devient `https://…`.
3. La bulle est re-créée lors de la réconciliation (changement d'identité de la ligne
   dans le `ForEach`) → le `@State isCached` est perdu → le `.task` one-shot ne se
   relance pas avec la nouvelle URL, ou poll une clé qui ne correspond pas à la clé
   sous laquelle l'audio a été semé dans le cache.
4. Résultat : le placeholder réapparaît et reste jusqu'à un rechargement propre
   (quitter / revenir).

Le `.task` n'a pas de paramètre `id:` : il ne se ré-exécute pas quand `attachment.fileUrl`
bascule de `file://` à `https://`.

## 2. Objectifs

- **Une seule vue audio** : supprimer le swap placeholder ↔ player. Le composant
  `AudioPlayerView` est l'unique surface ; son bouton de tête a 3 états
  (télécharger / téléchargement / play).
- **Lecture immédiate après envoi** : un audio qu'on vient d'enregistrer est local
  donc directement jouable, et le reste à travers la transition optimiste → confirmé.

### Non-objectifs

- **`AudioFullscreenView`** (vue plein écran, noir codé en dur → adaptatif dark/light)
  — traité **par un agent spécialisé séparé**, hors de ce périmètre.
- L'alignement de la coche de livraison dans les bulles texte (`.fixedSize` qui
  écrase le `Spacer` dans `BubbleFooter`) — traité séparément comme bugfix rapide.
- Le téléchargement automatique des audios reçus — comportement « tap pour
  télécharger » conservé.

## 3. Architecture cible

### 3.1 `AudioAvailability` (nouveau, MeeshyUI)

Nouvel enum dans `packages/MeeshySDK/Sources/MeeshyUI/Media/` (nouveau fichier
`AudioAvailability.swift`) :

```swift
public enum AudioAvailability: Equatable {
    case ready                              // jouable : fichier local OU en cache
    case needsDownload                      // audio serveur, pas en cache
    case downloading(progress: Double?)     // en cours ; nil = indéterminé
}
```

C'est une valeur d'état d'UI : elle vit dans MeeshyUI, à côté de `AudioPlayerView`.

### 3.2 `AudioPlayerView` (modifié, MeeshyUI)

Nouveaux paramètres d'init (avec valeurs par défaut pour ne pas casser les
appelants existants — composer, etc.) :

- `availability: AudioAvailability = .ready`
- `onDownload: (() -> Void)? = nil`

Comportement du `playButton` selon `availability` :

| État | Bouton de tête | Waveform / seek | Time row |
|------|----------------|-----------------|----------|
| `.ready` | play / pause (comportement actuel) | active, seekable | temps courant + durée |
| `.needsDownload` | icône télécharger → `onDownload?()` | grisée, non seekable | durée (métadonnée) |
| `.downloading(p)` | anneau de progression (`p`, ou spinner si `nil`) | grisée, non seekable | durée (métadonnée) |

Le footer (`bottomSlot`), la durée et la waveform sont rendus dans **tous** les
états — il n'y a plus de carte placeholder distincte. La waveform passe en gris
tant que `availability != .ready`.

Le contexte composer (`.composerAttachment`) reçoit toujours `.ready` par défaut :
aucun changement de comportement pour l'audio en cours de composition.

### 3.3 `AudioMediaView` (modifié, app)

- **Supprimé** : `audioPlaceholder`, le ZStack de swap `if isPlayable`,
  `isPlayable`, le `@State isCached`.
- **Ajouté** : `@State private var availability: AudioAvailability`.
- **Résolution** via `.task(id: attachment.fileUrl)` (se ré-exécute quand l'URL
  bascule optimiste → serveur) :
  1. `fileUrl.hasPrefix("file://")` et fichier présent sur disque → `.ready` ;
  2. sinon, résoudre la clé serveur et interroger `CacheCoordinator.audio.isCached`
     → `.ready` ou `.needsDownload`.
- **`AttachmentDownloader`** conservé et possédé par `AudioMediaView` ; pendant un
  téléchargement → `.downloading(...)`, à la fin → `.ready`.
- Rend **un seul** `AudioPlayerView`, en lui passant `availability` +
  `onDownload: { downloader.start(...) }`.
- Le bouton plein écran (`onFullscreen` → `.fullScreenCover(AudioFullscreenView)`)
  est conservé tel quel — `AudioFullscreenView` est retravaillée par l'agent dédié.

## 4. Flux de données — transition optimiste → confirmé

```
Enregistrement → attachment optimiste fileUrl = file://tmp/…
   AudioMediaView .task(id: file://…) → fichier présent → .ready → lecteur jouable
TUS upload → audio semé dans CacheCoordinator.audio sous resolveMediaURL(serverUrl)
message:new → réconciliation → attachment.fileUrl = https://…
   AudioMediaView .task(id:) RE-DÉCLENCHÉ (id changé) → résout la clé serveur
   → cache chaud → .ready → le lecteur reste jouable, sans flash de placeholder
```

Point de vérification (instrumentation, phase d'implémentation) : confirmer que
`resolveMediaURL(result.fileUrl)` (clé de semis, à l'upload TUS) est **identique**
à `resolveMediaURL(attachment.fileUrl)` après réconciliation (`message:new`). En
cas d'écart, aligner la clé de semis. Filet de sécurité : ne supprimer
l'enregistrement local (`ConversationView+AttachmentHandlers.swift`, suppression du
fichier après envoi) qu'une fois le cache serveur confirmé chaud.

## 5. Gestion d'erreurs

- Échec de téléchargement → retour à `.needsDownload`, haptique d'erreur, le bouton
  redevient « télécharger » (réessai possible).
- Audio serveur introuvable / 404 → `.needsDownload` persistant ; pas de crash.

## 6. Stratégie de tests

- **XCTest** — la fonction de résolution d'`AudioAvailability` (entrée : attachment
  + état de cache simulé ; sortie : `.ready` / `.needsDownload`). Logique testable.
- **Smoke visuel** :
  - envoi d'un audio → lecteur jouable immédiatement, aucun flash de placeholder ;
  - audio reçu non téléchargé → bouton télécharger → progression → play.
- Build vert via `./apps/ios/meeshy.sh build`.

## 7. Risques

- `AudioPlayerView` est partagé (composer, bulle). Mitigation : `availability`
  par défaut `.ready` → appelants existants inchangés.
- `.task(id: attachment.fileUrl)` peut re-déclencher le chargement de la waveform.
  Mitigation : garde « waveform déjà chargée » conservée.
- La re-création de la bulle à la réconciliation reste (identité de ligne du
  `ForEach`). La refonte rend la vue robuste à cette re-création (résolution rapide
  via `.task(id:)` + cache chaud) plutôt que de supprimer la re-création elle-même
  (qui relève du `ForEach` de la liste de messages — hors périmètre).
- Coordination avec l'agent `AudioFullscreenView` : périmètres de fichiers
  disjoints (`AudioMediaView` / `AudioPlayerView` ici, `AudioFullscreenView`
  là-bas). Seul couplage : `AudioMediaView` présente `AudioFullscreenView` via
  `.fullScreenCover` — interface inchangée par cette refonte.

## 8. Hors périmètre (suivi séparé)

- **`AudioFullscreenView`** — vue plein écran noire à rendre adaptative dark/light :
  prise en charge par un agent spécialisé dédié.
- **Coche de livraison** dans les bulles texte : `textBubbleContent` applique
  `.fixedSize(horizontal: true)` au footer, ce qui écrase le `Spacer(minLength:)` de
  `BubbleFooter.rowFooter` → la coche se colle aux drapeaux de langue au lieu d'aller
  au bord droit (contrairement aux bulles média/grille en footer `.overlay`
  épinglé `.bottomTrailing`). Bugfix rapide traité après cette refonte.
