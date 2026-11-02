import type { SceneExportCatalog } from '@/lib/i18n-scene-export-catalog';

const ar = {
  'sceneExport.menu.save': 'حفظ',
  'sceneExport.menu.imager': 'حوِّل إلى صورة',
  'sceneExport.length.title': 'ما المدة المطلوب إنشاؤها؟',
  'sceneExport.length.subtitle': 'من بداية المنشور',
  'sceneExport.length.option': '{part}/4 · {duration}',
  'sceneExport.length.cancel': 'إلغاء',
  'sceneExport.tray.preparing': 'جارٍ تحضير التصدير…',
  'sceneExport.tray.progress': 'جارٍ التصدير · {percent}٪',
  'sceneExport.tray.delivering': 'جارٍ حفظ الملف…',
  'sceneExport.tray.cancel': 'إلغاء التصدير',
  'sceneExport.tray.ready': 'الملف جاهز للمشاركة',
  'sceneExport.tray.share': 'مشاركة',
  'sceneExport.notice.saved': 'تم حفظ المنشور',
  'sceneExport.notice.shared': 'تمت مشاركة الملف',
  'sceneExport.notice.cancelled': 'تم إلغاء التصدير',
  'sceneExport.notice.failed': 'فشل التصدير',
  'sceneExport.notice.retry': 'انقر مجددًا لحفظ الملف',
  'sceneExport.notice.unsupported': 'لا يستطيع هذا المتصفح تسجيل الفيديو',
  'sceneExport.notice.offline': 'لا يمكن التصدير دون اتصال',
  'sceneExport.notice.busy': 'يجري تصدير هذا المنشور بالفعل',
} satisfies SceneExportCatalog;

export default ar;
