'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Card, Badge, LanguageOrb, theme, Input, useToast } from '@/components/v2';

interface Community {
  id: number;
  name: string;
  description: string;
  members: number;
  langs: string[];
  joined: boolean;
}

const initialCommunities: Community[] = [
  { id: 1, name: 'Tech Polyglots', description: 'Développeurs du monde entier', members: 1243, langs: ['en', 'fr', 'de', 'ja'], joined: true },
  { id: 2, name: 'Language Learners', description: 'Apprenez ensemble !', members: 892, langs: ['en', 'es', 'zh'], joined: true },
  { id: 3, name: 'Global Travelers', description: 'Partagez vos aventures', members: 2156, langs: ['en', 'fr', 'es', 'pt'], joined: false },
  { id: 4, name: 'Manga & Anime', description: 'Pour les fans du monde entier', members: 3421, langs: ['ja', 'en', 'fr'], joined: false },
  { id: 5, name: 'Business Network', description: 'Networking international', members: 567, langs: ['en', 'zh', 'ar'], joined: false },
];

export default function V2CommunitiesPage() {
  const [communities, setCommunities] = useState<Community[]>(initialCommunities);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCommunityName, setNewCommunityName] = useState('');
  const [newCommunityDescription, setNewCommunityDescription] = useState('');
  const { addToast } = useToast();

  const handleCreateCommunity = () => {
    if (!newCommunityName.trim()) {
      addToast('Le nom de la communauté est requis', 'error');
      return;
    }

    const newCommunity: Community = {
      id: Date.now(),
      name: newCommunityName.trim(),
      description: newCommunityDescription.trim() || 'Nouvelle communauté',
      members: 1,
      langs: ['fr'],
      joined: true,
    };

    setCommunities([newCommunity, ...communities]);
    setNewCommunityName('');
    setNewCommunityDescription('');
    setIsModalOpen(false);
    addToast(`Communauté "${newCommunity.name}" créée avec succès`, 'success');
  };

  const handleJoinCommunity = (communityId: number) => {
    setCommunities(communities.map(c => {
      if (c.id === communityId) {
        const newJoinedStatus = !c.joined;
        addToast(
          newJoinedStatus
            ? `Vous avez rejoint "${c.name}"`
            : `Vous avez quitté "${c.name}"`,
          newJoinedStatus ? 'success' : 'info'
        );
        return {
          ...c,
          joined: newJoinedStatus,
          members: newJoinedStatus ? c.members + 1 : c.members - 1
        };
      }
      return c;
    }));
  };

  const handleCardClick = (community: Community) => {
    alert(`Détails de la communauté:\n\nNom: ${community.name}\nDescription: ${community.description}\nMembres: ${community.members}\nLangues: ${community.langs.join(', ')}\nStatut: ${community.joined ? 'Membre' : 'Non membre'}`);
  };

  return (
    <div className="min-h-screen pb-20 bg-[var(--gp-background)] transition-colors duration-300">
      {/* Header */}
      <header className="sticky top-0 z-50 px-6 py-4 border-b border-[var(--gp-border)] bg-[var(--gp-surface)]/95 backdrop-blur-xl transition-colors duration-300">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/v2/chats"
              className="p-2 -ml-2 rounded-lg hover:bg-[var(--gp-hover)] text-[var(--gp-text-primary)] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-xl font-semibold text-[var(--gp-text-primary)]" style={{ fontFamily: theme.fonts.display }}>
              Communautés
            </h1>
          </div>
          <Button variant="primary" size="sm" onClick={() => setIsModalOpen(true)}>
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Créer
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* My Communities */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold mb-4 px-1 text-[var(--gp-text-muted)]">MES COMMUNAUTÉS</h2>
          <div className="space-y-4">
            {communities.filter(c => c.joined).map((community) => (
              <Card
                key={community.id}
                variant="default"
                hover
                className="p-4 cursor-pointer"
                onClick={() => handleCardClick(community)}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl text-[var(--gp-text-primary)]"
                    style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--gp-terracotta) 30%, transparent), color-mix(in srgb, var(--gp-deep-teal) 30%, transparent))' }}
                  >
                    {community.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-[var(--gp-text-primary)]">{community.name}</h3>
                      <Badge variant="teal" size="sm">Membre</Badge>
                    </div>
                    <p className="text-sm mb-2 text-[var(--gp-text-secondary)]">{community.description}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-[var(--gp-text-muted)]">
                          {community.members.toLocaleString()} membres
                        </span>
                        <div className="flex -space-x-1">
                          {community.langs.slice(0, 4).map((lang) => (
                            <LanguageOrb key={lang} code={lang} size="sm" pulse={false} className="w-5 h-5 text-xs border border-[var(--gp-surface)]" />
                          ))}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleJoinCommunity(community.id);
                        }}
                      >
                        Quitter
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            {communities.filter(c => c.joined).length === 0 && (
              <p className="text-center py-8 text-[var(--gp-text-muted)]">
                Vous n&apos;avez pas encore rejoint de communauté
              </p>
            )}
          </div>
        </section>

        {/* Discover */}
        <section>
          <h2 className="text-sm font-semibold mb-4 px-1 text-[var(--gp-text-muted)]">DÉCOUVRIR</h2>
          <div className="space-y-4">
            {communities.filter(c => !c.joined).map((community) => (
              <Card
                key={community.id}
                variant="outlined"
                hover
                className="p-4 cursor-pointer"
                onClick={() => handleCardClick(community)}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl text-[var(--gp-text-primary)] bg-[var(--gp-parchment)]"
                  >
                    {community.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold mb-1 text-[var(--gp-text-primary)]">{community.name}</h3>
                    <p className="text-sm mb-2 text-[var(--gp-text-secondary)]">{community.description}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-[var(--gp-text-muted)]">
                          {community.members.toLocaleString()} membres
                        </span>
                        <div className="flex -space-x-1">
                          {community.langs.slice(0, 4).map((lang) => (
                            <LanguageOrb key={lang} code={lang} size="sm" pulse={false} className="w-5 h-5 text-xs border border-[var(--gp-surface)]" />
                          ))}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleJoinCommunity(community.id);
                        }}
                      >
                        Rejoindre
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            {communities.filter(c => !c.joined).length === 0 && (
              <p className="text-center py-8 text-[var(--gp-text-muted)]">
                Toutes les communautés ont été rejointes
              </p>
            )}
          </div>
        </section>
      </main>

      {/* Modal de création */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/50"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 shadow-xl bg-[var(--gp-surface)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              className="text-xl font-semibold mb-6 text-[var(--gp-text-primary)]"
              style={{ fontFamily: theme.fonts.display }}
            >
              Créer une communauté
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-[var(--gp-text-secondary)]">
                  Nom de la communauté
                </label>
                <Input
                  placeholder="Ex: French Learners"
                  value={newCommunityName}
                  onChange={(e) => setNewCommunityName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-[var(--gp-text-secondary)]">
                  Description
                </label>
                <Input
                  placeholder="Décrivez votre communauté..."
                  value={newCommunityDescription}
                  onChange={(e) => setNewCommunityDescription(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  setIsModalOpen(false);
                  setNewCommunityName('');
                  setNewCommunityDescription('');
                }}
              >
                Annuler
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={handleCreateCommunity}
              >
                Créer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-[var(--gp-border)] py-2 px-6 bg-[var(--gp-surface)] transition-colors duration-300">
        <div className="max-w-2xl mx-auto flex justify-around">
          <Link href="/v2/feeds"><Button variant="ghost" size="sm"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg></Button></Link>
          <Link href="/v2/chats"><Button variant="ghost" size="sm"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg></Button></Link>
          <Link href="/v2/communities"><Button variant="ghost" size="sm" className="text-[var(--gp-terracotta)]"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg></Button></Link>
          <Link href="/v2/me"><Button variant="ghost" size="sm"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></Button></Link>
        </div>
      </nav>

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </div>
  );
}
