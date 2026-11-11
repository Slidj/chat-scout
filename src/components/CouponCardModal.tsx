import { useState } from 'react';
import { 
  X, Copy, Check, Sparkles, Gift, CheckCircle2, 
  MessageSquare, ChevronRight, Calendar, ArrowUpRight
} from 'lucide-react';
import { UserCoupon, markCouponAsRead, markCouponAsClaimed } from '../lib/db';

interface CouponCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  coupons: UserCoupon[];
  onStartChat?: () => void;
}

export function CouponCardModal({ isOpen, onClose, coupons, onStartChat }: CouponCardModalProps) {
  const [selectedCouponIndex, setSelectedCouponIndex] = useState(0);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  if (!isOpen || coupons.length === 0) return null;

  const currentCoupon = coupons[selectedCouponIndex] || coupons[0];

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    markCouponAsRead(currentCoupon.id);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const handleClaimAndChat = () => {
    navigator.clipboard.writeText(currentCoupon.couponCode);
    markCouponAsClaimed(currentCoupon.id);
    onClose();
    if (onStartChat) {
      onStartChat();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md flex flex-col max-h-[95vh] overflow-hidden rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button top-right */}
        <button
          onClick={() => {
            markCouponAsRead(currentCoupon.id);
            onClose();
          }}
          className="absolute right-3.5 top-3.5 z-20 w-8 h-8 rounded-full bg-black/60 hover:bg-black/90 text-[#EDE9DF] hover:text-white flex items-center justify-center transition-all shadow-md backdrop-blur-xs"
        >
          <X size={18} />
        </button>

        {/* Multiple Coupons Selector Bar if user has more than 1 */}
        {coupons.length > 1 && (
          <div className="bg-[#1C1A17] border-b border-[#35322D] px-4 py-2.5 flex items-center gap-2 overflow-x-auto z-10">
            <span className="text-[11px] font-semibold text-[#8E8B83] shrink-0 uppercase tracking-wider">
              Ваші купони:
            </span>
            <div className="flex gap-1.5 overflow-x-auto">
              {coupons.map((c, idx) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedCouponIndex(idx);
                    markCouponAsRead(c.id);
                  }}
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    selectedCouponIndex === idx
                      ? 'bg-[#CC785C] text-white shadow-xs'
                      : 'bg-[#292723] text-[#8E8B83] hover:text-[#EDE9DF]'
                  }`}
                >
                  ₴{c.amount} {!c.isRead && '•'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Luxury Gold/Terracotta Digital Voucher Card */}
        <div className="relative bg-gradient-to-b from-[#221D17] via-[#1A1815] to-[#121110] border-2 border-[#D49354]/60 rounded-3xl p-6 sm:p-7 shadow-[0_0_40px_rgba(204,120,92,0.25)] text-[#EDE9DF] overflow-hidden">
          
          {/* Subtle Ambient Radial Gold Glow */}
          <div className="absolute -top-24 -left-24 w-56 h-56 bg-[#CC785C]/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-56 h-56 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

          {/* Luxury Ribbon Header */}
          <div className="text-center space-y-1 relative mb-5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 via-[#CC785C]/30 to-amber-500/20 border border-amber-500/40 text-[11px] font-bold text-amber-300 tracking-wider uppercase shadow-xs">
              <Sparkles size={12} className="text-amber-400" />
              <span>Офіційний купон сервісу</span>
              <Sparkles size={12} className="text-amber-400" />
            </div>

            <h3 className="font-claude-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#FAF8F5] pt-1">
              Поповнення балансу
            </h3>
            <p className="text-xs text-[#A8A49C]">
              Адміністратор підтвердив ваш платіж та надав промокод
            </p>
          </div>

          {/* Ticket Body with perforated notches */}
          <div className="relative bg-[#181614] border border-[#3C3831] rounded-2xl p-5 shadow-inner">
            
            {/* Left & Right Perforated Notches */}
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#1B1916] border border-[#3C3831]" />
            <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#1B1916] border border-[#3C3831]" />

            {/* Nominal Value */}
            <div className="text-center pb-4 border-b border-dashed border-[#38342D]">
              <div className="text-[11px] uppercase font-bold text-[#8E8B83] tracking-widest mb-0.5">
                Номінал купона
              </div>
              <div className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-[#CC785C] to-amber-200 tracking-tight">
                +{currentCoupon.currency || '₴'}{currentCoupon.amount}
              </div>
            </div>

            {/* Personalized Admin Message if any */}
            {currentCoupon.message && (
              <div className="py-3 text-xs text-[#C8C4BC] text-center italic leading-relaxed border-b border-dashed border-[#38342D]">
                «{currentCoupon.message}»
              </div>
            )}

            {/* The Coupon Code Cutout Box */}
            <div className="pt-4 space-y-2">
              <div className="text-[11px] font-semibold text-[#8E8B83] text-center uppercase tracking-wider">
                Код вашого купона:
              </div>

              <div className="bg-[#24211D] border-2 border-dashed border-[#D49354]/80 rounded-xl p-3 flex items-center justify-between gap-3 shadow-sm">
                <span className="font-mono text-base sm:text-lg font-bold tracking-widest text-[#FFF8EE] select-all truncate pl-1">
                  {currentCoupon.couponCode}
                </span>

                <button
                  onClick={() => handleCopy(currentCoupon.couponCode)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#CC785C] hover:bg-[#D97757] text-white text-xs font-bold transition-all active:scale-95 shadow-xs shrink-0"
                  title="Скопіювати код купона"
                >
                  {copiedCode === currentCoupon.couponCode ? (
                    <>
                      <Check size={14} />
                      <span>Скопійовано!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span>Копіювати</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Issue Date */}
            <div className="mt-3 flex items-center justify-between text-[10px] text-[#76736C]">
              <span className="flex items-center gap-1">
                <Calendar size={11} />
                {new Date(currentCoupon.createdAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <span className="text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 size={11} /> Дійсний
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-5 space-y-2">
            <button
              onClick={handleClaimAndChat}
              className="w-full py-3 bg-gradient-to-r from-[#CC785C] to-[#E08A6E] hover:from-[#D97757] hover:to-[#EB967A] text-white rounded-2xl text-xs sm:text-sm font-bold transition-all shadow-lg active:scale-98 flex items-center justify-center gap-2"
            >
              <Copy size={16} />
              <span>Скопіювати код і перейти в Чат</span>
              <ArrowUpRight size={16} />
            </button>

            <button
              onClick={() => {
                markCouponAsRead(currentCoupon.id);
                onClose();
              }}
              className="w-full py-2 bg-transparent hover:bg-[#25221E] text-[#8E8B83] hover:text-[#EDE9DF] rounded-xl text-xs font-medium transition-colors"
            >
              Закрити
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
