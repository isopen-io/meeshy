## 2025-01: Rate Limiting - Multi-niveaux
**Statut**: Accept
**Contexte**: Protection contre spam, scraping, DDoS
**Decision**: Global 300 req/min par IP, messages 20/min par user, mentions max 50/msg et 5/min par destinataire, Signal Protocol limits spcifiques
**Alternatives rejet**: Rate limit unique (pas assez granulaire), externe (Cloudflare only, pas de contrle fin)
**Cons**: Limites mmoire ne fonctionnent pas en multi-instance (besoin Redis pour distribu)
