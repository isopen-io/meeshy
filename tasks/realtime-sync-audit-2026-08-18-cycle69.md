# Cycle 69 — la clôture committait avant ce qui la rend cohérente, et la promotion s'annonçait avant d'être vraie

**Date** : 2026-08-18
**Branche** : `claude/keen-hamilton-dmo6cf`
**Périmètre** : gateway (`routes/conversations/leave.ts`, `routes/conversations/delete-for-me.ts`)
**Clients touchés** : aucun (aucun nom d'événement, aucune charge utile modifiés)

---

## 1. D'où vient ce cycle

Le cycle 67 a livré `closedAt`/`closedBy` dans `leave.ts` et laissé **onze**
pistes. La onzième était nommée, non livrée, et portait sa propre excuse :

> **l'ordre d'écriture de `leave.ts` reste inversé par rapport à son jumeau.** La
> clôture commit AVANT la mise à `isActive: false` de l'appelant ; si la seconde
> échoue, la conversation est fermée alors que la réponse HTTP est un 500 qui nie
> l'opération. […] Corriger demande de savoir ce que le client doit croire après
> un 500, ce qui dépasse le périmètre d'un correctif de clôture.

**L'excuse était le défaut.** La question « que doit croire le client après un
500 ? » n'a pas besoin d'être tranchée : elle n'a lieu d'être que parce que les
deux écritures peuvent atterrir séparément. Les fusionner ne choisit pas une
meilleure réponse — **il supprime la question**, et un 500 redevient ce qu'il
prétend être : rien ne s'est passé.

C'est mot pour mot l'argument que la PR concurrente #3204 (cycle 68) tient sur la
famille SUPPRESSION DE MESSAGE. Ce cycle-ci le tient sur la famille CLÔTURE DE
CONVERSATION — deux fichiers disjoints, aucun recoupement de diff.

---

## 2. Le défaut, en deux moitiés

### 2.1 `leave.ts` — la clôture commit seule

```ts
const closed = await prisma.conversation.update({          // ← DÉFINITIF
  data: { isActive: false, closedAt: now, closedBy: userId },
})
await prisma.participant.update({                          // ← peut échouer
  data: { isActive: false, leftAt: now },
})
```

Si la seconde n'a pas lieu :

- la conversation est **fermée pour tout le monde**, et rien ne la rouvre ;
- l'appelant reste un participant **ACTIF** d'un fil terminal ;
- la réponse HTTP est un **500 qui nie l'opération** ;
- **aucune annonce ne part** — le bloc socket est plus bas, et il n'est jamais
  atteint. Ni le direct ni la réponse ne disent ce qui vient d'être écrit.

Le rattrapage sauve partiellement la mise (`closedAt` est écrit, donc le
tombstone existe), et un réessai de `/leave` converge. C'est ce qui rend le
défaut **peu spectaculaire et parfaitement réel** : il n'a pas de symptôme à
rapporter, ce qui est exactement la raison pour laquelle il a passé trente-huit
cycles.

### 2.2 `delete-for-me.ts` — la même fracture, plus une annonce prématurée

Les trois branches créateur portaient la même forme à deux écritures. Mais la
branche SUCCESSEUR faisait pire : elle **annonçait** au milieu du geste.

```ts
await prisma.participant.update({ data: { role: 'creator' } })  // promotion
io.to(ROOMS.conversation(id)).emit(PARTICIPANT_ROLE_UPDATED, …) // ← ANNONCE
await prisma.participant.update({ … })                          // ← peut échouer
```

Si la dernière échoue :

- le successeur est créateur, **tout le fil l'a appris**, et le 500 le dément ;
- l'ancien créateur **reste en place à côté de lui** — deux créateurs ;
- un réessai relit `findFirst({ role: 'moderator' })`, ne trouve plus le promu
  (il est `creator` désormais) et **en promeut un troisième**.

### 2.3 Ce qui rend cette moitié particulière : le fichier énonçait la règle qu'il violait

Vingt lignes au-dessus de l'émission fautive, en toutes lettres :

> Les deux branches ci-dessous ferment la conversation POUR TOUT LE MONDE. Elles
> ne s'annoncent pas elles-mêmes : la diffusion attend que TOUTES les écritures
> soient committées — **un `conversation:closed` émis ici, suivi d'un échec du
> masquage de l'appelant, laisserait les autres tenir une clôture que la réponse
> HTTP vient de nier.**

La règle est exacte, elle est écrite, elle a été appliquée aux deux branches de
CLÔTURE — et la troisième branche, à quinze lignes de là, émettait au milieu du
geste. **Le commentaire décrivait le périmètre du cycle qui l'a écrit, pas le
fichier qui l'héberge.** C'est la Leçon 235 (cycle 68) rencontrée
indépendamment sur un autre fichier le même jour, ce qui est en soi un résultat :
la forme est générale.

---

## 3. Ce qui a été livré

Les deux routes committent chaque geste en **UNE** transaction
(`prisma.$transaction`, forme tableau — idiome déjà porté par
`routes/me/delete-account.ts` sur deux modèles distincts) :

| route | branche | écritures fusionnées |
|---|---|---|
| `leave` | créateur seul | clôture + départ |
| `delete-for-me` | DM vide | clôture + masquage |
| `delete-for-me` | successeur | promotion + masquage |
| `delete-for-me` | dernier membre | clôture + masquage |

Et `PARTICIPANT_ROLE_UPDATED` **rejoint le bloc socket**, après toutes les
écritures, avec les deux autres annonces.

### 3.1 Ce qui n'a PAS changé, délibérément

- **L'ordre DANS la transaction.** La clôture s'exécute en premier : son
  `include` ramène l'audience, où l'appelant est encore actif. Sémantique
  identique à l'avant.
- **La room de `PARTICIPANT_ROLE_UPDATED`** reste la seule room de conversation.
  La clôture, elle, passe par les rooms personnelles — la différence est
  justifiée : le cycle 67 a **vérifié plutôt que déduit** qu'aucune ligne de
  liste ne rend un rang.
- **Le départ d'un simple membre** reste une écriture seule. Il n'a aucune
  jumelle à accorder, et l'envelopper serait de la cérémonie.

---

## 4. Les gardes, et laquelle compte

Cinq, dans `conversation-leave-ban-delete-stats.test.ts` :

| Garde | Ce qu'elle affirme |
|-------|--------------------|
| transaction (`leave`) | clôture et départ sont les DEUX opérations d'UNE transaction, aucune dehors |
| contre-épreuve | un simple membre qui part n'ouvre AUCUNE transaction |
| transaction (`delete-for-me`) | promotion et masquage idem, dans cet ordre |
| **annonce** | **une écriture qui échoue n'annonce AUCUN transfert d'ownership** |
| parité | les DEUX routes de clôture committent la MÊME forme |

**La quatrième est celle qui a de la valeur.** Les trois premières décrivent une
FORME (une transaction, deux opérations) et un refactor peut la satisfaire en
perdant la propriété. Celle-ci ne nomme ni la transaction ni l'ordre des lignes :
elle fait échouer l'écriture et exige le silence. Elle tombe sur toute forme qui
annonce avant de durer.

La cinquième existe pour la raison du cycle 67 § 4 : les gardes écrites côté
`leave` resteraient VERTES si `delete-for-me` repassait demain à deux écritures.

### 4.1 ROUGE prouvé avant livraison

Les deux fichiers de production remis à leur état d'avant (`git stash`), les
doubles de test inchangés :

```
● committe la clôture et le départ dans UNE transaction, sans écriture isolée
● n'annonce AUCUN transfert d'ownership quand l'écriture échoue
● committe la promotion du successeur et le masquage de l'appelant dans UNE transaction
● les DEUX routes de clôture committent leur geste ATOMIQUEMENT

Tests: 4 failed, 59 passed, 63 total
```

La contre-épreuve reste verte des deux côtés — c'est sa fonction : elle borne la
correction, elle ne détecte pas le défaut.

### 4.2 Aucun témoin existant n'a été réécrit — et c'est une information

Les 105 témoins des **cinq** fichiers qui couvrent ces deux routes passent sans
qu'une seule assertion soit touchée. Aucun ne pinnait la forme d'écriture.
**Le défaut n'a pas survécu à un témoin : il a survécu à leur absence** — même
constat que #3204 sur sa propre famille.

Les cinq fabriques de doubles gagnent `$transaction`. Les avoir toutes cherchées
d'emblée est la Leçon 233 appliquée : le cycle 67 avait découvert son second
fichier de témoins par accident, en lançant la suite large après le vert du
fichier ciblé.

---

## 5. Vérification

| Gate | Résultat |
|------|----------|
| `tsc --noEmit` gateway | ✅ 0 erreur |
| Les 5 suites des deux routes | ✅ **110/110** (105 avant, +5 gardes) |
| Suite gateway complète | ✅ (voir § 5 de la PR) |
| Clients (web / iOS / Android) | **aucun changement** |

---

## 6. Pistes pour le cycle 70

Les pistes 1 à 9 du cycle 67 restent **intactes** et ne sont pas répétées ici —
la plupart sont bloquées sur Xcode ou sur une mesure de production que cet
environnement ne produit pas.

Nouvelles :

1. **`conversationWriteAdmission` lit toujours DEUX colonnes**, et doit
   continuer : les lignes fermées par l'ancien `leave.ts` (avant cycle 67)
   existent en base sans `closedAt`, et rien ne les rétro-remplit. À ne pas
   « simplifier ».
2. **La garde `otherActiveCount === 0` de `leave.ts` reste lue hors
   transaction.** La fenêtre nommée au cycle 67 § 2 ter (un ajout de participant
   qui commit entre le `count` et l'écriture) n'est pas fermée par ce cycle —
   elle demande de déplacer le `count` DANS la transaction, ce que la forme
   tableau ne permet pas. Demande la forme interactive, et une mesure du coût.
3. **Non livrée, portée à l'équipe (héritée du cycle 67 § 10)** : `leave.ts`
   refuse au créateur de partir en laissant des membres actifs, `delete-for-me.ts`
   lui accorde un transfert automatique. La seconde route contourne la règle que
   la première fait respecter. **Décision PRODUIT**, pas un défaut à corriger
   unilatéralement.
4. **La famille « deux écritures pour un geste » n'est PAS épuisée.** Ce cycle a
   balayé la clôture de conversation, #3204 la suppression de message. Restent à
   instruire : `ban.ts` (passe déjà par une unité partagée typée — probablement
   sain), et les écrivains de `Participant` hors de ces routes.
