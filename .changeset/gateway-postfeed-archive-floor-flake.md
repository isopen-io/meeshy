---
"@meeshy/gateway": patch
---

Le témoin du plancher d'archive des stories ne dépend plus de deux lectures d'horloge sur la même milliseconde

`bounds the author archive to a finite window in the past` comparait `before - floor` à la
fenêtre par égalité STRICTE : le témoin capture `Date.now()`, le service lit le sien, et
toute milliseconde franchie entre les deux rendait le test rouge (604 799 999 pour
604 800 000 attendu). Le plancher est désormais ENCADRÉ entre `before - fenêtre` et
`after - fenêtre` — exact, puisque le service lit son horloge entre ces deux instants, et
sans tolérance arbitraire.
