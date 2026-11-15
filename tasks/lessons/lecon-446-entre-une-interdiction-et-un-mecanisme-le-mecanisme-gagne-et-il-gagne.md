## Leçon 446 — Entre une INTERDICTION et un MÉCANISME, le mécanisme gagne, et il gagne en silence

**Le fait (2026-09-02).** Ma consigne permanente de boucle le dit à chaque
réveil, en gras : « **Tu ne fermes JAMAIS une issue** — la session d'intégration
ferme, sur mesure rejouée. » J'ai fermé quatre issues dans la même heure, sans
appeler une seule fois une API de fermeture.

Le mot-clé `Closes #n` dans un message de commit suffit. `dev` étant la branche
PAR DÉFAUT du dépôt, GitHub ferme l'issue à la seconde où la poussée atterrit.
Mesuré, issue par issue, dans le journal d'événements :

```
#4585  10:28:03  closed  commit_id=cd46251f7f
#4682  10:38:23  closed  commit_id=7716dee4bd
#4688  10:20:09  closed  commit_id=918c6f31ca
#4860  10:20:08  closed  commit_id=98419744bc
```

**La cause n'est pas une inattention : c'est un conflit entre deux règles
ÉCRITES du même projet.**

| règle | forme | ce qui l'applique |
|---|---|---|
| `CLAUDE.md` § pilotage — « l'issue **fermée** par le commit qui la livre (`Closes #n`) » | une CONVENTION | GitHub, mécaniquement, à chaque poussée |
| la consigne de la boucle — « tu ne fermes JAMAIS une issue » | une INTERDICTION | rien |

Suivre les deux à la lettre EXÉCUTE la première et viole la seconde. Et la
violation ne laisse aucune trace lisible : l'issue se ferme proprement, avec un
lien vers le bon commit, exactement comme si quelqu'un l'avait décidé.

> **Une interdiction n'a pas de moteur.** Une convention qu'un outil exécute en
> a un. Quand les deux se contredisent, ce n'est pas la plus récente ni la plus
> impérative qui l'emporte — c'est celle qui a un mécanisme derrière elle, et
> l'autre est enfreinte SANS RAPPORT D'ERREUR.

C'est ce qui rend cette famille chère : je me croyais conforme parce que je
n'avais jamais posé sciemment un geste de fermeture. Le contrôle que j'appliquais
portait sur mes APPELS ; la règle portait sur un EFFET.

### La question à se poser

Devant toute règle de la forme « ne fais jamais X », demander : **quel autre
geste de mon travail PRODUIT X sans le nommer ?** Ici : un mot dans un message
de commit. Ailleurs, la même forme se retrouve partout — un `git push` qui
déclenche un déploiement, un fichier renommé qui casse un import dynamique, une
dépendance ajoutée qui embarque un postinstall, un label posé qui déclenche un
workflow. Le geste interdit est rarement celui qu'on s'interdit ; c'est celui
qu'on fait sans savoir qu'il l'est.

### Ce que j'ai fait, et ce que je n'ai PAS fait

`Closes` est remplacé par `Avance #n` dans mes messages de commit — le lien vers
l'issue reste, la fermeture disparaît.

**Je n'ai PAS rouvert les quatre.** Rouvrir est un changement d'état au même
titre que fermer : la consigne m'interdit l'un, elle ne m'autorise pas l'autre
en compensation. Et le point de contrôle que ma fermeture a sauté — l'intégration
qui rejoue la mesure — appartient au porteur, pas à moi. Elles sont taguées
`to-integrate`, chaque relais porte les commandes de rejeu, et le fait est dit en
tête de chacun.

> **Réparer une infraction par son symétrique est une seconde infraction.** La
> réparation juste est de rendre l'état LISIBLE à qui a le droit de le changer.

Voisines : § 433 (ce qui s'énumère se périme, ce qui se dérive tient) — même
asymétrie entre ce qu'on déclare et ce qui s'exécute ; § 440 (un outil de
détection se règle contre l'erreur qui n'a pas de vérificateur) — ici
l'interdiction ÉTAIT l'erreur sans vérificateur.
