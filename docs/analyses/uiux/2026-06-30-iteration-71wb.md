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
> **Scope** : `apps/web` **exclusivement**. Les vues iOS ne servent que de référence de parité (couleurs/features naturelles Meeshy), jamais d'objet de revue.

**Date** : 2026-06-30
**Base** : `main` HEAD `3b0b596` (post-merge #1088 iter-70w)
**Branche** : `claude/practical-fermat-kajcer`
**Classe** : parité dark-mode — couleurs catégorielles codées en dur sans variante `dark:`

## Contexte de continuité & non-répétition

État de `main` au démarrage : dernière itération web mergée **70w** (#1088, i18n `PhoneResetFlow`).
PR web en vol au moment de l'analyse (vérifiées via `list_pull_requests`) — **toutes évitées** :
- a11y clavier : #1111 (details-sidebar 72w), #1110/#1095 (invite-user modal 70w),
  #1106/#1101/#1099 (AttachmentPreviewReply 69w), #1100 (agent-config badges **71w**),
  #1093 (video-call overlays 69w), #1092 (community GroupCard 69w), #1091 (audio-effects 69wb).
- i18n `t()||fallback` : #1108 (conversations résidu 72w), divers magic-link/verify-phone/tracked-links.
- `prefers-reduced-motion` : **réglé globalement** par 63wb/#862 → ne pas re-flagger.

Axe choisi **strictement orthogonal** : **dark-mode token parity** (ni a11y clavier, ni i18n, ni motion).
Surface **disjointe** de toutes les PR en vol : `components/conversations/conversation-item/message-formatting.tsx`
(formatage de l'aperçu du dernier message dans la liste de conversations). **N'apparaît dans aucune
analyse/plan antérieur.** Numérotée **71wb** pour éviter la collision avec le `71w` a11y (#1100).

### Doublons d'analyses
Aucun doublon introduit. La revue des analyses récentes (52i→70w) confirme que chacune documente son
propre « Contexte de continuité » et choisit une surface orthogonale ; `branch-tracking.md` reste le
registre append-only de référence avec ses annotations « NE PLUS re-flagger ». Aucune itération
antérieure n'a traité la parité dark-mode des icônes de pièce jointe de l'aperçu de conversation.

## Cible : `components/conversations/conversation-item/message-formatting.tsx`

Ce module formate l'**aperçu du dernier message** affiché dans **chaque ligne de la liste de
conversations** (surface vue à chaque session). Quand le dernier message est une pièce jointe sans
texte, une icône emoji colorée signale le type (image/vidéo/audio/PDF/markdown/code/générique).

### Défaut (réel, visible) — 7 couleurs catégorielles sans variante `dark:`

```tsx
<span className="inline-flex text-blue-500">📷</span>    // image   (l.39)
<span className="inline-flex text-red-500">🎥</span>     // vidéo   (l.53)
<span className="inline-flex text-purple-500">🎵</span>  // audio   (l.100)
<span className="inline-flex text-orange-500">📄</span>  // PDF     (l.123)
<span className="inline-flex text-blue-500">📝</span>    // markdown(l.137)
<span className="inline-flex text-green-500">💻</span>   // code    (l.151)
<span className="inline-flex text-gray-500">📎</span>    // autre   (l.163)
```

Les nuances `-500` sont calibrées pour fond clair. En **dark mode**, elles perdent du contraste sur le
fond sombre de la liste (les `-500` saturées « vibrent » et lisent moins bien que le pas `-400`
conventionnel). **Incohérence interne** : le composant frère `ExpandableMessageText` fournit DÉJÀ des
variantes `dark:text-gray-400` pour ses libellés — ce module est le seul de la chaîne d'aperçu à ne pas
suivre la convention.

### Correctif

Ajout de la variante `dark:` conventionnelle (pas `-400`) à chacune des 7 icônes :
`text-blue-500 dark:text-blue-400`, `text-red-500 dark:text-red-400`, `text-purple-500 dark:text-purple-400`,
`text-orange-500 dark:text-orange-400`, `text-green-500 dark:text-green-400`, `text-gray-500 dark:text-gray-400`.
Aucune nuance de fond/clair modifiée → zéro régression en light mode. Diff confiné : **1 composant
(7 lignes) + 1 nouveau fichier de test**.

## Vérifications
- TDD : nouveau `__tests__/message-formatting.test.tsx` (7 cas, un par type) — **RED** (7/7 échecs sur
  l'absence de `dark:`) puis **GREEN** (7/7) après correctif, via l'API publique `formatLastMessage`.
- Non-régression `components/conversations` : **543/543 tests verts** (2 suites en échec PRÉ-EXISTANT
  hors scope : `ConversationMessages.test.tsx` — erreur de résolution de mock liée au postinstall
  Prisma bloqué localement, résolu en CI par `prisma generate` ; sans rapport avec ce diff).

## Statut
✅ **Complète & corrigée** — diff appliqué, tests verts. Surface `message-formatting.tsx` (icônes de
type de pièce jointe de l'aperçu de conversation) → **NE PLUS re-flagger** pour la parité dark-mode.
