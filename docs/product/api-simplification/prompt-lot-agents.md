# Avancer par LOT — le prompt des agents

> Procédure établie le 2026-08-29, après avoir mesuré que livrer une issue en série
> coûtait **75 min dont 45 min d'attente** (gates + build Docker + déploiement).
> Le goulot n'est jamais l'écriture : c'est la sérialisation.

## Le principe en une phrase

**N agents écrivent en parallèle dans UN SEUL arbre, chacun sur un territoire de
FICHIERS exclusif ; l'intégrateur seul touche aux fichiers-carrefour, committe,
pousse une fois, déploie une fois, et ne ferme que ce que la mesure rend vert.**

Ce n'est pas la stratégie des worktrees parallèles — celle-là a coûté cinq
features régressées le 2026-08-27, et la directive qui en est sortie dit
exactement ceci : *un worktree, une branche, répartition par FICHIERS*.

## Composer le lot

Cinq à six issues, choisies **par disjonction de fichiers**, jamais par milestone
ni par numéro. Deux issues qui touchent le même fichier ne partent pas ensemble —
même « juste pour un import ».

Avant de lancer, poser le **bail** sur chacune : `Status = In Progress` dans le
projet « Meeshy — pilotage » + un commentaire de réservation daté. Vérifier
d'abord que l'issue **est** dans le projet : une issue absente du projet est
invisible aux autres agents, donc ni réservable ni réservée.

## Les fichiers-carrefour, réservés à l'intégrateur

```
services/gateway/src/route-registration.ts
packages/shared/prisma/schema.prisma
packages/shared/types/index.ts
apps/ios/project.yml
apps/ios/Meeshy/Localizable.xcstrings
```

Un agent qui en a besoin le **déclare** ; il ne l'écrit pas. C'est cette règle,
et elle seule, qui rend le parallélisme sûr.

---

# Le prompt

Remplacer `{{ISSUE}}`, `{{TERRITOIRE}}` et `{{CONSIGNES}}`. Le reste est invariant.

