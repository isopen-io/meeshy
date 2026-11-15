# Pseudonymiser la base de staging (#9663)

**Ce que cette procédure produit est une PSEUDONYMISATION, pas une
anonymisation.** Les noms, adresses, numéros, textes, médias, secrets et clés
sont remplacés ou retirés ; mais il reste, à dessein ou faute de mieux :

- les identifiants Mongo (`_id` et clés étrangères), identiques à ceux de la
  production ;
- les horodatages (création, activité, lecture) ;
- le graphe social : qui est ami, membre, participant, auteur, destinataire de
  quoi, et quand ;
- le pays, le fuseau, la langue et la locale des comptes ; la description
  grossière de l'appareil (famille, version) ;
- `referralCode` (code public, qui réidentifie un compte qu'on connaît) ;
- le PSEUDO des comptes `--keep-login`.

Croisés avec la production, ces restes réidentifient. **Le statut juridique de
la base qui en sort (donnée personnelle pseudonymisée ou non) n'est pas tranché
ici : il est à qualifier** (agent `conformite-juridique`, puis avis signé).
Tant qu'il ne l'est pas, la base de staging se traite comme une base qui
contient des données personnelles.

**Contexte de sécurité.** Depuis le 2026-10-08 à 06:03 UTC, la production
exige l'authentification MongoDB et Redis. Le staging tourne encore en
`--noauth` : tout conteneur branché sur `meeshy-staging-network` lit la base
et Redis sans mot de passe. C'est pourquoi la procédure ARRÊTE ces conteneurs
avant de restaurer quoi que ce soit, et reconstruit la base sur un volume neuf
(les originaux restent sinon lisibles dans l'oplog).

**Toute copie de la production vers le staging passe par cette procédure avant
que le staging ne la serve**, dans cet ordre, sans en sauter une étape.

Outil : `infrastructure/scripts/anonymize-database.mjs` (l'inventaire champ par
champ est en tête du fichier). Témoins, depuis la racine du dépôt :
`node --import tsx --test infrastructure/scripts/anonymize-database*.test.mjs`.

## Ce que le script refuse

- un drapeau inconnu (`--dryrun` mal tapé ne passe pas pour `--dry-run`) ;
- toute cible que `MEESHY_ENV`/`NODE_ENV` désigne comme production ;
- un hôte ou un nom de base qui contient `prod` ;
- un hôte qu'il ne reconnaît pas comme non-production : il faut un nom qui
  contient `staging`, `test` ou `anon`, ou une boucle locale **avec**
  `MEESHY_ENV=staging`, ou `--allow-host <hôte>` explicite ;
- toute écriture sans `--i-know-this-is-not-production` ;
- **une fois connecté**, un serveur dont `hello` ne se présente pas exactement
  comme le replica set de staging : `setName` `rs0` et `hosts`
  `[database-staging:27017]` (le `rs.initiate` de `mongo-init-staging`). La
  production (`database:27017`), un tunnel vers un autre port ou une base
  isolée sont refusés avant toute lecture ;
- **une collection ni inventoriée ni déclarée sans donnée personnelle** (ancien
  nom `user_conversation_preferences`, `MessageTranslation`, sauvegarde
  manuelle `User_backup_*`…) : refus avant toute écriture, avec la liste. Après
  examen, l'ajouter à l'inventaire, ou la retirer avec
  `--drop-collection <nom>` (jamais une collection inventoriée).

Les refus du premier groupe ont lieu avant toute connexion. Le mot de passe de
l'URI n'est jamais affiché.

## Le contrôle final

Il relit TOUS les documents (aucun échantillonnage) et échoue (code `2`) si :

- un champ garde une forme réelle (le rapport nomme la collection, l'`_id` et
  le champ, jamais la valeur) ;
- une collection inconnue est présente ;
- `User` est vide, ou aucun document n'a été relu (mauvaise base, par exemple
  `/meeshy_staging` au lieu de `/meeshy`) ;
- `local.oplog.rs` contient une entrée antérieure (à la seconde près) au début
  de la dernière exécution : les insertions de la restauration y gardent les
  originaux. `--oplog-rebuild-pending` accepte cet échec pour la seule passe qui
  précède la reconstruction (étape 5) et l'écrit en clair : la base n'est alors
  **pas servable**.

## Le manifeste

`--manifest <fichier>` (mode 600) s'écrit AU FIL de l'exécution : le sel, les
empreintes salées (HMAC) des mots d'identité et des relations, et les chemins
d'origine des fichiers déréférencés. Aucune valeur réelle n'y est en clair,
sauf ces chemins. Il sert à trois choses :

- **reprendre** une exécution interrompue : relancer avec le MÊME `--manifest`
  retrouve le sel, le filtre d'identité et les relations (un contact rapproché
  suit encore son compte) ;
