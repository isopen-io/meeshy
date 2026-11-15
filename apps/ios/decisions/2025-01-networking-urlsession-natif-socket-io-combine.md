## 2025-01: Networking - URLSession natif + Socket.IO + Combine
**Statut**: Accept
**Contexte**: REST pour API, WebSocket pour temps rel, streams d'vnements ractifs
**Decision**: APIClient gnrique `async/await`, deux Socket Managers spars (Message + Social), Combine PassthroughSubject pour events
**Alternatives rejet**: Alamofire/Moya (URLSession suffit), un seul socket manager (reconnexion indpendante ncessaire), callbacks (obsolte)
**Cons**: Code dupliqu entre les deux socket managers, gestion manuelle des `AnyCancellable`
