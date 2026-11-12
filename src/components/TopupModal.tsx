import React, { useState, useRef, useEffect } from 'react';
import { 
  X, Wallet, CreditCard, Copy, Check, Upload, FileText, Image as ImageIcon,
  AlertCircle, Sparkles, Clock, CheckCircle2, ArrowRight, ShieldCheck, Trash2
} from 'lucide-react';
import { 
  createTopupRequest, TopupRequest, 
  subscribePaymentSettings, PaymentSettings, DEFAULT_PAYMENT_SETTINGS 
} from '../lib/db';

interface TopupModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: any;
  userRequests?: TopupRequest[];
}

const AMOUNT_PRESETS = [100, 200, 500, 1000];

export function TopupModal({ isOpen, onClose, currentUser, userRequests = [] }: TopupModalProps) {
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);
  const [amount, setAmount] = useState<string>('200');
  const [comment, setComment] = useState('');
  const [attachment, setAttachment] = useState<{ url: string; name: string; type: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [copiedCard, setCopiedCard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = subscribePaymentSettings((settings) => {
      setPaymentSettings(settings);
    });
    return () => unsub();
  }, []);

  if (!isOpen) return null;

  const handleCopyCard = () => {
    navigator.clipboard.writeText(paymentSettings.cardNumber.replace(/\s+/g, ''));
    setCopiedCard(true);
    setTimeout(() => setCopiedCard(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limit file size to 3MB for database storage safety
    if (file.size > 3.5 * 1024 * 1024) {
      setError('Розмір файлу не повинен перевищувати 3.5 МБ');
      return;
    }

    setError(null);
    const reader = new FileReader();

    if (file.type.startsWith('image/')) {
      // Compress/resize image if needed
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 1200;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
            setAttachment({
              url: dataUrl,
              name: file.name,
              type: 'image/jpeg'
            });
          } else {
            setAttachment({
              url: event.target?.result as string,
              name: file.name,
              type: file.type
            });
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    } else {
      // PDF or other documents
      reader.onload = (event) => {
        setAttachment({
          url: event.target?.result as string,
          name: file.name,
          type: file.type || 'application/pdf'
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Вкажіть коректну суму поповнення');
      return;
    }

    if (!attachment) {
      setError('Будь ласка, прикріпіть скріншот або квитанцію переказу для перевірки');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const userId = currentUser?.id ? String(currentUser.id) : (localStorage.getItem('app_client_id') || 'guest_user');
      const userName = currentUser?.first_name || (currentUser?.username ? `@${currentUser.username}` : 'Користувач');
      const userUsername = currentUser?.username;
      const userPhotoUrl = currentUser?.photo_url;
      const telegramId = currentUser?.id;

      await createTopupRequest({
        userId,
        userName,
        userUsername,
        userPhotoUrl,
        telegramId,
        amount: numAmount,
        currency: 'UAH',
        userComment: comment.trim() || undefined,
        attachmentUrl: attachment.url,
        attachmentName: attachment.name,
        attachmentType: attachment.type,
      });

      setIsSuccess(true);
      setComment('');
      setAttachment(null);
    } catch (err: any) {
      console.error('Error submitting topup request:', err);
      setError(err?.message || 'Не вдалося надіслати заявку. Спробуйте ще раз.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setIsSuccess(false);
    setError(null);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center px-3 sm:px-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      style={{ paddingTop: 'calc(4rem + var(--safe-top, 0px))', paddingBottom: 'calc(1.25rem + var(--safe-bottom, 0px))' }}
    >
      <div 
        className="relative w-full max-w-lg bg-[#1B1A17] border border-[#35332F] rounded-3xl shadow-2xl flex flex-col max-h-full overflow-hidden text-[#EDE9DF]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-[#2C2A26] flex items-center justify-between bg-[#1F1E1B] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#2D241E] border border-[#4D3528] text-[#CC785C] flex items-center justify-center shadow-xs">
              <Wallet size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#FAF8F5] tracking-tight flex items-center gap-2">
                <span>Поповнення балансу</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#CC785C]/20 text-[#CC785C] font-semibold border border-[#CC785C]/30">
                  UAH
                </span>
              </h2>
              <p className="text-xs text-[#8E8B83]">
                Переказ на картку & отримання промокоду від адміністратора
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-[#8E8B83] hover:text-[#EDE9DF] hover:bg-[#2A2925] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab switchers if user has history */}
        {userRequests.length > 0 && (
          <div className="flex border-b border-[#2C2A26] bg-[#171614] px-4 pt-2 gap-2 text-xs font-medium">
            <button
              onClick={() => { setActiveTab('form'); handleResetForm(); }}
              className={`pb-2.5 px-3 border-b-2 transition-all ${
                activeTab === 'form' 
                  ? 'border-[#CC785C] text-[#FAF8F5] font-semibold' 
                  : 'border-transparent text-[#8E8B83] hover:text-[#EDE9DF]'
              }`}
            >
              Нова заявка
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
                activeTab === 'history' 
                  ? 'border-[#CC785C] text-[#FAF8F5] font-semibold' 
                  : 'border-transparent text-[#8E8B83] hover:text-[#EDE9DF]'
              }`}
            >
              <span>Мої заявки</span>
              <span className="px-1.5 py-0.2 rounded-full bg-[#292723] text-[10px] text-[#CC785C] font-mono">
                {userRequests.length}
              </span>
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {activeTab === 'history' ? (
            <div className="space-y-3">
              <div className="text-xs text-[#8E8B83] mb-1">
                Історія ваших надісланих переказів та отриманих купонів:
              </div>
              {userRequests.map((req) => (
                <div 
                  key={req.id}
                  className="p-3.5 rounded-2xl bg-[#23221E] border border-[#34322D] space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#FAF8F5]">
                        ₴ {req.amount}
                      </span>
                      <span className="text-[11px] text-[#7A7770]">
                        {new Date(req.createdAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div>
                      {req.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-950/60 text-amber-300 border border-amber-800/50">
                          <Clock size={11} /> Очікує перевірки
                        </span>
                      )}
                      {req.status === 'completed' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-800/50">
                          <CheckCircle2 size={11} /> Купон надіслано
                        </span>
                      )}
                      {req.status === 'rejected' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-950/60 text-rose-300 border border-rose-800/50">
                          <X size={11} /> Відхилено
                        </span>
                      )}
                    </div>
                  </div>

                  {req.userComment && (
                    <div className="text-xs text-[#A8A49C] bg-[#1B1A17] p-2 rounded-xl">
                      «{req.userComment}»
                    </div>
                  )}

                  {req.adminCouponCode && (
                    <div className="p-2.5 rounded-xl bg-[#2A231C] border border-[#523A2A] flex items-center justify-between">
                      <div>
                        <div className="text-[10px] font-medium text-[#CC785C]">Ваш купон від адміна:</div>
                        <div className="font-mono font-bold text-xs text-[#FAF8F5] tracking-wider">
                          {req.adminCouponCode}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(req.adminCouponCode!);
                          alert('Код купона скопійовано!');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#CC785C] hover:bg-[#D97757] text-white text-xs font-semibold"
                      >
                        Копіювати
                      </button>
                    </div>
                  )}

                  {req.adminReplyMessage && (
                    <div className="text-xs text-[#8E8B83] border-l-2 border-[#CC785C] pl-2 mt-1">
                      Відповідь: {req.adminReplyMessage}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : isSuccess ? (
            <div className="py-6 text-center space-y-4 animate-in zoom-in-95">
              <div className="w-16 h-16 rounded-3xl bg-emerald-950/60 border border-emerald-800/50 text-emerald-400 flex items-center justify-center mx-auto shadow-lg">
                <CheckCircle2 size={34} />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-lg font-bold text-[#FAF8F5]">
                  Заявку на поповнення надіслано!
                </h3>
                <p className="text-xs sm:text-sm text-[#A09D95] max-w-sm mx-auto leading-relaxed">
                  Адміністратор отримав ваш чек та повідомлення. Після звірки ви побачите <span className="text-[#CC785C] font-semibold">анімований конвертик у верхній шапці</span> з кодом купона на поповнення.
                </p>
              </div>

              <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-2">
                <button
                  onClick={() => setActiveTab('history')}
                  className="w-full sm:w-auto px-4 py-2.5 bg-[#292723] hover:bg-[#34322D] text-xs font-semibold rounded-xl text-[#EDE9DF] border border-[#3E3C36] transition-colors"
                >
                  Переглянути статус
                </button>
                <button
                  onClick={onClose}
                  className="w-full sm:w-auto px-5 py-2.5 bg-[#CC785C] hover:bg-[#D97757] text-xs font-semibold rounded-xl text-white transition-colors shadow-md"
                >
                  Зрозуміло
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Card Details Card */}
              <div className="bg-gradient-to-br from-[#29221C] to-[#1C1A17] border border-[#483325] rounded-2xl p-4 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-[#C49B85] flex items-center gap-1.5">
                    <CreditCard size={14} className="text-[#CC785C]" />
                    Актуальні реквізити для оплати
                  </span>
                  <span className="text-[11px] font-mono text-[#A89F95]">
                    {paymentSettings.bankName || 'Банк'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 mt-2">
                  <span className="font-mono text-base sm:text-lg font-bold tracking-wider text-[#FAF8F5]">
                    {paymentSettings.cardNumber}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCard}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#CC785C] hover:bg-[#D97757] text-white text-xs font-semibold transition-all active:scale-95 shadow-sm shrink-0"
                    title="Скопіювати номер картки"
                  >
                    {copiedCard ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedCard ? 'Скопійовано' : 'Копіювати'}</span>
                  </button>
                </div>

                <div className="text-[11px] text-[#8E8B83] mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-t border-[#382C22] pt-2">
                  <span>Отримувач: {paymentSettings.recipientName || 'Адміністратор'}</span>
                  <span className="text-emerald-400 flex items-center gap-1">
                    <ShieldCheck size={13} /> Реквізити верифіковано
                  </span>
                </div>

                {paymentSettings.note && (
                  <div className="mt-2 text-[11px] text-[#C0B9AE] bg-[#1F1C18] p-2 rounded-xl border border-[#3E342B]">
                    💡 {paymentSettings.note}
                  </div>
                )}
              </div>

              {/* Notice regarding 3-day retention of coupons */}
              <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-[#231F1A] border border-[#48382C] text-xs text-[#C8C2B7]">
                <Clock size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-amber-300">Зверніть увагу:</strong> Після підтвердження переказу код купона надійде у верхню шапку (конверт). Купон зберігатиметься в додатку <strong className="text-white">протягом 3 днів</strong> — скопіюйте та активуйте його вчасно.
                </span>
              </div>

              {/* Amount Selection */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[#A8A49C]">
                  Сума поповнення (₴ UAH):
                </label>
                
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {AMOUNT_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setAmount(String(p))}
                      className={`py-2 rounded-xl text-xs font-semibold transition-all border ${
                        amount === String(p)
                          ? 'bg-[#CC785C] text-white border-[#CC785C] shadow-sm'
                          : 'bg-[#242320] text-[#A09D95] border-[#34322E] hover:border-[#4B4842] hover:text-[#EDE9DF]'
                      }`}
                    >
                      ₴{p}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-[#8E8B83]">
                    ₴
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Введіть суму"
                    required
                    className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-[#242320] border border-[#363430] text-[#FAF8F5] text-sm focus:outline-none focus:border-[#CC785C] transition-colors"
                  />
                </div>
              </div>

              {/* File Attachment Upload */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[#A8A49C] flex items-center justify-between">
                  <span>Скріншот переказу або квитанція (фото / PDF): *</span>
                  <span className="text-[11px] text-[#7A7770]">До 3.5 МБ</span>
                </label>

                {attachment ? (
                  <div className="p-3 bg-[#23221E] border border-[#3E3C36] rounded-2xl flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {attachment.type.startsWith('image/') ? (
                        <img 
                          src={attachment.url} 
                          alt="preview" 
                          className="w-12 h-12 rounded-xl object-cover border border-[#484540] shrink-0" 
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-[#2E2C28] text-[#CC785C] flex items-center justify-center shrink-0">
                          <FileText size={22} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-[#FAF8F5] truncate">
                          {attachment.name}
                        </div>
                        <div className="text-[10px] text-emerald-400 mt-0.5 flex items-center gap-1">
                          <Check size={11} /> Файл додано
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setAttachment(null)}
                      className="p-1.5 rounded-lg text-[#8E8B83] hover:text-rose-400 hover:bg-[#2C2A26] transition-colors"
                      title="Видалити файл"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-[#3D3A35] hover:border-[#CC785C] rounded-2xl p-4 text-center cursor-pointer transition-colors bg-[#201F1C] hover:bg-[#252420] group"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <div className="w-10 h-10 rounded-2xl bg-[#2A2925] group-hover:bg-[#322B24] text-[#CC785C] flex items-center justify-center mx-auto mb-2 transition-colors">
                      <Upload size={18} />
                    </div>
                    <div className="text-xs font-semibold text-[#EDE9DF]">
                      Натисніть для вибору скріншота або квитанції
                    </div>
                    <div className="text-[11px] text-[#76736D] mt-0.5">
                      PNG, JPG, WEBP або PDF
                    </div>
                  </div>
                )}
              </div>

              {/* User Note / Comment */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#A8A49C]">
                  Коментар або повідомлення для адміна (необов'язково):
                </label>
                <textarea
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Наприклад: переказ з картки Приват від Івана або останні 4 цифри картки..."
                  className="w-full px-3 py-2 rounded-xl bg-[#242320] border border-[#363430] text-[#FAF8F5] text-xs focus:outline-none focus:border-[#CC785C] transition-colors resize-none placeholder-[#6E6B65]"
                />
              </div>

              {/* Error Alert */}
              {error && (
                <div className="p-3 bg-rose-950/50 border border-rose-800/60 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-[#CC785C] hover:bg-[#D97757] disabled:opacity-50 text-white rounded-2xl text-sm font-semibold transition-all shadow-md active:scale-98 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <span>Відправка заявки...</span>
                ) : (
                  <>
                    <span>Надіслати заявку на поповнення</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              <div className="text-[11px] text-[#7A7770] text-center leading-relaxed">
                Після надсилання адмін отримає сповіщення. Ваш персональний купон надійде прямо у додаток.
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
