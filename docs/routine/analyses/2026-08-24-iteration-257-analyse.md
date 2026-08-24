# Analyse — Itération 257 : le Prisme des bannières de MENTION et de RÉPONSE ne descendait AUCUN rang

## Protocole (démarrage)

`main` @ `2668767f` (dernier commit : *cycle 121 — la bannière de notification ne
descendait que le rang 1*). Branche `claude/brave-archimedes-uhflz9` alignée sur
`origin/main` au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Setup parité : `bun install --ignore-scripts`
(3861 paquets), puis `npx prisma generate --generator client` + `bun run build`
dans `packages/shared`.

**Audit anti-doublon** : aucune PR ouverte au départ, aucune n'écrit sur
`services/gateway/src/services/notifications/NotificationService.ts` — zéro
chevauchement de fichier.

## Sélection : **Priorité 1 — suivi MESURÉ (leçon 107) du cycle 121**

Le cycle 121 a corrigé `createMessageNotification` pour DESCENDRE les rangs du
Prisme. Il a explicitement **laissé ouvert** — avec sa raison écrite, gelée dans
`services/gateway/CLAUDE.md` — le suivi de ses deux jumelles :

> Deux des trois éventails de `messageNotificationFanOut` n'appliquent **aucun**
> Prisme : `createReplyNotification` et `createMentionNotification` posent
> `content: params.messagePreview` — l'original — et ne poussent ni
> `translatedContent` ni `translatedLanguage`. Vérifié en ouvrant les deux
> méthodes, pas déduit de la forme du lot. Défaut DISTINCT (absence du Prisme,
> pas un mauvais rang), et c'est pourquoi il n'a pas été absorbé ici : deux
> éventails aux sémantiques de garde différentes dans le même lot, c'est le
> demi-correctif que le cycle 120 recommande précisément d'éviter — corriger le
> résolveur pour tous, câbler les surfaces une par une. **Le résolveur est
> partagé et juste ; il ne manque que la liste en entrée.**

Ce lot câble ces DEUX surfaces.

## Current state (avant correctif)

Trois éventails partent de `messageNotificationFanOut` (un message qui répond +
mentionne + arrive à des tiers), et un seul appliquait le Prisme :

| éventail | méthode | traduction poussée avant ce lot |
|---|---|---|
| destinataires réguliers | `createMessageNotification` (cycle 121) | **oui**, Prisme complet |
| auteur du message cité | `createReplyNotification` | **non** — original figé |
| personnes mentionnées | `createMentionNotification` (via `createMentionNotificationsBatch`) | **non** — original figé |

Les deux méthodes fautives se contentaient de :

```ts
return this.createNotification({
  content: params.messagePreview,     // L'ORIGINAL — jamais recalculé
  context: {
    conversationId, conversationTitle, conversationType, messageId,
    // AUCUN translatedContent, AUCUN translatedLanguage
  },
  ...
});
```

Aucune lecture de `Message.translations`, aucun appel à
`resolvePrismTranslation`, aucun `translatedContent` sur le fil APNs/FCM.

## Problems identified

1. **Un défaut de PARITÉ à l'intérieur du MÊME éventail.** Sur un message qui à
   la fois répond ET mentionne ET arrive à des tiers, les trois catégories de
   destinataire reçoivent trois traitements différents alors que la règle est
   la même : le contenu descend le Prisme du LECTEUR. La bannière du
   destinataire régulier arrivait en français ; la bannière de l'auteur cité et
   des personnes mentionnées arrivait en anglais.

2. **Une bannière et une ligne de liste qui divergent sur le même écran.**
   `resolveLastMessagePreview` (aperçu de liste, cycle 118) DESCEND depuis six
   cycles ; les deux bannières fautives restaient sur l'ORIGINAL. Le lecteur
   voyait donc deux textes pour un même message, à quelques secondes
   d'intervalle.

3. **Un helper qui allait naître pour la 3e fois.** Le couple filtre-chiffré +
   descente aurait été écrit une troisième fois dans le même fichier, à la
   main. C'est exactement la JUMELLE que `services/gateway/CLAUDE.md` interdit
   de créer — trois copies gardées à la vigilance dériveraient au premier `>`
   transformé en `>=`, ou au premier oubli du filtre chiffré.

## Root causes

Le cycle 121 a POSÉ le patron de descente pour `createMessageNotification` et
l'a documenté comme suivi mesuré. Les deux jumelles restaient hors du patron
parce que le lot 121 refusait explicitement le demi-correctif « deux éventails
aux sémantiques de garde différentes dans le même lot » (règle du cycle 120 :
corriger le résolveur pour tous, câbler les surfaces une par une). Le résolveur
`resolvePrismTranslation` était déjà partagé et juste ; il ne manquait que sa
mise en entrée dans ces deux méthodes.

## Business impact

Toute conversation multilingue avec mention ou fil de réponse. Une équipe où
l'un travaille en français et l'autre écrit en anglais : la ligne de liste de
la conversation affichait « Bonjour, tu as vu la doc ? » (traduit), mais la
bannière push disait « Hi, did you see the doc? » (original). Le lecteur
recevait donc systématiquement une notification illisible, corrigée quelques
secondes plus tard par l'ouverture de la conversation.

## Technical impact

