'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Badge, Input, Label, Dialog, DialogHeader, DialogBody, DialogFooter, useToast, PageHeader } from '@/components/v2';
import {
  useCommunitiesQuery,
  useCommunitySearchQuery,
  useCreateCommunityMutation,
  useJoinCommunityMutation,
  useLeaveCommunityMutation,
} from '@/hooks/queries';
import type { Community } from '@meeshy/shared/types';

export default function V2CommunitiesPage() {
  const router = useRouter();
  const { addToast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCommunityName, setNewCommunityName] = useState('');
  const [newCommunityDescription, setNewCommunityDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: myCommunities = [], isLoading } = useCommunitiesQuery();
  const { data: discoverResults = [] } = useCommunitySearchQuery(searchQuery, { limit: 20 });
  const createMutation = useCreateCommunityMutation();
  const joinMutation = useJoinCommunityMutation();
  const leaveMutation = useLeaveCommunityMutation();

  const handleCreateCommunity = async () => {
    if (!newCommunityName.trim()) {
      addToast('Le nom de la communaute est requis', 'error');
      return;
    }

    try {
      const result = await createMutation.mutateAsync({
        name: newCommunityName.trim(),
        description: newCommunityDescription.trim() || undefined,
      });
      setNewCommunityName('');
      setNewCommunityDescription('');
      setIsModalOpen(false);
      addToast(`Communaute "${newCommunityName}" creee avec succes`, 'success');
      if (result.data?.id) {
        router.push(`/v2/communities/${result.data.id}`);
      }
    } catch {
      addToast('Erreur lors de la creation', 'error');
    }
  };

  const handleJoinCommunity = async (community: Community) => {
    try {
      await joinMutation.mutateAsync(community.id);
      addToast(`Vous avez rejoint "${community.name}"`, 'success');
    } catch {
      addToast('Erreur lors de la tentative', 'error');
    }
  };

  const handleLeaveCommunity = async (community: Community) => {
    try {
      await leaveMutation.mutateAsync(community.id);
      addToast(`Vous avez quitte "${community.name}"`, 'info');
    } catch {
      addToast('Erreur lors de la tentative', 'error');
    }
  };

  const handleCardClick = (community: Community) => {
    router.push(`/v2/communities/${community.id}`);
  };

  return (
    <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors duration-300">
      <PageHeader
        title="Communautes"
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
        {/* My Communities */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold mb-4 px-1 text-[var(--gp-text-muted)]">MES COMMUNAUTES</h2>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} variant="default" className="p-4 animate-pulse">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-[var(--gp-border-subtle)]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-5 w-40 bg-[var(--gp-border-subtle)] rounded" />
                      <div className="h-4 w-60 bg-[var(--gp-border-subtle)] rounded" />
                      <div className="h-3 w-24 bg-[var(--gp-border-subtle)] rounded" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {myCommunities.map((community) => (
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
                        {community.isPrivate && <Badge variant="default" size="sm">Prive</Badge>}
                      </div>
                      {community.description && (
                        <p className="text-sm mb-2 text-[var(--gp-text-secondary)]">{community.description}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-[var(--gp-text-muted)]">
                            {(community._count?.members ?? 0).toLocaleString()} membres
                          </span>
                          <span className="text-sm text-[var(--gp-text-muted)]">
                            {(community._count?.Conversation ?? community._count?.conversations ?? 0)} conversations
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLeaveCommunity(community);
                          }}
                          disabled={leaveMutation.isPending}
                        >
                          Quitter
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
              {myCommunities.length === 0 && (
                <p className="text-center py-8 text-[var(--gp-text-muted)]">
                  Vous n&apos;avez pas encore rejoint de communaute
                </p>
              )}
            </div>
          )}
        </section>

        {/* Discover */}
        <section>
          <h2 className="text-sm font-semibold mb-4 px-1 text-[var(--gp-text-muted)]">DECOUVRIR</h2>
          <div className="mb-4">
            <Input
              placeholder="Rechercher des communautes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="space-y-4">
            {discoverResults
              .filter((c) => !myCommunities.some((mc) => mc.id === c.id))
              .map((community) => (
                <Card
                  key={community.id}
                  variant="outlined"
                  hover
                  className="p-4 cursor-pointer"
                  onClick={() => handleCardClick(community)}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl text-[var(--gp-text-primary)] bg-[var(--gp-parchment)]">
                      {community.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold mb-1 text-[var(--gp-text-primary)]">{community.name}</h3>
                      {community.description && (
                        <p className="text-sm mb-2 text-[var(--gp-text-secondary)]">{community.description}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[var(--gp-text-muted)]">
                          {(community._count?.members ?? 0).toLocaleString()} membres
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleJoinCommunity(community);
                          }}
                          disabled={joinMutation.isPending}
                        >
                          Rejoindre
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            {searchQuery.length < 2 && (
              <p className="text-center py-4 text-sm text-[var(--gp-text-muted)]">
                Entrez au moins 2 caracteres pour rechercher
              </p>
            )}
            {searchQuery.length >= 2 && discoverResults.length === 0 && (
              <p className="text-center py-8 text-[var(--gp-text-muted)]">
                Aucune communaute trouvee
              </p>
            )}
          </div>
        </section>
      </main>

      {/* Create Community Dialog */}
      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <DialogHeader>
          <h2 className="text-xl font-semibold text-[var(--gp-text-primary)]">
            Creer une communaute
          </h2>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label className="mb-2">Nom de la communaute</Label>
              <Input
                placeholder="Ex: French Learners"
                value={newCommunityName}
                onChange={(e) => setNewCommunityName(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-2">Description</Label>
              <Input
                placeholder="Decrivez votre communaute..."
                value={newCommunityDescription}
                onChange={(e) => setNewCommunityDescription(e.target.value)}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="ghost"
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
            onClick={handleCreateCommunity}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Creation...' : 'Creer'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
