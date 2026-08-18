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

`ReactionService.addReaction` n'émet plus cette phrase. Elle subsistait encore
chez `PostReactionService` et `CommentReactionService` au moment où ce cycle a
commencé — **et elle n'y est plus non plus** : `5cd0e509`, arrivé sur `main`
pendant ce cycle, a étendu les multi-réactions aux pièces jointes, aux posts et
aux commentaires, supprimant leurs deux caps applicatifs. Le remap visait donc
une erreur que PLUS AUCUN service n'émet, et il ne pouvait plus que MENTIR :
toute erreur serveur future contenant ces deux mots serait présentée à
l'utilisateur comme une limite de réactions inexistante.

---

## 2 quater. Le MÊME commit avait laissé `main` ROUGE, et sa note de vérification dit pourquoi

Le CI de cette PR a rendu `Test gateway` en échec — **7 témoins**, sur un
périmètre que cette branche ne touche pas (aucun fichier gateway dans
`a0e0c2ac..HEAD`). Reproduit à l'identique en local :

```
● ReactionService › addReaction › should upsert on the (messageId, participantId) compound key…
● ReactionService › addReaction › should flag a genuine first-time reaction as changed
● ReactionService › addReaction › should replace the previous reaction when adding a different emoji
● ReactionService › addReaction › should not report a replaced emoji when…
● ReactionService › addReaction › should allow adding same emoji again (returns existing)
● ReactionService › updateMessageReactionSummary › should recompute the full per-emoji summary…
● ReactionService › updateMessageReactionSummary › should call … only once per addReaction
Tests: 7 failed, 18 064 passed
```

`src/__tests__/unit/services/ReactionService.test.ts` interrogeait toujours
`result?.replacedEmojis` — le champ que `a0e0c2ac` a supprimé — et affirmait
toujours l'upsert sur la clé à DEUX champs. **`main` était donc rouge depuis le
merge des multi-réactions**, et cette PR en a simplement hérité.

La cause est écrite noir sur blanc dans la note de vérification du commit
fautif :

> Tests : ReactionService.multiReaction (4, …), **493 verts sur les 5 suites
> gateway touchees** (tests de swap supprimes avec le comportement)

Cinq suites *touchées* — pas la suite. `ReactionService.test.ts` n'a pas été
modifié par le commit, donc il n'était pas dans les cinq ; il testait pourtant
la classe exacte qui changeait. C'est **mot pour mot la leçon du cycle 67 § 4
bis**, écrite deux jours plus tôt et non appliquée :

> Après avoir réécrit un témoin qui épinglait un défaut, **lancer la suite large
> avant de conclure** : les fichiers qui gèlent le même comportement ne partagent
> ni nom, ni harnais, ni convention d'assertion.

Ici ils ne partageaient même pas le fait d'avoir été ouverts.

### 2 quinquies. Ce qui a été fait des sept

Deux témoins **supprimés** — ils décrivaient le swap, comportement qui n'existe
plus, et l'empilement est déjà couvert par `ReactionService.multiReaction.test.ts` :
`should replace the previous reaction…` et `should not report a replaced emoji…`.

Cinq **réécrits**, parce que chacun portait un invariant qui SURVIT au
changement de modèle :

