## 2025-01: Rles - Hirarchie numrique
**Statut**: Accept
**Contexte**: Vrification de permissions efficace et extensible
**Decision**: Rles globaux numriques (BIGBOSS 100 > ADMIN 80 > MODERATOR 60 > AUDIT 40 > ANALYST 30 > USER 10), rles membres spars (CREATOR 40 > ADMIN 30 > MODERATOR 20 > MEMBER 10)
**Alternatives rejet**: Comparaison string (error-prone), bitwise flags (moins lisible), hirarchie DB-only (query ncessaire)
**Cons**: Numros arbitraires, distinction globaux vs contextuels  comprendre
