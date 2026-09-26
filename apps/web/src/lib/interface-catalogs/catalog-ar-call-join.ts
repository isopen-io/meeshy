/**
 * REJOINDRE, REPRENDRE, LA FICHE D'UN APPEL ET LE PAVÉ (lot 3 des appels —
 * #6383, #6454, #3586) — tranche arabe du catalogue, RÉPANDUE par
 * `catalog-ar.ts` comme `catalog-ar-call.ts`. Libellés repris d'iOS
 * (`CallDetailSheet.swift`, `KeypadTab.swift`).
 */
const arCallJoin = {
  'callJoin.action': 'انضمام',
  'callJoin.named': 'الانضمام إلى المكالمة مع {name}',
  'callJoin.header': 'الانضمام إلى المكالمة الجارية',
  'callJoin.resume.title': 'مكالمة جارية',
  'callJoin.resume.action': 'استئناف',
  'callJoin.resume.named': 'استئناف المكالمة مع {name}',
  'callJoin.detail.title': 'تفاصيل المكالمة',
  'callJoin.detail.type': 'النوع',
  'callJoin.detail.date': 'التاريخ',
  'callJoin.detail.duration': 'المدة',
  'callJoin.detail.data': 'البيانات',
  'callJoin.detail.openConversation': 'فتح المحادثة',
  'callJoin.detail.loading': 'جارٍ تحميل المكالمة',
  'callJoin.detail.notFound.title': 'المكالمة غير موجودة',
  'callJoin.detail.notFound.body': 'لم تعد هذه المكالمة موجودة أو غير متاحة لك.',
  'callJoin.detail.joining': 'جارٍ الاتصال بالمكالمة…',
  'keypad.title': 'لوحة الأرقام',
  'keypad.open': 'طلب رقم',
  'keypad.input.placeholder': 'رقم أو اسم',
  'keypad.input.label': 'الرقم أو الاسم المطلوب البحث عنه',
  'keypad.delete': 'حذف',
  'keypad.clear': 'حذف الكل',
  'keypad.prompt.title': 'اطلب رقمًا أو اسمًا',
  'keypad.prompt.subtitle': 'ابحث عن شخص برقم هاتفه أو باسمه.',
  'keypad.searching': 'جارٍ البحث…',
  'keypad.noMatch.title': 'لم يُعثر على أي جهة اتصال',
  'keypad.noMatch.subtitle': 'تحقق من الرقم أو الاسم المُدخل.',
  'keypad.error.title': 'فشل البحث',
  'keypad.error.body': 'تحقق من اتصالك ثم أعد المحاولة.',
  'keypad.offline.title': 'غير متصل',
  'keypad.offline.body': 'سيُستأنف البحث عند عودة الشبكة.',
  'keypad.results': 'النتائج',
  'keypad.call.audio.named': 'مكالمة صوتية إلى {name}',
  'keypad.call.video.named': 'مكالمة فيديو إلى {name}',
  'keypad.call.failed': 'تعذّر بدء المكالمة. أعد المحاولة.',
  'keypad.retry': 'إعادة المحاولة',
} as const;

export default arCallJoin;
