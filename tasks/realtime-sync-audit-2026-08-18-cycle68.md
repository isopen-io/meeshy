# Cycle 68 — la fonctionnalité du cycle 67 était livrée sur le hook que personne ne rend

**Date** : 2026-08-18
**Branche** : `claude/keen-hamilton-avwri2`
**Périmètre** : web (`hooks/queries/use-reactions-query.ts`, 4 fichiers de
locale, suppression du hook mort `hooks/use-message-reactions.ts`) + 2 types
partagés sans lecteur
**Clients touchés** : web uniquement (gateway, iOS, Android inchangés)

---

## 1. Par quel bout le cycle a pris le carnet

Le cycle 67 léguait dix pistes, dont sept explicitement bloquées sur Xcode ou
sur une mesure de production que cet environnement ne produit pas. Aucune n'a
rendu ce dossier.

Ce qui l'a rendu, c'est la consigne de routine elle-même — *se baser sur le
développement précédent* — appliquée à la lettre : **relire ce que le cycle
précédent a livré**, au lieu de repartir d'une liste. Le dernier commit de
`main` est `a0e0c2ac`, les multi-réactions, mergé le jour même. Il touche quatre
surfaces et son message décrit précisément ce qu'il fait de chacune :

> **WEB** : le hook etait deja multi (`userReactions[]`) — retrait du cap client
> `MAX_REACTIONS_PER_USER=3` et du remap d'erreur serveur disparu (parite
> iOS/Android, aucun cap serveur).

La phrase est vraie. Elle porte seulement sur un fichier que l'application
web ne charge jamais.

---

## 2. Le défaut : le cap a été retiré du hook MORT, et laissé sur le hook VIVANT

Le dépôt porte **deux** hooks de réactions de message côté web :

| fichier | consommateurs en production |
|---|---|
| `apps/web/hooks/use-message-reactions.ts` | **aucun** — seul son propre fichier de tests l'importe |
| `apps/web/hooks/queries/use-reactions-query.ts` | **toutes les surfaces de réaction** |

Les consommateurs du second, énumérés :

```
components/common/bubble-message/BubbleMessageNormalView.tsx
components/common/bubble-message/ReactionSelectionMessageView.tsx
components/common/bubble-message/FocalRow.tsx
components/common/message-reactions.tsx
```

Le commit `a0e0c2ac` a modifié le premier. Le second gardait, intact :

```ts
const MAX_REACTIONS_PER_USER = 3;
…
if (userReactions.length >= MAX_REACTIONS_PER_USER) {
  toast.error(t('maxReactionsReached', { max: MAX_REACTIONS_PER_USER }));
  return false;
}
```

**Conséquence livrée en production** : la fonctionnalité multi-réactions ne
fonctionne pas sur le web au-delà de trois emojis. Le 4e tap ne produit ni ligne
en base ni événement temps réel — il produit un toast d'erreur nommant une
limite que plus AUCUNE règle serveur n'applique. iOS et Android empilent sans
limite ; le web refuse. La clé unique de `Reaction` a été élargie au triplet, la
migration Mongo a été écrite et marquée « à exécuter sur la prod AVANT le
déploiement », et le seul client qui rendait cet index inutile est celui qui ne
lui a jamais envoyé de 4e emoji.

### 2 bis. Ce que le cap coûtait exactement, et où

Le refus est posé **avant l'émission**, dans `addReaction` :

```
tap 4e emoji → userReactions.length >= 3 → toast + return false
                                          ↑ aucun socket.emit
```

Un cap qui refuse avant le transport ne laisse aucune trace côté serveur. C'est
ce qui rend le défaut invisible aux gardes du gateway : les 4 témoins de
`ReactionService.multiReaction` sont verts, la clé triple fonctionne, et rien
dans le gateway ne peut observer qu'un client ne lui parle pas.

**Le témoin qui gelait le défaut existait, et il était vert.** `Max Reactions
Limit › should prevent adding more than max reactions` affirmait `success ===
false` sur la 4e réaction — c'est-à-dire le défaut lui-même, écrit comme une
exigence. Même forme qu'au cycle 67 § 4 bis : un témoin qui épingle un défaut ne
se trouve pas en cherchant le nom de la fonctionnalité, il se trouve en lisant
ce que le site VIVANT affirme.

### 2 ter. Le second résidu : un remap vers une erreur qui n'existe plus

La branche `onError` du hook vivant traduisait encore l'erreur serveur :

```ts
if (errorMessage.includes('Maximum') && errorMessage.includes('different reactions')) {
  toast.error(t('maxReactionsReached', { max: MAX_REACTIONS_PER_USER }));
}
```

`ReactionService.addReaction` n'émet plus cette phrase — elle ne subsiste que
chez `PostReactionService` et `CommentReactionService`, qui gardent leur
`MAX_REACTIONS_PER_USER = 1` et que ce hook ne sert pas. Le remap ne pouvait
donc plus que MENTIR : toute erreur serveur future contenant ces deux mots
serait présentée à l'utilisateur comme une limite de réactions inexistante.

