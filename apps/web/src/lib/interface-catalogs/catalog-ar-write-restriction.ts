import type { WriteRestrictionCatalogSlice } from './catalog-fr-write-restriction';

/** La restriction d'écriture servie (#9928) — voir `catalog-fr-write-restriction.ts`. */
const arWriteRestriction = {
  'composer.writeRestriction.minorGlobal': 'يُفتح Global للكتابة عند بلوغك 18 عامًا',
  'composer.writeRestriction.endToEnd': 'محادثة مشفّرة من طرف إلى طرف: اكتب من تطبيق Meeshy',
  'composer.writeRestriction.endToEnd.shell': 'محادثة مشفّرة من طرف إلى طرف: اكتب من أحد أجهزتك المشفّرة',
  'age.blocked.title': 'Meeshy مخصّص لمن هم في سن 13 عامًا فأكثر',
  'age.blocked.body': 'لا يمكن استخدام هذا الحساب قبل بلوغك 13 عامًا.',
  'age.blocked.confirm': 'فهمت',
} satisfies WriteRestrictionCatalogSlice;

export default arWriteRestriction;
