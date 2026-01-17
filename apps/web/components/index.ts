/**
 * ⚠️ DEPRECATED: N'utilisez PAS ce fichier barrel pour les imports
 *
 * Les barrel imports avec export * causent d'énormes problèmes de bundle size.
 * Chaque export * charge TOUS les fichiers du dossier, même ceux non utilisés.
 *
 * ✅ CORRECT - Import direct:
 * import { DashboardLayout } from '@/components/layout/DashboardLayout';
 * import { Button } from '@/components/ui/button';
 * import { LoginForm } from '@/components/auth/login-form';
 *
 * ❌ À ÉVITER - Barrel import:
 * import { DashboardLayout, Button, LoginForm } from '@/components';
 *
 * Impact sur le bundle:
 * - Barrel imports: +150-200 KB de JavaScript non utilisé
 * - Imports directs: Uniquement ce qui est nécessaire (tree-shaking optimal)
 *
 * Ce fichier est conservé uniquement pour éviter de casser du code existant,
 * mais tous les nouveaux imports doivent être directs.
 */

// ❌ NE PAS utiliser ces exports - Préférer les imports directs
// Conservés temporairement pour compatibilité
export * from './common';
export * from './ui';
export * from './layout';
export * from './auth';
export * from './conversations';
export * from './groups';
export * from './translation';
export * from './settings';
export * from './notifications';

export { NotFoundPage } from './not-found-page';
