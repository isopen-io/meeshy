# Iteration 85 — Analyse d'optimisation (2026-07-03)

## Protocole (démarrage)
`main` @ `f0ad0c4` (working tree propre, branche `claude/brave-archimedes-h47bug` alignée sur
`origin/main`, aucun commit non-mergé). Aucune PR ouverte pertinente au démarrage. Continuité du
thème dominant des itérations 79→84 : **durcissement des races « check-then-act / lost-update »
sur les compteurs & curseurs partagés du gateway** (lessons #50, #51, #55, F47).

Les résidus explicitement documentés en fin d'itérations précédentes étaient **F47 (cap `maxUses`
TOCTOU affiliation)**, F49, F50. F47 pointait un **check-then-act résiduel** : un compteur peut être
incrémenté atomiquement (`{ increment }`) et pourtant DÉPASSER son plafond, parce que la *vérification
du plafond* et l'*incrément* restent deux opérations distinctes. Cette itération applique le fix
canonique de cette classe (consume atomique conditionnel) à la surface la **plus sensible en sécurité**
où elle subsiste : les compteurs de tentatives du reset de mot de passe par SMS.

## Cible iter 85 — TOCTOU d'amplification brute-force sur `PhonePasswordResetService`

### Current state
`services/gateway/src/services/PhonePasswordResetService.ts` implémente le reset de mot de passe par
SMS en 3 étapes. Deux étapes protègent une action sensible par un compteur de tentatives plafonné :

- `verifyIdentity` (l.325-345) : `if (token.identityAttempts >= MAX_IDENTITY_ATTEMPTS) → revoke+block`,
  puis sur mismatch username/email `update({ identityAttempts: { increment: 1 } })`.
- `verifyCode` (l.445-468) : `if (token.codeAttempts >= MAX_CODE_ATTEMPTS) → revoke+block`, puis sur
  code invalide `update({ codeAttempts: { increment: 1 } })`.

Les increments sont **déjà atomiques** (`{ increment: 1 }`) — le lost-update pur du compteur est donc
absent. Mais la **vérification du plafond lit la valeur du `findUnique`** (snapshot au début du handler)
et l'incrément est une opération DB séparée qui suit.

### Problems identified
**Check-then-act (TOCTOU) → amplification de brute-force.** N requêtes concurrentes sur le même
`tokenId` lisent toutes le même `codeAttempts` (p.ex. 0) via `findUnique`, passent toutes le garde
`< MAX`, tentent chacune un code différent, puis incrémentent. Le plafond `MAX_CODE_ATTEMPTS = 5`
(resp. `MAX_IDENTITY_ATTEMPTS = 3`) ne borne alors plus le nombre réel de codes essayés : un
attaquant qui envoie des rafales concurrentes peut essayer bien plus de 5 codes SMS à 6 chiffres
avant que le compteur ne rattrape et ne révoque le token. C'est exactement la classe **F47**
(« le cap peut être dépassé car check et increment ne sont pas atomiques »), mais ici sur la surface
de **récupération de compte** — la plus critique en sécurité.

### Root cause
Le garde de plafond raisonne sur une **lecture obsolète** (`token.codeAttempts` du `findUnique`),
décorrélée de l'écriture d'incrément qui suit. Un compteur de sécurité (rate-limit) doit être
**consommé de façon atomique et conditionnelle** — la vérification `< MAX` et l'incrément doivent
être une seule opération, sinon la fenêtre entre les deux est exploitable sous concurrence.

### Business impact
**Sécurité — élevé.** Le SMS code est un secret à 6 chiffres (10⁶ combinaisons). Le plafond de 5
tentatives est la défense principale contre le brute-force. Une amplification par concurrence réduit
directement le coût d'une attaque de récupération de compte. `verifyIdentity` protège de la même
façon l'énumération username+email.

### Technical impact
- Remplacer le couple `check(findUnique) … increment(update)` par un **consume atomique conditionnel** :
  `updateMany({ where: { id, <attempts>: { lt: MAX } }, data: { <attempts>: { increment: 1 } } })`.
  MongoDB évalue le filtre `$lt` et applique `$inc` en une seule écriture atomique par document ; sous
  concurrence, **au plus MAX** consommations peuvent réussir. Idiome déjà établi (lesson #51 pattern B,
  `AffiliateTrackingService`/`routes/anonymous.ts`).
- `consumed.count === 0` ⟹ plafond atteint ⟹ `revokeToken` + log `*_BLOCKED` (HIGH) + `max_attempts_exceeded`.
- Le consume précède la vérification ; un échec (mismatch / code invalide) **ne ré-incrémente plus**
  (la tentative est déjà comptée). `attemptsRemaining` conserve la formule `MAX - token.<attempts> - 1`
  (valeur pré-lecture, identique à l'ancien comportement observable).

### Subtilité assumée — le consume compte aussi une tentative RÉUSSIE
Avec le consume-avant-vérification, une identité correcte / un code correct incrémente aussi le
compteur avant de transitionner l'étape (`CODE_PENDING`) ou de marquer le token `usedAt/COMPLETED`.
C'est **sans effet observable** : après transition/consommation du token, le compteur n'est plus
jamais relu (une re-tentative échoue sur le garde d'étape / `usedAt`). Arbitrage identique à la
famille #50/#55 : correctness sous concurrence > préservation d'un compteur dénormalisé jamais relu.

### Risk assessment
FAIBLE. Le consume atomique conditionnel est strictement plus correct sous concurrence ; hors course,
le comportement observable (mêmes erreurs, mêmes `attemptsRemaining`, même révocation au plafond) est
identique. Filtre de consume volontairement minimal (`id` + `<attempts> < MAX`) pour que
`count === 0` signifie exactement « plafond atteint ». La race d'état orthogonale (deux codes
CORRECTS concurrents créant deux `passwordResetToken`) reste hors périmètre — elle exige de connaître
le code, ce n'est pas un scénario de brute-force.

## Validation
- `jest PhonePasswordResetService` → suite complète verte, dont 2 régressions concurrence neuves
  (consume conditionnel `updateMany` sur code + identité, `count===0` ⟹ block).
- Suites `password-reset` + `AuthService` (co-utilisatrices) vertes.

## Améliorations futures (report)
- **F47** : `AffiliateTrackingService.convertAffiliateVisit` — même classe check-then-act sur le cap
  `maxUses` (increment atomique déjà en place, garde encore check-then-act). Appliquer le même
  consume conditionnel `updateMany({ where: { id, currentUses: { lt: maxUses } } })`.
- **F49/F50** : agrégats JSON `messagesPerLanguage` / `participantStats` en read-modify-write
  non atomique (auto-guéris par TTL / `recompute()`, sévérité basse — inchangés).
