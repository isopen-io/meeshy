# Routine « calling agent » : journal de continuité

Ce fichier est un JOURNAL : il dit d'où repart le cycle suivant. Il ne pilote rien.
L'état d'une tâche vit dans son issue GitHub (CLAUDE.md racine, § « Pilotage du
développement ») : en cas d'écart, l'issue a raison. Le backlog de la routine est la
liste des issues `appels` du milestone #31 « Appels de groupe et appels traduits »
et du milestone #6, pas une liste dans ce dossier.

## Direction (2026-11-07, porteur via la session « appels de bout en bout »)

- **La cible de la vue d'appel est écrite : [`docs/product/appels-vue-finale.md`](../../product/appels-vue-finale.md)** (#16633), avec 27 vues dessinées (portrait, paysage, duo vidéo et audio, groupe, partage, entrant, réduit, après l'appel, grand écran). Toute évolution de l'interface d'appel web se lit contre elle.
- **Deux issues sont prises par la session « appels de bout en bout », côté web, branche `claude/calls-end-to-end-cvakev`** : #16634 (le journal pendant et après l'appel porte la couleur de chaque auteur, nom ET phrase) et #16635 (ma vignette porte ma couleur). Fichiers touchés : `apps/web/src/components/call-journal-panel.tsx`, `call-transcript-panel.tsx`, `call-grid.tsx`, `call-screen.tsx`, `lib/calls/call-speaker-color.ts`. Ne pas les reprendre en parallèle ; tirer `dev` après leur fusion.
- Les deux « prochaines étapes » de couleur notées au cycle 3 bis (vignette de moi, journal iOS d'après l'appel) sont ces deux issues.
- Reste à la routine : la recette staging fr↔en de « l'original puis la traduction » (#16613) et le reste du backlog `appels`.

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

## Cycle 4 — 2026-11-07

- **Base** : `origin/dev` @ `f57a6a076` (le cycle 3, #16618, y est fusionné).
- **Branche** : `claude/intelligent-edison-y68gfr`.
- **Objectif** : #16622, sous #3722. C'est la piste 2 du cycle 3.
- **Constat** : le relais abandonne la traduction d'un sous-titre à 10 s, mais le client ZMQ
  gardait son délai générique (30 s) avec renvois. Le même taskId repartait au traducteur à
  +30, +60, +90 et +120 s (5 envois mesurés), précisément quand le traducteur est lent.
- **Livré** : `translateText` / `sendTranslationRequest` acceptent un `TranslationDeadline`
  optionnel. Le relais leur passe `CALL_CAPTION_TRANSLATION_TIMEOUT_MS` (10 s, seule source,
  partagée avec son propre minuteur) avec `retryEnabled: false`. Les autres appelants ne changent pas.
- **Tests** : `ZmqTranslationClient.callerDeadline.test.ts` (3) et
  `call-caption-translation-deadline.test.ts` (3). Rouge prouvé sur le code d'avant : 5 sur 6
  échouent, le sixième est le témoin de non-régression « renvoi à 30 s sans option ». Suites
  socketio, ZMQ, métriques et traduction de messages : 238 suites, 3 396 témoins. `tsc` 0.
  Ces chiffres ont été relevés par l'agent et par la QA, et j'ai moi-même relancé les 4 suites touchées (25/25).
- **QA** : favorable avec réserves. Le disjoncteur n'est pas touché (20 expirations,
  `cbConsecutiveErrors === 0`) et aucun texte de sous-titre n'est journalisé.

### Limites connues

- Un identifiant `call-<callId>-<startMs>` est pris pour un `Message.id` par
  `MessageTranslationService`. Chaque traduction réussie fait une lecture Mongo perdue et un warn.
  Chaque expiration (désormais à 10 s) laisse un `logger.error`, incrémente le compteur d'erreurs
  des messages et émet un `translation:failed` vers une salle vide. → #16625.

### Cycle suivant : par où reprendre

1. #16625 : petit lot passerelle, à fort ratio. Vérifier d'abord comment le traducteur Python
   traite le `messageId` avant de choisir entre un espace de noms et un filtre côté passerelle.
2. Toujours : lire `call_caption_translation_seconds` sur le staging, et faire la recette fr↔en
   de #16613 (l'original d'abord, puis la traduction dans la même ligne).