- **Un nouveau helper privé** `_resolveNotificationTranslation` sur
  `NotificationService` — le couple filtre-chiffré + descente, DÉFINI UNE SEULE
  FOIS et consommé par les TROIS créateurs de notification de message.
  `createMessageNotification` (cycle 121) migre dessus dans le même lot : trois
  appelants dès le premier commit, zéro code mort.
- **`createMentionNotification`** : refetch minimal
  `select: { translations, originalLanguage }` en parallèle des lectures user +
  conversation, appel du helper, ajout conditionnel de `translatedContent` /
  `translatedLanguage` sur `context`. Passage aussi de `lang: recipientLang`
  pour geler la langue de cadrage (jamais la clé de contenu).
- **`createReplyNotification`** : idem.
- **`tsc --noEmit` (gateway) : exit 0.** Types inchangés.
- **Aucun changement de contrat sortant.** Les champs `translatedContent` et
  `translatedLanguage` sont **déjà déclarés** sur `NotificationContext` (cycle
  121 les a ajoutés pour `createMessageNotification`) et déjà propagés à la
  charge push par `createNotification`. Le fil APNs/FCM ne voit que la valeur
  qui apparaît maintenant sur deux types de notification supplémentaires.

## Risk assessment

- **Faible.** Le patron est celui du cycle 121, avec un cycle complet de
  production derrière lui. L'ajout est purement additif côté fil : sans
  traduction Prisme-servable, `matchedTranslation` est `null` et le
  comportement historique est préservé mot pour mot (`content` = `messagePreview`).
- **Extension de garde** : le refetch minimal ajoute une lecture Prisma par
  destinataire (~1 requête par mention/réponse). Coût négligeable — mentions
  plafonnées à 50/message, réponse à 1. `createMessageNotification` refetche
  déjà par destinataire régulier depuis le cycle 121, sans problème.
- **Rollback** : revert du fichier et suppression des deux fichiers de tests.
  Atomique.

## Proposed improvements

1. **RED** : `mentionNotificationPrism.test.ts` (7 tests) et
   `replyNotificationPrism.test.ts` (7 tests) — calqués sur
   `messageNotificationPrism.test.ts` (cycle 121). Les témoins assertent sur la
   charge REMISE à APNs (`pushService.sendToUser`), jamais sur un calcul
   intermédiaire.
2. **GREEN** : helper `_resolveNotificationTranslation` +
   rebranchement des trois méthodes (`createMessageNotification` en jumelle).
3. **Validation** : suites Prism (23/23), `NotificationService.test.ts`
   (18/18), `messageNotificationFanOut.test.ts` (44/44),
   `NotificationService.anonymousActor.test.ts` (5/5),
   `NotificationService.collapseId.test.ts` (4/4). Régression complète
   notification (261/261).

## Expected benefits

- Parité de bannière push sur les TROIS éventails de la même fan-out. Le
  destinataire régulier, l'auteur du message cité et la personne mentionnée
  reçoivent la même règle : le contenu servi est dans la langue du LECTEUR.
- Cohérence bannière ↔ ligne de liste sur le même écran (les deux consomment
  désormais le même patron de descente).
- **Une seule source pour la descente Prisme sur les notifications** — trois
  appelants, un helper. La règle « Cette entité a-t-elle une JUMELLE ? » est
  refermée sur ce fichier.

## Implementation complexity

- **Faible.** 1 fichier modifié (`NotificationService.ts`, +67 lignes / -25),
  2 fichiers de tests (~200 lignes chacun, patron reproduit de cycle 121).

## Validation criteria

- [x] RED prouvé : 10 tests neufs tombent avant le correctif (les 4 tests
      négatifs, où aucune traduction ne devait être poussée, passent
      trivialement — c'est attendu, le code d'avant ne pousse jamais).
- [x] GREEN : mention 7/7, reply 7/7, message 9/9 (jumelle préservée).
- [x] Régression notification complète : **261/261** (18 suites jest).
- [x] `bun run tsc --noEmit` (gateway) : exit 0.
- [ ] CI verte sur la PR (gate lint/bun réel).

## Améliorations futures (hors périmètre)

- **Parité race guard.** `createMessageNotification` porte la garde
  `deletedAt`/`expiresAt`/`isViewOnce` documentée au cycle 121. Les deux
  jumelles ne la portent pas, et gardent le comportement historique
  (« notifier même si le message a disparu entre-temps »). C'est un vrai défaut
  latent, mais son correctif change le comportement de fire — un cycle à part,
  avec ses propres témoins.
- **Pré-fetch dans le batch de mentions.** `createMentionNotificationsBatch`
  itère et refetche par personne mentionnée (jusqu'à 50 refetches). Refetcher
  UNE fois en tête de batch et threader la charge à chaque per-user économise
  N-1 lectures. Coût négligeable, mais optimisation légitime — un cycle à part
  avec un contrat de paramètre optionnel.
- **Notifications sociales (réactions, commentaires, likes).** Elles servent
  déjà un excerpt localisé (`notificationString(lang, 'post.reaction', ...)`)
  ou l'excerpt du contenu réagi. Le Prisme y aurait un rôle plus subtil (le
  contenu original du post/story/reel plutôt que la réaction elle-même) —
  cycle à part si mesuré.
