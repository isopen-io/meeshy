## Leçon 319 — Un helper de test qui NAVIGUE peut rendre du vide, et tout passe au vert

**Contexte.** #4159 remplace quatre `contains` sur des colonnes non indexées par
un test d'appartenance à un tableau de jetons. Le fichier de témoins de #4145
(« l'adresse e-mail ne se moissonne pas ») s'appuie sur un helper :

```ts
function clausesOr() {
  const CHAMPS = ['firstName', 'lastName', 'username', 'displayName', 'email', 'phoneNumber'];
  const bloc = where.AND.find((c) => c.OR?.some((clause) => CHAMPS.some((champ) => champ in clause)));
  return bloc?.OR ?? [];          // ← le repli
}
```

Il localise le bloc `OR` **par les champs qu'il s'attend à y trouver**. Le
correctif retire ces champs. Le `find` ne matche donc plus, `bloc` est
`undefined`, et le helper rend **`[]`**.

**Ce que cela fait aux témoins.** Le fichier contient plusieurs assertions
NÉGATIVES de la forme `expect(clauses.find((x) => 'email' in x)).toBeUndefined()`
— la garde de confidentialité de #4145. Sur un tableau vide, elles sont **toutes
vraies**. La protection aurait disparu en silence, et le seul témoin à rougir est
celui, positif, que je venais d'écrire.

> **Le repli `?? []` d'un helper de navigation transforme un échec de
> localisation en succès d'assertion.** C'est la forme la plus discrète de la
> leçon 464 (« les gardes négatives meurent en silence ») : ici la garde ne meurt
> pas d'une réécriture, elle meurt parce que le TERRAIN sous elle a bougé.

**Les deux parades, et pourquoi la première ne suffit pas.**

1. Mettre à jour les repères du helper quand la clause change. Nécessaire — mais
   c'est exactement ce qu'on oublie, puisque rien ne le demande.
2. **Faire échouer la NAVIGATION elle-même.** Un helper qui ne trouve pas ce
   qu'il cherche doit lever, pas rendre un vide plausible :
   `if (!bloc) throw new Error('bloc OR introuvable — les repères ont-ils changé ?')`.
   Le témoin tombe alors pour la vraie raison, en la nommant.

**Symptôme reconnaissable.** Quand un changement de clause fait rougir UN témoin
positif et zéro témoin négatif du même fichier, se demander si les négatifs
mesurent encore quelque chose — et pas seulement s'ils passent.

*(Même famille que la leçon où `clausesOr()` attrapait le premier bloc `OR` —
celui de `deletedAt` — au lieu de celui des champs de recherche. Un helper de
navigation est un point de défaillance silencieux, deux fois plutôt qu'une.)*

---
