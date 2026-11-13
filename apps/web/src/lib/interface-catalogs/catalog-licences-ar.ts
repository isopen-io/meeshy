import type { LicencesCatalog } from '../i18n-licences-catalog';

/** L'écran Licences (#14628), العربية. */
const ar = {
  'licences.row': 'تراخيص المصدر المفتوح',
  'licences.title': 'التراخيص',
  'licences.meeshy.title': 'ترخيص Meeshy',
  'licences.meeshy.body': 'يُنشر الكود المصدري لـ Meeshy بموجب ترخيص MIT. يتضمن هذا التطبيق مكتبة libsignal ‏(Signal Messenger) المنشورة بموجب ترخيص GNU AGPL-3.0، لذا فإن التطبيق الموزَّع عمل مرخَّص بموجب ترخيص AGPL-3.0 فقط.',
  'licences.meeshy.body_mit': 'يُنشر الكود المصدري لـ Meeshy بموجب ترخيص MIT.',
  'licences.source.title': 'الكود المصدري',
  'licences.source.body': 'الكود المصدري المقابل لهذا الإصدار، بما في ذلك سكربتات البناء، متاح مجانًا.',
  'licences.source.commit': 'المراجعة {commit}',
  'licences.source.open': 'فتح',
  'licences.agpl.title': 'نص ترخيص AGPL-3.0',
  'licences.libsignal.title': 'إشعارات libsignal',
  'licences.libsignal.body': 'مكتبة libsignal والمكتبات التي تتضمنها، مع نص تراخيصها.',
  'licences.libsignal.question': 'ماذا يغطي هذا الإشعار؟',
  'licences.libsignal.open': 'فتح',
  'licences.legal_review': 'هذه المعلومات قيد المراجعة القانونية.',
} as const satisfies LicencesCatalog;

export default ar;
