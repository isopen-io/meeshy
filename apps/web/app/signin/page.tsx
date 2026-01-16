'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Redirection de /signin vers /signup
 * Cette page maintient la rétrocompatibilité pour les anciens liens
 * tout en redirigeant vers la nouvelle page d'inscription.
 */
export default function SigninRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Préserver les paramètres de requête (returnUrl, affiliate, etc.)
    const params = searchParams.toString();
    const redirectUrl = params ? `/signup?${params}` : '/signup';
    router.replace(redirectUrl);
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center">
      <div className="w-10 h-10 border-3 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
