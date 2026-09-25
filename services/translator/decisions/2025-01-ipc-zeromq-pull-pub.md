## 2025-01: IPC - ZeroMQ PULL/PUB
**Statut**: Accept
**Contexte**: Rception de requtes du Gateway et publication de rsultats
**Decision**: PULL sur port 5555 (rception), PUB sur port 5558 (publication). Multipart: Frame 1 = JSON, Frames 2+ = binaire audio
**Alternatives rejet**: gRPC (overhead protobuf pour binaire), REST (pas de streaming), RabbitMQ (broker inutile)
**Cons**: Pas de persistence, gestion manuelle des frames multipart
**Attention**: `binaryFrames[0]` = premier binaire (PAS index [1])
