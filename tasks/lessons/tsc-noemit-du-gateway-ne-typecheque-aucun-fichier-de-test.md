## `tsc --noEmit` du gateway ne typechèque AUCUN fichier de test — le gate est `tsconfig.test.json` (cycle 188, #19956)

J'ai livré un lot avec `tsc --noEmit` EXIT=0 annoncé comme preuve, trois fois,
dans trois messages de commit. La CI a rendu `Tests · gateway · tranche 2/3`
ROUGE : **cinq erreurs de type dans mes deux fichiers de test neufs**, toutes
`TS2554`, et le cliquet de dette de types est passé de 76 à 81.

`services/gateway/tsconfig.json` **exclut `__tests__`**. Le `CLAUDE.md` du
répertoire l'écrit, et il écrit aussi que ts-jest ne typechèque plus rien
depuis #10203 : **le SEUL gate de types des fichiers de test est
`tsc -p tsconfig.test.json --noEmit`**, lu par
`src/__tests__/tsc-never-loaded-tests-ratchet.test.ts`.

> **Un gate vert n'atteste que de SA portée, et la portée se lit dans son
> `tsconfig`, jamais dans son nom.** « `tsc --noEmit` passe » se relit comme
> « le lot compile » alors que ça veut dire « le lot compile HORS de ce que ce
> projet exclut » — et ce qu'il exclut est exactement ce que le lot vient
> d'ajouter de plus volumineux : ses témoins.

La commande à lancer avant de dire qu'un lot du gateway compile, les DEUX :

```bash
npx tsc --noEmit                                   # la production
npx tsc -p tsconfig.test.json --noEmit --pretty false \
  | grep -E 'error TS' | grep -vE 'TS2322|TS2339|TS2345|TS2740' | wc -l
```

Le second doit rendre **au plus le plafond** du cliquet (76 au 2026-11-20).

### La faute de type elle-même vaut d'être connue

`jest.fn(async () => ({ count: 2 }))` infère un mock à **ZÉRO argument** :
`expect(mock).toHaveBeenCalledWith({ where: … })` y est un `TS2554`
« Expected 0 arguments, but got 1 ». Le témoin PASSE à l'exécution — jest ne
regarde pas les types — donc rien ne le signale là où on travaille.

Le correctif n'est pas un cast : c'est de **déclarer le paramètre**, ce qui
rend le double plus utile qu'avant puisqu'il ÉNONCE la forme de l'appel qu'il
attend :

```ts
const del = jest.fn(async (_args: { readonly where: { readonly id: string } }) => ({ id: MSG_ID }));
```

### Et le cliquet ne pouvait pas me prévenir en local

Lancé dans ce conteneur plus tôt dans la session, il tombait sur son AUTRE
assertion — « la commande voit bien un corpus substantiel » — parce que la
commande `tsc` y rendait 0 ligne. J'ai rangé cet échec parmi les
« environnementaux » avec cinq autres suites d'image, ce qui était vrai de ce
jour-là et **m'a privé du seul témoin qui aurait vu mes cinq erreurs**.

> Un cliquet qui échoue sur sa garde anti-mesure-vide n'est pas « un rouge
> d'environnement » : c'est **un cliquet désarmé**, donc une absence de
> couverture sur tout ce qu'il garde. La question à poser à un rouge qu'on
> classe environnemental n'est pas « vient-il de mon lot ? » mais **« que
> cessais-je de mesurer en l'écartant ? »**.
