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
- **QA** : favorable avec réserves. R1 et R5 → #17002, R2 → #17003, R3 → #17004, R4 → #17005.

### Limites connues

- Une tâche reçue par PULL entre `stop_workers` et la fermeture du socket se perd encore. → #17002.
- Le journal d'un refus en masse n'est pas borné. → #17003.
- Plus de 8 signalements ouvrent le disjoncteur de la passerelle pour 30 s. → #17004.
- La livraison PUB à l'arrêt n'est pas mesurée. → #17005.
- Les tâches **en cours**, annulées par le délai d'arrêt de 30 s de `zmq_server_core`, ne sont pas signalées. Le minuteur de renvoi de la passerelle les couvre.

### Cycle suivant : par où reprendre

1. #17002 : refuser l'enfilement une fois l'arrêt lancé (petit lot, même site), avec #17003 si le temps le permet.
2. #16822 : `{e}` brut et exception levée après le `pop` de l'accumulateur.
3. #17004 côté passerelle : un refus transitoire n'alimente plus le disjoncteur.
4. Toujours : lire `call_caption_translation_seconds` sur le staging, et faire la recette fr↔en de #16613.
