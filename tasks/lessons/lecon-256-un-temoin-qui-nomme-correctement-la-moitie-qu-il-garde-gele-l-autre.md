## Leçon 256 — un témoin qui nomme correctement la moitié qu'il garde GÈLE l'autre

Quatre des six témoins du cycle 114 ne sont pas des ajouts : ce sont des
**retournements**. Ils existaient, ils étaient verts, et ils assertaient le
défaut mot pour mot :

```ts
it("n'ajoute PAS `message:new` quand l'enveloppe ne porte aucun message", () => {
  expect(linkMessageEmissions({}).map((e) => e.event)).toEqual([SERVER_EVENTS.LINK_MESSAGE_NEW]);
});
```

L'intitulé dit VRAI, et c'est précisément cette vérité qui a rendu la seconde
moitié de l'assertion invisible : `⇒ [LINK_MESSAGE_NEW]` se relit comme le RESTE
de la phrase, pas comme une affirmation à instruire. Deux cycles de gardes
posées à cette même frontière de désérialisation sont passés à côté.

> **Un `toEqual` sur une liste entière affirme autant sur ce qu'il GARDE que sur
> ce qu'il ADMET.** Les deux moitiés se relisent séparément — et l'intitulé du
> témoin ne couvre en général que la première.

- Même famille que le compte (93), le tri (86 bis) et le commentaire qui énonce
  une contrainte (94) : **une affirmation portée par un témoin vert reste une
  affirmation.**


---
