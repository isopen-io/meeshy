'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LogIn,
  UserPlus,
  MessageSquare,
  Menu,
  X,
  Share2,
  Sun,
  Moon,
  Monitor,
  ChevronDown,
  LogOut,
  Languages
} from 'lucide-react';
import { AuthMode } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { useAppStore } from '@/stores/app-store';
import { useI18n } from '@/hooks/useI18n';
import { LanguageFlagSelector } from '@/components/translation/language-flag-selector';
import { LanguageSelector } from '@/components/translation/language-selector';
import { useLanguageStore, useUser } from '@/stores';
import { INTERFACE_LANGUAGES } from '@/types/frontend';

interface HeaderProps {
  mode?: 'landing' | 'chat' | 'default';
  authMode?: AuthMode;
  onAuthModeChange?: (mode: AuthMode) => void;
  anonymousChatLink?: string | null;
  conversationTitle?: string;
  shareLink?: string;
}

export function Header({
  mode = 'default',
  authMode = 'welcome',
  onAuthModeChange,
  anonymousChatLink,
  conversationTitle,
  shareLink
}: HeaderProps) {
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // CORRECTION CRITIQUE: Utiliser directement le store Zustand comme source unique de vérité
  // au lieu de useAuth() qui maintient un état local qui peut être obsolète
  const storeUser = useUser();
  const { isAnonymous, logout, leaveAnonymousSession } = useAuth();
  // Utiliser storeUser comme user définitif (source unique de vérité)
  const user = storeUser;
  const { theme, setTheme } = useAppStore();
  const { t } = useI18n('header');
  
  // Language store pour le sélecteur de langue
  const currentInterfaceLanguage = useLanguageStore(state => state.currentInterfaceLanguage);
  const setInterfaceLanguage = useLanguageStore(state => state.setInterfaceLanguage);

  const handleLanguageChange = (languageCode: string) => {
    setInterfaceLanguage(languageCode);
    // La langue de l'interface change automatiquement sans reload
  };

  const handleAuthClick = (newMode: AuthMode) => {
    if (onAuthModeChange) {
      onAuthModeChange(newMode);
    }
  };

  const handleLogout = async () => {
    try {
      if (isAnonymous) {
        await leaveAnonymousSession();
      } else {
        await logout();
      }
      router.push('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleShare = () => {
    if (shareLink && navigator.share) {
      navigator.share({
        title: conversationTitle || 'Meeshy Conversation',
        url: shareLink,
      }).catch(console.error);
    } else if (shareLink) {
      navigator.clipboard.writeText(shareLink);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md dark:bg-gray-900/80">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <MessageSquare className="h-8 w-8 text-blue-600" />
            <span className="text-xl font-bold text-gray-900 dark:text-white">
              {conversationTitle || 'Meeshy'}
            </span>
          </Link>

          {/* Actions Desktop */}
          <div className="hidden md:flex items-center space-x-4">
            {/* Mode Chat */}
            {mode === 'chat' && (
              <>
                {/* Bouton Share en premier */}
                {shareLink && (
                  <Button 
                    variant="outline"
                    onClick={handleShare}
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    {t('shareLink')}
                  </Button>
                )}
                
                {/* Menu Utilisateur avec Dropdown */}
                {user && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="flex items-center space-x-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                          {user.displayName?.[0] || user.firstName?.[0] || user.username[0].toUpperCase()}
                        </div>
                        <div className="flex flex-col items-start">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username}
                          </span>
                          {isAnonymous && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">Guest</span>
                          )}
                        </div>
                        <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-28">
                      <DropdownMenuLabel>
                        {user.displayName || user.username}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      
                      {/* Options de connexion pour utilisateurs anonymes */}
                      {isAnonymous && (
                        <>
                          <DropdownMenuItem onClick={() => router.push('/login')}>
                            <LogIn className="h-4 w-4 mr-2" />
                            {t('login')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push('/signup')}>
                            <UserPlus className="h-4 w-4 mr-2" />
                            {t('signUp')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={handleLogout} className="text-red-600 dark:text-red-400">
                            <LogOut className="h-4 w-4 mr-2" />
                            {t('logout')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      
                      {/* Options de thème */}
                      <DropdownMenuLabel className="text-xs text-gray-500 dark:text-gray-400">
                        {t('theme')}
                      </DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => setTheme('light')}>
                        <Sun className="h-4 w-4 mr-2" />
                        {t('light')}
                        {theme === 'light' && <span className="ml-auto">✓</span>}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setTheme('dark')}>
                        <Moon className="h-4 w-4 mr-2" />
                        {t('dark')}
                        {theme === 'dark' && <span className="ml-auto">✓</span>}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setTheme('auto')}>
                        <Monitor className="h-4 w-4 mr-2" />
                        {t('system')}
                        {theme === 'auto' && <span className="ml-auto">✓</span>}
                      </DropdownMenuItem>
                      
                      {/* Sélecteur de langue d'interface pour les utilisateurs anonymes */}
                      {isAnonymous && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-xs text-gray-500 dark:text-gray-400">
                            {t('interfaceLanguage')}
                          </DropdownMenuLabel>
                          <div className="px-2 py-1.5">
                            <LanguageFlagSelector
                              value={currentInterfaceLanguage}
                              onValueChange={handleLanguageChange}
                              interfaceOnly={true}
                              className="w-full"
                              showLanguageName={true}
                            />
                          </div>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </>
            )}
            
            {mode === 'landing' && (
              <>
                {anonymousChatLink && (
                  <Button
                    variant="outline"
                    onClick={() => router.push(anonymousChatLink)}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    {t('continueChat')}
                  </Button>
                )}

                {/* Sélecteur de langue pour la page d'accueil */}
                <LanguageSelector
                  value={currentInterfaceLanguage}
                  onValueChange={handleLanguageChange}
                  interfaceOnly={true}
                  className="min-w-[150px]"
                />

                {/* Bouton de partage */}
                <Button
                  variant="ghost"
                  onClick={() => {
                    const shareUrl = window.location.origin;
                    const shareText = t('shareText') || 'Rejoignez-moi sur Meeshy - Une plateforme de messagerie multilingue où vous pouvez discuter avec des personnes du monde entier !';
                    if (navigator.share) {
                      navigator.share({
                        title: 'Meeshy',
                        text: shareText,
                        url: shareUrl
                      }).catch(console.error);
                    } else {
                      navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
                    }
                  }}
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  {t('share')}
                </Button>

                <Link href="/login">
                  <Button variant="outline">
                    <LogIn className="h-4 w-4 mr-2" />
                    {t('login')}
                  </Button>
                </Link>
                <Link href="/signup">
                  <Button>
                    <UserPlus className="h-4 w-4 mr-2" />
                    {t('signUp')}
                  </Button>
                </Link>
              </>
            )}
            
            {/* Mode Default - affiche les boutons login/signup */}
            {mode === 'default' && !user && (
              <>
                {/* Sélecteur de langue pour les utilisateurs non connectés */}
                <LanguageSelector
                  value={currentInterfaceLanguage}
                  onValueChange={handleLanguageChange}
                  interfaceOnly={true}
                  className="min-w-[150px]"
                />

                {/* Bouton de partage simple (sans affiliation) */}
                <Button
                  variant="ghost"
                  onClick={() => {
                    const shareUrl = window.location.origin;
                    const shareText = t('shareText') || 'Rejoignez-moi sur Meeshy - Une plateforme de messagerie multilingue où vous pouvez discuter avec des personnes du monde entier !';
                    if (navigator.share) {
                      navigator.share({
                        title: 'Meeshy',
                        text: shareText,
                        url: shareUrl
                      }).catch(console.error);
                    } else {
                      navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
                    }
                  }}
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  {t('share')}
                </Button>

                <Link href="/login">
                  <Button variant="outline">
                    <LogIn className="h-4 w-4 mr-2" />
                    {t('login')}
                  </Button>
                </Link>
                <Link href="/signup">
                  <Button>
                    <UserPlus className="h-4 w-4 mr-2" />
                    {t('signUp')}
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </Button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden py-4 border-t">
            <nav className="flex flex-col space-y-4">
              {/* Mode Chat */}
              {mode === 'chat' && (
                <>
                  {/* Informations utilisateur en mobile */}
                  {user && (
                    <>
                      <div className="flex items-center space-x-3 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                          {user.displayName?.[0] || user.firstName?.[0] || user.username[0].toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username}
                          </span>
                          {isAnonymous && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">{t('guest')}</span>
                          )}
                        </div>
                      </div>
                      
                      {/* Options pour utilisateurs anonymes */}
                      {isAnonymous && (
                        <>
                          <Button 
                            variant="ghost" 
                            className="w-full justify-start"
                            onClick={() => {
                              router.push('/login');
                              setIsMobileMenuOpen(false);
                            }}
                          >
                            <LogIn className="h-4 w-4 mr-2" />
                            {t('login')}
                          </Button>
                          <Button 
                            className="w-full justify-start"
                            onClick={() => {
                              router.push('/signup');
                              setIsMobileMenuOpen(false);
                            }}
                          >
                            <UserPlus className="h-4 w-4 mr-2" />
                            {t('signUp')}
                          </Button>
                          <Button 
                            variant="ghost"
                            className="w-full justify-start text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950"
                            onClick={() => {
                              handleLogout();
                              setIsMobileMenuOpen(false);
                            }}
                          >
                            <LogOut className="h-4 w-4 mr-2" />
                            {t('logout')}
                          </Button>
                        </>
                      )}
                      
                      {/* Options de thème */}
                      <div className="space-y-2">
                        <div className="px-2 py-1.5">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('theme')}</span>
                        </div>
                        <Button 
                          variant="ghost" 
                          className="w-full justify-start"
                          onClick={() => {
                            setTheme('light');
                            setIsMobileMenuOpen(false);
                          }}
                        >
                          <Sun className="h-4 w-4 mr-2" />
                          {t('light')}
                          {theme === 'light' && <span className="ml-auto">✓</span>}
                        </Button>
                        <Button 
                          variant="ghost" 
                          className="w-full justify-start"
                          onClick={() => {
                            setTheme('dark');
                            setIsMobileMenuOpen(false);
                          }}
                        >
                          <Moon className="h-4 w-4 mr-2" />
                          {t('dark')}
                          {theme === 'dark' && <span className="ml-auto">✓</span>}
                        </Button>
                        <Button 
                          variant="ghost" 
                          className="w-full justify-start"
                          onClick={() => {
                            setTheme('auto');
                            setIsMobileMenuOpen(false);
                          }}
                        >
                          <Monitor className="h-4 w-4 mr-2" />
                          {t('system')}
                          {theme === 'auto' && <span className="ml-auto">✓</span>}
                        </Button>
                      </div>
                      
                      {/* Sélecteur de langue pour utilisateurs anonymes en mobile */}
                      {isAnonymous && (
                        <div className="space-y-2">
                          <div className="px-2 py-1.5">
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('interfaceLanguage')}</span>
                          </div>
                          <div className="px-2">
                            <LanguageFlagSelector
                              value={currentInterfaceLanguage}
                              onValueChange={handleLanguageChange}
                              interfaceOnly={true}
                              className="w-full"
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  
                  {shareLink && (
                    <Button 
                      variant="outline"
                      className="w-full justify-start"
                      onClick={handleShare}
                    >
                      <Share2 className="h-4 w-4 mr-2" />
                      {t('shareLink')}
                    </Button>
                  )}
                </>
              )}
              
              {mode === 'landing' && (
                <>
                  {/* Sélecteur de langue en mobile pour landing */}
                  <div className="space-y-2">
                    <div className="px-2 py-1.5">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('interfaceLanguage')}</span>
                    </div>
                    <div className="px-2">
                      <LanguageSelector
                        value={currentInterfaceLanguage}
                        onValueChange={handleLanguageChange}
                        interfaceOnly={true}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Bouton de partage en mobile */}
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => {
                      const shareUrl = window.location.origin;
                      const shareText = t('shareText') || 'Rejoignez-moi sur Meeshy - Une plateforme de messagerie multilingue où vous pouvez discuter avec des personnes du monde entier !';
                      if (navigator.share) {
                        navigator.share({
                          title: 'Meeshy',
                          text: shareText,
                          url: shareUrl
                        }).catch(console.error);
                      } else {
                        navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
                      }
                      setIsMobileMenuOpen(false);
                    }}
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    {t('share')}
                  </Button>

                  {anonymousChatLink && (
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => {
                        router.push(anonymousChatLink);
                        setIsMobileMenuOpen(false);
                      }}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      {t('continueChat')}
                    </Button>
                  )}
                  <Link href="/login" onClick={() => setIsMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full justify-start">
                      <LogIn className="h-4 w-4 mr-2" />
                      {t('login')}
                    </Button>
                  </Link>
                  <Link href="/signup" onClick={() => setIsMobileMenuOpen(false)}>
                    <Button className="w-full justify-start">
                      <UserPlus className="h-4 w-4 mr-2" />
                      {t('signUp')}
                    </Button>
                  </Link>
                </>
              )}

              {/* Mode Default - affiche les boutons login/signup en mobile */}
              {mode === 'default' && !user && (
                <>
                  {/* Sélecteur de langue en mobile pour default */}
                  <div className="space-y-2">
                    <div className="px-2 py-1.5">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('interfaceLanguage')}</span>
                    </div>
                    <div className="px-2">
                      <LanguageSelector
                        value={currentInterfaceLanguage}
                        onValueChange={handleLanguageChange}
                        interfaceOnly={true}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Bouton de partage en mobile */}
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => {
                      const shareUrl = window.location.origin;
                      const shareText = t('shareText') || 'Rejoignez-moi sur Meeshy - Une plateforme de messagerie multilingue où vous pouvez discuter avec des personnes du monde entier !';
                      if (navigator.share) {
                        navigator.share({
                          title: 'Meeshy',
                          text: shareText,
                          url: shareUrl
                        }).catch(console.error);
                      } else {
                        navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
                      }
                      setIsMobileMenuOpen(false);
                    }}
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    {t('share')}
                  </Button>

                  <Link href="/login" onClick={() => setIsMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full justify-start">
                      <LogIn className="h-4 w-4 mr-2" />
                      {t('login')}
                    </Button>
                  </Link>
                  <Link href="/signup" onClick={() => setIsMobileMenuOpen(false)}>
                    <Button className="w-full justify-start">
                      <UserPlus className="h-4 w-4 mr-2" />
                      {t('signUp')}
                    </Button>
                  </Link>
                </>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}

