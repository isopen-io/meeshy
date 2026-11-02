## La qualité d'un appel se persiste, se lit, s'exporte et s'efface (2026-10-23, #11277)

### Contexte

`call:analytics` persistait déjà, sur `CallParticipant.analytics`, la télémétrie de fiabilité de chaque participant, et `GET /admin/analytics/calls` la relisait. Ni les gels, ni la limitation de qualité, ni le MOS, ni le chemin réseau (relais ou non) n'y figuraient. Le modèle d'appareil, la plateforme et le commentaire libre de la note n'étaient ni exportés (RGPD art. 20) ni effacés à la purge du compte (art. 17).

### Décision

1. **Le contrat s'étend par des champs OPTIONNELS** (`socketCallAnalyticsSchema` et `CallAnalyticsEvent`, extrait vers `packages/shared/types/call-analytics.ts`) : `freezeCount`, `totalFreezesDuration` (s), `qualityLimitationReason`, `jitterBufferDelay` (ms moyen), `concealedSamples`, `nackCount`, `pliCount`, `mos` (1 à 5), `candidateType`, `relayProtocol`. Un ancien client reste valide. Un nouveau client face à un ancien serveur voit ces champs retirés par Zod, jamais son rapport refusé. Les libellés restent des chaînes bornées et non des énumérations : une valeur nouvelle chez un client ne doit pas faire refuser tout le rapport. L'agrégat les range lui-même (`other`).
2. **La persistance ne change pas de place** : ce qui est validé (`validation.data`) s'écrit déjà sur la colonne JSON `CallParticipant.analytics`. Il n'y a aucune migration, et `CallEventsHandler` ne reçoit rien.
3. **La lecture est un second agrégat pur**, `services/callQualityAggregate.ts` (`CallQualitySummary`), calculé sur la même lecture que la fiabilité et servi sous `quality`. Il ne porte que sur les appels connectés. Chaque moyenne vaut `null`, jamais zéro, quand aucune ligne ne porte sa mesure. Aucune donnée personnelle n'y survit : ni appareil, ni appel, ni compte. La clé de cache passe en `v2`, pour qu'une réponse mise en cache avant ce lot ne masque pas `quality`.
4. **RGPD** : `services/calls/callTelemetryPrivacy.ts` est le seul accès. L'export ajoute une section `calls` (télémétrie et note de chaque appel du compte, paginée, dans le défaut « tous les types »). La purge du compte met `analytics` et `feedback` à `null` sur toutes ses lignes `CallParticipant`. Elle GARDE ces lignes : l'historique d'appel de l'autre participant les lit encore.

### Conséquences

- Les clients doivent ÉMETTRE ces champs pour que l'agrégat se remplisse : iOS par #11294, web et Android par leur propre issue.
