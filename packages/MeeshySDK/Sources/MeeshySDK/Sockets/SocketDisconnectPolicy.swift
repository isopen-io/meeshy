import Foundation

/// **Une coupure décidée par le SERVEUR se rattrape ; une coupure décidée par
/// l'app, non.**
///
/// Socket.IO-Swift ne relance sa boucle de reconnexion qu'après une perte de
/// transport. Quand la passerelle ferme elle-même la connexion
/// (`socket.disconnect(true)` : erreur passagère à l'authentification, jeton
/// expiré, redémarrage), le client reçoit `"Got Disconnect"` et s'arrête là —
/// l'app restait « reconnexion… » des heures sur un iPad laissé au premier plan,
/// jusqu'au prochain retour d'arrière-plan ou changement de réseau. De même
/// `"Reconnect Failed"` quand une boucle bornée s'épuise.
///
/// Les coupures que l'app provoque (`"Namespace leave"` de `socket.disconnect()`
/// à la mise en arrière-plan ou à la déconnexion, `"Disconnect"` du manager)
/// ne relancent rien : les relancer rouvrirait un socket que l'app vient de
/// fermer exprès.
public enum SocketDisconnectPolicy {
    public static func retries(afterReason reason: String?) -> Bool {
        reason == "Got Disconnect" || reason == "Reconnect Failed"
    }

    /// La raison portée par l'événement `.disconnect` de Socket.IO.
    public static func reason(in data: [Any]) -> String? {
        data.first as? String
    }
}
