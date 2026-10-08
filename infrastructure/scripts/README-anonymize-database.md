# Anonymiser la base de staging (#9663)

Le staging ne contient aucune donnée personnelle réelle. **Toute copie de la
production vers le staging passe par cette procédure avant que le staging ne la
serve**, dans cet ordre, sans en sauter une étape.

Outil : `infrastructure/scripts/anonymize-database.mjs` (l'inventaire champ par
champ est en tête du fichier). Témoins : `node --import tsx --test
infrastructure/scripts/anonymize-database.test.mjs`, depuis la racine du dépôt.

## Ce que le script refuse

- toute cible que `MEESHY_ENV`/`NODE_ENV` désigne comme production ;
- un hôte ou un nom de base qui contient `prod` ;
- un hôte qu'il ne reconnaît pas comme non-production : il faut un nom qui
  contient `staging`, `test` ou `anon` (`database-staging` passe, `database` et
  `meeshy-database` ne passent pas), ou une boucle locale (tunnel SSH) **avec**
  `MEESHY_ENV=staging`, ou `--allow-host <hôte>` explicite ;
- toute écriture sans `--i-know-this-is-not-production`.

Le refus a lieu avant toute connexion. Le mot de passe de l'URI n'est jamais
affiché : passer l'URI par `ANONYMIZE_MONGODB_URI` plutôt que par `--uri` pour
qu'il n'apparaisse pas non plus dans la liste des processus.

## Mise en place (une fois par exécution)

Sur l'hôte, copier `infrastructure/scripts/anonymize-database.mjs` et le dossier
`infrastructure/scripts/anonymize-database/` dans `<SCRIPTS>`, et créer un
dossier de travail `<TRAVAIL>` en `chmod 700`. Le script tourne dans un
conteneur jetable branché sur le **seul** réseau de staging
(`meeshy-staging-network`) — jamais sur `meeshy_meeshy-network`, que la
production partage :

```bash
anon() {
  docker run --rm -i --network meeshy-staging-network \
    -e MEESHY_ENV=staging -e ANONYMIZE_MONGODB_URI \
    -v <SCRIPTS>:/scripts:ro -v <TRAVAIL>:/work -w /work node:22-slim \
    sh -c 'test -d node_modules/mongodb || npm install --no-save --no-package-lock mongodb@7 bcryptjs@3 >/dev/null; node /scripts/anonymize-database.mjs "$@"' -- "$@"
}
export ANONYMIZE_MONGODB_URI='mongodb://<UTILISATEUR>:<MOT_DE_PASSE>@database-staging:27017/meeshy?authSource=admin&directConnection=true'
```

## 1. Sauvegarde vérifiée

La sauvegarde contient les données réelles : elle reste sur l'hôte, en `600`,
et se supprime à la fin de la fenêtre de validation (7 jours au plus).

```bash
docker exec meeshy-database-staging mongodump --uri "$ANONYMIZE_MONGODB_URI" --archive --gzip > <TRAVAIL>/avant-anonymisation.archive.gz
chmod 600 <TRAVAIL>/avant-anonymisation.archive.gz
# Vérifier : restaurer dans une base témoin, comparer les comptes par collection, puis la supprimer.
docker exec -i meeshy-database-staging mongorestore --uri "$ANONYMIZE_MONGODB_URI" --archive --gzip \
  --nsFrom 'meeshy.*' --nsTo 'meeshy_verif.*' < <TRAVAIL>/avant-anonymisation.archive.gz
```

Les comptes de `meeshy_verif` doivent égaler ceux de `meeshy`
(`db.getCollectionNames().map(c => [c, db[c].countDocuments()])` dans les deux),
puis `db.getSiblingDB('meeshy_verif').dropDatabase()`. Pas de comptes égaux, pas
d'étape 2.

## 2. À blanc

```bash
anon --dry-run --keep-login <COMPTE_RECETTE_1> --keep-login <COMPTE_RECETTE_2>
```

Il affiche, par collection, le nombre de documents qui seraient modifiés ou
supprimés, et prévient si un compte de recette est introuvable. Rien n'est écrit.

## 3. Exécution

```bash
anon --i-know-this-is-not-production \
  --keep-login <COMPTE_RECETTE_1> --keep-login <COMPTE_RECETTE_2> \
  --manifest /work/medias.jsonl --credentials /work/recette.credentials
```

Les comptes `--keep-login` gardent leur PSEUDO et reçoivent un mot de passe
NEUF, écrit (`pseudo<TAB>mot de passe`, mode 600) dans `--credentials` et
jamais affiché : le haché d'origine ne survit pas, puisqu'il resterait
exploitable si le compte est un compte réel copié de la production. Leur
e-mail, leur numéro et leur profil deviennent synthétiques, et leur double
authentification est retirée. Ranger ces mots de passe dans le gestionnaire de
secrets, puis supprimer le fichier. Tous les autres mots de passe deviennent le
haché d'un mot de passe aléatoire non conservé ; sessions, jetons push, jetons
de réinitialisation, liens de partage, jetons d'affiliation et de suivi sont
régénérés ou supprimés, et aucune clé E2EE ni clé serveur ne survit.

Les champs JSON libres (métadonnées, contextes, réglages, analytics) sont
nettoyés FERMÉS PAR DÉFAUT : toute chaîne, à toute profondeur, est remplacée,
sauf une forme technique (identifiant, date, condensé) ou une énumération sous
une clé de la liste blanche.

Le script se termine par le contrôle d'échantillonnage : code de sortie `2` si
un champ garde une forme réelle (le rapport nomme la collection, l'`_id` et le
champ, jamais la valeur). Relancer est sans danger.

## 4. Contrôle

```bash
anon --verify-only --sample-size 2000 --keep-login <COMPTE_RECETTE_1> --keep-login <COMPTE_RECETTE_2>
echo $?   # 0 attendu
```

Puis, à la main, la connexion d'un compte de recette sur le staging, avec le
mot de passe neuf du fichier `--credentials`. Chaque
exécution réelle laisse une ligne datée dans la collection `_anonymizationRuns`.

Vider le cache Redis du staging (il garde des copies de profils et de
traductions), puis redémarrer la passerelle :

```bash
docker exec meeshy-redis-staging redis-cli FLUSHALL
docker restart meeshy-gateway-staging
```

## 5. Médias

Les fichiers ne sont pas dans la base. La base ne les référence plus (chemins →
`anonymized/placeholder.*`) ; il reste à remplacer leur contenu par des fichiers
neutres et à poser les remplaçants. À blanc d'abord, puis `--apply` :

```bash
for volume in meeshy-staging-gateway-uploads meeshy-staging-gateway-sounds meeshy-staging-web-uploads; do
  docker run --rm --network none -v "$volume":/uploads -v <SCRIPTS>:/scripts:ro -v <TRAVAIL>:/work -w /work node:22-slim \
    node /scripts/anonymize-database.mjs media --manifest /work/medias.jsonl --uploads-root /uploads --all
done
# relire les comptes, puis relancer la même boucle avec --apply
```

`--all` neutralise **tous** les fichiers du volume, référencés ou non (les
orphelins aussi). Les entrées `UserVoiceModel` du manifeste (`embeddingPath`,
`referenceAudioUrl`) désignent des fichiers du traducteur : les retrouver dans
son volume de modèles et les supprimer.

Enfin, supprimer `<TRAVAIL>/medias.jsonl` (il nomme les chemins d'origine).
