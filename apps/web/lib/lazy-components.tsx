/**
 * Lazy loading optimisé pour les composants lourds
 * Avec fallbacks et preloading intelligent
 */

import { lazy, Suspense, ComponentType } from 'react';
import { Loader2 } from '@/lib/icons';

// =============================================================================
// FALLBACK COMPONENTS
// =============================================================================

const ComponentFallback = ({ name }: { name: string }) => (
  <div className="flex items-center justify-center p-8 min-h-[200px]">
    <div className="flex flex-col items-center space-y-2">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Chargement {name}...</p>
    </div>
  </div>
);

const PageFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="flex flex-col items-center space-y-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-lg font-medium">Chargement de la page...</p>
    </div>
  </div>
);

const ModalFallback = () => (
  <div className="flex items-center justify-center p-6">
    <Loader2 className="h-5 w-5 animate-spin" />
  </div>
);

// =============================================================================
// LAZY LOADED COMPONENTS - Pages
// =============================================================================

export const LazyBubbleStreamPage = lazy(() => 
  import('@/components/common/bubble-stream-page').then(module => ({
    default: module.BubbleStreamPage
  }))
);

export const LazyConversationLayout = lazy(() =>
  import('@/components/conversations/ConversationLayout').then(module => ({
    default: module.ConversationLayout
  }))
);

export const LazyDashboardPage = lazy(() =>
  import('@/app/dashboard/page').then(module => ({
    default: module.default
  }))
);

// =============================================================================
// LAZY LOADED COMPONENTS - Modals & Heavy UI
// =============================================================================

export const LazyCreateConversationModal = lazy(() =>
  import('@/components/conversations/create-conversation-modal').then(module => ({
    default: module.CreateConversationModal
  }))
);

export const LazyConversationDetailsSidebar = lazy(() =>
  import('@/components/conversations/conversation-details-sidebar').then(module => ({
    default: module.ConversationDetailsSidebar
  }))
);

export const LazyConfigModal = lazy(() =>
  import('@/components/settings/config-modal').then(module => ({
    default: module.ConfigModal
  }))
);

// =============================================================================
// LAZY LOADED COMPONENTS - Forms & Auth
// =============================================================================

export const LazyLoginForm = lazy(() =>
  import('@/components/auth/login-form').then(module => ({
    default: module.LoginForm
  }))
);

export const LazyRegisterForm = lazy(() =>
  import('@/components/auth/register-form').then(module => ({
    default: module.RegisterForm
  }))
);

// =============================================================================
// WRAPPER COMPONENTS WITH SUSPENSE
// =============================================================================

interface LazyWrapperProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  name?: string;
}

export function LazyPageWrapper({ children, fallback }: LazyWrapperProps) {
  return (
    <Suspense fallback={fallback || <PageFallback />}>
      {children}
    </Suspense>
  );
}

export function LazyComponentWrapper({ children, fallback, name = "composant" }: LazyWrapperProps) {
  return (
    <Suspense fallback={fallback || <ComponentFallback name={name} />}>
      {children}
    </Suspense>
  );
}

export function LazyModalWrapper({ children, fallback }: LazyWrapperProps) {
  return (
    <Suspense fallback={fallback || <ModalFallback />}>
      {children}
    </Suspense>
  );
}

// =============================================================================
// PRELOADING UTILITIES
// =============================================================================

// Cache pour éviter de précharger plusieurs fois le même module
const preloadedModules = new Set<string>();

// Preload des composants critiques
export function preloadCriticalComponents() {
  // Preload des composants les plus utilisés après le chargement initial
  setTimeout(() => {
    import('@/components/common/bubble-stream-page');
    import('@/components/conversations/ConversationLayout');
  }, 1000);
}

