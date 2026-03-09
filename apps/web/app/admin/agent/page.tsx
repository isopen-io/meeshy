'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import AdminLayout from '@/components/admin/AdminLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, BarChart3, MessageSquare, Cpu, Users, Activity, Settings } from 'lucide-react';

const AgentOverviewTab = dynamic(
  () => import('@/components/admin/agent/AgentOverviewTab').then(mod => mod.AgentOverviewTab),
  { loading: () => <SectionLoader /> }
);

const AgentConversationsTab = dynamic(
  () => import('@/components/admin/agent/AgentConversationsTab').then(mod => mod.AgentConversationsTab),
  { loading: () => <SectionLoader /> }
);

const AgentLlmTab = dynamic(
  () => import('@/components/admin/agent/AgentLlmTab').then(mod => mod.AgentLlmTab),
  { loading: () => <SectionLoader /> }
);

const AgentArchetypesTab = dynamic(
  () => import('@/components/admin/agent/AgentArchetypesTab').then(mod => mod.AgentArchetypesTab),
  { loading: () => <SectionLoader /> }
);

const AgentLiveTab = dynamic(
  () => import('@/components/admin/agent/AgentLiveTab').then(mod => mod.AgentLiveTab),
  { loading: () => <SectionLoader /> }
);

const AgentGlobalConfigTab = dynamic(
  () => import('@/components/admin/agent/AgentGlobalConfigTab').then(mod => mod.AgentGlobalConfigTab),
  { loading: () => <SectionLoader /> }
);

function SectionLoader() {
  return (
    <div className="flex items-center justify-center p-12">
      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
    </div>
  );
}

const tabs = [
  { id: 'overview', label: 'Vue d\'ensemble', icon: BarChart3 },
  { id: 'conversations', label: 'Conversations', icon: MessageSquare },
  { id: 'global', label: 'Global', icon: Settings },
  { id: 'llm', label: 'Config LLM', icon: Cpu },
  { id: 'archetypes', label: 'Arch\u00e9types', icon: Users },
  { id: 'live', label: 'Live', icon: Activity },
] as const;

export default function AgentAdminPage() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <AdminLayout currentPage="/admin/agent">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Agent IA</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configuration et supervision du service agent conversationnel
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 md:grid-cols-6 gap-1">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.id} value={tab.id} className="text-xs sm:text-sm px-1 sm:px-3">
                  <Icon className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <AgentOverviewTab />
          </TabsContent>

          <TabsContent value="conversations" className="mt-6">
            <AgentConversationsTab />
          </TabsContent>

          <TabsContent value="global" className="mt-6">
            <AgentGlobalConfigTab />
          </TabsContent>

          <TabsContent value="llm" className="mt-6">
            <AgentLlmTab />
          </TabsContent>

          <TabsContent value="archetypes" className="mt-6">
            <AgentArchetypesTab />
          </TabsContent>

          <TabsContent value="live" className="mt-6">
            <AgentLiveTab />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
