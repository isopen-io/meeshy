'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { AnonymousRedirect } from '@/components/auth/AnonymousRedirect';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { 
  MessageSquare, 
  Globe, 
  Users, 
  Zap, 
  Shield, 
  LogIn, 
  UserPlus,
  Link2,
  ArrowRight,
  Languages,
  Sparkles,
  Building2,
  GraduationCap,
  Youtube,
  Twitter,
  Linkedin,
  Instagram
} from 'lucide-react';
import { LoginForm } from '@/components/auth/login-form';
import { RegisterForm } from '@/components/auth/register-form';
import { JoinConversationForm } from '@/components/auth/join-conversation-form';
import { LanguageSelector } from '@/components/translation/language-selector';
import { BubbleStreamPage } from '@/components/common';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Header } from '@/components/layout/Header';
import { useUser, useIsAuthChecking } from '@/stores';
import { useAuth } from '@/hooks/use-auth';
import { User, AuthMode } from '@/types';
import { toast } from 'sonner';
import { isCurrentUserAnonymous } from '@/utils/auth';
import { useI18n } from '@/hooks/useI18n';
import Link from 'next/link';
import { authManager } from '@/services/auth-manager.service';
function LandingPageContent() {
  const user = useUser();
  const isAuthChecking = useIsAuthChecking();
  const { login } = useAuth();
  const [authMode, setAuthMode] = useState<AuthMode>('welcome');
  const router = useRouter();
  const { t, locale, setLocale } = useI18n('landing');
  const { t: tAuth } = useI18n('auth');
  const { t: tCommon } = useI18n('common');

  // État pour gérer l'affichage du lien de conversation anonyme
  const [anonymousChatLink, setAnonymousChatLink] = useState<string | null>(null);

  // Sauvegarder le token d'affiliation depuis le cookie dans le localStorage
  useEffect(() => {
    // Récupérer le cookie d'affiliation
    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(';').shift();
      return null;
    };

    const affiliateToken = getCookie('meeshy_affiliate_token');
    if (affiliateToken) {
      // Sauvegarder dans localStorage pour persistance
      localStorage.setItem('meeshy_affiliate_token', affiliateToken);
      
      if (process.env.NODE_ENV === 'development') {
      }
    }
  }, []);

  // Vérifier si l'utilisateur anonyme a une conversation en cours
  useEffect(() => {
    const isAnonymous = isCurrentUserAnonymous();
    if (user && isAnonymous) {
      // C'est une session anonyme
      const storedLinkId = localStorage.getItem('anonymous_current_link_id');
      const storedShareLinkId = localStorage.getItem('anonymous_current_share_link');
      
      if (storedShareLinkId) {
        setAnonymousChatLink(`/chat/${storedShareLinkId}`);
      }
    } else {
      setAnonymousChatLink(null);
    }
  }, [user]);
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // Si l'utilisateur est authentifié ET n'est pas anonyme, afficher le dashboard
  const isAnonymous = isCurrentUserAnonymous();
  const hasAuthToken = !!authManager.getAuthToken();
  
  if (process.env.NODE_ENV === 'development') {
  }
  
  // Si l'utilisateur a un token d'authentification ET un utilisateur, afficher BubbleStreamPage
  if (user && hasAuthToken) {
    if (process.env.NODE_ENV === 'development') {
    }
    
    // Nettoyer les données anonymes si elles existent (l'utilisateur est authentifié)
    if (isAnonymous) {
      if (process.env.NODE_ENV === 'development') {
      }
      localStorage.removeItem('anonymous_session_token');
      localStorage.removeItem('anonymous_participant');
      localStorage.removeItem('anonymous_current_share_link');
      localStorage.removeItem('anonymous_current_link_id');
      localStorage.removeItem('anonymous_just_joined');
    }
    
    if (process.env.NODE_ENV === 'development') {
    }
    return (
      <div className="h-screen overflow-hidden flex flex-col">
        <DashboardLayout
          title={tCommon('navigation.home') || t('navigation.home')}
          className="!bg-none !bg-transparent !max-w-none !px-0 !h-full !overflow-hidden flex-1 min-h-0"
        >
          <BubbleStreamPage
            user={user}
            // conversationId accepte soit un ID MongoDB soit un identifier comme "meeshy" pour la conversation globale
            conversationId="meeshy"
            isAnonymousMode={false}
          />
        </DashboardLayout>
      </div>
    );
  }
  
  if (process.env.NODE_ENV === 'development') {
  }

  // Pour les utilisateurs anonymes et non connectés, afficher la landing page

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header */}
      <Header 
        mode="landing"
        authMode={authMode}
        onAuthModeChange={setAuthMode}
        anonymousChatLink={anonymousChatLink}
      />

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 lg:py-24">
        <div className="text-center max-w-5xl mx-auto">
          {/* Badge principal */}
          <Badge variant="secondary" className="mb-6 px-4 py-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 mr-2" />
            {t('hero.badge')}
          </Badge>
          
          {/* Titre principal impactant */}
          <h1 className="text-5xl lg:text-7xl font-bold text-gray-900 dark:text-white mb-8 leading-tight">
            {t('hero.title')}{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600">
              {t('hero.titleHighlight')}
            </span>
          </h1>
          
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
            {t('hero.subtitle')}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">

            {/* Bouton Connexion */}
            <Link href="/login">
              <Button size="lg" variant="outline" className="flex items-center space-x-2">
                <LogIn className="h-5 w-5" />
                <span>{t('hero.login')}</span>
              </Button>
            </Link>

            {/* Bouton Inscription */}
            <Link href="/signup">
              <Button size="lg" className="flex items-center space-x-2">
                <UserPlus className="h-5 w-5" />
                <span>{t('hero.startFree')}</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>

            {/* Language Selector */}
            <LanguageSelector
              value={locale}
              onValueChange={(newLocale) => {
                // Change interface language without navigation
                setLocale(newLocale);
              }}
              interfaceOnly={true}
              className="min-w-[150px]"
            />
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 py-20 lg:py-32">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-4xl mx-auto">
            <div className="mb-8">
              <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-6">
                {t('mission.title')}
              </h2>
              <div className="w-24 h-1 bg-gradient-to-r from-blue-600 to-indigo-600 mx-auto mb-8"></div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl dark:shadow-gray-900/30 p-8 lg:p-12 mb-8">
              <h3 className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-6">
                {t('mission.slogan')}
              </h3>
              <p className="text-xl lg:text-2xl text-gray-700 dark:text-gray-300 mb-8 leading-relaxed font-medium">
                {t('mission.tagline')}
              </p>
              <p className="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
                {t('mission.description')}
              </p>
            </div>
            
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 lg:p-8 text-white">
              <p className="text-lg lg:text-xl italic font-medium">
                {t('mission.signature.line1')}
                <br />
                {t('mission.signature.line2')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-white dark:bg-gray-900 py-16 lg:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {t('features.title')}
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              {t('features.subtitle')}
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="border-0 shadow-lg dark:bg-gray-800 dark:shadow-gray-900/30">
              <CardHeader>
                <Globe className="h-12 w-12 text-blue-600 dark:text-blue-400 mb-4" />
                <CardTitle>{t('features.universalTranslation.title')}</CardTitle>
                <CardDescription>
                  {t('features.universalTranslation.description')}
                </CardDescription>
              </CardHeader>
            </Card>
            
            <Card className="border-0 shadow-lg dark:bg-gray-800 dark:shadow-gray-900/30">
              <CardHeader>
                <Languages className="h-12 w-12 text-violet-600 dark:text-violet-400 mb-4" />
                <CardTitle>{t('features.autoDetection.title')}</CardTitle>
                <CardDescription>
                  {t('features.autoDetection.description')}
                </CardDescription>
              </CardHeader>
            </Card>
            
            <Card className="border-0 shadow-lg dark:bg-gray-800 dark:shadow-gray-900/30">
              <CardHeader>
                <Shield className="h-12 w-12 text-green-600 dark:text-green-400 mb-4" />
                <CardTitle>{t('features.privacy.title')}</CardTitle>
                <CardDescription>
                  {t('features.privacy.description')}
                </CardDescription>
              </CardHeader>
            </Card>
            
            <Card className="border-0 shadow-lg dark:bg-gray-800 dark:shadow-gray-900/30">
              <CardHeader>
                <Zap className="h-12 w-12 text-yellow-600 dark:text-yellow-400 mb-4" />
                <CardTitle>{t('features.realtime.title')}</CardTitle>
                <CardDescription>
                  {t('features.realtime.description')}
                </CardDescription>
              </CardHeader>
            </Card>
            
            <Card className="border-0 shadow-lg dark:bg-gray-800 dark:shadow-gray-900/30">
              <CardHeader>
                <Users className="h-12 w-12 text-purple-600 dark:text-purple-400 mb-4" />
                <CardTitle>{t('features.groupChats.title')}</CardTitle>
                <CardDescription>
                  {t('features.groupChats.description')}
                </CardDescription>
              </CardHeader>
            </Card>
            
            <Card className="border-0 shadow-lg dark:bg-gray-800 dark:shadow-gray-900/30">
              <CardHeader>
                <Languages className="h-12 w-12 text-indigo-600 dark:text-indigo-400 mb-4" />
                <CardTitle>{t('features.multiLanguage.title')}</CardTitle>
                <CardDescription>
                  {t('features.multiLanguage.description')}
                </CardDescription>
              </CardHeader>
            </Card>
            
            <Card className="border-0 shadow-lg dark:bg-gray-800 dark:shadow-gray-900/30">
              <CardHeader>
                <MessageSquare className="h-12 w-12 text-red-600 dark:text-red-400 mb-4" />
                <CardTitle>{t('features.modernInterface.title')}</CardTitle>
                <CardDescription>
                  {t('features.modernInterface.description')}
                </CardDescription>
              </CardHeader>
            </Card>
            
            <Card className="border-0 shadow-lg dark:bg-gray-800 dark:shadow-gray-900/30">
              <CardHeader>
                <Building2 className="h-12 w-12 text-orange-600 dark:text-orange-400 mb-4" />
                <CardTitle>{t('features.internationalColleagues.title')}</CardTitle>
                <CardDescription>
                  {t('features.internationalColleagues.description')}
                </CardDescription>
              </CardHeader>
            </Card>
            
            <Card className="border-0 shadow-lg dark:bg-gray-800 dark:shadow-gray-900/30">
              <CardHeader>
                <GraduationCap className="h-12 w-12 text-teal-600 dark:text-teal-400 mb-4" />
                <CardTitle>{t('features.multilingualClassrooms.title')}</CardTitle>
                <CardDescription>
                  {t('features.multilingualClassrooms.description')}
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-blue-600 to-indigo-600 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6">
            {t('cta.title')}
          </h2>
          <p className="text-xl text-blue-100 dark:text-blue-200 mb-8 max-w-2xl mx-auto">
            {t('cta.subtitle')}
          </p>
          
          {/* Bouton qui redirige vers la page d'inscription */}
          <Link href="/signup">
            <Button 
              size="lg" 
              variant="secondary" 
              className="flex items-center space-x-2"
            >
              <UserPlus className="h-5 w-5" />
              <span>{t('cta.createAccount')}</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Logo, Tagline et Copyright */}
            <div className="text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start space-x-2 mb-4">
                <div className="h-8 w-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold">Meeshy</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 space-y-1 sm:space-y-0">
                <p className="text-gray-300 text-lg">
                  {t('footer.tagline')}
                </p>
                <span className="text-gray-400 hidden sm:inline">•</span>
                <p className="text-gray-400">
                  {t('footer.copyright')}
                </p>
              </div>
            </div>

            {/* Liens et Réseaux Sociaux */}
            <div className="text-center md:text-right">
              {/* Liens Utiles */}
              <div className="mb-6">
                <div className="flex flex-wrap justify-center md:justify-end gap-x-6 gap-y-2">
                  <Link href="/about" className="text-gray-300 hover:text-white transition-colors">
                    {t('footer.links.about')}
                  </Link>
                  <Link href="/terms" className="text-gray-300 hover:text-white transition-colors">
                    {t('footer.links.terms')}
                  </Link>
                  <Link href="/contact" className="text-gray-300 hover:text-white transition-colors">
                    {t('footer.links.contact')}
                  </Link>
                  <Link href="/privacy" className="text-gray-300 hover:text-white transition-colors">
                    {t('footer.links.policy')}
                  </Link>
                  <Link href="/partners" className="text-gray-300 hover:text-white transition-colors">
                    {t('footer.links.partners')}
                  </Link>
                </div>
              </div>

              {/* Réseaux Sociaux */}
              <div>
                <div className="flex justify-center md:justify-end space-x-4">
                  <a 
                    href="https://youtube.com/@meeshy" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    aria-label="YouTube"
                  >
                    <Youtube className="h-6 w-6" />
                  </a>
                  <a 
                    href="https://x.com/meeshy" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-white transition-colors"
                    aria-label="X (Twitter)"
                  >
                    <Twitter className="h-6 w-6" />
                  </a>
                  <a 
                    href="https://linkedin.com/company/meeshy" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-blue-400 transition-colors"
                    aria-label="LinkedIn"
                  >
                    <Linkedin className="h-6 w-6" />
                  </a>
                  <a 
                    href="https://instagram.com/meeshy" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-pink-500 transition-colors"
                    aria-label="Instagram"
                  >
                    <Instagram className="h-6 w-6" />
                  </a>
                  <a 
                    href="https://tiktok.com/@meeshy" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-white transition-colors"
                    aria-label="TikTok"
                  >
                    <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Dialog Login - Contrôlé par authMode depuis Header */}
      <Dialog open={authMode === 'login'} onOpenChange={(open) => setAuthMode(open ? 'login' : 'welcome')}>
        <DialogContent className="max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          {/* Header fixe */}
          <div className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogHeader>
              <DialogTitle>{tAuth('login.title') || 'Connexion'}</DialogTitle>
              <DialogDescription>
                {tAuth('login.description') || 'Connectez-vous à votre compte Meeshy'}
              </DialogDescription>
            </DialogHeader>
          </div>
          {/* Contenu scrollable */}
          <div className="flex-1 overflow-y-auto px-6 min-h-0 py-4">
            <LoginForm />
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}

export default function LandingPage() {
  return (
    <AnonymousRedirect redirectToChat={true}>
      <LandingPageContent />
    </AnonymousRedirect>
  );
}