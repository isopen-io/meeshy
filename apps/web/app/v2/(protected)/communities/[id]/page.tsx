'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Badge, Avatar, LanguageOrb, PostCard, useToast, PageHeader } from '@/components/v2';
import type { TranslationItem } from '@/components/v2';

const USER_LANGUAGE = 'fr';

interface CommunityDetail {
  id: number;
  name: string;
  description: string;
  members: number;
  langs: string[];
  joined: boolean;
  createdAt: string;
  category: string;
}

interface CommunityPost {
  id: number;
  author: { name: string; emoji: string };
  lang: string;
  content: string;
  translations: TranslationItem[];
  likes: number;
  comments: number;
  time: string;
  reactionSummary?: Record<string, number>;
}

const MOCK_COMMUNITIES: Record<string, CommunityDetail> = {
  '1': { id: 1, name: 'Tech Polyglots', description: 'D\u00e9veloppeurs du monde entier qui partagent leurs connaissances techniques dans toutes les langues.', members: 1243, langs: ['en', 'fr', 'de', 'ja'], joined: true, createdAt: 'Janvier 2024', category: 'Technologie' },
  '2': { id: 2, name: 'Language Learners', description: 'Un espace bienveillant pour apprendre de nouvelles langues ensemble, partager des astuces et progresser.', members: 892, langs: ['en', 'es', 'zh'], joined: true, createdAt: 'F\u00e9vrier 2024', category: 'Education' },
  '3': { id: 3, name: 'Global Travelers', description: 'Partagez vos aventures, recommandations et photos de voyage du monde entier.', members: 2156, langs: ['en', 'fr', 'es', 'pt'], joined: false, createdAt: 'Mars 2024', category: 'Voyage' },
  '4': { id: 4, name: 'Manga & Anime', description: 'Pour les fans du monde entier \u2014 discussions, recommandations et fan art.', members: 3421, langs: ['ja', 'en', 'fr'], joined: false, createdAt: 'D\u00e9cembre 2023', category: 'Divertissement' },
  '5': { id: 5, name: 'Business Network', description: 'Networking international pour professionnels ambitieux.', members: 567, langs: ['en', 'zh', 'ar'], joined: false, createdAt: 'Avril 2024', category: 'Business' },
};

