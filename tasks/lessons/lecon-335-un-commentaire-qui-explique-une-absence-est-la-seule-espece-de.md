## Leçon 335 — un commentaire qui explique une ABSENCE est la seule espèce de commentaire que rien ne fait rougir

**Le fait.** Le plateau du composer unifié ne servait ni la porte `sticker` ni les deux actions
d'empilement. Les deux absences étaient DOCUMENTÉES, à l'endroit exact où on les aurait cherchées,
dans le style du dépôt :

> « `sticker` en est absente : aucun chemin ne pose un objet de ce kind. »
> « L'empilement ne vit que sur la `StoryCanvasUIView`, dont le meuble n'a aucune référence. »

**Les deux étaient fausses.** `addSticker(emoji:)` existe depuis C13, `StickerPickerView` est
publique depuis C8, et le meuble injecte déjà « Mes stickers » **une ligne au-dessus du rail**.
`bringForward` / `sendBackward` vivent sur le MODÈLE et y persistent leur `zIndex` dans la slide —
donc jusqu'au reader et à la publication, ce qu'un empilement de vue n'aurait jamais fait. Ce qui
manquait, dans les deux cas, était le mot `public`.

**Pourquoi ça tient si longtemps.** Un commentaire qui explique une PRÉSENCE se fait contredire par
le code qu'il surplombe : la ligne d'en dessous ment ou ne ment pas. Un commentaire qui explique une
absence ne surplombe rien. Il n'y a aucun code à contredire, aucun test ne s'écrit « ce bouton
n'existe pas parce que X », et le lecteur suivant hérite d'un motif qui a l'air mesuré. **Pire dans
ce dépôt qu'ailleurs** : on y écrit ses absences avec la loi 4 (« un contrôle sans effet est
ABSENT »), si bien que la phrase emprunte l'autorité d'une RÈGLE à ce qui n'est qu'un constat daté.

> **Un `internal` ressemble, vu du site d'appel, à une règle produit.** Une primitive non exposée et
> une primitive inexistante rendent la même erreur de compilation. La question à poser avant d'écrire
> « le chemin n'existe pas » est donc **« où vit la primitive ? »**, jamais « puis-je l'appeler
> d'ici ? » — la seconde a la même réponse dans les deux cas.

**Le témoin qui l'attrape, et pourquoi il n'existait pas.** Les deux ensembles SERVIS vivaient en
`Set` littéraux dans le corps de `sceneSurface`. Un littéral posé dans un `some View` ne
s'interroge qu'à la garde de source — et une garde de source sur un littéral meurt à la première
réécriture. Sortis en règle pure (`ComposerSceneCapabilities`), ils se demandent : « la porte sticker
est-elle servie ? », et la réponse est une VALEUR, pas une sous-chaîne. Une garde négative
(`served:[.` interdit dans l'unité du meuble) interdit le retour du littéral ; rejouée sur `HEAD~`,
elle rougit — comme les cinq positives.

**Généralisation.** Ce n'est pas propre aux capacités d'un composer. Partout où l'on écrit « X n'est
pas fait parce que Y », **Y est une affirmation non testée, et c'est la seule partie du commentaire
que personne ne relira**. Les deux formes à traiter comme suspectes : « la primitive n'existe pas »
(→ vérifier le niveau d'accès) et « ça vit ailleurs » (→ vérifier lequel des deux niveaux, modèle ou
vue, porte vraiment l'état — le modèle persiste, la vue non).

Voir la leçon 261 (une énumération de sites porte deux affirmations, dont une presque jamais
vérifiée) : même famille, autre support — là c'était la LISTE qui mentait par omission, ici c'est sa
JUSTIFICATION.
