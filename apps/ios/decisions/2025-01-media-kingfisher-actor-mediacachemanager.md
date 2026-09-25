## 2025-01: Media - Kingfisher + Actor MediaCacheManager
**Statut**: Accept
**Contexte**: Images frquentes et petites vs audio/vido rares et volumineux = politiques de cache diffrentes
**Decision**: Kingfisher pour images, Actor custom pour audio/vido/documents (NSCache mmoire + FileManager disque, 7j TTL)
**Alternatives rejet**: SDWebImage (moins Swift-natif), cache unique (politiques incompatibles)
**Cons**: Deux systmes de cache  maintenir, pas d'viction automatique du disque au-del de l'ge
