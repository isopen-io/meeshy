# Plan — Itération 62w (web)

## Objectif
Solder l'anti-pattern buggé **`t('key') || 'fallback'`** sur le **chrome global de navigation**
(`components/layout/{Footer,Header,DashboardLayout}.tsx`) — surface **orthogonale** à toutes les PR
i18n parallèles en vol (#835 en-tête conversation, #814 dialogues image, #816/#818 lightboxes,
#811 admin/agent, #810 AttachmentPreviewReply/PhoneResetFlow).

## Base
- Branche tirée de `main` HEAD post-merge iter-60wc (#804, `43cb822`).
- Branche de travail : `claude/practical-fermat-pbka2f`.

## Contexte / état du métier
`useI18n.t(key)` renvoie la **clé brute** (truthy) tant que la traduction n'est pas chargée ou si la clé
manque (`use-i18n.ts`, `return fallback || key`). `t('key') || 'fallback'` est donc **dead-code + flash
de clé brute** ; le secours `Header.shareText` était de surcroît en **FR** (rupture Prisme). La signature
à 2 args `t('key', 'fallback')` traite le 2ᵉ string comme **fallback natif** (anti-flash, `fallbackLocale='en'`).

## Vérification clé (toutes présentes ×4 → code-only)
`landing.footer.{tagline,copyright,links.*}`, `header.shareText`, `common.navigation.feeds` existent aux
4 locales (parité vérifiée) → **aucun ajout de locale**, correctif pur.

## Étapes
1. [x] Confirmer la classe de bug + mesurer le cluster (12 occ. / 3 fichiers).
2. [x] Vérifier l'existence des clés ×4 locales (toutes présentes).
3. [x] `t(k) || 'FR/EN'` → `t(k, 'EN')` (secours = valeur EN exacte du locale).
4. [x] Vérifier 0 anti-pattern restant dans `components/layout/`.
5. [x] Vérifier non-régression des 3 tests (mock 1-arg compatible, aucune assertion sur les secours).
6. [ ] Commit + push, PR, CI verte.
7. [ ] Merger dans `main` + mettre à jour `branch-tracking.md` + supprimer la branche.
8. [ ] Fermer le doublon #837 (AttachmentPreviewReply déjà mergé en 60wc/#804).

## Changements (3 fichiers, 0 locale)
- `Footer.tsx` (7), `Header.tsx` (4 × shareText), `DashboardLayout.tsx` (1 × navigation.feeds).

## Hors périmètre (assumé)
- 32 autres fichiers du même anti-pattern → lots bornés 63w+ (coordination agents parallèles).
- `PhoneResetFlow.tsx` (56 occ) → PR auth en vol (#810/#800).
- Commentaires FR internes (`console.error`) non user-facing → non touchés.

## Risque
Minimal : transformation mécanique string-level, clés déjà présentes ×4 (zéro changement runtime).
Tests existants non impactés (mock 1-arg compatible).
