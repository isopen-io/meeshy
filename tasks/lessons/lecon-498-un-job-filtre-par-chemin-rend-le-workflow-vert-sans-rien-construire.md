## Leçon 498 — Un job filtré par CHEMIN rend le workflow vert sans rien construire, et le premier lot qui touche ce chemin hérite d'une panne qu'il n'a pas causée

`Docker #3546` rouge sur mon merge : « Build translator » meurt sur

```
AttributeError: module 'anyio' has no attribute 'abc'
httpcore/_backends/anyio.py:20  def __init__(self, stream: anyio.abc.ByteStream)
```

Le lot venait de merger cinq montées de version Dependabot du translator. La
conclusion évidente — « une de mes montées casse l'image » — était fausse, et
deux mesures suffisent à la retourner.

**Première mesure : la date de l'amont.** `anyio 4.15.0` a été publiée le
2026-09-02 à 21:46 UTC, la veille au soir. Elle fait passer ses sous-modules en
import PARESSEUX : `anyio.abc` cesse d'être atteignable depuis un `import anyio`
seul. `httpcore 0.17.3` — épinglé vieux exprès, pour Prisma 0.15.0 via
`httpx 0.24.1` — annote `AnyIOStream.__init__` à la CRÉATION de la classe, donc
`import httpcore` lève. Et httpcore déclare `anyio>=3.0,<5.0` : **il accepte
4.15.0 sans rien savoir de la rupture.** Aucune des cinq montées n'y participe.

**Seconde mesure, celle qui décide l'attribution :**

```sh
for id in $(gh api ".../workflows/docker.yml/runs?branch=dev" --jq '.workflow_runs[].id'); do
  gh run view $id --json jobs --jq '[.jobs[]|select(.name|test("translator"))|.name]'
done
# → [] [] [] [] []   pour les cinq runs VERTS précédents
```

Les six derniers « Docker » de `dev` sont verts et **aucun n'a construit le
translator** : le job est filtré par `Detect Changes`, et rien ne touchait
`services/translator/**` depuis la veille. La panne était donc déjà là, invisible,
pendant que le workflow rendait « success » à chaque push.

> **Un job filtré par chemin ne rend pas « pas exécuté » : il rend « vert ».**
> Le workflow entier hérite de sa couleur, et le premier lot qui touche enfin ce
> chemin RÉVÈLE la panne au lieu de la causer. La question à poser à un rouge
> n'est pas seulement « qu'ai-je changé ? » mais **« ce job a-t-il seulement
> TOURNÉ la dernière fois qu'il était vert ? »** — et elle se répond en listant
> les jobs des runs verts, jamais leur conclusion.

Deuxième variante de la même famille dans la même journée, sur un autre objet :
un `project.pbxproj` périmé fait DISPARAÎTRE des suites du bundle iOS, qui
passent alors vertes par omission. Même mécanique, autre filtre — cf.
[[reference_a_path_gated_ci_job_hides_its_own_failure]] et la leçon 488.

**Le correctif se pose là où la contrainte manque, pas là où elle casse.** Ni
httpcore ni anyio ne peuvent l'écrire : c'est notre paire épinglée qui crée
l'incompatibilité. `anyio==4.14.2` dans `requirements.txt`, `anyio>=4.0.0,<4.15.0`
dans `pyproject.toml` — **les deux fichiers qui déclarent la dépendance**, jamais
un seul — avec le commentaire qui dit QUAND le plafond tombe : le jour où Prisma
permet httpx 0.28+, httpcore 1.x importe `anyio.abc` en propre et la contrainte
n'a plus d'objet. Un plafond sans sa condition de levée devient une superstition.

Preuve exigée avant de committer, dans les DEUX sens — un plafond qui n'a pas été
mesuré sur la version qu'il exclut ET sur celle qu'il retient n'est qu'une
hypothèse :

```
httpcore==0.17.3 + anyio==4.15.0  ->  AttributeError: ... no attribute 'abc'
httpcore==0.17.3 + anyio==4.14.2  ->  import OK
```

---
