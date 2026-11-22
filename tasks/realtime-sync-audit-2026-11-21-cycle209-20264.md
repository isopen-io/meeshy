## Cycle 209 — le tiroir du composeur n'a jamais restreint un visiteur SANS COMPTE : sa ligne de participation était cherchée sur une seule colonne (#20264)

**Date** : 2026-11-21. **Base** : `dev` à `25454555e` (qui contient les cycles 206-208). **Issue** : #20264.

### D'où vient ce lot

Du cycle 206, qui a trouvé ce défaut en suivant son propre correctif jusqu'au
PIXEL : l'applieur de droits atteint les gestes du MENU (`menuViewerOf`, qui
résout les deux colonnes), et c'est en vérifiant par où il atteignait le TIROIR
du composeur que la seconde moitié est apparue. Elle a été DIFFÉRÉE dans son
issue plutôt qu'improvisée — « le correctif y est une lecture d'identité et non
un applieur temps réel, et les mélanger ferait un lot dont la preuve ne dirait
plus laquelle des deux règles elle garde ».

### Le défaut

`viewer.id` ne nomme pas la même colonne selon le lecteur : un compte s'y
reconnaît par `Participant.userId`, un visiteur de lien par `Participant.id` —
il n'a pas de `userId`, et le `CLAUDE.md` de la passerelle l'écrit (« `userId`
n'est PAS toujours un `User.id` »).

Le fil cherchait la ligne du lecteur ainsi :

```ts
const viewerParticipant = useMemo(() => conversation?.participants.find((p) => p.userId === viewer.id), [conversation, viewer.id]);
const composerAccess = useComposerAccess({ …, rights: viewerParticipant?.permissions });
```

**Jamais trouvée pour un invité**, donc `rights: undefined` — et le contrat de
`Composer` lit cette absence « tout est autorisé » (« Absent ⇒ tout est
autorisé (aucun participant chargé encore) »). Un visiteur à qui l'hôte venait
de retirer les images, les fichiers, les vidéos, les vocaux ou le lieu voyait
donc encore leurs tuiles, et son geste échouait au serveur.

**Une ligne introuvable ne dit pas « aucun droit » : elle dit « je n'ai pas
lu ».** C'est un choix JUSTE du composeur — il ne ferme pas sur une ignorance —
et c'est ce qui rend le défaut muet : la résolution rate, l'absence est
interprétée généreusement, et rien ne rougit.

### Ce qui rend ce défaut remarquable

**La loi juste était à la ligne SUIVANTE.** `selfSenderOf` (`lib/view/self-sender.ts`),
appelé une ligne plus bas dans le même composant, branche sur
`viewer.isAnonymous` et résout les deux colonnes depuis #10120. Deux
résolutions d'identité pour un même lecteur, à une ligne d'écart, dont une
fausse.

> **Une loi qui existe ne protège que ses appelants.** Le dépôt le sait d'un
> helper (« combien de sites de PRODUCTION appellent ce helper ? », cycle
> 123 bis) ; ici le compte était de UN, et le second site avait réécrit la
> question au lieu de l'appeler. La forme qui l'attrape n'est pas un témoin de
> comportement sur la loi — il passe — mais une garde de SOURCE qui interdit la
> seconde orthographe.

### Le correctif

- `viewerParticipationOf` devient la loi UNIQUE de la ligne de participation du
  lecteur, et `selfSenderOf` sa PROJECTION : le nom donné par l'invité est une
  affaire de COMPOSITION de la bulle optimiste, jamais une seconde façon de le
  reconnaître.
- Le fil l'appelle pour les DROITS ; sa mémoïsation passe de `[conversation,
  viewer.id]` à `[conversation, viewer]`, comme celle de `selfSender` juste à
  côté (la loi lit aussi `isAnonymous`).

### La preuve

| mutation | témoins qui tombent |
|---|---|
| la loi redevient une seule colonne (`userId`) | **3 rouges** — dont le témoin d'invité de #10120, qui garde la jumelle |
| le fil réécrit son `find` à la main | **1 rouge** — la garde de source |

| gate | résultat |
|---|---|
| `bun test src/lib/view/ src/lib/send/` | **4856 verts / 0 rouge**, 366 fichiers |
| `bun test src/routes/thread-size-budget.test.ts` | vert — le fil reste à **999 lignes** |
| `tsc --noEmit` (web) | **0** |

**Le budget de taille a contraint le lot, et c'est à dire :** `thread.tsx` était
à 999 lignes, soit à UNE ligne de son plafond. Le premier jet du commentaire en
ajoutait huit et faisait rougir `thread-size-budget` — le commentaire complet de
la loi vit donc chez la LOI, et le fil n'en garde que ce qui explique son appel.
Un fichier saturé n'interdit pas un correctif ; il interdit de lui faire porter
sa documentation.

### Un accident du lot, consigné

Le témoin de source a d'abord dérivé son chemin de `import.meta.dir` — une API
de **bun**, qu'aucun type ne déclare : `bun test` passait, `tsc --noEmit`
rendait `TS2339`. La forme du dépôt est `fileURLToPath(new URL('../../', import.meta.url))`
(`admin-language-guard.test.ts`), qui vaut pour les deux.

> **Un témoin vert sous le runner ne dit rien du compilateur**, et les deux sont
> des gates de ce dépôt. Chercher la forme déjà employée par un témoin de la
> même famille avant d'en inventer une.

### Ce que ce lot ne fait pas

- Il ne touche pas `menuViewerOf`, qui résolvait DÉJÀ les deux colonnes : les
  gestes du menu (répondre, réagir, supprimer pour moi) n'ont jamais eu ce
  défaut, et le dire évite de chercher une régression là où il n'y en a pas.
- Il ne touche pas le témoin de `thread-sheets.test.tsx` qui échoue dans ce
  conteneur sur un arbre PROPRE — mesuré : son `beforeAll` charge les catalogues
  **`fr`** et le témoin assert un rendu **`en`**, si bien que `translate` lève
  « Catalogue d'interface « en » lu avant d'être chargé » dès que le fichier
  tourne SEUL. Il ne passe que parce qu'un AUTRE fichier de la suite a chargé
  `en` avant lui — une dépendance à l'ORDRE, pas au poste. C'est l'issue
  **#20272**, hors de ce lot.
