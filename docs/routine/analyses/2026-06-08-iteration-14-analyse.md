# Iteration 14 — Analyse d'optimisation (2026-06-08)

## Contexte
Suite à l'itération 13 (migration logger jobs/services/ZMQ), cette itération cible les console.* restants dans les routes gateway, les print() Python dans le translator, et les .unref() manquants dans les services.

## Problèmes identifiés

### Groupe A — console.* dans les routes gateway (6 fichiers, ~49 instances)
| Fichier | Instances estimées |
|---------|-------------------|
| `src/routes/communities.ts` | ~14 |
| `src/routes/affiliate.ts` | ~16 |
| `src/routes/maintenance.ts` | ~5 |
| `src/routes/conversation-encryption.ts` | ~3 |
| `src/routes/magic-link.ts` | ~4 |
| `src/routes/message-read-status.ts` | ~6 |

**Impact** : Haute — logs non structurés, PII potentiels, pas de redirection vers monitoring.

### Groupe B — console.* dans socketio/utils
| Fichier | Instances |
|---------|-----------|
| `src/socketio/utils/socket-helpers.ts` | ~2 |

### Groupe C — print() Python dans translator
| Fichier | Instances |
|---------|-----------|
| `services/translator/src/main.py` | ~7 startup prints |
| autres fichiers translator | ~137 total |

**Impact** : Moyen — logs perdus en production container, pas de niveaux de log.

### Groupe D — .unref?.() manquants dans services
- `TusCleanupService.ts` à vérifier
- Autres services cleanup potentiels

## Priorités
1. Phase A : routes gateway console.* (impact élevé, effort faible)
2. Phase B : socketio utils console.*
3. Phase C : translator print() → logging (les fichiers principaux seulement)
4. Phase D : .unref?.() services restants