```
Dépôt : /Users/smpceo/Documents/v2_meeshy. Branche courante : dev (locale).
NE CHANGE PAS DE BRANCHE.

=== RÈGLES ABSOLUES DU LOT (d'autres agents travaillent DANS LE MÊME ARBRE) ===

1. TERRITOIRE. Tu ne modifies QUE les fichiers de ton territoire, énoncé plus bas.
   Si tu dois toucher un fichier hors territoire, tu NE LE FAIS PAS : tu le
   DÉCLARES dans `edits_hors_territoire` avec le chemin, la ligne et le texte
   exact à insérer. L'intégrateur l'appliquera en série. Un agent qui écrit hors
   de son territoire fait perdre le travail d'un autre.

2. FICHIERS-CARREFOUR STRICTEMENT INTERDITS, sans exception :
   services/gateway/src/route-registration.ts
   packages/shared/prisma/schema.prisma
   packages/shared/types/index.ts
   apps/ios/project.yml
   apps/ios/Meeshy/Localizable.xcstrings
   Déclare-les dans `edits_hors_territoire`.

3. AUCUN `git` QUI ÉCRIT. Pas de commit, add, stash, checkout, branch, restore,
   reset. `git status` et `git diff` en lecture seule sont permis. L'intégrateur
   committe lui-même, par chemins explicites.

4. GATES CIBLÉES SEULEMENT. D'autres agents tournent : ne lance JAMAIS la suite
   complète (`npx jest` sans argument) ni `xcodebuild`. Uniquement :
     - services/gateway : `npm run type-check` puis `npx jest <tes suites>`
     - apps/web         : `npx jest <tes suites>`
     - apps/android     : `JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew :module:testDebugUnitTest`
   L'intégrateur lance les suites complètes une fois, à la fin, pour tout le lot.

5. TDD NON NÉGOCIABLE. Chaque témoin doit être PROUVÉ ROUGE sous la mutation
   qu'il nomme : tu casses volontairement le code, tu montres le témoin rouge, tu
   restaures, tu montres le vert. Un témoin jamais vu rouge ne protège rien.
   Rapporte chaque preuve dans `mutations_prouvees`.

6. VÉRIFIE L'ISSUE AVANT DE LA CROIRE. Le dépôt bouge vite et les issues
   vieillissent. Trois pièges mesurés le 2026-08-29 :
     - un ancrage `fichier:ligne` peut désigner un fichier qui EXISTE mais n'est
       pas le bon (deux `magic-link.ts` sous le même préfixe) — suivre l'ancrage à
       l'aveugle retire la mauvaise route ;
     - une prémisse peut être devenue FAUSSE (le correctif a déjà été livré
       ailleurs) — l'écrire produirait un correctif sans effet ;
     - un ANTI-TÉMOIN peut rendre la suite verte sur le défaut intact (un double
       qui mocke ce que le test prétend vérifier). Corrige le double AVANT
       d'écrire, sinon tu livres sur un témoin qui ne peut pas tomber.
   Dis ce que tu as trouvé de périmé dans `restant`.

7. STYLE DU DÉPÔT. Commentaires en français, denses, qui disent le POURQUOI et ce
   que le défaut COÛTAIT — jamais la paraphrase du code. Budget 800–1100 lignes
   par fichier : au-dessus, on EXTRAIT avant d'ajouter, jamais l'inverse.
   TypeScript strict, aucun `any`. Lis le CLAUDE.md racine et celui du répertoire
   où tu travailles AVANT d'écrire.

8. Tu ne fermes ni ne commentes AUCUNE issue GitHub. L'intégrateur le fait après
   mesure en intégration.

9. MÊME TRANSITOIREMENT, tu ne mutes pas un fichier hors territoire — pas même
   pour prouver qu'un témoin rougit, pas même en restaurant dans la même
   commande avec une empreinte avant/après. Un autre agent peut lire ce fichier
   pendant les quelques secondes de la mutation, et il lira un dépôt incohérent.
   Si la preuve de ROUGE exige de toucher le fichier d'un autre, DÉCRIS la
   mutation dans `mutations_prouvees` en disant qu'elle n'a pas été exécutée, et
   l'intégrateur la rejouera en série.

=== TON TERRITOIRE (issue #{{ISSUE}}) ===
{{TERRITOIRE}}

=== TA MISSION ===
Lis l'issue en entier : `gh issue view {{ISSUE}} --json number,title,body,comments`.
Les COMMENTAIRES comptent autant que le corps : ils portent les corrections de
prémisse et les avertissements posés depuis l'ouverture.

Elle porte un § « Critère de fin » numéroté. Tu traites CHAQUE critère et tu dis
pour chacun s'il est fait, partiel ou non fait, AVEC SA PREUVE (sortie de test,
mesure, extrait de code). Un critère que tu ne peux pas satisfaire depuis ce poste
— mesure en production, décision du porteur — se déclare `partiel` avec sa raison,
jamais `fait`.

Si l'issue contient une décision produit à trancher : TRANCHE-LA, écris la
RAISON dans `decisions`, applique-la. Ne rends pas la main pour un arbitrage —
une décision écrite vaut mieux qu'une question qui traîne.

=== CONSIGNES PROPRES À CETTE ISSUE ===
{{CONSIGNES}}

=== CE QUE TU RENDS ===
La structure demandée. `resume` servira de corps de message de commit : écris-le
dans le style du dépôt — dense, en français, disant ce que le défaut COÛTAIT et
pourquoi le correctif a cette forme.
`a_mesurer_en_integration` doit contenir des commandes curl EXACTES contre
https://gate.staging.meeshy.me/api/v1/... avec le résultat attendu : l'intégrateur
les rejouera après déploiement pour prouver la fin de ton issue. Une issue sans
mesure rejouable ne peut pas être fermée.
```

## Le schéma de retour

```jsonc
{
  "issue": 4156,
  "statut": "livre | partiel | bloque",
  "resume": "corps du futur message de commit",
  "fichiers_modifies": ["chemins repo-relatifs"],
  "fichiers_crees": ["chemins repo-relatifs"],
  "edits_hors_territoire": [{ "fichier": "", "raison": "", "edit": "texte exact et où" }],
  "mutations_prouvees": [{ "mutation": "", "temoins_rouges": 0 }],
  "gates": ["commande -> résultat chiffré"],
  "criteres": [{ "numero": 1, "etat": "fait|partiel|non_fait", "preuve": "" }],
  "a_mesurer_en_integration": ["curl exact -> résultat attendu"],
  "decisions": ["décision prise, avec sa RAISON"],
  "restant": ["ce qui reste, et devient un suivi"]
}
```