3. Piste 3 du cycle 3 (N requêtes ZMQ par segment au lieu d'une requête multi-langues) : mesurer
   d'abord côté traducteur.

## Cycle 5 — 2026-11-07

- **Base** : `origin/dev` @ `d305c36fd` (le cycle 4, #16627, y est fusionné).
- **Branche** : `claude/determined-volta-7rerrp`.
- **Objectif** : #16625, sous #3722 (piste 1 du cycle 4).
- **Constat** : le relais nommait ses demandes `call-<callId>-<startMs>`, un identifiant sans
  espace de noms. Le pipeline des messages le prenait donc pour un `Message.id` :
  - à chaque sous-titre traduit, et pour chaque langue : `message.findUnique`, sauvegarde, stats
    et `translationReady`, plus une relecture dans `deliverTextTranslation` ;
  - à chaque délai (10 s depuis #16622) : `logger.error`, `stats.errors` incrémenté et un
    `translationFailed` vers une conversation qui n'existe pas.
- **Livré** :
  - nouvel espace de noms `call-caption` dans `TRANSLATION_TARGET_NAMESPACES` ;
  - le relais construit `call-caption:<callId>:<startMs>` par `translationTargetId` ;
  - les gardes `isMessageTranslationTarget`, qui existaient déjà, écartent désormais les sous-titres
    sans code supplémentaire ;
  - le délai sans renvoi de `ZmqTranslationClient` garde le niveau `error`, avec un libellé neutre
    (« retry disabled by caller »). La QA a refusé le passage en `warn` : ce délai sert aussi de
    chien de garde de 15 min aux pipelines vocaux, qui doivent rester visibles en `error`.
- **Le traducteur Python renvoie le `messageId` tel quel** : `zmq_translation_handler.py:363`
  puis `:419`, et `zmq_pool/translation_processor.py:278` / `:428`. Aucun client ne voit
  l'identifiant (`buildTranslatedSegment` ne le porte pas).
- **Tests** : `call-caption-translation-target.test.ts`, 3 témoins, qui passent par le vrai relais,
  le vrai `MessageTranslationService` et le vrai `deliverTextTranslation`.
  - **Rouge sur le code d'avant** : 3 sur 3 tombent. On voyait `message.findUnique` ×3,
    `message.update`, `message.findFirst`, et un `translationFailed` vers la conversation.
  - **Suites** : 198 suites, 2 711 témoins. `tsc` 0. J'ai moi-même relancé le témoin : 3/3.

### Limites connues

- Pendant un déploiement, une traduction demandée sous l'ancien format et revenue après le
  redémarrage prend une dernière fois l'ancien chemin. L'effet se limite à un warn et une lecture
  perdue, et l'écouteur scopé a de toute façon disparu au redémarrage.

- La QA a relevé un défaut antérieur au lot : le traducteur met en cache Redis le texte traduit
  des sous-titres, avec le TTL des traductions de messages (`redis_service.py:578`). → #16648.

### Cycle suivant : par où reprendre

1. #16648 : exclure les sous-titres d'appel du cache Redis du traducteur. C'est un lot Python
   à faible risque, lié à la vie privée.
2. Toujours : lire `call_caption_translation_seconds` sur le staging, et faire la recette fr↔en
   de #16613.
3. Piste 3 du cycle 3 : un segment final à N langues envoie N requêtes ZMQ. Mesurer d'abord côté
   traducteur (`translateToMultipleLanguages`, lot de `translation_processor.py:278`).

## Cycle 6 — 2026-11-07

- **Base** : `origin/dev` @ `eb3dda579` (le cycle 5, #16625, y est fusionné).
- **Branche** : `claude/determined-volta-26ijeh`.
- **Objectif** : #16648 (piste 1 du cycle 5). Un sous-titre d'appel ne doit être ni lu ni rangé dans
  le cache Redis de traduction du traducteur.
- **Constat** : le processeur ZMQ lisait et écrivait le cache du texte entier pour toute tâche
  au régime ordinaire. `set_translation` rangeait la traduction indexée sous
  `call-caption:<callId>:<startMs>`, au TTL des messages. Le cache par segment du service ML
  était aussi LU (il n'écrivait rien, faute d'ObjectId dans le contexte).
- **Livré** (traducteur seul, la passerelle et le protocole ZMQ ne changent pas) :
  - `task_privacy.is_live_call_caption(message_id)`, prédicat source unique, reconnaît `call-caption:`
    et l'ancien `call-` (transition) ;
  - `message_scope` pose `_LIVE_CAPTION`, et `cache_allowed()` est faux sous une tâche de sous-titre.
    Toute porte de cache qui le consulte se tait donc ;
  - le processeur (`_cache_forbidden`) coupe le cache du texte entier et transmet `use_cache=False`
    au service ML, chemin simple et repli du batch ;
  - défense en profondeur : `set_translation` refuse un identifiant de sous-titre nommé explicitement.
- **Tests** : `tests/test_call_caption_never_cached.py`, 9 témoins (dont 1 ajouté par la QA pour le
  batch). Ils passent par le vrai `process_single_translation` et le vrai `TranslationCacheService`.
  - **Rouge sur le code d'avant** : 6 sur 8 tombent (les 2 qui passent sont les témoins des
    messages de conversation). Le témoin batch : 1 sur 1.
  - **Vert** : 9/9. Suites voisines (22 fichiers) : 497 passés, 6 sautés. La suite complète a les
    mêmes échecs avant et après, tous dus à des dépendances ML absentes du conteneur (torch,
    langdetect, fastapi). J'ai moi-même relancé le témoin : 8/8, avant l'ajout de la QA.
- **QA** : favorable avec réserves. L'isolation contextvars a été vérifiée en concurrence asyncio et
  après une exception. Aucun autre espace de noms n'est exclu (un ObjectId ne peut pas commencer
  par `call`).
- **Environnement** : le pytest du conteneur n'a pas pytest-asyncio. Il faut un venv avec pytest,
  pytest-asyncio, redis, pydantic, pyzmq, psutil, prometheus_client et numpy, lancé par
  `python -m pytest <fichiers> -q -p no:cacheprovider -o addopts=""`.

### Limites connues

- Le préfixe `call-` est large, et il doit tomber à zéro usage mesuré de l'ancien format. → #16681.
- `shown()` ne tait pas encore le texte d'un sous-titre déclaré `atRest: false`. Aucun site ne le
  journalise aujourd'hui, mais la garde n'est que circonstancielle. → #16682.

### Cycle suivant : par où reprendre

1. #16682 : petit lot Python de vie privée, il s'appuie sur le drapeau posé par ce cycle.
2. Piste 3 du cycle 3 : un segment final à N langues envoie N requêtes ZMQ. Mesurer d'abord côté
   traducteur (`translation_processor.py`, chemin batch).
3. Toujours : lire `call_caption_translation_seconds` sur le staging, et faire la recette fr↔en
   de #16613.

## Cycle 7 — 2026-11-07

- **Base** : `origin/dev` @ `f7dd924df` (le cycle 6, #16648, y est fusionné).
- **Branche** : `claude/determined-volta-5q1g5o`.
- **Objectif** : #16682 (piste 1 du cycle 6). Le traducteur ne doit jamais journaliser le texte d'un
  sous-titre d'appel, même quand la tâche est déclarée au régime ordinaire (`atRest: false`).
- **Livré** (traducteur seul : ni la passerelle ni le protocole ZMQ ne changent) :
  - `task_privacy.text_may_be_logged()` vaut faux sous une tâche au repos, sous un régime non
    déclaré et sous un sous-titre d'appel (`_LIVE_CAPTION`, posé depuis #16648). `shown()` s'en sert.
    `in_at_rest_task()` et `cache_allowed()` ne changent pas ;
  - fuite trouvée pendant la relecture des journaux : quand le pipeline NLLB rendait une forme
    inattendue, `translator_engine.py` écrivait la sortie brute (la traduction) dans un
    `logger.error` et dans le message de l'exception. Ce message était ensuite rejournalisé par
    `translation_processor.py` via `{e}`. Les trois sites passent maintenant par `shown()`.
- **Tests** : `tests/test_call_caption_never_logged.py`, 12 témoins.
  - **Rouge sur le code d'avant** : 7 sur 12 tombent. Les 5 autres sont les témoins de
    non-régression : message ordinaire, au repos, régime non déclaré.
  - **Vert** : 12/12. J'ai moi-même relancé ce fichier avec `test_call_caption_never_cached` :
    21/21. Suites voisines (24 fichiers) : 323 passés, 9 sautés, 4 échecs. Ces 4 échecs sont les
    mêmes sur `origin/dev` : des tests de détection de langue (`test_21`, `test_detect_language`),
    sans lien avec le lot.
- **QA** : favorable avec réserves. Elle a relu tous les journaux et toutes les exceptions du chemin
  handler ZMQ → `zmq_pool` → `translation_ml` : le texte n'y apparaît que par sa longueur.

### Limites connues

- Le moteur NLLB lance ses threads sans recopier le contexte. Le diagnostic « sortie inattendue » y
  tait donc aussi le texte d'un message ordinaire, et les témoins du moteur ne prouvent pas la règle
  propre aux sous-titres. Il reste aussi un risque théorique sur les `{e}` du pipeline Hugging Face.
  → #16701.

### Cycle suivant : par où reprendre

1. #16701 : petit lot Python. Recopier le contexte dans les trois `run_in_executor` du moteur, puis
   écrire un témoin pour le cas ordinaire et un pour le sous-titre.
2. Piste 3 du cycle 3 : un segment final à N langues envoie N requêtes ZMQ. Mesurer d'abord côté
   traducteur (`translation_processor.py`, chemin batch).
3. Toujours : lire `call_caption_translation_seconds` sur le staging, et faire la recette fr↔en
   de #16613.

## Cycle 8 — 2026-11-07

- **Base** : `origin/dev` @ `598fd0e3c` (le cycle 7, #16682, y est fusionné).
- **Branche** : `claude/determined-volta-d2e6zi`.
- **Objectif** : #16701 (piste 1 du cycle 7). Les threads d'inférence NLLB doivent connaître le régime
  de la tâche qu'ils servent.
- **Livré** (seul le traducteur change : ni la passerelle ni le protocole ZMQ ne bougent) :
  - les trois `run_in_executor` de `translator_engine.py` passent par `_in_inference_thread`. Cette
    méthode s'appuie sur `run_in_thread_with_context` (premier site de `src` à l'utiliser). Le
    thread reçoit donc `_AT_REST` et `_LIVE_CAPTION`. Le diagnostic « sortie NLLB inattendue »
    garde le texte d'un message ordinaire et tait celui d'un sous-titre ;
  - les `{e}` du pipeline Hugging Face (`translate_sync`, `_infer_batch_sync`) passent par
    `shown(str(e))`, dans le journal comme dans le message de `TranslationInferenceError`. Une
    exception qui citait l'entrée faisait fuir le texte d'un sous-titre : le rouge l'a montré.
- **Tests** : `tests/test_translator_engine_task_regime.py`, 23 témoins sur trois chemins
  (`translate_sync`, lot via `translate_text`, lot via `translate_batch`). La QA y a ajouté deux
  témoins de concurrence : deux tâches de régimes différents sur le même pool, et un thread réutilisé.
  - **Rouge sur le code d'avant** : 9 sur 21 tombent. 3 viennent du contexte absent, 6 des `{e}`
    bruts. Les deux témoins de concurrence tombent aussi.
  - **Vert** : 23/23. Lancés avec les deux fichiers des cycles 6 et 7, j'obtiens 42/42 avant l'ajout
    de la QA. Fichiers qui importent le moteur : 208 passés, 9 sautés, 4 échecs. Ces 4 échecs sont les
    mêmes sur `origin/dev` : de la détection de langue (`langdetect` absent du venv).
- **QA** : favorable avec réserves → #16715 et #16716.

### Limites connues

- `__cause__` garde l'exception brute du pipeline. Aucun appelant ne l'imprime aujourd'hui, mais un
  futur `exc_info` la ferait fuir. → #16715.
- Le lot ZMQ (`translation_processor.py:232`) tourne hors régime déclaré. C'est fail-closed, mais
  le diagnostic d'un lot ordinaire reste tu. → #16716.

### Cycle suivant : par où reprendre

1. #16715 : petit lot Python de vie privée, dans la suite directe de celui-ci.
2. Piste 3 du cycle 3 : un segment final à N langues envoie N requêtes ZMQ. Mesurer d'abord côté
   traducteur (`translation_processor.py`, chemin batch). #16716 touche le même site : les grouper.
3. Toujours : lire `call_caption_translation_seconds` sur le staging, et faire la recette fr↔en
   de #16613.

## Cycle 9 — 2026-11-07

- **Base** : `origin/dev` @ `7c620ef7f` (le cycle 8, #16701, y est fusionné).
- **Branche** : `claude/determined-volta-lbhlo4`.
- **Objectif** : #16715 (piste 1 du cycle 8). La cause d'une `TranslationInferenceError` ne doit pas
  porter le texte d'un sous-titre d'appel.
- **Livré** (seul le traducteur change : ni la passerelle ni le protocole ZMQ ne bougent) :
  - `task_privacy.caused_by(error, cause)` attache la cause seulement si `text_may_be_logged()` est
    vrai ;
  - aux deux sites de `translator_engine.py` (`translate_sync`, `_infer_batch_sync`), l'erreur est
    construite dans le `except`, puis levée APRÈS le bloc. Elle n'a donc aucun `__context__`. Un
    simple `from None` ne masquerait le contexte qu'à l'affichage, il le laisserait rempli ;
  - régime ordinaire : la cause reste attachée et le diagnostic ne change pas.
- **Tests** : `tests/test_inference_error_cause_redacted.py` (12) et
  `tests/test_inference_error_cause_qa_16715.py` (8, ajoutés par la QA : régime non déclaré,
  `logger.exception` en amont, KeyboardInterrupt intacte). L'ancien témoin
  `test_the_pipeline_exception_stays_the_cause` exigeait ce que #16715 interdit : il tourne
  maintenant sous le régime ordinaire.
  - **Rouge sur le code d'avant** : 9/12, puis 3/8 sur le fichier QA.
  - **Vert** : 20/20. Avec les fichiers des cycles 6 à 8, 56/56, relancé par moi.
  - **Suites voisines** : 349 passés, 9 sautés, 4 échecs. Ces 4 échecs sont préexistants
    (`langdetect` absent). La suite complète échoue à l'identique, ligne à ligne, entre HEAD et
    `origin/dev`.
- **QA** : favorable avec réserves → #16735, #16736, #16737.
- **Environnement** : il n'y a pas de venv pour le traducteur. On construit un venv jetable avec uv
  (`--index-url https://pypi.org/simple`), puis on lance `pytest --no-cov` (→ #16737).

### Limites connues

- Hors du moteur, des `logger.error(f"…{e}")` citent encore une exception arbitraire en clair. La
  publication du résultat tourne hors régime. → #16735.
- Le pipeline audio au repos imprime des traces complètes. → #16736.

### Cycle suivant : par où reprendre

1. #16735 avec #16716 : même site (`translation_processor.py`), faire entrer la publication et le
   lot ZMQ dans le régime de la tâche.
2. Piste 3 du cycle 3 : un segment final à N langues envoie N requêtes ZMQ. Mesurer d'abord.
3. Toujours : lire `call_caption_translation_seconds` sur le staging, et faire la recette fr↔en
   de #16613.

## Cycle 10 — 2026-11-08

- **Base** : `origin/dev` @ `6a08a6227` (le cycle 9, #16715, y est fusionné).
- **Branche** : `claude/determined-volta-ifcb29`.
- **Objectif** : #16735 et #16716 (piste 1 du cycle 9), groupés parce qu'ils touchent le même site.
  La publication d'un résultat et le lot ZMQ doivent tourner sous le régime de leurs tâches.
- **Livré** (seul le traducteur change : ni la passerelle, ni le protocole ZMQ, ni la forme des
  résultats publiés) :
  - `task_privacy.batch_is_ordinary` / `batch_scope` : un lot est ordinaire seulement si toutes ses
    tâches le sont (non au repos, pas un sous-titre). Sinon il est tu ;
  - `process_single_translation` : toute la tâche tourne sous `task_scope`, y compris le refus de
    langue et la publication du résultat ou de l'erreur. Ses journaux passent par `shown(str(e))` ;
  - `process_batch_translation` → `_process_batch` sous `batch_scope`. Chaque publication passe
    sous le régime de SA tâche. Les erreurs du lot sont publiées HORS du bloc `except` : sans
    cela, la publication ratée d'un message ordinaire, dans un lot mixte, joignait par
    `__context__` l'exception qui citait le sous-titre (réserve R1 de la QA, corrigée dans le
    cycle) ;
  - `_publish_translation_result` : `{e}` → `shown(str(e))`, et `traceback.print_exc()` →
    `exc_info=text_may_be_logged()`. Le régime ordinaire garde sa trace, désormais par le logger
    et non plus par stderr ;
  - `translation_service.py` : trois `logger.error` passent par `shown`. Dans
    `translator_engine.py`, la création du pipeline journalise avec `exc_info=True` (R2 de #16716).
- **Tests** : `tests/test_call_caption_publish_regime.py` (39 témoins) et
  `tests/test_call_caption_publish_regime_qa.py` (8 témoins, ajoutés par la QA).
  - **Rouge sur le code d'avant** : 25 des 39, puis le témoin R1 seul (1 sur 8).
  - **Vert** : 119/119 sur les 9 fichiers des cycles 6 à 10 et du processeur, relancé par moi.
  - **Suites `zmq_pool` / `translation_processor`** : 316 passés, 6 sautés, aucun échec.
  - **56 fichiers voisins** : la différence avant/après se réduit aux 25 témoins. Les échecs
    restants sont préexistants : torch, `langdetect`, un vrai service attendu.
- **QA** : favorable avec réserves. R1 est corrigée dans le cycle ; R2 → #16765, R3 → #16766.
- **Environnement** : venv uv jetable avec
  `uv pip install --no-config --index-url https://pypi.org/simple pytest pytest-asyncio pytest-cov
  numpy pydantic psutil pyzmq redis python-dotenv fastapi httpx prometheus-client`.
  `--no-config` est indispensable : la configuration uv du dépôt ajoute l'index pytorch, que le
  proxy refuse.

### Limites connues

- Quatre sites tournent hors régime et citent encore `{e}` en brut : `zmq_pool_manager.py:284` et
  `:351`, `zmq_translation_handler.py:396` et `:398`. Aucun texte plausible n'y arrive aujourd'hui.
  → #16765.
- Le champ `error` d'un résultat de lot porte l'exception du lot. `_is_valid_translation` le jette
  avant l'envoi, mais aucun témoin ne le verrouille. → #16766.

### Cycle suivant : par où reprendre

1. **Changer d'axe.** Dix cycles ont été consacrés à la vie privée des journaux du traducteur.
   #16765, #16766 et #16736 restent petits et peuvent attendre un cycle groupé.
2. Piste 3 du cycle 3 : un segment final à N langues envoie N requêtes ZMQ. Mesurer d'abord côté
   traducteur (chemin batch, désormais sous `batch_scope`).
3. Toujours : lire `call_caption_translation_seconds` sur le staging, et faire la recette fr↔en
   de #16613.

## Cycle 11 — 2026-11-08

- **Base** : `origin/dev` @ `fa0281356` (le cycle 10, #16768, y est fusionné).
- **Branche** : `claude/determined-volta-huumhr`.
- **Changement d'axe** : on quitte la vie privée des journaux pour la latence.
- **Piste 3 instruite, écartée pour l'instant** : un segment final à N langues envoie N requêtes ZMQ. Dans le traducteur, l'inférence est sérialisée par le verrou du modèle (`process_single_translation`, commentaire en tête de boucle). N requêtes ne se parallélisent donc pas, et une requête multi-langues ne ferait gagner que le surcoût ZMQ et la file, de l'ordre de la milliseconde. Elle obligerait en plus le relais à démultiplexer par langue sous un seul taskId. Ratio trop faible.
- **Objectif** : #16780. Un sous-titre d'appel est pris par un worker dès son arrivée.
- **Constat** :
  - `_get_next_task` regardait la voie rapide une seule fois, puis bloquait jusqu'à 1 s sur la file ordinaire. Au repos, une tâche courte, c'est-à-dire la plupart des sous-titres, attendait **~969 ms** avant d'être prise.
  - Un sous-titre de 100 caractères ou plus passait par l'accumulateur de lots (~19 ms), puis par `normal_pool`.
- **Livré** (seul le traducteur change : ni le protocole ZMQ, ni la passerelle, ni la forme des résultats) :
  - `SignalingQueue` : les trois files lèvent un `asyncio.Event` partagé à chaque dépôt.
  - `take_next_task` : le worker baisse le drapeau, lit les files dans l'ordre, puis attend le drapeau. Il n'attend jamais un `get()`, donc une annulation ne consomme rien.
  - `_enqueue_live_caption` : un sous-titre (`is_live_call_caption`) prend la voie rapide quelle que soit sa longueur, ne passe jamais par un lot et ne dépend plus de `utils.performance`. Si la voie rapide est pleine, il va dans la file régulière directe, et son refus se compte.
- **Tests** : `tests/test_call_caption_fast_lane.py` (10) et `tests/test_call_caption_fast_lane_qa.py` (2, ajoutés par la QA).
  - **Rouge sur le code d'avant** : 5 sur 10.
  - **Vert** : 12/12. Suites `zmq_pool`, `translation_processor` et `call_caption` : 298 passés et 6 sautés, relancé par moi. La QA a relevé 219 passés sur son propre sous-ensemble.
  - **Mutation** : remettre l'échéance à zéro à chaque réveil fait tomber le témoin QA.
- **Mesure** (`BENCHMARKS.md`) : prise d'une tâche de la voie rapide au repos, **p50 968,98 ms avant, 0,15 ms après**. Pour un sous-titre long, **18,91 ms avant, 0,15 ms après**.
- **QA** : favorable avec réserves. R1 → #16782, R2 → #16783. R3 est notée ci-dessous.
- **Trouvé en chemin** : `_enqueue_batch` jette en silence un lot refusé par une file pleine. → #16781.

### Limites connues

- La voie rapide passe toujours en premier, sans quota : les tâches longues ordinaires peuvent être affamées sous forte charge. → #16782.
- Un sous-titre qui déborde de la voie rapide perd sa priorité sans signal. → #16783.
- R3 : `stop_workers` attend encore jusqu'à 1 s par worker au repos, comme avant. Il suffirait d'y lever `work_arrived`. C'est optionnel.
- Le temps d'inférence NLLB n'est pas mesuré ici.

### Cycle suivant : par où reprendre

1. #16781 : perte silencieuse d'un lot refusé (fiabilité, petit lot sur le même fichier).
2. #16782 avec #16783 : quota de la voie rapide et compteur de débordement, groupés parce qu'ils touchent le même site.
3. Toujours : lire `call_caption_translation_seconds` sur le staging. Ce cycle doit en baisser le p50 d'environ 0,5 à 1 s quand le traducteur est au repos. Faire aussi la recette fr↔en de #16613.

## Cycle 12 — 2026-11-08

- **Base** : `origin/dev` @ `9d802fcdc` (le cycle 11, #16780, y est fusionné).
- **Branche** : `claude/determined-volta-mh6bq1`.
- **Objectif** : #16781 (piste 1 du cycle 11). Quand une file pleine refuse un lot de traductions, aucune tâche ne doit disparaître en silence.
- **Constat** : quand la file était pleine, `ConnectionManager._enqueue_batch` jetait le lot sans journal, sans compteur et sans valeur de retour. Ses trois appelants (flush immédiat, boucle des 50 ms, `stop()`) croyaient donc la tâche acceptée. La passerelle n'avait ni traduction ni erreur et attendait son délai. Les messages ordinaires passent par ce chemin. Les sous-titres d'appel n'y passent plus depuis #16780.
- **Livré** (seul le traducteur change : ni la passerelle, ni le protocole ZMQ, ni la forme de `translation_error`) :
  - `_enqueue_batch` rend un bool. Un lot refusé compte une unité de `pool_full_rejections` par tâche. Il est journalisé par ses task_id et sa taille, jamais par son texte.
  - Rappel optionnel `on_tasks_rejected`, appelé hors de `_batch_lock`. Un rappel qui lève est absorbé et seul le type de l'exception est journalisé. Les trois chemins le passent. Une tâche entrée dans l'accumulateur est acceptée : `enqueue_task` rend `True`, et son refus éventuel ne se dit que par le rappel. Il n'y a donc jamais de double erreur.
  - `TranslationPoolManager.set_rejection_handler`. Le `TranslationHandler` le branche lui-même sur `publish_pool_full`, qui publie une `translation_error` par tâche. Sa forme est identique, octet pour octet, à celle du refus direct, et elle est construite en un seul site, `_pool_full_error`.
  - R1 de la QA, corrigée dans le cycle : une tâche signalée « pool full » libère sa réserve en vol (`release_inflight`). Avant, les relances de la passerelle à 30 s et 60 s étaient ignorées comme « déjà en vol » (réserve de 75 s au moins). Pour un texte long, la tâche n'était jamais traduite. Une tâche acceptée garde sa réserve.
- **Tests** : `tests/test_batch_pool_full_rejection.py` (10) et `tests/test_batch_pool_full_rejection_qa.py` (10, ajoutés par la QA : concurrence 6×60, ré-enfilage sans interblocage, any/normal, sous-titres, forme JSON, PUB absent ou en échec).
  - **Rouge sur le code d'avant** : 6 sur 7, puis 2 sur 10 pour R1.
  - **Vert** : 37/37 sur les témoins, la déduplication et la voie rapide, relancé par moi.
  - **Suites voisines** : 448 passés, 7 sautés et 4 erreurs. Les 4 erreurs sont préexistantes (`test_23_translation_api.py::TestBatchTranslateEndpoint`, reproduites sur `origin/dev`).
- **QA** : favorable avec réserves. R1 est corrigée dans le cycle. R2 → #16819, R3 → #16820, R4 et R5 → #16822.

### Limites connues

- Les tâches acceptées au flush final de `stop()` tombent dans des files dont les workers sont déjà arrêtés. → #16819.
- La clé de lot ignore `conversation_id`, donc un lot peut mélanger any et normal. → #16820.
- Le `{e}` brut d'`enqueue_task` / `_handle_translation_request`, et une exception levée après le `pop` de l'accumulateur. → #16822.
- `pool_full_rejections` compte désormais des tâches, pas des lots, ce qui peut faire monter les tableaux de bord sous saturation.

### Cycle suivant : par où reprendre

1. #16782 avec #16783 : quota de la voie rapide et compteur de débordement des sous-titres (même site, `connection_manager.py`).
2. #16819 et #16820 : petits lots du même fichier, à grouper.
3. Toujours : lire `call_caption_translation_seconds` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 13 — 2026-11-08

- **Base** : `origin/dev` @ `ba11708dc`. Le cycle 12 (#16824) y est fusionné.
- **Branche** : `claude/determined-volta-6kbp55`.
- **Objectif** : #16782 et #16783, piste 1 du cycle 12. Sous une rafale de sous-titres, une traduction ordinaire est prise dans un délai borné, et un sous-titre qui déborde de la voie rapide se compte.
- **Livré** (seul le traducteur change : ni le protocole ZMQ, ni la passerelle, ni la forme des résultats) :
  - `FastLaneBurst` donne à chaque worker un état de rafale propre. Après `TRANSLATOR_FAST_LANE_BURST` tâches rapides d'affilée (8 par défaut, une valeur invalide retombe sur 8), si sa file régulière attend, la prise suivante la sert. Le compteur repart à zéro dès qu'une tâche régulière est prise ou que la file régulière est vide.
  - La borne : K workers sur une même file régulière laissent passer au plus K × N prises rapides. Les sous-titres gardent au moins N/(N+1) de la capacité, soit environ 89 %.
  - `take_next_task(..., burst=None)` : sans `burst`, l'ordre reste strict comme avant. Les invariants de #16780 sont intacts.
  - `stats['caption_fast_lane_overflow']` est exposé par `get_stats()`, puis par `health_check`. Il compte aussi un sous-titre qui déborde vers une file régulière pleine et y est refusé. Le journal est en debug et ne porte que le task_id.
- **Tests** : `tests/test_fast_lane_quota.py` (23) et `tests/test_fast_lane_quota_qa.py` (10, QA).
  - **Rouge sur le code d'avant** : 21 sur 23. Les 2 verts sont la rétrocompatibilité et la vie privée.
  - **Vert** : 33/33 sur le lot, plus 55 passés sur les suites voisines du lot, relancés par moi. La QA a mesuré 224 passés et 6 sautés sur les suites ciblées, et 419 passés, 6 sautés et 5 erreurs sur les suites voisines. Les 5 erreurs sont préexistantes sur `origin/dev` : `test_zmq_integration_gateway_translator.py::TestRealTranslatorIntegration`, attribut `TRANSCRIPTION_SERVICE_AVAILABLE`.
  - **Mutations QA** : 5 sur 5 tuées.
- **Mesure** (`BENCHMARKS.md`) : voie rapide saturée, 2 et 4 workers. Sans quota, **0 tâche régulière sur 20** est servie. Avec N=8, **20 sur 20**, la dernière à 437 ms (2 workers) et à 154 ms (4 workers). Le coût pour les sous-titres est de +0 à 1 ms au p50 et de +1 à 3 ms au p95.
- **QA** : favorable avec réserves. R1 (ce que compte le compteur) et R2 (la borne à K workers) sont désormais écrites dans les docstrings. R3, mineure : le témoin d'intégration d'origine dépose ses sous-titres d'avance, et le témoin QA couvre le flux continu.
- **Intégration** : l'orchestrateur a fait lui-même la PR et la fusion. Le lot ne touche qu'un service et n'a aucun conflit, donc pas de 3e sous-agent.

### Limites connues

- Il n'y a pas de métrique Prometheus des stats du pool, donc pas d'alerte possible sur `caption_fast_lane_overflow`. `prometheus_client` ne sert qu'au pipeline audio. → #16933.
- Une tâche régulière prise au titre du quota peut être un lot de 10 traductions. Elle retarde alors un sous-titre de la durée de ce lot. N est réglable par l'environnement.
- `TestRealTranslatorIntegration` est rouge sur `dev`, hors lot. → #16934.

### Cycle suivant : par où reprendre

1. #16819 et #16820 : flush final de `stop()` vers des workers arrêtés, et clé de lot sans `conversation_id`. Ce sont des petits lots sur `connection_manager.py`, à grouper.
2. #16822 : `{e}` brut et exception levée après le `pop` de l'accumulateur.
3. Toujours : lire `call_caption_translation_seconds` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 14 — 2026-11-08

- **Base** : `origin/dev` @ `4fb1112cc`. Le cycle 13 (#16782, #16783) y est fusionné.
- **Branche** : `claude/determined-volta-77he7d`.
- **Objectif** : #16819 et #16820, piste 1 du cycle 13. À l'arrêt du traducteur, aucune tâche acceptée ne disparaît en silence, et un lot ne mélange plus des tâches « any » et des tâches de conversation.
- **Constat** :
  - `stop_workers` arrêtait les workers avant `connection_manager.stop()`. Le flush final, et tout ce qui restait dans `fast_pool`, `normal_pool` et `any_pool`, tombait dans des files que plus aucun worker ne lisait. La passerelle n'avait ni traduction ni erreur et attendait son délai (~30 s).
  - `_get_batch_key` ignorait `conversation_id`. Un lot mélangeant « any » et conversation allait dans la file de sa première tâche.
- **Livré** (seul le traducteur change : ni le protocole ZMQ, ni la passerelle, ni la forme des erreurs) :
  - `ConnectionManager.reject_pending_at_shutdown()` est appelé par `stop_workers` après le flush final. Il vide l'accumulateur (sous `_batch_lock`) et les trois files, déplie chaque lot en ses tâches d'origine, et remet le tout à `_report_rejected`, donc à `publish_pool_full`.
  - La forme JSON est identique à celle du cycle 12, et la réserve en vol est libérée. La passerelle (`ZmqTranslationClient.ts:361`) traite « pool full » comme transitoire et relance avec le même taskId.
  - Nouvelle stat : `shutdown_rejections`.
  - On ne flushe pas avant d'arrêter les workers : un worker inactif aurait pu prendre un lot de 10 et allonger l'arrêt.
  - La clé de lot est préfixée `any_` ou `normal_`. Elle n'est jamais découpée par conversation, pour garder le regroupement.
- **Tests** : `tests/test_shutdown_and_batch_key.py` (8) et `tests/test_shutdown_and_batch_key_qa.py` (9, QA).
  - **Rouge sur le code d'avant** : 7 sur 8 (le vert restant garde le regroupement de deux conversations), puis 9 sur 9 pour la QA.
  - **Vert** : 82/82 sur le lot, la voie rapide, le quota et le refus de lot, relancé par moi.
  - **Suites voisines** (QA) : 327 passés, 4 sautés et 6 erreurs, contre 319 passés et les mêmes 6 erreurs sur `origin/dev`. Les erreurs sont préexistantes : `sacrebleu` et `soundfile` absents du venv, et `TestBatchTranslateEndpoint`.
  - **Mutations QA** : 4 sur 5 tuées. Le mutant survivant, qui inverse l'ordre flush/vidange, est quasi équivalent et va dans #17002.
- **CI** : le run `workflow_dispatch` 42491615899 est rouge sur `Qualité TS`, au budget du chunk web « zod » (18,86 Ko pour 9 Ko). Ce rouge est celui de `dev` : je l'ai reproduit sur `origin/dev` pur. → #17014. Comme les jobs traducteur dépendent de `quality`, ils ont été sautés. J'ai donc relancé moi-même la commande de `test-python` en local, sur toute la suite :
  - **branche** : 2257 passés ;
  - **`dev`** : 2240 passés ;
  - 38 échecs et 95 erreurs, identiques des deux côtés (modules ML absents, sans torch).
- **QA** : favorable avec réserves. R1 et R5 → #17002, R2 → #17003, R3 → #17004, R4 → #17005.

- **Intégration** : PR #17006 ouverte, mais **non fusionnée**. La fusion, refusée par le garde-fou d'autonomie tant que la CI n'est pas verte, attend que #17014 soit corrigé ou que le porteur donne son feu vert.

### Limites connues

- Une tâche reçue par PULL entre `stop_workers` et la fermeture du socket se perd encore. → #17002.
- Le journal d'un refus en masse n'est pas borné. → #17003.
- Plus de 8 signalements ouvrent le disjoncteur de la passerelle pour 30 s. → #17004.
- La livraison PUB à l'arrêt n'est pas mesurée. → #17005.
- Les tâches **en cours**, annulées par le délai d'arrêt de 30 s de `zmq_server_core`, ne sont pas signalées. Le minuteur de renvoi de la passerelle les couvre.

### Cycle suivant : par où reprendre

0. **PR #17006** : dès que `Qualité TS` est vert (#17014), mettre la branche à jour sur `dev`, relancer `workflow_dispatch`, puis fusionner.
1. #17002 : refuser l'enfilement une fois l'arrêt lancé (petit lot, même site), avec #17003 si le temps le permet.
2. #16822 : `{e}` brut et exception levée après le `pop` de l'accumulateur.
3. #17014 : tant que `Qualité TS` est rouge sur `dev`, aucune PR traducteur n'a sa preuve CI. Vérifier son état d'abord.
4. #17004 côté passerelle : un refus transitoire n'alimente plus le disjoncteur.
5. Toujours : lire `call_caption_translation_seconds` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 15 — 2026-11-08

- **Base** : `origin/dev` @ `341b14db2`. La PR #17006 du cycle 14 y est fusionnée, et #17014 est fermé.
- **Branche** : `claude/determined-volta-cl1cqc`.
- **Objectif** : #17002 et #17003, pistes 1 du cycle 14. Une traduction reçue pendant l'arrêt est refusée et signalée, et un refus en masse est journalisé en lignes bornées.
- **Livré** (seul le traducteur change : ni le protocole ZMQ, ni la passerelle, ni le JSON publié) :
  - **Drapeau `ConnectionManager._shutting_down`** : il est levé en première instruction de `stop()`. Ensuite, toute tâche passée à `enqueue_task` est refusée sur toutes les voies (lot, voie rapide, sous-titre, directe, any) par `_refuse_at_shutdown`. Ce refus incrémente `shutdown_rejections` et passe par `_report_rejected` puis `publish_pool_full`, qui libère la réserve en vol. Il rend `True`, pour ne pas signaler deux fois.
  - **Course** : aucun `await` entre le test du drapeau et le dépôt en file. Le drapeau est aussi relu sous `_batch_lock`, une défense en profondeur dont la mutation qui la retire est équivalente.
  - **PULL n'est pas fermé avant `stop_workers`** : la fermeture pendant `recv_multipart` provoquerait un double `stop()`. Le drapeau suffit.
  - **`summarize_task_ids`** : le total plus au plus 20 task_id par ligne. `publish_pool_full` écrit une ligne de résumé (deux si des envois ratent), au lieu d'une ligne par tâche. Le JSON du PUB est identique octet pour octet, vérifié par la QA.
- **Tests** : `tests/test_shutdown_ingress_and_bounded_logs.py` (13 tests) et `..._qa.py` (QA : 15 tests et 1 `xfail(strict)`).
  - **Rouge sur le code d'avant** : 12 sur 12, puis 13 tests QA rouges sur 15 sur `dev`.
  - **Vert** : relancé par moi, `45 passed, 1 xfailed` sur les 4 fichiers d'arrêt.
  - **Suites voisines** (QA, `-k "zmq_pool or translation_processor or call_caption or batch or shutdown or pool or zmq or handler"`, sans `TestBatchTranslateEndpoint`) : 552 passés, 7 sautés et 7 erreurs sur la branche, contre 539 passés et les mêmes 7 erreurs sur `dev` (sacrebleu et soundfile absents, `TestRealTranslatorIntegration`).
  - **Mutations** : 12 sur 15 tuées, dont celle qui inverse « flush final puis vidange » (R5 de #17002). Les 3 survivantes sont équivalentes.
- **CI** : deux runs `workflow_dispatch` (42507151398, puis la relance 42508176873) ont été **annulés** sans qu'aucun job échoue. Sur la même période, tous les runs dispatch de `ci.yml` du dépôt ont été annulés, toutes branches confondues : l'annulation est externe à la PR.
- **Intégration** : PR #17065 ouverte, mais **non fusionnée**. Il faut une CI verte, ou le feu vert du porteur.
- **QA** : favorable avec réserves. R1 → #17063, R2 → #17064. R3 (deux gardes sans effet observable aujourd'hui), R4 (le témoin « handler » du lot recopie la logique du handler, et la QA ajoute le vrai chemin) et R5 (la longueur des identifiants n'est pas bornée, ce qui est sans effet avec des UUID) sont consignées ici sans issue.

### Limites connues

- Un lot refusé pendant que `stop()` annule la boucle de flush est perdu. Ce défaut est antérieur au lot. → #17063 (xfail strict).
- Les arrivées pendant l'arrêt donnent encore une ligne WARNING par tâche. → #17064.
- Les tâches **en cours**, annulées par le délai de 30 s de `zmq_server_core`, ne sont toujours pas signalées.

### Cycle suivant : par où reprendre

0. **PR #17065** : relancer `workflow_dispatch` de `ci.yml` sur la branche, mise à jour sur `dev`, puis fusionner au vert.
1. #17063 et #17064 : petits lots sur le même site (`connection_manager.py`), à grouper.
2. #16822 : `{e}` brut et exception levée après le `pop` de l'accumulateur.
3. #17004 côté passerelle : un refus transitoire n'alimente plus le disjoncteur.
4. #17005 : mesurer la livraison PUB à l'arrêt.
5. Toujours : lire `call_caption_translation_seconds` sur le staging et faire la recette fr↔en de #16613.

## Cycle 16 — 2026-11-08

- **Base** : `origin/dev` @ `f625d0c5b`. La PR #17065 du cycle 15 y est fusionnée.
- **Branche** : `claude/determined-volta-1jsemr`.
- **Objectif** : #17063 et #17064, piste 1 du cycle 15. Un lot refusé pendant que l'arrêt annule la boucle de flush est quand même signalé, et les refus d'arrivée tardive ne remplissent plus le journal.
- **Livré** (seul le traducteur change : ni le protocole ZMQ, ni la passerelle, ni le JSON publié) :
  - **#17063** : `_report_through_cancellation` signale les lots refusés de `_flush_batches` sous `asyncio.shield`. Une annulation reçue pendant le report n'est relancée qu'une fois le report fini, donc `stop()` l'attend. Aucune tâche n'est signalée ni comptée deux fois.
  - **#17064** : une tâche refusée à l'entrée pendant l'arrêt passe par le rappel `on_refused_at_shutdown`. Côté traducteur, `TranslationHandler.publish_refused_at_shutdown` publie le même JSON que `publish_pool_full`, avec le même `release_inflight`, mais sa ligne de refus est en DEBUG. Le gestionnaire écrit une seule WARNING au premier refus tardif.
  - `set_rejection_handler(handler, at_shutdown=None)` : un appel à un seul rappel reçoit tout, comme avant. Hors arrêt, un refus de file pleine garde sa WARNING.
- **Tests** : `tests/test_shutdown_flush_cancel_and_quiet_logs.py` (7 tests) et `..._qa.py` (QA : 3 tests et 1 `xfail(strict)`). L'`xfail` de #17063 dans `test_shutdown_ingress_and_bounded_logs_qa.py` est retiré.
  - **Rouge sur le code d'avant** : 4 sur 7, dont `assert 5 == 500` (WARNING pour N=5 contre N=500) et `['blocker'] == ['acc-0-0', …]`.
  - **Vert** : relancé par moi, `109 passed, 1 xfailed` sur `test_shutdown_*`, `test_fast_lane_quota*` et `test_batch_pool_full_rejection*`.
  - **Suites voisines** (QA, `-k "zmq_pool or translation_processor or call_caption or batch or shutdown or pool or zmq or handler"`) : 519 passés sur la branche contre 511 sur `dev`. Les 5 échecs et les 31 erreurs de collecte (torch absent) sont identiques des deux côtés.
  - **Mutations QA** : 10 sur 10 tuées, après l'ajout des tests QA. Deux survivaient aux seuls tests du lot (relance de l'annulation, remise à zéro de `at_shutdown`), et les tests QA les ont bouchés.
- **QA** : favorable avec réserves. R1 → #17132. R4 → #17133. R5 (libellé de la WARNING) est corrigé dans ce lot. R2 : `stop()` absorbe sa propre annulation, un comportement antérieur rattaché à #17132. R3 : un double tiers à l'ancienne signature lèverait `TypeError`, mais aucun n'existe dans le dépôt.

### Limites connues

- Une seconde annulation, celle de `stop()` lui-même, perd encore le lot en cours de report. → #17132 (xfail strict).
- Si le PUB est cassé pendant l'arrêt, il y a une ligne ERROR par envoi raté. → #17133.
- `stop()` attend le report sans limite de temps : un PUB qui ne rend pas la main bloque l'arrêt.

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle n'est pas fusionnée, la reprendre : la mettre à jour sur `dev`, lancer `workflow_dispatch` de `ci.yml`, puis fusionner au vert.
1. #16822 : `{e}` brut, et exception levée après le `pop` de l'accumulateur.
2. #17004 côté passerelle : un refus transitoire n'alimente plus le disjoncteur.
3. #17132 et #17133 : petits lots du même site.
4. Toujours : lire `call_caption_translation_seconds` sur le staging et faire la recette fr↔en de #16613.

## Cycle 17 — 2026-11-08

- **Base** : `origin/dev` @ `ee28259f9`. La PR du cycle 16 (`claude/determined-volta-1jsemr`) y est fusionnée.
- **Branche** : `claude/determined-volta-2xnkrh`.
- **Objectif** : #16822, piste 1 du cycle 16. L'entrée en file ne journalise plus l'exception brute, et aucune tâche ne se perd si l'entrée d'un lot lève.
- **Constat** :
  - Si `_enqueue_batch` levait dans `_accumulate` après le `pop`, l'exception remontait à `enqueue_task`, qui rendait `False`. Seule la tâche déclenchante était signalée, et les N-1 autres disparaissaient.
  - Si `_enqueue_batch` levait au milieu de `_flush_batches`, on sortait du verrou sans `clear()`. Les lots déjà enfilés étaient alors **ré-enfilés** au flush suivant (traduction en double), et les refus déjà rassemblés se perdaient.
  - Quatre sites journalisaient `{e}` en brut : `enqueue_task`, `_batch_flush_loop`, et les deux `except` de `_handle_translation_request`.
- **Livré** (seul le traducteur change : ni le protocole ZMQ, ni la passerelle, ni le JSON publié) :
  - `ConnectionManager._enqueue_batch_or_refused` : il enfile un lot déjà retiré de l'accumulateur, ou rend ses tâches à signaler, que la file soit pleine ou que l'entrée lève. Il sert à `_accumulate` et à `_flush_batches`, donc au flush périodique comme au flush final de `stop()`. Chaque tâche est signalée une fois, et l'accumulateur est toujours vidé.
  - Nouvelle stat : `enqueue_error_rejections`, comptée par tâche.
  - Les quatre sites ne journalisent plus que `[TRANSLATOR] … {type(e).__name__}`.
- **Tests** : `tests/test_enqueue_errors_and_raw_logs.py` (6 tests) et `..._qa.py` (QA : 5 tests, dont le vrai chemin passerelle `TranslationHandler` + `TranslationPoolManager`, le flush final de `stop()` et l'annulation).
  - **Rouge sur `origin/dev`** : 6 sur 6, puis 5 sur 5 pour la QA. Exemples : `Error enqueueing task t3: SECRET-TEXT-16822 boom` et `assert [True, True, False] == [True, True, True]`.
  - **Vert** : relancé par moi, `11 passed` sur les deux fichiers, et `82 passed, 1 xfailed` sur `test_enqueue_*`, `test_shutdown_*` et `test_batch_pool_full_rejection*`.
  - **Suites voisines** (QA, `-k "zmq_pool or translation_processor or batch or pool or zmq or handler"`) : 454 passés et 5 échecs sur la branche, contre 446 passés et 13 échecs sur `dev` (les 8 nouveaux témoins). Les 5 échecs préexistants et les 31 erreurs de collecte sont identiques des deux côtés (dépendances ML absentes).
  - **Mutations QA** : 8 sur 8 tuées.
- **QA** : favorable avec réserves. R1 → #17173. R2 et R4 → #17174. R3 (un code ajouté après le `pool.put` de `_enqueue_batch` et qui lèverait ferait enfiler ET signaler le lot) n'est pas atteignable aujourd'hui, et je le consigne ici.

### Limites connues

- Une tâche refusée sur exception part à la passerelle sous le libellé « translation pool full ». La différence ne se lit que dans les stats du traducteur. → #17174.
- Le gestionnaire garde des `{e}` bruts hors du chemin d'entrée des traductions. → #17173.

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle n'est pas fusionnée, la reprendre : la mettre à jour sur `dev`, lancer `workflow_dispatch` de `ci.yml`, puis fusionner au vert.
1. #17004 côté passerelle : un refus transitoire n'alimente plus le disjoncteur.
2. #17173 et #17174 : petits lots sur `zmq_translation_handler.py`, à grouper.
3. #17132 et #17133.
4. Toujours : lire `call_caption_translation_seconds` sur le staging et faire la recette fr↔en de #16613.

## Cycle 18 — 2026-11-09

- **Base** : `origin/dev` @ `ee28259f9`. La PR #17175 du cycle 17 (#16822) n'est **pas fusionnée**. La CI `workflow_dispatch` est verte sur sa tête (`7119ae8d6`, run 42536705135), sa base est la tête de `dev`, et j'ai relancé ses témoins (`67 passed, 1 xfailed` sur `test_enqueue_*` et `test_shutdown_*`). La fusion échoue : `405 Cannot change this locked branch`, car `dev` est verrouillée et rien n'y fusionne depuis 00:22 (heure de Paris). Le porteur est prévenu. Cette branche **inclut** la branche du cycle 17 (fusionnée dedans), pour que les deux journaux ne se contredisent pas.
- **Branche** : `claude/determined-volta-ickams`.
- **Objectif** : #17004, piste 1 du cycle 17. Un arrêt chargé du traducteur n'ouvre plus le disjoncteur de traduction de la passerelle.
- **Constat** : `ZmqTranslationClient` appelait `_cbRecordError()` pour **chaque** `translation_error`, avant de tester « translation pool full ». Les trois chemins de refus du traducteur publient tous ce libellé, via `_pool_full_error` :
  - file pleine ;
  - arrivée pendant l'arrêt ;
  - tâches restantes signalées à l'arrêt.
  Huit refus de suite suffisaient donc à ouvrir le disjoncteur, qui rejetait alors **toutes** les traductions pendant 30 s.
- **Livré** (seule la passerelle change, d'une ligne : ni le protocole ZMQ, ni le traducteur, ni le JSON) : un refus « translation pool full » ne compte plus au disjoncteur et ne remet pas la série à zéro, puisque ce n'est pas un succès. `errors_received`, `pool_full_rejections`, le maintien de la requête armée et l'émission de `translationError` sont inchangés.
- **Tests** :
  - Fichiers : `ZmqTranslationClient.circuitBreakerTransient.test.ts` (4 tests) et `..._qa.test.ts` (QA : 5 tests). Les tests QA font passer le JSON réel de `_pool_full_error` par le vrai `ZmqMessageHandler`.
  - **Rouge avant le correctif** : `✕ laisse partir une traduction après vingt refus « pool full » consécutifs`, avec `Rejected to value: [Error: ZMQ circuit breaker OPEN …]`.
  - **Vert** : relancé par moi, 9 sur 9. Les suites `ZmqTranslationClient*` et `zmq-translation/__tests__` donnent 18 suites et 413 tests (QA). `tsc --noEmit` passe.
  - **Mutations QA** : 7 tuées sur 8. Celle qui survit, `includes('pool full')`, est équivalente.
- **QA** : favorable avec réserves.
  - R1 : le libellé est un contrat non déclaré, écrit en dur à quatre endroits. → #17189.
  - R2 : en saturation durable, le disjoncteur ne déleste plus la charge. C'est voulu : le renvoi est borné à `maxRetries+1` = 5 envois espacés de 30 s, puis un seul échec est annoncé, ce que vérifie le témoin QA 5. Je le consigne ici sans issue.
  - R3 : le témoin de l'auteur contournait le décodeur. Les tests QA comblent ce manque.

### Limites connues

- Le libellé « translation pool full » est un contrat implicite. → #17189, à coordonner avec la partie R2 de #17174.
- Un traducteur saturé en permanence n'est plus délesté par le disjoncteur. Seul le renvoi borné le limite.

### Cycle suivant : par où reprendre

0. **Dès que `dev` est déverrouillée** :
   - fusionner #17175, déjà verte, en relançant `workflow_dispatch` si `dev` a bougé ;
   - puis fusionner la PR de ce cycle, qui contient #17175.
1. #17173 et #17174 : petits lots sur `zmq_translation_handler.py`, à grouper. #17189 pourra les suivre.
2. #17132 et #17133.
3. Toujours : lire `call_caption_translation_seconds` sur le staging et faire la recette fr↔en de #16613.

## Cycle 19 — 2026-11-09

- **Base** : `origin/dev` @ `a1914f562`. Les PR #17175 (cycle 17) et #17190 (cycle 18) y sont fusionnées.
- **Branche** : `claude/determined-volta-ko85so`.
- **Objectif** : #17173 et #17174 (R4), piste 1 du cycle 18. Le gestionnaire de traduction ne journalise plus d'exception brute. Une requête qui lève avant d'entrer en file est signalée, et sa réserve est libérée.
- **Livré** (seul le traducteur change : ni le protocole ZMQ, ni la passerelle, ni le JSON publié) :
  - **#17173** : sept sites de `zmq_translation_handler.py` n'écrivent plus que `type(e).__name__` (init voix ×2, JSON multipart, sauvegarde base, post, Voice API, plus le nouveau site de signalement). Le `traceback.print_exc()` du site Voice API, qui écrivait sur stderr, est retiré.
  - **#17174 R4** : `_handle_translation_request` suit la réserve prise (`claimed_task_id`), la tâche construite et le moment où la file prend la charge (`outcome_owned`). Si une exception arrive avant ce moment, `_report_unprocessed` libère la réserve et publie **une** `translation_error` au JSON inchangé (« translation pool full », transitoire côté passerelle). Il n'y a jamais de double publication, même si le signalement lève. Le gain réel tient à la réserve libérée : la relance de la passerelle (à 30 s) est réacceptée, alors qu'avant elle était ignorée jusqu'au TTL de déduplication (≥ 75 s). La passerelle, elle, attend toujours ses 30 s.
  - **R2** (libellé distinct pour saturation et panne) : non fait. Il est rattaché à #17189.
- **Tests** : `tests/test_handler_raw_logs_and_raising_task.py` (17 tests) et `..._qa.py` (QA, 4 gardes : la vraie file, `CancelledError`, un re-push dédupliqué, une branche sans tâche).
  - **Rouge sur `origin/dev`** : 14 sur 17, par exemple `exception brute journalisée : ['❌ [TRANSLATOR] Erreur traitement Voice API: SECRET-TEXT-17173 voice']` ou `assert [] == [{'type': 'tr...l full', ...}]`.
  - **Vert** : relancé par moi, `115 passed, 1 xfailed` sur les fichiers du lot, `test_enqueue_*`, `test_shutdown_*`, `test_batch_pool_full_rejection*` et `test_translation_task_dedup*`.
  - **Suites qui importent le handler** (QA, 21 fichiers) : 319 passés et 3 échecs sur la branche, contre 302 passés et 3 échecs sur `dev`. Les 3 échecs sont les mêmes des deux côtés : `test_20::test_audio_process_missing_fields` et deux cas de `test_audio_at_rest_and_forget`, liés à l'environnement.
  - **Mutations QA** : 9 tuées, 2 survivantes équivalentes. La ligne morte que montrait M2 est retirée.
  - La garde textuelle voit maintenant aussi `{e!r}`, `{str(e)}` et `{repr(e)}` (réserve R4 de la QA).
- **Environnement** : `python -m pytest` est absent du conteneur. On utilise un venv jetable (`uv pip install --no-config --index-url https://pypi.org/simple`, parce que l'index pytorch est refusé par le proxy) et on lance avec `-p no:cacheprovider --no-cov`.
- **QA** : favorable avec réserves. R1 (le gain annoncé au commit était surévalué) est corrigé ici et dans la docstring. R2 → #17189. R3 (ligne morte) et R4 (garde faible) sont corrigées dans ce lot. R5 : les échecs préexistants, hors périmètre.

### Découvert en chemin

- #17204 : `MessageLimits` n'est pas importé. Un message trop long lève `NameError` au lieu de publier `translation_skipped`.
- #17205 : un premier frame multipart qui n'est pas de l'UTF-8 lève `UnicodeDecodeError`, et cette exception remonte. Le `{error}` de `_handle_cache_forget` reste à trancher.

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle n'est pas fusionnée, la reprendre : lancer `workflow_dispatch` de `ci.yml`, puis fusionner au vert.
1. #17204 : petit, net et visible côté passerelle.
2. #17205, puis #17189 (contrat déclaré du libellé et R2 de #17174).
3. #17132 et #17133.
4. Toujours : lire `call_caption_translation_seconds` sur le staging et faire la recette fr↔en de #16613.

## Cycle 20 — 2026-11-13

- **Base** : `origin/dev` @ `df2559c7`. La PR du cycle 19 (#17173/#17174) y est fusionnée.
- **Branche** : `claude/determined-volta-cv5nm1`.
- **Objectif** : #17204, piste 1 du cycle 19. Un texte trop long pour être traduit est annoncé à la passerelle, qui le solde sans le renvoyer.
- **Constat** : le défaut avait deux moitiés.
  - Côté traducteur : `MessageLimits` n'était pas importé. Le `NameError` était avalé, et aucun `translation_skipped` ne partait.
  - Côté passerelle : `translation_skipped` était inconnu (le `default` de `routeEvent`). Même publié, il laissait la requête armée, et le délai la renvoyait jusqu'à `ZMQ_MAX_RETRIES` avant un `translationError`.
- **Livré**, sans changer aucun champ existant :
  - **Traducteur** : l'import est corrigé. Le JSON `translation_skipped` reçoit en plus un champ `taskId`, quand la requête en porte un. Le log reste un warning, sans le texte.
  - **Passerelle** : `ZmqMessageHandler` route `translation_skipped` vers `translationSkipped`, en ne gardant un `taskId` que s'il est une chaîne non vide. `ZmqTranslationClient` solde alors la requête (`retryCount` et pending). Il ne touche ni au disjoncteur ni aux `stats`, et n'émet pas `translationError`, si bien que le lecteur garde l'original. Il ré-émet `translationSkipped`.
  - **Rétrocompatibilité** : l'ancienne passerelle ignore l'événement, comme avant. Un skipped sans `taskId` venu d'un ancien traducteur ne solde rien.
- **Tests** :
  - Fichiers : `services/translator/tests/test_translation_skipped_too_long.py` (3 tests), `ZmqTranslationClient.translationSkipped.test.ts` (4 tests) et `..._qa.test.ts` (QA, 9 tests).
  - **Rouge avant le correctif** :
    - traducteur : `[TRANSLATOR] Erreur lors du traitement de la requête: NameError`, puis `2 failed, 1 passed` ;
    - passerelle : `3 failed, 1 passed`.
  - **Vert** : relancé par moi, `13 passed` sur les deux suites passerelle et `3 passed` côté traducteur. La QA mesure 19 suites et 417 tests passerelle `zmq-translation`, `tsc` qui passe, et 24 tests traducteur sur les fichiers du lot et ceux du cycle 19.
  - **Mutations QA** : 8 sur 8 font rougir les témoins.
- **QA** : favorable avec réserves.
  - R2 : la traduction directe d'un texte trop long attend encore ses 10 s. → #18041.
  - R1, R3 et R4 : le solde n'est pas restreint aux traductions texte, aucun compteur ne compte les refus, et des champs sont relayés sans contrôle de type. → #18042.

### Limites connues

- Aucun client ne sait encore dire « texte trop long pour être traduit ». Le lecteur voit l'original, sans indication.

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle n'est pas fusionnée, la reprendre : lancer `workflow_dispatch` de `ci.yml`, puis fusionner au vert.
1. #18041 (petit, visible) et #18042.
2. #17205, puis #17189 (contrat déclaré du libellé « pool full »).
3. #17132 et #17133.
4. Toujours : lire `call_caption_translation_seconds` sur le staging et faire la recette fr↔en de #16613.

## Cycle 21 — 2026-11-13

- **Base** : `origin/dev` @ `16999369`. La PR du cycle 20 (#18043, #17204) y est fusionnée.
- **Branche** : `claude/determined-volta-xyx877`.
- **Objectif** : #18041, piste 1 du cycle 20. Une traduction directe (`POST /translate-blocking` sans `message_id`) d'un texte trop long rend l'original tout de suite au lieu d'attendre 10 s puis de servir le faux `"[EN] <texte>"`.
- **Livré** (seule la passerelle change : ni le protocole ZMQ, ni le traducteur, ni la forme de la réponse) :
  - `directTextTranslation.ts` : `awaitResponse` écoute `translationSkipped`. Sur le `taskId` de sa requête, `cleanup()` retire les QUATRE écouteurs et le délai, puis rejette `TooLongRefusal`. `servesOriginal` (ex-`isUnsupportedPair`) rend alors `untranslatedResult` (`modelType: 'none'`, règle 1 du Prisme), sans `incrementErrors`.
  - **Rétrocompatibilité** : un skipped sans `taskId` (ancien traducteur) est ignoré, et la requête retombe sur le comportement d'avant. La route sert la même forme que pour une paire non servie (#3659).
- **Tests** : `MessageTranslationService.direct-too-long.test.ts` (8 tests, dont un bout-en-bout qui fait passer la trame JSON réelle du traducteur par le vrai `ZmqMessageHandler` et le vrai `ZmqTranslationClient`).
  - **Rouge avant le correctif** : `3 failed, 5 passed` (`still waiting after 1s`, `Exceeded timeout of 10000 ms`). Les 5 verts gardent le nettoyage.
  - **Vert** : relancé par moi, `11 passed` sur `MessageTranslationService.direct*`. La QA mesure 41 suites et 818 tests (`MessageTranslationService*`, `routes/translation-*`, `zmq-translation`), `tsc --noEmit` à 0.
  - **Mutations QA** : 7 sur 7 font rougir les témoins.
- **QA** : favorable. Remarques non bloquantes : le bout-en-bout touche des internes privés par cast (comme le test de référence de `ZmqTranslationClient`) ; un refus qui arriverait avant la pose des écouteurs reste théorique, comme pour les trois autres événements.

### Limites connues

- La route ne dit pas au client POURQUOI rien n'a été traduit (texte trop long). Le dire changerait le contrat ; ce n'est pas demandé tant qu'aucun client ne sait l'afficher (voir la limite du cycle 20).

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle n'est pas fusionnée, la reprendre : lancer `workflow_dispatch` de `ci.yml`, puis fusionner au vert.
1. #18042 (solde restreint aux traductions texte, compteur des refus, contrôle de type des champs relayés).
2. #17205, puis #17189 (contrat déclaré du libellé « pool full »).
3. #17132 et #17133.
4. Toujours : lire `call_caption_translation_seconds` sur le staging et faire la recette fr↔en de #16613.

## Cycle 22 — 2026-11-13

- **Base** : `origin/dev` @ `6e2d9e55`. Le lot du cycle 21 (#18041) y est fusionné.
- **Branche** : `claude/determined-volta-fe3zrg`.
- **Objectif** : #18042, piste 1 du cycle 21. Un `translation_skipped` ne solde que la traduction texte qu'il vise, il se compte, et ses champs sont filtrés par type.
- **Livré** (seule la passerelle change : ni le protocole ZMQ, ni le traducteur) :
  - **`ZmqRequestSender`** : chaque entrée en attente porte un `kind` (`translation`, `audio_process`, `transcription`, `voice_api` ou `voice_profile`), posé aux cinq sites d'insertion. Le `kind` survit au réarmement. Nouvel accesseur : `hasPendingTranslationRequest`.
  - **`ZmqTranslationClient`** : l'écouteur `translationSkipped` ne solde que si l'entrée est une traduction texte, et il ré-émet toujours l'événement. La traduction directe (#18041) reste soldée. Nouveau compteur `translation_skipped` dans `ZMQClientStats`.
  - **`ZmqMessageHandler`** : un `messageId` ou un `conversationId` qui n'est pas une chaîne devient `''`, et une `reason` qui n'en est pas une devient `'unknown'`. Le log utilise les valeurs filtrées.
- **Tests** : `ZmqTranslationClient.translationSkipped-scope.test.ts` (8) et `..._qa.test.ts` (QA, 6). Tous passent par une vraie trame JSON.
  - **Rouge avant le correctif** : `5 failed, 3 passed`. Les 3 verts gardaient le comportement existant.
  - **Vert** : relancé par moi, `29 passed` sur `translationSkipped*` et `direct-too-long`, puis `14 passed` sur les deux fichiers du lot.
  - **Gate QA** : 41 suites et 883 tests (`zmq-translation`, `ZmqRequestSender`, `MessageTranslationService`, `ZmqMessageHandler`, `admin-monitoring`). `tsc --noEmit` passe.
  - **Mutations QA** : 12 sur 12 font rougir les témoins. M3c (site audio posé en `translation`) survivait à la suite d'origine ; c'est le témoin QA qui la tue.
- **Preuve CI** : le gel `CI_DEV_SEUL` (#18048) ne fait tourner que les jobs de `dev`. Le lot est donc prouvé en local, puis par la CI de `dev` après fusion.
- **QA** : favorable avec réserves.
  - R1 (le compteur n'est lu par aucun monitoring) et R3 (la `reason` n'a pas de borne de longueur) → #18064.
  - R4 : `''` sur un identifiant invalide n'a aucun consommateur aujourd'hui.
  - La même largeur subsiste sur `translationError` → #18063.

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle n'est pas fusionnée, la reprendre.
1. #18063 (`translationError` borné aux requêtes texte, champs filtrés), puis #18064 (compteurs ZMQ visibles dans le monitoring admin).
2. #17205, puis #17189 (contrat déclaré du libellé « pool full »).
3. #17132 et #17133.
4. Toujours : lire `call_caption_translation_seconds` sur le staging et faire la recette fr↔en de #16613.

## Cycle 23 — 2026-11-13

- **Base** : `origin/dev` @ `04a61d59`. Le lot du cycle 22 (#18042) y est fusionné.
- **Branche** : `claude/determined-volta-xsbr3g`.
- **Objectif** : #18063. Un `translationError` ne solde que la traduction texte qu'il vise, et ses champs relayés sont filtrés par type.
- **Livré** (seule la passerelle change : ni le protocole ZMQ, ni le traducteur, ni la forme émise pour une trame valide) :
  - **`ZmqTranslationClient`** : l'écouteur `translationError` commence par une garde (`_isPendingNonTranslationRequest`). Une erreur qui porte le taskId d'une requête audio, transcription ou voix en attente n'est ni soldée, ni comptée (`errors_received`, `pool_full_rejections`, disjoncteur), ni relayée : un `warn` seulement. Le traducteur ne publie `translation_error` que pour du texte, donc l'erreur est mal adressée. La relayer aurait fait diffuser `translation:failed` par `MessageTranslationService`. La garde passe avant les branches `UNSUPPORTED_LANGUAGE` et « pool full » : `settleTranslationLanguage` supprimait toute entrée sans `pendingLanguages`.
  - **`ZmqMessageHandler.handleTranslationError`** filtre par type, comme `handleTranslationSkipped` : `messageId` et `conversationId` → `''`, `error` → `'unknown error'`, `taskId`, `errorCode` et `targetLanguage` gardés seulement s'ils sont des chaînes non vides, `metadata` gardé seulement si c'est un objet simple, sinon `{}`. Nouveau type `TranslationErrorPayload`.
  - **Rétrocompatibilité** : une erreur sans taskId (ancien traducteur) ou sous un taskId inconnu est toujours relayée.
- **Tests** : `ZmqTranslationClient.translationError-scope.test.ts` (18, sur de vraies trames JSON).
  - **Rouge avant le correctif** : `11 failed, 7 passed`. La QA l'a reproduit en remettant le code de `origin/dev` en place.
  - **Vert** : relancé par moi, `45 passed` sur `translationError-scope` et `translationSkipped*`. La QA mesure 36 suites et 730 tests (`zmq-translation`, `ZmqRequestSender`, `ZmqMessageHandler`, `MessageTranslationService`, `admin-monitoring`, `directTextTranslation`). `tsc --noEmit` sort à 0.
  - **Mutations QA** : 15 sur 16 font rougir les témoins. La survivante (M15, garde `if (taskId)` autour de `settle`) est équivalente.
- **QA** : favorable avec réserves. R1 (`_handleTranslationError` typé `taskId: string`) et R2 (`translation:failed` diffusé vers la room fantôme `conversation:`) → #18097.

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle n'est pas fusionnée, la reprendre.
1. #18064 (compteurs ZMQ visibles dans le monitoring admin, borne de longueur sur `reason`), puis #18097.
2. #17205, puis #17189 (contrat déclaré du libellé « pool full »).
3. #17132 et #17133.
4. Toujours : lire `call_caption_translation_seconds` sur le staging et faire la recette fr↔en de #16613.

## Cycle 24 — 2026-11-14

- **Base** : `origin/dev` @ `fc9ac0a2`. Le lot du cycle 23 (#18063) y est fusionné.
- **Branche** : `claude/determined-volta-vs83hp`.
- **Objectif** : #18064. Les compteurs du client ZMQ (`translation_skipped`, `pool_full_rejections`, `errors_received`) se lisent dans le monitoring admin, et la `reason` loguée d'un refus est bornée.
- **Livré** (seule la passerelle change : ni le protocole ZMQ, ni le traducteur ; aucun champ existant renommé ni retiré) :
  - **`routes/admin/monitoring.ts`** : nouvelle clé `translatorClient`, qui peut valoir `null`. Elle est lue par `translationService.getZmqClient().getStats()` et porte `requestsSent`, `resultsReceived`, `errorsReceived`, `poolFullRejections` et `translationSkipped`. Elle est déclarée au schéma de réponse. Elle vaut `null`, avec un statut 200, si le service n'a pas de client, si le client est `null`, s'il n'a pas de `getStats` ou si `getStats` lève. Un compteur absent ou non fini sort à 0. `MessageTranslationService.ts` (3023 lignes, hors budget) n'est pas touché.
  - **`ZmqMessageHandler`** : la `reason` d'un `translation_skipped` est bornée à 64 caractères, dans le journal comme dans l'événement relayé. Aucun consommateur ne lit son contenu (`directTextTranslation` ne lit que `taskId`).
  - **Correction QA** : `avg_response_time` n'est jamais mis à jour dans `ZmqTranslationClient`, il sortait donc toujours à 0. Le champ est retiré de la réponse et un témoin vérifie qu'il est filtré. `errorsReceived` contient déjà les refus de pool plein, et le doc-comment le dit.
- **Tests** : 9 dans `admin-monitoring.test.ts`, qui passent par le vrai sérialiseur via `app.inject`, dont un avec un vrai `ZmqTranslationClient` qui reçoit une trame du fil. 4 dans `ZmqMessageHandler.skippedReasonBound.test.ts`. Plus 1 témoin QA.
  - **Rouge avant le correctif** : `10 failed, 23 passed`. La QA l'a reproduit en remettant le code de `origin/dev` : `10 failed, 27 passed`.
  - **Vert** : relancé par moi, `60 passed` sur 6 suites (`admin-monitoring.test`, `skippedReasonBound`, `translationSkipped*`). `tsc --noEmit` sort à 0. La QA mesure 84 suites et 1187 tests (`admin-monitoring`, `zmq-translation`, `ZmqTranslationClient`, `ZmqMessageHandler`, `MessageTranslationService`, `security/`), plus `route-manifest` (43 tests).
  - **Mutations QA** : 7 sur 7 font rougir les témoins.
- **QA** : favorable avec réserves. Affichage web de `translatorClient`, confusion possible entre les deux `poolFullRejections`, temps de réponse ZMQ jamais mesuré → #18154.

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle n'est pas fusionnée, la reprendre.
1. #18097 (`_handleTranslationError` typé, et `translation:failed` qui ne part plus vers la room fantôme `conversation:`).
2. #17205, puis #17189 (contrat déclaré du libellé « pool full »).
3. #17132, #17133 et #18154.
4. Toujours : lire `call_caption_translation_seconds` et `translatorClient` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 25 — 2026-11-14

- **Base** : `origin/dev` @ `ac59c0e6`. Le lot du cycle 24 (#18064) y est fusionné.
- **Branche** : `claude/determined-volta-ah45gp`.
- **Objectif** : #18097. `_handleTranslationError` reçoit un `TranslationErrorPayload`, et aucun `translation:failed` ne part sans `conversationId`.
- **Livré** (seule la passerelle change ; aucune charge socket modifiée pour un `conversationId` valide) :
  - **`MessageTranslationService._handleTranslationError`** est typé `TranslationErrorPayload`.
  - Un échec dont le `conversationId` est vide est toujours compté (`errors`, `pool_full_rejections`). Il n'émet plus `translationFailed` : un `warn` le dit. C'est le seul émetteur de `translationFailed`, et son seul abonné est `MeeshySocketIOManager._handleTranslationFailed`. La room fantôme `conversation:` ne reçoit donc plus rien.
  - Budget : le fichier fait 3023 lignes, hors budget. Le diff y est de +7/−7, sans aucun ajout net.
- **Tests** : `MessageTranslationService.translationFailedNoConversation.test.ts` (4). L'événement `translationError` est émis sur le faux client ZMQ.
  - **Rouge avant correctif** : `2 failed, 2 passed`. La QA l'a reproduit en remettant le code de `origin/dev` en place.
  - **Vert** : relancé par moi, `4 passed`, avec `toStrictEqual` sur le cas sans `taskId` (réserve QA 3). La QA mesure 44 suites et 877 tests (`translation-failure-broadcast`, `MessageTranslationService`, `zmq-translation`, `ZmqTranslationClient`, `ZmqMessageHandler`, `directTextTranslation`, `admin-monitoring`). `tsc --noEmit` sort à 0.
  - **Mutations QA** : 4 sur 4 font rougir les témoins.
- **QA** : favorable avec réserves.
  - Un `conversationId` non vide mais invalide est encore diffusé, et le chien de garde émet sans `metadata` → #18232.
  - Témoin du `taskId` absent trop laxiste (`toEqual`) : corrigé dans le lot.

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle n'est pas fusionnée, la reprendre.
1. #18232 (identifiant de conversation validé avant diffusion, `metadata` du chien de garde).
2. #17205, puis #17189 (contrat déclaré du libellé « pool full »).
3. #17132, #17133 et #18154.
4. Toujours : lire `call_caption_translation_seconds` et `translatorClient` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 26 — 2026-11-14

- **Base** : `origin/dev` @ `4408c1e7`. Le lot du cycle 25 (#18097) y est fusionné.
- **Branche** : `claude/determined-volta-wqyhpl`.
- **Objectif** : #18232. Un échec de traduction n'est diffusé qu'à une conversation dont l'identifiant est un ObjectId, et le chien de garde émet un `TranslationErrorPayload` complet.
- **Livré** (seule la passerelle change : ni le protocole ZMQ, ni le traducteur, ni la charge `translation:failed` quand l'identifiant est valide) :
  - **`MessageTranslationService._handleTranslationError`** : la garde passe de `!data.conversationId` à `!isValidObjectId(data.conversationId)`. Un identifiant invalide (`'  '`, `conv-1`, 23 hex, un `z`) est toujours compté, n'est pas diffusé, et un `warn` le dit. Le fichier fait 3023 lignes avant comme après : l'import en double de `TranslationErrorPayload` a été fusionné pour garder zéro ajout net.
  - **`ZmqTranslationClient._registerRequestTimeout`** devient générique sur le nom d'événement (`TimeoutErrorEvent<E>`). Pour `'translationError'`, `tsc` exige un `TranslationErrorPayload`, et le site texte fournit `metadata: {}`. Les chemins audio, transcription et voix gardent leur forme.
  - La QA a vérifié qu'aucun identifiant légitime n'est perdu. `Message.conversationId` est un `@db.ObjectId`, les trois appelants de `sendTranslationRequest` le lisent en base, et les requêtes qui ne portent pas sur un message (`direct-text:`, `call-caption:`, post, story) sont écartées plus haut par `isMessageTranslationTarget`.
- **Tests** : 6 témoins ajoutés à `MessageTranslationService.translationFailedNoConversation.test.ts`, et `ZmqTranslationClient.timeoutErrorPayload.test.ts` (4, sur minuteries simulées et les trois chemins d'expiration). Une fixture de `MessageTranslationService.branches.test.ts` passe de `conv-1` à un ObjectId, sans changer son assertion.
  - **Rouge avant correctif** : `9 failed, 6 passed`. La QA l'a reproduit en remettant le code de `origin/dev` en place.
  - **Vert** : relancé par moi, `15 passed` sur les deux fichiers. La QA mesure 48 suites et 898 tests (`MessageTranslationService`, `translation-failure-broadcast`, `zmq-translation`, `ZmqTranslationClient`, `ZmqMessageHandler`, `call-caption`, `directTextTranslation`, `admin-monitoring`). `tsc --noEmit` sort à 0.
  - **Mutations QA** : 4 sur 4 font rougir les témoins de la garde. Retirer `metadata`, puis `messageId`, du chien de garde fait échouer `tsc` (TS2345).
- **QA** : favorable. Remarque : un ObjectId en majuscules passe la garde et part vers une room où personne n'est abonné (déjà le cas sur `origin/dev`) → #18371.

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle n'est pas fusionnée, la reprendre.
1. #17205, puis #17189 (contrat déclaré du libellé « pool full »).
2. #17132, #17133, #18154 et #18371.
3. Toujours : lire `call_caption_translation_seconds` et `translatorClient` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 27 — 2026-11-14

- **Base** : `origin/dev` @ `8ab427ff`. Le lot du cycle 26 (#18232) y est fusionné.
- **Branche** : `claude/determined-volta-c27utf8`.
- **Objectif** : #17205. Un premier frame multipart qui n'est pas de l'UTF-8, ou qui n'est pas un objet JSON, est refusé proprement par le traducteur.
- **Livré** (seul le traducteur change : ni le protocole ZMQ, ni la passerelle, ni le routage par `type`) :
  - **`zmq_request_frame.parse_request_frame`** (nouveau) : une fonction pure qui rend le `dict` ou `None`. Elle attrape `UnicodeDecodeError` et `JSONDecodeError`, et refuse un JSON qui n'est pas un objet. Sa seule ligne `[TRANSLATOR]` ne nomme que le type.
  - **Le routeur `zmq_server_core`** décodait le frame sans garde, et il le fait avant le handler. Le défaut y était plus large que ce que décrivait l'issue : un `b'\xff\xfe'` remontait jusqu'à la boucle de réception, qui loguait `{e}` puis imprimait une traceback. Le routeur et le handler passent maintenant tous deux par la fonction, et sortent sur `None`.
  - **`_handle_cache_forget`** : décision d'aligner le log sur `type(error).__name__`. Les quatre sites de levée actuels ne portent aucun identifiant, mais un site futur pourrait en porter. Le refus reste fail-closed.
- **Tests** : `tests/test_zmq_non_utf8_frame.py` (15). Ils couvrent le routeur, le handler, la vraie boucle `start()` et l'oubli non confirmé, avec un secret placé dans le frame.
  - **Rouge avant le correctif** : `14 failed, 1 passed`. La QA l'a reproduit avec le code de `origin/dev`.
  - **Vert** : relancé par moi, `59 passed` sur le nouveau fichier et trois voisins. Sur la QA, 16 fichiers `test_*zmq*`, `test_*handler*` et `test_*forget*` donnent `376 passed, 6 skipped, 5 errors` avant comme après, avec une liste d'échecs identique. Les 5 erreurs, préexistantes, viennent de `TestRealTranslatorIntegration`.
  - **Mutations QA** : 8 sur 8 font rougir les témoins.
- **Environnement** : venv uv jetable (recette du cycle 20), lancé par `python -m pytest -p no:cacheprovider -o addopts=""`.
- **QA** : favorable avec réserves. Les trois réserves vont dans #18436 :
  - R2 : la boucle de réception logue encore `{e}` et imprime une traceback pour les autres exceptions.
  - R1 : la branche `except JSONDecodeError` du handler est morte.
  - R3 : un avertissement `never awaited` apparaît dans le test.

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle n'est pas fusionnée, la reprendre.
1. #17189 (contrat déclaré du libellé « pool full »), puis #18436.
2. #17132, #17133, #18154 et #18371.
3. Toujours : lire `call_caption_translation_seconds` et `translatorClient` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 28 — 2026-11-14

- **Base** : `origin/dev` @ `a978a2c2`. Le lot du cycle 27 (#17205) y est fusionné.
- **Branche** : `claude/determined-volta-6f599d`.
- **Objectif** : #17189. Le refus transitoire du traducteur (« translation pool full ») devient un contrat déclaré : un `errorCode` additif `TRANSLATION_POOL_FULL`, lu par la passerelle à côté du libellé historique, et un test de contrat qui tombe si l'un des deux côtés change.
- **Livré** (passerelle et traducteur ; aucune charge socket vers les clients ne change) :
  - **Traducteur** : `_pool_full_error` ajoute `errorCode: 'TRANSLATION_POOL_FULL'` en dernière clé, à côté de `error: 'translation pool full'`. Le code et le libellé deviennent deux constantes de module. Une ancienne passerelle reçoit le même JSON avec un champ de plus ; son parseur, qui n'est pas strict, le relaie déjà sans effet.
  - **Passerelle** : `TRANSLATION_POOL_FULL_ERROR_CODE` et `LEGACY_POOL_FULL_ERROR` sont déclarés dans `zmq-translation/types.ts`, à côté de `UNSUPPORTED_LANGUAGE`. Un prédicat unique, `isTransientPoolRefusal` (`utils/zmq-helpers.ts`, hors du barrel qui chargerait l'addon zeromq), reconnaît le code OU le libellé. Il remplace le littéral aux trois sites : le disjoncteur neutre, la requête laissée armée avec `pool_full_rejections`, et `MessageTranslationService` (diff net 0, fichier hors budget).
  - **Décision** : le code n'est pas négocié par `acceptsErrorCodes`. Il est additif et ne termine pas la requête : une passerelle qui l'ignore lit le libellé et garde le même comportement. `UNSUPPORTED_LANGUAGE`, lui, se négocie parce qu'il REMPLACE un comportement.
- **Tests** :
  - `transientPoolRefusal.contract.test.ts` (11) : il lit la source Python, teste le prédicat et le client avec le code seul.
  - `test_pool_full_error_code.py` (3) : le test symétrique, qui lit `types.ts`.
  - Un témoin s'ajoute à `MessageTranslationService.translationFailedNoConversation`.
  - Sept témoins Python figeaient la forme du refus : ils l'ont gardée exacte, avec `errorCode` en plus.
  - **Rouge avant correctif** : passerelle `11 failed, 12 passed`, traducteur `5 failed, 18 passed`. La QA l'a reproduit avec le code de `origin/dev` : 11/181 côté passerelle, 14/76 côté traducteur.
  - **Vert** : relancé par moi, passerelle `23 passed` sur 2 suites et traducteur `23 passed`. La QA mesure 47 suites et 949 tests côté passerelle ; `tsc --noEmit` sort à 0. Côté traducteur : `475 passed, 18 skipped, 1 xfailed`, plus 8 erreurs connues ou d'environnement (`TestRealTranslatorIntegration`, `soundfile`).
  - **Mutations QA** : 9 sur 9 tuées (libellé, code et constante TS renommés, `errorCode` retiré, chaque branche du prédicat retirée, chaque site ramené au libellé seul).
- **QA** : favorable avec réserves.
  - Défaut corrigé dans le lot : le chemin du test jest vers le Python échappait à `scripts/ci/voie-parite.mjs`, si bien qu'une PR qui ne touche que le traducteur ne l'aurait pas lancé. Le chemin cite maintenant `services/translator/…`.
  - Réserves : lecture par expression régulière, `as never`. Elles partent dans #18497, avec la bascule et le retrait.

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle n'est pas fusionnée, la reprendre.
1. #18436 (logs de la boucle de réception, branche morte, `never awaited`).
2. #17132, #17133, #18154 et #18371.
3. #18497 seulement après déploiement du traducteur sur le staging ET en production. Mesurer d'abord.
4. Toujours : lire `call_caption_translation_seconds` et `translatorClient` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 29 — 2026-11-14

- **Base** : `origin/dev` @ `04a31e14`. Le lot du cycle 28 (#17189, PR #18498) a été fusionné pendant ce cycle (`671c6e01`), et ses fichiers ne recoupent pas ceux de ce lot.
- **Branche** : `claude/determined-volta-40rrxt`.
- **Objectif** : #17132. Un lot refusé reste signalé à la passerelle même si `stop()` est lui-même annulé, une fois ou plus, pendant le report.
- **Livré** (seul le traducteur change : ni le protocole ZMQ, ni la passerelle, ni les compteurs) :
  - **`ConnectionManager._report_through_cancellation`** n'attend plus le report sous `asyncio.shield` puis par un `await report` sans protection. Il l'attend en boucle par `asyncio.wait`, qui ne l'annule pas. Chaque annulation suivante retrouve donc le même report, qui ne s'exécute qu'une fois. L'annulation n'est rendue qu'une fois le report fini.
  - Un `shield` en boucle a été essayé puis écarté : si le report lève, `await shield(report)` relance l'exception avant la branche d'annulation. La boucle de flush ne voit alors jamais l'annulation, et `stop()` ne se termine pas. Le témoin « report qui lève » l'a montré.
  - Un report qui lève après une annulation est journalisé par son seul type. Sans annulation, son exception est relancée telle quelle, comme avant.
  - `connection_manager.py` passe de 609 à 618 lignes.
- **Tests** : dans `test_shutdown_flush_cancel_and_quiet_logs_qa.py`, l'`xfail` de `TestSecondCancellation` est retiré. Deux témoins sont ajoutés : `TestThirdCancellation` (deux `cancel()`) et `TestReportThatRaisesAfterCancellation`.
  - **Rouge avant correctif** : `3 failed, 3 passed`. La QA l'a reproduit avec le code de `origin/dev`.
  - **Vert** : relancé par moi, `6 passed`. La QA mesure 29 fichiers : `447 passed, 6 skipped, 5 errors` avant comme après, avec une liste d'échecs identique. Les 5 erreurs, préexistantes, viennent de `TestRealTranslatorIntegration`. Sur 15 lancements avec `-W error::RuntimeWarning`, aucun avertissement « never retrieved ».
  - **Mutations QA** : 8 sur 8 font rougir les témoins.
- **QA** : favorable avec une réserve. `stop()` ne peut plus être annulé tant que le rappel de rejet n'a pas rendu la main. En production, le rappel est un envoi PUB qui ne bloque pas, et aucun appelant ne borne `stop()` → #18535.

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle (#18536) n'est pas fusionnée, la reprendre.
1. #18436, puis #17133 et #18535.
2. #18371, #18154 et #18497.
3. Toujours : lire `call_caption_translation_seconds` et `translatorClient` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 30 — 2026-11-14

- **Base** : `origin/dev` @ `c0308760`. Le lot du cycle 29 (#17132, PR #18536) y est fusionné.
- **Branche** : `claude/determined-volta-tzamrs`.
- **Objectif** : #18436. La boucle de réception du traducteur ne journalise plus que le type d'une exception, la branche JSON morte du handler de traduction disparaît, et les tests de routage n'émettent plus « never awaited ».
- **Livré** (seul le traducteur change ; ni le protocole ZMQ ni la passerelle) :
  - **`zmq_server_core.start()`** : le `except Exception` journalise `[TRANSLATOR] Requête non traitée par la boucle de réception: <Type>`. Il n'imprime plus de traceback, et la boucle continue comme avant.
  - **Le rappel de fin de `_create_tracked_task`**, que l'issue ne citait pas, avait le même défaut un cran plus loin : il journalisait `{exc}` pour toute tâche de requête qui lève. Il ne garde plus que le type.
  - **`_handle_translation_request`** : la branche `except json.JSONDecodeError` est retirée. Elle était morte : depuis #17205, le frame est décodé par `parse_request_frame` avant le handler. Le `except Exception` restant a le même corps.
  - **R3** : le faux `_create_tracked_task` ferme désormais la coroutine qu'il reçoit, dans `test_zmq_non_utf8_frame.py` et dans `test_zmq_story_text_object_routing.py`. Le même défaut existait dans ce second fichier, et le ramasse-miettes l'attribuait au premier.
- **Tests** : `tests/test_zmq_receive_loop_exception_logging.py` (2). Le premier pilote la vraie boucle `start()` avec une exception qui porte un secret, puis vérifie qu'elle continue. Le second vise une tâche suivie qui lève.
  - **Rouge** : `2 failed`. La QA l'a reproduit sur la base.
  - **Vert** : relancé par moi, `21 passed` sur les 3 fichiers touchés, sans aucun avertissement sous `-W always::RuntimeWarning`.
  - **Suites `test_*zmq*` et `test_*handler*`** : `368 passed, 6 skipped, 1 warning, 5 errors` avant, `370 passed, 6 skipped, 5 errors` après. La liste des échecs est identique : les 5 erreurs connues de `TestRealTranslatorIntegration`.
  - **Mutations QA** : 10 sur 10 font rougir les témoins.
- **QA** : favorable avec réserves.
  - R1 → #18571 : les handlers audio, transcription et voix journalisent encore `{e}` et `print_exc`, et le handler voix renvoie `str(e)` à la passerelle.
  - R2, une nuance du témoin : un vrai échec du handler `ping` est absorbé par le `try` du handler. La boucle n'est atteinte que par une erreur levée avant ce `try`, dans le routeur (`binaryFrames` mal formé, `_inject_binary_frames`). Le témoin fixe le contrat de la boucle, quelle que soit la source de l'exception.

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle n'est pas fusionnée, la reprendre.
1. #18571 : les handlers audio, transcription et voix. Le champ `error` du handler voix doit changer de façon rétrocompatible.
2. #17133 et #18535.
3. #18371, #18154 et #18497.
4. Toujours : lire `call_caption_translation_seconds` et `translatorClient` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 31 — 2026-11-14

- **Base** : `origin/dev` @ `13484857`. Le lot du cycle 30 (#18436, PR #18572) y est fusionné.
- **Branche** : `claude/determined-volta-vn6lrc`.
- **Objectif** : #18571. Les handlers audio, transcription et voix du traducteur ne journalisent plus que le type d'une exception, et les erreurs qu'ils publient à la passerelle ne portent plus le message brut.
- **Livré** (seul le traducteur change ; ni la passerelle, ni le routage, ni les types d'événements) :
  - **Logs** : 19 sites des trois handlers passent à `type(e).__name__`, et les `traceback.print_exc()` disparaissent. Le site oublié par l'issue, le nettoyage du fichier temporaire de transcription, a été trouvé par la QA et suit la même règle.
  - **Charges publiées** : le champ `error` devient un libellé fixe et non vide. `voice_api_error` porte « Voice API request failed », `voice_profile_error` « Voice profile request failed » avec `errorCode: 'INTERNAL_ERROR'` ajouté, `audio_process_error` « Audio processing failed » et `transcription_error` « Transcription failed ». Rien ne compare ce texte, ni dans la passerelle ni dans les clients. Le SDK iOS déclare `TranscriptionFailedEvent.error` non optionnel, et il reste satisfait. Avant ce lot, le message brut partait vers les logs de la passerelle, vers les réponses HTTP des routes voice et vers les sockets de conversation (`audio:transcription-failed`).
  - **Base64 invalide** : le `ValueError` levé n'embarque plus le message de l'exception d'origine (`from e`).
  - **Sites gardés** : `zmq_audio_handler.py` l.43, 66 et 83. Ce sont des `ImportError` au chargement du module, sans donnée de requête ; le diagnostic de démarrage a été voulu après l'incident du 2026-07-03.
- **Tests** : `tests/test_handlers_exception_logging.py` (15). Le helper refuse aussi tout `exc_info` dans les logs.
  - **Rouge** : `14 failed` avec les sources de `origin/dev`, que la QA a reproduit, puis `1 failed, 14 passed` pour le témoin du nettoyage.
  - **Vert** : relancé par moi, `32 passed` sur ce fichier et les deux témoins de logs des cycles 27 et 30.
  - **Suites voisines** : 30 fichiers `test_*{zmq,handler,voice,transcription}*` lancés fichier par fichier, avant et après. Les listes d'échecs sont identiques. Les échecs d'environnement préexistants sont `test_12` (5), `test_27` (1), `test_28_voice_api` (9 F et 43 E, `python-multipart` absent), `test_35` (3), et les 5 erreurs connues de `TestRealTranslatorIntegration`.
  - **Mutations QA** : 22 sur 24 tuées. Le survivant équivalent est le message du `ValueError` base64, que le handler englobant ne ressort plus. Le survivant réel était `exc_info=True`, et le témoin le tue désormais.
- **QA** : favorable avec réserves. Les deux réserves de fond sont corrigées dans le lot. Hors périmètre, deux issues ont été ouvertes :
  - #18599 : une transcription demandée par `audioPath` seul lève `UnboundLocalError` sur `Path`, à cause d'imports locaux. La passerelle actuelle envoie toujours le binaire, donc le défaut est latent.
  - #18600 : le balayage du reste du traducteur (341 sites dans 70 fichiers, à trier) et son cliquet. La règle doit réécrire le § « `except Exception` large » de `services/translator/CLAUDE.md`, qui fait encore du message brut le seul indice d'une erreur de programmation.
- **Effet de bord assumé** : un appelant HTTP des routes voice reçoit désormais un libellé générique au lieu du message brut. Le diagnostic d'une panne passe par le type dans les logs du traducteur et par `errorCode`.

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle n'est pas fusionnée, la reprendre.
1. #17133 et #18535.
2. #18599, puis #18600, à découper par répertoire.
3. #18371, #18154 et #18497.
4. Toujours : lire `call_caption_translation_seconds` et `translatorClient` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 32 — 2026-11-15

- **Base** : `claude/determined-volta-vn6lrc` @ `76ab6cc8`, la tête de la PR #18603 (cycle 31), elle-même sur `origin/dev` @ `13484857`.
  - **`dev` est verrouillée** (« Lock branch ») depuis le 2026-11-14 vers 23:10 UTC. Toute fusion rend `405 Cannot change this locked branch`. #18603 (cycle 31, #18571) et #18612 (cycle 31 bis, #18535) attendent, CI verte et QA favorable. Le porteur a été prévenu. Le lot de ce cycle touche le même fichier que #18603, d'où l'empilement.
- **Branche** : `claude/determined-volta-73ayv3`.
- **Objectif** : #18599. Une transcription demandée par simple chemin (`audioPath` seul) aboutit au lieu de lever `UnboundLocalError`.
- **Livré** (seul le traducteur change ; ni le protocole ni les événements) : les trois `from pathlib import Path` locaux de `_handle_transcription_only_request` sont retirés. Ils faisaient de `Path` une variable locale de toute la fonction.
- **Tests** : `tests/test_transcription_audio_path_mode.py` (3).
  - **Les témoins** : le mode `audioPath` ; les modes `_audioBinary` et base64, avec le nettoyage du fichier temporaire. Ces deux modes n'avaient jusqu'ici aucun témoin de succès.
  - **Rouge** : `1 failed, 2 passed` sur la base. Je l'ai relancé, et la QA l'a reproduit.
  - **Vert** : `3 passed`, relancé par moi.
  - **Suites voisines** : `59 passed` avant comme après (`test_handlers_exception_logging`, `test_06`, `test_transcription_guards`, `test_audio_at_rest_and_forget`).
  - **Mutations QA** : 3 sur 3 tuées (import local dans le `finally`, imports locaux dans les blocs binaire et base64, `unlink` retiré).
- **Environnement** : le conteneur n'a pas de pytest. Le venv monté par l'agent installe depuis pypi.org avec `uv pip install --no-config --index-url https://pypi.org/simple`, parce que la configuration du dépôt passe par `download.pytorch.org`, refusé par le proxy.
- **QA** : favorable avec réserves, toutes deux de sécurité et préexistantes.
  - #18628 : le traducteur lit des chemins fournis par ZMQ sans confinement, dans `transcription_only`, `audio_process` (legacy) et `voice_api`. Le lot remet en service une porte de plus de cette famille. Le mode n'a aucun appelant légitime : la passerelle envoie toujours le binaire.
  - #18629 : le socket PULL est lié sur `0.0.0.0:5555` sans CURVE ni ZAP, et il est publié sur l'hôte en dev et en local.
  - #18630 : `test_transcription_translation_only.py` ne collecte aucun test.

### Cycle suivant : par où reprendre

0. Si `dev` est toujours verrouillée : ne pas ouvrir d'autre lot empilé. Prévenir le porteur, ou attendre. Une fois le verrou levé, fusionner dans l'ordre #18603, #18612 (garder les sections 31, 31 bis et 32 de ce fichier), puis la PR de ce cycle, rebasée sur `dev`.
1. #18628, avec la revue de l'agent `auditeur-adversarial`, puis #17133 et #18611.
2. #18600, à découper par répertoire, puis #18630.
3. #18629, avec l'agent `sre-infra`, puis #18371, #18154 et #18497.
4. Toujours : lire `call_caption_translation_seconds` et `translatorClient` sur le staging, et faire la recette fr↔en de #16613.
## Cycle 31 bis — 2026-11-15

- **Base** : `origin/dev` @ `13484857`. **`dev` est verrouillé** (« Lock branch », `enforce_admins`) depuis environ 23:10 UTC le 2026-11-14. Le lot du cycle 31 (#18571, PR #18603, CI verte, QA favorable) n'a pas pu être fusionné : `405 Cannot change this locked branch`, essai refait à 02:35 UTC. Le porteur a été notifié.
- **Branche** : `claude/determined-volta-vxp60o`. Aucun fichier commun avec #18603, sauf ce journal.
- **Objectif** : #18535. Un rappel de rejet qui ne rend jamais la main n'empêche plus `ConnectionManager.stop()` de se terminer.
- **Livré** (seul `zmq_pool/connection_manager.py` change ; ni le protocole ZMQ ni la passerelle) :
  - `REJECTED_REPORT_SHUTDOWN_GRACE_S = 5.0` est copié dans `self.rejected_report_grace_s`.
  - Dans `_report_through_cancellation`, l'échéance est fixée à la PREMIÈRE annulation, et une annulation suivante ne la repousse pas. À l'échéance, le report est annulé, une ligne est journalisée (`… abandoned at shutdown after {grace}s: {n} tasks`), puis `CancelledError` est relancée. Sans annulation, le comportement ne change pas.
- **Tests** : `test_shutdown_report_bounded_after_cancel.py` (7) et `_qa.py` (2, ajoutés par la QA).
  - Rouge sur la base : `5 failed, 2 passed`, puis `2 failed` pour le fichier QA.
  - Vert : relancé par moi, `22 passed` avec les témoins de #17063 et #17132.
  - Suites `test_shutdown_*` et `*zmq*` : `357 passed` avant (plus 5 rouges, les nouveaux témoins), `364 passed` après. Dans les deux cas, `6 skipped, 5 errors` connues (`TestRealTranslatorIntegration`).
  - `-W error::RuntimeWarning` : `340 passed`.
  - Mutations QA : 14 sur 14 tuées. Deux survivaient d'abord (`report.cancel()` retiré, total = premier lot) ; le fichier QA les tue.
- **QA** : favorable avec réserves → #18611. `stop_workers()` → `reject_pending_at_shutdown()` et `_refuse_at_shutdown` appellent encore le rappel sans délai. Un rappel qui avale `CancelledError` laisse un report orphelin. Le commentaire sur les 10 s de `docker stop` est optimiste.
- **Fusion** : ce journal est aussi modifié par #18603, qui ajoute la section du cycle 31. La seconde PR fusionnée aura un conflit à la fin du fichier : il faut garder les deux sections, la 31 avant la 31 bis.

### Cycle suivant : par où reprendre

0. Vérifier le verrou de `dev`. S'il est levé, fusionner #18603, puis la PR de ce cycle (conflit de journal, voir plus haut).
1. #18611, puis #17133.
2. #18599 et #18600, les suites de #18571.
3. #18371, #18154 et #18497.
4. Toujours : lire `call_caption_translation_seconds` et `translatorClient` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 34 — 2026-11-15

- **Base** : `origin/dev` @ `d12608dc`, puis `c9de00ae` après la fusion de #18612. Le cycle 33 n'a fait qu'un relevé, avec `dev` verrouillée. Le verrou a été levé depuis : #18603 et #18631 (cycles 31 et 32) sont fusionnées, et ce cycle a fusionné #18612 (cycle 31 bis, #18535), dont la CI était verte sur la tête qui porte le code.
- **Branche** : `claude/determined-volta-02t5it`.
- **Objectif** : #18628. Le traducteur ne lit un chemin audio reçu par ZMQ que sous une racine autorisée.
- **Livré** (seul le traducteur change ; ni le protocole ZMQ, ni la passerelle, ni les modes binaire et base64) :
  - **Garde unique** `src/utils/audio_path_guard.py`. Il applique `resolve(strict=True)`, puis `is_relative_to` d'une racine, puis `is_file`. Il refuse aussi l'octet nul et les valeurs qui ne sont pas des chaînes. Un refus lève `AudioPathRejected`, qui ne porte qu'une raison fixe, et le garde rend la cible résolue.
  - **Six sites gardés** : `transcription_only` (seulement en mode fichier direct), le repli legacy d'`AudioFetcherService`, et dans la Voice API translate, translate_async, analyze, compare (`audioPath_1` et `audioPath_2`), profile_create, profile_update, ainsi que `extract_audio_paths`.
  - **Refus publié** : `errorCode: AUDIO_PATH_REJECTED` avec le libellé fixe « Audio path rejected ». Ni le chemin refusé ni le chemin accepté n'apparaissent dans les journaux.
  - **Racines** : `TRANSLATOR_AUDIO_PATH_ROOTS` (séparateur `os.pathsep`). Chaque entrée est nettoyée par `strip`. Les entrées relatives sont ignorées, comme celles qui se résolvent en `/`. Les racines retenues sont journalisées une seule fois. Par défaut, la seule racine est `UPLOAD_PATH` (`/app/uploads`).
  - **`/tmp` exclu des racines par défaut**, comme l'a demandé l'audit : le traducteur y garde, sous des noms prévisibles, l'audio en cours de traitement des autres utilisateurs.
- **Rétrocompatibilité** : seule la Voice API reçoit un `audioPath` de la passerelle (`AudioTranslateService.ts`, `path.join(UPLOAD_PATH, filePath)`). Aucun compose ne monte `/app/uploads` dans le traducteur, donc cette voie échouait déjà en « introuvable ». Le garde ne casse rien de ce qui marchait. Les modes binaire et base64 ne passent pas par le garde.
- **Tests** : `tests/test_audio_path_guard.py` (47), et `test_transcription_audio_path_mode.py`, adapté pour déclarer sa racine.
  - **Rouge** : `11 failed, 28 passed` sur les sites, puis `8 failed, 39 passed` pour les corrections d'audit.
  - **Vert** : relancé par moi, `72 passed` sur ces fichiers, `test_handlers_exception_logging` et `test_shutdown_report_bounded_after_cancel`.
  - **Suites voisines** (`*voice*`, `*zmq*`, transcription, audio) : la liste des échecs est identique avant et après. Les 25 échecs et 48 erreurs connus viennent de l'environnement : `test_28`, `test_35`, `test_12` et l'intégration ZMQ réelle.
- **QA** (`auditeur-adversarial`) : favorable avec réserves.
  - F1 (`/tmp`), F3 (racines non validées) et F4 (chemin accepté journalisé) sont corrigées dans le lot.
  - F5, une mutation « rend le chemin brut » qui survivait, est tuée par un témoin ajouté.
  - 15 mutations sur 16 sont tuées dès le premier passage, la seizième l'est ensuite.
  - Hors diff, trois issues sont ouvertes : #18666 (SSRF par `audioUrl`), #18667 (écriture de profil vocal pilotée par `user_id`), #18668 (`str(e)` dans le `except` générique de la Voice API).
  - L'audit rappelle que le garde ne remplace pas l'authentification du canal (CURVE, #18629).

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle n'est pas fusionnée, la reprendre.
1. #18667, puis #18666, avec l'agent `auditeur-adversarial`. Puis #18668.
2. #18629, avec l'agent `sre-infra` : c'est la vraie fermeture de la surface ZMQ.
3. #17133 et #18611, puis #18600 à découper par répertoire, puis #18630.
4. #18371, #18154 et #18497.
5. Toujours : lire `call_caption_translation_seconds` et `translatorClient` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 35 — 2026-11-15

- **Base** : `origin/dev` @ `cfaea72f`. Le lot du cycle 34 (#18628, PR #18669) a été fusionné en ouverture de ce cycle (`f02e978b`), toutes les vérifications de fond étant vertes.
- **Branche** : `claude/determined-volta-3frqmx`.
- **Objectif** : #18667. Un profil vocal reçu par ZMQ ne s'écrit que sous le répertoire temporaire du traducteur, quel que soit son `user_id`.
- **Livré** (seul `voice_profile_handler.py` change, de 761 à 824 lignes ; ni le protocole ZMQ, ni la passerelle, ni les champs de réponse) :
  - **`user_id`** : à l'entrée de `handle_analyze` et de `handle_verify`, seule une `str` qui vérifie `fullmatch(r'[0-9a-fA-F]{24}')` (un ObjectId) est acceptée. Le refus intervient avant tout décodage ou écriture : `success: False`, `error: 'Invalid user_id'`, `user_id: ''`, et rien dans les logs. La passerelle envoie toujours `auth.registeredUser.id`.
  - **Nom de fichier** : `profile_<uuid4>.<ext>` et `verify_<uuid4>.<ext>`. Aucune donnée de la requête n'y entre.
  - **Extension** : elle est tirée d'une liste fermée, `ACCEPTED_AUDIO_FORMATS`, en minuscules. La liste reprend les formats de la passerelle (`wav, mp3, ogg, webm, m4a, flac`) et leurs alias MIME. Hors de la liste, la réponse est `'Unsupported audio format'`, sans écriture.
  - **Garde** : le chemin résolu doit avoir pour parent `temp_dir` résolu. C'est une défense en profondeur.
- **Tests** : `tests/test_voice_profile_handler_temp_path.py` (104 cas sur les deux sites, dont 24 ajoutés par la QA). Dans `test_15_voice_profile_handler.py`, 10 `user_123` passent à un ObjectId.
  - **Rouge** : `24 failed, 34 passed`, puis `18 failed, 62 passed` pour la validation de l'ObjectId. La QA mesure `43 failed, 37 passed` sur le fichier final avec la base `cfaea72f`.
  - **Vert** : je l'ai relancé, `139 passed` (temp_path, test_15, exception_logging).
  - **Suites voisines** : `test_20` et `test_31` ont les mêmes 3 échecs connus avant et après (`test_audio_process_missing_fields`, deux `test_tts_result_*`).
  - **Mutations QA** : 17 essayées. 15 sont tuées, dont les 2 qui survivaient (retrait des `isinstance`), que des témoins ajoutés tuent désormais. Une est équivalente.
- **QA** (`auditeur-adversarial`) : favorable avec réserves.
  - R1 → #18697. La passerelle envoie `voice_profile_analyze`, que le routeur ZMQ ne route pas : le flux du profil vocal ne fonctionne probablement pas. Le défaut est donc latent. Le jour où le routage sera réparé, cette garde deviendra la seule barrière tant que #18629 n'est pas livrée.
  - R2 : déjà #18691. Les méthodes de `VoiceCloneService` appelées par le handler n'existent plus.
  - R3, non suivie : la liste admet `caf`, `amr`, `3gp`, `aac`, `opus`, `mp4`, qu'aucun client ne produit. ffmpeg sonde le contenu de toute façon. À réduire si on touche de nouveau la liste.
- **Ouvert pendant le cycle** :
  - #18691 : le chemin mort de `VoiceCloneService`.
  - #18692 : les messages d'exception bruts de ce handler.
  - #18694 : le format multipart `blob` côté passerelle.
  - #18695 : `voice_cache_dir / user_id` atteint par le pipeline audio ZMQ (`sender_id`), `voice_api` (`get_user_id`) et `audio_api`. C'est le plus grave.
  - #18697 : le routage de `voice_profile_analyze`.

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle n'est pas fusionnée, la reprendre.
1. #18695, avec l'agent `auditeur-adversarial` : l'écriture dans le cache de modèles vocaux reste ouverte par trois flux, dont le pipeline audio ZMQ.
2. #18666 (SSRF par `audioUrl`), puis #18668 et #18692.
3. #18697, puis #18691. Avant d'écrire, mesurer sur le staging si le flux du profil vocal répond.
4. #18629, avec l'agent `sre-infra`, puis #17133 et #18611, puis #18600.
5. Toujours : lire `call_caption_translation_seconds` et `translatorClient` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 36 — 2026-11-15

- **Base** : `origin/dev` @ `70c7bf29`. Le lot du cycle 35 (#18667) était déjà fusionné, et aucune PR de la routine n'était ouverte.
- **Branche** : `claude/determined-volta-8psi9c`.
- **Objectif** : #18695. Le cache de modèles vocaux du traducteur ne crée de dossier, n'écrit de fichier et ne forme de clé Redis que depuis un identifiant validé, sous `voice_cache_dir`.
- **Livré** (seul le traducteur change ; ni le protocole ZMQ, ni la passerelle, ni le format des clés pour un identifiant valide) :
  - **Garde unique** `src/utils/voice_cache_guard.py` :
    - `guard_voice_cache_id` impose `fullmatch(r'[A-Za-z0-9_-]{1,64}')` ;
    - `voice_cache_user_dir` vérifie que le `resolve()` du dossier a pour parent la racine résolue, ce qui couvre les liens symboliques ;
    - `VoiceCacheIdRejected` porte une raison fixe, jamais l'identifiant.
  - **Sites gardés** :
    - côté création : `get_or_create_voice_model` (avant la lecture du cache), `_create_voice_model`, `_improve_model` et le profil passerelle (`userId` et `profileId`) ;
    - côté cache et fichiers : l'améliorateur, le nom de l'audio combiné, `load_cached_model`, les trois clés `voice:profile:*` ;
    - côté pipeline : le multi-locuteur rend `{}` et retombe sur le mono-locuteur ;
    - côté HTTP : `get_user_id` de la Voice API (10 routes), `DELETE /voice/profile`, et `/v1/tts`, `/v1/register-voice`, `/v1/voice-message` répondent 400 « Invalid user identifier ».
  - **Défaut plus grave trouvé en chemin, corrigé** : `DELETE /voice/profile` avec `Bearer abc/../../x` effaçait par `rmtree` un dossier voisin du cache (rouge : 200 et dossier supprimé).
- **Rétrocompatibilité** : la QA a vérifié que tous les identifiants réellement produits passent le garde :
  - l'ObjectId de `senderId` ;
  - les `vfp_`, `vp_` et `uuid.hex[:12]` de `profileId` ;
  - les `s{n}` et `SPEAKER_00` de la diarisation ;
  - les `temp_speaker_`+UUID.
  
  Aucun client n'appelle les routes HTTP vocales du traducteur, qui n'est pas exposé. Dans le pipeline, un refus saute le clonage sans faire tomber la traduction.
- **Tests** : `tests/test_voice_cache_guard.py` (53) et `_qa.py` (36).
  - **Rouge** sur la base : `46 failed, 4 passed`. Les 2 témoins HTTP ajoutés ensuite sont aussi rouges sur la base.
  - **Vert** : `53 passed`, relancé par moi, puis `89 passed` avec le fichier QA.
  - **Suites voisines** : la liste des échecs est identique avant et après. Un échec préexistant, `test_12::test_cache_behavior` (librosa absent). Les 41 suites importatrices donnent `10 failed, 42 errors` d'environnement, identiques avant et après.
  - **Mutations QA** : 22 sur 24 tuées, dont les 2 qui survivaient d'abord (M10 DELETE, M18 `profileId`). Les deux survivantes sont redondantes entre elles, et leur retrait conjoint (M24) est tué.
- **QA** (`auditeur-adversarial`) : favorable avec réserves.
  - #18727 : `translation_stage` journalise le `senderId` brut avant le garde, ce qui permet de forger une ligne de journal. Il manque aussi une métrique des refus.
  - #18728 : l'identité de la Voice API est faite des 8 derniers caractères de l'en-tête, et `/v1/tts` accepte le `voice_id` d'autrui. Ces surfaces sont internes et sans client.
  - #18729 : des noms de fichiers temporaires sont faits d'identifiants ZMQ, et `translation_pipeline_service` n'a pas de repli mono-locuteur.
  - Complément ajouté sur #18691 : `_load_cached_model` et `_save_model_to_cache` n'existent plus.

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle n'est pas fusionnée, la reprendre.
1. #18727, petit, puis #18666 (SSRF par `audioUrl`) avec l'agent `auditeur-adversarial`.
2. #18668 et #18692, les messages d'exception bruts, puis #18729.
3. #18697, puis #18691 (mesurer d'abord sur le staging si le flux du profil vocal répond), puis #18728.
4. #18629, avec l'agent `sre-infra`, puis #17133, #18611 et #18600.
5. Toujours : lire `call_caption_translation_seconds` et `translatorClient` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 37 — 2026-11-16

- **Base** : `origin/dev` @ `ce1d2596`, puis `dev` @ `d2a1643f` fusionnée dans la branche avant la PR. Le lot du cycle 36 (#18695, PR #18730) était déjà fusionné.
- **Branche** : `claude/determined-volta-ee6sna`.
- **Objectif** : #18666. Le traducteur ne télécharge un `audioUrl` reçu par ZMQ que depuis un hôte autorisé.
- **Mesure de rétrocompatibilité** : aucun producteur de la passerelle n'envoie un `audioUrl` non vide. `ZmqRequestSender.ts:244` pose `''` et écrase le `fileUrl` que posent `MessageProcessor.ts:878` et `MessageTranslationService.ts:2718`. Le refus par défaut ne retire donc rien.
- **Livré** (seul le traducteur change ; ni le protocole ZMQ, ni la passerelle) :
  - **Garde** `src/utils/audio_url_guard.py` :
    - `admit_audio_url` accepte `https` seulement, sans identifiants, port absent ou 443. L'hôte doit figurer exactement dans `TRANSLATOR_AUDIO_URL_ALLOWED_HOSTS`, qui est **vide par défaut**, donc fail-closed. Une IP littérale doit être globale.
    - Un hôte qu'aiohttp prendrait pour une adresse sans qu'`ipaddress` le lise comme telle (`2852039166`, `127.1`, `0177.0.0.1`) est refusé. Ce correctif vient de la QA.
  - **`VerifiedAudioHostResolver`** : le connecteur aiohttp se connecte à l'adresse que le résolveur a vérifiée, ce qui supprime le DNS rebinding. Toutes les adresses résolues doivent être globales, y compris les IPv6 mappées vers de l'IPv4. Il n'y a pas de cache DNS, et `trust_env=False` fait que les proxys d'environnement sont ignorés.
  - **`_download_from_url`** : `allow_redirects=False`, et un 3xx est refusé. Le plafond de taille tient, et un fichier partiel est effacé. Les journaux ne portent plus que la raison, l'hôte autorisé ou le type de l'exception, jamais l'URL. `zmq_audio_handler.py` journalise `url=yes/none`.
  - **`tests/conftest.py`** : aiohttp n'est plus remplacé par un mock quand il est installé. Auparavant, la condition `'aiohttp' not in sys.modules` était toujours vraie.
- **Tests** : `tests/test_audio_url_guard.py` (41) et `_qa.py` (36).
  - **Rouge** sur la base : une erreur de collecte, puis `9 failed, 32 passed` avec le garde et l'ancien fetcher. La QA mesure `6 failed, 30 passed` avant son correctif.
  - **Vert** : `77 passed`, relancé par moi. La QA obtient aussi `77 passed` sous Python 3.10.20 avec aiohttp 3.13.3, la version du `uv.lock`.
  - **Suites voisines** :
    - les 5 suites qui importent `audio_fetcher` donnent `68 passed` avant comme après ;
    - les 24 suites qui importent aiohttp, la Voice API ou le pipeline donnent la même liste d'échecs avant et après, `59 failed, 434 passed, 18 skipped, 86 errors`, dus à l'environnement (`prometheus_client` absent).
- **QA** (`auditeur-adversarial`) : favorable avec réserves, **après correctif**. Sans ce correctif, le verdict aurait été défavorable : sous aiohttp 3.13.3, `https://2852039166/` listé a atteint 169.254.169.254:443.
  - #18772 : SSRF par `webhookUrl` (`translation_pipeline_service.py:787`), accessible à un utilisateur authentifié. **C'est le plus grave.**
  - #18773 : NAT64, 6to4 et Teredo à refuser explicitement ; les refus tardifs de `0x7f.1` et des IDN ; un témoin de redirection avec le vrai client ; le test d'intégration mort `src/tests/integration/test_audio_fetcher.py`.
  - #18774 : `original.audio_url` renvoie la requête à la passerelle telle quelle.
  - Complément sur #18729 : `_generate_temp_filename` utilise l'`attachment_id` ZMQ.
- **Non vérifié** : la suite complète du traducteur sous `uv sync`, faute de mémoire dans le conteneur, donc la CI fait foi ; la version de Python de l'image GPU.

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle n'est pas fusionnée, la reprendre. Surveiller en particulier la CI du traducteur, à cause du changement de `conftest`.
1. #18772, avec l'agent `auditeur-adversarial` : mesurer d'abord quels clients envoient une `webhookUrl`.
2. #18727, qui est petit, puis #18773.
3. #18668 et #18692, les messages d'exception bruts, puis #18729 et #18774.
4. #18697, puis #18691 (mesurer d'abord sur le staging), puis #18728.
5. #18629, avec l'agent `sre-infra`, puis #17133, #18611 et #18600.
6. Toujours : lire `call_caption_translation_seconds` et `translatorClient` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 38 — 2026-11-17

- **Base** : `origin/dev` @ `af3e0db4`. Le lot du cycle 37 (#18666, PR #18775) était déjà fusionné, et aucune PR de la routine n'était ouverte.
- **Branche** : `claude/determined-volta-lm94u0`.
- **Objectif** : #18772. Le traducteur n'envoie le webhook de fin de traduction vocale que vers un hôte autorisé.
- **Mesure de rétrocompatibilité** : aucun client (iOS, web, Android, MeeshySDK) n'envoie de `webhookUrl`. Seules les routes de la passerelle `routes/voice/translation.ts:334` et `routes/attachments/translation.ts:98` l'acceptent et la relaient.
- **Livré** (seul le traducteur change ; ni le protocole ZMQ, ni la passerelle, ni le comportement de l'`audioUrl`) :
  - **Garde** `utils/audio_url_guard.py` paramétré par une `UrlPolicy` :
    - `AUDIO_URL_POLICY` est inchangée (même classe, mêmes messages, mêmes raisons) ;
    - `WEBHOOK_URL_POLICY` lit `TRANSLATOR_WEBHOOK_ALLOWED_HOSTS`, **vide par défaut**, donc fail-closed ;
    - les refus webhook lèvent `WebhookUrlRejected`, distincte de `AudioUrlRejected`, et les deux listes sont séparées dans les deux sens.
  - **`services/job_webhook.py`** :
    - `submit_job` ne garde qu'une URL admise ; une URL refusée devient `None`, sans échec de la soumission ;
    - à l'envoi, l'URL est revérifiée, le connecteur passe par `VerifiedAudioHostResolver` sous la politique webhook, et l'envoi se fait avec `allow_redirects=False` et `trust_env=False` ;
    - seul un 2xx compte comme délivré.
  - **Journaux** : ils ne portent plus que `webhook=yes|none`, une raison fixe, un statut ou le type de l'exception.
  - **Charge envoyée au tiers** : elle ne recopie plus `webhook_url`.
  - **Traduction** : elle aboutit même si le webhook est refusé ou injoignable.
- **Tests** : `tests/test_job_webhook_guard.py` (33) et `_qa.py` (30, ajoutés par la QA). `test_26` a été adapté : ses deux témoins postaient vers `http://`.
  - **Rouge** : erreur de collecte, `ImportError: cannot import name 'job_webhook'`.
  - **Vert** : relancé par moi, `178 passed` (nouveau garde, garde audio, test_26).
  - **Suites voisines** (15 fichiers qui importent le pipeline ou la Voice API) : `1 failed, 547 passed` avant, `1 failed, 657 passed` après, avec le même échec préexistant `test_12::test_cache_behavior`.
  - **Mutations QA** : 17 sur 18 tuées. La survivante, `use_dns_cache=True`, n'est pas exploitable : le cache ne contient que des résultats déjà vérifiés.
- **QA** (`auditeur-adversarial`) : favorable avec réserves, sans aucun contournement trouvé. Elle a testé, entre autres, IDN, point final, `%`-encodage, `\@`, `[::ffff:…]`, les plages de transition IPv6 et les ports 80 et 0443.
  - #19253 : la passerelle accepte encore `webhookUrl` sans prévenir qu'il sera ignoré.
  - #19254 : la charge du webhook porte encore le résultat (textes traduits) et `user_id`.
  - #19255 : le webhook occupe le créneau du worker jusqu'à 30 s (dette antérieure).

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle n'est pas fusionnée, la reprendre.
1. #19254, qui est petit, puis #19253 (passerelle) et #19255.
2. #18727, puis #18773.
3. #18668 et #18692, les messages d'exception bruts, puis #18729 et #18774.
4. #18697, puis #18691 (mesurer d'abord sur le staging), puis #18728.
5. #18629, avec l'agent `sre-infra`, puis #17133, #18611 et #18600.
6. Toujours : lire `call_caption_translation_seconds` et `translatorClient` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 39 — 2026-11-17

- **Base** : `origin/dev` @ `e6f09991`. Le lot du cycle 38 (#18772) était déjà fusionné, et aucune PR de la routine n'était ouverte.
- **Branche** : `claude/determined-volta-e6lw66`.
- **Objectif** : #19254. Le webhook de traduction vocale ne porte que l'identifiant et l'état du job, jamais son contenu.
- **Mesure de rétrocompatibilité** : aucun récepteur de ce webhook n'existe dans le dépôt, et aucun client n'envoie de `webhookUrl` (mesure du cycle 38). La forme reste compatible : `event`, `job.id`, `job.status` et `metadata` sont gardés, `job_id` est ajouté à la racine.
- **Livré** (seul le traducteur change) :
  - fonction pure `webhook_payload(job)` (`translation_pipeline_service.py`), qui rend `{event, job: {id, status}, job_id, metadata}` ;
  - ne partent plus : `result` (textes traduits, transcription, audio), `user_id`, `error`, `error_code` et `target_languages` ;
  - `to_dict()` est inchangé, et la route d'état garde la vue complète.
- **Tests** : `tests/test_job_webhook_payload.py` (5 témoins).
  - **Rouge** sur la base : `2 failed, 3 passed`.
  - **Vert** : relancé par moi, `38 passed` avec le garde webhook.
  - **Suites voisines** (garde webhook, `_qa`, test_26, garde audio) : `172 passed` avant, `177 passed` après.
  - **Mutations QA** : remettre `result`, ou ajouter `user`/`err` à la racine, fait échouer 2 témoins.
- **QA** (`auditeur-adversarial`) : favorable avec réserves, toutes antérieures au lot.
  - #19292 : l'identifiant de job porte `user_id[:8]`, qui part au webhook.
  - #19293 : la route d'état du traducteur, `GET`/`DELETE /voice/job/{id}`, n'a aucune authentification (défense en profondeur ; réseau interne).
  - #19294 : `callbackMetadata` n'est jamais transmise, donc `metadata` arrive toujours vide.
  - #19295 : un job annulé est annoncé `translation_failed`.

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle n'est pas fusionnée, la reprendre.
1. #19292, qui est petit (vérifier d'abord que personne ne parse l'identifiant de job), puis #19293 avec l'agent `auditeur-adversarial`.
2. #19253 (passerelle), #19294 et #19255.
3. #18727, puis #18773.
4. #18668 et #18692, les messages d'exception bruts, puis #18729 et #18774.
5. #18697, puis #18691 (mesurer d'abord sur le staging), puis #18728.
6. #18629, avec l'agent `sre-infra`, puis #17133, #18611 et #18600.
7. Toujours : lire `call_caption_translation_seconds` et `translatorClient` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 40 — 2026-11-17

- **Base** : `origin/dev` @ `56e4bf53`. La PR du cycle 39 (#19296, #19254) était encore ouverte, avec trois jobs en file d'attente depuis 19 h 45 UTC. La QA l'avait jugée favorable. L'auto-merge n'est pas autorisé sur le dépôt, donc la fusion se fait à la main une fois la CI verte.
- **Branche** : `claude/determined-volta-ifsl8t`, partie de la tête de `claude/determined-volta-e6lw66` puis fusionnée avec `dev`. Elle est **empilée sur #19296**, parce que les deux lots touchent `translation_pipeline_service.py`.
- **Objectif** : #19292. L'identifiant de job de traduction vocale est opaque.
- **Mesure de rétrocompatibilité** : rien ne lit le format, ni dans la passerelle, ni dans `packages/shared`, ni dans les clients web, iOS et Android. Le `jobId` y est un `string` sans motif ni longueur maximale. Les deux formats font 37 caractères. Les jobs vivent en mémoire et se cherchent par clé exacte.
- **Livré** (seul le traducteur change) :
  - `_generate_job_id()` rend `mshy_` suivi de `uuid4().hex`, soit 122 bits aléatoires, sans horodatage ni `user_id[:8]` ;
  - l'argument `user_id` est retiré, et `submit_job` est mis à jour ;
  - le webhook, `to_dict()`, ZMQ et la passerelle sont inchangés.
- **Tests** : 3 témoins dans `tests/test_job_webhook_payload.py`, dont un vrai `submit_job` avec un `user_id` au format ObjectId. Les anciens témoins de `test_26` et `test_12`, qui affirmaient la fuite, vérifient maintenant le motif `mshy_[0-9a-f]{32}`.
  - **Rouge** : `3 failed, 5 passed`. Le premier échec montre `'6553a1b2'` dans `mshy_20261117203648_6553a1b2_a3467613`.
  - **Vert** : le fichier des témoins, relancé par moi, donne `8 passed`. Avec les gardes webhook, `test_26` et `test_12` : `1 failed, 164 passed, 4 skipped`, contre `1 failed, 156 passed` avant. L'échec est le même des deux côtés, `test_12::test_cache_behavior`, déjà connu.
  - **Mutations QA** : 3 sur 3 tuées (`user_id` remis dans l'id, ancienne forme horodatée, `user_id` dans la charge).
- **QA** (`auditeur-adversarial`) : favorable avec réserves, toutes antérieures au lot.
  - **R1, élevée** : IDOR sur l'état et l'annulation d'un job, **atteignable par la passerelle par tout utilisateur authentifié**. Le traducteur ignore le `userId` que la passerelle lui transmet. La preuve est commentée sur #19293. Ce lot en réduit l'exploitation, puisque l'id ne se devine plus, mais ne la ferme pas.
  - **R2** : #19380. `operation_handlers` déballe le `bool` de `cancel_job`, donc l'annulation par la passerelle échoue toujours.
  - **R3 et R5** : #19381. `_generate_output_filename`, du code mort, encode `user_id[:8]`, et deux identifiants de profil vocal dérivent de l'utilisateur.
  - **R4** : les assertions `"user" not in job_id` ne pouvaient pas échouer. Je les ai remplacées par le motif.

### Cycle suivant : par où reprendre

0. Fusionner #19296 si elle ne l'est pas, puis la PR de ce cycle (son diff se réduit alors à #19292).
1. **#19293 + #19380 ensemble**, avec l'agent `auditeur-adversarial` : propriétaire vérifié sur l'état et l'annulation, `user_id` retiré de la vue, et l'annulation qui fonctionne. C'est la priorité de sécurité.
2. #19381, puis #19253 (passerelle), #19294, #19295 et #19255.
3. #18727, puis #18773.
4. #18668 et #18692, les messages d'exception bruts, puis #18729 et #18774.
5. #18697, puis #18691 (mesurer d'abord sur le staging), puis #18728.
6. #18629, avec l'agent `sre-infra`, puis #17133, #18611 et #18600.
7. Toujours : lire `call_caption_translation_seconds` et `translatorClient` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 41 — 2026-11-17

- **Base** : `origin/dev` @ `53de788b`. La PR du cycle 39 (#19296) était fusionnée ; celle du cycle 40 (#19382, #19292) restait ouverte, CI en file d'attente (95 runs en file sur le dépôt).
- **Branche** : `claude/determined-volta-dstzf8`, **empilée sur #19382** (même fichier `operation_handlers` voisin de `translation_pipeline_service.py`).
- **Objectif** : #19293 (voie ZMQ) et #19380. L'état et l'annulation d'un job vocal ne servent que son propriétaire, et l'annulation par la passerelle fonctionne.
- **Mesure de rétrocompatibilité** : la passerelle pose déjà le `userId` du JWT dans `voice_job_status` / `voice_job_cancel` (`AudioTranslateService.ts:561-585`, seuls producteurs, appelés aussi par `AttachmentTranslateService`). Le schéma passerelle `translationJobSchema` ne laissait passer que `status`, `progress`, `result`, `error` : retirer `user_id` et `webhook_url` de la vue ne change rien pour les clients. L'annulation n'avait jamais fonctionné (déballage d'un `bool`).
- **Livré** (seul le traducteur change) :
  - `voice_api_handler` transmet `userId` ; `operation_handlers._owned_job` refuse userId absent/vide, job inconnu ou d'autrui par la MÊME réponse `NOT_FOUND` « Job not found » (aucun oracle) ;
  - la vue servie est `to_dict()` sans `user_id` ni `webhook_url` ;
  - l'annulation par le propriétaire rend `{success, message}` (forme attendue par la passerelle) ; un job non en attente rend `success: False` ;
  - messages d'erreur fixes, le journal ne porte que le type de l'exception.
- **Tests** : `tests/test_voice_job_owner.py`, 13 témoins (10 du spécialiste, 3 cas ajoutés par la QA), par `VoiceAPIHandler.handle_request` sur un vrai `TranslationPipelineService` et un vrai `submit_job`.
  - **Rouge** : `10 failed` (dont `cannot unpack non-iterable bool object`).
  - **Vert** : relancé par moi, `13 passed`.
  - **Suites voisines** (test_12, 13, 26, 28, webhooks) : même échec unique avant et après, `test_12::test_cache_behavior` ; QA : `1 failed, 148 passed`.
  - **Mutations QA** : 10 mutants, tous tués après ses deux témoins (M2 `None == None` et M9 message constant survivaient) ; M5 équivalent.
  - Environnement : venv Python 3.11 dans le scratchpad (pytest, pytest-asyncio, aiohttp, fastapi, prometheus_client), `-o addopts=""` faute de pytest-cov.
- **QA** (`auditeur-adversarial`) : favorable avec réserves, toutes antérieures au lot.
  - #19471 : les routes HTTP FastAPI `/voice/job/{id}` restent sans authentification (exposées en dev/local seulement). **#19293 reste donc ouverte** jusqu'à cette branche.
  - #19472 : la passerelle retire `{success, message}` à l'annulation, rend 500 au lieu de 404, et son schéma ne mappe pas le snake_case du traducteur.
  - #19473 : `job.error = str(e)` servi au propriétaire.
  - Limite du modèle : le PULL ZMQ n'est pas authentifié (connu, #18628).

### Cycle suivant : par où reprendre

0. Fusionner #19382 puis la PR de ce cycle quand la CI est verte (l'auto-merge n'est pas autorisé). Fermer à la main #19254 (fusionnée par #19296), #19292 et #19380 avec leur preuve : `Closes` ne ferme pas sur `dev`.
1. #19471 (fermera #19293), puis #19472 (passerelle) avec un test jest.
2. #19473, #18668 et #18692 (messages d'exception bruts), puis #19381, #19253, #19294, #19295, #19255.
3. #18727, #18773, #18729, #18774.
4. #18697, puis #18691 (mesurer d'abord sur le staging), puis #18728.
5. #18629, avec l'agent `sre-infra`, puis #17133, #18611 et #18600.
6. Toujours : lire `call_caption_translation_seconds` et `translatorClient` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 42 — 2026-11-18

- **Base** : `origin/dev` @ `5161f92c`. Les PR #19382 (#19292) et #19474 (#19293 voie ZMQ, #19380) ont été fusionnées pendant le démarrage du cycle. #19292, #19380 et #19254 sont fermées. Je n'ai pas pu activer l'auto-merge : il n'est pas autorisé sur le dépôt.
- **Branche** : `claude/determined-volta-evedav`.
- **Objectif** : #19471. Les routes HTTP `GET` et `DELETE /api/v1/voice/job/{id}` du traducteur ne servent et n'annulent un job que pour leur propriétaire.
- **Mesure de rétrocompatibilité** : aucun appelant HTTP de ces routes dans le dépôt.
  - Les clients iOS et Android appellent la route `/api/v1/voice/job/:jobId` de la **passerelle**, qui relaie par ZMQ (voie corrigée au cycle 41).
  - La passerelle n'appelle `translator:8000` que pour la diffusion, `serverLanguage` et `MessageValidator`.
  - En prod et en staging, le traducteur a `traefik.enable=false` et aucun `ports:` (constat sur le dépôt).
- **Livré** (seul le traducteur change) :
  - `_owned_job` dérive l'appelant avec le même `get_user_id` que `POST /voice/translate/async`. Si l'appelant n'est pas le propriétaire, le refus est le même `404 {"detail":"Job not found"}` que pour un job inconnu.
  - `DELETE` vérifie le propriétaire **avant** `cancel_job`.
  - Un job de la passerelle (`user_id` = ObjectId) n'est donc plus jamais lisible ni annulable en HTTP.
- **Tests** : `tests/test_voice_job_http_owner.py` (12 témoins). Dans `test_28`, 5 témoins lisaient un job sans appelant ; ils envoient maintenant le bearer du propriétaire.
  - **Rouge** : relancé par moi, `7 failed, 5 passed`.
  - **Vert** : `12 passed`.
  - **Suites voisines** (`test_28`, `test_voice_job_owner`, `test_13`) : `112 passed` avant et après, puis `124 passed` avec le nouveau fichier.
- **QA** (`auditeur-adversarial`) : favorable avec réserves pour ce durcissement, **mais le critère de fin de #19471 n'est pas rempli**. Elle reste donc ouverte.
  - **Mutations** : 9 sur 10 tuées. La survivante, l'inversion de l'ordre `get_job`/`get_user_id`, est équivalente.
  - **R1, élevée** : l'identité est déclarée, pas vérifiée. Quiconque connaît un `job_id` HTTP et le suffixe de 8 caractères du jeton de son auteur peut lire et annuler le job (#18728).
  - **R2** : un soumetteur HTTP anonyme, ou dont le jeton a été rafraîchi, ne peut plus suivre son job. Cela plaide pour **retirer** `/voice/translate/async` et `/voice/job/*` après mesure des journaux d'accès sur le serveur.
  - **R3, préexistante** : `error=job.error` sert le texte brut de l'exception au propriétaire (#18668, #18692).
  - **Témoin d'infrastructure manquant** : #19520.
- **Incident de méthode** : un commit d'étape, lancé pendant les mutations de la QA, a capturé un mutant (`3654628f`, « Job not yours », un oracle d'existence). Il est corrigé par le commit suivant, et l'arbre vérifié est identique à `e38fe665`. **Leçon** : ne jamais commiter pendant qu'une QA mute l'arbre.

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle n'est pas fusionnée, la reprendre (l'auto-merge n'est pas autorisé : fusionner à la main quand la CI est verte).
1. #19520, le témoin `ports:` du traducteur, qui est petit. Puis fermer #19471 par la branche « retrait », après avoir mesuré les journaux d'accès du traducteur sur le serveur avec `sre-infra`, ou par #18728.
2. #19472 (passerelle) avec un test jest.
3. #19473, #18668 et #18692 (messages d'exception bruts), puis #19381, #19253, #19294, #19295, #19255.
4. #18727, #18773, #18729, #18774.
5. #18697, puis #18691 (mesurer d'abord sur le staging), puis #18728.
6. #18629, avec l'agent `sre-infra`, puis #17133, #18611 et #18600.
7. Toujours : lire `call_caption_translation_seconds` et `translatorClient` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 43 — 2026-11-18

- **Base** : `origin/dev` @ `765e011b`. La PR du cycle 42 (#19521, #19471) était verte sauf un job en file ; je l'ai mise à jour avec `dev` (la CI repart). Elle n'est pas fusionnée au moment d'écrire.
- **Branche** : `claude/determined-volta-th0761`, **empilée sur #19521** (le journal `STATE.md` des deux cycles), puis fusionnée avec `dev` @ `0f5647e4`.
- **Objectif** : #19472. Suivre ou annuler un job vocal par la passerelle rend la vraie réponse et le bon statut HTTP.
- **Mesure de rétrocompatibilité** (aucun client modifié) :
  - Android `VoiceApi.job` décode `VoiceJob(jobId, status, progress, currentStep, error, result)` en camelCase avec défauts : c'est exactement la forme désormais servie (avant, `jobId` et `currentStep` n'arrivaient jamais). `cancelJob` décode un `JsonElement` libre. Le dépôt de jobs Android traite tout 4xx comme définitif : un 404 arrête désormais le sondage qu'un 500 relançait.
  - iOS : `VoiceEndpoint.jobByJobId` est déclaré, sans appelant. Web : aucun consommateur.
  - Avant ce lot, l'annulation servait `data: {}` et un 200 même sans annulation.
- **Livré** (passerelle seule) :
  - `routes/voice/servedJob.ts` : `toServedJob` (vue snake_case du traducteur → camelCase déclaré, liste fermée, jamais `userId`, nulls omis), `toCancelOutcome` (annonce `cancelled` seulement sur `success: true`), `isTranslatorNotFound`.
  - `DELETE` : 200 `{jobId, status: 'cancelled'}` ou 400 `JOB_NOT_CANCELLABLE` ; `NOT_FOUND` du traducteur ⇒ 404 (inconnu et d'autrui, même corps) ; le reste ⇒ 500. `errorResponse` passe par `sendError`.
  - `userId` retiré de `translationJobSchema`.
- **Tests** : `__tests__/unit/routes/voice/job-routes.test.ts`.
  - **Rouge** : `7 failed, 2 passed`. **Vert** : `9 passed` (relancé par moi), puis `12 passed` avec les 3 témoins de la QA.
  - Suites voice / AudioTranslate / AttachmentTranslate / cliquets de schéma : `35 suites, 692 passed` (QA). `tsc --noEmit` : 0.
  - Doubles `cancelJob` réalignés sur la forme réelle `{success, message}` dans deux suites qui simulaient `{jobId, status}`.
  - **Mutations QA** : 18 ; 12 tuées d'abord, 5 des 6 survivantes tuées par les témoins ajoutés ; M1 (`jobId` ignore `view.id`) quasi équivalente.
- **QA** (`auditeur-adversarial`) : favorable avec réserves, toutes antérieures au lot → #19595 (`result` perd ses null et ses `segments` au sérialiseur), #19596 (horodatages ISO naïfs), #19597 (type du service, annulation de pièce jointe, jumelle d'`errorResponse` dans `analysis.ts`, doubles fictifs). Le texte brut des exceptions reste couvert par #18668 / #18692 / #19473.

### Cycle suivant : par où reprendre

0. Fusionner #19521 puis la PR de ce cycle quand la CI est verte (auto-merge non autorisé : à la main), refusionner `dev` avant. Fermer #19472 à la main avec sa preuve si `Closes` ne la ferme pas.
1. #19520, le témoin `ports:` du traducteur. Puis fermer #19471 (retrait des routes HTTP après mesure des journaux avec `sre-infra`, ou #18728).
2. #19597 et #19595 (passerelle), #19596.
3. #19473, #18668 et #18692 (messages d'exception bruts), puis #19381, #19253, #19294, #19295, #19255.
4. #18727, #18773, #18729, #18774.
5. #18697, puis #18691 (mesurer d'abord sur le staging), puis #18728.
6. #18629, avec l'agent `sre-infra`, puis #17133, #18611 et #18600.
7. Toujours : lire `call_caption_translation_seconds` et `translatorClient` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 44 — 2026-11-18

- **Base** : `origin/dev` @ `14404376`. Les PR #19521 et #19598 des cycles 42 et 43 avaient été fusionnées le 2026-11-18 à 07:40. #19472 est fermée ; #19471 reste ouverte (retrait des routes HTTP ou #18728).
- **Branche** : `claude/determined-volta-i6uufl`.
- **Objectif** : deux issues, #19520 et #19595, toutes deux dans la passerelle, sur des fichiers disjoints.
  - **#19520** : une garde échoue si le traducteur publie un port en staging ou en prod, s'il est routé par Traefik, ou s'il déclare un `network_mode`.
  - **#19595** : le résultat d'un job vocal garde ses `null` et ses `segments`.
- **Livré** :
  - **Garde `__tests__/unit/config/translator-never-published.test.ts`.** Elle couvre toute composition déployante de `infrastructure/docker/compose/`, c'est-à-dire tout ce qui n'est ni `dev`, ni `local`, ni `local-https`. Elle reconnaît le service traducteur à son nom ou à son image. Elle refuse :
    - un `ports:` non vide ;
    - `traefik.enable=true` ou un routeur Traefik ;
    - **tout** `network_mode` (`host`, `service:`, `container:`, variable, commentaire en fin de ligne) ;
    - `<<:` et `extends:` ;
    - un service traducteur attendu introuvable, et une composition sans bloc de service reconnu (pas de vert vide).
  - **Schéma `routes/voice/types.ts`.**
    - Il déclare les segments en liste fermée, en suivant `TranscriptionSegment`.
    - `audioUrl`, `audioBase64`, `voiceProfile`, `profileId` et `confidence` sont nullables.
    - `voiceTranslationItemSchema` est extrait. `translatedAudios` de `POST /voice/translate` reçoit `items: voiceTranslatedAudioSchema`, ce qui ferme une fuite antérieure : `audioPath` (chemin disque serveur) et les clés internes `audio_path` et `fallback` partaient à côté de `result`.
- **Tests** :
  - **Garde** : `33 passed`. Elle avait d'abord `22 passed` ; les réserves de la QA y ont ajouté des témoins, rouges à `11 failed, 22 passed`. Les mutations des vrais compose de prod et de staging sont toutes tuées (ports, Traefik, renommage, `network_mode: host # …`, `services: # …`, `Services:`).
  - **#19595** : rouge `5 failed, 12 passed`, que j'ai relancé moi-même en remettant l'ancien `types.ts` ; vert `17 passed`. Les réserves de la QA ont ajouté les témoins de `translatedAudios`, de `confidence` et de nullabilité.
  - **Gates finaux, relancés par moi** :
    - `translator-never-published`, `routes/voice` et `security/response-schema` : `15 suites, 307 passed` ;
    - `tsc --noEmit` : 0 erreur.
- **Rétrocompatibilité** : aucun client ne lit ces champs.
  - Android garde `result` en `JsonElement?` (avec `explicitNulls = false` et `coerceInputValues`), et `VoiceApi.translate` rend du `JsonElement` sans appelant.
  - iOS déclare les routes sans les décoder.
  - Le web n'a aucun consommateur.
  - Un `""` ou un `{}` devient `null`.
- **QA** (`auditeur-adversarial`) : favorable avec réserves. Le premier passage a trouvé 6 mutants survivants dans le schéma, et le mutant `network_mode: host # …` survivait sur le vrai compose de prod. Il a aussi relevé le vert vide de `services: # …` et la fuite de `translatedAudios`. Tout a été corrigé dans ce cycle, sauf :
  - #19647 : la même fuite d'`audioPath` sur `POST /voice/transcribe` et sur la traduction de pièce jointe ;
  - #19648 : le traducteur rend `audio_url=""` sur le chemin texte seul, et le type partagé n'a pas de `| null`.
  - **Non vérifié** : le compose réellement déployé sur le serveur, injoignable depuis le conteneur. C'est le second critère de #19520, qui reste donc ouverte.

### Cycle suivant : par où reprendre

0. Si la PR de ce cycle n'est pas fusionnée, la reprendre : fusion à la main quand la CI est verte.
1. #19647, petite et de sécurité, puis #19648.
2. #19520, second critère : constat sur le serveur avec `sre-infra` (`docker port meeshy-translator`, `docker inspect … NetworkMode`), dans la même séance que la mesure des journaux d'accès pour #19471.
3. #19597, #19596, puis #19473, #18668 et #18692 (messages d'exception bruts), #19381, #19253, #19294, #19295, #19255.
4. #18727, #18773, #18729, #18774 ; #18697, #18691, #18728 ; #18629, #17133, #18611, #18600.
5. Toujours : lire `call_caption_translation_seconds` et `translatorClient` sur le staging, et faire la recette fr↔en de #16613.

## Cycle 47 — 2026-11-18

- **Base** : `origin/dev` @ `2fcb40b94`, puis fusionnée avec `dev` @ `ba1f209bf`. La PR du cycle 46 (#19704, qui contient aussi le cycle 45) attendait sa CI, en file depuis 17:22 ; je n'y ai pas poussé, pour ne pas l'annuler.
- **Branche** : `claude/determined-volta-mn4257`, partie de `dev`. Ses fichiers sont disjoints de ceux de #19704, sauf le journal.
- **Objectif** : #19648 (une traduction vocale sans audio rend `audioUrl` null de bout en bout) et #19596 (horodatages d'un job vocal en ISO 8601 UTC avec `Z`).
- **Livré** :
  - **Traducteur.**
    - `TranslatedAudioVersion.text_only_version` pose `audio_url=None` (`audio_path` reste `""` en interne).
    - `VoiceMessageResponse.audio_url` devient `Optional`. Sans ce changement, `/voice-message` tombait en 500.
    - `utils/served_time.py` : `served_utc()` est le site unique de formatage (forme `toISOString`, millisecondes, `Z`). Il sert `TranslationJob.to_dict()` et `/voice/job`.
    - Les jobs sont créés en `datetime.now(timezone.utc)`. Le nettoyage normalise avant de comparer.
  - **Passerelle.**
    - `AudioTranslateService._saveTranslationResult` et la branche post/story de `MessageTranslationService` **omettent** `url` et `path` sans adresse, comme le chemin message depuis #16340. Avant, ils persistaient `url: ""`.
    - La garde est en vérité : un ancien traducteur qui envoie `""` est traité comme `null`.
  - **Partagé** : `voice-api.ts` déclare `| null` sur `audioUrl`, `audioBase64`, `voiceProfile` et `profileId`.
- **Tests** :
  - **Pytest** :
    - `test_text_only…` : rouge `3 failed, 4 passed`, puis vert `7 passed` ;
    - `test_voice_message_response…` : rouge `1 failed`, puis vert `2 passed` ;
    - `test_job_timestamps…` : rouge `5 failed, 1 passed`, puis vert, et `7 passed` avec le témoin de la QA.
  - **Jest** : `AudioTranslateService` et `MessageTranslationService.audio` sont rouges (`Received value: null`), puis verts.
  - **Relancé par moi sur l'arbre fusionné avec `dev`** :
    - passerelle : `3 suites, 91 passed`, `tsc --noEmit` à 0 ;
    - traducteur : `83 passed` (lot et `test_28`, sous Python 3.13, alors que le projet déclare 3.10).
  - Les échecs du traducteur sont identiques à ceux de `dev` (`18 failed, 37 errors` sur `test_23`, `test_job_webhook_guard`, `test_12`, `test_audio_pipeline_metrics`, `test_audio_url_guard`). Ils viennent de l'environnement local (QA, `git archive`).
- **Rétrocompatibilité** (QA, en lisant chaque lecteur) :
  - Ancienne passerelle face au nouveau traducteur : aucun lecteur n'appelle de méthode sur `audioUrl`. Les lecteurs de `translations[].url` tolèrent `null`, `""` ou l'absence.
  - Aucune boucle de retraduction : la décision « déjà traduit » porte sur la clé de langue.
  - iOS `url: String?`, Android `String? = null`, le web filtre `trim() !== ''`.
  - Les jobs ne vivent qu'en mémoire : aucun `fromisoformat` ne relit `Z` (3.10).
- **QA** (`auditeur-adversarial`) : favorable avec réserves.
  - Mutations : 5 tuées d'emblée. M4 et G3/G4 survivaient, et sont tuées par ses témoins (`01e798d67`). M5 est équivalente. Retirer le `| null` du type partagé n'est détecté par aucun test (simple typage, `strictNullChecks: false`).
  - Réserves ouvertes en issues : #19734 (piste orpheline quand un texte seul suit une voix, antérieure au lot), #19735 (cache `audio_url` à `""`, témoin de la route `/voice-message`, type `PostAudioService`), #19736 (horodatages de santé et d'analyse).

### Cycle suivant : par où reprendre

0. Fusionner #19704 (cycles 45 et 46) puis la PR de ce cycle quand leur CI est verte (fusion à la main ; la CI des PR était en file depuis des heures). Le journal entre en conflit entre les deux : garder les deux sections, dans l'ordre 46 puis 47. Fermer à la main #19647, #19672, #19648 et #19596 avec leur preuve si `Closes` ne les ferme pas.
1. #19734 (effacement, sécurité), puis #19702, #19673 et #19735.
2. #19520, second critère : constat sur le serveur avec `sre-infra`, dans la même séance que la mesure des journaux d'accès pour #19471.
3. #19597, #19736, puis #19473, #18668 et #18692 (messages d'exception bruts), #19381, #19253, #19294, #19295, #19255.
4. #18727, #18773, #18729, #18774 ; #18697, #18691, #18728 ; #18629, #17133, #18611, #18600.
5. **Recentrer la routine sur les appels eux-mêmes.** Les cycles 42 à 47 ont soldé la dette de la surface vocale de la passerelle. Le prochain lot sans P0 devrait viser la chaîne de traduction en direct (latence mesurée de `call_caption_translation_seconds` sur le staging, recette fr↔en de #16613).
