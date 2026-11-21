## Pousser sur la branche ANNULE le verdict en vol — et l'annulation pose un rouge plus visible que le run qu'elle retire (cycle 181, #19755)

*2026-11-19. Mesuré en le subissant quatre fois sur la même PR (#19781), pendant que la CI
des PR est GELÉE et que la file d'Actions ne draine pas.*

**Le mécanisme.** `ci.yml:114-115` :

```yaml
concurrency:
  cancel-in-progress: ${{ github.ref != 'refs/heads/dev' && github.ref != 'refs/heads/main' }}
```

Toute poussée sur une branche de travail annule le run en vol de cette branche — y compris
un `workflow_dispatch` lancé exprès pour obtenir un verdict pendant le gel. `dev` et `main`
sont exemptés ; une branche `claude/*` ne l'est pas.

**Le piège de lecture, et c'est lui qui coûte.** Un run annulé fait échouer son job de
VERDICT (ses amonts sont `cancelled`, donc le verdict conclut `failure`), et ce `failure`
part sur la PR comme un check-run rouge nommé « Verdict CI ». Donc :

> **Annuler un run — soi-même ou par une poussée — rend la PR plus rouge que de ne jamais
> l'avoir lancé.** Et le rouge ne dit pas sa cause : il faut ouvrir le run et constater que
> ses dix-huit jobs sont `cancelled`, qu'aucun test n'a tourné, et que sa tête est
> superseded. Une session suivante qui lit « Verdict CI: failure » conclura que le lot est
> rouge.

**La séquence juste**, qui n'est pas celle qu'on fait spontanément :

1. finir **TOUTES** les poussées (y compris la fusion de `dev`, y compris les journaux) ;
2. `workflow_dispatch` **UNE** fois ;
3. attendre sans toucher à la branche ;
4. fusionner.

Un verdict et une poussée ne cohabitent pas. Et un hook qui demande de pousser les commits
non poussés — légitime en soi — déclenche exactement l'annulation : le commit de journal
que je gardais local pour protéger le verdict a été poussé sur sa demande, et le verdict
est mort avec.

**Le régime complet, à mesurer avant de conclure quoi que ce soit sur « la CI ».** Trois
faits indépendants se superposent aujourd'hui, et chacun produit un symptôme qui ressemble
aux deux autres :

| fait | symptôme | ce qu'il VAUT |
|---|---|---|
| gel délibéré de la CI des PR (`vars.PR_CI_GEL`) | un run `pull_request` conclut `skipped`, ses 18 jobs compris | **zéro** — et plus trompeur qu'« aucun run » |
| `cancel-in-progress` par branche | « Verdict CI » ROUGE sur une tête superseded | **zéro** — aucun test n'a tourné |
| file d'Actions saturée (mesuré : 73 runs en file, 5 en cours, tête de file immobile 35 min) | un `workflow_dispatch` reste `pending` des heures | **rien encore** |

Et une quatrième conséquence, structurelle, qui mérite d'être dite : **tant que la file ne
draine pas ET que `dev` avance toutes les dix minutes, une branche ne peut JAMAIS accumuler
un verdict en restant à jour** — chaque fusion de `dev` annule le run précédent. Le dépôt a
prévu la sortie (`dev` et `main` exemptés du gel comme de l'annulation : la CI
d'intégration tourne), mais une session à qui l'on a demandé « verdict vert avant fusion »
est alors bloquée par construction, et doit le DIRE plutôt que de fusionner à l'aveugle ou
d'attendre indéfiniment.

**Famille.** C'est la leçon du cycle 180 (« une mesure d'infrastructure a une date de
péremption très courte ; remesurer avant de FUSIONNER, pas seulement avant d'ouvrir »), avec
l'addition que le cycle 181 a payée : **remesurer ne suffit pas si l'on ne sait pas ce que
chaque rouge VEUT DIRE.** Les trois zéros du tableau ci-dessus se lisent tous « la CI dit
non ».
