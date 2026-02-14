'use client';

import { useState } from 'react';
import { Button, Card, Badge, Input, Tooltip, theme, useToast, PageHeader } from '@/components/v2';

interface LinkItem {
  id: number;
  name: string;
  url: string;
  clicks: number;
  created: string;
  active: boolean;
}

const initialLinks: LinkItem[] = [
  { id: 1, name: 'Lien principal', url: 'meeshy.me/l/abc123', clicks: 248, created: '15 Jan 2024', active: true },
  { id: 2, name: 'Campagne LinkedIn', url: 'meeshy.me/l/linkedin2024', clicks: 89, created: '10 Jan 2024', active: true },
  { id: 3, name: 'Bio Instagram', url: 'meeshy.me/l/insta', clicks: 156, created: '5 Jan 2024', active: false },
];

function generateSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let slug = '';
  for (let i = 0; i < 8; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return slug;
}

export default function V2LinksPage() {
  const { addToast } = useToast();
  const [links, setLinks] = useState<LinkItem[]>(initialLinks);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newLinkName, setNewLinkName] = useState('');
  const [generatedSlug, setGeneratedSlug] = useState(generateSlug());

  const handleCreateLink = () => {
    if (!newLinkName.trim()) {
      addToast('Veuillez entrer un nom pour le lien', 'error');
      return;
    }

    const newLink: LinkItem = {
      id: Date.now(),
      name: newLinkName.trim(),
      url: `meeshy.me/l/${generatedSlug}`,
      clicks: 0,
      created: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }),
      active: true,
    };

    setLinks((prev) => [newLink, ...prev]);
    setNewLinkName('');
    setGeneratedSlug(generateSlug());
    setIsModalOpen(false);
    addToast('Lien cree avec succes', 'success');
  };

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(`https://${url}`);
      addToast('URL copiee dans le presse-papier', 'success');
    } catch {
      addToast('Erreur lors de la copie', 'error');
    }
  };

  const handleToggleActive = (id: number) => {
    setLinks((prev) =>
      prev.map((link) =>
        link.id === id ? { ...link, active: !link.active } : link
      )
    );
    const link = links.find((l) => l.id === id);
    if (link) {
      addToast(link.active ? 'Lien desactive' : 'Lien active', 'info');
    }
  };

  const totalClicks = links.reduce((sum, link) => sum + link.clicks, 0);
  const activeLinksCount = links.filter((link) => link.active).length;

  return (
    <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors duration-300">
      <PageHeader
        title="Mes liens"
        actionButtons={
          <Button variant="primary" size="sm" onClick={() => setIsModalOpen(true)}>
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Creer
          </Button>
        }
      />

      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Card variant="gradient" hover={false} className="p-4 text-center">
            <p className="text-3xl font-bold text-[var(--gp-terracotta)]">{totalClicks}</p>
            <p className="text-sm text-[var(--gp-text-secondary)]">Clics totaux</p>
          </Card>
          <Card variant="gradient" hover={false} className="p-4 text-center">
            <p className="text-3xl font-bold text-[var(--gp-deep-teal)]">{activeLinksCount}</p>
            <p className="text-sm text-[var(--gp-text-secondary)]">Liens actifs</p>
          </Card>
        </div>

        {/* Links */}
        <section>
          <h2 className="text-sm font-semibold mb-4 px-1 text-[var(--gp-text-muted)]">MES LIENS</h2>
          <div className="space-y-4">
            {links.map((link) => (
              <Card key={link.id} variant="outlined" hover className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-[var(--gp-text-primary)]">{link.name}</h3>
                      {link.active ? (
                        <Badge variant="success" size="sm">Actif</Badge>
                      ) : (
                        <Badge variant="default" size="sm">Inactif</Badge>
                      )}
                    </div>
                    <p className="text-sm font-mono text-[var(--gp-deep-teal)]">{link.url}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Toggle active/inactive */}
                    <button
                      onClick={() => handleToggleActive(link.id)}
                      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none"
                      style={{
                        backgroundColor: link.active ? 'var(--gp-jade-green)' : 'var(--gp-parchment)',
                      }}
                      aria-label={link.active ? 'Desactiver le lien' : 'Activer le lien'}
                    >
                      <span
                        className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                        style={{
                          transform: link.active ? 'translateX(1.375rem)' : 'translateX(0.25rem)',
                        }}
                      />
                    </button>
                    {/* Copy button */}
                    <Button variant="ghost" size="sm" onClick={() => handleCopyUrl(link.url)}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm text-[var(--gp-text-muted)]">
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    {link.clicks} clics
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {link.created}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </main>

      {/* Create Link Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          />
          {/* Modal */}
          <div className="relative w-full max-w-md mx-4 rounded-2xl p-6 shadow-xl bg-[var(--gp-surface)]">
            <h2
              className="text-xl font-semibold mb-6 text-[var(--gp-text-primary)]"
              style={{ fontFamily: theme.fonts.display }}
            >
              Creer un nouveau lien
            </h2>

            <div className="space-y-4">
              {/* Link name input */}
              <div>
                <label className="block text-sm font-medium mb-2 text-[var(--gp-text-secondary)]">
                  Nom du lien
                </label>
                <Input
                  type="text"
                  placeholder="Ex: Ma page de profil"
                  value={newLinkName}
                  onChange={(e) => setNewLinkName(e.target.value)}
                  autoFocus
                />
              </div>

              {/* Generated URL preview */}
              <div>
                <label className="block text-sm font-medium mb-2 text-[var(--gp-text-secondary)]">
                  URL generee
                </label>
                <div className="flex items-center gap-2 p-3 rounded-xl border bg-[var(--gp-parchment)] border-[var(--gp-border)]">
                  <span className="text-sm font-mono text-[var(--gp-deep-teal)]">
                    meeshy.me/l/{generatedSlug}
                  </span>
                  <Tooltip content="Regenerer le slug">
                    <button
                      onClick={() => setGeneratedSlug(generateSlug())}
                      className="ml-auto p-1 rounded hover:bg-[var(--gp-hover)] transition-colors text-[var(--gp-text-muted)]"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </Tooltip>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  setIsModalOpen(false);
                  setNewLinkName('');
                }}
              >
                Annuler
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={handleCreateLink}
              >
                Creer
              </Button>
            </div>
          </div>
        </div>
      )}

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </div>
  );
}
