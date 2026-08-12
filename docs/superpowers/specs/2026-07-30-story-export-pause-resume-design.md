# Export de story — pause, arrêt et reprise après interruption

Date : 2026-07-30

## Problème

Un export de story est perdu dès que l'utilisateur verrouille son téléphone ou
quitte l'application. Et le seul geste offert sur l'anneau de progression est une
annulation sèche, sans confirmation.

Deux demandes utilisateur :

1. pouvoir **reprendre** un export interrompu par un verrouillage ou une sortie
   de l'app ;
2. au toucher du cercle de progression, choisir entre **Pause** et **Arrêter**
   plutôt que d'annuler immédiatement.

## Contrainte technique déterminante

`AVAssetExportSession` **ne peut pas s'exécuter en arrière-plan** : le système
l'interrompt (erreur −11800), et `beginBackgroundTask` **n'y change rien** —
l'export est coupé avant l'expiration du délai accordé.

Notre pipeline aggrave le cas : `StoryAVCompositor.startRequest` fait un
`DispatchQueue.main.sync` par frame, or le main thread est suspendu en
arrière-plan. Le blocage est donc garanti, pas seulement probable.

`StoryExporter.swift:84-91` affirme aujourd'hui le contraire en commentaire
(« couvrant le cas courant »). Ce commentaire est faux et sera corrigé.

**Conséquence de conception** : la continuité en arrière-plan est impossible. On
vise donc la reprise, ce que l'utilisateur a explicitement accepté comme repli.

Corollaire : l'API n'offre pas de pause, seulement `cancelExport()`. Une
« pause » relance donc l'export depuis le début à la reprise. Une vraie reprise à
mi-parcours exigerait de réécrire le moteur en segments
(`AVAssetWriter` + `AVAssetReader`) — écarté, hors de proportion avec le gain.

## Décisions

| Sujet | Décision |
|---|---|
| Pause | Arrête l'encodage ; la reprise relance depuis le début |
| Interruption subie (verrouillage, arrière-plan) | Reprise **automatique** au retour au premier plan |
| Pause explicite | **Ne** reprend **pas** seule — attend « Reprendre » |
| Portée | Les trois chemins : Photos, partage, composer timeline |
| Images d'identité | Non sérialisées, **re-résolues** à la reprise |

La distinction entre les deux dernières lignes est ce qui donne son sens au
bouton Pause : une pause qui repartirait seule au retour dans l'app ne servirait
à rien.

## Architecture

### `StoryExportJob` — l'intention d'export

Valeur `Codable & Sendable` décrivant ce qu'il faut pour rejouer un export :

- `id: String` — l'identifiant de story, clé de déduplication
- `slide: StorySlide` — déjà `Codable` (`StoryModels.swift:1130`)
- `languages: [String]`
- `destination: .photos | .share | .timeline`
- `identity: Identity?` — `displayName`, `username`, `accentColorHex` **seulement**
- `state: .running | .paused | .interrupted`
- `createdAt: Date`

`identity` ne porte ni avatar ni bannière : ce sont des `CGImage`, non
sérialisables. Elles sont re-résolues au moment de la reprise. Un export repris
après un changement d'avatar utilisera donc le nouveau — écart assumé et
documenté.

### `StoryExportJobStore` — journal persistant

Acteur exposant `save(_:)`, `load() -> [StoryExportJob]`, `remove(id:)`,
`update(id:state:)`. Écriture atomique (fichier temporaire puis `replaceItem`)
dans le conteneur de l'app — pas l'App Group : aucune extension n'y touche.

Plusieurs exports peuvent coexister, comme aujourd'hui
(`StoryPhotoSaveService.jobs` est déjà un dictionnaire).

### Détection d'interruption

Une annulation utilisateur et une coupure système remontent toutes deux en
`.cancelled` / `.failed`. On les sépare par l'**intention** : le service sait
s'il a demandé l'arrêt.

