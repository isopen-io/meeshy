'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User } from '@/types';
import { Rocket, Sparkles, Zap, Beaker, Flag, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';
import { toast } from 'sonner';

interface BetaPlaygroundProps {
  user?: User | null;
  onUserUpdate?: (updatedUser: Partial<User>) => void;
}

export default function BetaPlayground({ user, onUserUpdate }: BetaPlaygroundProps) {
  const { t } = useI18n('settings');
  const [betaFeatures, setBetaFeatures] = useState({
    aiAssistant: false,
    voiceCloning: false,
    realTimeTranslation: false,
    advancedSearch: false,
    customThemes: false,
    gestureControls: false,
    smartReplies: false,
    messageScheduling: false,
    collaborativeEditing: false,
    voiceCommands: false
  });

  const updateFeature = (key: string, value: boolean) => {
    setBetaFeatures(prev => ({ ...prev, [key]: value }));
    toast.success(value ? 'Beta feature enabled' : 'Beta feature disabled');
  };

  const features = [
    {
      id: 'aiAssistant',
      icon: Sparkles,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      name: 'AI Assistant',
      description: 'Get intelligent suggestions and summaries powered by AI',
      status: 'alpha',
      enabled: betaFeatures.aiAssistant
    },
    {
      id: 'voiceCloning',
      icon: Zap,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
      name: 'Voice Cloning',
      description: 'Clone your voice for multi-language audio messages',
      status: 'beta',
      enabled: betaFeatures.voiceCloning
    },
    {
      id: 'realTimeTranslation',
      icon: Rocket,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      name: 'Real-time Translation',
      description: 'Instant translation as you type',
      status: 'experimental',
      enabled: betaFeatures.realTimeTranslation
    },
    {
      id: 'advancedSearch',
      icon: Beaker,
      color: 'text-green-600',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      name: 'Advanced Search',
      description: 'Powerful search with filters and AI-powered results',
      status: 'beta',
      enabled: betaFeatures.advancedSearch
    },
    {
      id: 'customThemes',
      icon: Sparkles,
      color: 'text-pink-600',
      bgColor: 'bg-pink-50 dark:bg-pink-900/20',
      name: 'Custom Themes',
      description: 'Create and share your own custom themes',
      status: 'alpha',
      enabled: betaFeatures.customThemes
    },
    {
      id: 'gestureControls',
      icon: Zap,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
      name: 'Gesture Controls',
      description: 'Navigate with swipes and gestures',
      status: 'experimental',
      enabled: betaFeatures.gestureControls
    },
    {
      id: 'smartReplies',
      icon: Sparkles,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-50 dark:bg-cyan-900/20',
      name: 'Smart Replies',
      description: 'AI-powered quick reply suggestions',
      status: 'beta',
      enabled: betaFeatures.smartReplies
    },
    {
      id: 'messageScheduling',
      icon: Flag,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
      name: 'Message Scheduling',
      description: 'Schedule messages to be sent later',
      status: 'beta',
      enabled: betaFeatures.messageScheduling
    },
    {
      id: 'collaborativeEditing',
      icon: Beaker,
      color: 'text-teal-600',
      bgColor: 'bg-teal-50 dark:bg-teal-900/20',
      name: 'Collaborative Editing',
      description: 'Edit documents together in real-time',
      status: 'alpha',
      enabled: betaFeatures.collaborativeEditing
    },
    {
      id: 'voiceCommands',
      icon: Rocket,
      color: 'text-red-600',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      name: 'Voice Commands',
      description: 'Control the app with voice commands',
      status: 'experimental',
      enabled: betaFeatures.voiceCommands
    }
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'alpha':
        return <Badge variant="destructive" className="text-xs">Alpha</Badge>;
      case 'beta':
        return <Badge variant="default" className="text-xs bg-blue-500">Beta</Badge>;
      case 'experimental':
        return <Badge variant="secondary" className="text-xs">Experimental</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Beta Program Info */}
      <Card className="border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Rocket className="h-6 w-6 text-blue-600" />
            <CardTitle className="text-2xl">Beta Playground</CardTitle>
          </div>
          <CardDescription className="text-base">
            Welcome to the Beta Playground! Try out experimental features before they're released to everyone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 p-4 bg-white dark:bg-gray-900 rounded-lg border border-blue-200 dark:border-blue-800">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="space-y-2">
              <p className="text-sm font-medium">Important Information</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Beta features may be unstable or change without notice</li>
                <li>Your feedback helps us improve these features</li>
                <li>Some features may affect app performance</li>
                <li>Data from beta features may not be preserved in final releases</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Beta Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <Card
              key={feature.id}
              className={`transition-all ${feature.enabled ? 'border-2 border-blue-500 shadow-lg' : ''}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${feature.bgColor}`}>
                      <Icon className={`h-5 w-5 ${feature.color}`} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{feature.name}</CardTitle>
                        {getStatusBadge(feature.status)}
                      </div>
                      <CardDescription className="text-sm">
                        {feature.description}
                      </CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={feature.enabled}
                    onCheckedChange={(checked) => updateFeature(feature.id, checked)}
                  />
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      {/* Feedback Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            <CardTitle>Share Your Feedback</CardTitle>
          </div>
          <CardDescription>
            Help us improve by sharing your thoughts on these beta features
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your feedback is crucial for making Meeshy better. Let us know what you think about
            these experimental features, report bugs, or suggest improvements.
          </p>
          <div className="flex gap-2">
            <Button className="flex-1">
              Report a Bug
            </Button>
            <Button variant="outline" className="flex-1">
              Send Feedback
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Your Beta Stats</CardTitle>
          <CardDescription>
            Track your participation in the beta program
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">
                {Object.values(betaFeatures).filter(Boolean).length}
              </p>
              <p className="text-sm text-muted-foreground">Active Features</p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-2xl font-bold text-green-600">12</p>
              <p className="text-sm text-muted-foreground">Feedback Sent</p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-2xl font-bold text-purple-600">5</p>
              <p className="text-sm text-muted-foreground">Bugs Reported</p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-2xl font-bold text-orange-600">45</p>
              <p className="text-sm text-muted-foreground">Days in Beta</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