---

## 3. Ce qui a été livré

Le hook vivant rejoint son jumeau mort, sur les trois moitiés du geste :

1. **Le cap** — supprimé. Commentaire posé à sa place qui nomme la règle serveur
   (clé unique triple, `addReaction` additif) plutôt que de la sous-entendre.
2. **Le remap** — supprimé. L'erreur serveur remonte VERBATIM.
3. **La traduction devenue orpheline** — `maxReactionsReached` retirée des
   quatre locales (`en`, `es`, `fr`, `pt`). C'était son unique lectrice une fois
   le hook mort écarté ; la laisser aurait fait croire à une limite documentée.

`useI18n` disparaît du hook avec elle : il ne traduisait plus rien.

**Le cap d'AFFICHAGE n'est pas touché.** `message-reactions.tsx` borne le nombre
de pastilles rendues (`maxVisibleReactions`) — c'est une décision de mise en
page, agrégée par emoji sur TOUS les participants, sans rapport avec le nombre
d'emojis qu'un participant peut poser. Le confondre avec le cap d'écriture
aurait élargi le correctif à une surface saine.

---

## 4. Les gardes, et laquelle compte

`apps/web/__tests__/hooks/queries/use-reactions-query.test.tsx` :

| Garde | Ce qu'elle affirme |
|-------|--------------------|
| empilement | la 4e réaction entre dans `userReactions`, sans toast |
| **transport** | **la 4e réaction est ÉMISE au serveur** |
| erreur verbatim | l'erreur serveur remonte telle quelle, plus aucun remap |

**La deuxième est celle qui a de la valeur.** La première décrit l'état du cache
React Query et resterait verte si un futur cap refusait après l'émission
optimiste puis rollbackait — elle ne distingue pas « accepté » de « accepté puis
défait ». La seconde nomme le fait qui manquait vraiment : le serveur
multi-réactions était **inatteignable** depuis le web, et c'est l'absence
d'émission, pas l'état de l'écran, qui le disait.

**ROUGE prouvé avant livraison**, et chacune pour sa propre cause :

```
● stacks a 4th distinct emoji instead of refusing it
    Expected: true      Received: false          ← le cap local
● reaches the server instead of refusing locally
    Expected: "reaction:add", {emoji: "😀"}, …   ← aucune émission du tout
● surfaces the server error VERBATIM
    Expected: "Maximum 3 different reactions per user"
    Received: "Maximum 3 reactions reached"      ← le remap
```

### 4 bis. Le vert intermédiaire qui n'en était pas un

Le retrait du cap laissait `t` dans le tableau de dépendances du `useCallback`
qui l'utilisait. `tsc` ne l'a pas vu (le fichier est propre, mais le projet web
porte 1 264 erreurs préexistantes dans ses fichiers de test, et la lecture
globale ne discrimine pas) — **la suite l'a vu, et immédiatement** :

```
ReferenceError: t is not defined
  515 |   }, [enabled, messageId, isPersisted, userReactions, addMutation, t]);
```

Ce n'est pas un détail de nettoyage : le tableau de dépendances est évalué à
CHAQUE rendu. Livré, il aurait fait planter toute bulle de message montée. Un
retrait de variable qui traverse un `useCallback` a deux sites, et le second ne
ressemble pas à une utilisation.

---

## 5. Vérification

| Gate | Résultat |
|------|----------|
| Suite `use-reactions-query` | ✅ **77/77** (76 avant, +2 gardes, 1 témoin réécrit) |
| Suite web complète | ✅ **692/692 suites, 13 453 témoins** verts |
| Seuils de couverture web (`lines: 42`) | ✅ **60,21 %** lignes, 52,11 % branches, 56,22 % fonctions |
| `tsc` gateway/shared | ✅ 0 erreur |
| Validité JSON des 4 locales | ✅ |
| Gateway / iOS / Android | **aucun changement** |

**Prérequis d'environnement, à ne pas lire comme une régression** : 26 suites
web échouent à se CHARGER tant que `packages/shared/dist` n'est pas bâti
(`Could not locate module @meeshy/shared/utils/sender-identity`). C'est le
`moduleNameMapper` qui pointe vers `dist`, documenté dans `CLAUDE.md`. Le
`bun run build` du paquet partagé les rend toutes vertes.

---

## 5 bis. La mesure a contredit la raison de différer — et le second incrément a suivi

Ce dossier a d'abord été rendu SANS supprimer le hook mort, avec cette
justification : « un retrait de fichier intégralement couvert tire la couverture
globale vers le bas, et `jest.config.js` porte un seuil CI (`lines: 42`) ».

La phrase était prudente et **fausse**. Mesurée, la couverture web est à
**60,21 %** de lignes — dix-huit points au-dessus du seuil. Retirer 413 lignes
couvertes d'un total de 48 937 la déplace de moins d'un quart de point.

