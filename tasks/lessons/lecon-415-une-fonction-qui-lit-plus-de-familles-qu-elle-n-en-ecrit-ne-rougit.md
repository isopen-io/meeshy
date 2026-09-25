## Leçon 415 — Une fonction qui LIT plus de familles qu'elle n'en ÉCRIT ne rougit nulle part

**Le fait.** Une session voisine me signale que mes jumelles UIKit
`bringForward` / `sendBackward` refont l'aplatissement de `allElementsSortedByZ`
« sans la justification écrite » — une remarque de DUPLICATION. En allant la
mesurer, j'ai trouvé autre chose : les deux fonctions **lisent cinq familles**
(texte, média, son, sticker, lieu) et **écrivent par `mutateItem`, qui n'en
connaît que quatre** — le son manque. Le son participe donc au classement et
n'est jamais écrit. Avancer une chip de son ne fait rien ; faire passer un texte
devant elle applique l'échange **à moitié** — le texte prend le rang du son, le
son ne prend pas celui du texte. `allItemZIndexes` (donc `nextTopZ`) rate le son
aussi : « mettre au premier plan » peut atterrir dessous. (#4759)

> **L'asymétrie entre ce qu'une fonction LIT et ce qu'elle ÉCRIT est invisible à
> toute vérification de ressemblance.** Deux copies peuvent être identiques ligne
> pour ligne et fausses toutes les deux ; ici, la faute n'est même pas dans la
> copie — elle est dans le SILENCE de l'écriture. `mutateItem` rend
> `newSlide` inchangé quand aucune famille ne matche : pour l'appelant, « je
> n'ai rien trouvé » et « j'ai muté » ont la même signature.

**Le geste.** Devant une remarque de FORME (duplication, style, justification
manquante), aller mesurer le COMPORTEMENT des deux copies avant de conclure que
la remarque est cosmétique. Et devant un helper de mutation générique qui prend
une closure par famille : compter ses paramètres contre l'énumération de ses
appelants — un helper qui rend son entrée inchangée sur un cas non couvert est
un `nil` silencieux déguisé en succès.

Voisines : `reference_inert_control_vs_unfed_feature` (les cinq natures d'un
contrôle qui ment — celle-ci en est une sixième : le contrôle AGIT, sur la
moitié de sa cible), `reference_a_deduced_value_is_not_a_read_value`.
