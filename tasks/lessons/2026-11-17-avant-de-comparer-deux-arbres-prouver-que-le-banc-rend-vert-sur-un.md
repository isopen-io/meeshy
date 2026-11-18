## Avant de comparer deux arbres, prouver que le banc rend VERT sur au moins un (cycle 175 bis, #19370)

Un job de CI est tombé sur une PR dont le diff ne touchait pas la zone mesurée
(un lot de passerelle, un gate navigateur `apps/web`). La règle du dépôt est
claire : un échec n'est pas celui de la PR seulement s'il est rouge sur la base
AUSSI, ou s'il nomme un service que le diff ne touche pas ET se reproduit.

J'ai voulu établir la première moitié, et j'ai construit pour cela un worktree
sur `dev` nu, rejoué les deux gates des deux côtés, obtenu **EXIT=1 de part et
d'autre**, et publié le tableau. Échec identique, même sélecteur, même délai :
la conclusion « le rouge préexiste sur `dev` » paraissait mesurée.

**Elle ne l'était pas.** Les deux gates servent `apps/web/dist/`, et
`apps/web/dist` n'existait dans AUCUN des deux arbres. Les deux côtés servaient
un répertoire vide, tous les actifs rendaient 404, et le sélecteur attendu — que
le gate documente lui-même comme venant d'un moteur chargé à la demande — ne
pouvait par construction jamais apparaître. Mon tableau mesurait l'absence de
build, quatre fois, et je l'ai lu comme une propriété de `dev`.

Refait après `bun run build` sur `packages/shared` puis `apps/web` — les deux
étapes que la CI exécute avant ces gates — **les deux gates passent** (EXIT=0).

> **Les deux côtés d'une comparaison peuvent échouer pour une raison qui
> n'appartient à aucun des deux, et l'égalité des résultats se lit alors comme
> « le défaut préexiste » — qui est la conclusion la plus RASSURANTE
> disponible.** C'est ce qui la rend dangereuse : elle clôt l'enquête, elle
> disculpe le lot, et elle a la forme d'une mesure.

Le contrôle qui l'attrape tient en une ligne et coûte un run : **avant de
comparer deux arbres, prouver que le banc rend VERT sur au moins l'un des
deux.** Un banc qui ne peut rendre que rouge ne compare rien — c'est « un témoin
qui ne peut pas tomber » (§ Tests du `CLAUDE.md` du gateway) retourné : un banc
qui ne peut pas PASSER. Et c'est la famille du cycle 129 — « un double de test
ment aussi par ce qu'il ACCEPTE » — portée du double au harnais : le mien
acceptait l'absence du sujet à mesurer.

### Le dépôt me l'avait écrit, douze lignes au-dessus du gate

`ci.yml`, juste avant les dix gates navigateur :

> « Les étapes de PRÉPARATION au-dessus gardent leur arrêt — **un gate qui
> tourne sans `dist` rendrait un rouge de plomberie qui ne mesure rien**, soit
> le défaut inverse. »

La phrase nomme exactement l'erreur, dans le fichier que j'ai ouvert pour y
lire la commande du gate. Je l'ai lue pour en extraire `node scripts/check-…`
et j'ai sauté le paragraphe au-dessus.

> **Reproduire une étape de CI, c'est reproduire ses PRÉCONDITIONS, pas sa
> commande.** La commande est ce qu'on cherche dans le fichier ; les étapes qui
> la rendent signifiante sont au-dessus, et rien ne les signale comme
> nécessaires — sauf, ici, un commentaire qui le disait.

### Et le vrai défaut était d'une autre famille

Une fois le journal COMPLET du job extrait (l'API n'en rend que la queue, et la
queue montrait des étapes vertes postérieures aux deux échecs), les deux causes
réelles sont apparues, toutes deux étrangères au lot :

- un **404 de registration de service worker** (`A bad HTTP response code (404)
  was received when fetching the script`), absent localement ;
- **`flow-end` obtenu là où `justify-end` était attendu** — deux sérialisations
  de la même valeur calculée selon la version du moteur, la CI installant son
  propre Chromium.

La seconde est la famille que la directive du 2026-11-15 nomme déjà (« un test
ne dépend ni de la langue ni du système du poste »), appliquée à une valeur de
STYLE au lieu d'un catalogue de langue. **Un gate qui ne passe que sous une
version de Chromium n'est pas un gate** : c'est lui qu'on corrige, pas le fil.

### Corollaire sur la lecture des journaux de CI

La queue d'un journal de job n'est pas son verdict. Ici elle montrait trois
gates VERTS, parce que le job joue ses dix gates sous `!cancelled()`
précisément pour qu'un rouge n'en cache pas neuf (#6137) : les étapes qui
tombent sont donc au MILIEU, suivies d'étapes qui passent. **Chercher l'échec
par `##[error]` dans le journal entier, et l'attribuer à son étape en remontant
jusqu'à la commande qui la précède** — jamais par ce que la fin du journal
affiche.
---
