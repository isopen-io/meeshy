# Cycle 68 — la suppression se committait en deux fois, et l'édition du même fichier savait déjà pourquoi il ne faut pas

> **Numéro en « bis ».** Trois passes de cette routine ont tourné en parallèle
> le 2026-08-18 et ont chacune appelé leur travail « cycle 68 ». Celle de
> `claude/keen-hamilton-avwri2` (le hook de réactions mort, PR #3202) a atteint
> `main` la première et garde le nom sans suffixe ; ce dossier prend le « bis ».
> Les deux sont des cycles 68 authentiques et disjoints — l'un sur le web,
> l'autre sur la suppression côté gateway — et aucun ne remplace l'autre.
>
> Le carnet portait déjà cette collision ailleurs (deux « Leçon 234 »). Elle est
> le prix normal du travail concurrent, pas un défaut à corriger : renommer
> suffit, renuméroter en cascade traverserait des branches vivantes.



**Date** : 2026-08-18
**Branche** : `claude/keen-hamilton-sj2y77`
**Périmètre** : gateway (`routes/messages.ts`, `routes/conversations/messages-advanced.ts`) — suppression de message
**Clients touchés** : aucun (aucun contrat modifié)

---

## 1. Par quel bout le cycle a pris le carnet

La Leçon 234 du cycle 67 a nommé une famille de recherche : **les aveux du
dépôt**. Elle a été passée en premier, et son premier candidat a été instruit
puis **écarté** — ce qui vaut d'être écrit, parce que l'écarter était le bon
geste :

> `adapters/node-signal-stores.ts` — « TODO: Replace with database persistence
> for production ». Zéro consommateur dans tout le dépôt : ni la fabrique
> `createNodeSignalStores`, ni aucune des six classes.

Du code mort, en apparence. **Il ne fallait pas le supprimer.** Il appartient à
`dma-interoperability/`, dont les voisins portent des jalons explicites
(`X3DHKeyAgreement.ts` « TODO (Phase 3) », `SignalProtocolEngine.ts` « Phase
3 »), et le chiffrement de production passe ailleurs (`EncryptionService`,
`AttachmentEncryptionService`). C'est de l'échafaudage ÉTAGÉ pour une
fonctionnalité réglementaire, pas un reliquat : son aveu est **exact**, et le
supprimer détruirait un travail en cours.

> Un aveu véridique sur un travail étagé n'est pas une dette. La famille « aveux
> du dépôt » rend des candidats, pas des verdicts — chacun demande de savoir si
> ce qu'il avoue est un OUBLI ou un JALON.

La question du cycle 67 — *les écrivains d'un même état s'accordent-ils ?* — a
donc repris la main, cette fois sur un état à fort trafic : la suppression de
message.

---

## 2. Le défaut : quatre écrivains, deux formes d'écriture

Les quatre chemins de suppression appellent tous `applyMessageRemovalEffects`
(vérifié — cette moitié-là est saine, et c'est le travail d'un cycle antérieur).
Mais ils n'écrivent pas la même chose de la même façon :

| écrivain | forme |
|---|---|
| `MessageHandler.handleMessageDelete` (socket) | **UNE** écriture : `{ translations: null, deletedAt }` |
| `ExpiredMessagesCleanupService` | **UNE** écriture : `{ content:'', encryptedContent:null, translations:null, metadata:null, deletedAt }` |
| `routes/messages.ts` | **DEUX** écritures |
| `routes/conversations/messages-advanced.ts` | **DEUX** écritures |

```ts
await prisma.message.update({ where: { id }, data: { translations: null } });    // 1
await prisma.message.update({ where: { id }, data: { deletedAt: new Date() } }); // 2
```

Et le handler socket ne porte pas seulement la bonne forme — **il l'annonce** :

```ts
// Soft delete: atomically clear translations and set deletedAt in one write
```

Quelqu'un a donc fait ce changement, délibérément, sur un chemin sur quatre.

### 2 bis. Ce que les deux écritures coûtent — et le vrai prix n'est pas la fenêtre

Entre 1 et 2, la ligne est **VIVANTE et dépouillée de ses traductions**.

- **Pendant la fenêtre** : tout lecteur d'une autre langue retombe sur
  l'original. Le Prisme est rompu le temps d'un aller-retour — visible, mais
  borné, et pas un mensonge (afficher l'original est le comportement prescrit
  quand aucune traduction ne matche).
- **Si l'écriture 2 échoue** : cet état devient **DÉFINITIF**. Le message reste
  vivant, sans aucune traduction, et **rien ne les recalcule**. Le dépôt l'écrit
  lui-même, dans `MessageTranslationService` :

  > la traduction correcte était perdue **DÉFINITIVEMENT** : aucun chemin ne
  > retente une traduction absente.

C'est le vrai prix, et il est irréversible.

**L'ordre faisait échouer du MAUVAIS côté.** L'écriture DESTRUCTRICE committait
la première ; celle qui la rend inoffensive, la seconde. Le dépôt raisonne
partout dans l'autre sens, et le dit :

> Échouer ICI laisse le lien ACTIF : c'est le sens sûr.
> — `messageRemovalEffects.ts`

> si l'effacement échoue, la ligne garde son `deletedAt` nul et la passe suivante
> la reprend […] Dans l'autre sens […] les fichiers resteraient orphelins pour
> toujours. — `ExpiredMessagesCleanupService.ts`

Fusionner ne choisit pas un meilleur ordre : **il supprime la question.**

### 2 ter. La course avec l'édition, fermée au passage

L'édition porte une garde optimiste — `where: { id, deletedAt: null }` — dont le
commentaire dit qu'elle existe pour qu'une suppression concurrente ne fasse pas
« RESSUSCITER la ligne ». Pendant la fenêtre, `deletedAt` est **encore nul** :
la garde laisse donc passer, l'édition répond succès et diffuse
`message:edited`… pour une ligne que l'écriture 2 efface juste après. En une
seule écriture, la course se résout proprement dans les deux sens.

### 2 quater. Ce qui rend ce défaut particulier : le correctif était DANS LES MÊMES FICHIERS

Ce n'est pas une leçon qu'il fallait aller chercher ailleurs. **Les deux fichiers
portent déjà exactement cet argument, sur leur route d'ÉDITION**, à quelques
centaines de lignes de la route de suppression :

> `translations: null` appartient à CETTE écriture, pas à une seconde plus bas :
> un nouveau contenu périme ses traductions à l'instant où il est écrit.
> Séparées, les deux écritures ouvraient une fenêtre […]
> — `routes/messages.ts`, route d'édition

Et cette phrase se termine par :

> Les trois autres transports d'édition invalident déjà dans l'écriture du
> contenu ; **celui-ci était le dernier à ne pas le faire.**

Vrai — de la famille d'ÉDITION. La famille de SUPPRESSION n'a jamais été
balayée. Le cycle 35 a fini son sujet et l'a écrit comme s'il finissait le
fichier.

---

## 3. Ce qui a été livré

Les deux routes REST écrivent désormais comme leurs deux jumeaux :

```ts
await prisma.message.update({
  where: { id: messageId },
  data: { translations: null, deletedAt: new Date() }
});
```

Rien d'autre n'a bougé : mêmes gardes d'admission, mêmes effets durables, même
diffusion. La modification est un **regroupement**, pas un changement de
comportement nominal — ce qui est précisément ce qui la rend sûre.

### 3 bis. Ce qui n'a PAS été fait, et pourquoi

- **La garde optimiste `where: { id, deletedAt: null }` n'a pas été ajoutée à la
  suppression.** Elle rendrait la double suppression idempotente et fermerait
  une autre course — mais le handler socket ne la porte pas non plus, et
  l'ajouter ici ferait diverger les quatre écrivains dans l'autre sens. C'est un
  sujet à part, pour les QUATRE ensemble (§ 6-1).
- **`content` n'est pas effacé.** Seul `ExpiredMessagesCleanupService` le fait,
  et c'est sa fonction : la suppression ordinaire est un *soft delete* qui
  conserve le contenu. Aligner les quatre là-dessus serait une décision de
  RÉTENTION, pas un correctif.

---

## 4. Les gardes, et laquelle compte

Deux par route, quatre en tout :

| Garde | Ce qu'elle affirme |
|-------|--------------------|
| une écriture | la suppression committe en UN `update` portant les deux champs |
| **état interdit** | **aucun état committé ne porte « vivante ET sans traductions »** |

**La seconde est celle qui a de la valeur.** La première compte des écritures —
une forme ; la seconde énonce la PROPRIÉTÉ, en rejouant les écritures sur une
ligne modèle et en interdisant l'état intermédiaire. Un refactor futur qui
repasserait à deux écritures *dans l'ordre inverse* (`deletedAt` d'abord)
satisferait encore « une écriture porte les deux champs » sur sa première
écriture ; il ne satisfait pas celle-ci.