`StoryExporterError` gagne un cas `interrupted`, distinct de `exportFailed`.
Les appelants le traitent comme « à reprendre » et non comme un échec : pas de
toast d'erreur, l'anneau passe en état interrompu.

### Rendre l'annulation réelle

Aujourd'hui `cancel(storyId:)` **n'arrête pas l'encodage** : il avance un jeton
de génération et laisse la session aller au bout, pour jeter son résultat
ensuite. Le code le dit lui-même (« le bake lui-même n'observe pas l'annulation
(AVAssetWriter), mais le résultat tardif est nettoyé ici »).

Tel quel, « Pause » ne libérerait ni le processeur ni la batterie — un faux
bouton. `StoryExporter.export` doit donc propager l'annulation jusqu'à la
session :

```swift
try await withTaskCancellationHandler {
    await session.export()
} onCancel: {
    session.cancelExport()
}
```

C'est le prérequis des trois actions du menu, et de la coupure propre au passage
en arrière-plan. `StoryAVCompositor.cancelAllPendingVideoCompositionRequests`
est déjà en place et sera invoqué par AVFoundation à ce moment.

### Cycle de vie

- **Passage en arrière-plan** — les exports en vol sont marqués `interrupted` et
  persistés. Le `Task` d'export est annulé pour ne pas laisser tourner un
  encodage condamné.
- **Retour au premier plan** — le store est relu : les `interrupted` repartent
  seuls, les `paused` attendent.

L'observation de `scenePhase` vit dans les services (`StoryPhotoSaveService`,
`StoryExportShareViewModel`), pas dans le SDK : c'est de l'orchestration produit.

### Menu de l'anneau

Le tap appelle aujourd'hui `cancel(storyId:)` directement
(`MyStoriesView.swift:866`). Il ouvrira un `confirmationDialog` :

- état **en cours** → « Mettre en pause » · « Arrêter l'export » (destructif)
- état **en pause** → « Reprendre » · « Arrêter l'export »

Le même menu est posé sur la feuille de partage, pour que les trois chemins se
comportent identiquement.

L'anneau reflète l'état : animé en cours, statique et atténué en pause, avec un
libellé d'accessibilité distinct pour chacun.

Une fenêtre reste non annulable : `PHPhotoLibrary.performChanges` n'est pas
interruptible. Le garde existant (`uncancellableJobs`) est conservé et le menu
n'est alors pas présenté.

## Gestion d'erreur

| Cas | Comportement |
|---|---|
| Interruption système | `interrupted` persisté, reprise auto, aucun toast |
| Pause utilisateur | `paused` persisté, attend « Reprendre » |
| Arrêt utilisateur | Job supprimé, MP4 temporaire nettoyé |
| Échec réel d'export | Comportement actuel — toast d'erreur, job supprimé |
| Job illisible / slide corrompue | Job écarté au chargement, journalisé |

## Tests

- `StoryExportJobStore` : aller-retour de sérialisation, écriture atomique,
  suppression, coexistence de plusieurs jobs.
- Annulation réelle : un export annulé se termine par `.cancelled` **avant** sa
  durée nominale — la garde qui prouve que `cancelExport()` est bien atteint et
  que « Pause » libère réellement la machine.
- Transitions d'état : `running → interrupted → running`,
  `running → paused` (ne reprend PAS au premier plan),
  `paused → running` sur action explicite.
- Un `interrupted` ne produit ni toast d'erreur ni suppression du job.
- Le menu : les bonnes actions sont proposées selon l'état, et rien n'est proposé
  pendant la fenêtre non annulable.
- Reprise après changement d'identité : l'export aboutit avec la nouvelle.

## Hors périmètre

- Reprise à mi-parcours (réécriture du moteur en segments).
- Expiration des jobs en attente.
- Reprise conditionnée au réseau ou à la batterie.
- Notification de fin d'export en arrière-plan — impossible, l'export n'y tourne
  pas.
- Le rendu hors du main thread : c'est le gros gisement de performance
  (~×3-4 attendu), mais c'est un chantier distinct.
