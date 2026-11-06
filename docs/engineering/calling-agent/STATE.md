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
   - chaque segment final fait trois lectures Mongo en série avant la demande de
     traduction (locuteur actif, admission e2ee, participants actifs). Un cache par appel
     de la carte langue → auditeurs réduirait le temps avant traduction ;
   - un auditeur dans une autre langue n'a rien à l'écran tant que la traduction n'est pas
     revenue. Lui servir l'original tout de suite, puis le remplacer, est une décision
     produit (Prisme) : à poser en issue `décision-produit`, pas à trancher ici.
- Une routine iOS parallèle travaille sur `apps/ios/.../Features/Call/Views/`
  (`apps/ios/tasks/routine-appels.md`). Ne pas toucher à ces vues sans s'y coordonner.
