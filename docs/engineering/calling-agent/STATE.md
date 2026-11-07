# Routine « calling agent » : journal de continuité

Ce fichier est un JOURNAL : il dit d'où repart le cycle suivant. Il ne pilote rien.
L'état d'une tâche vit dans son issue GitHub (CLAUDE.md racine, § « Pilotage du
développement ») : en cas d'écart, l'issue a raison. Le backlog de la routine est la
liste des issues `appels` du milestone #31 « Appels de groupe et appels traduits »
et du milestone #6, pas une liste dans ce dossier.

## Cycle 1 — 2026-11-06

- **Base** : `origin/dev` @ `782fca69a`.
- **Branche** : `claude/fervent-wozniak-7fylor`, PR #16549 vers `dev`.
- **Objectif** : #16548, sous-issue de #3722 (« sous-titres traduits affichés en < 2 s »).
  Le critère de #3722 n'était mesurable par rien.
- **Livré** :
  - `services/gateway/src/services/metrics/callCaptionMetrics.ts` :
    `call_caption_translation_seconds{outcome=translated|timeout|error}` et
    `call_caption_deliveries_total{path=translated|timeout|error|same_language|untranslated}`,
    rangés dans le registre que le port interne `METRICS_PORT` sert déjà.
  - le relais `translateAndEmitSegment` les alimente, une observation par LANGUE servie.
- **Tests** : `callCaptionMetrics.test.ts` 8/8, en passant par le vrai relais. Rouge prouvé en
  retirant `finish('translated')` (2 témoins tombent) puis `finish('timeout')` (1 témoin tombe).
  Suites d'appel 363/363. `tsc --noEmit` code 0.
- **Mesures** : aucune encore. Les séries existent ; les chiffres viendront du staging.

### Lire les chiffres (staging, port interne)

```
histogram_quantile(0.95, sum by (le) (rate(call_caption_translation_seconds_bucket{outcome="translated"}[1h])))
sum(rate(call_caption_deliveries_total{path="translated"}[1h])) / sum(rate(call_caption_deliveries_total[1h]))
```

Le temps mesuré va de la demande au traducteur jusqu'à l'émission vers les auditeurs.
Il ne contient ni la capture, ni la reconnaissance vocale sur l'appareil, ni le trajet
socket jusqu'au client.

### Limites connues

- Un segment final reçu quand la passerelle n'a AUCUN client ZMQ part par la branche
  « relais brut » de `CallEventsHandler` et n'est pas compté. Seule la course où le
  client disparaît entre les deux contrôles est comptée (`untranslated`).
- Le délai de 10 s du relais n'est pas changé : il se réglera sur les chiffres.

### Cycle suivant : par où reprendre

1. Lire les séries sur le staging après quelques appels réels, puis décider du délai
   (issue à ouvrir avec la mesure, pas avant).