| témoin | l'invariant conservé |
|---|---|
| clé d'upsert | l'écriture reste un upsert atomique — **sur le TRIPLET**, et `update: {}` (écrire l'emoji ressusciterait le swap) |
| `unchanged=false` | `unchanged` est désormais le SEUL discriminant ajout-réel / re-tap |
| même emoji re-posé | le no-op ne réécrit rien et ne diffuse rien |
| recompute autoritaire | le résumé vient d'un `groupBy`, jamais d'un delta |
| une seule relecture | une mutation ⇒ une relecture |

Nettoyés dans la foulée, verts mais périmés : six `replacedEmojis: []` dans les
doubles de `conversation-messages-advanced.test.ts` (un champ absent du type
depuis deux jours, recopié dans des mocks — exactement le motif « une table
recopiée se lit comme une source de vérité »), et le commentaire de
`PostReactionService` qui décrivait `ReactionService.addReaction` par une forme
qu'il n'a plus.

### 2 quinquies bis. Et `main` est reparti ROUGE une seconde fois, par le même mécanisme

Après intégration de `main`, le CI a rendu `Test gateway` en échec **une seconde
fois** — 2 témoins cette fois, dans `AttachmentReactionService.test.ts`, un
fichier que `5cd0e509` a laissé derrière lui exactement comme `a0e0c2ac` avait
laissé `ReactionService.test.ts`.

**La cause n'était pas dans les témoins mais dans leur DOUBLE.** `makePrismaMock`
modélisait encore la clé à deux champs :

```ts
findUnique: … rows.find(r => r.attachmentId === key.attachmentId
  && r.participantId === key.participantId)   // l'emoji n'est jamais comparé
```

Un double qui ignore l'emoji répond « déjà réagi » pour un emoji que le
participant n'a JAMAIS posé — et le service, qui s'y fie pour sa détection de
no-op, cesse d'ajouter quoi que ce soit. Le témoin tombe alors sur le service,
qui est juste ; c'est le décor qui ment.

> Un double de base de données encode une CONTRAINTE. Quand la contrainte change,
> le double est un site de production comme un autre — et il est le seul qui ne
> lève aucune erreur de type en divergeant.

Deux témoins avaient en plus une prémisse INVERSÉE par le nouveau modèle, et
c'est le cas intéressant : leur correction n'est pas mécanique.

| témoin | ce qu'il affirmait | ce qu'il affirme |
|---|---|---|
| `caps at 1 emoji per user per attachment (replaces)` | le cap supprimé | l'empilement — les deux emojis coexistent |
| `never … two rows … racing two different emojis` | deux emojis ⇒ UNE ligne | la garde change de **borne** : deux emojis différents ⇒ deux lignes (le modèle), le doublon du **même** emoji reste impossible |
| `reports changed=true when swapping` | un remplacement | un AJOUT — même résultat attendu, raison opposée, et ❤️ reste en place |

La deuxième mérite qu'on s'y arrête : la réponse paresseuse aurait été de la
supprimer, puisque ce qu'elle affirmait est devenu faux. Mais la course qu'elle
protège existe TOUJOURS — seule sa borne a bougé. Un témoin dont la prémisse
s'inverse se re-borne ; il ne se jette que si le risque lui-même a disparu.

---

## 2 sexies. Le même défaut trouvé DEUX FOIS, en parallèle — et ce qu'il en reste

Pendant que ce cycle instruisait le hook web, `5cd0e509` est arrivé sur `main`
(auteur : jcnm, 07:00 locale) et y a corrigé **le même cap**, dans le même
fichier, avec le même diagnostic :

> WEB : use-reactions-query (variante React Query) perd son cap client de 3 et le
> remap d'erreur « Maximum » (le hook socket avait ete traite dans a0e0c2acc)

Il faut l'écrire sans se draper : **la trouvaille n'était pas exclusive**, et sur
la moitié la plus visible du dossier ce cycle a produit un doublon. La
convergence est en soi une confirmation — deux instructions indépendantes ont
nommé le même fichier et la même cause.

Ce qui RESTE propre à ce cycle après intégration manuelle de `main` :

| apport | présent sur `main` ? |
|---|---|
| cap + remap retirés de `use-reactions-query` | **oui** — doublon, résolu en faveur de `main` |
| **suite gateway réparée** (7 témoins rouges) | **non** — `main` est resté ROUGE |
| **hook mort supprimé** (413 + 693 lignes) | non |
| **2 types partagés sans lecteur** retirés | non |
| **clé de locale orpheline** retirée × 4 | non |
| `useI18n`/`t` morts retirés du hook | non — `main` les a laissés |
| garde de **transport** (la 4e réaction est ÉMISE) | non — `main` fusionne état et émission en un témoin |
| garde d'**erreur verbatim** | non — `main` a supprimé le témoin |

La résolution des trois conflits a suivi une seule règle : **la version qui décrit
le dépôt d'aujourd'hui gagne.** Les commentaires de ce cycle affirmaient que
« seuls Post/Comment gardent leur `MAX_REACTIONS_PER_USER = 1` » — vrai à
l'écriture, faux deux heures plus tard, puisque `5cd0e509` a supprimé ces deux
caps. Ils ont été remplacés par ceux de `main`, corrigés là où `main` gardait
encore une mention de `replacedEmojis`.

> Une trouvaille simultanée ne s'annule pas, elle se déclare. Ce qui aurait
> discrédité ce dossier, ce n'est pas le doublon — c'est de le taire et de
> présenter la partie déjà corrigée comme un apport.

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
| Suite web complète | ✅ **691/691 suites, 13 426 témoins** verts |
| Seuils de couverture web (`lines: 42`) | ✅ **60,17 %** lignes (60,21 % avant le retrait du hook mort : **−0,04 pt**) |
| Suite `ReactionService` gateway | ✅ **77/77** (79 avant, **−2** témoins obsolètes) |
| Suite `AttachmentReactionService` | ✅ **10/10** (9 avant dont 2 rouges, **+1** témoin) |
| **Suite gateway complète** | ✅ **747/747 suites, 18 068 témoins** — **rouge DEUX fois avant** (7 puis 2 en échec, § 2 quater et 2 quinquies bis) |
| `tsc` gateway | ✅ 0 erreur |
| `tsc` shared | ✅ 0 erreur |
| Validité JSON des 4 locales | ✅ |
| iOS / Android | **aucun changement** |

Le delta de témoins gateway se vérifie à l'unité, en deux temps :

| étape | total | verts | rouges |
|---|---|---|---|
| `main` au départ de ce cycle | 18 071 | 18 064 | **7** |
| après les 7 corrections (−2 témoins obsolètes) | 18 069 | 18 069 | 0 |
| après intégration de `main` (`5cd0e509`) | 18 067 | 18 065 | **2** |
| après la correction des PJ (+1 témoin) | **18 068** | **18 068** | 0 |

Aucun témoin n'a été perdu au passage : les trois seuls retirés (2 + 0) le sont
avec le comportement qu'ils décrivaient, et deux ont été ajoutés (1 garde de
transport côté web, 1 garde de deux-lignes côté PJ).

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
