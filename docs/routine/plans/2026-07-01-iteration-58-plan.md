# Iteration 58 — Plan d'implémentation (2026-07-01)

## Objectif
Lot « Source unique des initiales — profil public — F26c-c(c) » : remplacer la **dernière**
dérivation d'initiales par troncature brute (`app/u/[id]/page.tsx:346`
`getUserDisplayName(user).slice(0,2).toUpperCase()`) par le canonique `getUserInitials`
(`@/lib/avatar-utils`) — vraies initiales cohérentes avec tout le produit.

## Note de resynchronisation
Le lot F23 initialement engagé cette itération a été **abandonné** : déjà mergé sur `main`
(iter 46 / F23b) avec une meilleure implémentation. Branche resynchronisée sur `origin/main`
(iter 57) avant de reprendre. Voir l'analyse iter 58 pour le détail.

## Étapes (délégation → vérification)

### Phase A — Converger le composant
- [x] `app/u/[id]/page.tsx` : import `{ getUserInitials }` from `@/lib/avatar-utils`.
- [x] l.346 → `{getUserInitials(user)}` (remplace `getUserDisplayName(user).slice(0,2).toUpperCase()`).
- [x] Conserver `getUserDisplayName` local (libellés/titre l.319, l.363) — même source `resolveDisplayName`.

### Phase B — Vérification & livraison
- [ ] `grep "DisplayName(...).slice(0,2)"` sur `apps/web/**/*.tsx` → **0** occurrence (fait : confirmé).
- [ ] `tsc --noEmit` web : l'appel compile (`user: User` ⊆ `UserNameSource`) ; aucune **nouvelle** erreur.
- [ ] Commit + push `claude/sharp-wozniak-6lwbw0` (force-with-lease, branche resync) ; PR #1131
      repurposée vers iter 58 ; CI verte ; **merge squash**.

## Hors périmètre (consigné dans l'analyse)
F26c-e (nom conversation), F25b, F2 (staging), F10 (backfill), F21 (backfill).

## Continuité
Iter 59 : F26c-e (nom de conversation) si une troncature d'initiale subsiste, sinon nouveau
domaine (audit BP F2/F10 dès qu'une fenêtre staging/backfill existe).

## Incidents de merge (parallélisme multi-agents)
- **Avant de committer, re-vérifier `origin/main`** : si `app/u/[id]/page.tsx:346` a déjà été
  convergé par un commit parallèle, fermer comme doublon.
- Rappel process : `git fetch origin main && git rev-list --count HEAD..origin/main` **au début**
  de chaque itération pour ne pas repartir d'une base périmée.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — import ajouté ; l.346 délègue à `getUserInitials`. Dernière `.slice(0,2)`
      d'initiale d'identité éliminée dans `apps/web` (grep confirmé à 0).
- [ ] Phase B — `tsc` web sans nouvelle erreur ; commit + push + PR + CI + merge.
Lot « Source unique — classification du temps relatif (F27) » : convertir les trois dernières
réimplémentations manuelles de paliers « temps écoulé » sur le canonique `classifyRelativeTime`
(`@meeshy/shared/utils/relative-time`), sans changer la sortie visible.

## Contexte de renumérotation (parallélisme multi-agents)
Piste démarrée en « iter 56 », renumérotée 57 puis **58** : deux PR parallèles ont pris les slots
56 (#1170 admin/users) et 57 (#1181 contacts) dans `main`. Rebasée sur `d627b28b`. Fix gateway
redondant abandonné (déjà dans `main`). Les 3 fichiers web ciblés ne sont touchés par aucune des deux
PR → zéro conflit de code (seuls les slots de docs collisionnaient).

## Pré-requis runner (parité CI)
- [x] `bun install` (jest web présent).
- [x] Baseline : `AgentLiveTab.test.tsx` **40/40** ; conversations **85/85**.
- [x] Aucun test ne verrouille la sortie temps-relatif de ces trois composants.

## Étapes (délégation → vérification)

### Phase A — `AgentLiveTab.formatTimeAgo`
- [x] Importer `classifyRelativeTime` ; `switch (bucket.unit)` avec `beyondDays: Infinity`.
- [x] Sorties conservées : `now`→`t('timeAgo.now')` ; `minutes`→`${v}${t('timeAgo.minutes')}` ;
      `hours`→`${v}${t('timeAgo.hours')}` ; `days`→`${v}${t('timeAgo.days')}`.

### Phase B — `ConversationDropdown.formatShortDate`
- [x] Importer `classifyRelativeTime` ; `beyondDays: 7` ; `now/minutes/hours/days` → mêmes clés
      `status.*` avec `count: bucket.value` ; `beyond`→`toLocaleDateString` identique.

### Phase C — `online-indicator` tooltip
- [x] Importer `classifyRelativeTime` ; `beyondDays: Infinity` ; chaînes FR conservées ;
      pluriel `jour(s)` via `value > 1`.

### Phase D — Vérification & livraison
- [x] `jest AgentLiveTab.test.tsx` → **40/40** ; conversations **85/85**.
- [x] `tsc --noEmit` : aucune erreur sur les 3 fichiers touchés.
- [x] Rebase sur `origin/main` (`d627b28b`) ; patch web appliqué proprement (NO OVERLAP).
- [ ] Force-push `claude/sharp-wozniak-9e5y85` ; PR #1177 retitrée iter 58 ; CI verte ; **merge**.

## Hors périmètre (consigné dans l'analyse)
- Composants « expiry/countdown » (StatusBar, StoryViewer — sémantique future).
- F26c-c(c), F25b, F2, F10, F21.

## Continuité
Iter 59 : nouveau scout. Pistes : sous-cluster countdown/expiry (source unique orientée futur),
slug/url, sanitize, validateurs téléphone (F25b).

## Incidents de merge (parallélisme multi-agents)
- Double collision de slot de docs (#1170 iter-56, #1181 iter-57) sur une piste de code totalement
  disjointe. Leçon : quand plusieurs agents tournent, le **numéro d'itération n'est pas réservé** ;
  vérifier `origin/main` juste avant le merge et renuméroter les docs si le slot est pris — le code
  (fichiers disjoints) n'est jamais en conflit.

## Statut (mis à jour en fin d'itération)
- [x] Phase A / B / C — trois convergences appliquées, sortie préservée.
- [x] Phase D — tests + tsc verts ; rebase propre ; reste : force-push + CI + merge.
