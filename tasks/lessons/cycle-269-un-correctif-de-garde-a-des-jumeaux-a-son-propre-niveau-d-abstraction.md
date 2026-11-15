## Cycle 269 — Un correctif de garde a des JUMEAUX à son propre niveau d'abstraction

Le cycle 268 a fermé la coupe UTF-16 non sûre de `SecuritySanitizer.truncate`
(un piège armé SANS appelant de production) et a noté que les troncateurs
homonymes (`truncateMessage` / `truncatePreview` / `truncateMessagePreview`)
étaient « distincts » — les laissant hors du lot.

En posant à ces homonymes la question du 268 — *coupent-ils un point de code ou
une unité de code UTF-16 ?* — **sept** troncateurs de contenu utilisateur SERVI
portaient le même défaut, cette fois en production active, sur le chemin le plus
sensible du dépôt : le corps de la bannière push (`pushBody`), la traduction
poussée (`servedTranslationFields`), les `details` d'e-mail, et trois aperçus
persistés. Un `😀` à cheval sur la frontière de coupe ⇒ substitut haut orphelin
⇒ `�` sur l'écran verrouillé.

> **Fermer une garde à un endroit ne ferme pas sa CLASSE.** Le 268 avait la
> classe sous les yeux — il a NOMMÉ les homonymes — et les a écartés parce
> qu'ils étaient « distincts » (noms différents, fichiers différents). Distinct
> par le NOM n'est pas distinct par le DÉFAUT : les sept faisaient
> `str.substring(0, N)` sur du contenu émoji. La question qui les attrape n'est
> pas « ce site est-il le même ? » mais **« ce site applique-t-il la même
> OPÉRATION sur le même espace d'entrée ? »**.

Deux corollaires de forme :

- **La duplication est le vecteur qui répand un défaut de garde.** Les deux
  `truncatePreview` (messaging / posts) étaient byte-identiques ; les cinq autres
  étaient des `.substring` in-line. Il n'existait AUCUN site unique à corriger,
  donc le même bug vivait en sept exemplaires. Le correctif n'ajoute pas la
  sûreté sept fois : il extrait UNE SSOT (`truncateByCodePoints`,
  `utils/truncate-text.ts`, `Array.from` → points de code) et supprime les copies
  — c'est le mécanisme même qui empêche la prochaine divergence (leçon 245i).

- **Le correctif est un sur-ensemble strict de correction, donc invisible aux
  fixtures ASCII.** Pour toute entrée ASCII (unités de code == points de code),
  la sortie est identique ; elle ne diffère QUE là où l'ancien code produisait un
  substitut orphelin. Les témoins existants (`endsWith('…')`, `length ≤ 101`)
  restaient verts sur le défaut — le témoin qui l'attrape s'écrit sur du hors-BMP,
  jamais sur l'ASCII (jumeau de la leçon 261 « un témoin de rang s'écrit sur un
  rang AUTRE que le premier »).
