## 2025-02: Dpendance unique - Socket.IO Client
**Statut**: Accept
**Contexte**: Minimiser les dpendances externes pour stabilit et taille du binaire
**Decision**: Seule dpendance: `socket.io-client-swift 16.1+`. URLSession pour HTTP, Foundation pour JSON, Combine pour streams
**Alternatives rejet**: Alamofire (URLSession suffit), Starscream (Socket.IO l'inclut dj), SwiftyJSON (Codable natif suffit)
**Cons**: Plus de code custom pour HTTP, mais contrle total et zro dpendance transitoire