- le **contrôle seul** (`--verify-only` l'exige) ;
- l'**étape médias**.

Il se détruit à la fin de la procédure (étape 11). Sel et empreintes dans le
même fichier : une empreinte d'un mot courant se retrouve par dictionnaire. Le
fichier est donc aussi sensible que la base d'origine.

## Mise en place (une fois par exécution)

Sur l'hôte, copier `infrastructure/scripts/anonymize-database.mjs` et le dossier
`infrastructure/scripts/anonymize-database/` dans `<SCRIPTS>`. Créer
`<TRAVAIL>` en `chmod 700` (manifeste, mots de passe de recette). Les
sauvegardes de données réelles ne vont PAS dans `<TRAVAIL>` (monté dans le
conteneur du script) mais dans `/opt/meeshy/backups/` (fichiers 600).

Le script tourne dans un conteneur jetable branché sur le **seul** réseau de
staging (`meeshy-staging-network`) — jamais sur `meeshy_meeshy-network`, que la
production partage. Dépendances à versions EXACTES, sans fichier de
verrouillage ni script d'installation :

```bash
anon() {
  docker run --rm -i --network meeshy-staging-network \
    -e MEESHY_ENV=staging -e ANONYMIZE_MONGODB_URI \
    -v <SCRIPTS>:/scripts:ro -v <TRAVAIL>:/work -w /work node:22-slim \
    sh -c 'test -d node_modules/mongodb || npm install --no-save --no-package-lock --ignore-scripts mongodb@7.6.0 bcryptjs@3.0.3 >/dev/null; node /scripts/anonymize-database.mjs "$@"' -- "$@"
}
export ANONYMIZE_MONGODB_URI='mongodb://database-staging:27017/meeshy?replicaSet=rs0&directConnection=true'
STAGING=/opt/meeshy/staging   # dossier du compose de staging sur l'hôte
JOUR=$(date +%Y%m%d)
```

## 0. Arrêter tout ce qui lit la base ou Redis de staging

AVANT de restaurer la moindre copie de production : la passerelle, le
traducteur et l'agent serviraient sinon des données réelles, avec de vrais
jetons push et de vraies adresses (le staging écrirait à de vrais
utilisateurs), et pourraient réécrire du réel après le passage du script (une
traduction en file qui revient dans `Message.translations`).

```bash
docker stop meeshy-autoheal-staging   # d'abord : il redémarrerait les autres
docker stop meeshy-gateway-staging meeshy-translator-staging meeshy-agent-staging \
  meeshy-frontend-staging meeshy-static-files-staging \
  meeshy-nosqlclient-staging meeshy-p3x-redis-ui-staging
docker ps --filter name=staging --format '{{.Names}}'
# attendu : meeshy-database-staging et meeshy-redis-staging, rien d'autre
```

Ils ne redémarrent qu'à l'étape 10. La copie de production se restaure
ENSUITE dans `meeshy-database-staging` (`migrate-to-staging.sh`, ou à la main).

## 1. Sauvegarde vérifiée

La sauvegarde contient les données réelles : elle reste sur l'hôte, en 600. La
vérification restaure dans une base témoin, compare les comptes, et retire la
base témoin MÊME en cas d'échec :

```bash
SAUVEGARDE=/opt/meeshy/backups/avant-anonymisation-$JOUR.archive.gz
( umask 077; docker exec meeshy-database-staging mongodump --db meeshy --archive --gzip > "$SAUVEGARDE" )
chmod 600 "$SAUVEGARDE"
(
  set -euo pipefail
  trap 'docker exec meeshy-database-staging mongosh --quiet --eval "db.getSiblingDB(\"meeshy_verif\").dropDatabase()" >/dev/null' EXIT
  docker exec -i meeshy-database-staging mongorestore --archive --gzip --nsFrom 'meeshy.*' --nsTo 'meeshy_verif.*' < "$SAUVEGARDE"
  docker exec meeshy-database-staging mongosh --quiet --eval '
    const a = db.getSiblingDB("meeshy"), b = db.getSiblingDB("meeshy_verif");
    const ecarts = a.getCollectionNames().filter((c) => a[c].countDocuments() !== b[c].countDocuments());
    if (ecarts.length) { print("ÉCART : " + ecarts.join(", ")); quit(1); }
    print("Comptes égaux.");'
)
```

Pas de « Comptes égaux. », pas d'étape 2.

## 2. À blanc

```bash
anon --dry-run --keep-login <COMPTE_RECETTE_1> --keep-login <COMPTE_RECETTE_2>
```

Il refuse s'il trouve une collection inconnue (voir « Ce que le script
refuse ») ; sinon il affiche, par collection, le nombre de documents qui
seraient modifiés, supprimés ou retirés, et prévient si un compte de recette est
introuvable. Rien n'est écrit.

