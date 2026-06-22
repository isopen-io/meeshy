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
# Analyse UI/UX — Itération 60wb (web)

## Périmètre
Web uniquement. Revue de continuité (étapes 1–3 de la routine) + livraison d'une
optimisation bornée : **bug anti-pattern `t('key') || 'French'`** sur les deux
dialogues de recadrage/upload d'image.

## Étape 1 — Doublons d'analyses
Aucun doublon de contenu détecté dans `docs/analyses/uiux/`. Les fichiers
`*w/*wb/*wc` sont des passes disjointes (numérotation incrémentée sur collisions
d'agents parallèles, conformément à `branch-tracking.md`). Aucune ré-analyse
répétée d'un même composant. Le cluster i18n feed (53w→58wb) reste entièrement
soldé.

## Étape 2 — Couverture plans/corrections
Tous les items i18n/a11y des itérations 49w→58wb ont un plan ET sont mergés
(`branch-tracking.md`). Sur `main` les iter-58wd (#794, primitives erreur/
chargement), 59w (#786, a11y OTP) et 59w-ImageLightbox sont déjà mergées →
**Next iteration = 60**. Le différé a11y « focus-trap des modales hand-rolled »
reste en cours via une PR parallèle (#802, `ConversationDrawer` +
`AgentTopicEditModal` + hook `useFocusTrap` ; encore étiquetée 59w côté branche,
à renuméroter au merge). Pour rester **orthogonal** (zéro fichier partagé), cette
itération attaque une surface distincte (dialogues d'image) et ne touche PAS
`useFocusTrap`.

## Étape 3 — Annotations
`branch-tracking.md` mis à jour : nouvelle entrée **60w** ; nouveau différé
documenté (cluster systémique `t() || 'fallback'`, ~259 occ./42 fichiers).
NE PLUS re-flagger
`avatar-crop-dialog.tsx` ni `conversation-image-upload-dialog.tsx` pour cet
anti-pattern (soldés ici).

## Étape 4 — Optimisation livrée

### Constat (bug réel, pas seulement Prisme)
Grep `t\(['"][^'"]+['"]\)\s*\|\|\s*['"]` → **259 occurrences sur 42 fichiers** de
l'anti-pattern `t('key') || 'texte de secours'`. C'est exactement le bug soldé
en 50w sur les `AudioEffects*` (`t('x') || 'En'`).

**Pourquoi c'est buggé** : `useI18n.t()` renvoie **la clé brute** (string
truthy) quand la traduction n'est pas encore chargée OU absente
(`return fallback || key`). Donc `t('key') || 'Recadrer…'` :
- ne tombe **jamais** sur le secours `|| 'Recadrer…'` (la clé brute est truthy) ;
- pendant le flash de chargement, l'utilisateur voit **`profile.cropAvatar.zoom`**
  (clé brute) dans **toutes** les langues, au lieu d'un libellé lisible.

De plus, le secours figé est en **français** → rupture Prisme s'il s'affichait.

### Correctif (signature de secours native)
Remplacement `t('key') || 'French'` → **`t('key', 'English')`** : la signature à
2 args de `useI18n` traite le 2ᵉ argument string comme **fallback natif**.
Résultat : pendant le load → secours **anglais** lisible (anti-flash, leçon 50w,
`fallbackLocale = 'en'`) ; une fois chargé → traduction correcte ×4 locales.

Cible **bornée** = les deux dialogues jumeaux de recadrage/upload d'image
(workflow identique `react-easy-crop`, surfaces user-facing) :
1. `components/settings/avatar-crop-dialog.tsx` — 8 chaînes (`settings`
   namespace, prefix `profile.cropAvatar.*`).
2. `components/conversations/conversation-image-upload-dialog.tsx` — 15 chaînes
   (`conversations` namespace, prefix `conversationImage.*`).

### Découverte d'épuration / zéro churn locale
Les **23 clés existent déjà** dans `settings.json` + `conversations.json` ×4
locales (en/fr/es/pt) → **aucun fichier locale touché**. Les secours anglais
posés en 2ᵉ arg sont **copiés mot pour mot des valeurs `en/*.json`** (cohérence
parfaite du flash anti-load). Diff = 2 fichiers composant, 0 locale.

### Décisions / hors périmètre
- Les 40 autres fichiers porteurs du même anti-pattern (~236 occurrences) →
  **nouveau différé borné** consigné, à traiter par petits lots cohérents
  (50w/57w-style), sans tout faire d'un coup (collision agents + revue).
- Commentaires FR internes (`// Réinitialiser l'état…`) **non touchés** :
  non user-facing, hors périmètre Prisme.
- Aucune dépendance sur le hook `useFocusTrap` (modifié par #802) → orthogonal.

## Faux positifs / NE PLUS re-flagger
- `avatar-crop-dialog.tsx` / `conversation-image-upload-dialog.tsx` :
  anti-pattern `t() || 'fb'` soldé → ne plus signaler ces 2 dialogues.

## Statut
✅ Implémenté — itération **60wb**. Diff minimal (2 fichiers composant, 0 locale).
node_modules absent dans le container routine → typecheck/build délégués au CI
(comme 58wb/59w). Correctif purement local (signature `t`), aucune nouvelle clé.
