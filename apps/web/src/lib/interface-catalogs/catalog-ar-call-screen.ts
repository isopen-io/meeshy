/**
 * LE PARTAGE D'ÉCRAN PENDANT UN APPEL (#8063) — tranche du catalogue,
 * RÉPANDUE par `catalog-ar.ts` comme `catalog-ar-call-devices.ts` : le
 * bouton Écran de l'écran d'appel, la pastille de celui qui partage et la
 * bannière de celui qui regarde (`call-screen.tsx`).
 */
const arCallScreen = {
  'call.screen.share': 'مشاركة الشاشة',
  'call.screen.stop': 'إيقاف مشاركة الشاشة',
  'call.screen.sharing': 'أنت تشارك شاشتك',
  'call.screen.peerSharing': '{name} يشارك شاشته',
  'call.more': 'مزيد من الإجراءات',
  'call.section.mine': 'صورتي',
  'call.section.call': 'المكالمة',
  'call.flip': 'قلب',
  'call.screen.short': 'الشاشة',
  'call.record.short': 'تسجيل',
  'call.conversation.open': 'فتح المحادثة',
  'call.flip.label': 'قلب الكاميرا',
  'call.fullscreen.enter': 'ملء الشاشة',
  'call.fullscreen.exit': 'الخروج من ملء الشاشة',
  'call.screen.of': 'شاشة {name}',
} as const;

export default arCallScreen;