const MOCK_POSTS: Record<string, CommunityPost[]> = {
  '1': [
    {
      id: 101, author: { name: 'Alex Kim', emoji: '\uD83D\uDC68\u200D\uD83D\uDCBB' }, lang: 'en',
      content: 'Just released my new open-source library for real-time translation APIs. Check it out!',
      translations: [
        { languageCode: 'fr', languageName: 'Francais', content: 'Je viens de publier ma nouvelle biblioth\u00e8que open-source pour les APIs de traduction en temps r\u00e9el. Allez voir !' },
        { languageCode: 'ja', languageName: 'Nihongo', content: '\u30EA\u30A2\u30EB\u30BF\u30A4\u30E0\u7FFB\u8A33API\u306E\u65B0\u3057\u3044\u30AA\u30FC\u30D7\u30F3\u30BD\u30FC\u30B9\u30E9\u30A4\u30D6\u30E9\u30EA\u3092\u516C\u958B\u3057\u307E\u3057\u305F\uFF01' },
      ],
      likes: 34, comments: 12, time: 'Il y a 1h',
      reactionSummary: { '\uD83D\uDD25': 20, '\uD83D\uDC4F': 14 },
    },
    {
      id: 102, author: { name: 'Sophie Martin', emoji: '\uD83D\uDC69\u200D\uD83D\uDCBB' }, lang: 'fr',
      content: "Quelqu'un a de l'exp\u00e9rience avec WebRTC pour des appels multilingues ? Je cherche des retours.",
      translations: [
        { languageCode: 'en', languageName: 'English', content: 'Anyone have experience with WebRTC for multilingual calls? Looking for feedback.' },
      ],
      likes: 18, comments: 7, time: 'Il y a 3h',
      reactionSummary: { '\u2764\uFE0F': 10, '\uD83D\uDE2E': 8 },
    },
    {
      id: 103, author: { name: 'Yuki Tanaka', emoji: '\uD83E\uDDD1\u200D\uD83D\uDCBB' }, lang: 'ja',
      content: '\u65B0\u3057\u3044AI\u7FFB\u8A33\u30E2\u30C7\u30EB\u306E\u30D9\u30F3\u30C1\u30DE\u30FC\u30AF\u7D50\u679C\u3092\u5171\u6709\u3057\u307E\u3059\u3002\u9A5A\u304F\u3079\u304D\u7CBE\u5EA6\u3067\u3059\uFF01',
      translations: [
        { languageCode: 'fr', languageName: 'Francais', content: 'Je partage les r\u00e9sultats de benchmark du nouveau mod\u00e8le de traduction IA. Pr\u00e9cision \u00e9tonnante !' },
        { languageCode: 'en', languageName: 'English', content: 'Sharing benchmark results of the new AI translation model. Amazing accuracy!' },
      ],
      likes: 45, comments: 20, time: 'Il y a 5h',
      reactionSummary: { '\uD83D\uDD25': 25, '\uD83D\uDC4F': 12, '\uD83D\uDE2E': 8 },
    },
  ],
  '2': [
    {
      id: 201, author: { name: 'Maria Garcia', emoji: '\uD83D\uDC69' }, lang: 'es',
      content: '\u00A1Hola a todos! Estoy buscando un compa\u00F1ero de idiomas para practicar franc\u00E9s. \u00BFAlguien interesado?',
      translations: [
        { languageCode: 'fr', languageName: 'Francais', content: "Bonjour \u00e0 tous ! Je cherche un partenaire linguistique pour pratiquer le fran\u00e7ais. Quelqu'un est int\u00e9ress\u00e9 ?" },
        { languageCode: 'en', languageName: 'English', content: 'Hello everyone! I\'m looking for a language partner to practice French. Anyone interested?' },
      ],
      likes: 22, comments: 15, time: 'Il y a 2h',
      reactionSummary: { '\u2764\uFE0F': 15, '\uD83D\uDC4F': 7 },
    },
    {
      id: 202, author: { name: 'Li Wei', emoji: '\uD83D\uDC68' }, lang: 'zh',
      content: '\u5206\u4EAB\u4E00\u4E2A\u5B66\u4E60\u6CD5\u8BED\u7684\u597D\u65B9\u6CD5\uFF1A\u6BCF\u5929\u770B30\u5206\u949F\u6CD5\u8BED\u7535\u5F71\u914D\u6CD5\u8BED\u5B57\u5E55\u3002',
      translations: [
        { languageCode: 'fr', languageName: 'Francais', content: 'Partager une bonne m\u00e9thode pour apprendre le fran\u00e7ais : regarder 30 minutes de films fran\u00e7ais avec sous-titres fran\u00e7ais chaque jour.' },
        { languageCode: 'en', languageName: 'English', content: 'Sharing a good method to learn French: watch 30 minutes of French movies with French subtitles every day.' },
      ],
      likes: 31, comments: 8, time: 'Il y a 6h',
      reactionSummary: { '\uD83D\uDD25': 18, '\uD83D\uDC4F': 13 },
    },
  ],
  '3': [
    {
      id: 301, author: { name: 'Pierre Dubois', emoji: '\uD83E\uDDF3' }, lang: 'fr',
      content: 'Retour de 3 semaines au Japon. Voici mes meilleurs spots \u00e0 Tokyo et Kyoto !',
      translations: [
        { languageCode: 'en', languageName: 'English', content: 'Back from 3 weeks in Japan. Here are my best spots in Tokyo and Kyoto!' },
        { languageCode: 'ja', languageName: 'Nihongo', content: '\u65E5\u672C\u30673\u9031\u9593\u904E\u3054\u3057\u3066\u304D\u307E\u3057\u305F\u3002\u6771\u4EAC\u3068\u4EAC\u90FD\u306E\u304A\u3059\u3059\u3081\u30B9\u30DD\u30C3\u30C8\u3092\u7D39\u4ECB\u3057\u307E\u3059\uFF01' },
      ],
      likes: 67, comments: 25, time: 'Il y a 1h',
      reactionSummary: { '\u2764\uFE0F': 40, '\uD83D\uDD25': 20, '\uD83D\uDE2E': 7 },
    },
  ],
  '4': [
    {
      id: 401, author: { name: 'Hiro Sato', emoji: '\uD83C\uDDEF\uD83C\uDDF5' }, lang: 'ja',
      content: '\u4ECA\u5B63\u306E\u30A2\u30CB\u30E1\u3067\u4E00\u756A\u9762\u767D\u3044\u306E\u306F\u4F55\u3060\u3068\u601D\u3044\u307E\u3059\u304B\uFF1F',
      translations: [
        { languageCode: 'fr', languageName: 'Francais', content: "Quel est l'anime le plus int\u00e9ressant de cette saison selon vous ?" },
        { languageCode: 'en', languageName: 'English', content: 'What do you think is the most interesting anime this season?' },
      ],
      likes: 89, comments: 42, time: 'Il y a 30min',
      reactionSummary: { '\uD83D\uDD25': 50, '\u2764\uFE0F': 30, '\uD83D\uDE02': 9 },
    },
  ],
  '5': [
    {
      id: 501, author: { name: 'Ahmed Hassan', emoji: '\uD83D\uDCBC' }, lang: 'ar',
      content: '\u0645\u0634\u0627\u0631\u0643\u0629 \u062A\u062C\u0631\u0628\u062A\u064A \u0641\u064A \u062A\u0648\u0633\u064A\u0639 \u0634\u0631\u0643\u062A\u064A \u0627\u0644\u0646\u0627\u0634\u0626\u0629 \u0625\u0644\u0649 \u0627\u0644\u0623\u0633\u0648\u0627\u0642 \u0627\u0644\u0622\u0633\u064A\u0648\u064A\u0629. \u0627\u0644\u062F\u0631\u0648\u0633 \u0627\u0644\u0645\u0633\u062A\u0641\u0627\u062F\u0629 \u0643\u062B\u064A\u0631\u0629.',
      translations: [
        { languageCode: 'fr', languageName: 'Francais', content: "Partage de mon exp\u00e9rience d'expansion de ma startup vers les march\u00e9s asiatiques. Beaucoup de le\u00e7ons apprises." },
        { languageCode: 'en', languageName: 'English', content: 'Sharing my experience expanding my startup to Asian markets. Many lessons learned.' },
      ],
      likes: 15, comments: 6, time: 'Il y a 4h',
      reactionSummary: { '\uD83D\uDC4F': 10, '\uD83D\uDD25': 5 },
    },
  ],
};

