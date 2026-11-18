## Une poussée n'est pas gratuite : sous `cancel-in-progress`, elle ANNULE le verdict en vol (cycle 178, #19662)

Mesuré sur la PR #19706. En attendant le verdict Android — la seule preuve que
#19662 exigeait —, j'ai poussé trois commits de documentation (journal, leçon,
carte). Chacun a évincé le run en cours. Bilan sur quatre SHA
(`27205179a`, `7969c17fb`, `241d016b2`, `6c590009e`) et huit runs :

```
run 44334233889 (ci.yml)   : 17 jobs cancelled + 1 failure (« Verdict CI »)
run 44334233942 (ios-sdk)  :  4 jobs cancelled + 1 failure (« Verdict iOS SDK »)
```

**Sur les ~70 jobs de ces runs, aucun n'a rendu de verdict.** Les tranches
macOS, elles, attendaient six minutes en « File d'attente Mac » et étaient
annulées avant de démarrer : les suites du SDK iOS n'ont donc tourné sur AUCUN
de ces SHA. Le seul job conclu était l'agrégateur, rouge faute de résumé à
agréger — quatre fausses alertes, chacune un tour de triage.

> **Un commit qui n'a pas besoin du verdict ne se pousse pas en attendant le
> verdict.** Journal, leçon, carte se committent localement et partent AVEC le
> lot suivant, ou après la fusion. Sous `cancel-in-progress`, la cadence de
> poussée n'est pas une question de style : elle décide si le dépôt obtient un
> verdict ou zéro.

C'est l'exacte réciproque de la leçon du cycle 157 (« un run ANNULÉ n'est ni un
verdict ni une panne »), qui dit de ne pas LIRE une annulation comme un échec.
Celle-ci dit de ne pas la PROVOQUER — et c'est celle qu'un agent paie, puisqu'il
pousse dix fois plus souvent qu'un humain et qu'il pousse volontiers de la
documentation pour « occuper » une attente.

### Le réflexe outillé

`scripts/ci/pr-verte.mjs` ne juge que le SHA de TÊTE. Devant une notification
d'échec, la première question n'est donc pas « qu'est-ce qui casse ? » mais
**« ce SHA est-il la tête ? »** — si non, il n'y a rien à instruire. Les quatre
alertes de ce cycle se répondaient toutes ainsi, et la cinquième, elle, était
vraie (`journal-one-file-per-entry-guard`, sur la tête, et elle appartenait à
`dev`).

### Le corollaire qui rattrape le coût

Quand une poussée est de toute façon nécessaire — un vrai rouge à corriger —,
tout ce qui attendait localement part DANS la même poussée. Un lot, une
poussée, un verdict.
