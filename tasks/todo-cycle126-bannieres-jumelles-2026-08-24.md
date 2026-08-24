# Cycle 126 — l'aperçu composé avait TROIS consommateurs et UN seul câblage

## Le symptôme

Répondre à quelqu'un par un vocal, une photo, une vidéo ou un fichier lui pousse
une bannière au **corps VIDE** — pendant que tous les autres membres de la
conversation reçoivent « 🎤 Message vocal · 0:12 » ou la transcription entière.
Le destinataire le plus directement concerné est le seul à ne rien lire.

## La mesure

`messageNotificationFanOut` COMPOSE un aperçu — un fait du MESSAGE, calculé une
fois :

| valeur composée | `regular` | `reply` | `mentions` |
|---|---|---|---|
| `notificationPreviewForPush` (transcription ⊃ contenu) | ✅ | ❌ `notificationPreview` | ❌ |
| `pushPreviewBasis` (base du Prisme) | ✅ | ❌ `previewBasis` | ❌ |
| `attachmentInfo` (média + étiquettes) | ✅ | ❌ jamais | ❌ |
| `notificationLocKey` (verrou de protection) | ✅ | ❌ jamais | ❌ |
| corps via `buildMessageNotificationBodyI18n` | ✅ | ❌ `content` nu | ❌ |
| `messageCreatedAt` / `messageType` (bulle NSE) | ✅ | ❌ | ❌ |

Un seul des trois consommateurs lit ce que l'éventail a composé. Les deux autres
repartent de la matière brute — et pour un message SANS texte, la matière brute
est la chaîne vide.

## La leçon

Les cycles 121–125 ont posé quatre questions à un résolveur de Prisme :
élit-il le bon rang · qui AFFICHE ce qu'il élit · que transporte-t-il À CÔTÉ ·
le texte reçu a-t-il le droit d'être là. La cinquième :

> **Qui d'AUTRE aurait dû l'afficher ?** Une valeur composée à un endroit et lue
> par un seul de ses consommateurs possibles n'est pas partagée — elle est
> PRIVÉE, et ses jumelles recomposent (mal) la même chose à côté.

Elle ne se pose pas au résolveur mais à la valeur qu'il rend : compter ses
consommateurs POSSIBLES avant ses consommateurs RÉELS.

## Le correctif

Un site de composition, trois consommateurs.

1. `MessageBannerMedia` — le jeu de champs média, nommé une fois, partagé par
   les trois signatures (il n'existait qu'en ligne dans `createMessageNotification`).
2. `messageBannerBody()` — le corps d'une bannière de message (texte servi par
   le Prisme, ou l'étiquette du média quand ce texte est vide, plus les badges
   `+N`). Extrait de `createMessageNotification`, appelé par les trois.
3. `bannerMediaContext()` / `bannerMediaMetadata()` — les projections contexte et
   metadata du média, idem.
4. L'éventail sert le MÊME aperçu composé aux trois lots.
5. `loadMessagePrismSource` rend aussi `createdAt` / `messageType` : la bulle
   pré-enregistrée d'une réponse cesse d'être ordonnée par l'horloge du device.

## Gates

- [x] témoins RED d'abord (`replyMentionBannerMedia.test.ts`) — **19 rouges / 27 verts après**
- [x] suite gateway complète verte — **858/858 suites, 19536 témoins**, exit 0
- [x] `tsc --noEmit` gateway — 0 erreur
- [x] mutation « réponse + mention reviennent à l'aperçu privé » — **9 témoins tombent**
- [x] mutation « le corps de la réponse cesse de se composer » — **3 témoins tombent**
- [x] non-régression : les 15 témoins du cycle 125 + le Prisme du cycle 122 — verts

## Revue

Rapport complet : `tasks/realtime-sync-audit-2026-08-24-cycle126.md`.
Leçon : `tasks/lessons.md` § 277. Règle produit : `CLAUDE.md` § Prisme, cycle 126.

Deux durcissements en effet de bord, non visés mais acquis : réponse et mention
reçoivent enfin `notificationLocKey` (donc le second verrou du cycle 125
s'applique à leur charge) et le `protectedByLocKey` qui manquait à leur
`previewPrismSource` / `prePersistedMessageFields`.
