# Analyse UI/UX — Itération 71wb (web)

**Date** : 2026-06-30
**Périmètre** : application web (`apps/web`) — EXCLUSIVEMENT
**Base** : `main` HEAD `3b0b596` (post-merge #1088 iter-70w `PhoneResetFlow`)
**Branche** : `claude/practical-fermat-j40nub`

> **Scope** : `apps/web` exclusivement. Les vues iOS ne servent que de référence de parité (couleurs/features naturelles Meeshy), jamais d'objet de revue.
> **Thème** : solde du résidu anti-pattern i18n `t('clé') || 'fallback FR'` dans le **flux de récupération de compte** (hooks `use-recovery-submission` / `use-recovery-flow`). Catégorie cluster `t()||fallback` suivie depuis 50w.

## Contexte de continuité & non-répétition

Forte activité parallèle (autres agents web/iOS). PR web en vol au démarrage (vérifiées via
`list_pull_requests`) — **toutes évitées** :
- **#1100 (iter-71w)** — a11y clavier toggles `Badge` agent-config → surface a11y, disjointe.
- **#1108 (iter-72w)** — `t()||fallback` cluster **conversations** (`useMessageActions`, `ConversationDetailsStep`, `conversation-participants-drawer`, `ConversationLayout` + toast restore) → **évité** : surface `conversations/`, namespace distinct.
- **#1110 / #1095 (iter-70w)** — a11y `invite-user-modal` ; **#1111 (iter-72w)** — a11y `details-sidebar` ; **#1091** audio timeline ; **#1092** GroupCard ; **#1093 / #1106 / #1101 / #1099** attachment-reply / video-call → toutes a11y, disjointes.

Surface choisie **strictement orthogonale** : `hooks/use-recovery-submission.ts` +
`hooks/use-recovery-flow.ts` — le **dernier résidu** `t()||'FR'` du flux de récupération de compte.
Le composant porteur `PhoneResetFlow.tsx` (56 occ.) a été soldé en **70w/#1088** ; le modal
`account-recovery-modal.tsx` utilise déjà la forme 2-args. Ces 2 hooks n'apparaissent dans **aucune
analyse/plan antérieur** et ne sont touchés par **aucune PR en vol**.

### Doublons d'analyses
Aucun doublon introduit. Le cluster `t()||fallback` reste un thème continu (50w/60wb/61w/62w/63w/64w/65w/66w/70w) ; cette itération en **termine** la branche « récupération de compte ».

## Constats vérifiés (file:line) et corrections

| # | Fichier | Problème | Correction |
|---|---------|----------|-----------|
| 1 | `hooks/use-recovery-submission.ts:56` | `t('magicLink.success.title') \|\| 'Magic Link envoyé !'` (toast succès). | `t('magicLink.success.title', 'Magic Link Sent!')` |
| 2 | `hooks/use-recovery-submission.ts:61` | `t('magicLink.errors.rateLimited') \|\| 'Trop de tentatives…'` (erreur rate-limit). | `t('magicLink.errors.rateLimited', 'Too many attempts. Please try again in about an hour.')` |
| 3 | `hooks/use-recovery-flow.ts:80` | `t('phoneReset.errors.tokenExpired') \|\| 'Session expirée…'` (toast session expirée). | `t('phoneReset.errors.tokenExpired', 'Session expired. Please start over.')` |
| 4 | `hooks/use-recovery-submission.ts:21` | Type du prop `t: (key: string) => string` ne permettait pas le 2ᵉ argument fallback. | `t: (key: string, fallback?: string) => string` |

### Pourquoi (rappel leçon 50w — anti-flash)
`use-i18n.ts` ne fait **aucun fallback per-clé inter-locale** : pour une clé absente — ou pendant le
**chargement async du namespace `auth`** (objet `translations` vide) — `t()` renvoie la **clé brute**
(truthy). Donc `t('k') || 'FR'` :
1. est du **code mort** quand la clé existe (les 4 locales `en/fr/es/pt` ont déjà les valeurs — parité vérifiée, symdiff = 0) ;
2. **flashe le français figé** à TOUS les utilisateurs EN/ES/PT pendant le chargement. Rupture Prisme sur une surface auth sensible.

La forme `t('k', 'EN exacte')` sert la valeur **anglaise mot-pour-mot** de `en/auth.json` comme secours d'attente — jamais la clé brute, jamais le français.

## Tests
- **NOUVEAU** `__tests__/hooks/use-recovery-submission-i18n.test.ts` — 2 cas : avec un `t` simulant le
  **namespace non chargé** (renvoie la clé brute, honore le 2ᵉ arg), `handleEmailRecovery` surface la
  copie **anglaise** (`'Magic Link Sent!'` / `'Too many attempts…'`) — **jamais** la clé brute
  (`magicLink.success.title`), **jamais** le français (`envoyé`/`tentatives`).
- **Non-régression** `__tests__/components/auth/account-recovery-modal.test.tsx` — 42 cas inchangés
  (le mock `t` ignore le 2ᵉ arg, rendu identique).
- **Résultat** `jest` ciblé : **2 suites / 44 tests passed**.

## Vérifications
- `grep` anti-pattern `t()||'…'` résiduel sur les 2 fichiers = **0**.
- Parité `auth.json` `magicLink.*` / `phoneReset.errors.tokenExpired` : `en`/`fr`/`es`/`pt` présentes (symdiff = 0). **Aucune clé i18n neuve.**
- Diff total : **2 fichiers de prod, 4 insertions / 4 suppressions** + 1 nouveau test. Aucun nouvel import/namespace.

## Hors-scope confirmé / différé
- `Test shared` rouge sur `main` = régression migration zod v4 (hors-scope web, propriétaire shared ; cf. branch-tracking).
- `Test web` non fiable comme gate global (suites auth périmées pré-existantes ; cf. branch-tracking) — gater sur la suite spécifique + `Quality (bun)`.

### Différé 72w+ (cluster `t()||fallback`, hors surfaces en vol)
`hooks/use-message-interactions.ts` (≈1), `app/settings/page.tsx` (≈1),
`app/dashboard/LastMessagePreview.tsx` (≈1), `app/(connected)/contacts/page.tsx` (≈1),
`components/conversations/LanguageSelectionMessageView.tsx`. **Éviter** le cluster `conversations/`
(`useMessageActions`/`ConversationDetailsStep`/`conversation-participants-drawer`/`ConversationLayout`)
tant que **#1108** n'est pas mergée (collision).

---

## ✅ ANALYSE CORRIGÉE & COMPLÈTE (71wb — 2026-06-30)
Les 3 occurrences `t()||'FR'` du flux de récupération de compte sont **converties et testées**
(en attente merge `main`). **NE PLUS re-flagger** :
- `hooks/use-recovery-submission.ts` (`magicLink.success.title`, `magicLink.errors.rateLimited`) ;
- `hooks/use-recovery-flow.ts` (`phoneReset.errors.tokenExpired`).
Branche « **récupération de compte** » du cluster `t()||fallback` **épuisée** (porteur `PhoneResetFlow` = 70w/#1088 ; modal + hooks = soldés). Reste à balayer hors `conversations/` (cf. § Différé 72w+).
