# Plan — Itération 62wc (web)

## Base
- Branche tirée de `main` HEAD `d63c4a5` (post-merge #835 iter-61w en-tête conv).
- Branche de travail : `claude/practical-fermat-28y51d`.

## Objectif
Éliminer l'anti-pattern i18n `t('key') || 'fallback'` (dead-code + flash-of-raw-keys)
sur le cluster **sidebar de détails de conversation** — surface **orthogonale** aux
PR en vol (#840 mergé *layout chrome* ; #843 ouvert *message bubble*).

## Contexte / état du métier
`useI18n.t(key)` renvoie la **clé brute** (truthy) tant que la traduction n'est pas
chargée ou si la clé manque (`use-i18n.ts:172` `return fallback || key`). Le construct
`t('key') || 'fallback'` est donc cassé : secours mort + flash de clé brute. La
signature à 2 args `t('key', 'fallback')` traite le 2ᵉ string comme **fallback natif**
(anti-flash, `fallbackLocale='en'`, leçon 50w).

## Découverte clé (zéro changement visible)
Les 4 clés utilisées par ce cluster **existent déjà ×4 locales** (vérifié
en/fr/es/pt) ⇒ correction = hygiène pure, dead-code éliminé, aucun fichier locale
touché, aucune clé neuve.

## Étapes
1. [x] Reset branche sur `main` HEAD `d63c4a5`.
2. [x] Scan PR ouvertes (`list_pull_requests`) → écarter layout (#840) et message
   bubble (#843) ; cibler details-sidebar (non contesté).
3. [x] Mesurer le cluster : 7 occ. / 6 fichiers (namespace `conversations`).
4. [x] Vérifier l'existence des clés ×4 locales → **toutes présentes**.
5. [x] Transformer `t(k) || 'x'` → `t(k, 'x')` sur les 7 occ. (secours = valeur EN exacte).
6. [x] Vérifier 0 anti-pattern restant sur le répertoire details-sidebar.
7. [ ] Commit + push, PR, CI verte.
8. [ ] Merger dans `main` + mettre à jour `branch-tracking.md` + supprimer la branche.

## Changements (6 fichiers composant/hook, 0 locale)
- `conversation-details-sidebar.tsx` (2 : `imageUpdated` → secours aligné EN exact
  `Conversation image updated`, `imageUploadError`).
- `details-sidebar/DetailsHeader.tsx` (1 : `clickToChangeImage`).
- `details-sidebar/CategorySelector.tsx` (1 : `common.loading`).
- `details-sidebar/TagsManager.tsx` (1 : `common.loading`).
- `details-sidebar/CustomizationManager.tsx` (1 : `common.loading`).
- `hooks/use-conversation-details.ts` (1 : `descriptionUpdated`).

## Hors périmètre (assumé)
- Gros porteurs restants de l'anti-pattern : `ConversationSettingsModal` (29),
  `PhoneResetFlow` (56, post-#800), `app/auth/magic-link` (44),
  `forgot-password/check-email` (20), `links/tracked/[token]` (15),
  `reset-password` (12) → lots bornés dédiés futurs (63w+), coordination agents
  parallèles. Vérifier l'existence des clés ×4 au cas par cas.
- `ParticipantsDisplay`/`conversation-participants-drawer` : hors cluster, non touchés.

## Risque
Minimal : transformation mécanique string-level, **0 locale touchée**, clés vérifiées
présentes ×4 ⇒ zéro changement visible runtime. Aucun élargissement de type `t`
nécessaire (consommation directe de `useI18n('conversations')`). node_modules absent →
typecheck/build délégués au CI (cf. 58wb/59w/60wb/61w).

## Suite (différé restant)
- Lots suivants de l'anti-pattern `t() || 'fb'` (~38 fichiers, ~278 occ.) par feature.
- `Badge` success/warning/gold off-palette → arbitrage `theme.colors.*` vs `gp-*`.
- Audit qualité es/pt (relecture des traductions existantes).
