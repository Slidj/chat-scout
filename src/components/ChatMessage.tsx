import { memo, useEffect, useState } from 'react';
import {
  Copy, Check, Share2, Volume2, ThumbsUp, ThumbsDown, RotateCcw,
  AlertTriangle, Globe, FileText, Download, Maximize2, X, Film,
  Image as ImageIcon, AlertCircle
} from 'lucide-react';
import { Message } from '../lib/api';
import { MediaAttachment } from '../types';
import { downloadMediaAsset, getTempMediaObjectUrl } from '../lib/mediaCache';
import { MarkdownContent } from './MarkdownContent';

interface ChatMessageProps {
  message: Message;
  onRetry?: () => void;
  isLast?: boolean;
  isTyping?: boolean;
  onSkipTyping?: () => void;
  toolStatus?: string | null;
}

function ResolvedMediaCard({
  item,
  onExpandImage
}: {
  item: MediaAttachment;
  onExpandImage: (src: string, item: MediaAttachment) => void;
}) {
  const [resolvedSrc, setResolvedSrc] = useState<string>(item.url || '');
  const [status, setStatus] = useState<'loading' | 'ready' | 'expired'>(
    item.localRef ? 'loading' : item.url ? 'ready' : 'expired'
  );

  useEffect(() => {
    let active = true;
    async function resolve() {
      if (item.localRef) {
        const localUrl = await getTempMediaObjectUrl(item.localRef);
        if (!active) return;
        if (localUrl) {
          setResolvedSrc(localUrl);
          setStatus('ready');
          return;
        }
      }
      if (item.url) {
        if (!active) return;
        setResolvedSrc(item.url);
        setStatus('ready');
      } else {
        if (!active) return;
        setResolvedSrc('');
        setStatus('expired');
      }
    }
    resolve();
    return () => {
      active = false;
    };
  }, [item.localRef, item.url]);

  if (status === 'loading') {
    return (
      <div className="w-full max-w-md h-52 rounded-2xl bg-[#22211E] border border-[#35332E] flex items-center justify-center gap-2 text-xs text-[#9E9A92] animate-pulse">
        {item.type === 'video' ? <Film size={16} /> : <ImageIcon size={16} />}
        <span>Завантаження медіа...</span>
      </div>
    );
  }

  if (status === 'expired' || !resolvedSrc) {
    return (
      <div className="w-full max-w-md rounded-2xl bg-[#22201C] border border-[#3C3831] p-4 flex items-start gap-3 text-xs text-[#9E9A92]">
        <AlertCircle size={17} className="text-[#CC785C] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-medium text-[#DED8CD]">
            {item.type === 'video' ? 'Відео тимчасово недоступне' : 'Зображення недоступне'}
          </div>
          <p className="leading-relaxed text-[11.5px] text-[#8A867E]">
            Термін тимчасового зберігання минув (3 дні) або зовнішнє посилання провайдера вже застаріло. Ви можете повторити генерацію.
          </p>
        </div>
      </div>
    );
  }

  if (item.type === 'video') {
    const filename = `scout-video-${item.id}.mp4`;
    return (
      <div className="w-full max-w-lg rounded-2xl bg-[#1F1E1B] border border-[#35332E] overflow-hidden shadow-lg">
        <video
          src={resolvedSrc}
          controls
          playsInline
          preload="metadata"
          onError={() => setStatus('expired')}
          className="w-full max-h-[420px] bg-black block"
        />
        <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 bg-[#23221E] border-t border-[#32302B]">
          <div className="flex items-center gap-2 text-xs text-[#C8C3B8] min-w-0">
            <Film size={14} className="text-[#CC785C] shrink-0" />
            <span className="truncate font-medium">Згенероване відео (тимчасово)</span>
          </div>
          <button
            type="button"
            onClick={() => downloadMediaAsset(resolvedSrc, filename)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#2E2C28] hover:bg-[#3A3732] text-[#ECE8E1] text-xs font-medium transition-colors shrink-0 active:scale-95"
          >
            <Download size={13} />
            <span>Зберегти</span>
          </button>
        </div>
      </div>
    );
  }

  const filename = `scout-image-${item.id}.png`;
  return (
    <div className="w-full max-w-md rounded-2xl bg-[#1F1E1B] border border-[#35332E] overflow-hidden shadow-lg group/media">
      <div className="relative bg-[#151412]">
        <img
          src={resolvedSrc}
          alt={item.prompt || 'Згенероване зображення'}
          onClick={() => onExpandImage(resolvedSrc, item)}
          onError={() => setStatus('expired')}
          className="w-full max-h-[440px] object-contain cursor-zoom-in block mx-auto"
          loading="lazy"
        />
        <button
          type="button"
          onClick={() => onExpandImage(resolvedSrc, item)}
          className="absolute top-2.5 right-2.5 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-xs opacity-85 sm:opacity-0 group-hover/media:opacity-100 transition-opacity"
          title="Відкрити на весь екран"
        >
          <Maximize2 size={14} />
        </button>
      </div>
      <div className="px-3.5 py-2 flex items-center justify-between gap-2 bg-[#23221E] border-t border-[#32302B]">
        <div className="flex items-center gap-2 text-xs text-[#C8C3B8] min-w-0">
          <ImageIcon size={14} className="text-[#CC785C] shrink-0" />
          <span className="truncate font-medium">Згенероване зображення</span>
        </div>
        <button
          type="button"
          onClick={() => downloadMediaAsset(resolvedSrc, filename)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#2E2C28] hover:bg-[#3A3732] text-[#ECE8E1] text-xs font-medium transition-colors shrink-0 active:scale-95"
        >
          <Download size={13} />
          <span>Зберегти</span>
        </button>
      </div>
    </div>
  );
}

export const ChatMessage = memo(function ChatMessage({ message, onRetry, isLast, isTyping, onSkipTyping, toolStatus }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [lightboxMedia, setLightboxMedia] = useState<{ src: string; item: MediaAttachment } | null>(null);

  const handleCopy = () => {
    const fallbackText = message.text || message.mediaItems?.[0]?.url || '';
    navigator.clipboard.writeText(fallbackText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSpeak = () => {
    if ('speechSynthesis' in window && message.text.trim()) {
      if (isPlayingAudio) {
        window.speechSynthesis.cancel();
        setIsPlayingAudio(false);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(message.text);
      utterance.onend = () => setIsPlayingAudio(false);
      utterance.onerror = () => setIsPlayingAudio(false);
      setIsPlayingAudio(true);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleShare = async () => {
    const shareText = message.text || message.mediaItems?.[0]?.url || '';
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Відповідь ШІ',
          text: shareText,
        });
      } catch {}
    } else {
      handleCopy();
    }
  };

  if (isUser) {
    return (
      <div className="flex w-full justify-end mb-6 animate-in fade-in slide-in-from-bottom-2 duration-200 group">
        <div className="relative max-w-[85%] bg-[#2F2E2B] border border-[#3F3D38] text-[#F2EFEB] px-5 py-3.5 rounded-[22px] shadow-xs">
          <div className="whitespace-pre-wrap text-[16.5px] leading-[1.55] select-text font-normal tracking-[-0.01em]">
            {message.text}
          </div>
          <button
            onClick={handleCopy}
            className="absolute -left-9 top-2 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[#9E9A92] hover:text-[#EDE9DF] hover:bg-[#252421] transition-all"
            title="Скопіювати запит"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>
        </div>
      </div>
    );
  }

  const isError = message.role === 'model' && (message.text.startsWith('Помилка:') || message.text.startsWith('Error:'));

  if (isError) {
    const errorText = message.text.replace(/^(Помилка:|Error:)\s*/, '');
    return (
      <div className="flex flex-col w-full mb-6 animate-in fade-in duration-200">
        <div className="p-4 rounded-2xl bg-[#26211C] border border-[#523326] text-[#EDE9DF] shadow-md max-w-2xl">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-[#36261D] text-[#CC785C] shrink-0 mt-0.5">
              <AlertTriangle size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm text-[#F0ECE1] mb-1">
                Сервер моделі тимчасово зайнятий
              </h4>
              <p className="text-[13.5px] leading-relaxed text-[#C5B8A8] mb-3 select-text">
                {errorText}
              </p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#CC785C] hover:bg-[#D97757] text-white text-xs font-medium transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  <RotateCcw size={14} />
                  Повторити запит
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const hasMedia = Boolean(message.mediaItems && message.mediaItems.length > 0);
  const renderToolIcon = (status: string) => {
    if (status.toLowerCase().includes('відео')) {
      return <Film size={15} className="text-amber-400 animate-pulse shrink-0" />;
    }
    if (status.toLowerCase().includes('зображен') || status.toLowerCase().includes('фото')) {
      return <ImageIcon size={15} className="text-[#CC785C] animate-pulse shrink-0" />;
    }
    if (status.startsWith('Читаю сторінку')) {
      return <FileText size={15} className="text-sky-400 animate-pulse shrink-0" />;
    }
    return <Globe size={15} className="text-[#CC785C] animate-spin shrink-0" />;
  };

  // Claude-style Assistant response: directly on canvas, with proper markdown typography & media cards
  return (
    <div
      className="flex flex-col w-full mb-8 animate-in fade-in duration-200"
      style={{ contain: 'layout style' }}
    >
      <div 
        onClick={isTyping && !hasMedia ? onSkipTyping : undefined}
        className={`pr-2 pl-0.5 ${isTyping && !hasMedia ? 'cursor-pointer' : ''}`}
        title={isTyping && !hasMedia ? "Натисніть щоб показати текст одразу" : undefined}
      >
        {((message.searchQueries && message.searchQueries.length > 0) || (message.readUrls && message.readUrls.length > 0)) && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
            {message.searchQueries?.map((q, idx) => (
              <span
                key={`search-${idx}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#24231F] border border-[#3B3831] text-[11px] font-medium text-[#C8C3B8]"
              >
                <Globe size={11} className="text-[#CC785C] shrink-0" />
                <span>Пошук: «{q}»</span>
              </span>
            ))}
            {message.readUrls?.map((url, idx) => {
              let displayLabel = url;
              try {
                const parsed = new URL(url);
                displayLabel = `${parsed.hostname}${parsed.pathname !== '/' ? parsed.pathname : ''}`;
              } catch {}
              return (
                <span
                  key={`read-${idx}`}
                  title={url}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#202328] border border-[#323A46] text-[11px] font-medium text-[#C5D3E6] max-w-full"
                >
                  <FileText size={11} className="text-sky-400 shrink-0" />
                  <span className="truncate max-w-[220px] sm:max-w-[300px]">Читаю сторінку: {displayLabel}</span>
                </span>
              );
            })}
          </div>
        )}

        {message.text === '' && !hasMedia && isTyping ? (
          <div className="flex items-center gap-2.5 py-1 text-[#9E9A92] text-sm select-none animate-pulse">
            {toolStatus ? (
              <>
                {renderToolIcon(toolStatus)}
                <span className="font-medium text-[#DED8CD] truncate">{toolStatus}</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-[#CC785C] animate-ping" />
                <span className="font-serif italic text-[#C5C2BA]">Міркує...</span>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {hasMedia && (
              <div className="flex flex-col gap-3">
                {message.mediaItems!.map((item) => (
                  <ResolvedMediaCard
                    key={item.id}
                    item={item}
                    onExpandImage={(src, media) => setLightboxMedia({ src, item: media })}
                  />
                ))}
              </div>
            )}

            {message.text.trim().length > 0 && (
              <MarkdownContent content={message.text} isTyping={isTyping} />
            )}

            {isTyping && toolStatus && (
              <div className="mt-2.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#24231F] border border-[#3B3831] text-xs text-[#DED8CD] animate-pulse max-w-full">
                {renderToolIcon(toolStatus)}
                <span className="truncate">{toolStatus}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Claude action icons bar - only shown when typing finishes */}
      {!isTyping && (
        <>
          <div className="flex items-center gap-1.5 mt-3.5 text-[#9E9A92] animate-in fade-in duration-300">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 p-1.5 rounded-lg hover:text-[#ECE8E1] hover:bg-[#252421] transition-colors"
              title={copied ? "Скопійовано" : "Копіювати"}
            >
              {copied ? <Check size={17} className="text-emerald-400" /> : <Copy size={17} />}
              {copied && <span className="text-xs text-emerald-400 font-medium">Скопійовано</span>}
            </button>

            <button
              onClick={handleShare}
              className="p-1.5 rounded-lg hover:text-[#ECE8E1] hover:bg-[#252421] transition-colors"
              title="Поділитися"
            >
              <Share2 size={17} />
            </button>

            {message.text.trim().length > 0 && (
              <button
                onClick={handleSpeak}
                className={`p-1.5 rounded-lg hover:text-[#ECE8E1] hover:bg-[#252421] transition-colors ${isPlayingAudio ? 'text-[#CC785C]' : ''}`}
                title="Озвучити"
              >
                <Volume2 size={17} />
              </button>
            )}

            <button
              onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
              className={`p-1.5 rounded-lg hover:text-[#ECE8E1] hover:bg-[#252421] transition-colors ${feedback === 'up' ? 'text-emerald-400' : ''}`}
              title="Корисно"
            >
              <ThumbsUp size={17} />
            </button>

            <button
              onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
              className={`p-1.5 rounded-lg hover:text-[#ECE8E1] hover:bg-[#252421] transition-colors ${feedback === 'down' ? 'text-red-400' : ''}`}
              title="Не сподобалось"
            >
              <ThumbsDown size={17} />
            </button>

            {onRetry && (
              <button
                onClick={onRetry}
                className="p-1.5 rounded-lg hover:text-[#ECE8E1] hover:bg-[#252421] transition-colors"
                title="Повторити генерацію"
              >
                <RotateCcw size={17} />
              </button>
            )}
          </div>

          {isLast && (
            <div className="text-[13px] text-[#807C74] mt-2.5 select-none font-normal pl-0.5 animate-in fade-in duration-300">
              Claude is AI and can make mistakes.
            </div>
          )}
        </>
      )}

      {/* Fullscreen Image Lightbox Modal */}
      {lightboxMedia && (
        <div
          className="fixed inset-0 z-[90] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setLightboxMedia(null)}
        >
          <div
            className="w-full max-w-4xl flex items-center justify-between mb-3 px-1"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-xs text-[#C8C3B8] truncate pr-4">
              {lightboxMedia.item.prompt || 'Згенероване зображення'}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => downloadMediaAsset(lightboxMedia.src, `scout-image-${lightboxMedia.item.id}.png`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#CC785C] hover:bg-[#D97757] text-white text-xs font-semibold transition-colors"
              >
                <Download size={14} />
                <span>Завантажити</span>
              </button>
              <button
                type="button"
                onClick={() => setLightboxMedia(null)}
                className="p-2 rounded-full bg-[#2A2825] hover:bg-[#3A3732] text-[#EDE9DF] transition-colors"
                aria-label="Закрити перегляд"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <img
            src={lightboxMedia.src}
            alt={lightboxMedia.item.prompt || 'Згенероване зображення'}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[82vh] max-w-full object-contain rounded-2xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}, (prev, next) => (
  prev.message.id === next.message.id &&
  prev.message.role === next.message.role &&
  prev.message.text === next.message.text &&
  prev.message.searchQueries === next.message.searchQueries &&
  prev.message.readUrls === next.message.readUrls &&
  prev.message.mediaItems === next.message.mediaItems &&
  prev.isLast === next.isLast &&
  prev.isTyping === next.isTyping &&
  prev.toolStatus === next.toolStatus &&
  Boolean(prev.onRetry) === Boolean(next.onRetry)
));
