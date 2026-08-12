# Iteration 59 — Analyse d'optimisation (2026-07-01)

## Contexte
Suite iter 58 (« Source unique de la classification du **temps écoulé** » — `classifyRelativeTime`,
mergée dans `main` : PR #1177 / `3dac363`). Le cluster **temps écoulé** (passé) est clos côté web.

Scout iter 59 : le **miroir futur** — le formatage « temps **restant** avant expiration »
(compte à rebours grossier heures/minutes) était réimplémenté à l'identique à deux endroits.
Piste disjointe des tracks parallèles (initiales `getUserInitials`, iOS `RelativeTimeFormatter`).

## Constat — deux réimplémentations identiques du « temps restant »

| Cible | Forme |
|-------|-------|
| `components/v2/StatusBar.tsx` `getTimeRemaining` (l.38) | `${h}h${m}m` / `${h}h` / `${m}m`, `'Expire'` si ≤ 0 |
| `components/v2/StoryViewer.tsx` bloc inline (l.847) | idem, `null` si ≤ 0 |

Les deux calculent `diff = expiry - now` puis `minutes = floor(diff/60000)`,
`hours = floor(minutes/60)`, et rendent **exactement** la même chaîne pour un délai positif :
`hours ≥ 1 → ${h}h${m}m` (ou `${h}h` si `m == 0`), sinon `${m}m`. Seule la présentation du cas
« expiré » diffère (libellé `'Expire'` vs masquage).

Autre voisin **non concerné** : `admin/agent/DeliveryQueueItemCard.formatCountdown` opère à la
**seconde** (`Xm SSs` / `Xs`) — granularité différente (compte à rebours court), hors périmètre.

### Problèmes (cohérence + état de l'art)
1. **Duplication** d'un algorithme de ~10 lignes, sans source unique, alors que le miroir passé
   (`classifyRelativeTime`) vient d'être unifié.
2. **Risque de dérive** de format (`${h}h${m}m` vs `${h}h ${m}m`, arrondis, seuils).
3. **Testabilité** : les deux copies lisent `Date.now()` en dur → non déterministes, non testées.

## Décision iter 59 — lot « Source unique — temps restant avant expiration (F28) »

Extraire `formatTimeRemaining(expiresAt, nowMs?)` dans `apps/web/utils/time-remaining.ts` :
- pure, « maintenant » injectable (déterministe, testable) ;
- retourne la chaîne `${h}h${m}m` / `${h}h` / `${m}m` pour un délai strictement positif ;
- retourne **`null`** quand la cible est atteinte/dépassée — l'appelant décide du rendu « expiré ».

Convergence :
- `StatusBar` : `formatTimeRemaining(status.expiresAt) ?? 'Expire'` (libellé préservé).
- `StoryViewer` : `const r = formatTimeRemaining(story.expiresAt); if (!r) return null; …` (masquage préservé).

### Garanties de non-régression
- Équivalence **exacte** pour délai positif (même arithmétique, même format) ; cas expiré préservé
  par chaque appelant (`?? 'Expire'` / `!r → null`).
- Nouveau test unitaire pur `__tests__/utils/time-remaining.test.ts` (**8 cas** : expiré, passé,
  minutes, heure pile, `1h30m`, `2h5m`, epoch numérique, `Date`).
- `story-viewer-comments.test.tsx` (rend `StoryViewer`) : **5/5** avant/après.
- `tsc --noEmit` : aucune erreur sur les 3 fichiers touchés.

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F26c-c(c) | `app/u/[id]` `.slice(0,2)` → `getUserInitials` | FAIBLE | Track initiales parallèle |
| F25b | Validateurs téléphone | MOYEN | Contrats incompatibles |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN | Audit + backfill |

## Gain
Cluster **temps restant avant expiration** unifié : une source unique pure et testée
(`formatTimeRemaining`), plus aucune réimplémentation `expiry - now` dans `apps/web` pour un
compte à rebours heures/minutes. Prochain grain : `DeliveryQueueItemCard.formatCountdown` (granularité
seconde — source unique distincte si un 2ᵉ site apparaît), slug/url, sanitize, validateurs (F25b).
