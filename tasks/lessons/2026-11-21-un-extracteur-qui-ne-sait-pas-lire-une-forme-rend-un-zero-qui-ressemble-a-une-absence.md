## Un extracteur qui ne sait pas lire une forme rend un ZÉRO qui ressemble à une absence (cycle 206, #20155)

Le balayage frère des portes à clé d'appelant porte deux discriminants : une
CLAUSE qui nomme l'appelant, et un PRÉDICAT d'identité jugé en code. À sa
première exécution il a rendu **148 clauses et 0 prédicat**.

Zéro est un résultat plausible. Il se lit « le dépôt ne contient pas cette
forme », et c'était faux : deux des trois défauts de référence que le cliquet
doit retrouver (#20104, #20136) sont précisément des prédicats, et ils vivaient
dans l'arbre balayé.

La cause tient en un mot. Le balayage réutilisait `callArguments` du cliquet des
audiences — la bonne décision, puisque réécrire un discriminant le fait dériver
— mais cette fonction cherche **la prochaine ACCOLADE** :

```ts
export function callArguments(source: string, parenIndex: number): string | null {
  const open = source.indexOf('{', parenIndex);   // ← la prochaine ACCOLADE
  ...
}
```

C'est juste pour ce qu'elle sert : `findFirst({ where: … })` ouvre bien une
accolade. Un rappel en flèche sans accolades n'en ouvre aucune. Sur
`participants.find(m => m.userId === inviterId)` elle sautait donc jusqu'à
l'accolade suivante du fichier et rendait le bloc du `if` d'en dessous :

```
HIT participants.find( | args= "{ return sendForbidden(reply, 'Vous n'êtes pas membre…' ) }"
```

Du code voisin, parfaitement plausible, sous lequel le discriminant d'identité
répondait `false` — en toute logique, puisqu'il n'y a aucun `===` dans un
`return`. Aucune erreur, aucune exception, aucun site écarté : un zéro.

### Ce que ça coûte, et pourquoi c'est pire qu'un faux positif

Le dépôt sait déjà qu'« un balayage qui OMET est plus coûteux qu'un balayage qui
sur-signale : seul le premier est silencieux », et que « *zéro trouvé* et *zéro
existe* ne sont pas la même affirmation » (leçon 261, et le constat du cycle 164
sur les neuf sites écartés « nom non résolu »). Cette forme-ci est la variante la
plus discrète des deux, parce que **l'instrument ne sait pas qu'il n'a pas lu** :
il n'a rien écarté, rien publié, rien à reprendre — il a lu autre chose.

Et le zéro était sur le point d'être GELÉ. L'inventaire se génère depuis le
relevé ; un cliquet livré une heure plus tôt aurait figé « 0 prédicat » comme une
propriété du dépôt, avec ses deux défauts de référence introuvables et un témoin
vert pour l'attester. Le cycle 107 avait jeté un balayage plutôt que de geler un
inventaire faux, pour exactement cette raison : « un cliquet ment plus longtemps
qu'un journal ».

### Ce qui l'a attrapé, et ce qui ne l'aurait pas attrapé

Pas une relecture : la réutilisation de `callArguments` est ce que la discipline
du dépôt recommande, et le site d'appel se lit juste. C'est la **preuve de ROUGE
exigée par le critère de fin** qui l'a nommé — « le balayage doit retrouver les
trois défauts sur l'arbre d'avant leur correctif ». Elle n'a pas servi à
documenter un cliquet déjà fini : elle a mesuré qu'il était à moitié aveugle.

> Un cliquet neuf ne se livre pas avec sa preuve de ROUGE parce que l'usage le
> veut. Il se livre avec elle parce que c'est la seule chose qui distingue « ce
> dépôt n'a pas ce défaut » de « mon instrument ne voit pas ce défaut » — et les
> deux rendent le même vert.

Remède : `balancedParens`, un lecteur à PARENTHÈSES équilibrées, qui traverse les
guillemets (une parenthèse dans `'pas membre (encore)'` déséquilibre le compte) et
rend `null` plutôt qu'un texte voisin quand l'index ne désigne pas une
parenthèse. Trois témoins l'épinglent, dont celui du cas exact qui mentait. Et la
forme juste d'à côté ne se copie pas : c'est la règle du cycle 91, ici dans
l'autre sens — la fonction partagée était la bonne, c'est le FORMAT qu'elle lit
qui n'était pas celui du nouveau site.
