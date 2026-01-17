'use client';

/**
 * RegisterForm - Formulaire d'inscription
 *
 * Ce composant exporte le formulaire d'inscription refactorisé.
 * L'implémentation réelle se trouve dans ./register-form/
 *
 * Architecture:
 * - hooks/use-register-form.ts: Logique métier et soumission
 * - hooks/use-field-validation.ts: Validation et vérification de disponibilité
 * - components/auth/register-form/: Components séparés par responsabilité
 *
 * Réduction: 816 lignes → ~400 lignes totales
 */

export { RegisterForm } from './register-form';
export type { RegisterFormData } from '@/hooks/use-register-form';
