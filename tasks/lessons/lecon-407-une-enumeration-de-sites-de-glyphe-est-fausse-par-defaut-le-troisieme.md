## Leçon 407 — Une énumération de sites de glyphe est fausse par défaut : le troisième existe presque toujours

**Le lot.** Retirer le smiley de la porte sticker (#4719). Le design a énuméré
**deux** sites — la porte du rail (`ComposerRailDoor.symbolName`) et l'en-tête
de la feuille (`StickerPickerView`) — et un troisième à NE PAS toucher (le
`case .emoji` du document, qui dit vrai).

**Le défaut.** Il y en avait un **quatrième**, et il fallait le changer :
`ComposerToolPanelHost` (SDK) porte un bouton `systemImage: "face.smiling"` qui
ouvre **la même palette**. Il n'est apparu qu'en cherchant, au simulateur,
comment atteindre la feuille — c'est-à-dire en se demandant *qui l'ouvre*, une
question que l'énumération n'avait pas posée.

> C'est la leçon 261 sur un objet plus humble qu'un résolveur de Prisme : **une
> énumération porte deux affirmations — « ces sites appliquent la règle »
> (vérifiable) et « ce sont les seuls » (presque jamais vérifiée).**

**La forme du correctif.** La garde ne nomme plus : elle BALAIE les sources du
composer et exige que **tout fichier qui ouvre la palette** (`onOpenStickerPicker?()`
ou `StickerPickerView(`) ne contienne pas `face.smiling`. Un cinquième site
l'appliquera sans qu'on y pense. Le fusible (`examinés > 1`) empêche la garde de
passer au vert par omission le jour où le balayage se casse.
