# Cycle 126 — ce qui QUALIFIE l'aperçu était resté derrière le lot qui l'a fait converger

## Note de convergence

Ce cycle a démarré sur le même défaut que le **cycle 125 bis** (PR #3478) :
« répondre par un vocal ou une photo poussait une bannière au corps VIDE ». Les
deux passes l'ont diagnostiqué et corrigé en parallèle ; le cycle 125 bis a mergé
le premier, **son implémentation est retenue intégralement**, y compris sa
décision explicite de ne PAS étendre le rich-push aux éventails réponse et
mention. Cette passe-ci avait pris la décision inverse par argument de cohérence :
une convergence ne se résout pas en prenant l'union des deux lots.

Ce qui suit est ce que cette passe apportait EN PLUS, et que le cycle 125 bis ne
couvre pas.

## Le défaut restant

Le cycle 125 bis a fait converger le CORPS des trois bannières. Deux champs de
l'éventail ne l'ont pas suivi, **parce qu'ils ne composent aucune chaîne** :

| champ | ce qu'il fait | ce que son absence coûtait |
|---|---|---|
| `notificationLocKey` | QUALIFIE le placeholder d'un message protégé (la NSE le rend depuis sa propre table) et sert de SECOND VERROU à `createNotification` | placeholder non localisé ; verrou du cycle 125 inapplicable ; `protectedByLocKey` absent de `previewPrismSource` et `prePersistedMessageFields` |
| `messageCreatedAt` / `messageType` | horloge SERVEUR de la bulle que la NSE PRÉ-ENREGISTRE | bulle d'une réponse ou d'une mention datée par l'horloge du DEVICE |

## La leçon (§ 279)

> **Un lot qui partage une valeur composée doit énumérer ce qui voyage AVEC elle,
> pas seulement ce qui la compose.** Un champ qui QUALIFIE un texte ne se trouve
> pas en cherchant « qui compose ce texte ? » : par construction, il n'apparaît
> dans aucune composition.

Forme du cycle 125 rejouée un cran plus haut. Corollaire de structure : **un
relais qui RECOPIE champ par champ est un inventaire à tenir à jour** —
`createMentionNotificationsBatch` en recopiait neuf.

## Le correctif

1. `MessageBannerSource` — la source du Prisme ET l'horloge, deux types car deux
   questions distinctes venues d'une même lecture.
2. `loadMessagePrismSource` élargit son `select` (aucune requête de plus).
3. `messageClockFields()` — la projection, partagée par les trois éventails.
4. `notificationLocKey` déclaré et servi aux trois lots ; `protectedByLocKey`
   posé sur leurs deux gardes.
5. Le relais du batch RÉPAND au lieu de recopier.

## Gates

- [x] témoins RED d'abord (`replyMentionBannerClock.test.ts`) — **14 rouges contre `origin/main` / 19 verts après**
- [x] `tsc --noEmit` gateway et shared — 0 erreur (code de retour lu SANS pipe)
- [x] suites voisines — 36 suites, 709 témoins
- [x] non-régression du cycle 125 bis (`replyMentionMediaPreview.test.ts`) — verte
- [x] suite gateway complète — voir le rapport

## Revue

Rapport complet : `tasks/realtime-sync-audit-2026-08-24-cycle126.md`.
Leçon : `tasks/lessons.md` § 279. Règle produit : `CLAUDE.md` § Prisme, cycles 125 bis et 126.
