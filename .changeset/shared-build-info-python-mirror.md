---
'@meeshy/shared': patch
---

`build-info` nomme son miroir Python et corrige la portée qu'il s'attribuait.

L'en-tête du helper décrivait un seul Dockerfile et un seul stage `runner`, et annonçait des valeurs
exposées par `/health` et `/info`. Trois écarts avec le dépôt : les Dockerfiles sont ceux des trois
services — le translator en deux variantes (`Dockerfile`, `Dockerfile.py310`) —, les stages
d'exécution ne portent pas tous le même nom, et seul `/health` expose ces champs.

Surtout, le contrat était muet sur le fait que le translator, écrit en Python, porte un miroir de ce
helper : `services/translator/src/utils/build_info.py`. Les deux fichiers doivent garder des noms de
champs identiques pour que les `/health` des trois services se comparent sans traduction — une
contrainte qu'aucun test ne rattrape et que rien n'énonçait. Elle est désormais écrite là où on la
lit avant de modifier le type.
