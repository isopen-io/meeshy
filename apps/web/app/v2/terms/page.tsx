'use client';

import Link from 'next/link';
import { Button, Card, theme } from '@/components/v2';

export default function V2TermsPage() {
  return (
    <div className="min-h-screen" style={{ background: theme.colors.warmCanvas }}>
      {/* Header */}
      <header className="sticky top-0 z-50 px-6 py-4 border-b" style={{ background: `${theme.colors.warmCanvas}ee`, backdropFilter: 'blur(20px)', borderColor: theme.colors.parchment }}>
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <Link href="/v2/landing">
            <Button variant="ghost" size="sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
          </Link>
          <h1 className="text-xl font-semibold" style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}>
            Conditions d'utilisation
          </h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <Card variant="default" hover={false} className="p-8">
          <h1
            className="text-3xl font-bold mb-6"
            style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
          >
            Conditions Générales d'Utilisation
          </h1>

          <p className="text-sm mb-8" style={{ color: theme.colors.textMuted }}>
            Dernière mise à jour : Janvier 2024
          </p>

          <div className="prose max-w-none" style={{ color: theme.colors.textPrimary }}>
            <section className="mb-8">
              <h2
                className="text-xl font-semibold mb-4"
                style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
              >
                1. Acceptation des conditions
              </h2>
              <p className="mb-4 leading-relaxed" style={{ color: theme.colors.textSecondary }}>
                En utilisant Meeshy, vous acceptez d'être lié par ces conditions d'utilisation.
                Si vous n'acceptez pas ces conditions, veuillez ne pas utiliser notre service.
              </p>
            </section>

            <section className="mb-8">
              <h2
                className="text-xl font-semibold mb-4"
                style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
              >
                2. Description du service
              </h2>
              <p className="mb-4 leading-relaxed" style={{ color: theme.colors.textSecondary }}>
                Meeshy est une plateforme de messagerie multilingue qui permet aux utilisateurs
                de communiquer en temps réel avec traduction automatique. Le service comprend :
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: theme.colors.textSecondary }}>
                <li>Messagerie instantanée avec traduction en temps réel</li>
                <li>Support de plus de 100 langues</li>
                <li>Appels audio et vidéo</li>
                <li>Partage de fichiers et médias</li>
                <li>Communautés et groupes</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2
                className="text-xl font-semibold mb-4"
                style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
              >
                3. Inscription et compte
              </h2>
              <p className="mb-4 leading-relaxed" style={{ color: theme.colors.textSecondary }}>
                Pour utiliser Meeshy, vous devez créer un compte. Vous êtes responsable de
                maintenir la confidentialité de vos identifiants de connexion et de toutes
                les activités qui se produisent sous votre compte.
              </p>
            </section>

            <section className="mb-8">
              <h2
                className="text-xl font-semibold mb-4"
                style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
              >
                4. Conduite de l'utilisateur
              </h2>
              <p className="mb-4 leading-relaxed" style={{ color: theme.colors.textSecondary }}>
                Vous acceptez de ne pas utiliser Meeshy pour :
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: theme.colors.textSecondary }}>
                <li>Envoyer du contenu illégal, offensant ou nuisible</li>
                <li>Harceler ou intimider d'autres utilisateurs</li>
                <li>Usurper l'identité d'une autre personne</li>
                <li>Distribuer des logiciels malveillants</li>
                <li>Violer les droits de propriété intellectuelle</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2
                className="text-xl font-semibold mb-4"
                style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
              >
                5. Confidentialité
              </h2>
              <p className="mb-4 leading-relaxed" style={{ color: theme.colors.textSecondary }}>
                Votre vie privée est importante pour nous. Consultez notre Politique de
                confidentialité pour comprendre comment nous collectons, utilisons et
                protégeons vos informations personnelles.
              </p>
            </section>

            <section className="mb-8">
              <h2
                className="text-xl font-semibold mb-4"
                style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
              >
                6. Contact
              </h2>
              <p className="mb-4 leading-relaxed" style={{ color: theme.colors.textSecondary }}>
                Pour toute question concernant ces conditions, contactez-nous à :
                <br />
                <a href="mailto:legal@meeshy.me" style={{ color: theme.colors.terracotta }}>
                  legal@meeshy.me
                </a>
              </p>
            </section>
          </div>
        </Card>
      </main>

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </div>
  );
}
