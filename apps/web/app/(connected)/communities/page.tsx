'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Badge, Input, Label, Dialog, DialogHeader, DialogBody, DialogFooter, useToast } from '@/components/v2';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Users } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';
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
  const { t } = useI18n('groups');

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
      addToast(t('v2.toasts.nameRequired'), 'error');
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
      addToast(t('v2.toasts.created', { name: newCommunityName }), 'success');
      if (result.data?.id) {
        router.push(`/communities/${result.data.id}`);
      }
    } catch {
      addToast(t('v2.toasts.createError'), 'error');
    }
  };

  const handleJoinCommunity = async (community: Community) => {
    try {
      await joinMutation.mutateAsync(community.id);
      addToast(t('community.joinedToast', { name: community.name }), 'success');
    } catch {
      addToast(t('community.actionError'), 'error');
    }
  };

  const handleLeaveCommunity = async (community: Community) => {
    try {
      await leaveMutation.mutateAsync(community.id);
      addToast(t('community.leftToast', { name: community.name }), 'info');
    } catch {
      addToast(t('community.actionError'), 'error');
    }
  };

  const handleCardClick = (community: Community) => {
    router.push(`/communities/${community.id}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-950 dark:to-gray-900 flex flex-col">
      <DashboardLayout
        title={t('v2.title')}
        className="!bg-none !bg-transparent !h-auto !max-w-none !px-0"
      >
        <div className="relative z-10 space-y-8 pb-8 w-full py-8 px-4 md:px-8">
          {/* Hero */}
          <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-8 md:p-12 text-white shadow-2xl">
            <div className="absolute inset-0 bg-black/10" />
            <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-white/20 backdrop-blur-sm rounded-2xl">
                    <Users className="h-8 w-8" />
                  </div>
                  <h1 className="text-4xl md:text-5xl font-bold">{t('v2.title')}</h1>
                </div>
                <p className="text-lg md:text-xl text-blue-100 max-w-2xl">
                  Rejoignez des communautés et échangez sans barrière de langue.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center gap-2 self-start rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-indigo-700 shadow transition-colors hover:bg-blue-50 md:self-auto"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {t('v2.create')}
              </button>
            </div>
            <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
            <div className="absolute -left-12 -top-12 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl" />
          </header>

          <div className="mx-auto w-full max-w-2xl">
        {/* My Communities */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold mb-4 px-1 text-[var(--gp-text-muted)]">{t('v2.myCommunities')}</h2>

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
                        <Badge variant="teal" size="sm">{t('member')}</Badge>
                        {community.isPrivate && <Badge variant="default" size="sm">{t('visibility.private')}</Badge>}
                      </div>
                      {community.description && (
                        <p className="text-sm mb-2 text-[var(--gp-text-secondary)]">{community.description}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-[var(--gp-text-muted)]">
                            {t('community.membersCount', { count: (community._count?.members ?? 0).toLocaleString() })}
                          </span>
                          <span className="text-sm text-[var(--gp-text-muted)]">
                            {t('community.conversationsCount', { count: community._count?.Conversation ?? community._count?.conversations ?? 0 })}
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
                          {t('community.leave')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
              {myCommunities.length === 0 && (
                <p className="text-center py-8 text-[var(--gp-text-muted)]">
                  {t('v2.emptyMine')}
                </p>
              )}
            </div>
          )}
        </section>

        {/* Discover */}
        <section>
          <h2 className="text-sm font-semibold mb-4 px-1 text-[var(--gp-text-muted)]">{t('v2.discover')}</h2>
          <div className="mb-4">
            <Input
              placeholder={t('v2.searchPlaceholder')}
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
                          {t('community.membersCount', { count: (community._count?.members ?? 0).toLocaleString() })}
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
                          {t('community.join')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            {searchQuery.length < 2 && (
              <p className="text-center py-4 text-sm text-[var(--gp-text-muted)]">
                {t('v2.searchMinChars')}
              </p>
            )}
            {searchQuery.length >= 2 && discoverResults.length === 0 && (
              <p className="text-center py-8 text-[var(--gp-text-muted)]">
                {t('v2.noResults')}
              </p>
            )}
          </div>
        </section>
          </div>
        </div>

        {/* Create Community Dialog */}
      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <DialogHeader>
          <h2 className="text-xl font-semibold text-[var(--gp-text-primary)]">
            {t('v2.createTitle')}
          </h2>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label className="mb-2">{t('v2.nameLabel')}</Label>
              <Input
                placeholder={t('v2.namePlaceholder')}
                value={newCommunityName}
                onChange={(e) => setNewCommunityName(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-2">{t('v2.descriptionLabel')}</Label>
              <Input
                placeholder={t('v2.descriptionPlaceholder')}
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
            {t('v2.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleCreateCommunity}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? t('v2.creating') : t('v2.create')}
          </Button>
        </DialogFooter>
      </Dialog>
      </DashboardLayout>
    </div>
  );
}
