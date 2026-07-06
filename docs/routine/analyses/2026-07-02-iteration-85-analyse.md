# Itération 85 — Analyse d'optimisation (2026-07-02)

## Démarrage
`main` @ `3e0ccf4`. Continuité directe du thème concurrence lost-update / TOCTOU
(leçons #50→#55, itérations 82→84). Application de la règle de la leçon #55 : grep
`\.\w+\s*[+-]\s*[0-9]` (calcul JS d'un compteur à partir d'une valeur lue) sur `src/services`.

### Candidats écartés
| Site | Verdict |
|------|---------|
| `PhonePasswordResetService` (`identityAttempts + 1`, `codeAttempts + 1`) | **Sain** — le write DB est déjà `{ increment: 1 }` atomique ; le `+1` n'est qu'un affichage (log / `attemptsRemaining`). |
| `PushNotificationService.handleFailedToken` (`failedAttempts + 1`) | Read-then-write réel MAIS déjà protégé par un mutex in-process (`deactivatingTokenIds`) qui **droppe** les échecs concurrents du même token ; dérive résiduelle seulement cross-instance, sur une heuristique de désactivation auto-réparante (le prochain échec ré-incrémente). Faible valeur, forte churn de tests (dizaines d'assertions). Écarté. |
| `ConversationStatsService` (F49) | Cache **purement en mémoire** (mono-process), aucun write de compteur DB — pas un lost-update. F49 clos comme faux-positif. |

## Cible retenue — F47 : cap TOCTOU sur `AffiliateTrackingService.convertAffiliateVisit`

### État actuel
`convertAffiliateVisit` (`services/gateway/src/services/AffiliateTrackingService.ts`) :
1. `findUnique(token)` → lit `currentUses` / `maxUses`.
2. Garde ligne 95 : `if (maxUses && currentUses >= maxUses) return 'Limite atteinte'` — **check sur valeur lue**.
3. `findFirst(existingRelation)` (idempotence par utilisateur).
4. `create(affiliateRelation)`.
5. `affiliateToken.update({ currentUses: { increment: 1 } })` — increment atomique (corrigé leçon #51)
   MAIS **inconditionnel** : n'applique aucun cap.

### Problème identifié (F47)
Le cap `maxUses` est vérifié en lecture (étape 2) puis appliqué par un increment inconditionnel
(étape 5). Entre la lecture et l'increment, **N conversions concurrentes** (N inscriptions
simultanées portant le même token d'affiliation/promo) franchissent toutes le garde `>= maxUses`
puis incrémentent toutes → `currentUses` **dépasse** `maxUses`. Le garde `existingRelation` ne
protège que contre la double-conversion du **même** utilisateur, pas contre des utilisateurs
distincts convergents.

### Cause racine
TOCTOU classique : la décision d'autorisation (cap) et la mutation (increment) ne sont pas la
même opération atomique. L'increment atomique de la leçon #51 a corrigé la perte d'increment
(compteur trop bas) mais **pas** le dépassement de cap (compteur trop haut) — deux faces d'une
même absence d'atomicité check+write.

### Impact
- **Business** : sur-attribution de récompenses de parrainage / dépassement d'un cap promotionnel
  (`maxUses`), auto-ajout d'amis (`friendRequest accepted`) au-delà de la limite prévue. Vecteur
  d'abus si un lien promo à quota est partagé et redeemé en rafale.
- **Technique** : dérive silencieuse de `currentUses > maxUses`, aucune réconciliation.
- **Risque du fix** : FAIBLE. Idiome canonique (conditional update), périmètre isolé (1 fonction),
  garde fast-path préservé, comportement idempotent inchangé.

### Amélioration proposée (implémentée)
Remplacer l'increment inconditionnel par une **réservation atomique de slot** conditionnée par le
cap, effectuée **avant** la création de la relation :
```ts
const reservation = await prisma.affiliateToken.updateMany({
  where: {
    id: affiliateToken.id,
    ...(affiliateToken.maxUses ? { currentUses: { lt: affiliateToken.maxUses } } : {})
  },
  data: { currentUses: { increment: 1 } }
});
if (reservation.count === 0) return { success: false, error: "Limite d'utilisation atteinte" };
// création de la relation seulement après réservation du slot
```
MongoDB sérialise les `updateMany` sur un même document : seuls `maxUses - currentUses` matchent le
filtre `currentUses < maxUses`, les suivants renvoient `count === 0`. Le garde `>= maxUses` en amont
reste comme fast-path (évite `findFirst` + `updateMany` quand le token est manifestement épuisé, et
renvoie l'erreur précise).

**Arbitrages** :
- Réservation **avant** création de relation → si `create` échoue (erreur DB exceptionnelle), un slot
  est consommé sans relation : direction **sûre** (sous-attribue, ne dépasse jamais le cap).
- `maxUses` falsy (null / 0) → pas de condition de cap → increment inconditionnel : sémantique
  **identique** au garde `maxUses &&` existant (cohérence, aucune régression sur `maxUses = 0`).
- `existingRelation` reste **avant** la réservation → un retry du même utilisateur ne consomme
  jamais un second slot (idempotence préservée).

### Bénéfices attendus
- Cap `maxUses` **strictement** respecté sous concurrence, sans transaction lourde ni verrou applicatif.
- Increment reste atomique (leçon #51 préservée). Deux faces (perte + dépassement) désormais couvertes.

### Critères de validation
- `AffiliateTrackingService.test.ts` : 34/34 verts (dont 2 nouveaux cas : réservation cap-guardée
  `where currentUses < maxUses` ; perte de la course → `count 0` → **aucune** relation créée).
- `routes/affiliate.test.ts` : 21/21 verts.
- `tsc --noEmit` : 0 erreur sur le fichier.

## Résidus consignés (prochains cycles)
| # | Constat | Impact |
|---|---------|--------|
| PushNotif | `failedAttempts + 1` cross-instance (mutex in-process couvre le mono-process) | FAIBLE |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut — flip = validation staging (non autonome) | HAUT |
| F31 | `truncateText` dupliqué (`truncate.ts` vs `xss-protection.ts`) | FAIBLE-MOYEN |

## Gain
F47 soldé : le cap d'utilisation des tokens d'affiliation est désormais appliqué atomiquement au
niveau DB (conditional `updateMany`), fermant le TOCTOU de dépassement de quota. 0 régression
(34+21 tests verts), périmètre 1 fonction.
