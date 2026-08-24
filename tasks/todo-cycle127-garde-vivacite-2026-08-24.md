# Cycle 127 — la garde de vivacité que seul le lot le plus fréquenté portait

## Le défaut

Suivi MESURÉ du cycle 126 (« distinct, non instruit »), instruit ici et plus grand
que ce qu'il en disait : un défaut de CONFIDENTIALITÉ, pas une notification en trop.

`createMessageNotification` relit l'état du message avant de pousser et abandonne
quand il a été rappelé ou a expiré dans la fenêtre de l'éventail — « we MUST NOT
leak the original content via the banner ». Ni `createReplyNotification` ni
`createMentionNotification` ne portaient cette garde : un message rappelé poussait
son texte ORIGINAL vers la personne à qui l'on répond et vers tous les mentionnés,
pendant que les membres ordinaires du fil étaient protégés.

Le balayage de rétraction de l'éventail ne rattrape pas ce cas : il ferme la BASE,
la bannière est déjà sur l'ÉCRAN.

## La leçon (§ 280)

> **Une garde qui protège la population la plus NOMBREUSE peut manquer la plus
> EXPOSÉE.** Le lot `regular` sert les membres passifs du fil ; la réponse sert la
> personne visée, et la mention perce jusqu'à la sourdine.

Et la garde était GRATUITE : les trois éventails relisent la même ligne dans la
même fenêtre, `loadMessagePrismSource` passait simplement à côté de `deletedAt` et
`expiresAt`. Deux colonnes sur une lecture qui se faisait déjà.

## Le correctif

- [x] `MessageLiveness` — `live` | `gone` | `unknown` (trois états : `gone` est ce
      qu'une ligne PROUVE, `unknown` ce qu'aucune lecture n'a prouvé)
- [x] `messageLiveness()` — le prédicat, extrait pour qu'il n'existe qu'un site
- [x] `loadMessagePrismSource` élargit son `select` (aucune requête de plus)
- [x] réponse et mention abandonnent sur `gone` ; le batch le fait aussi en tête
- [x] le `select` mort de `viewOnceCount` / `isViewOnce` retiré, avec sa raison

## La conception a changé en cours de route

Le premier correctif traitait une ligne ABSENTE comme une preuve de rappel. Deux
témoins existants sont tombés, dont un explicite (« survit à un message
VOLATILISÉ »). Ils avaient raison, et le dépôt disait déjà pourquoi dans le
balayage de rétraction du même éventail : une ligne absente ne prouve rien, et une
lecture servie par un secondaire en retard rend `null` pour un message vivant.

**La conception a changé, pas la fixture.** La décision est désormais gardée en
POSITIF des deux côtés.

## Gates

- [x] témoins RED d'abord (`replyMentionLivenessGate.test.ts`) — **8 rouges contre `origin/main` / 14 verts après**
- [x] suites voisines — 41 suites, 757 témoins
- [x] `tsc --noEmit` gateway et shared — 0 erreur (code de retour lu SANS pipe)
- [x] non-régression cycles 125 bis / 126 — vertes
- [x] suite gateway complète — **860/860 suites, 19553 témoins**, exit 0 (couverture 95,47 %, identique)

## Revue

Rapport complet : `tasks/realtime-sync-audit-2026-08-24-cycle127.md`.
Leçon : `tasks/lessons.md` § 280. Règle : `services/gateway/CLAUDE.md`.

Suivi laissé ouvert et NON instruit : la fenêtre est rétrécie, pas fermée — la
fermer entièrement demanderait un rappel push (APNs `content-available` +
suppression côté NSE), lot à part touchant les trois clients.
