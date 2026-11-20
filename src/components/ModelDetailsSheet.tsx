import React, { useEffect, useState } from 'react';
import { X, MessageSquare, Copy, Check } from 'lucide-react';
import { AiModel, Provider } from '../types';
import { resolveColorToHex } from '../lib/utils';

interface ModelDetailsSheetProps {
  model: AiModel | null;
  provider?: Provider | null;
  onClose: () => void;
  onStartChat: (apiModelId: string) => void;
}

interface ParsedPricing {
  mode: 'split' | 'single';
  inputPrice?: string;
  outputPrice?: string;
  unitLabel?: string;
  singleValue?: string;
}

const TIER_LABELS_UK: Record<NonNullable<AiModel['tier']>, string> = {
  common: 'Базова',
  uncommon: 'Покращена',
  rare: 'Рідкісна',
  epic: 'Епічна',
  legendary: 'Флагман',
};

export function parseModelPricing(priceInfo: string, shortPriceInfo?: string): ParsedPricing {
  const raw = (priceInfo || shortPriceInfo || '').trim();
  if (!raw) {
    return { mode: 'single', singleValue: 'За тарифом API' };
  }

  // Extract trailing unit after ":" or "за" e.g. ": 1м токенів", "за 1M токенів", "/ 1M"
  let body = raw;
  let unitLabel: string | undefined;

  const colonMatch = raw.match(/^(.*?)\s*:\s*(.+)$/);
  if (colonMatch) {
    body = colonMatch[1].trim();
    unitLabel = colonMatch[2].trim();
  } else {
    const zaMatch = raw.match(/^(.*?)\s+(?:за|per)\s+(.+)$/i);
    if (zaMatch) {
      body = zaMatch[1].trim();
      unitLabel = zaMatch[2].trim();
    }
  }

  // Normalize Ukrainian unit formatting like "1м токенів" -> "за 1M токенів"
  if (unitLabel) {
    const normalizedUnit = unitLabel.replace(/(\d+)\s*[мm](?=\s|$)/gi, '$1M');
    unitLabel = /^за\s/i.test(normalizedUnit) ? normalizedUnit : `за ${normalizedUnit}`;
  }

  // Try splitting input / output pricing e.g. "₴67-вхід / ₴402-вихід" or "$3 / $15"
  const parts = body.split(/\s*\/\s*/).map(p => p.trim()).filter(Boolean);
  if (parts.length === 2) {
    const cleanPart = (part: string) => {
      // Remove labels like "-вхід", "вхід:", "input", "-вихід", "вихід:", "output"
      const stripped = part
        .replace(/[-–—]?\s*(?:вхід|вход|input|вихід|выход|output)\s*:?/gi, '')
        .trim();
      return stripped || part;
    };

    const p1 = cleanPart(parts[0]);
    const p2 = cleanPart(parts[1]);

    if (p1 && p2) {
      return {
        mode: 'split',
        inputPrice: p1,
        outputPrice: p2,
        unitLabel: unitLabel || 'за 1M токенів',
      };
    }
  }

  return {
    mode: 'single',
    singleValue: body,
    unitLabel,
  };
}

function formatDescriptionParagraphs(description: string): string[] {
  const trimmed = (description || '').trim();
  if (!trimmed) return [];

  // Preserve explicit line breaks if author already structured paragraphs
  if (trimmed.includes('\n')) {
    return trimmed
      .split(/\n+/)
      .map(p => p.trim())
      .filter(Boolean);
  }

  // For long continuous single-block descriptions, gently split into 2-3 readable paragraphs at sentence boundaries
  if (trimmed.length > 260) {
    const sentences = trimmed.match(/[^.!?]+[.!?]+(?:\s+|$)/g);
    if (sentences && sentences.length >= 4) {
      const mid = Math.ceil(sentences.length / 2);
      const first = sentences.slice(0, mid).join('').trim();
      const second = sentences.slice(mid).join('').trim();
      return [first, second].filter(Boolean);
    }
  }

  return [trimmed];
}