## 3. Exécution

```bash
anon --i-know-this-is-not-production --oplog-rebuild-pending \
  --keep-login <COMPTE_RECETTE_1> --keep-login <COMPTE_RECETTE_2> \
  --manifest /work/manifeste.jsonl --credentials /work/recette.credentials
# éventuellement : --drop-collection <collection héritée examinée à l'étape 2>
```

Les comptes `--keep-login` gardent leur PSEUDO et reçoivent un mot de passe
NEUF, écrit (`pseudo<TAB>mot de passe`, mode 600) dans `--credentials` et
jamais affiché. Leur e-mail, leur numéro et leur profil deviennent
synthétiques, leur double authentification est retirée. Tous les autres mots de
passe deviennent le haché d'un mot de passe aléatoire non conservé ; sessions,
jetons push, jetons de réinitialisation, liens de partage, jetons d'affiliation
et de suivi sont régénérés ou supprimés, et aucune clé E2EE ni clé serveur ne
survit.

Les champs JSON libres sont nettoyés FERMÉS PAR DÉFAUT : toute chaîne est
remplacée, à toute profondeur, sauf une forme technique (identifiant, date) ou
une valeur en forme d'énumération sous une clé de la liste blanche, qui ne
contient aucun mot d'identité d'un compte. Sous une clé de secret (`…Key`,
`…Code`, `token`…) tout part ; sous une clé de lieu tout nombre devient une
coordonnée synthétique ; dates de naissance, numéros écrits en nombre et
binaires sont remplacés ; une clé d'objet qui nomme quelqu'un est renommée.

Interrompu ? Relancer la MÊME commande : le manifeste fait reprendre.

Code `0` attendu, avec la ligne « Oplog : … entrée(s) antérieure(s) … PAS
servable » : c'est l'étape 5 qui purge l'oplog.

## 4. Copies brutes de la production : les sortir des conteneurs

`migrate-to-staging.sh` laisse la copie de production en clair à trois
endroits. **Le porteur a décidé de CONSERVER la copie de production de mars et
les preuves scellées (`/opt/meeshy/forensics/2026-10-08-staging-exposure/`)
jusqu'à décision explicite de destruction : cette procédure ne détruit RIEN de
cela.** Elle sort ces copies de tout endroit joignable depuis le réseau de
staging (couches de conteneur), et les range en lecture root seule :