`apps/web/hooks/use-message-reactions.ts` (413 lignes) et son fichier de témoins
(693 lignes) sont donc supprimés, ainsi que les deux interfaces
`UseMessageReactions*` de `packages/shared/types/reaction.ts` — **sans lecteur,
pas même le hook** : il redéclarait localement les deux mêmes formes.

> Une raison de ne PAS faire quelque chose est une affirmation comme une autre.
> Celle-ci portait sur un chiffre, elle a coûté une commande à vérifier, et elle
> ne tenait pas. « À instruire avec la mesure » ne vaut que si la mesure est
> effectivement prise — sinon c'est une intuition qui a emprunté le vocabulaire
> de la rigueur.

---

## 6. Pistes pour le cycle 69

Les dix pistes du cycle 67 restent ouvertes telles quelles (sept bloquées sur
Xcode ou sur une mesure de production). S'y ajoutent celles que ce cycle a
instruites sans les livrer :

1. **LIVRÉE — `apps/web/hooks/use-message-reactions.ts` supprimé** (§ 5 bis).
   C'était la cause racine de ce cycle : un correctif s'est posé dessus parce
   qu'il porte le nom de la fonctionnalité. La classe est refermée pour les
   réactions de message.

   **Mais il n'était pas seul.** Un balayage de `apps/web/hooks/*.ts`, vérifié DEUX
   fois (par chemin d'import `@/hooks/<nom>` puis par symbole exporté, hors
   `__tests__` et hors barrel `hooks/index.ts`), rend au moins six autres hooks
   à zéro consommateur :

   | hook | symboles | consommateurs |
   |---|---|---|
   | ~~`use-message-reactions.ts`~~ | `useMessageReactions` | **0** — supprimé ici |
   | `use-app-badge.ts` | `useAppBadge`, `useAppBadgeControl` | **0** |
   | `use-encryption.ts` | `useEncryption` | **0** |
   | `use-long-press.ts` | `useLongPress` | **0** |
   | `use-network-status.ts` | `useNetworkStatus` | **0** |
   | `useThrottle.ts` | `useThrottle`, `useThrottledCallback` | **0** |

   Le balayage n'est PAS exhaustif (il ne suit ni les ré-exports du barrel ni
   les imports relatifs) et plusieurs de ces noms — `useEncryption`,
   `useNetworkStatus` — désignent des sujets où un jumeau vivant existe très
   probablement ailleurs. C'est exactement la population qui produit le défaut
   de ce cycle : le prochain correctif de chiffrement ou de statut réseau a une
   chance non nulle d'atterrir sur le fichier qui porte le nom.
2. **La question qui a produit ce cycle, et qui n'est pas épuisée** :
   *le correctif s'est-il posé sur le site que la production CHARGE ?* Elle se
   passe sur tout couple de fichiers dont l'un porte le nom de la fonctionnalité
   et l'autre le trafic. Le dépôt en a d'autres candidats (`hooks/` vs
   `hooks/queries/`), non balayés.
3. **Non livrée — la notification de réaction et sa rétractation ne
   s'identifient pas de la même façon.** `shouldCreateReactionNotification`
   throttle par PAIRE (réacteur → auteur) ; `retractReactionNotifications`
   supprime par (acteur × message × emoji). Depuis les multi-réactions, un même
   réacteur tient plusieurs emojis sur un message : retirer celui qui avait
   produit la ligne efface la seule notification, alors que les emojis restants
   demeurent — l'auteur perd l'annonce de réactions vivantes. Sous le modèle
   1-par-participant, la fenêtre n'existait pas. Le correctif juste n'est PAS
   évident (rétracter moins ? agréger les emojis dans une ligne unique, comme
   iMessage ?) : c'est une décision produit sur la forme de la notification, à
   porter à l'équipe plutôt qu'à trancher unilatéralement.
4. **Non livrée — le nombre d'emojis distincts par participant et par message
   n'a plus AUCUNE borne.** Avant le 2026-08-18, la clé unique
   `(messageId, participantId)` en imposait une : 1. Le cap client web valait 3.
   Les deux ont disparu le même jour et rien ne les remplace côté serveur ; seul
   le débit est borné (`REACTION_ADD` : 30/min). Un participant peut donc
   empiler tout l'alphabet emoji valide sur un message — chaque ligne diffusée à
   la room et comptée dans le `reactionSummary` dénormalisé que chaque `GET`
   de message transporte. **Ce n'est délibérément pas corrigé ici** : le commit
   `a0e0c2ac` écrit « aucun cap serveur » comme une décision, feu vert
   utilisateur du 2026-08-16, et un plafond est un arbitrage produit — pas un
   défaut à renverser unilatéralement deux jours plus tard.
5. **Non livrée — `ReactionService.getMessageReactions` est en O(n²)** sur le
   nombre de réactions d'un message (`reactions.find(...)` dans un `.map(...)`).
   Antérieur aux multi-réactions, mais son domaine vient de s'élargir avec le
   point 4. Soumis à « mesurer avant de trancher ».
