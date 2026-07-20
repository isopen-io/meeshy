# Iteration 182 — `computeStoryDurationMs` (web) diverge du SSOT iOS qu'il prétend porter « 1:1 » → durée de story fausse (auto-advance trop tôt)

## Protocole (démarrage)
`main` @ `f3947be8` (derniers merges : #2068 android/status disk L2 cache, #2065
status-feed toggle, #2057 gateway device-locale bounded cache…). Branche
`claude/brave-archimedes-thqz1u` alignée sur `origin/main`. Ce cycle prend **182**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Les itérations 180/181 ont épuisé les cibles
Prisme immédiates (normalisation des codes langue web, borne du cache
device-locale). Point de départ : **revue Priorité 1** (fonctionnalités récentes)
sur la story timeline WYSIWYG (`feat/story-timeline-wysiwyg`, travail le plus
récent visible dans `git log`), portée sur la surface web testable.

## Current state
`apps/web/lib/story-transforms.ts` → `computeStoryDurationMs(effects)` calcule la
durée d'affichage d'une story côté web. Son en-tête le documente comme la
**« single source of truth ported 1:1 from the iOS SDK »**
(`StoryEffects.contentDerivedDuration` dans
`packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:1039-1079`).

Le SSOT Swift (autorité) :

```swift
let mediaWindows = (mediaObjects ?? []).compactMap { m in m.duration.map { (m.startTime ?? 0) + $0 } }
let audioWindows = (audioPlayerObjects ?? []).compactMap { a in a.duration.map { Double($0) + Double(a.startTime ?? 0) } }
let longestData = (mediaWindows + audioWindows).max() ?? 0
let target = max(textDur, defaultStaticDuration, longestData)              // ← inclut longestData
let bgLoopPeriods = [bgVideoDur, bgAudioDur].compactMap { $0 }.filter { $0 > 0.001 } // ← LES DEUX loops
let bgResult = bgLoopPeriods.reduce(target) { eff, period in
  max(eff, period >= target ? period : (target / period).rounded(.up) * period)
}
return max(bgResult, longestData)
```

Le portage web (avant ce cycle) :

```js
const rawMediaDur = bgVideoDur ?? bgAudioDur;               // (1) ignore bgAudio si bgVideo présent
const target = Math.max(textDur, DEFAULT_STATIC_DURATION_S); // (2) AUCUN terme longestData
const fgMediaMax = mediaObjects.filter(m => m.isBackground !== true)
  .map(m => positiveNumber(m.duration) ?? 0).reduce((a,b)=>Math.max(a,b),0); // (3) vidéo seule, ignore startTime + TOUT l'audio
return Math.round(Math.max(bgResult, fgMediaMax) * 1000);
```

## Problems identified
Trois divergences, chacune produisant une durée de lecture / auto-advance FAUSSE
côté web (l'iOS joue la bonne durée, le web coupe trop tôt) :

1. **L'audio de premier plan est totalement ignoré.** `fgMediaMax` ne balaye que
   `mediaObjects` (vidéo) ; les `audioPlayerObjects` ne contribuent jamais à
   `longestData`.
   *Scénario* : `{ audioPlayerObjects: [{ isBackground: false, duration: 30 }] }`
   → iOS **30 000 ms**, web **6 000 ms**. La story avance à 6 s alors que l'audio
   dure 30 s.
2. **La fenêtre d'audio de fond est perdue dès qu'une vidéo de fond existe**
   (`bgVideoDur ?? bgAudioDur` retient la vidéo). *Scénario* : bg vidéo 5 s + bg
   audio 30 s → iOS **30 000 ms**, web **10 000 ms**. De plus le web ne boucle que
   la vidéo — pas les deux périodes.
3. **Les décalages `startTime` sont ignorés** pour le foreground et pour la cible
   du loop. *Scénario* : bg vidéo 4 s + clip fg `{ startTime: 10, duration: 5 }`
   → fenêtre iOS 15 s (donc target 15 s, loop bg → 16 s), web `fgMediaMax = 5`.

`StoryAudioPlayerObject.duration`/`startTime` et `StoryMediaObject.startTime`
sont des champs wire réels (StoryModels.swift:588,625 et 316,334) persistés par la
gateway — ces payloads existent en production.

## Root cause
Le portage web a réimplémenté « à la main » l'algorithme au lieu de mirrorer
fidèlement l'extraction `contentDerivedDuration` : il a réduit le concept unifié
de **fenêtre temporelle** (`(startTime ?? 0) + duration`, tous médias + audio) à
un simple « max des durées vidéo », et le concept de **deux périodes de boucle**
(vidéo + audio) à « la première présente ». Le commentaire « ported 1:1 » n'a pas
suivi l'évolution du SSOT Swift (extraction `contentDerivedDuration`, design doc
2026-07-18) — dérive classique d'une SSOT dupliquée.

## Business / Technical impact
- **UX (produit)** : les stories web avec audio (voix, musique) ou clips décalés
  s'auto-avancent avant la fin du contenu — l'utilisateur manque la fin d'un
  vocal / d'une piste. Incohérence directe iOS ↔ web sur une fonctionnalité
  vitrine récente.
- **Cohérence** : rétablit la parité stricte du dernier calcul de durée web avec
  l'autorité Swift.
- **Correctness** : inchangée pour les cas déjà couverts (vidéo de fond, texte
  long) — les 10 tests préexistants restent verts sans modification.

## Risk assessment
Faible. Fonction **pure**, entièrement couverte par un fichier de tests dédié.
Les 10 assertions historiques passent à l'identique (vérifié à la main puis en
exécution) car aucune n'exerçait audio/startTime. La réécriture n'ajoute que des
chemins (fenêtres audio, offsets, second loop) sans altérer les chemins existants.
Type de retour inchangé (`number` ms).

