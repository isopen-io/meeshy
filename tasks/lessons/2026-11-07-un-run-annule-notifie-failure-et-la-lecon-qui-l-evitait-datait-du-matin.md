## 2026-11-07 — Un run ANNULÉ notifie « failure », et la leçon qui l'évitait avait été écrite le matin même

Deux moitiés d'une même erreur, commises dans l'ordre.

### 1. J'ai détruit ma propre preuve, deux fois

`tasks/lessons/2026-11-07-sur-une-branche-un-second-dispatch-annule-le-premier.md`
existait **depuis le matin de ce jour** et dit exactement ce qu'il ne faut pas
faire : sur toute référence autre que `dev` et `main`, `ci.yml` déclare
`cancel-in-progress: true`, donc un second dispatch — ou un simple commit de
plus — tue le run en vol. La CI des PR étant gelée (`vars.PR_CI_GEL`), ce run
est la SEULE preuve, et il n'en existe qu'une par branche, celle de la DERNIÈRE
tête poussée.

J'ai dispatché trois fois : sur la tête du lot, puis sur la fusion de `dev`,
puis sur un commit de témoin. Les deux premiers sont morts `cancelled`.

**Pourquoi la leçon n'a pas servi** : je n'ai pas lu `tasks/lessons/` avant
d'agir, alors que le `CLAUDE.md` racine le prescrit à l'ouverture de session
(« grep `tasks/lessons/` pour son domaine »). Elle datait du matin : même une
session qui aurait lu le dossier la veille ne l'aurait pas eue. Le dossier des
leçons n'est pas un acquis de formation, **c'est un état à relire au moment
d'agir** — et le moment d'agir, ici, était « je vais demander une preuve CI »,
pas « je démarre ».

> La requête qui l'attrape n'est pas `ls tasks/lessons` au démarrage mais
> `ls tasks/lessons | grep <le mot de ce que je m'apprête à faire>` juste avant
> de le faire. Ici : `grep -i dispatch`.

### 2. Et le run annulé m'a été notifié comme un ÉCHEC

Le fil d'événements a rendu, pour le run `42373469062` :

```
kind="check_run.completed" {"check":"Verdict CI","conclusion":"failure"}
```

Le run, lui, était `conclusion: cancelled` : ses seize jobs sont `cancelled`, et
« Verdict CI » rend `failure` **parce que ses dépendances ont été annulées**, pas
parce qu'un témoin est tombé. Un seul job avait eu le temps de conclure pour de
bon (`Trivy`, `success`).

C'est un faux rouge qui a la forme exacte d'un vrai, et il envoie chercher une
panne de test qui n'existe pas. La consigne d'événement dit d'ailleurs
« investigate the failure » — elle a raison, et l'investigation juste commence
par le RUN, jamais par le job.

> **Devant un `conclusion: failure` sur un check d'agrégation, lire d'abord la
> conclusion du RUN et l'état de ses jobs.** `cancelled` partout + un seul job
> conclu = personne n'a rien mesuré. Un run inachevé n'est pas un verdict, dans
> aucun des deux sens : il ne prouve ni le vert ni le rouge.

Corollaire de méthode, le même que celui du faux VERT du matin (tous les jobs
`skipped` sous un « success » de 30 secondes) : **les deux faux verdicts de
cette journée se lisent au même endroit — la liste des jobs** et leur
conclusion individuelle. Un agrégat ne dit jamais ce qui a tourné.

### Ce que je fais maintenant

- Ne rien pousser sur la branche tant que le dispatch dont j'attends la
  conclusion y tourne. Un commit documentaire l'annule comme les autres.
- Une preuve par tête, demandée une fois, attendue jusqu'au bout.
- Avant de citer un rouge de CI : la conclusion du run, puis la liste des jobs.
