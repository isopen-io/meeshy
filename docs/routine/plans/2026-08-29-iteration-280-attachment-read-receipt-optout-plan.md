# Itération 280 — Plan : opt-out des accusés de lecture sur la consommation média

Ferme l'issue **#3907**.

## Objectifs
Appliquer la réciprocité `showReadReceipts = false` à la consommation média
(audio/vidéo/image), sur les DEUX surfaces qui la servent, en réutilisant le SSOT
de préférence partagé — aucune règle réécrite.

## Modules affectés
- `services/gateway/src/services/MessageReadStatusService.ts` — `getAttachmentStatusDetails`.
- `services/gateway/src/routes/messages.ts` — broadcast `attachment:status-updated`.
- Tests : `__tests__/unit/services/MessageReadStatusService.test.ts`,
  `__tests__/unit/routes/messages-extended.test.ts`.

## Phases
1. **RED (REST)** — témoin : un opt-out consommateur exclu de `getAttachmentStatusDetails`,
   exclusion sur la requête (count + page). ✅
2. **GREEN (REST)** — résolution consommateurs distincts → `_loadReadReceiptOptOuts`
   → `notIn` sur `whereClause` avant count/page ; réutilisation des lignes
   participant pour l'affichage. ✅
3. **RED (temps réel)** — témoin : opt-out ⇒ pas d'émission `attachment:status-updated`. ✅
4. **GREEN (temps réel)** — gate `shouldShowReadReceipts(userId, isAnonymous)` avant l'emit. ✅
5. **Validation** — suites service (239/239) + route (29/29) + voisines (64) +
   privacy/broadcast (55) ; `tsc --noEmit` gateway EXIT=0. ✅

## Dépendances
Aucune migration ; `AttachmentStatusEntry.participantId` et les préférences de
confidentialité existent déjà. Pas de changement de contrat client (les clients
reçoivent simplement MOINS de lignes / pas d'événement pour un opt-out).

## Risques & rollback
Risque faible (alignement sur jumeaux testés, fail-open sur erreur de préférence).
Rollback = revert du commit ; aucune donnée écrite, aucun schéma modifié.

## Statut
**Livré.** Les deux surfaces serveur-autoritaires sont fermées. `Closes #3907`.

## Améliorations futures / suivis
- Le versant CLIENT « je vois ma propre ligne » (l'acteur voit sa propre
  consommation) reste, comme pour le texte, la règle d'équité côté client — non
  concernée par ce lot serveur.
- Vérifier, si un jour une autre TABLE porte des accusés (réactions horodatées,
  ouvertures de lien), qu'elle passe par le même helper — la question « cette
  règle gouverne-t-elle un autre type de contenu ? » (leçon 261).