2. Autres pistes relevées pendant l'audit du cycle 1, à instruire avant d'en faire des issues :
   - ~~chaque segment final fait trois lectures Mongo en série~~ → traité au cycle 2 (#16575) ;
   - un auditeur dans une autre langue n'a rien à l'écran tant que la traduction n'est pas
     revenue. Lui servir l'original tout de suite, puis le remplacer, est une décision
     produit (Prisme) : à poser en issue `décision-produit`, pas à trancher ici.
- Une routine iOS parallèle travaille sur `apps/ios/.../Features/Call/Views/`
  (`apps/ios/tasks/routine-appels.md`). Ne pas toucher à ces vues sans s'y coordonner.

## Cycle 2 — 2026-11-07

- **Base** : `origin/dev` @ `8253b5c43` (le cycle 1, #16549, y est fusionné).
- **Branche** : `claude/fervent-wozniak-66fy29`.
- **Objectif** : #16575, sous-issue de #3722.
- **Constat** : un segment final attendait trois lectures EN SÉRIE avant la demande de
  traduction — `getCallSession` (4 requêtes Prisma-Mongo enchaînées), l'admission e2ee (2),
  les auditeurs (3) — soit ~9 allers-retours. Et une lecture d'auditeurs qui levait PERDAIT
  le segment pour tout le monde (le `catch` du gestionnaire n'émet rien).
- **Livré** :
  - `socketio/call-transcription-segment.ts` (`relayTranscriptionSegment`) : les trois lectures
    partent ensemble par `Promise.all` ; aucune ne rejette, les décisions restent dans l'ordre
    locuteur → admission → relais. Le gestionnaire sort de `CallEventsHandler.ts`
    (4 109 → ~4 015 lignes).
  - `readCallListeners` (relais) ne rejette jamais ; liste illisible ⇒ original à la salle,
    compté `call_caption_deliveries_total{path="untranslated"}`.
  - `settleCallCaptionsAdmission` sépare la décision d'admission de sa lecture ;
    `admitCallCaptions` (utilisé par `call:transcription-active`) en est la composition.
- **Tests** : `CallEventsHandler-transcription-parallel-reads.test.ts` 5/5 sur le vrai
  gestionnaire. Rouge prouvé sur le code d'avant : « trois lectures émises avant la première
  réponse » et « auditeurs illisibles ⇒ original » tombent ; les trois gardes d'ordre
  (non-participant, e2ee, partiel) passent avant ET après. Suites d'appel 151/151
  (1 904 témoins). `tsc --noEmit` code 0.
- **Mesure** : structurelle — le chemin critique avant traduction passe de trois attentes de la
  base à une (la plus lente des trois). Aucune mesure de latence de bout en bout : l'histogramme
  du cycle 1 mesure l'aller-retour traducteur, pas ce qui le précède.

### Cycle suivant : par où reprendre

1. Toujours : lire `call_caption_translation_seconds` sur le staging et décider du délai de 10 s.
   Un auditeur attend jusqu'à 10 s quand le traducteur ne répond pas — au-delà du critère de 2 s
   de #3722. C'est la piste à plus fort impact dès qu'il y a des chiffres.
2. Mesurer ce qui précède la traduction (réception du segment → `translateText`) si on veut
   chiffrer le gain de ce cycle : un timer de plus dans `callCaptionMetrics`, étiquette bornée.
3. La décision produit « servir l'original tout de suite, puis le remplacer » reste à poser en
   issue `décision-produit`.

## Cycle 3 — 2026-11-07

- **Base** : `origin/dev` @ `d9179d46b` (le cycle 2, #16577, y est fusionné).
- **Branche** : `claude/fervent-wozniak-sobae2`.
- **Objectif** : #16599, sous #3722. Il est hors du dossier des appels, mais il est sur leur chemin critique.
- **Constat** : `ZmqTranslationClient._startResultListener` lançait UN `receive()` par tick
  de 100 ms et ne relançait qu'au tick suivant. Le canal retour du traducteur, que se partagent
  messages, sous-titres d'appel, audio et pongs, plafonnait ainsi à ~10 résultats/s, et le
  N-ième résultat d'une rafale attendait N × 100 ms.
- **Livré** : la lecture boucle tant que le client tourne. Un seul `receive()` reste en vol ;
  une erreur sort de la boucle et c'est le tick qui relance, donc aucune boucle chaude. Le chien
  de garde du socket zombie est inchangé.
- **Tests** : `zmq-translation/__tests__/ZmqTranslationClient.drainResults.test.ts` 4/4.
  Rouge prouvé sur le code d'avant : 1 résultat lu sur 3, et une vidange incomplète.
  ZMQ + socketio 87 suites / 1 624 témoins ; consommateurs de ZMQ 20 suites / 544 témoins.
  `tsc --noEmit` code 0.
- **Mesure** (jest, horloge réelle, 30 résultats prêts sur le socket simulé) : vidés en
  **3 005 ms avant, 103 ms après** (dont 100 ms d'attente du premier tick). Le temps de
  traduction du modèle n'y entre pas ; c'est la file de lecture qui disparaît.

### Cycle suivant : par où reprendre

1. Toujours : lire `call_caption_translation_seconds` sur le staging. Ce cycle doit en baisser
   le p95 sous charge. Décider ensuite du délai de 10 s.
2. Le relais de sous-titres abandonne à 10 s, mais `sendTranslationRequest` arme un délai de
   30 s AVEC retry : une traduction de sous-titre déjà abandonnée est re-poussée au traducteur
   pour rien. Il faut instruire la piste (`_registerRequestTimeout`) avant d'ouvrir une issue.
3. Un segment final à N langues envoie N requêtes ZMQ (`translateText` par langue) alors que
   `translateToMultipleLanguages` existe. Le gain réel est à mesurer côté traducteur avant de
   changer quoi que ce soit.
4. ~~La décision produit « servir l'original tout de suite, puis le remplacer » reste à poser.~~ Tranchée par le porteur le jour même (#16612), voir le cycle 3 bis.

## Cycle 3 bis — 2026-11-07, décision du porteur

- **Décision #16612** (porteur, close) :
  1. un sous-titre part tout de suite, en original, et sa traduction le rejoint à tout moment, comme un message ;
  2. le sous-titre, texte compris, porte la couleur vive de son auteur, tirée de LA fonction partagée ;
  3. la voix traduite viendra plus tard, avec sa propre latence (#16615, horizon moyen/long terme).
- **#16613 (passerelle)** : `translateAndEmitSegment` émet l'original à `ROOMS.call` avant toute
  demande de traduction, puis chaque traduction à ses seuls auditeurs, sous le même énoncé. Un délai
  dépassé ou une erreur n'émet plus de second original. Les fusions client existaient déjà sur les
  trois plateformes (web `mergeCaption`, iOS `CallTranscriptMergeRules`, Android
  `CallLiveJournal.merged`). Nouveau témoin : `call-caption-instant-original.test.ts`, 4/4, rouge
  sur l'ancien code. Les anciens témoins de ciblage ont été réécrits sur le nouveau contrat. Les
  traductions ne partent toujours jamais à la salle. Suites socketio, appels et métriques :
  3 147 témoins ; `tsc` 0.
- **#16614 (couleur)** : sur le web, `speakerColor` = `authorAccentColor`, éclaircie par
  `legibleTint` (extraite d'`author-ink`) jusqu'à l'AA sur le pire fond de `glass-call-prominent`.
  La palette propre de #8393 a disparu. Le texte du bandeau prend la couleur, ma parole comprise.
  Sur iOS et Android, le texte du bandeau prend `CallSpeakerColor`, qui était déjà
  `colorForName(userId)` adapté au sombre.
  Restes connus : la vignette de SOI reste blanche sur le web (le modèle `self` de `call-grid` ne
  porte pas d'identifiant) ; le journal d'après-appel iOS (`CallTranscriptSection`) colore encore le
  nom en `indigo400` / `brandPrimary`.

### Cycle suivant : par où reprendre

1. Recette staging : un appel fr↔en, vérifier que l'original s'affiche avant la traduction, puis
   qu'il est remplacé dans la même ligne, sur web, iOS et Android.
2. Les deux restes ci-dessus, en issues s'ils tiennent.
3. Lire `call_caption_translation_seconds` sur le staging.
