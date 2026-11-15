## Leçon 611 — Un témoin qui lit le TEXTE SOURCE verdit sur un correctif ANNULÉ

**Mesuré le 2026-09-15 sur trois lots indépendants** de la chaîne de publication (#6577, #6579, #6164).
Trois relecteurs adverses, trois fois le même résultat : le correctif neutralisé **en conservant les chaînes
que les greps cherchent**, et les témoins restent verts.

| lot | mutation | verdict |
|---|---|---|
| #6577 | les 8 affectations de `retractMedia` rendues no-op (`documentLocalMedia = mediaPorters.localMedia`) | **241/241 verts** |
| #6579 | `.opacity(0)` sur la bande ; puis `onDisplayedContextChange: { _ in }` | **13/13** puis **33/33 verts** |
| #6164 | garde fail-closed annulée par `&& false` ; protection perdue par `servedQuotedAttachments({}, …)` | **27/27 verts** |

Les trois correctifs étaient **plausiblement justes**. Aucun n'était **prouvé**.

### La cause structurelle, qui rendait le défaut inévitable sur iOS

Sur #6577, la raison n'était pas « le testeur a été paresseux » : **un `@State` a un setter `nonmutating` qui
n'écrit nulle part tant que SwiftUI n'a pas installé la vue.** Aucun témoin ne *pouvait* distinguer
« appliqué » de « calculé puis jeté » — la struct pure était testable, son application ne l'était pas.
Le remède a été de sortir les huit porteurs du `@State` vers un store observable, puis de tester l'aller-retour
porteurs → charge.

> **Quand un correctif passe par un `@State`, poser la question AVANT d'écrire son témoin :
> qu'est-ce qui, dans ce test, installe la vue ?** Sans réponse, le témoin mesurera le calcul, jamais l'écriture.

### Le geste qui l'attrape

**Neutraliser sa propre règle en conservant les chaînes que les greps cherchent, puis rejouer.**
Si rien ne rougit, le témoin ne vaut rien. Un source-guard garde un *câblage* — il empêche un futur lot de
re-poser un motif interdit — mais il ne peut jamais être la seule preuve qu'une feature marche.

### Trois pièges de la neutralisation elle-même, payés dans la même vague

1. `git checkout -- <fichier>` restaure **HEAD**, pas l'état de travail non commité : il a annulé un correctif
   voisin pas encore commité. **Copier en `.bak` hors du dépôt** avant de muter, restaurer depuis la copie.
2. Une assertion **non scopée** (`src.contains("originalLanguage: language,")` sur le fichier entier) est
   satisfaite par n'importe quelle occurrence — y compris par la chaîne **citée dans un commentaire**.
   Une fenêtre `body(from:to:)` ne distingue pas le code du commentaire.
3. Un oracle peut rougir sur une mutation **et** sur un arbre intact. Le harnais de #6579 gardait
   `window.safeAreaInsets.top` (sa fenêtre, toujours 62) au lieu de `DeviceLayout.safeAreaTop`, la seule
   grandeur que la production lise : il accusait la bande quand la scène n'était pas `.foregroundActive`.
   **C'est la présente leçon retournée contre son propre outil** — un témoin qui ne mesure pas la quantité
   qui gouverne ce qu'il observe ne mesure rien. Et le défaut d'environnement rendait *le même verdict*
   que la mutation `.opacity(0)` : 6 témoins, 27 assertions. D'où la nécessité de diagnostiquer l'environnement
   à part, avec un message qui l'accuse **lui** et jamais la feature.

Voir aussi la leçon sur le disque saturé : un rouge qui ne parle pas du code parle de la **machine**.
