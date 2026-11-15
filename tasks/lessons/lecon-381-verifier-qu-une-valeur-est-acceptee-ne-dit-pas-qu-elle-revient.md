## Leçon 381 — Vérifier qu'une valeur est ACCEPTÉE ne dit pas qu'elle REVIENT

**Cycle #4624 (2026-09-01).** Android n'envoyait aucun message : le corps portait
`cmid_…` là où les trois portes du gateway exigent `^cid_`. Le correctif est
d'une ligne (`OutboxIds.cid()`, la fonction écrite pour ce rôle et jamais
branchée), et sa vérification aurait pu s'arrêter au 200.

Elle serait passée à côté du couplage sur lequel l'arbitrage REPOSE :
`MessageCacheSource.persist` purge la bulle optimiste en lisant le
`clientMessageId` **que le serveur RENVOIE**, et s'en sert comme identifiant
LOCAL. Si le gateway ne l'échoïsait pas, le correctif aurait déplacé le défaut —
un doublon à chaque envoi au lieu d'un 400.

Mesuré sur staging, sur les DEUX chemins que le client emprunte : la réponse
immédiate du POST (qui alimente `reconcileSent`) **et** la relecture de
resynchronisation (qui alimente `ackedLocalIds` → `deleteByIds`) portent la
valeur verbatim.

> **Un correctif de format se mesure aux deux bouts du fil : ce qui part, et ce
> qui rentre sous le même nom.**

Deux corollaires de méthode :
* **Mesurer le corps RÉEL, pas le corps plausible.** `MeeshyApi.json` est
  `explicitNulls = false` et laisse `encodeDefaults` à `false` : le corps qu'Android
  émet pour un envoi texte n'a que TROIS champs — `messageType` vaut son défaut
  et n'est même pas sérialisé. Envoyer la forme complète du `data class` aurait
  testé une charge que le client ne produit jamais.
* **La contre-épreuve compte autant que le vert.** Rejouer l'ancien préfixe
  prouve que la porte est toujours là et que c'est bien lui, seul, qui la
  franchissait ou non.
