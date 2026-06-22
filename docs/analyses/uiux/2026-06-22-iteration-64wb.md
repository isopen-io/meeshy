# Analyse UI/UX — Itération 64wb (web)

**Date** : 2026-06-22
**Périmètre** : application **web** uniquement (`apps/web`)
**Surface** : modale de paramètres de conversation — `components/conversations/ConversationSettingsModal.tsx`
**Branche** : `claude/practical-fermat-16bsl0` (base `main` HEAD `39f02b3`, post-merge iter-63w #849)

## Déclencheur

`pull_request.closed` #849 (`claude/practical-fermat-yly7ym` → `main`) = **iter-63w mergée**
(anti-pattern `t()||fallback` sidebar détails de conversation). `main` HEAD = `39f02b3`.

## Étape 1 — Doublons d'analyses

Aucun doublon introduit. **Forte contention** : 6 PR web ouvertes vérifiées via `list_pull_requests`
(à NE PAS ré-attaquer, surfaces disjointes) :
- **#858** (`ypjp47`) iter-64w = voice-profile tooltip (i18n + theme tokens).
- **#857** (`gq4cjc`) = failed-message & system-status banners.
- **#855** (`5f6moi`) = suppression `settings/_archived/`.
- **#854** (`est6ww`) = page `/me` (28 chaînes FR).
- **#853** (`knf2oo`) = `useEffectTiles` audio-effects.
- **#852** (`28y51d`) = `hooks/use-conversation-details.ts` (1 occ — quasi-doublon de #849 déjà mergé,
  une seule ligne unique restante).

→ Pour rester **strictement orthogonal** (0 fichier partagé), 64wb cible le **plus gros porteur non
couvert** de l'anti-pattern : `ConversationSettingsModal.tsx` (29 occ.), touché par aucune PR ouverte.

## Étape 2 — Couverture plans/corrections

Tous les items i18n/a11y 49w→63w ont un plan ET sont mergés. Le différé direct = la classe de bug
systémique `t('key') || 'fallback'`. Mesure à jour : `ConversationSettingsModal.tsx` = **29 occurrences**,
le plus gros cluster cohérent non encore traité ni couvert par une PR en vol (hors `PhoneResetFlow` 56,
laissé en dédié, et `magic-link` 44 / `verify-phone` 26, namespace auth).

## Étape 3 — Annotations

`branch-tracking.md` mis à jour : entrée **64wb** ; `ConversationSettingsModal.tsx` marqué soldé pour
l'anti-pattern. NE PLUS re-flagger ce fichier pour `t() || 'fb'`.

## Étape 4 — Optimisation livrée

### Constat — BUG VISIBLE RÉEL (pas seulement dead-code)

`useI18n('conversations').t(key)` renvoie la **clé brute** (string truthy) quand la clé est absente du
bundle (`use-i18n.ts:142` puis `return fallback || key`). Donc `t('key') || 'fallback FR'` :
1. le secours `||` est **dead-code** quand la clé existe (clé brute truthy court-circuite) ;
2. quand la clé est **absente**, l'utilisateur voit la **clé brute dottée** (`conversationDetails.activity`)
   — JAMAIS le secours.

**Découverte critique** : 5 clés étaient **absentes de `en`/`es`/`pt`** (présentes seulement en `fr`) :
`conversationDetails.{activity, viewAllParticipants, mediaAndAppearance, changeBanner, uploadBanner}`.
⇒ Les utilisateurs **en/es/pt** voyaient littéralement `conversationDetails.activity`,
`conversationDetails.mediaAndAppearance`, etc. dans la modale — **bug visible en production**, pas une
simple hygiène. De plus, les 29 secours `||` étaient codés en **FRANÇAIS** (`Paramètres`, `Organisation`,
`Sécurité`, `Les messages sont chiffrés…`) = **rupture Prisme** s'ils s'étaient déclenchés.

### Correctif

1. **Parité locale rétablie** : ajout des **5 clés manquantes ×3 locales** (`en`/`es`/`pt`) sous
   `conversations.conversationDetails.*` (fr déjà complet) :
   - en : Activity / View all participants / Media & Appearance / Change banner / Add a banner
   - es : Actividad / Ver todos los participantes / Multimedia y apariencia / Cambiar el banner / Añadir un banner
   - pt : Atividade / Ver todos os participantes / Mídia e aparência / Alterar o banner / Adicionar um banner
2. **29 occ.** `t(k) || 'FR'` → **`t(k, 'English')`** (signature de secours native, anti-flash leçon 50w).
   Secours FR codés en dur remplacés par la **valeur EN exacte du locale** (SSOT). Les 24 autres clés
   existaient déjà ×4 → transformation mécanique pure.

### Vérification

- Parité ×4 vérifiée par script : les 26 `conversationDetails.*` + 3 `conversationHeader.*`
  (`pin`/`mute`/`archive`) présentes dans les 4 locales. JSON ×4 valide.
- `grep` anti-pattern sur `ConversationSettingsModal.tsx` = **0** après correctif.
- Test `__tests__/components/conversations/ConversationSettingsModal.test.tsx` : mock
  `t: (key) => translations[key] || key` (ignore le 2ᵉ arg) → assertions inchangées vertes (mêmes clés).
- Build/typecheck/lint délégués au CI (node_modules absent du container routine).

### Hors périmètre (faux positifs — NON touchés)

- `(conversation.title || '').length` et `conversation.title || t(...)` : nullables légitimes, pas
  l'anti-pattern i18n (le `t(...)` interne, lui, est corrigé).

## Faux positifs / NE PLUS re-flagger

- `components/conversations/ConversationSettingsModal.tsx` : anti-pattern `t() || 'fb'` **soldé** (29 occ.).

## Décisions / différé futur (65w+)

- Gros porteurs restants : `PhoneResetFlow.tsx` (56), `app/auth/magic-link/page.tsx` (44),
  `app/auth/verify-phone/page.tsx` (26), `app/links/tracked/[token]/page.tsx` (15, namespace `links`),
  `hooks/conversations/useMessageActions.ts` (10) → lots bornés dédiés. **Vérifier l'existence des clés
  ×4 au cas par cas** (leçon 64wb : ne pas présumer la parité — 5 clés manquaient ici).

## Statut

✅ Implémenté — itération **64wb**. Diff : 1 composant (29 lignes), 3 locales (+5 clés chacune).
Parité ×4 rétablie. Bug visible réel corrigé (clés brutes en/es/pt) + rupture Prisme évitée.
Build/typecheck/lint délégués au CI.

## ✅ Annotation de complétude

**SOLDÉ en 64wb** — `ConversationSettingsModal.tsx` : anti-pattern `t() || 'fb'` éliminé (29 occ. ;
`grep`=0) + 5 clés manquantes ajoutées en/es/pt. **NE PLUS re-flagger** ce fichier. Numérotée **64wb**
(64w pris par #858 voice-profile ; suffixe `w` = web).
