## 2025-01: Framework - Fastify 5.7
**Statut**: Accept
**Contexte**: Gateway haute performance pour 100k+ messages/seconde
**Decision**: Fastify 5.7 avec validation JSON Schema (Ajv), systme de plugins, async/await natif
**Alternatives rejet**: Express (2-3x plus lent, callbacks, mauvais TS support), Nest.js (trop opinionn, overhead DI style Angular)
**Cons**: cosystme plus petit qu'Express, courbe d'apprentissage
