import type { InterfaceCatalog } from '@/lib/i18n-catalog';

const ar = {
  'announce.messageSent': 'تم إرسال الرسالة',
  'announce.messageCopied': 'تم نسخ الرسالة',
  'announce.messagesCopied': 'تم نسخ الرسائل',
  'announce.messageProtected': 'رسالة محمية',
  'announce.selectionCap': '{count} رسالة كحد أقصى',
  'announce.nothingToCopy': 'لا شيء للنسخ',

  'message.author.self': 'أنت',
  'message.excerpt.protected': 'محتوى محمي',
  'a11y.message.menu.subject': 'إجراءات رسالة {author}: {excerpt}',

  'typing.named': '{name} يكتب',
  'typing.double': '{first} و{second} يكتبان',
  'typing.several': 'عدة أشخاص يكتبون',

  'root.menu.feed': 'التدفق',
  'root.menu.links': 'روابطي',
  'root.menu.notifications': 'الإشعارات',
  'root.menu.calls': 'المكالمات',
  'root.menu.discover': 'اكتشاف',
  'root.menu.communities': 'المجتمعات',
  'root.menu.settings': 'الإعدادات',
  'root.menu.profile': 'الملف الشخصي',
  'a11y.floating.menu': 'القائمة',
  'a11y.floating.menu.ladder': 'التنقل في Meeshy',

  'pending.back': 'العودة إلى المحادثات',
  'pending.comingSoon': 'هذه الشاشة قادمة قريبًا.',
  'pending.feed.promise': 'منشورات الأشخاص الذين تتابعهم.',
  'pending.links.promise': 'ستُجمع هنا الروابط التي تمت مشاركتها في محادثاتك.',
  'pending.notifications.promise': 'ما ينتظرك — الإشارات والردود والدعوات — ستقرؤه هنا.',
  'pending.calls.promise': 'سجل مكالماتك، وطريقة لإجراء مكالمة.',
  'pending.discover.promise': 'أشخاص للتعرف عليهم، يتم اختيارهم بحسب ما يجمعكم.',
  'pending.communities.promise': 'المجتمعات التي تنتمي إليها، وتلك التي تشبهك.',
  'pending.settings.promise': 'لغاتك وخصوصيتك وإشعاراتك.',
  'pending.profile.promise': 'هويتك على Meeshy — الاسم والصورة واللغات وما يراه الآخرون منها.',
} satisfies InterfaceCatalog;

export default ar;