export function ModelDetailsSheet({
  model,
  provider,
  onClose,
  onStartChat,
}: ModelDetailsSheetProps) {
  const [renderedModel, setRenderedModel] = useState<AiModel | null>(model);
  const [isVisible, setIsVisible] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    if (model) {
      setRenderedModel(model);
      setCopiedId(false);
      // Trigger slide-up on next animation frame so CSS transition runs smoothly from translateY(100%) -> 0
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
      return () => cancelAnimationFrame(frame);
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => {
        setRenderedModel(null);
      }, 280);
      return () => clearTimeout(timer);
    }
  }, [model]);

  // Close on Escape key
  useEffect(() => {
    if (!model) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [model, onClose]);

  if (!renderedModel) return null;

  const hexColor = resolveColorToHex(provider?.color || '#CC785C');
  const pricing = parseModelPricing(renderedModel.priceInfo, renderedModel.shortPriceInfo);
  const paragraphs = formatDescriptionParagraphs(renderedModel.description);
  const tierLabel = renderedModel.tier && renderedModel.tier !== 'common'
    ? TIER_LABELS_UK[renderedModel.tier]
    : null;

  const handleCopyApiId = () => {
    if (!renderedModel.apiModelId) return;
    navigator.clipboard.writeText(renderedModel.apiModelId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="model-sheet-title"
    >
      {/* Dimmed Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/70 backdrop-blur-[2px] transition-opacity duration-300 motion-reduce:transition-none ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Slide-Up Sheet Container */}
      <div
        className={`relative w-full sm:max-w-xl max-h-[92dvh] sm:max-h-[86dvh] bg-[#1E1D1A] border-t sm:border border-[#33312D] rounded-t-[28px] sm:rounded-[28px] shadow-2xl flex flex-col overflow-hidden transform transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
          isVisible
            ? 'translate-y-0 opacity-100 sm:scale-100'
            : 'translate-y-full sm:translate-y-10 opacity-0 sm:scale-[0.98]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Grab Handle */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#3D3B36]" />
        </div>

        {/* Sticky Top Header */}
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-3 sm:pt-5 pb-4 border-b border-[#2B2925] shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              style={{ backgroundColor: hexColor }}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl text-white flex items-center justify-center font-bold text-xl sm:text-2xl shadow-md shrink-0 overflow-hidden"
            >
              {provider?.logoUrl ? (
                <img
                  src={provider.logoUrl}
                  alt={provider.name}
                  className="w-full h-full object-contain p-2.5"
                />
              ) : (
                <span>{(provider?.name || renderedModel.name).charAt(0).toUpperCase()}</span>
              )}
            </div>

            <div className="min-w-0">
              <h2
                id="model-sheet-title"
                className="text-xl sm:text-2xl font-bold text-[#FAF8F5] tracking-tight leading-snug break-words"
              >
                {renderedModel.name}
              </h2>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-[#9E9A92] mt-0.5">
                <span>{provider?.name || 'ШІ Провайдер'}</span>
                {tierLabel && (
                  <>
                    <span aria-hidden="true" className="text-[#5E5B54]">·</span>
                    <span className="text-[#CC785C] font-medium">{tierLabel}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] -mr-2 -mt-1 rounded-full flex items-center justify-center text-[#9E9A92] hover:text-[#FAF8F5] hover:bg-[#2A2824] transition-colors shrink-0"
            aria-label="Закрити опис моделі"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Editorial Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5 space-y-6">
          {/* Pricing Block */}
          <section aria-label="Вартість використання">
            <div className="text-xs font-medium text-[#8E8B83] mb-2.5">
              Тарифікація токенів
            </div>

            {pricing.mode === 'split' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#171614] border border-[#2C2A26] rounded-2xl p-3.5 sm:p-4">
                  <div className="text-xs text-[#8E8B83]">Вхідні токени</div>
                  <div className="text-lg sm:text-xl font-bold text-[#FAF8F5] tabular-nums mt-1 tracking-tight">
                    {pricing.inputPrice}
                  </div>
                  {pricing.unitLabel && (
                    <div className="text-[11px] text-[#78756E] mt-1">{pricing.unitLabel}</div>
                  )}
                </div>

                <div className="bg-[#171614] border border-[#2C2A26] rounded-2xl p-3.5 sm:p-4">
                  <div className="text-xs text-[#8E8B83]">Вихідні токени</div>
                  <div className="text-lg sm:text-xl font-bold text-[#FAF8F5] tabular-nums mt-1 tracking-tight">
                    {pricing.outputPrice}
                  </div>
                  {pricing.unitLabel && (
                    <div className="text-[11px] text-[#78756E] mt-1">{pricing.unitLabel}</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-[#171614] border border-[#2C2A26] rounded-2xl p-4 flex items-baseline justify-between gap-3">
                <div>
                  <div className="text-xs text-[#8E8B83]">Вартість</div>
                  <div className="text-lg font-bold text-[#FAF8F5] tabular-nums mt-0.5">
                    {pricing.singleValue}
                  </div>
                </div>
                {pricing.unitLabel && (
                  <div className="text-xs text-[#8E8B83] text-right">{pricing.unitLabel}</div>
                )}
              </div>
            )}
          </section>

          {/* Readable Mobile Description */}
          <section aria-label="Опис можливостей">
            <div className="text-xs font-medium text-[#8E8B83] mb-2">
              Про модель
            </div>
            {paragraphs.length > 0 ? (
              <div className="space-y-3 text-[15px] sm:text-[15.5px] leading-[1.68] text-[#DEDAD0] max-w-[65ch]">
                {paragraphs.map((para, idx) => (
                  <p key={idx}>{para}</p>
                ))}
              </div>
            ) : (
              <p className="text-[15px] text-[#8E8B83]">
                Детальний опис для цієї моделі ще не додано.
              </p>
            )}
          </section>

          {/* Technical Spec Hairline List */}
          <section aria-label="Технічні деталі" className="border-t border-[#2B2925] pt-4 space-y-2.5">
            <div className="flex items-center justify-between gap-4 py-1">
              <span className="text-[13px] text-[#8E8B83]">Ідентифікатор API</span>
              <button
                onClick={handleCopyApiId}
                className="inline-flex items-center gap-2 min-h-[36px] px-2.5 -mr-2 rounded-lg text-xs font-mono text-[#ECE8E1] hover:bg-[#2A2824] transition-colors max-w-[65%]"
                title="Скопіювати API ID"
              >
                <span className="truncate">{renderedModel.apiModelId}</span>
                {copiedId ? (
                  <Check size={14} className="text-emerald-400 shrink-0" />
                ) : (
                  <Copy size={14} className="text-[#8E8B83] shrink-0" />
                )}
              </button>
            </div>
          </section>
        </div>

        {/* Pinned Thumb-Zone Action Footer */}
        <div
          className="px-5 sm:px-6 pt-3 border-t border-[#2B2925] bg-[#1E1D1A] shrink-0"
          style={{ paddingBottom: 'calc(1rem + var(--safe-bottom, 0px))' }}
        >
          <button
            onClick={() => onStartChat(renderedModel.apiModelId)}
            className="w-full min-h-[48px] py-3.5 px-5 bg-[#CC785C] hover:bg-[#D97757] text-white font-semibold rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2.5 active:scale-[0.98] text-[15px]"
          >
            <MessageSquare size={18} />
            <span>Почати чат з цією моделлю</span>
          </button>
        </div>
      </div>
    </div>
  );
}
