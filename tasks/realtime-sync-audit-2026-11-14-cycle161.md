# Cycle 161 — un champ que le miroir LIT et que personne ne POSAIT

*2026-11-14. Même branche que le cycle 160 (`claude/exciting-planck-sahr3j`),
reprise après la fusion de #18447 dans `dev` à `a47634ca1c`.*

**Livré** : #18124 (le dernier des quatre pièges du cliquet des champs morts, et
le seul des quatre qui soit LU), et la moitié web de #18456 — le suivi que
livrer #18124 a ouvert.

---

## Lot E — la réaction à une pièce jointe ne nommait pas son auteur (#18124)

### Le défaut

Le miroir Kotlin **déclare et lit** `userId` sur cet événement depuis toujours :

```kotlin
val mine = viewerId != null && event.userId == viewerId   // MessageDeltaApplier.kt
```

Le contrat ne le déclarait nulle part et l'émetteur ne le posait jamais. Un champ
optionnel absent se décode en `null` **sans bruit** : `mine` était donc TOUJOURS
faux. Sur le chemin « conversation non ouverte », la réaction qu'un lecteur vient
de poser **depuis un autre de ses appareils** n'était jamais marquée comme
sienne — la pastille ne s'allumait pas, et le prochain tap comptait comme un
ajout au lieu d'un retrait.

### La décision était déjà prise, sur la JUMELLE

L'issue laissait le choix entre « le miroir a tort » et « le contrat a tort », et
disait que le second demande de relever les consommateurs. Ce n'était pas à
trancher : `ReactionUpdateEvent` — la réaction de MESSAGE — porte déjà `userId`,
avec sa raison écrite sur place :

> « Permet à un autre appareil du MÊME utilisateur de reconnaître sa propre
> réaction dans l'écho temps-réel : comparer `participantId` à un `User.id`
> échoue toujours (ObjectIds de collections différentes, jamais égaux). »

**Ce qui exemptait la pièce jointe était un doc-comment**, posé sur son propre
contrat : « l'état *ma réaction* reste maintenu côté client via
`currentUserReactions` (optimiste + re-baké au cold-load REST) ». Vrai de
l'appareil qui RÉAGIT ; faux de tous les autres. Un optimisme local ne peut pas
reconnaître un geste venu d'ailleurs, et le re-bake REST n'a lieu qu'au
chargement complet.

> **Un doc-comment qui EXEMPTE une entité d'une règle que sa jumelle applique se
> vérifie comme une affirmation** (règle du cycle 127). Celui-ci ne disait pas
> *pourquoi* la pièce jointe se passerait de ce que le message exige — il
> décrivait un mécanisme client, et se relisait comme une décision.

### Ce que l'invité de lien a imposé

`resolved.userId` ne porte un `User.id` que pour un inscrit : pour un invité,
`resolveParticipant` y met sa clé de PARTICIPANT. Publier ça sous un champ qui
déclare un `User.id` est exactement la confusion que le champ existe pour
éviter — et le `CLAUDE.md` du gateway l'interdit nommément. La charge porte donc
`userId: resolved.isAnonymous ? null : resolved.userId`, **le même discriminant
que `updatedByUserId` douze lignes plus bas dans la même unité**, et le contrat
déclare `userId?: string | null`.

Un invité garde donc le comportement d'avant le lot : son optimisme local, et
rien de plus. Aucune régression — avant ce lot, `mine` était faux pour TOUT LE
MONDE.

### Preuves

| preuve | résultat |
|---|---|
| 3 témoins neufs, sur le COUPLE (room, charge) | verts ; **les 3** tombent quand on retire la ligne émise |
| le cliquet des champs morts, entrée #18124 remise à la main | ROUGE, et il NOMME : « `AttachmentReactionUpdateEvent.userId` (#18124) ne diverge plus — retirer son entrée » |
| `packages/shared/__tests__/ci/` | 21 fichiers, 184 témoins |
| `unit/handlers/` + `socketio/__tests__/` | 106 suites, 1 697 témoins |
| `tsc --noEmit` gateway et web | verts |

**Le deuxième témoin a d'abord été un faux témoin.** Il assertait
`userId !== participantId` — ce qu'un champ ABSENT satisfait déjà, `undefined`
différant de tout. Il passait au vert sous la mutation qu'il prétendait garder.
Corrigé en assertant d'abord la PRÉSENCE d'une chaîne : les trois tombent
désormais.

**Et le harnais n'emploie AUCUN double de `socketio-events`**, à la différence
de la suite voisine qui en énumère deux constantes à la main : c'est ce patron
qui a laissé `COMMENT_UNLIKED` s'émettre sous le nom `undefined` pendant des
mois (cycle 104).

---

## Lot F — et le web ne lisait pas davantage ce qu'on venait de servir (#18456)

Livrer le lot E ouvre immédiatement la question du cycle 122 : **qui AFFICHE ce
qu'il élit ?** Android lit le champ ; le web et iOS ne le lisaient pas, et
chacun le disait dans un commentaire :

> « une diffusion n'a pas de lecteur, *ma réaction* reste celle que le REST a
> servie » — `realtime-attachment-reactions.ts`

La phrase était vraie **tant que** l'événement ne nommait pas son auteur. Elle
a cessé de l'être au commit précédent.

Le puits web prend désormais le lecteur, et l'identité était déjà en portée au
site d'appel — **à deux lignes de là**, la jumelle message-level l'y passe
depuis #5863 :

```ts
applyMessageReactionUpdate(deps.queryClient, payload, deps.viewerId());   // #5863
applyAttachmentReactionUpdate(deps.queryClient, payload, deps.viewerId()); // ce lot
```

« Ma réaction » est calculée par **ensemble**, jamais par bascule : l'écho de mon
propre geste optimiste est inoffensif, et une double livraison est idempotente —
un témoin le dit. `userId: null` ne fait basculer la pastille de personne.

**Le harnais sert un acteur TIERS par défaut** (`u-other`), et c'est ce qui rend
les témoins capables de tomber : un harnais dont l'acteur serait le lecteur
rendrait le même verdict avant et après le lot. Même forme que « un témoin de
RANG s'écrit sur un rang AUTRE que le premier » (leçon 261).

| preuve | résultat |
|---|---|
| 6 témoins neufs | verts ; **3** tombent en figeant `mineMoved` à `false` |
| `apps/web/src/lib/api/` | 328 fichiers, 4 200 témoins |
| `tsc --noEmit` web | vert |

---

## Suivi ouvert

| # | ce que c'est | état |
|---|---|---|
| #18124 | le champ que le miroir lit et que personne ne posait | **fermé** par le lot E |
| #18456 | les consommateurs web et iOS de ce champ | **web livré** par le lot F ; **iOS reste** — demande Xcode |
| #18115 | les trois champs morts de `AttachmentUpdatedEvent` (jumelle Kotlin morte) | ouverte — seules entrées restantes du cliquet |
