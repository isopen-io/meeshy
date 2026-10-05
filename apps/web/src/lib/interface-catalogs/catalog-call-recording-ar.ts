import type { CallRecordingCatalog } from '@/lib/i18n-call-recording-catalog';

const ar = {
  'callRecording.stop': 'إيقاف التسجيل',
  'callRecording.active': 'التسجيل جارٍ',
  'callRecording.waiting': 'بانتظار موافقة الجميع…',
  'callRecording.ask': '{name} يريد تسجيل المكالمة',
  'callRecording.askVideo': '{name} يريد تسجيل المكالمة بالفيديو',
  'callRecording.askDetail': 'لا يبدأ التسجيل إلا إذا وافق الجميع، ثم يُضاف إلى المحادثة.',
  'callRecording.accept': 'قبول',
  'callRecording.refuse': 'رفض',
  'callRecording.cancel': 'إلغاء',
  'callRecording.someone': 'أحد المشاركين',
  'callRecording.stopped.refused': 'تم رفض التسجيل',
  'callRecording.stopped.timeout': 'لم يُجب الجميع: لا تسجيل',
  'callRecording.stopped.joined': 'انضم شخص إلى المكالمة: توقف التسجيل',
  'callRecording.stopped.other': 'توقف التسجيل',
  'callRecording.unavailable': 'التسجيل غير متاح حاليًا',
  'callRecording.saved': 'أُضيف التسجيل إلى المحادثة',
  'callRecording.saveFailed': 'تعذّرت إضافة التسجيل',
  'callRecording.close': 'إغلاق',
} satisfies CallRecordingCatalog;

export default ar;
