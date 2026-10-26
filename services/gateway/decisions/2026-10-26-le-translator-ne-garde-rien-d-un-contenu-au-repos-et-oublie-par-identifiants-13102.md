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
avec un TTL d'index au moins égal, dans l'espace `v3` : une traduction
(`translation:text:v3:<empreinte>`) sous l'ENSEMBLE de son message
(`translation:v3:message:<id>` ; sans message nommé, rien n'est rangé), un
contenu audio sous la correspondance `pièce → empreinte`
(`audio:v3:hash:mapping:<id>`, empreinte admise seulement sous sa forme réelle,
celle des octets) et les ensembles de langues (`audio:v3:hash:langs:<empreinte>`,
`audio:v3:attachment:langs:<id>`) ; les entrées par identifiant de pièce
(`audio:v3:transcription:<id>`, `audio:v3:translation:<id>:<langue>`) aussi.
Rien ne va dans le cache mémoire de repli.

À l'effacement d'une pièce (`AttachmentService.deleteAttachment`) ou du contenu
d'un message (`eraseSharedTranslations`, site unique de la vue unique, de
l'éphémère, de la suppression et de l'édition), la passerelle envoie
`cache_forget` avec des **identifiants seulement** — aucun texte effacé ne
voyage ni ne se range dans la file. La file est durable dans le Redis de la
passerelle (`translator:cache-forget`), rejouée toutes les deux minutes tant
que le translator n'a pas acquitté (`cache_forget_done`), abandonnée après sept
jours (le cache a alors expiré de lui-même). Le translator n'acquitte que ce
que Redis a CONFIRMÉ (lecture des ensembles, DEL) ; Redis indisponible ⇒
aucun accusé, rejeu. Aucun balayage (ni KEYS ni SCAN) sur le chemin de l'oubli.

### Le cache d'avant v3 : purgé une fois, au déploiement

Les entrées rangées avant l'espace `v3` (`translation:text:*` hors v3,
`translation:keys:*`, `audio:hash:mapping:*`, `audio:transcription:*`,
`audio:translation:*`) n'ont pas d'index que l'oubli sache lire, et ne sont
plus jamais servies. Plutôt qu'un repli par balayage dans `forget_*` pendant
30 jours, une PURGE UNIQUE les efface : ce n'est qu'un cache régénérable, rien
ne se perd. `services/translator/src/services/legacy_cache_purge.py`, autonome,
par SCAN, à blanc par défaut, idempotent, ne journalise que des comptes :

    docker exec <translator> python -I /workspace/src/services/legacy_cache_purge.py
    docker exec <translator> python -I /workspace/src/services/legacy_cache_purge.py --apply

Le script vit dans l'image : rien n'est déposé sur le serveur. Staging : jouée
au déploiement de ce lot. Production : attend le feu vert du porteur (#13102).

### Ce qui part à côté : la synthèse, ses fichiers, le texte éphémère (audit du 2026-10-26)

- Le cache de synthèse `tts:audio:*` ne se lit ni ne s'écrit hors d'une tâche
  ordinaire déclarée (`cache_allowed()`).
- Une tâche au repos ou éphémère efface ses pistes de `generated/audios/`
  une fois publiées à la passerelle (`_forget_translated_audio_files`).
- La traduction d'un TEXTE à vue unique, à flamme ou éphémère part protégée
  comme sa tâche audio (`translationRequestRegime`) : rien n'en est rangé.

### Rétrocompatibilité

Un translator ancien ignore `atRest` sur une tâche audio (il rangeait comme
avant) et ne connaît pas `cache_forget` (« type inconnu », la passerelle rejoue
sept jours puis abandonne) : déployer le translator avec la passerelle. Une
passerelle ancienne n'envoie ni l'un ni l'autre : le translator nouveau range
les tâches ordinaires comme avant, sous index.

### Hors du modèle de menace

- Le translator voit le clair en mémoire pendant la tâche (c'est le traitement
  serveur des modes `server`/`hybrid`) ; un translator compromis le lit.
- Pour une conversation ORDINAIRE, `tts:audio:*` (empreinte du texte → chemin
  de piste, 7 jours) et les pistes de `generated/audios/` ne s'oublient pas à
  la suppression du message : comportement d’avant, suivi par #13143.
- Tant que la purge n'a pas été jouée (production en attente du feu vert), les
  clés d'avant v3 restent en Redis, non servies, jusqu'à leur TTL de 30 jours.
- Les fichiers temporaires du translator (`/tmp/meeshy_audio`) sont effacés en
  fin de tâche, pas de façon sécurisée.
