'use client';

import Link from 'next/link';
import { Button, Card, theme } from '@/components/v2';

export default function V2PrivacyPolicyPage() {
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
            Politique de confidentialite
          </h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <Card variant="default" hover={false} className="p-8">
          <h1
            className="text-3xl font-bold mb-6"
            style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
          >
            Politique de Confidentialite
          </h1>

          <p className="text-sm mb-8" style={{ color: theme.colors.textMuted }}>
            Derniere mise a jour : Janvier 2024
          </p>

          <div className="prose max-w-none" style={{ color: theme.colors.textPrimary }}>
            <section className="mb-8">
              <h2
                className="text-xl font-semibold mb-4"
                style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
              >
                1. Introduction
              </h2>
              <p className="mb-4 leading-relaxed" style={{ color: theme.colors.textSecondary }}>
                Chez Meeshy, nous prenons la protection de vos donnees personnelles tres au serieux.
                Cette politique de confidentialite explique comment nous collectons, utilisons,
                stockons et protegeons vos informations lorsque vous utilisez notre service.
              </p>
            </section>

            <section className="mb-8">
              <h2
                className="text-xl font-semibold mb-4"
                style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
              >
                2. Donnees collectees
              </h2>
              <p className="mb-4 leading-relaxed" style={{ color: theme.colors.textSecondary }}>
                Nous collectons les types de donnees suivants :
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: theme.colors.textSecondary }}>
                <li><strong>Informations de compte :</strong> nom, email, photo de profil, langues preferees</li>
                <li><strong>Messages :</strong> contenu des messages pour la traduction en temps reel</li>
                <li><strong>Donnees d'utilisation :</strong> statistiques d'utilisation anonymisees</li>
                <li><strong>Informations techniques :</strong> type d'appareil, adresse IP, navigateur</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2
                className="text-xl font-semibold mb-4"
                style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
              >
                3. Utilisation des donnees
              </h2>
              <p className="mb-4 leading-relaxed" style={{ color: theme.colors.textSecondary }}>
                Vos donnees sont utilisees pour :
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: theme.colors.textSecondary }}>
                <li>Fournir le service de messagerie et de traduction</li>
                <li>Ameliorer la qualite des traductions</li>
                <li>Personnaliser votre experience</li>
                <li>Assurer la securite de votre compte</li>
                <li>Vous envoyer des notifications importantes</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2
                className="text-xl font-semibold mb-4"
                style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
              >
                4. Protection des donnees
              </h2>
              <p className="mb-4 leading-relaxed" style={{ color: theme.colors.textSecondary }}>
                Nous mettons en oeuvre des mesures de securite robustes pour proteger vos donnees :
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: theme.colors.textSecondary }}>
                <li>Chiffrement de bout en bout pour les messages prives</li>
                <li>Chiffrement SSL/TLS pour toutes les communications</li>
                <li>Stockage securise des donnees avec chiffrement au repos</li>
                <li>Acces restreint aux donnees personnelles</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2
                className="text-xl font-semibold mb-4"
                style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
              >
                5. Partage des donnees
              </h2>
              <p className="mb-4 leading-relaxed" style={{ color: theme.colors.textSecondary }}>
                Nous ne vendons jamais vos donnees personnelles. Nous pouvons partager
                des informations avec :
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: theme.colors.textSecondary }}>
                <li>Nos prestataires de services de traduction (donnees anonymisees)</li>
                <li>Les autorites legales si requis par la loi</li>
                <li>Les autres utilisateurs selon vos parametres de confidentialite</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2
                className="text-xl font-semibold mb-4"
                style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
              >
                6. Vos droits
              </h2>
              <p className="mb-4 leading-relaxed" style={{ color: theme.colors.textSecondary }}>
                Conformement au RGPD, vous avez le droit de :
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: theme.colors.textSecondary }}>
                <li>Acceder a vos donnees personnelles</li>
                <li>Rectifier vos informations</li>
                <li>Supprimer votre compte et vos donnees</li>
                <li>Exporter vos donnees</li>
                <li>Vous opposer a certains traitements</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2
                className="text-xl font-semibold mb-4"
                style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
              >
                7. Cookies
              </h2>
              <p className="mb-4 leading-relaxed" style={{ color: theme.colors.textSecondary }}>
                Nous utilisons des cookies essentiels pour le fonctionnement du service
                et des cookies analytiques pour ameliorer votre experience. Vous pouvez
                gerer vos preferences de cookies dans les parametres de votre navigateur.
              </p>
            </section>

            <section className="mb-8">
              <h2
                className="text-xl font-semibold mb-4"
                style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
              >
                8. Contact
              </h2>
              <p className="mb-4 leading-relaxed" style={{ color: theme.colors.textSecondary }}>
                Pour toute question concernant cette politique ou vos donnees personnelles :
                <br />
                <a href="mailto:privacy@meeshy.me" style={{ color: theme.colors.terracotta }}>
                  privacy@meeshy.me
                </a>
              </p>
              <p className="leading-relaxed" style={{ color: theme.colors.textSecondary }}>
                Delegue a la Protection des Donnees (DPO) :
                <br />
                <a href="mailto:dpo@meeshy.me" style={{ color: theme.colors.terracotta }}>
                  dpo@meeshy.me
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
