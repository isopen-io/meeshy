'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

interface AuthGuardV2Props {
  children: ReactNode;
  fallback?: ReactNode;
}

export function AuthGuardV2({ children, fallback }: AuthGuardV2Props) {
  const router = useRouter();
  const { isAuthenticated, isChecking } = useAuth();

  useEffect(() => {
    if (!isChecking && !isAuthenticated) {
      // Sauver URL pour redirection post-login
      const returnUrl = window.location.pathname;
      router.push(`/v2/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    }
  }, [isAuthenticated, isChecking, router]);

  // Loading state avec design V2
  if (isChecking) {
    return fallback || (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--gp-warm-canvas)' }}
      >
        <div className="text-center space-y-4">
          <div
            className="w-12 h-12 rounded-xl mx-auto animate-pulse"
            style={{
              background: 'linear-gradient(135deg, var(--gp-terracotta), var(--gp-deep-teal))'
            }}
          />
          <p style={{ color: 'var(--gp-text-muted)' }}>
            Verification...
          </p>
        </div>
      </div>
    );
  }

  // Non authentifie (redirection en cours)
  if (!isAuthenticated) {
    return fallback || null;
  }

  return <>{children}</>;
}

export default AuthGuardV2;
