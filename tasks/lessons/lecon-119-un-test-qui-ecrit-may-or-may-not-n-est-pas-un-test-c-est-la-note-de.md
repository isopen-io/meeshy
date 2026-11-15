## Leçon 119 — un test qui écrit « may or may not » n'est pas un test, c'est la note de son auteur (2026-08-12, routine messaging, cycle 86)

Deux tests de `useConversationTyping` s'appelaient « should stop typing on conversation change if
active » et « should stop typing on unmount if active ». Ni l'un ni l'autre n'assertait quoi que ce
soit sur `stopTyping` ; tous deux portaient un commentaire du type « The cleanup effect may or may
not call stopTyping depending on React's cleanup timing ». Ils étaient verts, comptés dans la suite,
et nommaient exactement le comportement cassé.

1. **Un titre qui promet un comportement et un corps qui n'affirme rien, c'est pire qu'un test
   absent** : le nom occupe la place, et une recherche « est-ce testé ? » répond oui.
2. **« Ça dépend du timing de React » est la formulation d'une hypothèse non instruite.**
   L'ordonnancement des nettoyages et des effets est déterministe et documenté (tous les nettoyages
   avant tous les effets) : il se raisonne, il ne s'invoque pas comme une incertitude.
3. **Le repérage est mécanique** : `rg -l "may or may not|peut ou non" __tests__/` et, plus large, un
   `it(...)` dont le corps ne contient aucun `expect`. Les deux se cherchent en une commande.
4. Corollaire de la leçon 117 sous un autre angle : là-bas le double validait les deux versions du
   code ; ici c'est l'ABSENCE d'assertion qui les validait toutes les deux.