## Proposed improvements / Correctif (TDD)
- **RED** : +5 tests (`story-transforms-extended.test.ts`, bloc
  `computeStoryDurationMs`) — (a) audio fg 30 s → 30 000 ; (b) bg vidéo 5 s + bg
  audio 30 s → 30 000 ; (c) boucle des DEUX périodes (bg vidéo 4 s + bg audio 7 s
  → 8 000) ; (d) offset `startTime` fg → fenêtre 15 s puis loop 16 000 ; (e) offset
  `startTime` audio → fenêtre 35 000.
- **GREEN** : réécriture du corps de `computeStoryDurationMs` en miroir du SSOT
  Swift — `timelineWindow(obj) = (startTime ?? 0) + duration` sur **tous** les
  médias + audio → `longestData` ; `target = max(textDur, 6, longestData)` ;
  `bgLoopPeriods = [bgVideoDur, bgAudioDur]` (garde `> 0.001` comme le
  `.filter { $0 > 0.001 }` Swift) réduits contre `target` ;
  `return max(bgResult, longestData)`. Helpers ajoutés : `finiteNumber`,
  `loopPeriod`, `timelineWindow`.

## Expected benefits
- Parité stricte web ↔ `StoryEffects.contentDerivedDuration` (iOS) pour toute
  story portant de l'audio (fond ou premier plan) ou des clips décalés.
- Fin de l'auto-advance prématuré sur les stories audio/timeline côté web.
- Dernier calcul de durée web réaligné sur l'unique autorité.

## Implementation complexity
Faible-moyenne — réécriture bornée (~25 lignes) d'une fonction pure dans un seul
fichier, guidée par le SSOT Swift ligne à ligne.

## Validation criteria
- `apps/web` : `story-transforms-extended.test.ts` **76/76** (15 dans le bloc
  `computeStoryDurationMs` : 10 préexistants + 5 nouveaux) ; les 3 suites story
  (`story-transforms`, `-fidelity`, `-extended`) **127/127** verts.
- `tsc --noEmit` : **0 nouvelle erreur** sur `story-transforms.ts`.

## Backlog (candidats consignés pour une itération future)
- `TrackingLinkService.generateUniqueToken` (`services/gateway/src/services/TrackingLinkService.ts:99-114`)
  — off-by-one : le `throw` au franchissement de `maxAttempts` se déclenche
  **avant** que le token fraîchement généré soit vérifié → 9 vérifications
  effectives au lieu de 10, et un token unique peut être rejeté. Bénin (espace
  62⁶ + rate limiting) ; RED-test plus coûteux (mock Prisma requis). À traiter si
  le service est retouché.
- `MeeshySocketIOManager.ts:752` — ordre de résolution différent (sémantique
  « présence key ») : hors périmètre, ne PAS uniformiser sans analyse dédiée.
- F69 (`sanitizeFileName` overlong sans extension) : latent, 0 appelant.
