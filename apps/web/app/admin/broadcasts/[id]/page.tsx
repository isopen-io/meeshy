'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Send, Trash2, Eye, RefreshCw, AlertTriangle } from 'lucide-react';
import { adminService } from '@/services/admin.service';
import { toast } from 'sonner';
import { StatCardSkeleton } from '@/components/admin/TableSkeleton';

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'DRAFT': return <Badge variant="secondary">Brouillon</Badge>;
    case 'TRANSLATING': return <Badge className="bg-yellow-100 text-yellow-800">Traduction...</Badge>;
    case 'READY': return <Badge className="bg-blue-100 text-blue-800">Pret</Badge>;
    case 'SENDING': return <Badge className="bg-orange-100 text-orange-800">Envoi...</Badge>;
    case 'SENT': return <Badge className="bg-green-100 text-green-800">Envoye</Badge>;
    case 'FAILED': return <Badge className="bg-red-100 text-red-800">Echoue</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
};

export default function BroadcastDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [broadcast, setBroadcast] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedLang, setSelectedLang] = useState<string>('');

  const loadBroadcast = useCallback(async () => {
    try {
      const res = await adminService.getBroadcast(id);
      const data = res.data?.data || res.data;
      if (data) {
        setBroadcast(data);
        // Auto-select the first translation language
        const subjects = data.translatedSubjects || {};
        if (Object.keys(subjects).length > 0 && !selectedLang) {
          setSelectedLang(Object.keys(subjects)[0]);
        }
      }
    } catch (error) {
      console.error('Erreur chargement broadcast:', error);
      toast.error('Erreur lors du chargement du broadcast');
    } finally {
      setLoading(false);
    }
  }, [id, selectedLang]);

  useEffect(() => {
    loadBroadcast();
  }, [loadBroadcast]);

  // Auto-polling during SENDING
  useEffect(() => {
    if (broadcast?.status !== 'SENDING') return;
    const interval = setInterval(async () => {
      try {
        const res = await adminService.getBroadcast(id);
        const data = res.data?.data || res.data;
        if (data) {
          setBroadcast(data);
          if (data.status !== 'SENDING') {
            clearInterval(interval);
          }
        }
      } catch (error) {
        console.error('Erreur polling broadcast:', error);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [broadcast?.status, id]);

  const handleSend = async () => {
    const total = broadcast?.totalRecipients || 0;
    if (!window.confirm(`Envoyer ce broadcast a ${total} destinataire(s) ? Cette action est irreversible.`)) return;
    setSending(true);
    try {
      await adminService.sendBroadcast(id);
      toast.success('Envoi lance');
      // Reload to get updated status
      const res = await adminService.getBroadcast(id);
      const data = res.data?.data || res.data;
      if (data) setBroadcast(data);
    } catch (error) {
      console.error('Erreur envoi broadcast:', error);
      toast.error('Erreur lors de l\'envoi');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Supprimer definitivement ce broadcast ?')) return;
    try {
      await adminService.deleteBroadcast(id);
      toast.success('Broadcast supprime');
      router.push('/admin/broadcasts');
    } catch (error) {
      console.error('Erreur suppression broadcast:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  const handlePreview = async () => {
    try {
      await adminService.previewBroadcast(id);
      toast.success('Traduction lancee');
      loadBroadcast();
    } catch (error) {
      console.error('Erreur preview:', error);
      toast.error('Erreur lors de la previsualisation');
    }
  };

  const handleRetry = async () => {
    try {
      await adminService.sendBroadcast(id);
      toast.success('Nouvel envoi lance');
      loadBroadcast();
    } catch (error) {
      console.error('Erreur retry:', error);
      toast.error('Erreur lors du renvoi');
    }
  };

  if (loading) {
    return (
      <AdminLayout currentPage="/admin/broadcasts">
        <div className="space-y-6 max-w-4xl">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <StatCardSkeleton key={i} />)}
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!broadcast) {
    return (
      <AdminLayout currentPage="/admin/broadcasts">
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Broadcast introuvable</h3>
          <Button onClick={() => router.push('/admin/broadcasts')}>Retour</Button>
        </div>
      </AdminLayout>
    );
  }

  const targeting = broadcast.targeting || {};
  const translatedSubjects = broadcast.translatedSubjects || {};
  const translatedBodies = broadcast.translatedBodies || {};
  const translationLangs = Object.keys(translatedSubjects).filter(l => l !== broadcast.sourceLanguage);
  const recipientsByLanguage = broadcast.recipientsByLanguage || {};
  const progressPercent = broadcast.totalRecipients > 0
    ? Math.round(((broadcast.sentCount || 0) / broadcast.totalRecipients) * 100)
    : 0;

  return (
    <AdminLayout currentPage="/admin/broadcasts">
      <div className="space-y-4 sm:space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              onClick={() => router.push('/admin/broadcasts')}
              className="flex items-center space-x-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-200"
              size="sm"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Retour</span>
            </Button>
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{broadcast.name}</h1>
                {getStatusBadge(broadcast.status)}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{broadcast.subject}</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Total destinataires</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold dark:text-gray-100">{broadcast.totalRecipients ?? '-'}</div>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Envoyes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">{broadcast.sentCount ?? 0}</div>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Echoues</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400">{broadcast.failedCount ?? 0}</div>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Langues cibles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400">{translationLangs.length || '-'}</div>
            </CardContent>
          </Card>
        </div>

        {/* Sending progress bar */}
        {broadcast.status === 'SENDING' && (
          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Progression de l&apos;envoi</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {broadcast.sentCount ?? 0} / {broadcast.totalRecipients ?? 0} ({progressPercent}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center">
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Mise a jour automatique toutes les 3 secondes
              </p>
            </CardContent>
          </Card>
        )}

        {/* SENT summary */}
        {broadcast.status === 'SENT' && (
          <Card className="border-green-200 dark:border-green-800 dark:bg-gray-900">
            <CardContent className="py-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                  <Send className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h3 className="font-medium text-green-800 dark:text-green-300">Envoi termine</h3>
                  <p className="text-sm text-green-600 dark:text-green-400">
                    {broadcast.sentCount ?? 0} emails envoyes avec succes sur {broadcast.totalRecipients ?? 0} destinataires.
                    {(broadcast.failedCount ?? 0) > 0 && ` ${broadcast.failedCount} echecs.`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* FAILED error */}
        {broadcast.status === 'FAILED' && (
          <Card className="border-red-200 dark:border-red-800 dark:bg-gray-900">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-red-800 dark:text-red-300">Envoi echoue</h3>
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {broadcast.error || `${broadcast.failedCount ?? 0} echec(s) sur ${broadcast.totalRecipients ?? 0} destinataires.`}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetry}
                  className="text-red-600 border-red-300 hover:bg-red-50 dark:border-red-700 dark:hover:bg-red-900"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Reessayer
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Targeting summary */}
        <Card className="dark:bg-gray-900 dark:border-gray-800">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg dark:text-gray-100">Ciblage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Activite:</span>
              <Badge variant="outline" className="dark:border-gray-700 dark:text-gray-300">
                {targeting.activityStatus === 'all' && 'Tous'}
                {targeting.activityStatus === 'active' && 'Actifs seulement'}
                {targeting.activityStatus === 'inactive' && `Inactifs depuis ${targeting.inactiveDays || '?'} jours`}
                {!targeting.activityStatus && 'Tous'}
              </Badge>
            </div>

            {targeting.languages && targeting.languages.length > 0 && (
              <div className="flex items-start space-x-2">
                <span className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">Langues:</span>
                <div className="flex flex-wrap gap-1">
                  {targeting.languages.map((lang: string) => (
                    <Badge key={lang} variant="secondary" className="text-xs">{lang}</Badge>
                  ))}
                </div>
              </div>
            )}

            {targeting.countries && targeting.countries.length > 0 && (
              <div className="flex items-start space-x-2">
                <span className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">Pays:</span>
                <div className="flex flex-wrap gap-1">
                  {targeting.countries.map((country: string) => (
                    <Badge key={country} variant="secondary" className="text-xs">{country}</Badge>
                  ))}
                </div>
              </div>
            )}

            {(!targeting.languages || targeting.languages.length === 0) && (!targeting.countries || targeting.countries.length === 0) && (
              <p className="text-sm text-gray-500 dark:text-gray-400">Aucun filtre de langue ou pays - envoi a tous</p>
            )}
          </CardContent>
        </Card>

        {/* Recipients by language */}
        {Object.keys(recipientsByLanguage).length > 0 && (
          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg dark:text-gray-100">Destinataires par langue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(recipientsByLanguage).map(([lang, count]) => (
                  <div key={lang} className="flex items-center justify-between py-1 border-b dark:border-gray-700 last:border-0">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 uppercase">{lang}</span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">{count as number} destinataire(s)</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Translations preview */}
        {translationLangs.length > 0 && (
          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg dark:text-gray-100">Traductions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Language tabs */}
              <div className="flex flex-wrap gap-2 border-b dark:border-gray-700 pb-3">
                {translationLangs.map((lang) => (
                  <Button
                    key={lang}
                    variant={selectedLang === lang ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedLang(lang)}
                    className={selectedLang !== lang ? 'dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300' : ''}
                  >
                    {lang.toUpperCase()}
                  </Button>
                ))}
              </div>

              {/* Selected translation content */}
              {selectedLang && translatedSubjects[selectedLang] && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Sujet</label>
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md text-sm text-gray-900 dark:text-gray-100">
                      {translatedSubjects[selectedLang] || '-'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Corps</label>
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap max-h-96 overflow-y-auto">
                      {translatedBodies[selectedLang] || '-'}
                    </div>
                  </div>
                </div>
              )}

              {translationLangs.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">Aucune traduction disponible. Lancez la previsualisation pour generer les traductions.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Original content (always show) */}
        <Card className="dark:bg-gray-900 dark:border-gray-800">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg dark:text-gray-100">
              Contenu original ({broadcast.sourceLanguage || 'N/A'})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Sujet</label>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md text-sm text-gray-900 dark:text-gray-100">
                {broadcast.subject || '-'}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Corps</label>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap max-h-96 overflow-y-auto">
                {broadcast.body || '-'}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Conditional actions */}
        <div className="flex flex-col sm:flex-row gap-3 sm:justify-end pb-6">
          {broadcast.status === 'DRAFT' && (
            <>
              <Button
                variant="outline"
                onClick={handlePreview}
                className="flex items-center space-x-2 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-200"
              >
                <Eye className="h-4 w-4" />
                <span>Previsualiser & Traduire</span>
              </Button>
              <Button
                variant="outline"
                onClick={handleDelete}
                className="flex items-center space-x-2 text-red-600 border-red-300 hover:bg-red-50 dark:border-red-700 dark:hover:bg-red-900"
              >
                <Trash2 className="h-4 w-4" />
                <span>Supprimer</span>
              </Button>
            </>
          )}

          {broadcast.status === 'READY' && (
            <>
              <Button
                onClick={handleSend}
                disabled={sending}
                className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white"
              >
                <Send className="h-4 w-4" />
                <span>{sending ? 'Envoi...' : `Envoyer a ${broadcast.totalRecipients ?? 0} destinataire(s)`}</span>
              </Button>
              <Button
                variant="outline"
                onClick={handleDelete}
                className="flex items-center space-x-2 text-red-600 border-red-300 hover:bg-red-50 dark:border-red-700 dark:hover:bg-red-900"
              >
                <Trash2 className="h-4 w-4" />
                <span>Supprimer</span>
              </Button>
            </>
          )}

          {broadcast.status === 'TRANSLATING' && (
            <Button
              variant="outline"
              disabled
              className="flex items-center space-x-2"
            >
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Traduction en cours...</span>
            </Button>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
