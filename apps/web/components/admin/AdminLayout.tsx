'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useAppActions } from '@/stores';
import { useAuth } from '@/hooks/use-auth';
import { AuthGuard } from '@/components/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Shield,
  Users,
  BarChart3,
  Settings,
  FileText,
  Crown,
  LogOut,
  Home,
  Menu,
  X,
  Sun,
  Moon,
  Laptop,
  Trophy,
  Mail,
  Link2,
  Bot,
  Activity
} from 'lucide-react';
import { PermissionsService } from '@/services/permissions.service';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/use-i18n';
import { useCurrentInterfaceLanguage } from '@/stores/language-store';
import { preloadRouteModules } from '@/lib/lazy-components';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

interface AdminLayoutProps {
  children: React.ReactNode;
  currentPage?: string;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children, currentPage }) => {
  const { t } = useI18n('admin');
  const interfaceLanguage = useCurrentInterfaceLanguage();
  const user = useUser();
  const { setTheme } = useAppActions();
  const { logout } = useAuth();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Vérifier l'accès admin avec useEffect pour éviter setState pendant render
  useEffect(() => {
    if (!user || !PermissionsService.canAccessAdmin(user)) {
      router.push('/dashboard');
    }
  }, [user, router]);

  // Ne pas rendre le contenu si l'utilisateur n'a pas les permissions
  if (!user || !PermissionsService.canAccessAdmin(user)) {
    return null;
  }

  const handleLogout = async () => {
    try {
      await logout();
      toast.success(t('logoutSuccess'));
      // La redirection se fait automatiquement dans la fonction logout
    } catch (error) {
      console.error('Erreur déconnexion:', error);
      toast.error(t('logoutError'));
    }
  };

  const navigationItems = [
    {
      icon: BarChart3,
      label: t('layout.navDashboard'),
      href: '/admin',
      permission: 'canAccessAdmin',
    },
    {
      icon: Users,
      label: t('layout.navUsers'),
      href: '/admin/users',
      permission: 'canManageUsers',
    },
    {
      icon: Shield,
      label: t('layout.navModeration'),
      href: '/admin/moderation',
      permission: 'canModerateContent',
    },
    {
      icon: FileText,
      label: t('layout.navAuditLogs'),
      href: '/admin/audit',
      permission: 'canViewAuditLogs',
    },
    {
      icon: BarChart3,
      label: t('layout.navAnalytics'),
      href: '/admin/analytics',
      permission: 'canViewAnalytics',
    },
    {
      icon: Link2,
      label: t('layout.navTrackingLinks'),
      href: '/admin/tracking-links',
      permission: 'canViewAnalytics',
    },
    {
      icon: Trophy,
      label: t('layout.navRanking'),
      href: '/admin/ranking',
      permission: 'canViewAnalytics',
    },
    {
      icon: Mail,
      label: t('layout.navBroadcasts'),
      href: '/admin/broadcasts',
      permission: 'canManageNotifications',
    },
    {
      icon: Settings,
      label: t('layout.navSettings'),
      href: '/admin/settings',
      permission: 'canManageTranslations',
    },
    {
      icon: Bot,
      label: t('layout.navAgent'),
      href: '/admin/agent',
      permission: 'canAccessAdmin',
    },
    {
      icon: Activity,
      label: t('layout.navMonitoring'),
      href: '/admin/monitoring',
      permission: 'canAccessAdmin',
    },
  ];

  const filteredNavigation = navigationItems.filter(item =>
    PermissionsService.hasPermission(user, item.permission as keyof typeof user.permissions)
  );

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'BIGBOSS': return '👑';
      case 'ADMIN': return '⚡';
      case 'MODO': return '🛡️';
      case 'AUDIT': return '📊';
      case 'ANALYST': return '📈';
      default: return '👤';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'BIGBOSS': return 'bg-purple-600 text-white';
      case 'ADMIN': return 'bg-red-600 text-white';
      case 'MODO': return 'bg-orange-600 text-white';
      case 'AUDIT': return 'bg-blue-600 text-white';
      case 'ANALYST': return 'bg-green-600 text-white';
      default: return 'bg-gray-600 text-white';
    }
  };

  return (
    <AuthGuard>
      <a href="#main-content" className="skip-link">
        {t('layout.skipToContent')}
      </a>
      <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Mobile Overlay */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar - Hidden on mobile, visible on desktop */}
        <div className={`
          bg-white dark:bg-gray-800 shadow-lg transition-[transform,width] duration-300 flex flex-col
          fixed md:static inset-y-0 left-0 z-50
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${isSidebarOpen ? 'w-64' : 'w-16'}
        `}>
          {/* Header */}
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <div className={`flex items-center space-x-3 ${!isSidebarOpen && 'justify-center'}`}>
                <Crown className="w-8 h-8 text-purple-600" />
                {isSidebarOpen && (
                  <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('layout.title')}</h1>
                    <p className="text-sm text-gray-500">{t('layout.subtitle')}</p>
                  </div>
                )}
              </div>
              {/* Desktop Toggle Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-2 hidden md:flex"
                aria-label={isSidebarOpen ? t('layout.collapseMenu') : t('layout.openMenu')}
              >
                {isSidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </Button>
              {/* Mobile Close Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 md:hidden"
                aria-label={t('layout.closeMenu')}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* User Info */}
          <div className="p-4 border-b">
            <div className={`flex items-center space-x-3 ${!isSidebarOpen && 'justify-center'}`}>
              <Avatar className="w-10 h-10">
                <AvatarImage src={user.avatar} alt={user.displayName || user.username} />
                <AvatarFallback>
                  {(user.displayName || user.username).slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {isSidebarOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {user.displayName || user.username}
                  </p>
                  <Badge className={`text-xs ${getRoleColor(user.role)}`}>
                    {getRoleIcon(user.role)} {user.role}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 px-2 py-4">
            <nav className="space-y-1">
              {/* Retour au dashboard */}
              <Button
                variant="ghost"
                className={`w-full ${isSidebarOpen ? 'justify-start' : 'justify-center'} h-10`}
                onClick={() => router.push('/dashboard')}
                onMouseEnter={() => preloadRouteModules('/dashboard')}
                onFocus={() => preloadRouteModules('/dashboard')}
                aria-label={!isSidebarOpen ? t('layout.backDashboard') : undefined}
              >
                <Home className="w-5 h-5" />
                {isSidebarOpen && <span className="ml-3">{t('layout.backDashboard')}</span>}
              </Button>

              {/* Navigation admin */}
              {filteredNavigation.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.href;

                return (
                  <Button
                    key={item.href}
                    variant={isActive ? "default" : "ghost"}
                    className={`w-full ${isSidebarOpen ? 'justify-start' : 'justify-center'} h-10`}
                    onClick={() => router.push(item.href)}
                    onMouseEnter={() => preloadRouteModules(item.href)}
                    onFocus={() => preloadRouteModules(item.href)}
                    aria-label={!isSidebarOpen ? item.label : undefined}
                  >
                    <Icon className="w-5 h-5" />
                    {isSidebarOpen && <span className="ml-3">{item.label}</span>}
                  </Button>
                );
              })}
            </nav>
          </ScrollArea>

          {/* Footer */}
          <div className="p-4 border-t">
            <Button
              variant="ghost"
              className={`w-full ${isSidebarOpen ? 'justify-start' : 'justify-center'} h-10 text-red-600 hover:text-red-700 hover:bg-red-50`}
              onClick={handleLogout}
              aria-label={!isSidebarOpen ? t('layout.logout') : undefined}
            >
              <LogOut className="w-5 h-5" />
              {isSidebarOpen && <span className="ml-3">{t('layout.logout')}</span>}
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Top Bar */}
          <header className="bg-white dark:bg-gray-900 shadow-sm border-b dark:border-gray-800 px-4 sm:px-6 py-4">
            <div className="flex items-center justify-between">
              {/* Mobile Menu Button + Title */}
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="p-2 md:hidden"
                  aria-label={t('layout.openMenu')}
                >
                  <Menu className="w-5 h-5" />
                </Button>
                <div>
                  <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {currentPage === '/admin' && t('layout.pageAdmin')}
                    {currentPage === '/admin/users' && t('layout.pageUsers')}
                    {currentPage === '/admin/moderation' && t('layout.pageModeration')}
                    {currentPage === '/admin/audit' && t('layout.pageAuditLogs')}
                    {currentPage === '/admin/audit-logs' && t('layout.pageAuditLogs')}
                    {currentPage === '/admin/analytics' && t('layout.pageAnalytics')}
                    {currentPage === '/admin/ranking' && t('layout.pageRanking')}
                    {currentPage === '/admin/broadcasts' && t('layout.pageBroadcasts')}
                    {currentPage === '/admin/tracking-links' && t('layout.pageTrackingLinks')}
                    {currentPage === '/admin/settings' && t('layout.pageSettings')}
                    {currentPage === '/admin/agent' && t('layout.pageAgent')}
                    {currentPage === '/admin/monitoring' && t('layout.pageMonitoring')}
                  </h2>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1 hidden sm:block">
                    {t('layout.accessLevel', { role: PermissionsService.getRoleDisplayName(user.role) })}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 sm:space-x-4">
                {/* Dark Mode Toggle */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9">
                      <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
                      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
                      <span className="sr-only">Toggle theme</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setTheme('light')}>
                      <Sun className="mr-2 h-4 w-4" />
                      {t('layout.themeLight')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme('dark')}>
                      <Moon className="mr-2 h-4 w-4" />
                      {t('layout.themeDark')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme('auto')}>
                      <Laptop className="mr-2 h-4 w-4" />
                      {t('layout.themeAuto')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Badge variant="outline" className="text-green-600 border-green-200 dark:text-green-400 dark:border-green-800 hidden sm:flex">
                  {t('layout.statusOnline')}
                </Badge>
                <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 hidden md:block">
                  {new Date().toLocaleDateString(interfaceLanguage || 'en', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </span>
              </div>
            </div>
          </header>

          {/* Content Area */}
          <main id="main-content" className="flex-1 p-3 sm:p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
};

export default AdminLayout;