## La moitié de l'intégrateur

Un prompt d'agent sans protocole d'intégration n'est qu'une moitié de mécanisme.

1. **Appliquer les `edits_hors_territoire`** en série, soi-même.
2. **Lancer les suites complètes UNE fois**, mais **UNE À LA FOIS**.
   Mesuré le 2026-08-29 : lancer gateway + web + gradle simultanément produit
   **cinq faux échecs web et cinq faux échecs gateway**, tous verts isolément
   (226/226, 45/45, 9/9). Les suites lentes dépassent le délai de jest sous
   contention CPU, et un ensemble d'échecs DISJOINT sur un code identique est la
   signature d'un flake, jamais d'une régression — mais il coûte une heure à qui
   le prend au sérieux.
   Le SDK iOS (14 min) est la seule exception : il ne partage pas le CPU avec
   jest de la même façon, et ses 14 min tournent utilement pendant le build
   Docker. Android (gradle) se lance seul, après les autres.
3. **Committer par chemins explicites**, une issue par commit :
   `git commit -- <chemins>` — jamais `git commit -a`, qui emporte tout l'index et
   donc le travail des cinq autres.
4. **Un seul push, un seul build, un seul déploiement** pour tout le lot.
5. **Rejouer les `a_mesurer_en_integration`** de chaque agent contre staging.
   Fermer les issues vertes avec leur preuve ; celles dont la mesure échoue
   retournent au lot suivant, avec la mesure.
6. **Le lot N+1 s'écrit pendant que le lot N se construit.** C'est ce recouvrement
   qui ramène le coût d'une issue de ~75 min à ~5 min.

## La règle du temps mort — jamais d'attente à vide

**Dès qu'un build CI est en cours, on lance le lot suivant. On ne surveille pas
un build.** Un build dure ~20 min ; les regarder est le seul coût qu'on ne peut
pas justifier.

L'ordre est donc :

```
appliquer les édits carrefour
    │
    ├── lancer les gates complets (fond, en parallèle)
    │
gates verts ──► commit par issue ──► push (le build DÉMARRE)
    │                                     │
    │                                     └── lancer IMMÉDIATEMENT le lot N+1
    │                                            (les agents écrivent pendant le build)
    │
    └── build vert ──► déployer staging ──► rejouer les mesures
                                                │
                          ┌─────────────────────┴──────────────────────┐
                          │                                            │
                    tout est VERT                              une mesure ÉCHOUE
                          │                                            │
              fermer les issues avec leur preuve          corriger, re-pousser,
              et continuer le lot N+1                     re-déployer, re-mesurer
                          │                                            │
                          └──────────► le lot N+1 continue PENDANT ◄───┘
```

**Une mesure rouge n'arrête jamais le lot suivant.** On corrige le point rouge,
on re-pousse, on re-déploie — et pendant ce temps les agents du lot N+1
continuent d'écrire. Le seul cas où on suspend, c'est un rouge qui touche un
fichier du lot N+1 : là on prévient l'agent concerné avant qu'il n'écrive dessus.

**Ce qui ne se pipeline PAS** : les gates complets avant le push. `dev` est une
branche partagée que des agents distants tirent — y pousser du rouge empoisonne
tout le monde. Les gates passent AVANT le push, le pipeline commence APRÈS.

## Travailler à plusieurs sessions, y compris distantes

Le bail rend la file partageable, et le dépôt est la seule mémoire commune :

- une session prend un lot en posant `Status = In Progress` + son commentaire de
  réservation ; elle ne touche jamais une issue déjà `In Progress` ;
- un bail sans commit depuis **2 h** est reprenable — le dire dans le
  commentaire de reprise, avec l'horodatage de l'ancien ;
- tout part sur `dev` par des commits **par chemins explicites**, jamais `-a` ;
- avant de composer un lot, `git pull --rebase` puis relire les territoires :
  une session voisine a pu livrer un fichier qu'on croyait libre.

## Lancer une session DISTANTE (claude.ai/code, ou une autre machine)

Une session distante n'a ni le contexte de cette conversation, ni le lot composé.
Elle a besoin d'un prompt **autonome**. Le voici — il ne suppose rien d'autre que
l'accès au dépôt.

