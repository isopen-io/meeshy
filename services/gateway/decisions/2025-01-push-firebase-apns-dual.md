## 2025-01: Push - Firebase + APNs dual
**Statut**: Accept
**Contexte**: Push cross-platform (iOS/Android/Web) + VoIP iOS
**Decision**: FCM pour cross-platform, APNs pour iOS VoIP (PushKit), filtrage par prfrences utilisateur, DND
**Alternatives rejet**: OneSignal/Pusher (cot par notification, vie prive), FCM seul (pas de VoIP iOS)
**Cons**: Setup complexe (deux providers), maintenance certificats APNs + credentials FCM
