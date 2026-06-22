# Iteration 60wb — Analyse UI/UX (web only)

**Date** : 2026-06-22
**Périmètre** : `apps/web` exclusivement (les frontends iOS/Android sont traités par d'autres agents)
**Surface** : composants d'authentification (`components/auth/**`)

> **Numérotation** : renumérotée **60w → 60wb** au merge. Un agent parallèle
> (`claude/practical-fermat-r4vwgd`) a livré une autre 60w (i18n `config-modal.tsx`)
> mergée en premier. Périmètres **disjoints** (config-modal vs auth anti-pattern) :
> les deux conservées.

## Constat — anti-pattern i18n `t('key') || 'fallback'` (classe de bug, leçon 50w)

L'implémentation de `t()` (`apps/web/hooks/use-i18n.ts`) retourne, lorsqu'une clé
est manquante ou en cours de chargement, **la clé brute** (`return fallback || key`,
l. 172/181) — une string **toujours truthy**.

Conséquence : le pattern répandu `t('forgotPassword.emailLabel') || 'Email Address'`
ne tombe **jamais** sur le fallback : l'opérateur `||` court-circuite sur la clé brute.
Pendant le chargement / si une clé manque, l'utilisateur voit la **clé pointée brute**
(`forgotPassword.emailLabel`) au lieu d'un texte lisible — rupture du Prisme (UI cassée
en TOUTES langues) et flash-of-raw-keys sur des écrans d'**entrée** (login, mot de passe
oublié, reset, récupération de compte).

La signature de `t()` supporte nativement un fallback en 2e argument
(`t(key, paramsOrFallback?: Record | string)`), qui est correctement renvoyé
quand la clé est absente. Le fix élégant = remplacer `t(k) || 'x'` par `t(k, 'x')`.

### Mesure (état du codebase)
- **405** occurrences de `t(...) || '...'` réparties sur **59** fichiers `apps/web`.
- Concentration sur l'`auth` (entry surfaces, flash le plus visible) : **125** occurrences / 11 fichiers.

## Périmètre traité en 60wb (borné, orthogonal aux PR en vol)
10 fichiers `components/auth/**` (**76** remplacements `|| 'x'` → `, 'x'`) :
- `FeatureGate.tsx`, `ForgotPasswordForm.tsx`, `PasswordRequirementsChecklist.tsx`,
  `PasswordStrengthMeter.tsx`, `ResetPasswordForm.tsx`, `account-recovery-modal.tsx`,
  `recovery/EmailRecoveryStep.tsx`, `recovery/SuccessStep.tsx`,
  `wizard-steps/ContactStep.tsx`, `wizard-steps/SecurityStep.tsx`.

**Exclu volontairement** : `components/auth/PhoneResetFlow.tsx` (56 occurrences) — touché
par l'iter-59w OTP (#786, mergé) et la PR ouverte **#800**. Reporté pour éviter tout
conflit de merge (leçon collision 57w/58wb/60w).

## Vérifications
- Toutes les clés ciblées **existent** dans `locales/{en,fr}/auth.json` → le fallback
  n'est jamais atteint au runtime : **zéro changement visible** pour l'utilisateur sur les
  clés présentes. Le fix est purement correctif (sémantique du filet de sécurité) +
  suppression de dead-code.
- **Anglicisation des fallbacks FR** (leçon 50w : fallback EN anti-flash) : les filets de
  sécurité qui étaient en français (`PasswordRequirementsChecklist` ×3, `account-recovery-modal`
  ×6, `EmailRecoveryStep` ×4, `SuccessStep` ×2) sont alignés sur la valeur **EN exacte** du
  locale → plus aucune fuite FR possible en cas de clé manquante.
- Parenthèses équilibrées (le remplacement retire un `)` et en réinjecte un) ; préfixes
  `cond || t(...)` préservés (ex. `localError || t('resetPassword.errors.tokenInvalid', '…')`).
- `grep` anti-pattern restant sur les 10 fichiers = **0**.
- CI #808 : Quality (bun) / Security / Test web / Test gateway / Test shared / Build (bun)
  + tous les jobs → **success**.

## Reste différé (60wc+ / 61w+)
~270 occurrences de `t(...) || '...'` sur ~48 autres fichiers web (admin, conversations,
audio, settings, video-calls…) — même transformation mécanique, par lots bornés et
orthogonaux. + `PhoneResetFlow.tsx` une fois #800 mergée/fermée.

---

## ✅ Statut : COMPLÈTE & CORRIGÉE (60wb — PR #808)
**NE PLUS re-flagger** l'anti-pattern `t(k) || 'x'` sur ces 10 fichiers auth — soldé.
Les fallbacks de ces fichiers sont désormais EN et corrects. Le reste de la classe de
bug (48 fichiers) reste un différé borné explicite, à traiter en 60wc+.
