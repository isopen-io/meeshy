## Le translator ne range rien d'un contenu au repos ou destiné à disparaître, et oublie par identifiants ce que la passerelle efface (#13102)

**Décision du 2026-10-26.** Le translator gardait 30 jours dans Redis la
transcription entière d'un vocal, ses traductions et les métadonnées de ses
pistes TTS, par empreinte du fichier, et toute traduction de texte par
empreinte du texte. Rien ne les effaçait quand la pièce était supprimée, échue
ou brûlée, et rien ne les distinguait pour une conversation `server`/`hybrid`
dont le contenu est chiffré au repos.

### Choix : ne pas ranger, plutôt que chiffrer ou raccourcir

Trois voies étaient possibles. **Chiffrer les valeurs** sous la clé de la
conversation aurait donné au translator l'accès aux clés de données — un
second service à qui confier `ENCRYPTION_MASTER_KEY` ou les clés désenveloppées,
c'est-à-dire élargir la frontière de confiance du chiffrement au repos.
**Raccourcir la durée de vie** laissait une fenêtre où le clair survit. Retenu :
**le cache ne sert qu'une tâche dont le régime ordinaire est déclaré.**

- La passerelle déclare le régime sur la requête ZMQ (`atRest: true`) : pour un
  texte `server`/`hybrid` (depuis #12822), pour une tâche audio dont le fichier
  lu est scellé (`ZmqRequestSender`, `loadAudioAsBinary` → `readStoredFile`), et
  pour un message destiné à disparaître (vue unique, flamme, `contentDisappears`).
- Le translator pose le régime pour la tâche (`task_privacy.py`, `contextvars`,
  recopié explicitement dans chaque thread de langue). **Défaut fail-closed :**
  un régime non déclaré ne lit ni n'écrit le cache, et les journaux n'y disent
  que la longueur du texte (`shown`).
- Coût : aucune réutilisation de cache pour ces contenus (rares, peu répétés).

### L'oubli, par identifiants seulement

Tout ce qui se range est INDEXÉ dans la même transaction Redis (MULTI/EXEC),
avec un TTL d'index au moins égal : une traduction sous son message
(`translation:keys:message:<id>:<empreinte>` ; sans message nommé, rien n'est
rangé), un contenu audio sous la correspondance `pièce → empreinte` (empreinte
admise seulement sous sa forme réelle, celle des octets). Rien ne va dans le
cache mémoire de repli.

À l'effacement d'une pièce (`AttachmentService.deleteAttachment`) ou du contenu
d'un message (`eraseSharedTranslations`, site unique de la vue unique, de
l'éphémère, de la suppression et de l'édition), la passerelle envoie
`cache_forget` avec des **identifiants seulement** — aucun texte effacé ne
voyage ni ne se range dans la file. La file est durable dans le Redis de la
passerelle (`translator:cache-forget`), rejouée toutes les deux minutes tant
que le translator n'a pas acquitté (`cache_forget_done`), abandonnée après sept
jours (le cache a alors expiré de lui-même). Le translator n'acquitte que ce
que Redis a CONFIRMÉ (SCAN, DEL) ; Redis indisponible ⇒ aucun accusé, rejeu.

### Rétrocompatibilité

Un translator ancien ignore `atRest` sur une tâche audio (il rangeait comme
avant) et ne connaît pas `cache_forget` (« type inconnu », la passerelle rejoue
sept jours puis abandonne) : déployer le translator avec la passerelle. Une
passerelle ancienne n'envoie ni l'un ni l'autre : le translator nouveau range
les tâches ordinaires comme avant, sous index.

### Hors du modèle de menace

- Le translator voit le clair en mémoire pendant la tâche (c'est le traitement
  serveur des modes `server`/`hybrid`) ; un translator compromis le lit.
- Les clés rangées avant ce lot n'ont pas d'index : elles expirent à 30 jours.
- Les fichiers temporaires du translator (`/tmp/meeshy_audio`) sont effacés en
  fin de tâche, pas de façon sécurisée.
