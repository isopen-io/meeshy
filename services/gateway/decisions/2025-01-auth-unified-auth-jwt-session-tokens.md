## 2025-01: Auth - Unified Auth (JWT + Session Tokens)
**Statut**: Accept
**Contexte**: Support simultan des utilisateurs enregistrs (JWT) et anonymes (session token)
**Decision**: Middleware unifi `UnifiedAuthContext` avec `type: 'jwt' | 'session' | 'anonymous'`, trusted sessions pour "remember me"
**Alternatives rejet**: OAuth2/OIDC (overkill), Passport.js (Express-oriented), session-only (incompatible mobile stateless)
**Cons**: Plus complexe qu'un seul type d'auth, rtro-compatibilit `request.user`/`request.auth`
