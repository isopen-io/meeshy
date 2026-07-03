# Iteration 84 — Analyse d'optimisation (2026-07-02)

## Protocole (démarrage)
`main` @ `fd7a01c` (working tree propre). Branche de travail `claude/brave-archimedes-i63znd`
recréée depuis `origin/main` (main avait été force-updated depuis la dernière itération — aucun
commit non-mergé à préserver).

PR ouvertes au démarrage : #1372 (realtime `USER_UPDATED`, gateway/web/shared), #1370 (iOS a11y
FeedView), #1367 (realtime guard `message:edited`, web + iOS SDK) — trois pistes indépendantes
gérées par d'autres sessions, **aucune ne touche les services de concurrence gateway** ciblés ici.

Continuité du **thème dominant des 5 dernières itérations (79→83) : durcissement des races
« lost-update / out-of-order » sur les compteurs & curseurs partagés du gateway** (lessons
#50/#51/#55). Les résidus explicitement documentés étaient F47/F49/F50. **F47 était le seul
résidu classé « intégrité de compteur / respect de cap » encore ouvert** — les autres (F49/F50)
sont auto-guéris (TTL / `recompute()` périodique). Cible retenue (Priorité 1 — feature récemment
durcie) : **F47 — le TOCTOU résiduel du cap `maxUses` du token d'affiliation.**

## Cible iter 84 — F47 : cap `maxUses` du token d'affiliation (TOCTOU)

### Current state
`services/gateway/src/services/AffiliateTrackingService.convertAffiliateVisit` (l.78-190) :
1. `findUnique` du token, puis pré-check `if (maxUses && currentUses >= maxUses) return error`
   (l.95) — **lecture d'un snapshot**.
2. Check d'idempotence (`existingRelation`).
3. `affiliateRelation.create` (crée la relation).
4. `affiliateToken.update({ currentUses: { increment: 1 } })` — increment atomique (corrigé
   iter 82, lesson #51), mais **inconditionnel**.

L'iter 82 avait corrigé le **lost-update** du compteur (increment JS → `{ increment: 1 }`) mais
avait **explicitement reporté le TOCTOU du cap lui-même** (résidu F47).

### Problem identified
Le pré-check (l.95) et l'increment (l.131) sont **découplés**. Quand `currentUses === maxUses - 1`,
deux conversions concurrentes lisent toutes deux `currentUses = maxUses - 1`, franchissent toutes
deux le pré-check, créent chacune une relation, puis incrémentent — `currentUses` finit à
`maxUses + 1`, **dépassant le cap**. Un token « 100 filleuls max » peut accepter 101+ conversions
sous course, sur-créditant l'affilié (fraude/abus possible sur les campagnes cappées).

### Root cause
Cap enforcement en **check-then-act** non atomique là où MongoDB/Prisma offre une écriture
conditionnelle sérialisée. L'increment atomique de l'iter 82 protégeait le *comptage* mais pas la
*borne* : incrémenter atomiquement au-delà du cap reste un dépassement.

### Business impact
Intégrité du cap d'une campagne d'affiliation (respect de `maxUses`). Faible volume mais réel —
une campagne à budget limité (récompense par filleul) peut être sur-consommée sous concurrence.

### Technical impact
- **Réservation atomique AVANT création de la relation.** Pour un token cappé
  (`maxUses != null`) : `updateMany({ where: { id, currentUses: { lt: maxUses } }, data:
  { currentUses: { increment: 1 } } })`. La clause `currentUses < maxUses` est évaluée et
  incrémentée de façon sérialisée côté DB → **au plus `maxUses` réservations réussissent**.
  `count === 0` ⇒ le cap a été atteint dans la fenêtre de course → rejet immédiat
  (`'Limite d'utilisation atteinte'`) **avant** toute création de relation (donc **pas de
  rollback** nécessaire).
- Token illimité (`maxUses == null`) : `update({ currentUses: { increment: 1 } })` inconditionnel
  (inchangé — pas de cap à garder).
- Réordonnancement : réserver la place **puis** créer la relation (au lieu de créer puis
  incrémenter). Élégant : la place est garantie disponible avant la matérialisation de la relation.
- Le pré-check (l.95) est **conservé comme fast-path** (rejet bon marché du cas commun déjà plein,
  évite d'atteindre la réservation) — mais la réservation conditionnelle est désormais l'autorité.
- Aucune signature publique modifiée.

### Subtilité assumée — fuite de slot sur erreur de `create` (négligeable)
Si `affiliateRelation.create` échoue **après** la réservation (panne DB), un slot est consommé
sans relation (`currentUses` légèrement sur-évalué → cap atteint 1 tôt). Arbitrage assumé :
un slot fantôme sur un chemin d'erreur DB rare est **strictement moins nuisible** qu'un
dépassement de cap, et évite un rollback (delete) sur le chemin race-loser chaud. Reserve-then-
commit est le pattern canonique.

### Risk assessment
FAIBLE. Écriture conditionnelle atomique standard, strictement plus correcte sous concurrence,
comportement observable identique hors course (le fast-path continue de rejeter les tokens déjà
pleins ; un token avec slot disponible réserve puis crée exactement comme avant). Couvert par
3 tests neufs + les tests existants (le chemin illimité `maxUses: null` reste sur `update`).

### Proposed improvements
1. Réservation conditionnelle `updateMany` pour les tokens cappés, `update` inconditionnel pour
   les illimités, réservation avant création de relation.
2. Tests : (a) réservation cappée atomique avant relation, (b) rejet race-loser (`count === 0`)
   sans relation ni friend-request, (c) chemin illimité utilise `update` et jamais `updateMany`.

### Expected benefits
- Cap `maxUses` respecté sous concurrence (plus de dépassement possible).
- Clôt le dernier résidu « intégrité de compteur/cap » de la famille lost-update (79→83).

### Implementation complexity
FAIBLE — 1 branche conditionnelle dans 1 méthode + mock `updateMany` + 3 tests.

### Validation criteria
- `AffiliateTrackingService.test.ts` : tous verts (dont 3 régressions neuves).
- `routes/affiliate.test.ts` + `devices-affiliate.test.ts` : verts.
- `tsc --noEmit` : 0 erreur nouvelle dans les fichiers modifiés.

## Améliorations futures (report)
- **F49** : `ConversationStatsService.updateOnNewMessage` — lost-update in-process sur le cache
  `messagesPerLanguage` (auto-guéri par TTL, sévérité basse).
- **F50** : `participantStats`/`dailyActivity`/`hourlyDistribution`/`languageDistribution` restent
  en read-modify-write non atomique dans les 3 hooks (documenté, `recompute()`-corrigé). Modèle
  relationnel requis pour l'atomicité — hors périmètre d'un cycle.
