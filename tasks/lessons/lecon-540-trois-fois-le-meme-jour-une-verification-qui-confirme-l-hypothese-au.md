## Leçon 540 — Trois fois le même jour : une vérification qui CONFIRME l'hypothèse au lieu de l'éprouver

**Mesuré le 2026-09-06**, sur un lot de 47 correctifs de CI dans un arbre partagé
à quatre sessions. Trois défauts que j'ai INTRODUITS, tous après une vérification
que j'avais jugée faite — et chacun bloquant à un étage de plus que le précédent.

| ce que j'ai vérifié | ce que la question ne pouvait pas voir | coût |
|---|---|---|
| « quels symboles de MA LISTE ce bloc utilise-t-il ? » | `AnyCancellable` n'était pas dans la liste ⇒ `import Combine` manquant | l'app ne compile plus |
| « où est LE helper de ce fichier ? » | le fichier porte DIX-NEUF classes ⇒ helpers hors de portée de leurs appelants | le bundle de tests ne compile plus |
| « les accolades s'équilibrent-elles ? » | le compteur ignorait les chaînes `"""` ⇒ faux positif | une heure de doute sur du code sain |

Et un quatrième, de la même famille, trouvé par un pair : les deux conformances
extraites de `CallManager` touchaient six membres **`private`** — le piège que le
`CLAUDE.md` d'`apps/ios` documente en toutes lettres, et que j'avais lu. Ma
question portait sur les SYMBOLES du bloc ; la visibilité de ces symboles n'y
entrait pas.