```bash
COPIES=/opt/meeshy/forensics/$JOUR-copies-production
install -d -m 700 "$COPIES"
docker exec meeshy-database-staging ls /dump/ 2>/dev/null
docker cp meeshy-database-staging:/dump/. "$COPIES/staging-dump/"
docker exec meeshy-database-staging rm -rf /dump/backup-pre-staging-*
chmod -R go-rwx "$COPIES"; find "$COPIES" -type d -exec chmod 700 {} +; find "$COPIES" -type f -exec chmod 600 {} +
# /opt/meeshy/backups/backup-pre-staging-* : restent en place, ramenés à 700 / 600
find /opt/meeshy/backups -maxdepth 1 -name 'backup-pre-staging-*' -exec chmod -R go-rwx {} + -exec chmod 700 {} \;
find /opt/meeshy/backups -path '*backup-pre-staging-*' -type f -exec chmod 600 {} +
```

La copie qui reste dans la couche du conteneur de **production**
(`meeshy-database:/dump/backup-pre-staging-*`) se déplace de la même façon
(`docker cp` puis `docker exec meeshy-database rm -rf …`) — c'est un geste sur
le conteneur de PRODUCTION : feu vert du porteur d'abord. Noter dans l'issue
où chaque copie est rangée.

## 5. Reconstruction sur un volume neuf (purge de l'oplog)

L'oplog de l'ancien volume garde les originaux : la base anonymisée se
recopie dans un `mongod` NEUF, sur un volume neuf. L'ancien volume n'est
détruit qu'APRÈS le contrôle final du nouveau.

```bash
ANONYMISEE=/opt/meeshy/backups/staging-anonymisee-$JOUR.archive.gz
( umask 077; docker exec meeshy-database-staging mongodump --db meeshy --archive --gzip > "$ANONYMISEE" )
docker stop meeshy-database-staging && docker rm meeshy-database-staging
# l'ancien volume est MIS DE CÔTÉ (copie), le nom du compose reçoit un volume vide
for v in data config; do
  docker volume create meeshy-staging-database-$v-ancien-$JOUR
  docker run --rm --network none -v meeshy-staging-database-$v:/de:ro -v meeshy-staging-database-$v-ancien-$JOUR:/vers alpine cp -a /de/. /vers/
  docker volume rm meeshy-staging-database-$v
done
cd "$STAGING" && docker compose up -d database-staging mongo-init-staging
docker wait meeshy-mongo-init-staging   # replica set initié (database-staging:27017) APRÈS l'exécution
docker exec -i meeshy-database-staging mongorestore --archive --gzip < "$ANONYMISEE"
anon --verify-only --manifest /work/manifeste.jsonl --keep-login <COMPTE_RECETTE_1> --keep-login <COMPTE_RECETTE_2>
echo $?   # 0 attendu, avec « Oplog : aucune entrée antérieure à l'exécution »
```

Vérification croisée de fin — les comptes du nouveau serveur égalent ceux de
l'archive anonymisée, et la base témoin part même en cas d'échec :

```bash
(
  set -euo pipefail
  trap 'docker exec meeshy-database-staging mongosh --quiet --eval "db.getSiblingDB(\"meeshy_verif\").dropDatabase()" >/dev/null' EXIT
  docker exec -i meeshy-database-staging mongorestore --archive --gzip --nsFrom 'meeshy.*' --nsTo 'meeshy_verif.*' < "$ANONYMISEE"
  docker exec meeshy-database-staging mongosh --quiet --eval '
    const a = db.getSiblingDB("meeshy"), b = db.getSiblingDB("meeshy_verif");
    const ecarts = a.getCollectionNames().filter((c) => a[c].countDocuments() !== b[c].countDocuments());
    if (ecarts.length) { print("ÉCART : " + ecarts.join(", ")); quit(1); }
    print("Comptes égaux.");'
)
```

La base témoin vient d'ajouter des entrées à l'oplog du nouveau serveur : elles
sont postérieures à l'exécution et ne portent que la base anonymisée. Relancer
`anon --verify-only …` pour s'en assurer (code `0`).

Puis, et seulement alors, détruire l'ancien volume :

```bash
docker volume rm meeshy-staging-database-data-ancien-$JOUR meeshy-staging-database-config-ancien-$JOUR
```

Un contrôle en échec : ne rien détruire, reprendre depuis `$SAUVEGARDE`
(étape 1) après correction.

