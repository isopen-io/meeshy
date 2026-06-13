'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, ArrowLeft, Search, Filter, Calendar, User, Globe, FileText, Image, Video, Music, MapPin } from 'lucide-react';
import { adminService } from '@/services/admin.service';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/use-i18n';

interface Message {
  id: string;
  content: string;
  messageType: string;
  originalLanguage: string;
  isEdited: boolean;
  createdAt: string;
  sender?: {
    id: string;
    username: string;
    displayName?: string;
    avatar?: string;
  };
  conversation: {
    id: string;
    identifier?: string;
    title?: string;
    type: string;
  };
  _count: {
    translations: number;
    replies: number;
  };
  attachments?: Array<{
    id: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    duration?: number;
    fps?: number;
    pageCount?: number;
    lineCount?: number;
    width?: number;
    height?: number;
    bitrate?: number;
    sampleRate?: number;
    codec?: string;
    channels?: number;
    videoCodec?: string;
  }>;
}

export default function AdminMessagesPage() {
  const router = useRouter();
  const { t, locale } = useI18n('admin');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [messageType, setMessageType] = useState('');
  const [period, setPeriod] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const messageTypeIcons = {
    text: <FileText className="h-4 w-4" />,
    image: <Image className="h-4 w-4" />,
    file: <FileText className="h-4 w-4" />,
    audio: <Music className="h-4 w-4" />,
    video: <Video className="h-4 w-4" />,
    location: <MapPin className="h-4 w-4" />,
    system: <Globe className="h-4 w-4" />
  };

  const messageTypeLabels = {
    text: t('messages.typeText'),
    image: t('messages.typeImage'),
    file: t('messages.typeFile'),
    audio: t('messages.typeAudio'),
    video: t('messages.typeVideo'),
    location: t('messages.typeLocation'),
    system: t('messages.typeSystem')
  };

  useEffect(() => {
    loadMessages();
  }, [currentPage, searchTerm, messageType, period, pageSize]);

  const loadMessages = async () => {
    try {
      setLoading(true);
      const offset = (currentPage - 1) * pageSize;
      const response = await adminService.getMessages(
        offset,
        pageSize,
        searchTerm || undefined,
        messageType || undefined,
        period || undefined
      );

      if (response.data) {
        setMessages(response.data.messages || []);
        setTotalCount(response.data.pagination?.total || 0);
        setTotalPages(Math.ceil((response.data.pagination?.total || 0) / pageSize));
      } else {
        setMessages([]);
        setTotalCount(0);
        setTotalPages(1);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des messages:', error);
      toast.error(t('messages.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleFilterChange = (filterType: string, value: string) => {
    if (filterType === 'type') {
      setMessageType(value === 'all' ? '' : value);
    } else if (filterType === 'period') {
      setPeriod(value === 'all' ? '' : value);
    }
    setCurrentPage(1);
  };

  const handlePageSizeChange = (newSize: number) => {
    setCurrentPage(1);
    setPageSize(newSize);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getMessageTypeColor = (type: string) => {
    const colors = {
      text: 'bg-blue-100 text-blue-800',
      image: 'bg-green-100 text-green-800',
      file: 'bg-gray-100 text-gray-800',
      audio: 'bg-purple-100 text-purple-800',
      video: 'bg-red-100 text-red-800',
      location: 'bg-yellow-100 text-yellow-800',
      system: 'bg-orange-100 text-orange-800'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <AdminLayout currentPage="/admin/messages">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2">{t('messages.loading')}</span>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout currentPage="/admin/messages">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button 
              variant="outline" 
              onClick={() => router.push('/admin')}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>{t('messages.backButton')}</span>
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('messages.pageTitle')}</h1>
              <p className="text-gray-600">{t('messages.pageSubtitle')}</p>
            </div>
          </div>
        </div>

        {/* Filtres */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Filter className="h-5 w-5" />
              <span>{t('messages.filtersTitle')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('messages.searchLabel')}</label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder={t('messages.searchPlaceholder')}
                    value={searchTerm}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('messages.typeLabel')}</label>
                <Select value={messageType || 'all'} onValueChange={(value) => handleFilterChange('type', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('messages.typeAll')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('messages.typeAll')}</SelectItem>
                    <SelectItem value="text">{t('messages.typeText')}</SelectItem>
                    <SelectItem value="image">{t('messages.typeImage')}</SelectItem>
                    <SelectItem value="file">{t('messages.typeFile')}</SelectItem>
                    <SelectItem value="audio">{t('messages.typeAudio')}</SelectItem>
                    <SelectItem value="video">{t('messages.typeVideo')}</SelectItem>
                    <SelectItem value="location">{t('messages.typeLocation')}</SelectItem>
                    <SelectItem value="system">{t('messages.typeSystem')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('messages.periodLabel')}</label>
                <Select value={period || 'all'} onValueChange={(value) => handleFilterChange('period', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('messages.periodAll')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('messages.periodAll')}</SelectItem>
                    <SelectItem value="today">{t('messages.periodToday')}</SelectItem>
                    <SelectItem value="week">{t('messages.periodWeek')}</SelectItem>
                    <SelectItem value="month">{t('messages.periodMonth')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('messages.perPageLabel')}</label>
                <Select value={String(pageSize)} onValueChange={(val) => handlePageSizeChange(Number(val))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">{t('messages.perPage', { count: 20 })}</SelectItem>
                    <SelectItem value="50">{t('messages.perPage', { count: 50 })}</SelectItem>
                    <SelectItem value="100">{t('messages.perPage', { count: 100 })}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('messages.actionsLabel')}</label>
                <Button
                  variant="outline"
                  onClick={loadMessages}
                  className="w-full"
                >
                  {t('messages.refresh')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistiques */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t('messages.statTotal')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCount}</div>
              <Badge variant="outline" className="mt-1">{t('messages.statTotalBadge')}</Badge>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t('messages.statCurrentPage')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{currentPage}</div>
              <Badge variant="outline" className="mt-1">{t('messages.statOf', { total: totalPages })}</Badge>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t('messages.statPerPage')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">20</div>
              <Badge variant="outline" className="mt-1">{t('messages.statDefault')}</Badge>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t('messages.statActiveFilters')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {[searchTerm, messageType, period].filter(Boolean).length}
              </div>
              <Badge variant="outline" className="mt-1">{t('messages.statFiltersBadge')}</Badge>
            </CardContent>
          </Card>
        </div>

        {/* Liste des messages */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <MessageSquare className="h-5 w-5" />
              <span>{t('messages.listTitle', { count: totalCount })}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
{t('messages.emptyTitle')}
                </h3>
                <p className="text-gray-600">
{t('messages.emptySubtitle')}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div key={message.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <Badge className={getMessageTypeColor(message.messageType)}>
                            {messageTypeIcons[message.messageType as keyof typeof messageTypeIcons]}
                            <span className="ml-1">
                              {messageTypeLabels[message.messageType as keyof typeof messageTypeLabels]}
                            </span>
                          </Badge>
                          <Badge variant="outline">
                            {message.originalLanguage.toUpperCase()}
                          </Badge>
                          {message.isEdited && (
                            <Badge variant="secondary">{t('messages.badgeEdited')}</Badge>
                          )}
                        </div>

                        <div className="mb-3">
                          <p className="text-gray-900 line-clamp-3">
                            {message.content}
                          </p>
                        </div>

                        {/* Attachments */}
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <p className="text-sm font-medium text-gray-700 mb-2">
{t('messages.attachmentsLabel', { count: message.attachments.length })}
                            </p>
                            <div className="space-y-2">
                              {message.attachments.map((att) => (
                                <div key={att.id} className="flex items-start space-x-2 text-sm">
                                  <div className="flex-1">
                                    <p className="font-medium text-gray-900">{att.originalName}</p>
                                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                                      <span>{att.mimeType}</span>
                                      <span>{(att.fileSize / 1024).toFixed(2)} KB</span>
                                      {att.duration && (
                                        <span>⏱️ {Math.floor(att.duration / 60)}:{(att.duration % 60).toString().padStart(2, '0')}</span>
                                      )}
                                      {att.width && att.height && (
                                        <span>📐 {att.width}×{att.height}</span>
                                      )}
                                      {att.fps && (
                                        <span>🎬 {att.fps}fps</span>
                                      )}
                                      {att.pageCount && (
                                        <span>📄 {att.pageCount} {att.pageCount > 1 ? t('messages.pagePlural') : t('messages.pageSingular')}</span>
                                      )}
                                      {att.lineCount && (
                                        <span>📝 {att.lineCount} {att.lineCount > 1 ? t('messages.linePlural') : t('messages.lineSingular')}</span>
                                      )}
                                      {att.bitrate && (
                                        <span>🎵 {Math.floor(att.bitrate / 1000)}kbps</span>
                                      )}
                                      {att.sampleRate && (
                                        <span>{(att.sampleRate / 1000).toFixed(1)}kHz</span>
                                      )}
                                      {att.codec && (
                                        <span>codec: {att.codec}</span>
                                      )}
                                      {att.channels && (
                                        <span>{att.channels === 1 ? 'Mono' : att.channels === 2 ? 'Stereo' : `${att.channels}ch`}</span>
                                      )}
                                      {att.videoCodec && (
                                        <span>video: {att.videoCodec}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center space-x-4 text-sm text-gray-600">
                          <div className="flex items-center space-x-1">
                            <User className="h-4 w-4" />
                            <span>
                              {message.sender?.displayName || message.sender?.username || 'Unknown'}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Globe className="h-4 w-4" />
                            <span>
                              {message.conversation.title || message.conversation.identifier || 'Conversation'}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Calendar className="h-4 w-4" />
                            <span>{formatDate(message.createdAt)}</span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                          {message._count.translations > 0 && (
                            <span>{t('messages.translationCount', { count: message._count.translations })}</span>
                          )}
                          {message._count.replies > 0 && (
                            <span>{t('messages.replyCount', { count: message._count.replies })}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex space-x-2 ml-4">
                        <Button variant="outline" size="sm">
                          {t('messages.actionView')}
                        </Button>
                        <Button variant="outline" size="sm">
                          {t('messages.actionModerate')}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <div className="text-sm text-gray-600">
                  {t('messages.paginationInfo', { page: currentPage, total: totalPages, count: totalCount })}
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    {t('messages.prevPage')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                  >
                    {t('messages.nextPage')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
