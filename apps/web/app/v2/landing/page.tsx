'use client';

import Link from 'next/link';
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
  Badge,
  LanguageOrb,
  MessageBubble,
  theme,
} from '@/components/v2';

export default function V2LandingPage() {
  return (
    <div className="min-h-screen" style={{ background: theme.colors.warmCanvas }}>
      {/* Background Pattern */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(circle at 20% 80%, ${theme.colors.terracotta}15 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, ${theme.colors.deepTeal}15 0%, transparent 50%),
            radial-gradient(circle at 40% 40%, ${theme.colors.goldAccent}10 0%, transparent 30%)
          `,
        }}
      />

      {/* Header */}
      <header
        className="fixed top-0 left-0 right-0 z-50 px-6 py-4"
        style={{
          background: `${theme.colors.warmCanvas}ee`,
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${theme.colors.parchment}`,
        }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/v2/landing" className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg"
              style={{ background: `linear-gradient(135deg, ${theme.colors.terracotta}, ${theme.colors.deepTeal})` }}
            >
              M
            </div>
            <span
              className="text-xl font-semibold"
              style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
            >
              Meeshy
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <Link href="/v2/feeds" className="text-sm font-medium" style={{ color: theme.colors.textSecondary }}>
              Découvrir
            </Link>
            <Link href="/v2/communities" className="text-sm font-medium" style={{ color: theme.colors.textSecondary }}>
              Communautés
            </Link>
            <Link href="/v2/login">
              <Button variant="ghost" size="sm">Connexion</Button>
            </Link>
            <Link href="/v2/signup">
              <Button variant="primary" size="sm">Commencer</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 pt-32 pb-20 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <Badge variant="terracotta" size="lg" className="mb-6">
            ✨ Traduction en temps réel
          </Badge>

          <h1
            className="text-5xl md:text-7xl font-bold mb-6 leading-tight"
            style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
          >
            Parlez au monde
            <br />
            <span
              style={{
                background: `linear-gradient(135deg, ${theme.colors.terracotta}, ${theme.colors.deepTeal})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              dans votre langue
            </span>
          </h1>

          <p
            className="text-xl md:text-2xl mb-10 max-w-2xl mx-auto"
            style={{ color: theme.colors.textSecondary, fontFamily: theme.fonts.body }}
          >
            Meeshy traduit vos conversations instantanément.
            Chacun parle sa langue, tout le monde se comprend.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link href="/v2/signup">
              <Button variant="primary" size="lg">
                Commencer gratuitement
              </Button>
            </Link>
            <Link href="/v2/feeds">
              <Button variant="outline" size="lg">
                Voir la démo
              </Button>
            </Link>
          </div>

          {/* Language Orbs */}
          <div className="flex flex-wrap justify-center gap-4 md:gap-6">
            <LanguageOrb code="fr" name="Français" size="lg" animationDelay={0} />
            <LanguageOrb code="en" name="English" size="lg" animationDelay={0.4} />
            <LanguageOrb code="zh" name="中文" size="lg" animationDelay={0.8} />
            <LanguageOrb code="ar" name="العربية" size="lg" animationDelay={1.2} />
            <LanguageOrb code="ja" name="日本語" size="lg" animationDelay={1.6} />
            <LanguageOrb code="es" name="Español" size="lg" animationDelay={2} />
          </div>
        </div>
      </section>

      {/* Chat Preview */}
      <section className="relative z-10 py-20 px-6" style={{ background: theme.colors.parchment }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2
              className="text-3xl md:text-4xl font-bold mb-4"
              style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
            >
              Une conversation, toutes les langues
            </h2>
            <p style={{ color: theme.colors.textSecondary }}>
              Chaque message est traduit automatiquement pour chaque participant
            </p>
          </div>

          <div
            className="rounded-3xl overflow-hidden shadow-xl"
            style={{ background: 'white' }}
          >
            {/* Chat Header */}
            <div
              className="p-4 flex items-center gap-4"
              style={{ background: `linear-gradient(135deg, ${theme.colors.deepTeal}, ${theme.colors.jadeGreen})` }}
            >
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-2xl">
                👩‍💼
              </div>
              <div className="text-white">
                <h4 className="font-semibold">Marie & Yuki</h4>
                <span className="text-sm opacity-80">Conversation multilingue</span>
              </div>
            </div>

            {/* Messages */}
            <div className="p-6 flex flex-col gap-4" style={{ background: '#FAFAFA' }}>
              <MessageBubble
                languageCode="ja"
                languageName="Japonais"
                content="こんにちは！今日の会議の準備はできていますか？"
                translations={[{ languageCode: 'fr', languageName: 'français', content: "Bonjour ! Es-tu prête pour la réunion d'aujourd'hui ?" }]}
                sender="Yuki"
                timestamp="10:32"
              />
              <MessageBubble
                isSent
                languageCode="fr"
                languageName="Français"
                content="Oui, tout est prêt ! J'ai terminé la présentation hier soir."
                translations={[{ languageCode: 'ja', languageName: 'japonais', content: "はい、準備万端です！昨夜プレゼンを完成させました。" }]}
                timestamp="10:33"
              />
              <MessageBubble
                languageCode="ja"
                languageName="Japonais"
                content="素晴らしい！楽しみにしています 🎉"
                translations={[{ languageCode: 'fr', languageName: 'français', content: "Super ! J'ai hâte d'y être 🎉" }]}
                sender="Yuki"
                timestamp="10:34"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2
              className="text-3xl md:text-4xl font-bold mb-4"
              style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
            >
              Pourquoi Meeshy ?
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card variant="default">
              <CardHeader>
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-4"
                  style={{ background: `linear-gradient(135deg, ${theme.colors.terracotta}, ${theme.colors.terracottaLight})` }}
                >
                  🌍
                </div>
                <CardTitle>100+ Langues</CardTitle>
                <CardDescription>
                  Communiquez avec n'importe qui dans le monde. Notre IA traduit instantanément vos messages.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card variant="default">
              <CardHeader>
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-4"
                  style={{ background: `linear-gradient(135deg, ${theme.colors.deepTeal}, ${theme.colors.jadeGreen})` }}
                >
                  ⚡
                </div>
                <CardTitle>Temps Réel</CardTitle>
                <CardDescription>
                  Pas d'attente. La traduction apparaît pendant que vous tapez pour des conversations fluides.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card variant="default">
              <CardHeader>
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-4"
                  style={{ background: `linear-gradient(135deg, ${theme.colors.royalIndigo}, ${theme.colors.sakuraPink})` }}
                >
                  🔒
                </div>
                <CardTitle>Privé & Sécurisé</CardTitle>
                <CardDescription>
                  Vos conversations restent privées. Chiffrement de bout en bout pour votre tranquillité.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section
        className="relative z-10 py-20 px-6"
        style={{ background: `linear-gradient(135deg, ${theme.colors.deepTeal}, ${theme.colors.charcoal})` }}
      >
        <div className="max-w-3xl mx-auto text-center text-white">
          <h2
            className="text-3xl md:text-4xl font-bold mb-4"
            style={{ fontFamily: theme.fonts.display }}
          >
            Prêt à briser les barrières ?
          </h2>
          <p className="text-xl opacity-80 mb-8">
            Rejoignez des milliers d'utilisateurs qui communiquent sans frontières linguistiques.
          </p>
          <Link href="/v2/signup">
            <Button variant="primary" size="lg">
              Créer un compte gratuit
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-12 px-6" style={{ background: theme.colors.deepInk }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold"
                style={{ background: `linear-gradient(135deg, ${theme.colors.terracotta}, ${theme.colors.deepTeal})` }}
              >
                M
              </div>
              <span className="text-white font-semibold">Meeshy</span>
            </div>

            <nav className="flex flex-wrap justify-center gap-6">
              <Link href="/v2/terms" className="text-white/60 hover:text-white text-sm">
                Conditions
              </Link>
              <a href="mailto:contact@meeshy.me" className="text-white/60 hover:text-white text-sm">
                Contact
              </a>
              <Link href="/v2/communities" className="text-white/60 hover:text-white text-sm">
                Communautés
              </Link>
            </nav>

            <p className="text-white/40 text-sm">
              © 2024 Meeshy. Global Pulse V2.
            </p>
          </div>
        </div>
      </footer>

      {/* Fonts loaded via next/font in lib/fonts.ts (DM Sans + Playfair Display) */}
    </div>
  );
}
