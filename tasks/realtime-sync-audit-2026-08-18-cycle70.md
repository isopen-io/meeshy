# Cycle 70 — quatre portes faisaient entrer dans une conversation MORTE

**Date** : 2026-08-18
**Branche** : `claude/keen-hamilton-d62bbs`
**Périmètre** : gateway (`services/conversations/conversationEntryAdmission.ts`,
`routes/conversations/participants.ts`, `routes/conversations/sharing.ts` ×2,
`routes/anonymous.ts`)
**Clients touchés** : aucun (aucun nom d'événement, aucune charge utile modifiés)

---

## 1. D'où vient ce cycle

Le cycle 69 laissait quatre pistes, dont la quatrième : « la famille *deux
écritures pour un geste* n'est PAS épuisée — restent `ban.ts` et les écrivains de
`Participant` hors de ces routes ».

**Elle est épuisée, et le balayage a rendu autre chose.** `ban.ts`,
`unban`, le retrait par un admin et le changement de rang écrivent tous UNE
ligne par geste : rien à fusionner. Mais en énumérant les écrivains de
`Participant`, la question qui compte a changé de forme — non plus *combien
d'écritures ce geste fait-il*, mais **de quel droit ce geste écrit-il**.

Et là, une garde entière manquait.

---

## 2. Le défaut

`services/messaging/conversationWriteAdmission.ts` (règle 1, cycle 31) fait
respecter l'état terminal d'une conversation **à l'ÉCRITURE** : un fil clos
n'accepte plus de messages. Son en-tête cite le schéma :

> « Conversation closed for all — **no one can write**, messages stay readable »

Personne ne le faisait respecter **à l'ENTRÉE**. `resolveConversationEntry` —
l'unité partagée qui répond « que faire de la ligne `Participant` déjà là » —
n'a jamais demandé *« ce conteneur accepte-t-il encore quelqu'un ? »*. Les
QUATRE portes admettaient donc dans une conversation morte :

| porte | ce qu'elle vérifiait | ce qu'elle ne vérifiait pas |
|-------|----------------------|------------------------------|
| `POST /conversations/:id/participants` | la ligne, le rang de l'appelant | le fil |
| `POST /conversations/join/:linkId` | le LIEN : actif, non expiré, sous quota | le fil |
| `POST /conversations/:id/invite` | la ligne, le rang de l'appelant | le fil |
| `POST /anonymous/join/:linkId` | le LIEN : **cinq** vérifications | le fil |

**Ce n'est pas une fenêtre de course, c'est un état permanent.** Aucune des
quatre routes de clôture ne désactive les liens de partage de la conversation
qu'elle ferme : un lien publié survit à son fil, sans date de péremption. La
porte reste ouverte indéfiniment.

### 2.1 Pourquoi personne ne l'a vu

Le même piège que la règle 1 documente pour elle-même, d'un cran plus loin.
`isActive` existe sur DEUX modèles. Les quatre portes en portent une vérification
— et c'est toujours celle du `Participant`, ou celle du `ConversationShareLink`.
Une relecture qui cherche « l'état actif est-il vérifié ? » trouve `isActive`
partout, à chaque porte, et s'arrête.

L'unité partagée a aggravé la chose plutôt que de la révéler : elle a l'air
d'être *le* lieu de la décision d'entrée — son en-tête énumère les trois portes
et raisonne longuement sur qui peut entrer. On lit « la règle, une fois » et on
ne repose pas la question. Elle répondait à une question voisine, celle de la
LIGNE, avec l'autorité de celle du CONTENEUR.

### 2.2 Ce que ça coûtait

Un arrivant admis dans un fil clos reçoit :

- une **notification poussée** (`createAddedToConversationNotification`) ;
- un **`conversation:new`** que les deux clients écrivent dans leur cache
  PERSISTANT (cache disque iOS, `staleTime: Infinity` web) ;
- une **room rejointe** (`joinUserToConversationRoom`) ;
- une ligne `Participant` qui gonfle le `memberCount` diffusé aux membres.

Et il obtient une conversation que `GET /conversations` ne sert **jamais**
(`isActive: true` à la racine du `where`), dans laquelle
`conversationWriteAdmission` refuse **chacun** de ses messages sans qu'aucun
événement n'ait jamais expliqué pourquoi.

**Le rattrapage ne le nettoie pas.** `utils/delta-tombstones.ts` interroge
`closedAt > since` : la clôture est ANTÉRIEURE à l'arrivée, donc antérieure à
tout `since` que ce client puisse présenter. La ligne fantôme survit à chaque
resynchro delta. C'est le cas rare où un tombstone parfaitement correct ne
rattrape rien — **parce que le fait qu'il porte s'est produit avant que son
destinataire existe.**

Pour l'invité anonyme, ce fil est TOUTE la session : il reçoit un jeton pour une
conversation morte et n'a rien d'autre vers quoi se rabattre.

---

## 3. Le correctif

### 3.1 L'unité pose la question qui manquait

`ConversationEntryOutcome` gagne `'closed'`, et la lecture qui le décide est
**PARESSEUSE** — elle n'a lieu que quand la décision ÉCRIRAIT :

```ts
const banned = rows.find(r => r.bannedAt != null)
if (banned) return { outcome: 'banned', participantId: banned.id }

const active = rows.find(r => r.isActive === true)
if (active) return { outcome: 'already-member', participantId: active.id }

// Ici, et seulement ici, la décision ÉCRIRAIT.
const conversation = await prisma.conversation.findUnique({
  where: { id: conversationId },
  select: { isActive: true, closedAt: true },
})
if (isConversationClosed(conversation)) return { outcome: 'closed' }
```

Trois propriétés, et chacune est une décision :

1. **`banned` et `already-member` l'emportent.** Ni l'un ni l'autre n'écrit :
   leur opposer la clôture retirerait une capacité vivante (le refus de sécurité
   perdrait ses mots, l'ack du membre deviendrait une erreur) pour n'empêcher
   rien. Ce cycle ferme une porte, il n'en ferme pas une autre au passage.
2. **La lecture est paresseuse pour une raison mesurable** : la porte du lien
   répond « déjà membre » à CHAQUE réouverture d'un lien connu — le chemin le
   plus fréquenté des quatre. Lui facturer une lecture pour une question sans
   conséquence serait un coût gratuit.
3. **`isConversationClosed` est réutilisé, pas réécrit.** Il lit les DEUX
   colonnes, et ce n'est pas de la ceinture : les conversations fermées par
   l'ancien `leave.ts` (avant cycle 67) portent `isActive: false` sans
   `closedAt`, et rien ne les rétro-remplit.

### 3.2 La quatrième porte n'a pas d'unité, elle a la relation

`POST /anonymous/join/:linkId` ne passe pas par `resolveConversationEntry` — un
invité anonyme n'a pas de ligne `User`, donc pas de paire à arbitrer. Il charge
déjà la conversation par la relation du lien : le `select` gagne `isActive` et
`closedAt`, et la garde s'y pose **sans une requête de plus**.

### 3.3 Le refus se dit en un seul exemplaire

`CONVERSATION_CLOSED_ENTRY_MESSAGE`, même discipline que
`describeConversationWriteRefusal` du côté écriture, et pour la même raison :
quatre routes qui rédigent chacune leur refus le rédigent en quatre dialectes.

Les statuts suivent le dialecte de chaque route : **410** sur les deux portes de
LIEN (à côté de « lien inactif » et « lien expiré » — ce n'est pas un droit qui
manque, c'est une destination qui n'existe plus), **400** sur les deux portes
d'admin (à côté de « déjà membre » — la requête est invalide pour l'état du
conteneur).

---

## 4. ROUGE prouvé avant livraison

Les témoins d'unité, sur la production d'avant :

```
Tests: 6 failed, 19 passed, 25 total
```

Les 19 verts comptent : « `already-member` l'emporte », « `banned` l'emporte »,
« ne lit PAS la conversation quand rien ne s'écrit » passaient DÉJÀ. Ils bornent
le correctif — ils ne détectent pas le défaut, c'est leur fonction.

Les témoins de route, sur les trois portes de l'unité :

```
Tests: 8 failed, 16 passed, 24 total
```

Et sur la quatrième :

```
Tests: 4 failed, 10 passed, 14 total
```

**Le témoin qui compte le plus est celui du `select`.** Un double Prisma rend ce
qu'on lui dit de rendre, `select` ou pas : la garde anonyme aurait été verte sans
que la colonne soit jamais demandée — et en production elle aurait lu
`undefined`, donc « ouverte », donc rien. Le témoin assert le `select` lui-même.

## 4.1 Aucun témoin existant n'a été réécrit — deux fabriques ont gagné une lecture

`participants.test.ts` (12 témoins) et le fichier d'unité ont vu leur double
Prisma gagner `conversation.findUnique`. **Aucune assertion touchée.** Les 257
témoins des huit suites qui couvrent ces quatre routes passent inchangés :
aucun ne pinnait l'admission dans un fil clos, dans un sens ni dans l'autre.
Même constat qu'aux cycles 67 et 69 — **le défaut n'a pas survécu à un témoin,
il a survécu à leur absence.**

---

## 5. Vérification

| Gate | Résultat |
|------|----------|
| `tsc --noEmit` gateway | ✅ 0 erreur |
| Suites des 4 portes + unité (8 fichiers) | ✅ **257/257** (218 avant, +39 gardes) |
| Suite gateway complète | ✅ **747 suites / 18 109 témoins** |
| Clients (web / iOS / Android) | **aucun changement** |

---

## 6. Ce que ce cycle ne corrige PAS, et pourquoi

1. **`AuthService` inscrit tout nouveau compte dans la conversation globale
   `meeshy` sans lire son état.** C'est une cinquième écriture d'entrée, hors de
   la famille : la conversation globale n'est fermée par aucun chemin produit, et
   la garder ouverte est une propriété de plateforme, pas une décision d'entrée.
   Y poser la garde changerait le parcours d'inscription pour un état qui
   n'existe pas. **Nommé, non livré.**
2. **`MessagingService` matérialise une ligne `Participant` depuis la collection
   héritée `ConversationMember`.** Ce n'est pas une entrée mais une MIGRATION :
   la personne était déjà membre. L'en interdire fermerait la lecture de
   l'historique à d'anciens membres légitimes.
3. **Aucune route de clôture ne désactive les liens de partage du fil qu'elle
   ferme.** Ce cycle rend la porte inoffensive ; il ne range pas le lien. Le
   faire est une décision produit (un lien désactivé ne se réactive pas) et
   coûte une écriture de plus dans quatre routes de clôture.

---

## 7. Pistes pour le cycle 71

Les pistes 1 à 3 du cycle 69 restent intactes (dont la fenêtre du `count` hors
transaction dans `leave.ts` — et voir la mise en garde ci-dessous). Nouvelles :

1. **La famille « une garde d'ÉCRITURE sans sa jumelle de LECTURE/ENTRÉE » n'est
   pas épuisée.** Ce cycle a instruit l'entrée dans une conversation. Restent au
   moins : peut-on encore RÉAGIR, ÉDITER, RÉPONDRE dans un fil clos ? Peut-on
   encore créer un lien de partage sur un fil clos (`routes/links/creation.ts`) ?
   `conversationWriteAdmission` n'est câblé que sur le point de convergence des
   messages et les deux chemins de lien.
2. **Mise en garde sur la piste 2 du cycle 69** (déplacer le `count` de
   `leave.ts` DANS la transaction) : sur MongoDB, une transaction offre un
   isolement d'INSTANTANÉ, pas de sérialisation. Un `count` lu dans la
   transaction ne bloque pas un ajout de participant concurrent sur un AUTRE
   document — la fenêtre resterait ouverte et la correction serait illusoire.
   Ce cycle en ferme d'ailleurs le versant le plus large : la porte d'ajout
   refuse désormais un fil déjà clos, ce qui laisse une fenêtre qui n'existe
   qu'entre le `count` et le commit, et non plus indéfiniment après.
3. **Les liens de partage survivent à leur conversation** (§ 6.3) — à porter à
   l'équipe comme décision produit.
