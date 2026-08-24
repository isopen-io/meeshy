# Cycle 122 — les bannières de MENTION et de RÉPONSE ne descendaient AUCUN rang du Prisme

Date : 2026-08-24 · Branche : `claude/brave-archimedes-uhflz9`

## 1. Comment le site a été trouvé

Directement, par le suivi mesuré (leçon 107) que le cycle 121 a écrit et refusé
d'exécuter dans le même lot — règle du cycle 120 (« le résolveur pour tous, les
surfaces une par une »). Le résolveur `resolvePrismTranslation` était là depuis
un cycle, éprouvé sur `createMessageNotification` ; il ne manquait que ses deux
listes d'entrée sur les deux jumelles.

## 2. Le défaut

`services/gateway/src/services/notifications/NotificationService.ts`,
`createReplyNotification:3268` et `createMentionNotification:1703` :

```ts
return this.createNotification({
  content: params.messagePreview,   // L'ORIGINAL — figé depuis l'expéditeur
  context: {
    conversationId, conversationTitle, conversationType, messageId,
    // AUCUN translatedContent, AUCUN translatedLanguage
  },
  ...
});
```

Ni `Message.translations` ni `originalLanguage` n'étaient lus. Aucune traduction
n'atteignait la charge push. La bannière de mention et la bannière de réponse
partaient **toujours dans la langue de l'EXPÉDITEUR**, quelle que soit celle du
lecteur — pendant que `resolveLastMessagePreview` (aperçu de liste, cycle 118)
DESCENDAIT correctement le Prisme pour le MÊME message quelques centimètres plus
bas sur le même écran.

Défaut DISTINCT du cycle 121 (absence du Prisme, pas un mauvais rang).

## 3. Le correctif

Un helper privé unique — `_resolveNotificationTranslation(liveMessage,
recipientPrism)` — qui porte le couple filtre-chiffré + descente, et **trois**
consommateurs dès le premier commit :

- `createMessageNotification` (cycle 121) migre depuis son inline vers le
  helper : trois copies auraient produit la famille que la règle
  « Cette entité a-t-elle une JUMELLE ? » interdit précisément.
- `createMentionNotification` : refetch minimal
  `select: { translations, originalLanguage }` en parallèle des lectures user +
  conversation ; appel du helper ; injection conditionnelle de
  `translatedContent` / `translatedLanguage` sur `context` ; `lang: recipientLang`
  pour figer la langue de CADRAGE (jamais la clé de contenu, cf. corollaire
  cycle 121).
- `createReplyNotification` : idem.

Ce qui SORT sur le fil :

- `content` = `params.messagePreview` (inchangé — c'est le repli si la NSE ne
  tourne pas).
- `context.translatedContent` (≤ 200 chars) + `context.translatedLanguage`,
  quand une traduction servable existe au rang du lecteur. La NSE iOS et les
  clients y basculent le corps rendu.

Ce qui ne change PAS :

- La liste des types de notification qui poussent : mention et réponse
  poussaient déjà, elles poussent avec un champ annexe de plus.
- Le comportement de fire : aucune race guard `deletedAt`/`expiresAt` ajoutée
  (celle de `createMessageNotification` reste explicitement portée par le seul
  chemin qui l'a documentée). Suivi listé pour un cycle à part.
- Le contrat `NotificationContext` : les deux champs y sont **déjà déclarés**
  depuis le cycle 121.

## 4. Le patron, pourquoi il est déjà éprouvé

Une lecture VIVANTE (`liveMessage.translations`), un filtre de servabilité qui
PRÉCÈDE la descente (une entrée chiffrée n'est pas une raison de priver le
lecteur du rang SUIVANT — la NSE déchiffre `encryptedContent`, jamais les
traductions), et la descente elle-même déléguée à `resolvePrismTranslation`
(règle #3 : la langue d'origine concourt à son propre rang).

Le CADRAGE reste au rang 1 (`recipientLang`) — un lecteur dont l'application est
en allemand et l'appareil en portugais reçoit *« Alice vous a envoyé un
message »* en allemand, avec un `translatedContent` en portugais. Deux
résolutions distinctes dans la même méthode, gardées séparées ; les rendre
ensemble depuis `resolveRecipientPrism()` empêche par construction un appelant
de reprendre l'une pour l'autre.

## 5. Les témoins

`services/gateway/src/__tests__/unit/services/notifications/mentionNotificationPrism.test.ts`
et `.../replyNotificationPrism.test.ts` — **14 témoins**, tous sur la charge
**remise à APNs** (`pushService.sendToUser`), jamais sur un calcul intermédiaire.

Patron identique à `messageNotificationPrism.test.ts` (cycle 121), avec les
rôles de la mention / réponse en entrée. Les 3 témoins négatifs par méthode
(règle #3 respectée, aucune traduction ne matche, aucune traduction chiffrée
poussée) gardent le mode d'échec du CORRECTIF : une descente naïve prendrait la
première traduction disponible et servirait « Bonjour » alors que le message est
déjà écrit dans la langue de rang 2 du lecteur.

Rouge prouvé : **10 échecs / 14** avant correctif (les 4 négatifs passent
trivialement — c'est attendu, le code d'avant ne poussait aucune traduction).

Le double `user.findUnique` répond **selon l'id demandé** : mentionneur et
mentionné (resp. auteur du message cité et répondeur) sont deux lectures
distinctes dans ces méthodes, et un double qui rend le même profil aux deux
ferait résoudre le prisme du destinataire depuis les préférences de
l'expéditeur — l'attention de la leçon 261 rejouée.

## 6. Suivi — MESURÉ, pas hérité

Trois chantiers restent listés, tous DISTINCTS de ce défaut :

1. **Parité race guard** entre les trois éventails. `createMessageNotification`
   porte `deletedAt`/`expiresAt`/`isViewOnce`, documenté au cycle 121. Les deux
   jumelles ne la portent pas et gardent le comportement historique (« notifier
   même si le message a disparu entre-temps »). C'est un vrai défaut latent,
   mais son correctif CHANGE le comportement de fire — un cycle à part avec
   ses propres témoins de comportement.
2. **Pré-fetch dans `createMentionNotificationsBatch`**. Le batch itère et
   refetche par personne mentionnée (jusqu'à 50 refetches par message).
   Refetcher UNE fois en tête et threader la charge à chaque per-user économise
   N−1 lectures. Optimisation légitime, cycle à part avec paramètre optionnel.
3. **Notifications sociales** (réactions, commentaires, likes). Elles servent
   déjà un excerpt localisé ou l'excerpt du contenu réagi. Le Prisme y aurait
   un rôle plus subtil (le contenu original du post/story/reel plutôt que la
   réaction elle-même) — cycle à part si mesuré.

## 7. Gates

| gate | résultat |
|---|---|
| `packages/shared` — `bun run build` | 0 erreur |
| `services/gateway` — `tsc --noEmit` | 0 erreur |
| `services/gateway` — 3 suites Prisme | **23/23** (jest) |
| `services/gateway` — régression notification | **261/261** (jest, 21 suites) |
| `services/gateway` — `messageNotificationFanOut.test.ts` | 44/44 (bun) |
| `services/gateway` — `anonymousActor` | 5/5 (bun) |
| `services/gateway` — `collapseId` | 4/4 (bun) |
| `services/gateway` — suite complète | *(à mesurer sur la PR)* |
