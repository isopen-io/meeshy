# Cycle 90 — Trois couches de la même divergence, chacune cachant la suivante

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-inwn81`
**Périmètre** : traducteur — `services/voice_api/operation_handlers.py` ;
passerelle — `services/voice-analysis-normalize.ts` (neuf),
`services/AudioTranslateService.ts`, `services/VoiceAnalysisService.ts`,
`routes/voice-analysis.ts`, `routes/voice/types.ts` ;
partagé — `types/voice-api.ts` ; web — `components/settings/voice/VoiceQualityConfig.tsx`

**Clients touchés** : aucun nom d'événement ajouté ni retiré, aucune charge utile
temps réel modifiée, aucune ligne de Socket.IO touchée. Cinq routes REST
d'analyse vocale passent de **500 systématique** à une réponse servie — voir §6.

---

## 1. D'où vient ce cycle

L'inventaire du cycle 89 (§7) plaçait en tête les quatre `analysis` de
`voice-analysis.ts` : des charges utiles `200` déclarées `{ type: 'object' }` nu,
donc servies `{}`.

En ouvrant le premier site, la question de routine du cycle 88 — *l'enveloppe
est-elle décrite ?* — a répondu **oui** : le schéma décrit bien `{ success, data }`,
la déclaration s'applique, le champ sortait vraiment vide. Le site était donc un
vrai défaut de forme.

Restait à savoir **ce que la route sert** pour le déclarer. C'est en remontant
jusqu'à l'émetteur que le cycle a changé de nature.

## 2. La panne : deux méthodes qui n'existent pas

`services/voice_api/operation_handlers.py` appelait, sur le service injecté par
`main.py` (`VoiceAnalyzerService`) :

```python
result = await self.voice_analyzer.analyze(audio_path=…, analysis_types=…)
result = await self.voice_analyzer.compare_voices(audio_path_1=…, audio_path_2=…)
```

Mesuré en construisant le VRAI service (aucun double) :

```
ANALYZE -> False | VoiceAnalyzerService.analyze() got an unexpected keyword argument 'analysis_types'
COMPARE -> False | 'VoiceAnalyzerService' object has no attribute 'compare_voices'
```

`analyze` prend `(audio_path, use_cache)`. La méthode de comparaison s'appelle
`compare`. Les deux exceptions sont avalées par le `except Exception` du handler
et ressortent en `INTERNAL_ERROR`.

`ENABLE_VOICE_API` vaut `"true"` par défaut (`config/settings.py:25`), donc
l'analyseur EST construit en production. **`voice_analyze` et `voice_compare`
étaient morts, pour tout le monde** : les cinq routes de `voice-analysis.ts`,
`POST /voice/analysis` et `POST /voice/compare` ne rendaient jamais 200.

### La jumelle, encore

`compare_voices` existe — sur `voice_clone.VoiceAnalyzer`, l'AUTRE analyseur du
dépôt, que `main.py` n'injecte pas ici, et dont la signature est
`(original_path, cloned_path)`. Cet analyseur-là n'a pas de méthode `analyze`
non plus (seulement `analyze_audio`).

`operation_handlers` était donc écrit contre **aucune des deux classes** : une
API composite qui n'a jamais existé nulle part. C'est ce qui rend le correctif
sans ambiguïté — les noms de paramètres du site d'appel (`audio_path_1`,
`audio_path_2`) sont mot pour mot ceux de `VoiceAnalyzerService.compare`, donc
c'est bien lui le collaborateur voulu, et seul le NOM de la méthode avait dérivé.

## 3. Pourquoi personne ne l'avait vu

`tests/test_13_voice_api_handler.py` couvrait les deux opérations. Deux défauts
de harnais, chacun suffisant :

| témoin | ce qui l'a rendu aveugle |
|---|---|
| `test_handle_analyze_success` | le double était un `MagicMock()` NU : il accepte n'importe quel argument nommé |
| `test_handle_compare_success` | il assertait `result['type'] in ['voice_api_success', 'voice_api_error']` — **il ne pouvait pas tomber** |

Et un `MagicMock` nu FABRIQUE tout attribut demandé : `compare_voices` naissait à
l'appel. Le double rendait en prime une charge utile camelCase (`timbre`,
`spectralCentroid`, `voiceType`) qu'aucun émetteur du dépôt ne produit — la
fiction du §4, figée dans une fixture.

**Le correctif de harnais est `create_autospec`, pas `spec`.** `MagicMock(spec=X)`
ne contrôle que l'EXISTENCE des attributs, jamais les signatures ; et
réassigner `service.analyze = AsyncMock(...)` effacerait de toute façon ce que le
`spec` y avait posé. Vérifié : avec `spec=`, la production revertie laissait
`test_handle_analyze_serves_the_emitted_families` **passer**. Avec
`create_autospec(VoiceAnalyzerService, instance=True)` et
`service.analyze.return_value = …`, elle tombe.

## 4. La fiction : deux formes qui ne partagent aucune feuille

| émis — `VoiceCharacteristics.to_dict()` | déclaré — `VoiceAnalysisResult` |
|---|---|
| `pitch.mean_hz`, `std_hz`, `min_hz`, `max_hz` | `pitch.mean`, `std`, `min`, `max` |
| `spectral.centroid_hz`, `bandwidth_hz`, … | `timbre.spectralCentroid`, `spectralBandwidth`, … |
| `energy.mean`, `dynamic_range_db` | `energy.rms`, `dynamicRange` |
| `classification.voice_type`, `estimated_gender` | `classification.voiceType`, `gender` |
| `metadata.confidence` | `classification.confidence` |
| `quality`, `prosody`, `metadata` | — |
| — | `pitch.contour`, `mfcc.coefficients`, `energy.peak` |

**Pas une feuille en commun.** Quatre familles portent le même nom au premier
niveau — `pitch`, `mfcc`, `energy`, `classification` — et c'est exactement ce
qui rendait les deux formes crédibles au coup d'œil ; `timbre` n'existe pas du
tout côté émetteur.

`AudioTranslateService.analyzeVoice` faisait
`this._sendRequest<VoiceAnalysisResult>(…)` : un cast, donc un vœu. Rien ne le
vérifiait.

### Le piège du correctif « évident »

Écrire le schéma depuis le type TypeScript — le geste naturel — aurait servi
`{ pitch: {}, mfcc: {}, energy: {}, classification: {} }` et **supprimé**
`spectral`, `quality`, `prosody`, `metadata`. Une réponse d'apparence correcte,
aux bons noms de famille, entièrement vide. C'est la raison pour laquelle la
règle du cycle 89 valait d'être suivie à la lettre ici : **on répare un schéma en
le confrontant à ce que l'ÉMETTEUR émet.** Le type déclaré n'est pas une source
de vérité s'il n'a jamais été confronté.

## 5. La constante : 0,45, pour toute voix, toujours

`VoiceAnalysisService.calculateQualityMetrics` lit :

| lecture | clé réelle | valeur obtenue |
|---|---|---|
| `analysis.energy.dynamicRange` | `dynamic_range_db` | `undefined` ⇒ `clarity = 0` |
| `analysis.pitch.std / analysis.pitch.mean` | `std_hz` / `mean_hz` | `0 / 1` ⇒ `consistency = 1` |
| `analysis.classification.confidence` | sous `metadata` | `undefined` ⇒ défaut `0.5` |

D'où `overallScore = 0 × 0,4 + 1 × 0,3 + 0,5 × 0,3 = 0,45` — qualité **« fair »**,
`suitableForCloning: **false**`, pour n'importe quel enregistrement. Une métrique
qui n'écoutait pas l'audio, et dont les chiffres semblaient parfaitement
plausibles.

Ses témoins étaient verts : `VoiceAnalysisService.test.ts` FABRIQUAIT la forme
déclarée avant de la passer au service. Ils parcourent correctement les seuils de
`trainingQuality` — sur une charge utile que la production ne recevait pas.

**Trois couches, chacune cachant la suivante.** La panne (§2) empêchait d'atteindre
la fiction (§4) ; la fiction figeait la métrique (§5) ; le schéma nu (§1) vidait
le tout avant l'affichage. Réparer une seule couche n'aurait rien montré :
réparer le traducteur seul aurait servi `{}` ; réparer le schéma seul aurait servi
une charge utile aux mauvais noms ; réparer les deux sans normaliser aurait servi
la constante 0,45 sous des libellés de mesure.

## 6. La réparation

1. **Traducteur** — `analyze(audio_path=…)` (l'argument `analysis_types` ne
   sélectionne RIEN : `VoiceAnalyzerService` fait une passe librosa complète ; il
   est accepté pour compatibilité de fil et documenté comme tel) et
   `compare(audio_path_1=…, audio_path_2=…)`.
2. **Normaliseur à la frontière** — `services/voice-analysis-normalize.ts`, le
   seul endroit où la traduction de forme a lieu : là où le cast était.
   `normalizeVoiceAnalysis`, `normalizeVoiceProsody`, `normalizeVoiceComparison`,
   `normalizeStoredAnalysis`.
3. **Les métriques deviennent justes SANS changer une ligne de leur calcul** —
   elles lisaient les bonnes clés d'un objet qui n'en avait aucune. C'est la
   mesure que le correctif est au bon endroit.
4. **Le type partagé cesse de mentir** — `contour`, `coefficients` et `peak`
   passent optionnels : l'émetteur ne les produit pas, et un champ obligatoire
   que rien n'écrit n'a jamais rendu la donnée présente.
5. **Les quatre schémas** — `voiceQualityAnalysisSchema` (analyse + prosodie +
   métriques), construit à partir de `voiceAnalysisResultSchema` qui existait
   déjà, correct, dans `routes/voice/types.ts` — et que la fiction rendait
   inoffensif jusqu'ici.
6. **Le lot** — `success[]` et `failures[]` déclarent enfin leurs éléments.
7. **Le web** — `QualityMetric` ne rend RIEN pour une valeur `undefined` : une
   métrique non mesurée ne s'affiche pas sous un libellé de mesure.

### La jumelle prise dans le même lot

`normalizeVoiceComparison` n'était pas demandée par l'inventaire. Elle est là
parce que la comparaison porte **exactement** la même divergence — `components`
imbriqué contre champs à plat, `is_likely_same_speaker` contre `verdict` — et que
la laisser pour plus tard aurait reproduit la faute que `services/gateway/CLAUDE.md`
nomme depuis le cycle 85 : corriger un exemplaire et laisser sa jumelle cassée
un fichier plus loin.

`verdict` n'a que **deux** valeurs atteignables : l'émetteur ne connaît qu'un
seuil (`overall_score >= 0.75`). `'uncertain'` reste dans l'union parce que les
clients le typent, mais lui inventer une bande de scores dans un adaptateur
serait une décision produit que personne n'a prise.

## 7. Témoins

**Traducteur** — `test_13_voice_api_handler.py` : le double passe en
`create_autospec`, sa charge utile devient celle du vrai `to_dict()`, le témoin
de comparaison exige `voice_api_success`, un témoin d'analyse neuf assert sur les
familles émises. **ROUGE prouvé : 3 des 3 tombent** contre la version `main` de
`operation_handlers.py` — dont `test_handle_analyze_success`, qui existait déjà
et passait sur un mensonge.

**Passerelle** — `voice-analysis-normalize.test.ts` (neuf, 17 témoins) : les
charges utiles y sont CAPTURÉES en exécutant les vrais handlers Python, pas
recopiées d'un type.

`VoiceAnalysisService.test.ts` : deux témoins font passer la charge utile réelle
par le VRAI normaliseur et vérifient que `clarity`, `consistency` et le score
varient avec l'audio ; un troisième, de CONSTAT, fige la signature `0,45 / fair /
pas bon pour le clonage` que rend une charge utile NON normalisée — pour que
quiconque réintroduirait un chemin brut voie la constante qu'il rallume.

`voice-analysis.test.ts` : 6 témoins traversent `app.inject()` et assertent sur
des VALEURS. **ROUGE : 5 des 6 tombent** contre la version `main` du fichier de
routes.

**Le sixième ne tombe pas, et c'est mesuré, pas supposé** : le lot déclarait
`success: { type: 'array' }` sans `items`, et `fast-json-stringify` laisse alors
passer les éléments INTACTS. Vérifié au compilateur :

```
in : { success:[{a:1,b:{c:2}}] }   out: {"success":[{"a":1,"b":{"c":2}}]}
```

**Un tableau sans `items` est permissif ; un objet sans `properties` efface.**
L'asymétrie vaut d'être retenue — c'est elle qui justifie que le balayage ne
signale que les seconds. Déclarer les éléments du lot reste un gain de contrat,
pas une réparation de fuite ; dit ici, pas compté.

## 8. Coût

Une conversion de forme par réponse d'analyse, en O(1) sur une poignée de
champs. Aucune requête ajoutée, aucun appel réseau, aucun chemin de code
supplémentaire.

## 9. Ce que ce cycle laisse ouvert

**Inventaire : 11 sites restants** (15 − 4) :

| champ | sites |
|---|---|
| `message` × 2 | `conversations/messages-advanced.ts` |
| `attachment` × 2 + `transcription` | `voice/translation.ts` |
| `sender` | `messages.ts` — dette de FORME seulement (cycle 88) |
| `creator`, `details`, `link`, `permissions`, `user` | un par un |

Et, propre à ce cycle :

- **`VoiceProfileService` (`:547`, `:730`) écrit le format de FIL dans
  `UserVoiceModel.voiceCharacteristics`** ; ce cycle pose la lecture
  (`normalizeStoredAnalysis`) mais ne touche pas l'écriture. Deux formats
  cohabitent donc en base, réconciliés à la lecture. Normaliser à l'écriture est
  un lot en soi — il faut décider quoi faire des documents déjà écrits.
- **`analysisTypes` ne sélectionne rien**, de bout en bout : l'analyseur fait une
  passe complète. Le paramètre est accepté et documenté comme inerte. Le retirer
  du contrat est un changement d'API, donc une décision.
- **Le balayage ne connaît toujours pas l'enveloppe** (dette du cycle 88), ni
  `packages/shared` (dette du cycle 89).
- **Dette d'environnement, inchangée depuis le cycle 79** : `npx eslint` échoue
  dans ce conteneur. S'y ajoute, côté Python, `librosa` absent — un témoin de
  cache de `test_12_voice_api_services.py` échoue ici pour cette raison seule
  (fichier non touché par ce lot ; vert en CI).

## 10. La leçon

> **Un défaut de forme peut être la troisième couche d'une pile, et c'est la
> couche la plus visible qui masque les deux autres.** L'inventaire disait « ce
> champ sort vide ». Il sortait vide — et la route ne rendait jamais 200, et la
> charge utile qu'elle aurait rendue n'avait aucune clé en commun avec son
> contrat, et la métrique qu'on en tirait était une constante. **Remonter
> jusqu'à l'émetteur n'est pas de la minutie : c'est la seule façon de savoir
> combien de couches on répare.**

Et le corollaire, sur les doubles de test :

> **Un `MagicMock` nu n'est pas un double, c'est un oui-oui.** Il accepte tout
> argument nommé et fabrique tout attribut demandé — donc il rend vertes les
> deux formes exactes de panne qui tuaient ces routes. `create_autospec` (jamais
> `spec=` seul, qu'une réassignation d'attribut efface) coûte une ligne et
> transforme un décor en garde. Le second témoin, lui, acceptait `success` OU
> `error` : celui-là n'était même pas un décor.
