## Le temps-à-première-image et le rebuffer se lisent en p50/p95 par surface, tier d'appareil et jour, sous k-anonymat (2026-10-23, #11280)

### Contexte

Les sessions de lecture (`playback:session`, #10499) portaient déjà leur `surface`, leur `startupMs` et leur rebuffer (`rebufferCount`, `rebufferMs`) dans `ContentEvent`. Rien ne disait sur QUEL appareil la mesure était prise, et aucune lecture agrégée n'existait : un rebuffer propre aux appareils modestes se noyait dans la moyenne.

### Décision

1. **`deviceTier` (`low | mid | high`, `DEVICE_TIERS` dans `packages/shared/types/social-events-v2.ts`) est un champ OPTIONNEL de la session `playback`**, lu par `enumOrDrop`. Un ancien client ne l'envoie pas et sa session reste rangée sous `unknown`. Un tier inconnu d'un client plus neuf est ôté sans perdre la session. Il voyage avec la mesure, dans `props`, et suit le consentement existant : rien n'est rangé pour un compte qui refuse l'analyse (`denied`), comme pour toute ligne v2. Trois valeurs ne désignent personne, au même titre que la plateforme qu'une ligne non consentie garde déjà.
2. **La lecture est un agrégat pur**, `services/social/playbackQoeAggregate.ts`. Une seule requête bornée lit l'index `ContentEvent_type_action_day`, ne projette que la mesure et s'arrête à 50 000 lignes, avec `sampled` quand elle atteint ce plafond. Les quantiles sont calculés au rang le plus proche. Chaque mesure absente donne `null`, jamais zéro. `exitBeforeStart` retire la session du temps-à-première-image.
3. **k-anonymat : aucune cellule surface × tier × jour n'est servie sous 20 comptes distincts** (`PLAYBACK_QOE_MIN_DEVICES`). On compte les COMPTES, parce que c'est la seule identité distincte qu'une ligne puisse prouver : `appSessionId` change à chaque lancement et une ligne sans acteur n'en porte aucune. Un compte est une borne BASSE du nombre d'appareils. Une ligne sans compte nourrit donc les quantiles mais jamais le seuil (fail-closed). Seul le NOMBRE de cellules retenues est servi.
4. **Route admin** : `GET /api/v1/admin/analytics/playback?days=` (1 à 30 jours, la conservation du brut, 7 par défaut), sous `canAccessAdmin` comme les autres lectures d'analytique, avec un cache de 10 minutes. Le contrat de réponse est `PlaybackQoeSummary` (`packages/shared/types/playback-qoe.ts`). La garde O8 (`social-events-v2-privacy-guard.test.ts`) admet ce lecteur parce qu'il ne lit que `type = playback` et ne sert aucun acteur.

### Conséquences

- Les clients doivent ÉMETTRE `deviceTier` : iOS par IL12, web par W11.
- Une population où peu de comptes ont consenti à l'analyse voit ses cellules retenues. Le seuil se relit quand la mesure de la part non attribuée existera.
- À volume élevé, le plafond de 50 000 lignes privilégie les jours récents (`sampled`). Passer à un `$group` serveur avec `$percentile` (MongoDB 7+) sera un lot séparé, déclenché par une mesure.
