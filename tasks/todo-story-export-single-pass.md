# Export story — passe unique (marque composée dans le bake)

## Contexte mesuré (2026-07-30)

Export d'une story de 6 s, simu iOS 26, compte meeshy sama :
`5,6 s` → `3,8 s` après (a) bake ramené à 30 fps, (b) fusion intro+outro en une
passe, (c) mémoïsation des artefacts de marque.

Décomposition restante (story 10 s) : bake `2,0 s` + emballage `2,4 s`, dont
**`2,5 s` d'encodage final** — le ré-encodage intégral de la story pour lui
coller 3,2 s de marque. Dernière grosse dépense évitable.

## Objectif

Une seule passe d'encodage : la marque entre dans la composition du bake.

**Décision d'architecture** : les clips de marque restent des PISTES VIDÉO
pré-encodées et mémoïsées (déjà gratuites, cf. `brandOutroClip`), insérées dans
la composition du bake ; le compositor les compose par opacité. On ne les fait
PAS redessiner par le compositor — ce serait ~96 frames CoreGraphics par export,
ce qui annulerait le bénéfice du cache.

## Étapes

- [ ] A. `StoryBrandingPlan` : clips + jingles résolus (via le cache) + timings
- [ ] B. `StoryExporter.export(branding:)` — décaler la story de `storyStart`
      - [ ] piste vidéo story insérée à `storyStart` (loop + no-loop + tail)
      - [ ] `composeBackgroundVideoAudio` : insertion décalée
      - [ ] `composeAudioLanes` : insertion ET rampes décalées
      - [ ] durée totale = storyStart + D + queue outro
      - [ ] pistes intro/outro + jingles ajoutées à la composition
- [ ] C. `StoryAVCompositor` — multi-pistes
      - [ ] `storyTime = compositionTime - storyStart` pour tout le rendu
      - [ ] ne rien peindre de la story quand `storyTime < 0`
      - [ ] composer intro/outro par-dessus avec leur opacité de fondu
- [ ] D. `StoryVideoExportService` + `TimelineExportFlow` → un seul appel
- [ ] E. Tests : équivalence durée/gabarit/audio avec le chemin `wrap`

## Garde-fous

- `StoryExportBranding.wrap` RESTE en place tant que l'équivalence n'est pas
  prouvée — c'est le point de comparaison des tests.
- Pièges historiques à ne pas rouvrir : « son sur fond noir » (le compositor doit
  peindre `sourceFrame`), overlay figé, deadlock `copyCGImage` sous `main.sync`.
- Divergence à préserver : timeline ferme sur le logo seul, partage/Photos sur la
  carte d'auteur.

## Review — REJETÉE SUR MESURE (2026-07-30)

Toutes les étapes A→E sont faites et **fonctionnellement correctes** :
`StoryExportSinglePassTests` (4 tests) prouve que `export(branding:)` produit le
même fichier que `bake + wrap` — durée, gabarit, pistes audio, dans les trois
configurations (identité complète, logo-seul, sans identité).

**Mais la passe unique est 5 à 20× PLUS LENTE.** Mesures répétées (4 exécutions,
charges machine variées) :

| Story | 2 passes (bake + wrap) | 1 passe |
|---|---|---|
| 6 s | 3,1 · 5,4 · 39,7 s | 54,9 · 75,5 · 108,3 s |
| 15 s | 7,7 · 7,9 · 56,1 s | 20,5 · 76,1 · 76,4 s |

Le chiffre de la passe unique est trop stable (~76 s à trois reprises) pour être
du bruit. **Faire composer trois pistes vidéo au compositor custom coûte bien
plus cher que le ré-encodage qu'on cherchait à supprimer.**

Tenté sans succès : segmenter la timeline en 3 instructions pour restreindre
`requiredSourceTrackIDs` segment par segment (recommandation Apple). Amélioration
partielle sur la story de 15 s, aucune sur celle de 6 s.

Cause racine NON identifiée — suspects non départagés :
- `paintBrandFrame` fait un `CIContext.createCGImage` 1080×1920 par frame de
  marque (~156 frames) ;
- `beginTransparencyLayer` sur les frames de fondu ;
- le décodage des pistes de marque, qui passe désormais par le compositor custom
  au lieu du chemin natif d'`AVAssetExportSession`.

**État du code** : les appelants (`StoryVideoExportService`, `TimelineExportFlow`)
sont revenus à `StoryExportBranding.wrap`. Le paramètre `branding:` reste dans
l'API, testé mais non branché. Ne PAS le rebrancher sans mesure préalable, sur
machine au repos (`load average < 5`).

## Suite — voir le plan « export instantané + reprise en arrière-plan »

Le vrai gisement n'est pas le nombre de passes mais le `DispatchQueue.main.sync`
par frame dans `StoryAVCompositor.startRequest`, qui sérialise tout le rendu sur
un seul cœur.
