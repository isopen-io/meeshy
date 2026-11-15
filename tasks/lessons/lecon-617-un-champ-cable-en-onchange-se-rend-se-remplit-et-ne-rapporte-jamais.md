## Leçon 617 — Un champ câblé en `onChange` se rend, se remplit… et ne rapporte jamais rien

Lot #5561 (rejoindre en anonyme). Le formulaire d'invité était écrit, l'écran se
rendait juste, le DOM portait les bonnes valeurs — et trois témoins d'écran
échouaient sur « rien n'est parti », sans qu'aucun message ne dise pourquoi.

J'ai supposé cinq fois, et corrigé cinq fois à côté : le setter natif de `value`,
la chaîne de prototypes sous happy-dom, le clic sur un bouton `type="submit"`,
l'ordre des imports face à l'enregistrement du DOM, le mouleur. Chaque
correction était défendable ; aucune n'était la cause.

**Ce qui a tranché est une sonde NEUTRE** — un fichier de témoin qui ne monte
RIEN du produit et n'importe que l'enregistrement du DOM
(`src/test-support/react-events-probe.test.tsx`) :

| sonde sur un arbre nu | verdict |
|---|---|
| rendu d'un `<input>` | ✅ |
| `onClick` d'un `<button>` | ✅ |
| `onSubmit` d'un `<form>` | ✅ |
| `onInput` d'un `<input>` | ✅ |
| **`onChange` d'un `<input>`** | ❌ |
| `onChange` d'un `<select>` (événement `change`) | ✅ |

React fait normalement de `onChange` un synonyme de l'événement `input` pour un
champ texte ; cette équivalence repose sur son suivi de valeur, que happy-dom ne
satisfait pas. La convention du dépôt — `onInput` sur les champs texte
(`components/composer.tsx:569`) — n'était donc pas un goût : c'était la seule
qui fonctionne. Mon composant était l'outlier, **en code de production**, et le
témoin avait raison.

> **Quand plusieurs corrections plausibles échouent d'affilée, arrêter de
> corriger et écrire une sonde qui n'importe RIEN du produit.** Elle coûte dix
> minutes et rend un verdict binaire là où chaque correction rendait une
> nouvelle hypothèse. Le signe qu'il est temps : la troisième cause « évidente »
> qui ne change rien.

Deux corollaires, payés dans le même lot :

- **Un `expect` qui rend `undefined` plutôt que la valeur vide ne dit pas
  « champ vide », il dit « élément absent ».** Lire les champs d'un formulaire
  APRÈS un geste qui le démonte mesure autre chose que ce qu'on croit.
- **Un élément CONTRÔLÉ dont le possesseur n'accepte pas le changement (un
  espion, dans un témoin isolé) restaure sa valeur aussitôt.** On y mesure ce
  qui est RAPPORTÉ, jamais ce que le champ retient — sinon le témoin échoue sur
  une vérité qui ne dit rien du câblage.

Prolonge [[reference_a_red_on_both_sides_of_the_diff_also_measures_the_machine]] :
celle-là disait qu'un rouge des deux côtés mesure la machine ; celle-ci dit
comment le PROUVER sans démonter le produit.
