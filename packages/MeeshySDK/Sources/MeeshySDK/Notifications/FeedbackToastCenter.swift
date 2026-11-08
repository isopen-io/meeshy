import Foundation

/// Porte UNIQUE et typée du pont de toasts : les vues du SDK n'ont pas le
/// gestionnaire de toasts de l'app, elles postent ici ; l'app observe et décode.
public enum FeedbackToastCenter {

    public static let notificationName = Notification.Name("meeshy.showToast")

    private static let messageKey = "message"
    private static let isSuccessKey = "isSuccess"

    public static func post(_ message: String, isSuccess: Bool, center: NotificationCenter = .default) {
        center.post(
            name: notificationName,
            object: nil,
            userInfo: [messageKey: message, isSuccessKey: isSuccess]
        )
    }

    public static func decode(_ notification: Notification) -> (message: String, isSuccess: Bool)? {
        guard notification.name == notificationName,
              let message = notification.userInfo?[messageKey] as? String,
              let isSuccess = notification.userInfo?[isSuccessKey] as? Bool
        else { return nil }
        return (message, isSuccess)
    }
}
