# Iteration 15 — Analyse d'optimisation (2026-06-08)

## Contexte
Après iter 14 (6 routes + socketio + .unref cache services), cette itération cible les fichiers à plus forte volumétrie restants en console.*, notamment les routes auth (PII-sensibles), sharing, messages et les services métier.

## Problèmes identifiés

### Groupe A — Routes auth (PII critique)
| Fichier | Instances | Risque PII |
|---------|-----------|------------|
| `routes/auth/login.ts` | 17 | username, user.id, IP, session.id |
| `routes/auth/register.ts` | 9 | user.id, phoneNumber |

**Règle** : username/email/userId doivent aller dans le contexte (PII-hashé), jamais dans la chaîne de message.

### Groupe B — Routes conversations
| Fichier | Instances |
|---------|-----------|
| `routes/conversations/sharing.ts` | 17 |
| `routes/conversations/participants.ts` | 9 |

### Groupe C — Routes messages
| Fichier | Instances |
|---------|-----------|
| `routes/messages.ts` | 16 |

### Groupe D — Services gateway
| Fichier | Instances |
|---------|-----------|
| `services/AttachmentTranslateService.ts` | 16 |
| `services/MagicLinkService.ts` | 14 |

## Note
`ZmqTranslationClient.ts` possède déjà `.unref?.()` à la ligne 419 — pas d'action requise.

## Priorités
1. Phase A : auth routes (PII critique)
2. Phase B/C : conversations + messages (volume élevé)
3. Phase D : services métier
