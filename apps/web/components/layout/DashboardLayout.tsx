'use client';

import { ReactNode, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/hooks/useI18n';
import { NotificationBell } from '@/components/notifications';
import { ShareAffiliateButton } from '@/components/affiliate/share-affiliate-button';
import {
  MessageSquare,
  Bell,
  Search,
  LogOut,
  Settings,
  User as UserIcon,
  Home,
  Users,
  UserPlus,
  Link as LinkIcon,
  ChevronDown,
  Shield,
  Sun,
  Moon,
  Monitor
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { User } from '@/types';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { useUser, useIsAuthChecking } from '@/stores';
import { useAuth } from '@/hooks/use-auth';
import { useAppStore } from '@/stores/app-store';
import { authManager } from '@/services/auth-manager.service';
import { preloadRouteModules } from '@/lib/lazy-components';

interface DashboardLayoutProps {
  children: ReactNode;
  title?: string;
  hideSearch?: boolean;
  className?: string;
  hideHeaderOnMobile?: boolean;
}

export function DashboardLayout({ 
  children, 
  title,
  hideSearch = false,
  className = "",
  hideHeaderOnMobile = false
}: DashboardLayoutProps) {
  const router = useRouter();
  const user = useUser();
  const isAuthChecking = useIsAuthChecking();
  const { logout } = useAuth();
  const { t } = useI18n('common');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const { theme, setTheme } = useAppStore();

  // Détection mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Gérer l'état de chargement basé sur l'utilisateur du hook
  useEffect(() => {
    // Si la vérification d'auth est terminée et qu'il n'y a pas d'utilisateur,
    // rediriger vers la page de connexion
    if (!isAuthChecking && !user) {
      router.push('/');
    }
  }, [user?.id, isAuthChecking, router]);

  const handleLogout = async () => {
    try {
      // Appeler l'API de déconnexion si possible
      const token = authManager.getAuthToken();
      if (token) {
        try {
          await fetch(buildApiUrl(API_ENDPOINTS.AUTH.LOGOUT), {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
          });
        } catch (error) {
          console.error('Erreur API déconnexion:', error);
          // Continuer même si l'API échoue
        }
      }
      
      // Utiliser la fonction logout centralisée (elle gère la redirection)
      logout();
      toast.success(t('auth.logoutSuccess'));
    } catch (error) {
      console.error('Erreur déconnexion:', error);
      toast.error(t('auth.logoutError'));
      // En cas d'erreur, forcer la redirection quand même
      logout();
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400 mx-auto"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('auth.checking')}</p>
        </div>
      </div>
    );
  }

  // Si la vérification d'auth est terminée mais qu'il n'y a pas d'utilisateur,
  // on ne rend rien car le useEffect va rediriger
  if (!user) {
    return null;
  }

  return (
    <div className={`${
      className.includes('!h-full') ? 'h-screen overflow-hidden' :
      className.includes('!h-auto') ? 'min-h-0' :
      'min-h-screen'
    } bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-950 dark:to-gray-900 flex flex-col ${className}`}>
      {/* Header fixe - masqué sur mobile si demandé */}
      {!(isMobile && hideHeaderOnMobile) && (
        <header className="sticky flex-shrink-0 top-0 left-0 right-0 z-[50] bg-white dark:bg-gray-900 shadow-sm dark:shadow-gray-900/50 border-b dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo et titre */}
            <div className="flex items-center space-x-4">
              <div 
                className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => router.push('/')}
              >
                <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white hidden md:inline">Meeshy</h1>
              </div>
              {title && (
                <div className="hidden md:block">
                  <span className="text-gray-400 dark:text-gray-600 mx-2">/</span>
                  <span className="text-lg font-medium text-gray-700 dark:text-gray-300">{title}</span>
                </div>
              )}
            </div>

            {/* Barre de recherche */}
            {!hideSearch && (
              <div className="flex-1 max-w-lg mx-8">
                <form onSubmit={handleSearch} className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                  <Input
                    type="text"
                    placeholder={t('header.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 w-full bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                </form>
              </div>
            )}

            {/* Menu utilisateur */}
            <div className="flex items-center space-x-2 sm:space-x-4">
              {/* Bouton de partage - visible sur tous les écrans */}
              <ShareAffiliateButton
                variant="ghost"
                size="default"
                showText={false}
              />

              {/* Notifications */}
              <NotificationBell />

              {/* Menu déroulant utilisateur */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center space-x-3 hover:bg-gray-100 dark:hover:bg-gray-800">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.avatar} alt={user.firstName} />
                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-semibold">
                        {user.firstName?.charAt(0)}{user.lastName?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden md:block text-left">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">@{user.username}</p>
                    </div>
                    <ChevronDown className="h-4 w-4 text-gray-400 dark:text-gray-500 hidden md:block" />
                  </Button>
                </DropdownMenuTrigger>
                
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onClick={() => router.push('/dashboard')}
                    onMouseEnter={() => preloadRouteModules('/dashboard')}
                    onFocus={() => preloadRouteModules('/dashboard')}
                  >
                    <Home className="mr-2 h-4 w-4" />
                    <span>{t('navigation.dashboard')}</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => router.push('/conversations')}
                    onMouseEnter={() => preloadRouteModules('/conversations')}
                    onFocus={() => preloadRouteModules('/conversations')}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    <span>{t('navigation.conversations')}</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => router.push('/groups')}
                    onMouseEnter={() => preloadRouteModules('/groups')}
                    onFocus={() => preloadRouteModules('/groups')}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    <span>{t('navigation.communities')}</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => router.push('/contacts')}
                    onMouseEnter={() => preloadRouteModules('/contacts')}
                    onFocus={() => preloadRouteModules('/contacts')}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    <span>{t('navigation.contacts')}</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => router.push('/links')}
                    onMouseEnter={() => preloadRouteModules('/links')}
                    onFocus={() => preloadRouteModules('/links')}
                  >
                    <LinkIcon className="mr-2 h-4 w-4" />
                    <span>{t('navigation.links')}</span>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={() => router.push('/u')}
                    onMouseEnter={() => preloadRouteModules('/u')}
                    onFocus={() => preloadRouteModules('/u')}
                  >
                    <UserIcon className="mr-2 h-4 w-4" />
                    <span>{t('navigation.profile')}</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => router.push('/settings')}
                    onMouseEnter={() => preloadRouteModules('/settings')}
                    onFocus={() => preloadRouteModules('/settings')}
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    <span>{t('navigation.settings')}</span>
                  </DropdownMenuItem>

                  {/* Lien Admin - Affiché seulement si l'utilisateur a les permissions */}
                  {(user as any).permissions?.canAccessAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => router.push('/admin')}
                        onMouseEnter={() => preloadRouteModules('/admin')}
                        onFocus={() => preloadRouteModules('/admin')}
                      >
                        <Shield className="mr-2 h-4 w-4" />
                        <span>{t('navigation.admin')}</span>
                      </DropdownMenuItem>
                    </>
                  )}
                  
                  <DropdownMenuSeparator />
                  
                  {/* Options de thème */}
                  <DropdownMenuLabel className="text-xs text-gray-500 dark:text-gray-400">
                    Theme
                  </DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setTheme('light')}>
                    <Sun className="mr-2 h-4 w-4" />
                    <span>Light</span>
                    {theme === 'light' && <span className="ml-auto">✓</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme('dark')}>
                    <Moon className="mr-2 h-4 w-4" />
                    <span>Dark</span>
                    {theme === 'dark' && <span className="ml-auto">✓</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme('auto')}>
                    <Monitor className="mr-2 h-4 w-4" />
                    <span>System</span>
                    {theme === 'auto' && <span className="ml-auto">✓</span>}
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600 dark:text-red-400">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>{t('navigation.logout')}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        </header>
      )}

      {/* Contenu principal avec padding-top conditionnel */}
      <main className={`flex-1 min-h-0 flex flex-col ${
        className.includes('!max-w-none') ? 'w-full' : 'max-w-7xl mx-auto'
      } ${
        className.includes('!px-0') ? '' : 'px-4 sm:px-6 lg:px-8'
      } ${
        className.includes('!overflow-hidden') ? 'overflow-hidden' : ''
      }`}>
        {children}
      </main>
    </div>
  );
}

export default DashboardLayout;

