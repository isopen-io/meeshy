## Leçon 323 — Le modèle d'un sous-agent se choisit sur son VERBE, pas sur l'importance du lot

**Contexte.** Le 2026-08-29T19:10Z, le porteur corrige : *« Tu dois apprendre à
utiliser des agents qui utilisent un modèle suffisant pour l'activité demandée et non
pas faire du Opus systématiquement ! »* La consigne existait pourtant dans le prompt
de boucle depuis le premier tour — « si tu utilises des sous-agents, utilise le bon
modèle le plus économique ». Elle avait été lue une fois, puis le défaut de fabrique
a repris la main.

**Le vrai mode de défaillance.** Ce n'est pas d'avoir ignoré la règle : c'est qu'une
décision **par appel** qui n'est pas re-prise à chaque appel retombe mécaniquement
sur son défaut. Tant que le modèle reste un paramètre qu'on peut OMETTRE, l'omission
gagne — et elle gagne d'autant plus qu'elle ne produit jamais d'erreur visible : un
relevé fait par le modèle le plus lourd est *juste*, simplement payé dix fois son
prix. **Un gaspillage qui rend un résultat correct n'a aucun témoin.**

**Ce que ça coûte, au-delà du prix.** Un modèle surdimensionné sur une tâche
mécanique ne se contente pas d'être cher : il RAISONNE là où on voulait un inventaire.
Il commente, il nuance, il propose — et l'intégrateur doit relire de la prose pour en
extraire les six lignes de tableau qu'il avait demandées. Le sous-dimensionnement a le
défaut symétrique et plus dangereux : un modèle trop léger sur un arbitrage rend une
réponse plausible et fausse, qui ne se signale pas non plus.

**La règle — le critère est l'ARBITRAGE, jamais la difficulté du sujet.**

| verbe de la tâche | arbitrage requis | modèle |
|---|---|---|
| énumérer, grepper, extraire d'un log, relever un état, compter, vérifier un format | aucun — la réponse est dans les données | **haiku** |
| écrire le correctif d'une issue cadrée : territoire donné, critère de fin écrit, témoins à prouver rouges | borné — les choix sont locaux et le critère tranche | **sonnet** |
| trancher entre deux conceptions, résoudre une contradiction entre deux sources qui font également foi, décider ce qui entre dans un lot | ouvert — rien dans les données ne tranche | **opus** |

**Le correctif de forme, pour que la règle ne se re-oublie pas.** Le modèle devient un
champ EXPLICITE de la fiche de chaque agent, rempli en même temps que son territoire —
au même titre que `{{ISSUE}}` et `{{TERRITOIRE}}`. Un agent lancé sans que son verbe
ait été nommé est un agent dont le modèle n'a pas été choisi. C'est la forme de la
leçon 251i : *une règle qu'on peut oublier de poser doit devenir impossible à ne pas
poser.*

---
