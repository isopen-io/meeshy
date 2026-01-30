'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Card, Input, Badge, LanguageOrb, MessageBubble, theme } from '@/components/v2';

const conversations = [
  { id: 1, name: 'Yuki Tanaka', lastMessage: 'À demain pour la réunion !', time: '10:34', unread: 2, lang: 'ja', online: true },
  { id: 2, name: 'Carlos García', lastMessage: '¡Gracias por tu ayuda!', time: '09:15', unread: 0, lang: 'es', online: false },
  { id: 3, name: 'Emma Wilson', lastMessage: 'The project looks great!', time: 'Hier', unread: 0, lang: 'en', online: true },
  { id: 4, name: 'Ahmed Hassan', lastMessage: 'مرحبا، كيف حالك؟', time: 'Hier', unread: 5, lang: 'ar', online: false },
  { id: 5, name: 'Li Wei', lastMessage: '项目进展如何？', time: 'Lun', unread: 0, lang: 'zh', online: true },
];

export default function V2ChatsPage() {
  const [selectedChat, setSelectedChat] = useState(1);
  const [message, setMessage] = useState('');

  return (
    <div className="h-screen flex" style={{ background: theme.colors.warmCanvas }}>
      {/* Sidebar */}
      <div
        className="w-80 border-r flex flex-col"
        style={{ borderColor: theme.colors.parchment, background: 'white' }}
      >
        {/* Header */}
        <div className="p-4 border-b" style={{ borderColor: theme.colors.parchment }}>
          <div className="flex items-center justify-between mb-4">
            <Link href="/v2/landing" className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                style={{ background: `linear-gradient(135deg, ${theme.colors.terracotta}, ${theme.colors.deepTeal})` }}
              >
                M
              </div>
              <span className="font-semibold" style={{ color: theme.colors.charcoal }}>Messages</span>
            </Link>
            <Button variant="ghost" size="sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </Button>
          </div>
          <Input
            placeholder="Rechercher..."
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
          />
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setSelectedChat(conv.id)}
              className={`w-full p-4 flex items-center gap-3 transition-colors ${
                selectedChat === conv.id ? 'bg-[#F5EDE3]' : 'hover:bg-[#F5EDE3]/50'
              }`}
            >
              <div className="relative">
                <LanguageOrb code={conv.lang} size="sm" pulse={false} />
                {conv.online && (
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white"
                    style={{ background: theme.colors.jadeGreen }}
                  />
                )}
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate" style={{ color: theme.colors.charcoal }}>
                    {conv.name}
                  </span>
                  <span className="text-xs" style={{ color: theme.colors.textMuted }}>
                    {conv.time}
                  </span>
                </div>
                <p className="text-sm truncate" style={{ color: theme.colors.textSecondary }}>
                  {conv.lastMessage}
                </p>
              </div>
              {conv.unread > 0 && (
                <Badge variant="terracotta" size="sm">{conv.unread}</Badge>
              )}
            </button>
          ))}
        </div>

        {/* Nav */}
        <div className="p-2 border-t flex justify-around" style={{ borderColor: theme.colors.parchment }}>
          <Link href="/v2/chats">
            <Button variant="ghost" size="sm" style={{ color: theme.colors.terracotta }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </Button>
          </Link>
          <Link href="/v2/feeds">
            <Button variant="ghost" size="sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </Button>
          </Link>
          <Link href="/v2/communities">
            <Button variant="ghost" size="sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </Button>
          </Link>
          <Link href="/v2/settings">
            <Button variant="ghost" size="sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Button>
          </Link>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <div
          className="p-4 border-b flex items-center justify-between"
          style={{ borderColor: theme.colors.parchment, background: 'white' }}
        >
          <div className="flex items-center gap-3">
            <LanguageOrb code="ja" size="sm" pulse={false} />
            <div>
              <h2 className="font-semibold" style={{ color: theme.colors.charcoal }}>Yuki Tanaka</h2>
              <span className="text-sm" style={{ color: theme.colors.jadeGreen }}>En ligne</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </Button>
            <Button variant="ghost" size="sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4" style={{ background: '#FAFAFA' }}>
          <MessageBubble
            languageCode="ja"
            languageName="Japonais"
            content="こんにちは！今日の会議の準備はできていますか？"
            translation="Bonjour ! Es-tu prête pour la réunion d'aujourd'hui ?"
            translationLanguage="français"
            sender="Yuki"
            timestamp="10:32"
          />
          <MessageBubble
            isSent
            languageCode="fr"
            languageName="Français"
            content="Oui, tout est prêt ! J'ai terminé la présentation hier soir."
            translation="はい、準備万端です！昨夜プレゼンを完成させました。"
            translationLanguage="japonais"
            timestamp="10:33"
          />
          <MessageBubble
            languageCode="ja"
            languageName="Japonais"
            content="素晴らしい！楽しみにしています 🎉"
            translation="Super ! J'ai hâte d'y être 🎉"
            translationLanguage="français"
            sender="Yuki"
            timestamp="10:34"
          />
        </div>

        {/* Input */}
        <div className="p-4 border-t" style={{ borderColor: theme.colors.parchment, background: 'white' }}>
          <div className="flex gap-3">
            <Button variant="ghost" size="sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </Button>
            <Input
              placeholder="Tapez votre message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="flex-1"
            />
            <Button variant="primary" size="sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </Button>
          </div>
        </div>
      </div>

      {/* Fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </div>
  );
}
