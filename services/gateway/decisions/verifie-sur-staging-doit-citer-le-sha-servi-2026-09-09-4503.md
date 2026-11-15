## « Vérifié sur staging » doit citer le SHA servi (2026-09-09, #4503)

**Constat** : le workflow `Docker` construit et POUSSE l'image `staging` à
chaque poussée sur `dev`, mais ne la DÉPLOIE pas — aucune étape `ssh`/`deploy`
après le push du registre, et rien côté hôte ne tire l'image. Mesuré le
2026-08-30 : 3 h 30 de commits verts, poussés, jamais servis, pendant lesquelles
toute vérification faite « sur staging » mesurait du code ANCIEN et rendait un
verdict qui avait l'air d'une preuve — la forme la plus coûteuse d'un faux vert,
parce qu'elle ne se signale pas, elle CONFIRME.

L'issue proposait trois pistes non exclusives : (a) le workflow pousse ET
déploie (`ssh` après le push — une clé d'hôte de plus dans les secrets du
dépôt) ; (b) l'hôte TIRE (`watchtower`/cron — aucune clé sortante, mais le
déploiement n'apparaît nulle part dans l'historique CI, ce qui est exactement
ce qui rend le retard invisible aujourd'hui) ; (c) déploiement inchangé, mais
l'écart rendu MESURABLE — le gateway expose le SHA qu'il sert réellement, pour
qu'une preuve « sur staging » puisse CITER le commit qu'elle a interrogé.

**Décision** : (c) seule, pour ce lot. Elle ferme le défaut décrit par l'issue
sans exiger d'accès à l'infrastructure de déploiement (ni clé SSH vers
`root@meeshy.me`, ni décision sur l'automatisation du pull) — (a) et (b)
restent ouvertes, à trancher par une session qui a cet accès et peut MESURER le
délai push→servi qu'elles produiraient (critère de fin #4 de l'issue).

Le mécanisme existait déjà, construit avant ce lot et laissé sans sa
documentation de décision : `resolveBuildInfo()` (`packages/shared/utils/build-info.ts`)
lit `GIT_COMMIT`/`BUILD_DATE`, posés en variables d'environnement au build par
les trois Dockerfiles (`ARG VCS_REF` ← `github.sha`, `.github/workflows/docker.yml:413`)
et **remonté sur `GET /health`** (`route-registration.ts:140`, champ
`build: { commit, commitShort, builtAt }`) — le web et le translator portent le
même contrat de champs (`build_info.py` pour ce dernier).

**Ce que ce lot ferme, précisément** : les critères de fin #1 (décision écrite,
ici) et #3 (le mode d'emploi cite le SHA, ci-dessous) de #4503. Le critère #2
(le gateway EXPOSE le commit servi) était déjà satisfait avant ce lot — c'est
ce qui a permis de fermer les deux autres sans toucher au code.

**Mode d'emploi — une preuve « sur staging » DOIT citer le SHA interrogé** :

```bash
curl -s https://gate.staging.meeshy.me/health | jq '.build'
# { "commit": "<sha complet>", "commitShort": "<7 chars>", "builtAt": "<ISO-8601>" }
```

Comparer `commit` (ou `commitShort`) au SHA du commit que la vérification
prétend couvrir (`git rev-parse HEAD` sur la branche poussée, ou le SHA affiché
par le run CI). Une vérification « sur staging » qui ne cite pas ce SHA n'est
pas une preuve — elle peut tout aussi bien porter sur le déploiement précédent.
`commit: null` signifie une image qui n'a jamais reçu `VCS_REF` au build (repli
local, ou étape de build-arg cassée) : dans ce cas aussi, aucune vérification
« sur staging » ne peut être tenue pour une preuve tant que le champ ne rend
pas de valeur.

**Alternatives rejetées** : (a) et (b), reportées — pas écartées. Les deux
exigent un arbitrage d'infrastructure (clé SSH sortante vs. absence totale de
traçabilité CI du déploiement) et une mesure du délai réel, qu'une session sans
accès à `/opt/meeshy/staging` ne peut ni trancher ni prouver ; les documenter
sans les livrer aurait affiché une fausse certitude.

**Preuve** : `packages/shared/utils/build-info.ts` (`resolveBuildInfo`,
`readNonEmpty` — aucune valeur de repli fabriquée, `null` explicite si l'image
ne porte pas `GIT_COMMIT`) et `packages/shared/__tests__/utils/build-info.test.ts` ;
`route-registration.ts:140` (`build: resolveBuildInfo()` sur `GET /health`) ;
`services/gateway/Dockerfile:169-187` (`ARG VCS_REF`/`BUILD_DATE` redéclarés au
stage `runner`, avec la raison écrite : un `ARG` ne franchit pas un `FROM`) ;
`.github/workflows/docker.yml:413` (`VCS_REF=${{ github.sha }}`).

**Conséquences** : aucun changement de code dans ce lot — la preuve existait,
la décision et le mode d'emploi manquaient. Le critère de fin #4 de l'issue
(mesurer le délai push→servi si (a) ou (b) est retenu) reste ouvert avec (a)/(b)
eux-mêmes ; il ne s'applique pas à (c), qui ne change rien au calendrier de
déploiement. Suivi : la mesure de #4631 (dérive du compose de staging sur le
dépôt) reste un défaut distinct, non fermé par cette décision.
