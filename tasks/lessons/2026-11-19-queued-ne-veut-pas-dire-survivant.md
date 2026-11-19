## « queued » ne veut pas dire SURVIVANT : j'ai vérifié qu'une poussée n'avait pas évincé mon verdict, et la vérification ne pouvait pas le dire (cycle 182, #19800)

*2026-11-19. Suite directe de `2026-11-18-une-poussee-annule-le-verdict-en-vol.md`,
qui décrit exactement le piège où je suis tombé — après l'avoir cité.*

**Ce qui s'est passé.** J'ai lancé le verdict par `workflow_dispatch` sur l'arbre
fusionné, puis poussé un commit de journal. Me souvenant de la leçon du
2026-11-18 (« sous `cancel-in-progress`, une poussée ANNULE le verdict en vol »),
j'ai vérifié :

```
$ gh api .../runs/44472642352 --jq '{status,conclusion}'
{"conclusion":null,"status":"queued"}
```

J'en ai conclu « le run a survécu », je l'ai écrit, et j'ai continué. Onze minutes
plus tard, le run portait **17 jobs sur 18 annulés** — seul l'agrégateur restait,
qui allait conclure rouge faute de résumé à agréger. La poussée avait bien évincé
le verdict ; ma vérification ne pouvait pas le voir.

**La règle.**

> **Le `status` d'un run n'est pas l'état de ses JOBS.** Un run reste `queued`
> tant qu'un seul de ses jobs n'a pas conclu, et l'annulation se propage
> job par job : entre la poussée et la propagation, le run annoncé est
> *rigoureusement indiscernable* d'un run intact. La seule mesure qui répond à
> « mon verdict est-il vivant ? » est le relevé des JOBS :
>
> ```
> gh api repos/O/R/actions/runs/$ID/jobs --paginate \
>   --jq '[.jobs[] | "\(.status)/\(.conclusion)"] | group_by(.) | map({(.[0]): length}) | add'
> ```
>
> `{"completed/cancelled": 17, "queued/null": 1}` dit ce que `status: "queued"`
> cachait.

**Pourquoi la leçon citée n'a pas suffi, et c'est le point.** Je l'avais lue, je
l'avais citée dans le journal du cycle, et je l'ai même invoquée pour décider de
ne plus pousser — *après* la poussée fautive. Ce qui a manqué n'est pas la
connaissance de la règle, c'est l'**ordre** : la leçon prescrit de ne pas pousser
pendant un verdict, et je l'ai appliquée à partir du moment où j'y ai pensé, pas
à partir du dispatch. Une règle dont le déclencheur est « quand j'y pense » ne
protège que les cas où on y pense.

> La forme actionnable n'est donc pas « ne pas pousser pendant un verdict » mais
> **« après un dispatch, la branche est GELÉE jusqu'au verdict »** — un état, pas
> une intention. Ce qui se committe entre les deux se committe *localement*, et
> part avec la poussée d'après. C'est littéralement ce que la leçon du 2026-11-18
> écrivait ; je l'ai lue comme un conseil de prudence et non comme un invariant.

**Le corollaire de coût.** Chaque éviction coûte un cycle de verdict complet
(~80 min ici) et laisse derrière elle un agrégateur rouge sur la PR, qui coûte à
son tour un tour de triage à qui lit les checks — y compris à moi, deux fois dans
la même session. Le prix n'est pas le run perdu, c'est la fausse alerte qu'il
laisse.

**Et la vérification qui aurait marché est plus courte que celle qui a échoué.**
Interroger `/jobs` au lieu de `/runs` ne demande pas de connaître ce piège : elle
demande seulement de mesurer la chose dont on parle (les jobs) plutôt que son
enveloppe (le run). Même famille que « un compte est une AFFIRMATION » — ici
c'est un ÉTAT, et il se mesure à son grain, pas au grain qui l'agrège.