## 6. Médias

Les fichiers ne sont pas dans la base. La base ne les référence plus (chemins →
`anonymized/placeholder.*`) ; il reste à remplacer leur contenu par des fichiers
neutres et à poser les remplaçants. À blanc d'abord, puis `--apply` :

```bash
for volume in meeshy-staging-gateway-uploads meeshy-staging-gateway-sounds meeshy-staging-web-uploads; do
  docker run --rm --network none -v "$volume":/uploads -v <SCRIPTS>:/scripts:ro -v <TRAVAIL>:/work -w /work node:22-slim \
    node /scripts/anonymize-database.mjs media --manifest /work/manifeste.jsonl --uploads-root /uploads --all
done
# relire les comptes, puis relancer la même boucle avec --apply
```

`--all` neutralise **tous** les fichiers du volume, référencés ou non (les
orphelins aussi).

**Empreintes vocales (données biométriques).** Le traducteur range ses clones
de voix dans `/workspace/models/voice_cache`, sur le volume
`meeshy-staging-models-data` (les entrées `UserVoiceModel` du manifeste,
`embeddingPath` et `referenceAudioUrl`, y pointent). Les SUPPRIMER (le
traducteur les recrée à la demande) ; les modèles téléchargés du même volume
restent :

```bash
docker run --rm --network none -v meeshy-staging-models-data:/models alpine sh -c 'find /models/voice_cache -type f | wc -l'
docker run --rm --network none -v meeshy-staging-models-data:/models alpine sh -c 'find /models/voice_cache -mindepth 1 -delete'
```

**Audios générés.** Les sorties TTS du traducteur vont dans `./generated/audios`,
dans la COUCHE du conteneur : seul le recréer les efface (étape 8).

## 7. Redis

Redis tourne en `--appendonly yes` : un `FLUSHALL` sans réécriture laisse les
anciennes valeurs dans le fichier AOF de base. Le plus sûr : recréer son volume.

```bash
docker stop meeshy-redis-staging && docker rm meeshy-redis-staging
docker volume rm meeshy-staging-redis-data
cd "$STAGING" && docker compose up -d redis-staging
```

À défaut (volume impossible à retirer) : `redis-cli FLUSHALL` puis
`redis-cli BGREWRITEAOF`, et attendre `aof_rewrite_in_progress:0` dans
`redis-cli INFO persistence`.

## 8. Journaux Docker

Les journaux de la passerelle, du traducteur et de l'agent portent
transcriptions, adresses e-mail et IP de la période où la copie réelle était en
base. Ils partent avec leur conteneur : RECRÉER (pas seulement redémarrer) les
conteneurs de staging, ce que fait l'étape 10 (`--force-recreate`). Le
conteneur de la base et celui de Redis ont déjà été recréés (étapes 5 et 7).

## 9. Contrôle à la main

La connexion d'un compte de recette, avec le mot de passe neuf du fichier
`--credentials`, une fois les services redémarrés (étape 10). Chaque exécution
laisse une ligne datée (`startedAt`, `finishedAt`) dans `_anonymizationRuns`.

## 10. Redémarrage

Seulement maintenant :

```bash
cd "$STAGING" && docker compose up -d --no-deps --force-recreate \
  translator-staging gateway-staging agent-staging frontend-staging static-files-staging \
  nosqlclient-staging p3x-redis-ui-staging autoheal-staging
docker ps --filter name=staging --format '{{.Names}} {{.Status}}'
```

## 11. Nettoyage

- ranger les mots de passe de `<TRAVAIL>/recette.credentials` dans le
  gestionnaire de secrets, puis supprimer le fichier ;
- supprimer `<TRAVAIL>/manifeste.jsonl` (sel, empreintes, chemins d'origine) ;
- `$SAUVEGARDE` et `$ANONYMISEE` sont des copies (réelle, puis pseudonymisée) :
  elles restent en 600 sous `/opt/meeshy/backups/` jusqu'à décision du porteur,
  comme les copies de l'étape 4 ;
- noter dans l'issue : date, comptes de recette gardés, où chaque copie est
  rangée.