**ROUGE prouvé sur les quatre**, les deux routes remises à leur forme d'avant :

```
● committe la suppression en UNE écriture, traductions comprises
    Expected length: 1
    Received length: 2
    [{"data": {"translations": null}}, {"data": {"deletedAt": …}}]

● ne committe jamais un état « vivante et sans traductions »
    Expected length: 0
    Received length: 1
    [{"data": {"translations": null}}]
```

Aucun témoin existant n'a eu à être réécrit — et c'est une information : la
suppression n'était pinnée par AUCUN témoin sur sa forme d'écriture. Le défaut
n'a pas survécu à une garde, il a survécu à leur absence.

---

## 5. Vérification

| Gate | Résultat |
|------|----------|
| `tsc --noEmit` gateway | ✅ 0 erreur |
| Suite gateway complète | ✅ **746/746 suites, 18 077 témoins** verts |
| Δ témoins vs cycle 67 | **+4** (18 073 → 18 077) — exactement les gardes ajoutées |
| Témoins existants réécrits | **aucun** |
| Clients (web / iOS / Android) | **aucun changement** |

---

## 6. Pistes pour le cycle 69

1. **Nouvelle — la garde optimiste manque aux QUATRE suppressions.** L'édition
   écrit sous `where: { id, deletedAt: null }` ; aucune suppression ne le fait.
   Une double suppression concurrente rejoue donc tous les effets durables
   (décompte de compteurs compris) une seconde fois. À instruire pour les quatre
   écrivains ensemble, jamais pour un seul — c'est exactement ce qui a produit ce
   cycle.