export default function CommunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { addToast } = useToast();
  const communityId = params.id as string;

  const community = MOCK_COMMUNITIES[communityId];
  const posts = MOCK_POSTS[communityId] || [];

  const [isJoined, setIsJoined] = useState(community?.joined ?? false);
  const [memberCount, setMemberCount] = useState(community?.members ?? 0);
  const [likedPosts, setLikedPosts] = useState<Set<number>>(new Set());
  const [userReactions, setUserReactions] = useState<Record<number, string>>({});

  if (!community) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--gp-background)]">
        <div className="text-center">
          <p className="text-lg font-semibold text-[var(--gp-text-primary)] mb-2">Communaut\u00e9 introuvable</p>
          <Button variant="outline" onClick={() => router.push('/v2/communities')}>
            Retour aux communaut\u00e9s
          </Button>
        </div>
      </div>
    );
  }

  const handleToggleJoin = () => {
    setIsJoined(!isJoined);
    setMemberCount((prev) => (isJoined ? prev - 1 : prev + 1));
    addToast(
      isJoined ? `Vous avez quitt\u00e9 "${community.name}"` : `Vous avez rejoint "${community.name}"`,
      isJoined ? 'info' : 'success'
    );
  };

  const handleLike = (postId: number) => {
    setLikedPosts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(postId)) newSet.delete(postId);
      else newSet.add(postId);
      return newSet;
    });
  };

  const handleReact = (postId: number, emoji: string) => {
    setUserReactions((prev) => {
      if (prev[postId] === emoji) {
        const next = { ...prev };
        delete next[postId];
        return next;
      }
      return { ...prev, [postId]: emoji };
    });
  };

  const handleComment = () => {
    addToast('Les commentaires seront bient\u00f4t disponibles', 'info');
  };

  const handleShare = async (postId: number) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/v2/communities/${communityId}/post/${postId}`);
      addToast('Lien copi\u00e9 !', 'success');
    } catch {
      addToast('Erreur lors de la copie', 'error');
    }
  };

  return (
    <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors duration-300">
      <PageHeader
        title={community.name}
        actionButtons={
          <Button variant="ghost" size="sm" onClick={() => router.push('/v2/communities')}>
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Retour
          </Button>
        }
      />

      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* Community Header */}
        <Card variant="default" hover={false} className="p-6 mb-6">
          <div className="flex items-start gap-4 mb-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl text-[var(--gp-text-primary)]"
              style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--gp-terracotta) 30%, transparent), color-mix(in srgb, var(--gp-deep-teal) 30%, transparent))' }}
            >
              {community.name[0]}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-bold text-[var(--gp-text-primary)]">{community.name}</h1>
                {isJoined && <Badge variant="teal" size="sm">Membre</Badge>}
              </div>
              <Badge variant="default" size="sm">{community.category}</Badge>
            </div>
          </div>

          <p className="text-[var(--gp-text-secondary)] mb-4">{community.description}</p>

          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[var(--gp-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm text-[var(--gp-text-muted)]">{memberCount.toLocaleString()} membres</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[var(--gp-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-sm text-[var(--gp-text-muted)]">Cr\u00e9\u00e9e en {community.createdAt}</span>
            </div>
          </div>

          {/* Languages */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-[var(--gp-text-muted)]">Langues :</span>
            <div className="flex -space-x-1">
              {community.langs.map((lang) => (
                <LanguageOrb key={lang} code={lang} size="sm" pulse={false} className="w-6 h-6 text-xs border-2 border-[var(--gp-surface)]" />
              ))}
            </div>
          </div>

          {/* Join/Leave button */}
          <Button
            variant={isJoined ? 'ghost' : 'primary'}
            className="w-full"
            onClick={handleToggleJoin}
          >
            {isJoined ? 'Quitter la communaut\u00e9' : 'Rejoindre la communaut\u00e9'}
          </Button>
        </Card>

        {/* Posts */}
        <h2 className="text-sm font-semibold mb-4 px-1 text-[var(--gp-text-muted)]">
          PUBLICATIONS ({posts.length})
        </h2>

        {posts.length === 0 ? (
          <Card variant="default" hover={false} className="p-8 text-center">
            <p className="text-[var(--gp-text-muted)]">Aucune publication dans cette communaut\u00e9</p>
          </Card>
        ) : (
          <div className="space-y-6">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                author={post.author}
                lang={post.lang}
                content={post.content}
                translations={post.translations}
                userLanguage={USER_LANGUAGE}
                time={post.time}
                likes={likedPosts.has(post.id) ? post.likes + 1 : post.likes}
                comments={post.comments}
                isLiked={likedPosts.has(post.id)}
                reactionSummary={post.reactionSummary}
                userReaction={userReactions[post.id]}
                onLike={() => handleLike(post.id)}
                onReact={(emoji) => handleReact(post.id, emoji)}
                onComment={handleComment}
                onShare={() => handleShare(post.id)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
