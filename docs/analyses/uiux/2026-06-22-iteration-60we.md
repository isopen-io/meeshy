# Analyse UI/UX — Itération 60we (web)

**Date** : 2026-06-22
**Périmètre** : application web (`apps/web`) — EXCLUSIVEMENT
**Veine** : a11y + Prisme — i18n d'un `sr-only` figé en français (lecteurs d'écran)
**Base** : `main` HEAD post-merge 60w/60wb/60wc/60wd — `799ea44`

> **Renumérotée 60w → 60wb → 60wc → 60wd → 60we** : tempête de collisions
> exceptionnelle (4 agents web parallèles sur le même run). Quatre 60w-series
> déjà mergées avant : `60w`/#806 (config-modal), `60wb`/#808 (anti-pattern
> `t()||fallback` auth), `60wc`/#804 (aria `AttachmentPreviewReply` — **ma cible
> principale, livrée en parallèle → abandonnée**), `60wd`/#811 (cluster admin/agent).
> Surface unique restante = le `sr-only` de `PhoneResetFlow.tsx`.

## Revue de cohérence (étapes 1–3 de la routine)
- **Doublons** : ma cible AttachmentPreviewReply a été livrée à l'identique par
  #804 → **adoptée la version `main`** (rien à re-pousser). Aucun doublon ne
  subsiste dans `docs/analyses/uiux/` (60w→60wd annotés). Cette 60we est disjointe.
- **Complétude des plans** : tout est annoté dans `branch-tracking.md`.
- **Annotation** : `branch-tracking.md` mis à jour (state/history/deferred).

## Problème traité — `PhoneResetFlow.tsx:491` sr-only FR figé
Le `<label className="sr-only">Indicatif pays</label>` du sélecteur d'indicatif
pays (flow de réinitialisation de mot de passe par téléphone) était une chaîne FR
**codée en dur**, annoncée en français à un lecteur d'écran en TOUTES langues —
rupture Prisme a11y. C'était la **seule** chaîne réellement figée du composant.
**Non couvert** par #808 (qui a explicitement exclu `PhoneResetFlow.tsx`,
collision OTP #786 / PR #800).

**Correctif** : `t('phoneReset.selectCountry', 'Select country')` — **réutilise la
clé orpheline existante** `auth.phoneReset.selectCountry` (« Select country » ×4,
présente sur `main` mais **inutilisée** jusqu'ici). Single Source of Truth, zéro
clé neuve, active une clé morte. `auth.json` **non modifié** ; fallback EN 2e arg
(anti-flash, leçon 50w).

## Vérifications
- `main` confirme la chaîne FR figée encore présente (fix nécessaire) et la clé
  `auth.phoneReset.selectCountry` disponible ×4 (fix valide).
- Diff code minimal : **1 ligne** (`PhoneResetFlow.tsx`).
- Branche réinitialisée proprement sur `main` HEAD (`799ea44`) pour éliminer la
  cruft de 4 merges successifs ; seul mon delta unique est ré-appliqué.

## ✅ Statut — COMPLÈTE & CORRIGÉE
**NE PLUS re-flagger** `components/auth/PhoneResetFlow.tsx:491` sr-only indicatif
(i18n via `phoneReset.selectCountry`).

## Leçon (capturée — tempête de collisions)
À fort parallélisme (4+ agents/run), **plusieurs agents livrent la même cible**.
Règle renforcée : avant de coder, `git fetch origin main` + recherche de PR
ouvertes sur le fichier visé ; choisir une surface étroite et orthogonale ;
quand une cible préparée est mergée en parallèle, **adopter `main`** (ne jamais
re-pousser une variante divergente — churn de clés + casse le test du parallèle)
et ne conserver que le delta unique ; merger **immédiatement** après résolution
(la fenêtre entre merge et push se referme en minutes).

## Revue optimisation (étape 4) — opportunités différées (61w+)
- Anti-pattern `t()||fallback` : `PhoneResetFlow.tsx` (~56 occ, post-#800) +
  ~270 occ / ~48 fichiers restants (admin/conversations/audio/settings/video).
- Épuration `config-modal.tsx` + `LazyConfigModal` : **vérifié 0 consommateur**
  (`grep`) — code mort malgré l'i18n #806 ; candidat suppression (la 60wc/#804 le
  juge lazy-live, désaccord factuel à trancher par grep du lazy registry).
- console.error en français (participants-drawer ×5, links-section ×3).
- retrait dépendance orpheline `next-themes` (touche `pnpm-lock.yaml`).
- `app/settings/loading.tsx` server-component i18n (exclusion documentée 54w).
