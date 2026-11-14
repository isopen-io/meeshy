# Le message d'une garde ne s'évalue que sur ROUGE

*2026-11-14, cycle 158. Issues : #18240 (le message qui plantait), #18121
(l'extension Swift qui l'a révélé), #18120 (le défaut que la garde doit nommer).*

## La règle

Une garde a deux moitiés : **elle BLOQUE**, et **elle NOMME**. La seconde ne
s'exécute jamais sur le chemin vert — elle vit dans le `.map()` d'une liste
vide. Une suite verte, même cent fois verte, ne prouve donc **rien** du texte
que la garde servira le jour où elle trouvera quelque chose.

`socket-payload-shape-gate` (#18070) a vécu ainsi trois jours avec un `REPO`
employé deux fois et jamais importé. Confrontée le 2026-11-14 à une divergence
injectée, elle rendait :

```
ReferenceError: REPO is not defined
```

au lieu de nommer l'événement, le champ, la classe et les deux fichiers. Elle
bloquait encore — la moitié la plus importante tenait. Mais **nommer la dérive
EST ce qui la distingue d'un `expect(false)`** : sans le message, elle renvoie
celui qui la subit à la relecture manuelle qu'elle existe pour supprimer.

> C'est la leçon de #18069 — « un témoin qui CONSTRUIT l'événement en Kotlin
> saute le décodeur et reste vert » — appliquée au TEXTE de la garde plutôt qu'à
> son sujet. **Ce qui n'est pas exécuté n'est pas vérifié**, et le rapport d'une
> garde verte n'est jamais exécuté.

## Ce qu'il faut faire à la place

**Sortir la composition du rapport du fichier de test, et lui donner un témoin
sur le chemin VERT.** Une fonction pure, une fixture, un `expect` sur le texte
rendu : la prochaine interpolation fautive rougit chez celui qui l'écrit.

Le gain est double, et le second ne se voit qu'après : une fois le rapport
devenu une fonction, **le paramétrer coûte une ligne**. Le symptôme diffère
entre miroirs — `MissingFieldException` côté Kotlin, `keyNotFound` côté Swift —
mais la divergence est la même. La garde Swift (#18121) a donc réemployé le
rapport de sa jumelle au lieu d'en écrire un second, qui aurait dérivé.

## Comment l'attraper ailleurs

La question à poser à toute garde qu'on écrit ou qu'on relit :

> **L'ai-je vue ROUGIR, et ce qu'elle a dit était-il utilisable ?**

« Vue rougir » ne suffit pas : un `ReferenceError` est un rouge. Il faut avoir
LU le message. Et pour une garde dont on ne peut pas provoquer le rouge sans
casser le dépôt, la seule réponse honnête est d'extraire le rapport et de le
tester à part.

Corollaire de forme : **une variable employée seulement dans un message n'est
tenue par aucun test**, et un `tsc` de projet ne la rattrape pas toujours — ici
le fichier compilait, parce que le compilateur de la suite ne couvre pas ce
dossier avec la même sévérité que l'exécution. La relire à l'œil est le dernier
rempart ; en faire une fonction testée est le premier.
