## Leçon 373 — Deux absences qui se JUSTIFIENT l'une l'autre forment un cercle, et un cercle a l'air d'une cohérence

**Contexte (2026-08-31, #4591).** `StoryLocationObject` était la seule des cinq
familles de la scène sans `startTime` / `duration`. J'ai documenté cette absence
comme une **propriété du domaine** — « une pastille de lieu n'a pas de temps
propre, elle vit aussi longtemps que la slide » — et j'ai écrit un témoin qui
l'assertait (`XCTAssertNil` sur sa durée). Dans le même lot, `TimelineProject` ne
portait pas `locationObjects`, et j'ai documenté cette seconde absence en citant
la première : « pas de piste parce que pas de temps ».

Le porteur : « Tout `MeeshySceneObject` peut apparaître et disparaître quand il
souhaite, y compris la pastille de lieu (différente de la localisation du
poste !) ».

### La faute de lecture

`canvas-v3.ts` déclare `timing: optional()` là où il déclare `transform`
**requis**. J'ai lu `optional` comme « cette famille n'a pas de temps ».

> **`optional` décrit la PRÉSENCE d'un champ, jamais la CAPACITÉ d'une famille.**
> Un objet PEUT ne pas avoir de fenêtre ; aucun ne peut être privé du droit d'en
> avoir une. J'avais tiré du contrat exactement l'inverse de ce qu'il dit.

### La forme, qui est la vraie leçon

Les deux absences se soutenaient mutuellement :

- le modèle n'avait pas de fenêtre **parce que** la timeline ne portait pas les
  lieux ;
- la timeline ne portait pas les lieux **parce que** le modèle n'avait pas de
  fenêtre.

Aucune relecture ne pouvait rompre ça : chaque moitié rend l'autre plausible, et
rien dans le code ne les contredit — c'est le propre d'un cercle. **Ce qui l'a
brisé était extérieur au code.**

Et le cercle avait **cinq** sommets, pas deux. En suivant la chaîne
« qui ALIMENTE / qui AFFICHE » :

| # | site | ce qu'il disait | pourquoi il le disait |
|---|---|---|---|
| 1 | `StoryLocationObject` | pas de `startTime`/`duration` | « hors timeline par design » (son propre doc-comment) |
| 2 | `TimelineProject` | pas de `locationObjects` | cite le site 1 |
| 3 | `TimelineProject.init(from:)` / `apply(to:)` | ne lisait ni n'écrivait le lieu | conséquence du site 2 |
| 4 | `Plan2DProjectAdapter` | laisse `locationObjects` à son défaut | son doc-comment cite le site 2 |
| 5 | `Plan2DLayout.placeTracks` | `bar: .ghost` **en dur** | cite le site 1 |

Le **doc-comment du site 1 était la source citée par 2, 4 et 5**. Une phrase
fausse au bon endroit se propage mieux qu'un correctif.

### Le sixième sommet — celui qui aurait avalé la correction en silence

`MeeshyUI` déclarait

```swift
extension StoryLocationObject: RenderableItem {
    public var startTime: Double? { nil }   // ← et duration, fadeIn, fadeOut
}
```

`MeeshyUI` compile en `defaultIsolation(MainActor.self)` : ces quatre calculées
**OMBRAIENT** les propriétés stockées dans tout le module. Le modèle corrigé
n'aurait gouverné **aucun pixel** du canvas — le renderer aurait continué à
classer chaque pastille `isStatic`, toujours visible.

> **Un repli qui rend `nil` sans condition n'est pas une valeur par défaut :
> c'est une réponse qui empêche la question d'être posée.** Il ne rougit jamais,
> parce qu'il *satisfait* le contrat qu'il vide.

Ce sommet-là ne s'est pas trouvé en lisant : c'est le compilateur qui l'a dit,
et par un message hors sujet — `main actor-isolated property 'startTime' can not
be referenced from a nonisolated context`. **Une erreur d'isolation sur une
propriété qu'on vient d'ajouter en STOCKÉE est le signe qu'une CALCULÉE du même
nom existe ailleurs.**

### La règle

1. Devant une asymétrie entre familles, ne pas demander « est-ce cohérent ? »
   (un cercle l'est toujours) mais **« qu'est-ce qui, HORS du code, dit que
   c'est voulu ? »** — le contrat, la planche, le porteur.
2. Un doc-comment qui **justifie** une absence est un multiplicateur : chercher
   qui le cite avant de le corriger (`grep` la phrase, pas le symbole).
3. Après avoir ajouté un champ, dérouler « qui l'ALIMENTE / qui l'AFFICHE »
   jusqu'au pixel — et **chercher une calculée du même nom** dans chaque module
   consommateur.

Voir aussi [[reference_fabricated_fallback_hides_dead_reads]],
[[reference_two_good_decisions_can_orphan_a_signal]], leçon 369 (les cinq
natures d'un contrôle qui ne fait pas ce qu'il annonce).
