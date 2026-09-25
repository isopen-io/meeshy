## Leçon 624

**Les effets de mise en page d'un ENFANT tournent AVANT ceux de son parent — donc une `ref` que l'hôte remplit dans son propre `useLayoutEffect` est encore `null` quand l'enfant mesure.**

Rencontré en posant les poignées de manipulation du plateau de story (#6943). L'hôte résolvait l'élément peint par le moteur (`stage.querySelector('[data-scene-object-id=…]')`) dans son `useLayoutEffect`, et le passait à la poignée par une `ref` ; la poignée mesurait cet élément dans le sien pour adopter sa taille, et rendait `null` tant qu'elle n'avait pas de mesure.

Ordre réel : **enfant, puis parent**. La poignée mesurait donc `ref.current === null` au premier rendu, ne s'affichait pas, et ne se serait affichée qu'au prochain rendu provoqué **par ailleurs** — une frappe, un redimensionnement. Sur un plateau qu'on ouvre et où l'on saisit tout de suite un objet, il n'y en a pas.

**Le défaut est INVISIBLE à tout témoin de composant** : un test qui monte la poignée avec une `ref` déjà remplie la voit s'afficher. Il ne se voit qu'au gate navigateur, et seulement si celui-ci saisit la poignée au lieu de vérifier sa présence.

> **Un enfant ne doit pas dépendre d'une valeur que son parent calcule après lui.** Passer l'IDENTIFIANT plutôt que la référence — et laisser l'enfant résoudre lui-même — supprime l'ordre du problème. Le signe à reconnaître : une `prop` de type `ref` remplie par un effet du parent.
