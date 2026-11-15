## Une CI rouge sur des témoins qu'on n'a pas touchés se diagnostique en NEUTRALISANT ses propres témoins (cycle 163, #18641, #18644)

**Le piège**

Un lot de trois lignes dans `apps/web/src/lib/api/socket.ts` a fait rougir deux
témoins de pastille de PRÉSENCE, dans deux fichiers de `src/components/` qu'il
ne touche pas et qu'il n'importe pas.

La réaction naturelle — « qu'est-ce que j'ai cassé ? » — envoie chercher dans
son propre diff un lien de causalité qui n'existe pas. Elle peut occuper un
cycle entier, parce qu'on finit toujours par trouver une histoire plausible :
ici, « mes invalidations touchent un magasin que la présence lit ».

**La question juste**

**« Que rougit mon changement de PRODUCTION, mes témoins neutralisés ? »**

Concrètement : garder le changement de production, remettre les fichiers de
TÉMOINS au niveau de la base, et rejouer la suite entière.

| ce qui est joué | verdict |
|---|---|
| `dev` seul | 1 fail |
| **ce lot, production seule, témoins au niveau de `dev`** | **identique à `dev`** |
| ce lot entier (production + 2 témoins) | 3 fail |
| `dev` + **deux témoins `expect(1).toBe(1)`** | 3 fail |

La deuxième ligne exonère la LOGIQUE. La quatrième nomme la vraie cause :
**ajouter deux témoins, n'importe lesquels, n'importe où, suffit.** Le lot ne
cassait rien — il déplaçait un seuil.

**Pourquoi ça marche**

Un lot de correctif porte DEUX choses qui échouent différemment : une LOGIQUE
de production, et des TÉMOINS qui occupent une place dans l'ordonnancement de la
suite. Un harnais qui partage un état de module entre fichiers — ici
`presenceStore`, singleton lu en priorité sur la charge servie, dans un
`bun test` qui joue 2520 fichiers dans UN SEUL processus — est sensible à la
seconde sans l'être à la première.

Les séparer est la seule mesure qui tranche, et elle coûte une exécution de
suite. Aucun raisonnement ne la remplace : les deux hypothèses prédisent
exactement le même symptôme.

**Trois corollaires, tous mesurés dans le même cycle**

- **Une bissection suppose un ordre d'exécution, et cette supposition se
  vérifie.** Les 225 fichiers « alphabétiquement avant » le témoin fautif sont
  verts, et les 295 suivants aussi : `bun test` n'ordonne pas alphabétiquement.
  Une bissection menée sur un ordre supposé mesure autre chose que ce qu'elle
  annonce — et son résultat a l'air d'un résultat.
- **Les deux moitiés vertes et le tout rouge ne désignent AUCUN fichier
  fautif.** C'est la signature d'une dépendance à la CHARGE, pas d'un
  prédécesseur à trouver. Continuer à chercher « le fichier qui fuit » après
  cette mesure, c'est chercher là où la lumière est meilleure.
- **Un gate qui cesse de protéger se signale comme le défaut qu'il masquait,
  attribué à quelqu'un d'autre.** `act-leak-guard` — posé au #9509 pour empêcher
  qu'un témoin dépassé rougisse les fichiers SUIVANTS — ne protège plus sous
  bun 1.4.4 (0 pass au lieu de 3) et protège sous 1.3.14, la version épinglée par
  la CI. Vérifier la version de ses outils AVANT de diagnostiquer un harnais :
  le `CLAUDE.md` demandait déjà que le conteneur et la CI ne divergent jamais.

**La règle**

Devant une CI rouge sur des témoins qu'on n'a pas touchés, ne pas chercher le
lien de causalité. **Rejouer la suite avec sa production seule.** Et si elle est
identique à la base, le lot est hors de cause : ce qu'on tient alors n'est pas
une régression à corriger mais un défaut d'isolation à OUVRIR, et le dire dans
la PR avec le tableau — sans quoi le prochain lot qui ajoute un témoin refera
l'enquête en entier.