```
Tu rejoins une boucle de livraison sur le dépôt isopen-io/meeshy, branche `dev`.

AVANT TOUTE CHOSE, lis ces deux fichiers — ils portent la procédure et tu la
suis à la lettre :
  docs/product/api-simplification/prompt-lot-agents.md   (cette procédure)
  CLAUDE.md                                              (les lois du dépôt)

=== 1. PRENDS UN LOT, SANS PIÉTINER PERSONNE ===

    gh project item-list 1 --owner isopen-io --format json --limit 900

Ne prends QUE des issues dont le `Status` vaut `Todo`. Une issue `In Progress`
appartient à quelqu'un d'autre — sauf si son dernier commentaire de réservation
date de plus de 2 h ET qu'aucun commit ne la référence : elle est alors
reprenable, et tu le DIS dans ton commentaire de reprise.

Compose un lot de 4 à 6 issues **par disjonction de fichiers**, jamais par
milestone ni par numéro. Deux issues qui touchent le même fichier ne partent pas
ensemble. Pour chacune, lis le corps ET les commentaires (`gh issue view <n>
--json body,comments`) : les commentaires portent les corrections de prémisse.

Réserve-les : `Status = In Progress` + un commentaire daté nommant ta session.

=== 2. FAIS ÉCRIRE TES AGENTS ===

Un agent par issue, avec le prompt de la section « Le prompt » du fichier
ci-dessus, en remplaçant {{ISSUE}}, {{TERRITOIRE}} et {{CONSIGNES}}.
Les fichiers-carrefour sont à TOI, jamais à eux.

=== 3. INTÈGRE, PUIS PIPELINE ===

Applique les édits carrefour toi-même. Lance les gates — un par un, JAMAIS trois
en parallèle (mesuré le 2026-08-29 : trois gates lourds simultanés produisent
5 faux échecs web et 5 faux échecs gateway, tous verts isolément).

Gates verts → un commit par issue, `git commit -- <chemins>` (jamais `-a`) →
`git push origin HEAD:dev`.

**Le push démarre le build. NE L'ATTENDS PAS : compose et lance le lot suivant.**

Quand le build finit, déploie et mesure :
    ssh root@meeshy.me 'cd /opt/meeshy/staging && docker compose pull gateway-staging && docker compose up -d gateway-staging'
    curl -s https://gate.staging.meeshy.me/health     # doit porter TON commit court

Rejoue les `a_mesurer_en_integration` de chaque agent. Ferme les issues vertes
avec leur preuve ; corrige, re-pousse et re-mesure les rouges — pendant que le
lot suivant continue d'écrire.

=== CE QUI EST INTERDIT ===

- pousser sur `main` ou déployer en production (staging seulement) ;
- fermer une issue sans mesure rejouée en intégration ;
- `git commit -a`, `git add -A`, `git stash`, `git checkout` sur un arbre partagé ;
- inventer des identifiants : ils sont hors dépôt, dans `apps/ios/fastlane/.env`.
```

## Le prompt de BOUCLE pour Claude Code **web**

Une session web (claude.ai/code) n'a ni Xcode, ni SDK Android, ni forcément
l'accès SSH au serveur de staging. Le prompt ci-dessous en tient compte : il
choisit des lots que la session peut RÉELLEMENT prouver, et il refuse de fermer
une issue qu'il n'a pas pu mesurer — c'est la seule façon honnête de boucler
sans surveillance.

À coller après `/loop` :

