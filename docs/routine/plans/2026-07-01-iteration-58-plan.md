# Iteration 58 — Plan d'implémentation (2026-07-01)

## Objectif
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
