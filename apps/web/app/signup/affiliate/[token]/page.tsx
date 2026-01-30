'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Globe, Shield, ArrowRight, FileText, Info, Home } from 'lucide-react';
import { LargeLogo } from '@/components/branding';
import Link from 'next/link';

interface AffiliateSignupPageProps {
  params: Promise<{ token: string }>;
}

/**
 * Page d'information pour les liens d'affiliation
 * Sauvegarde le token en arrière-plan et affiche des informations sur Meeshy
 */
export default function AffiliateSignupPage({ params }: AffiliateSignupPageProps) {
  const router = useRouter();

  useEffect(() => {
    // Récupérer et sauvegarder le token d'affiliation
    params.then(({ token }) => {
      if (token) {
        // Sauvegarder dans localStorage
        localStorage.setItem('meeshy_affiliate_token', token);

        // Sauvegarder dans un cookie (30 jours)
        document.cookie = `meeshy_affiliate_token=${token}; max-age=${30 * 24 * 60 * 60}; path=/; samesite=lax`;
      }
    });
  }, [params]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <LargeLogo href="/" />
          <h1 className="mt-6 text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">
            Bienvenue sur Meeshy
          </h1>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
            La plateforme de messagerie multilingue en temps réel
          </p>
        </div>

        {/* Content Grid */}
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* À propos de Meeshy */}
          <Card className="shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <MessageSquare className="h-6 w-6 text-blue-600" />
                <span>Messagerie Multilingue</span>
              </CardTitle>
              <CardDescription>
                Discutez avec le monde entier dans votre langue
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Meeshy traduit automatiquement vos messages en temps réel, permettant une communication fluide avec des personnes du monde entier, chacune dans sa langue préférée.
              </p>
              <Link href="/about">
                <Button variant="outline" className="w-full">
                  <Info className="mr-2 h-4 w-4" />
                  En savoir plus
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Fonctionnalités */}
          <Card className="shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Globe className="h-6 w-6 text-green-600" />
                <span>100+ Langues Supportées</span>
              </CardTitle>
              <CardDescription>
                Communication sans frontières linguistiques
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Grâce à notre technologie de traduction avancée, communiquez en temps réel avec des utilisateurs parlant plus de 100 langues différentes.
              </p>
              <Link href="/">
                <Button variant="outline" className="w-full">
                  <Home className="mr-2 h-4 w-4" />
                  Page d'accueil
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Confidentialité */}
          <Card className="shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="h-6 w-6 text-purple-600" />
                <span>Confidentialité & Sécurité</span>
              </CardTitle>
              <CardDescription>
                Vos données sont protégées
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Nous prenons votre vie privée au sérieux. Vos conversations sont chiffrées et vos données personnelles sont protégées selon les normes les plus strictes.
              </p>
              <Link href="/privacy">
                <Button variant="outline" className="w-full">
                  <FileText className="mr-2 h-4 w-4" />
                  Politique de confidentialité
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Conditions d'utilisation */}
          <Card className="shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="h-6 w-6 text-orange-600" />
                <span>Conditions d'utilisation</span>
              </CardTitle>
              <CardDescription>
                Règles et engagement
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Découvrez nos conditions d'utilisation et notre engagement envers une plateforme respectueuse et inclusive pour tous les utilisateurs.
              </p>
              <Link href="/terms">
                <Button variant="outline" className="w-full">
                  <FileText className="mr-2 h-4 w-4" />
                  Conditions d'utilisation
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Call to Action */}
        <div className="max-w-2xl mx-auto text-center">
          <Card className="shadow-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white border-0">
            <CardContent className="pt-8 pb-8">
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                Prêt à rejoindre la communauté ?
              </h2>
              <p className="text-blue-100 mb-6 text-lg">
                Créez votre compte gratuitement et commencez à discuter avec le monde entier dans votre langue.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  className="bg-white text-blue-600 hover:bg-gray-100 font-semibold"
                  onClick={() => router.push('/signup')}
                >
                  Créer un compte
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-2 border-white text-white hover:bg-white/10"
                  onClick={() => router.push('/login')}
                >
                  Se connecter
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