```
Tu tiens une boucle de livraison API sur isopen-io/meeshy, branche `dev`.
Chaque itération = UN LOT. Tu ne t'arrêtes pas entre deux lots.

═══ AU DÉMARRAGE DE CHAQUE ITÉRATION ═══

1. `git pull --rebase` puis lis docs/product/api-simplification/prompt-lot-agents.md
   — c'est la procédure, tu la suis à la lettre. Lis aussi CLAUDE.md.

2. Prends la file :
       gh project item-list 1 --owner isopen-io --format json --limit 900
   Ne prends QUE des issues `Status = Todo` des milestones 65 à 73.
   Une issue `In Progress` appartient à quelqu'un — sauf si son dernier
   commentaire de réservation date de plus de 2 h ET qu'aucun commit ne la
   référence ; tu le dis alors dans ton commentaire de reprise.

3. Compose un lot de 4 à 6 issues **par disjonction de fichiers**.
   PRIVILÉGIE celles dont les surfaces sont `gateway` et/ou `web` : tu ne peux
   pas exécuter `xcodebuild` ni `gradlew`, donc une issue iOS/Android partirait
   sans gate. Si tu en prends une quand même, tu le DIS dans le commit et tu
   laisses l'issue ouverte pour qu'une session locale passe le gate.

4. Réserve : `Status = In Progress` + un commentaire daté nommant ta session.

═══ ÉCRITURE ═══

5. Un sous-agent par issue, avec le prompt du § « Le prompt » du document,
   en remplaçant {{ISSUE}}, {{TERRITOIRE}}, {{CONSIGNES}}.
   Les fichiers-carrefour sont à TOI, jamais à eux. Ils déclarent, tu appliques.

═══ INTÉGRATION ═══

6. Applique les édits carrefour toi-même, en série.

7. Gates — **UNE À LA FOIS, jamais en parallèle** :
       cd services/gateway && npm run type-check && npx jest --silent
       cd apps/web        && npx jest --silent
   Trois gates simultanés produisent des faux échecs (mesuré : 10, tous verts
   isolément). Un ensemble d'échecs DISJOINT sur un code identique est un flake :
   relance la suite SEULE avant de conclure à une régression.

8. Gates verts → un commit par issue, `git commit -F <fichier> -- <chemins>`.
   JAMAIS `-a`, JAMAIS `add -A` : d'autres sessions travaillent dans ce dépôt.
   JAMAIS de backticks dans un message : le shell les exécute.
   Puis UN SEUL `git push origin HEAD:dev`.

═══ LA RÈGLE DU TEMPS MORT ═══

9. **Le push démarre le build. NE L'ATTENDS PAS.** Repars au point 2 et compose
   le lot suivant. Les agents du lot N+1 écrivent pendant que le lot N construit.

═══ FERMETURE — seulement ce qui est PROUVÉ ═══

10. Quand le build du lot N est fini (`gh run list --branch dev --workflow Docker`),
    vérifie que staging le porte :
        curl -s https://gate.staging.meeshy.me/health
    Si le SHA court de ton commit y est : rejoue les `a_mesurer_en_integration`
    de chaque agent, ferme les issues VERTES avec leur preuve (mesure collée),
    et repasse les rouges en `Todo` avec la mesure qui a échoué.

    Si staging ne porte PAS ton commit — tu n'as pas l'accès SSH pour déployer —
    n'invente rien : laisse les issues `In Progress`, commente
    « livré sur dev en <sha>, gates verts, EN ATTENTE de déploiement staging
    pour mesure », et continue le lot suivant. Une session locale déploiera.

    **Ne ferme JAMAIS une issue sans mesure rejouée.** La fin se prouve.

11. Si le build CI est ROUGE : c'est prioritaire sur tout. Lis le log, corrige,
    re-pousse. Le lot suivant continue d'écrire pendant ce temps.

═══ QUAND S'ARRÊTER ═══

Quand plus aucune issue `Todo` ne reste dans les milestones 65 à 73, fais un
dernier point : ce qui est fermé, ce qui attend un déploiement, ce qui attend un
gate local. Puis arrête la boucle.

═══ INTERDITS ═══

- pousser sur `main`, déployer en production — staging seulement ;
- fermer une issue sans mesure rejouée en intégration ;
- `git commit -a`, `git add -A`, `git stash`, `git checkout` (arbre partagé) ;
- inventer un identifiant : ils sont hors dépôt (`apps/ios/fastlane/.env`) ;
- toucher une issue déjà `In Progress` chez quelqu'un d'autre.
```

### Pourquoi ce prompt refuse de fermer sans mesure

C'est la seule protection contre une boucle qui « avance » en cochant des cases.
Une session web sans accès SSH ne peut pas déployer ; si elle fermait quand même,
la file se viderait sans qu'aucune ligne soit prouvée en intégration. Le prompt
lui fait donc livrer, gater, pousser — et **rendre la main honnêtement** sur la
seule étape qu'elle ne peut pas faire.

## Ce que ça a donné

| | en série | par lot |
|---|---:|---:|
| issues en vol | 1 | 5–6 |
| déploiements pour 39 issues | 39 | ~7 |
| attente non recouverte | 45 min/issue | ~0 |
| durée estimée | ~49 h | ~5–7 h |
