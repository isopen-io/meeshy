'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Search,
  Plus,
  Copy,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  MousePointerClick,
  Users,
  CheckCircle,
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  X,
  Loader2,
  Info
} from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { apiService } from '@/services/api.service';
import { toast } from 'sonner';

interface TrackingLinkAdmin {
  id: string;
  token: string;
  name?: string;
  originalUrl: string;
  shortUrl: string;
  campaign?: string;
  source?: string;
  medium?: string;
  totalClicks: number;
  uniqueClicks: number;
  isActive: boolean;
  expiresAt?: string;
  createdAt: string;
  lastClickedAt?: string;
  creator?: {
    id: string;
    username: string;
    displayName?: string;
    avatar?: string;
  };
}

interface TrackingClick {
  id: string;
  ipAddress?: string;
  country?: string;
  city?: string;
  region?: string;
  browser?: string;
  os?: string;
  device?: string;
  referrer?: string;
  socialSource?: string;
  redirectStatus?: string;
  clickedAt: string;
  language?: string;
  timezone?: string;
  screenResolution?: string;
  connectionType?: string;
}

export default function AdminTrackingLinksPage() {
  // -- Creation form state --
  const [formUrl, setFormUrl] = useState('');
  const [formToken, setFormToken] = useState('');
  const [formName, setFormName] = useState('');
  const [formCampaign, setFormCampaign] = useState('');
  const [formSource, setFormSource] = useState('');
  const [formMedium, setFormMedium] = useState('');
  const [tokenAvailable, setTokenAvailable] = useState<boolean | null>(null);
  const [tokenChecking, setTokenChecking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  // -- List state --
  const [links, setLinks] = useState<TrackingLinkAdmin[]>([]);
  const [linksTotal, setLinksTotal] = useState(0);
  const [linksPage, setLinksPage] = useState(1);
  const [linksSearch, setLinksSearch] = useState('');
  const [linksLoading, setLinksLoading] = useState(true);
  const pageSize = 20;

  // -- Detail state --
  const [selectedLink, setSelectedLink] = useState<TrackingLinkAdmin | null>(null);
  const [clicks, setClicks] = useState<TrackingClick[]>([]);
  const [clicksTotal, setClicksTotal] = useState(0);
  const [clicksPage, setClicksPage] = useState(1);
  const [clicksLoading, setClicksLoading] = useState(false);
  const clicksPageSize = 50;

  // -- Load links --
  const loadLinks = useCallback(async () => {
    try {
      setLinksLoading(true);
      const offset = (linksPage - 1) * pageSize;
      const params: Record<string, unknown> = { limit: pageSize, offset };
      if (linksSearch) params.search = linksSearch;

      const response = await apiService.get<any>(
        '/tracking-links/admin/all',
        params
      );

      if (response.data) {
        setLinks(response.data.trackingLinks || []);
        setLinksTotal(response.data.total || 0);
      }
    } catch (error) {
      console.error('Error loading tracking links:', error);
      toast.error('Erreur lors du chargement des liens');
    } finally {
      setLinksLoading(false);
    }
  }, [linksPage, linksSearch]);

  useEffect(() => { loadLinks(); }, [loadLinks]);

  // -- Check token availability (debounced) --
  useEffect(() => {
    if (!formToken || formToken.length < 2) {
      setTokenAvailable(null);
      return;
    }

    if (!/^[a-zA-Z0-9_-]{2,50}$/.test(formToken)) {
      setTokenAvailable(false);
      return;
    }

    const timer = setTimeout(async () => {
      setTokenChecking(true);
      try {
        const response = await apiService.get<{ token: string; available: boolean }>(
          `/tracking-links/check-token/${formToken}`
        );
        setTokenAvailable(response.data?.available ?? null);
      } catch {
        setTokenAvailable(null);
      } finally {
        setTokenChecking(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [formToken]);

  // -- Create link --
  const handleCreate = async () => {
    if (!formUrl) return;
    if (formToken && tokenAvailable === false) return;

    setCreating(true);
    try {
      const payload: Record<string, unknown> = {
        originalUrl: formUrl,
      };
      if (formToken) payload.customToken = formToken;
      if (formName) payload.name = formName;
      if (formCampaign) payload.campaign = formCampaign;
      if (formSource) payload.source = formSource;
      if (formMedium) payload.medium = formMedium;

      const response = await apiService.post<{ trackingLink: TrackingLinkAdmin }>('/tracking-links', payload);

      if (response.data?.trackingLink) {
        const frontendUrl = window.location.origin;
        setCreatedLink(`${frontendUrl}/l/${response.data.trackingLink.token}`);
        toast.success('Lien cree avec succes');
        setFormUrl('');
        setFormToken('');
        setFormName('');
        setFormCampaign('');
        setFormSource('');
        setFormMedium('');
        setTokenAvailable(null);
        loadLinks();
      }
    } catch (error: any) {
      if (error?.response?.status === 409) {
        toast.error('Ce token existe deja');
      } else {
        toast.error('Erreur lors de la creation du lien');
      }
    } finally {
      setCreating(false);
    }
  };

  // -- Load clicks for a link --
  const loadClicks = useCallback(async (token: string) => {
    setClicksLoading(true);
    try {
      const offset = (clicksPage - 1) * clicksPageSize;
      const response = await apiService.get<any>(
        `/tracking-links/admin/${token}/clicks`,
        { limit: clicksPageSize, offset }
      );
      if (response.data) {
        setClicks(response.data.clicks || []);
        setClicksTotal(response.data.total || 0);
      }
    } catch (error) {
      console.error('Error loading clicks:', error);
      toast.error('Erreur lors du chargement des clics');
    } finally {
      setClicksLoading(false);
    }
  }, [clicksPage]);

  const openDetail = (link: TrackingLinkAdmin) => {
    setSelectedLink(link);
    setClicksPage(1);
    setClicks([]);
    setClicksTotal(0);
  };

  useEffect(() => {
    if (selectedLink) {
      loadClicks(selectedLink.token);
    }
  }, [selectedLink, loadClicks]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copie dans le presse-papiers');
  };

  const getDeviceIcon = (device?: string) => {
    switch (device) {
      case 'mobile': return <Smartphone className="w-4 h-4" />;
      case 'tablet': return <Tablet className="w-4 h-4" />;
      default: return <Monitor className="w-4 h-4" />;
    }
  };

  const totalPages = Math.ceil(linksTotal / pageSize);
  const clicksTotalPages = Math.ceil(clicksTotal / clicksPageSize);

  return (
    <AdminLayout currentPage="/admin/tracking-links">
      <div className="space-y-6">

        {/* Section 1: Creation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Creer un tracking link
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Champs principaux */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="formUrl">URL destination *</Label>
                <Input
                  id="formUrl"
                  placeholder="https://example.com/page"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="formToken" className="flex items-center gap-1">
                  Token custom
                  <Tooltip>
                    <TooltipTrigger asChild><Info className="w-3.5 h-3.5 text-gray-400 cursor-help" /></TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px]">Personnalise le slug du lien (/l/ton-token). Si vide, un token aleatoire sera genere.</TooltipContent>
                  </Tooltip>
                </Label>
                <div className="relative">
                  <Input
                    id="formToken"
                    placeholder="mon-slug"
                    value={formToken}
                    onChange={(e) => setFormToken(e.target.value)}
                    className={
                      tokenAvailable === true ? 'border-green-500 pr-8' :
                      tokenAvailable === false ? 'border-red-500 pr-8' : 'pr-8'
                    }
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    {tokenChecking && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                    {!tokenChecking && tokenAvailable === true && <CheckCircle className="w-4 h-4 text-green-500" />}
                    {!tokenChecking && tokenAvailable === false && <X className="w-4 h-4 text-red-500" />}
                  </div>
                </div>
                {formToken && tokenAvailable === false && (
                  <p className="text-xs text-red-500 mt-1">Token indisponible ou format invalide</p>
                )}
                {formToken && tokenAvailable === true && (
                  <p className="text-xs text-green-500 mt-1">Disponible → /l/{formToken}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="formName" className="flex items-center gap-1">
                  Nom
                  <Tooltip>
                    <TooltipTrigger asChild><Info className="w-3.5 h-3.5 text-gray-400 cursor-help" /></TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px]">Label interne pour retrouver ce lien rapidement dans la liste. Non visible par les visiteurs.</TooltipContent>
                  </Tooltip>
                </Label>
                <Input
                  id="formName"
                  placeholder="Promo ete"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  maxLength={32}
                />
              </div>
            </div>

            {/* Parametres UTM */}
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Parametres UTM</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="formCampaign" className="flex items-center gap-1">
                    Campagne
                    <Tooltip>
                      <TooltipTrigger asChild><Info className="w-3.5 h-3.5 text-gray-400 cursor-help" /></TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[260px]">Regroupe les clics sous une meme operation marketing. Permet de comparer les performances entre campagnes.</TooltipContent>
                    </Tooltip>
                  </Label>
                  <Input
                    id="formCampaign"
                    placeholder="summer-2026"
                    value={formCampaign}
                    onChange={(e) => setFormCampaign(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="formSource" className="flex items-center gap-1">
                    Source
                    <Tooltip>
                      <TooltipTrigger asChild><Info className="w-3.5 h-3.5 text-gray-400 cursor-help" /></TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[260px]">Identifie la plateforme d'origine du visiteur. Sert a savoir quel canal genere le plus de trafic.</TooltipContent>
                    </Tooltip>
                  </Label>
                  <Input
                    id="formSource"
                    placeholder="tiktok"
                    value={formSource}
                    onChange={(e) => setFormSource(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="formMedium" className="flex items-center gap-1">
                    Medium
                    <Tooltip>
                      <TooltipTrigger asChild><Info className="w-3.5 h-3.5 text-gray-400 cursor-help" /></TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[260px]">Categorise le type de canal (social, email, bio, paid...). Permet d'analyser quels types de diffusion convertissent le mieux.</TooltipContent>
                    </Tooltip>
                  </Label>
                  <Input
                    id="formMedium"
                    placeholder="social"
                    value={formMedium}
                    onChange={(e) => setFormMedium(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Button
                onClick={handleCreate}
                disabled={!formUrl || (formToken.length > 0 && formToken.length < 2) || (formToken && tokenAvailable === false) || creating}
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                Creer le lien
              </Button>

              {createdLink && (
                <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md px-3 py-2">
                  <span className="text-sm font-mono text-green-700 dark:text-green-300">{createdLink}</span>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(createdLink)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Link List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <MousePointerClick className="w-5 h-5" />
                Tous les tracking links ({linksTotal})
              </CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Rechercher..."
                  value={linksSearch}
                  onChange={(e) => {
                    setLinksSearch(e.target.value);
                    setLinksPage(1);
                  }}
                  className="pl-8"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {linksLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : links.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Aucun tracking link</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="pb-2 pr-4">Token</th>
                        <th className="pb-2 pr-4">URL</th>
                        <th className="pb-2 pr-4">Nom</th>
                        <th className="pb-2 pr-4 text-center">Clics</th>
                        <th className="pb-2 pr-4 text-center">Uniques</th>
                        <th className="pb-2 pr-4">Statut</th>
                        <th className="pb-2 pr-4">Createur</th>
                        <th className="pb-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {links.map((link) => (
                        <tr
                          key={link.id}
                          className="border-b hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                          onClick={() => openDetail(link)}
                        >
                          <td className="py-2 pr-4">
                            <div className="flex items-center gap-1">
                              <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono">
                                {link.token}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(`${window.location.origin}/l/${link.token}`);
                                }}
                              >
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                          </td>
                          <td className="py-2 pr-4 max-w-[200px] truncate text-xs text-gray-600 dark:text-gray-400">
                            <a
                              href={link.originalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="hover:underline flex items-center gap-1"
                            >
                              {link.originalUrl.replace(/^https?:\/\//, '').slice(0, 40)}
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          </td>
                          <td className="py-2 pr-4 text-xs">{link.name || '-'}</td>
                          <td className="py-2 pr-4 text-center font-medium">{link.totalClicks}</td>
                          <td className="py-2 pr-4 text-center">{link.uniqueClicks}</td>
                          <td className="py-2 pr-4">
                            <Badge variant={link.isActive ? 'default' : 'secondary'} className="text-xs">
                              {link.isActive ? 'Actif' : 'Inactif'}
                            </Badge>
                          </td>
                          <td className="py-2 pr-4 text-xs">
                            {link.creator?.displayName || link.creator?.username || '-'}
                          </td>
                          <td className="py-2 text-xs text-gray-500">{formatDate(link.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-sm text-gray-500">
                      {((linksPage - 1) * pageSize) + 1}-{Math.min(linksPage * pageSize, linksTotal)} sur {linksTotal}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={linksPage <= 1}
                        onClick={() => setLinksPage(p => p - 1)}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm">{linksPage} / {totalPages}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={linksPage >= totalPages}
                        onClick={() => setLinksPage(p => p + 1)}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Section 3: Detail view */}
        {selectedLink && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Detail: /l/{selectedLink.token}
                  {selectedLink.name && <span className="text-gray-500 font-normal">({selectedLink.name})</span>}
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setSelectedLink(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Stats summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                  <MousePointerClick className="w-5 h-5 mx-auto mb-1 text-blue-500" />
                  <div className="text-2xl font-bold">{selectedLink.totalClicks}</div>
                  <div className="text-xs text-gray-500">Total clics</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                  <Users className="w-5 h-5 mx-auto mb-1 text-green-500" />
                  <div className="text-2xl font-bold">{selectedLink.uniqueClicks}</div>
                  <div className="text-xs text-gray-500">Uniques</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                  <CheckCircle className="w-5 h-5 mx-auto mb-1 text-purple-500" />
                  <div className="text-2xl font-bold">
                    {clicks.filter(c => c.redirectStatus === 'confirmed').length}
                  </div>
                  <div className="text-xs text-gray-500">Confirmes</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                  <CheckCircle className="w-5 h-5 mx-auto mb-1 text-orange-500" />
                  <div className="text-2xl font-bold">
                    {selectedLink.totalClicks > 0
                      ? Math.round((selectedLink.uniqueClicks / selectedLink.totalClicks) * 100)
                      : 0}%
                  </div>
                  <div className="text-xs text-gray-500">Taux unique</div>
                </div>
              </div>

              {/* Clicks table */}
              <h3 className="font-semibold mb-2 text-sm">Derniers clics</h3>
              {clicksLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : clicks.length === 0 ? (
                <p className="text-center text-gray-500 py-4 text-sm">Aucun clic enregistre</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-left text-gray-500">
                          <th className="pb-2 pr-3">Date</th>
                          <th className="pb-2 pr-3">Pays</th>
                          <th className="pb-2 pr-3">Ville</th>
                          <th className="pb-2 pr-3">Device</th>
                          <th className="pb-2 pr-3">Browser</th>
                          <th className="pb-2 pr-3">OS</th>
                          <th className="pb-2 pr-3">Referrer</th>
                          <th className="pb-2 pr-3">Source</th>
                          <th className="pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clicks.map((click) => (
                          <tr key={click.id} className="border-b">
                            <td className="py-1.5 pr-3 whitespace-nowrap">{formatDate(click.clickedAt)}</td>
                            <td className="py-1.5 pr-3">{click.country || '-'}</td>
                            <td className="py-1.5 pr-3">{click.city || '-'}</td>
                            <td className="py-1.5 pr-3">
                              <div className="flex items-center gap-1">
                                {getDeviceIcon(click.device)}
                                {click.device || '-'}
                              </div>
                            </td>
                            <td className="py-1.5 pr-3">{click.browser || '-'}</td>
                            <td className="py-1.5 pr-3">{click.os || '-'}</td>
                            <td className="py-1.5 pr-3 max-w-[150px] truncate">
                              {click.referrer ? click.referrer.replace(/^https?:\/\//, '').slice(0, 30) : '-'}
                            </td>
                            <td className="py-1.5 pr-3">{click.socialSource || '-'}</td>
                            <td className="py-1.5">
                              {click.redirectStatus === 'confirmed' ? (
                                <Badge variant="default" className="text-[10px] px-1.5 py-0">OK</Badge>
                              ) : click.redirectStatus === 'failed' ? (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Fail</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">-</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Clicks pagination */}
                  {clicksTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-gray-500">
                        {((clicksPage - 1) * clicksPageSize) + 1}-{Math.min(clicksPage * clicksPageSize, clicksTotal)} sur {clicksTotal}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={clicksPage <= 1}
                          onClick={() => setClicksPage(p => p - 1)}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="text-xs">{clicksPage} / {clicksTotalPages}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={clicksPage >= clicksTotalPages}
                          onClick={() => setClicksPage(p => p + 1)}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
