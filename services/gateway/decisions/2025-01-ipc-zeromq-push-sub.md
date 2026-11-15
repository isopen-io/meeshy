## 2025-01: IPC - ZeroMQ PUSH/SUB
**Statut**: Accept
**Contexte**: Communication ultra-rapide Gateway <-> Translator pour traductions temps rel
**Decision**: ZMQ PUSH (port 5555) vers Translator PULL, Translator PUB (port 5558) vers Gateway SUB. Multipart: Frame 1 = JSON, Frames 2+ = binaire
**Alternatives rejet**: gRPC (latence protobuf, overhead pour binaire), RabbitMQ/Kafka (broker inutile pour point-to-point), REST polling (trop lent)
**Cons**: Pas de persistence messages, gestion manuelle du cycle de vie des sockets
**Attention**: `binaryFrames[0]` = premier binaire (PAS index [1]). Singleton ZMQ obligatoire
