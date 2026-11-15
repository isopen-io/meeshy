## 2025-02: Networking - APIClient gnrique async/await
**Statut**: Accept
**Contexte**: Client HTTP type-safe avec refresh token automatique
**Decision**: APIClient singleton, mthode gnrique `request<T: Decodable>()`, retry automatique sur 401 avec token refresh, dcodage ISO8601 fractionnaire
**Alternatives rejet**: Alamofire (dpendance inutile), async URLSession brut (boilerplate), Moya (trop abstrait)
**Cons**: Code custom  maintenir, mais type-safe et sans dpendance