2. **Nouvelle — `ExpiredMessagesCleanupService` efface `content`, les trois
   autres non.** Divergence RÉELLE entre écrivains, mais de rétention : elle
   demande une décision produit (« que garde-t-on d'un message supprimé ? »)
   avant tout correctif. Ne pas l'aligner unilatéralement.
3. **`presence:snapshot` n'est envoyé qu'à l'authentification** (cycle 66) —
   intacte, demande un changement client (Xcode).
4. **Refuser la session quand ZÉRO room a été atteinte** (cycle 65) — intacte,
   demande une mesure de production.
5. **La file hors ligne par APPAREIL** (cycles 58/64/65) — intacte, demande une
   identité d'appareil sur la socket.
6. **Le drain hors ligne reste destructif** (cycle 57) — intacte, bloquée sur
   Xcode.
7. **Les trois écouteurs iOS sans émetteur** (cycle 64) — intacte, bloquée sur
   Xcode.
8. **Le flake non identifié de `packages/shared`** (cycle 61 bis) — intacte.
9. **`conversations.infinite()` en pagination keyset** (cycles 59/60) — intacte.
10. **`/leave` et `/delete-for-me` tranchent l'INVERSE** (cycle 67 § 6-10) —
    intacte, décision produit.
11. **L'ordre d'écriture de `leave.ts`** (cycle 67 § 6-11) — intacte.
12. **Familles ÉPUISÉES, ne pas repasser** : « où le signal est-il regardé »
    sur les treize émissions vers `ROOMS.conversation(` (cycle 67 § 1) ; « les
    écrivains s'accordent-ils » sur les tombstones de `Participant` (cycle 67
    § 5 bis) et sur les effets durables de suppression (§ 2, tous appellent
    l'unité partagée).
