import { useState } from 'react';
import { Copy, Check, Share2, Volume2, ThumbsUp, ThumbsDown, RotateCcw, AlertTriangle } from 'lucide-react';
import { Message } from '../lib/api';
import { MarkdownContent } from './MarkdownContent';

interface ChatMessageProps {
  message: Message;
  onRetry?: () => void;
  isLast?: boolean;
  isTyping?: boolean;
  onSkipTyping?: () => void;
}

export function ChatMessage({ message, onRetry, isLast, isTyping, onSkipTyping }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSpeak = () => {
    if ('speechSynthesis' in window) {
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
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Відповідь ШІ',
          text: message.text,
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

  // Claude-style Assistant response: directly on canvas, with proper markdown typography
  return (
    <div className="flex flex-col w-full mb-8 animate-in fade-in duration-200">
      <div 
        onClick={isTyping ? onSkipTyping : undefined}
        className={`pr-2 pl-0.5 ${isTyping ? 'cursor-pointer' : ''}`}
        title={isTyping ? "Натисніть щоб показати текст одразу" : undefined}
      >
        {message.text === '' && isTyping ? (
          <div className="flex items-center gap-2.5 py-1 text-[#9E9A92] text-sm select-none animate-pulse">
            <span className="w-2 h-2 rounded-full bg-[#CC785C] animate-ping" />
            <span className="font-serif italic text-[#C5C2BA]">Міркує...</span>
          </div>
        ) : (
          <MarkdownContent content={message.text} isTyping={isTyping} />
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

            <button
              onClick={handleSpeak}
              className={`p-1.5 rounded-lg hover:text-[#ECE8E1] hover:bg-[#252421] transition-colors ${isPlayingAudio ? 'text-[#CC785C]' : ''}`}
              title="Озвучити"
            >
              <Volume2 size={17} />
            </button>

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
    </div>
  );
}