// Preload des composants selon l'interaction utilisateur
export function preloadOnHover(componentName: string) {
  // Éviter les préchargements multiples
  if (preloadedModules.has(componentName)) return Promise.resolve();
  preloadedModules.add(componentName);

  const preloadMap: Record<string, () => Promise<any>> = {
    'create-conversation': () => import('@/components/conversations/create-conversation-modal'),
    'config-modal': () => import('@/components/settings/config-modal'),
    'login-form': () => import('@/components/auth/login-form'),
    'register-form': () => import('@/components/auth/register-form'),
    'conversation-details': () => import('@/components/conversations/conversation-details-sidebar'),
  };

  return preloadMap[componentName]?.();
}

// =============================================================================
// ROUTE PRELOADING - Précharger les pages au hover
// =============================================================================

/**
 * Map des routes vers leurs modules à précharger
 * Inclut les composants principaux de chaque page
 */
const routePreloadMap: Record<string, () => Promise<any>[]> = {
  '/dashboard': () => [
    import('@/app/dashboard/page'),
  ],
  '/conversations': () => [
    import('@/components/conversations/ConversationLayout'),
    import('@/components/common/bubble-stream-page'),
  ],
  '/groups': () => [
    import('@/app/groups/page'),
  ],
  '/contacts': () => [
    import('@/app/contacts/page'),
  ],
  '/settings': () => [
    import('@/app/settings/page'),
  ],
  '/admin': () => [
    import('@/components/admin/AdminLayout'),
    import('@/components/admin/Charts'),
  ],
  '/u': () => [
    import('@/app/u/page'),
  ],
  '/links': () => [
    import('@/app/links/page'),
  ],
  '/search': () => [
    import('@/app/search/page'),
  ],
};

/**
 * Précharge les modules d'une route spécifique
 * @param route - La route à précharger (ex: '/dashboard')
 */
export function preloadRouteModules(route: string): void {
  // Éviter les préchargements multiples
  const cacheKey = `route:${route}`;
  if (preloadedModules.has(cacheKey)) return;
  preloadedModules.add(cacheKey);

  const preloadFn = routePreloadMap[route];
  if (preloadFn) {
    // Précharger de manière non-bloquante
    Promise.all(preloadFn()).catch(() => {
      // Ignorer les erreurs de préchargement silencieusement
    });
  }
}

/**
 * Crée les handlers pour le préchargement au hover/focus
 * Utilisable sur n'importe quel élément navigable
 *
 * @example
 * const preloadHandlers = createPreloadHandlers('/dashboard');
 * <button {...preloadHandlers} onClick={() => router.push('/dashboard')}>
 */
export function createPreloadHandlers(route: string) {
  return {
    onMouseEnter: () => preloadRouteModules(route),
    onFocus: () => preloadRouteModules(route),
  };
}

// =============================================================================
// HIGHER ORDER COMPONENT FOR LAZY LOADING
// =============================================================================

interface WithLazyLoadingOptions {
  fallback?: React.ReactNode;
  preload?: boolean;
  name?: string;
}

export function withLazyLoading<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  options: WithLazyLoadingOptions = {}
) {
  const LazyComponent = lazy(importFn);
  
  const WrappedComponent = (props: React.ComponentProps<T>) => {
    return (
      <Suspense fallback={options.fallback || <ComponentFallback name={options.name || "composant"} />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };

  // Preload si demandé
  if (options.preload) {
    setTimeout(() => importFn(), 100);
  }

  return WrappedComponent;
}

// =============================================================================
// ROUTE-BASED LAZY LOADING
// =============================================================================

export const lazyRoutes = {
  dashboard: () => import('@/app/dashboard/page'),
  // conversations: géré directement par Next.js routing
  groups: () => import('@/app/groups/page'),
  search: () => import('@/app/search/page'),
  login: () => import('@/app/login/page'),
  signin: () => import('@/app/signin/page'),
} as const;

// Preload des routes selon la navigation
export function preloadRoute(routeName: keyof typeof lazyRoutes) {
  return lazyRoutes[routeName]?.();
}
