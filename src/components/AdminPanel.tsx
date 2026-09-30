import React, { useState, useEffect, useRef } from 'react';
import { getProviders, getModels, saveProvider, updateProvider, deleteProvider, saveModel, updateModel, deleteModel } from '../lib/db';
import { fetchModels } from '../lib/api';
import { Provider, AiModel } from '../types';
import { Plus, Edit2, Trash2, X, Upload, Check, Palette } from 'lucide-react';
import { resolveColorToHex, COLOR_PRESETS, ColorPreset, resizeImageFile } from '../lib/utils';

export function AdminPanel({ onClose, apiModels = [] }: { onClose: () => void, apiModels?: {id: string, name: string}[] }) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);

  // Simple state for forms
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [editingModel, setEditingModel] = useState<AiModel | null>(null);
  
  const [isAddingProvider, setIsAddingProvider] = useState(false);
  const [isAddingModel, setIsAddingModel] = useState(false);

  const [adminApiKey, setAdminApiKey] = useState('');
  const [adminApiModels, setAdminApiModels] = useState<{id: string, name: string}[]>(apiModels);
  
  useEffect(() => {
    const savedKey = localStorage.getItem('adminApiKey');
    if (savedKey) {
      setAdminApiKey(savedKey);
      fetchModels(savedKey).then(setAdminApiModels).catch(console.error);
    }
  }, []);

  const handleLoadAdminModels = async () => {
    if (!adminApiKey) return;
    try {
      const fetched = await fetchModels(adminApiKey);
      setAdminApiModels(fetched);
      localStorage.setItem('adminApiKey', adminApiKey);
      alert('Моделі успішно завантажено!');
    } catch (e: any) {
      alert('Помилка завантаження моделей: ' + e.message);
    }
  };

  const loadData = async () => {
    try {
      const p = await getProviders();
      const m = await getModels();
      setProviders(p);
      setModels(m);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 dark:bg-gray-950 overflow-hidden">
      <header 
        className="flex items-center justify-between px-6 pb-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800"
        style={{ paddingTop: 'calc(1rem + var(--safe-top, 0px))' }}
      >
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Панель Адміністратора</h2>
        <div className="flex gap-4 items-center">
          <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">Admin</span>
          <button onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full transition-colors"><X size={20}/></button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full space-y-8">
        
        {/* Admin API Key Section */}
        <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Master API Key (для завантаження списку всіх моделей)</h3>
          <p className="text-sm text-gray-500 mb-3">Введіть API ключ, який має доступ до всіх можливих моделей, щоб ви могли додавати їх у базу.</p>
          <div className="flex gap-2">
            <input 
              type="password"
              className="flex-1 p-2 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:border-blue-500" 
              placeholder="sk-..." 
              value={adminApiKey} 
              onChange={e => setAdminApiKey(e.target.value)} 
            />
            <button onClick={handleLoadAdminModels} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">
              Завантажити моделі
            </button>
          </div>
        </section>

        {/* Providers Section */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Постачальники</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Налаштуйте логотипи, фірмові кольори та опис постачальників ШІ</p>
            </div>
            <button 
              onClick={() => setIsAddingProvider(true)} 
              className="flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium px-3.5 py-2 rounded-xl transition-colors shadow-sm"
            >
              <Plus size={16}/> Додати постачальника
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {providers.map(p => {
              const hexColor = resolveColorToHex(p.color);
              return (
                <div key={p.id} className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow">
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div 
                          style={{ backgroundColor: hexColor }}
                          className="w-12 h-12 rounded-xl text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0 overflow-hidden relative"
                        >
                          {p.logoUrl ? (
                            <img src={p.logoUrl} alt={p.name} className="w-full h-full object-contain p-2 drop-shadow-sm" />
                          ) : (
                            <span>{p.name.charAt(0)}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-gray-900 dark:text-white truncate">{p.name}</h4>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span 
                              className="inline-block w-3 h-3 rounded-full border border-black/10 shrink-0" 
                              style={{ backgroundColor: hexColor }}
                            />
                            <span className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate max-w-[120px]">{p.color}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0 ml-2">
                        <button 
                          onClick={() => setEditingProvider(p)} 
                          className="p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                          title="Редагувати"
                        >
                          <Edit2 size={16}/>
                        </button>
                        <button 
                          onClick={async () => { 
                            if (confirm(`Видалити постачальника "${p.name}"?`)) { 
                              await deleteProvider(p.id); 
                              loadData(); 
                            } 
                          }} 
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                          title="Видалити"
                        >
                          <Trash2 size={16}/>
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{p.description}</p>
                  </div>
                  <div 
                    style={{ backgroundColor: hexColor }}
                    className="mt-4 w-full h-1.5 rounded-full"
                  />
                </div>
              );
            })}
          </div>
        </section>

        {/* Models Section */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Моделі</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Керуйте моделями, тарифами та рівнями рідкісності (RPG tiers)</p>
            </div>
            <button 
              onClick={() => setIsAddingModel(true)} 
              className="flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium px-3.5 py-2 rounded-xl transition-colors shadow-sm"
            >
              <Plus size={16}/> Додати модель
            </button>
          </div>
          <div className="space-y-3">
            {models.map(m => (
              <div key={m.id} className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 flex justify-between items-center shadow-sm">
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white">{m.name} <span className="text-xs font-normal text-gray-500 ml-2">({providers.find(p=>p.id === m.providerId)?.name})</span></h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{m.apiModelId} • {m.shortPriceInfo ? `${m.shortPriceInfo} / ` : ''}{m.priceInfo}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingModel(m)} className="p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"><Edit2 size={18}/></button>
                  <button onClick={async () => { if (confirm(`Видалити модель "${m.name}"?`)) { await deleteModel(m.id); loadData(); } }} className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"><Trash2 size={18}/></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Editor Modals */}
      {(isAddingProvider || editingProvider) && (
        <ProviderFormModal 
          provider={editingProvider} 
          onClose={() => { setIsAddingProvider(false); setEditingProvider(null); }}
          onSave={async (p: any) => {
            try {
              if (editingProvider) await updateProvider({ ...p, id: editingProvider.id });
              else await saveProvider(p);
              loadData();
              setIsAddingProvider(false); setEditingProvider(null);
            } catch (err: any) {
              alert('Помилка збереження постачальника: ' + err.message);
              console.error(err);
            }
          }}
        />
      )}

      {(isAddingModel || editingModel) && (
        <ModelFormModal 
          model={editingModel} 
          providers={providers}
          apiModels={adminApiModels}
          onClose={() => { setIsAddingModel(false); setEditingModel(null); }}
          onSave={async (m: any) => {
            try {
              if (editingModel) await updateModel({ ...m, id: editingModel.id });
              else await saveModel(m);
              loadData();
              setIsAddingModel(false); setEditingModel(null);
            } catch (err: any) {
              alert('Помилка збереження моделі: ' + err.message);
              console.error(err);
            }
          }}
        />
      )}
    </div>
  );
}

function ProviderFormModal({ provider, onClose, onSave }: any) {
  const [name, setName] = useState(provider?.name || '');
  const [desc, setDesc] = useState(provider?.description || '');
  const [color, setColor] = useState(provider?.color || 'bg-blue-600');
  const [logoUrl, setLogoUrl] = useState(provider?.logoUrl || '');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [logoMode, setLogoMode] = useState<'upload' | 'url'>('upload');
  const [directUrl, setDirectUrl] = useState(provider?.logoUrl?.startsWith('http') ? provider.logoUrl : '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resolvedHex = resolveColorToHex(color);

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessingImage(true);
      const dataUrl = await resizeImageFile(file, 256);
      setLogoUrl(dataUrl);
    } catch (err: any) {
      alert(err.message || 'Помилка оптимізації логотипу');
    } finally {
      setIsProcessingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleColorPreset = (preset: ColorPreset) => {
    setColor(preset.hex);
  };

  const brandPresets = COLOR_PRESETS.filter(p => p.category === 'brands');
  const vibrantPresets = COLOR_PRESETS.filter(p => p.category === 'vibrant');
  const neutralPresets = COLOR_PRESETS.filter(p => p.category === 'neutral');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl w-full max-w-lg shadow-2xl border border-gray-200 dark:border-gray-800 max-h-[92vh] overflow-y-auto my-auto space-y-5">
        <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-3">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            {provider ? 'Редагувати постачальника' : 'Додати нового постачальника'}
          </h3>
          <button 
            onClick={onClose} 
            className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={20}/>
          </button>
        </div>

        {/* Live Preview Card */}
        <div className="bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/60 rounded-2xl p-4 flex items-center gap-4">
          <div 
            style={{ backgroundColor: resolvedHex }}
            className="w-16 h-16 rounded-2xl text-white flex items-center justify-center font-bold text-2xl shadow-md shrink-0 overflow-hidden relative transition-all"
          >
            {logoUrl ? (
              <img src={logoUrl} alt={name || 'Лого'} className="w-full h-full object-contain p-2.5 drop-shadow-sm" />
            ) : (
              <span>{name ? name.charAt(0).toUpperCase() : 'AI'}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Попередній перегляд</div>
            <h4 className="font-bold text-gray-900 dark:text-white text-base truncate">{name || 'Назва постачальника'}</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{desc || 'Опис постачальника буде відображатись тут...'}</p>
          </div>
        </div>

        {/* Name & Description */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
              Назва постачальника *
            </label>
            <input 
              className="w-full p-2.5 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" 
              placeholder="напр. OpenAI, Anthropic, Google..." 
              value={name} 
              onChange={e=>setName(e.target.value)} 
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
              Опис
            </label>
            <textarea 
              rows={2}
              className="w-full p-2.5 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" 
              placeholder="Короткий опис сервісу та його можливостей" 
              value={desc} 
              onChange={e=>setDesc(e.target.value)} 
            />
          </div>
        </div>

        {/* Logo Upload Section */}
        <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Логотип постачальника
            </label>
            <div className="flex gap-1 text-xs">
              <button 
                type="button"
                onClick={() => setLogoMode('upload')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${logoMode === 'upload' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
              >
                Файл
              </button>
              <button 
                type="button"
                onClick={() => setLogoMode('url')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${logoMode === 'url' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
              >
                URL
              </button>
            </div>
          </div>

          {logoMode === 'upload' ? (
            <div className="space-y-2">
              <input 
                ref={fileInputRef}
                type="file" 
                accept="image/png,image/jpeg,image/svg+xml,image/webp" 
                onChange={handleImageFileChange} 
                className="hidden" 
                id="provider-logo-file"
              />
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 rounded-2xl p-4 text-center cursor-pointer transition-colors bg-gray-50/50 dark:bg-gray-800/30 flex flex-col items-center justify-center gap-2 group"
              >
                <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl group-hover:scale-110 transition-transform">
                  <Upload size={20} />
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {isProcessingImage ? 'Обробка зображення...' : 'Натисніть для вибору логотипу'}
                  </span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Підтримуються PNG, SVG, JPG, WebP (автоматичне масштабування)</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <input 
                type="url"
                value={directUrl}
                onChange={e => {
                  setDirectUrl(e.target.value);
                  setLogoUrl(e.target.value);
                }}
                placeholder="https://example.com/logo.png"
                className="flex-1 p-2.5 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {logoUrl && (
            <div className="mt-2.5 flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-xs">
              <span className="text-gray-600 dark:text-gray-300 truncate max-w-[260px] font-medium flex items-center gap-1.5">
                <Check size={14} className="text-emerald-500 shrink-0" />
                Логотип завантажено
              </span>
              <button 
                type="button" 
                onClick={() => { setLogoUrl(''); setDirectUrl(''); }}
                className="text-red-500 hover:text-red-600 font-medium px-2 py-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Видалити лого
              </button>
            </div>
          )}
        </div>

        {/* Color Presets & Selector Section */}
        <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3">
          <div className="flex justify-between items-center">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
              <Palette size={14} className="text-blue-500" />
              Колір постачальника
            </label>
            <div className="flex items-center gap-2">
              <span 
                className="w-4 h-4 rounded-full border border-black/20 shadow-xs" 
                style={{ backgroundColor: resolvedHex }}
              />
              <span className="text-xs font-mono font-medium text-gray-700 dark:text-gray-300">{resolvedHex}</span>
            </div>
          </div>

          {/* AI Brands Presets */}
          <div>
            <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">Фірмові ШІ:</div>
            <div className="flex flex-wrap gap-2">
              {brandPresets.map(preset => {
                const isSelected = resolvedHex.toLowerCase() === preset.hex.toLowerCase();
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleColorPreset(preset)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                      isSelected 
                        ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 shadow-xs' 
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <span 
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs flex items-center justify-center text-white" 
                      style={{ backgroundColor: preset.hex }}
                    >
                      {isSelected && <Check size={10} />}
                    </span>
                    <span>{preset.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vibrant Presets Grid */}
          <div>
            <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">Яскраві заготовки:</div>
            <div className="grid grid-cols-8 gap-2">
              {vibrantPresets.map(preset => {
                const isSelected = resolvedHex.toLowerCase() === preset.hex.toLowerCase();
                return (
                  <button
                    key={preset.name}
                    type="button"
                    title={preset.name}
                    onClick={() => handleColorPreset(preset)}
                    style={{ backgroundColor: preset.hex }}
                    className={`h-8 rounded-xl shadow-xs transition-transform hover:scale-110 flex items-center justify-center text-white ${
                      isSelected ? 'ring-3 ring-offset-2 ring-blue-500 scale-105' : ''
                    }`}
                  >
                    {isSelected && <Check size={14} className="drop-shadow" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Neutral Presets */}
          <div>
            <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">Нейтральні / Темні:</div>
            <div className="flex gap-2">
              {neutralPresets.map(preset => {
                const isSelected = resolvedHex.toLowerCase() === preset.hex.toLowerCase();
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleColorPreset(preset)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                      isSelected 
                        ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 shadow-xs' 
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <span 
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs flex items-center justify-center text-white" 
                      style={{ backgroundColor: preset.hex }}
                    >
                      {isSelected && <Check size={10} />}
                    </span>
                    <span>{preset.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Color Input & Picker */}
          <div className="pt-1">
            <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Власний колір (HEX код або клас Tailwind):
            </div>
            <div className="flex items-center gap-2">
              <label 
                style={{ backgroundColor: resolvedHex }}
                className="w-10 h-10 rounded-xl cursor-pointer border border-black/10 shrink-0 shadow-sm flex items-center justify-center text-white hover:scale-105 transition-transform"
                title="Відкрити палітру кольорів"
              >
                <input 
                  type="color" 
                  value={resolvedHex.startsWith('#') && resolvedHex.length === 7 ? resolvedHex : '#2563EB'} 
                  onChange={e => setColor(e.target.value)} 
                  className="opacity-0 w-0 h-0 cursor-pointer"
                />
                <Palette size={18} className="drop-shadow" />
              </label>

              <input 
                type="text"
                className="flex-1 p-2.5 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" 
                placeholder="#3B82F6 або bg-blue-500" 
                value={color} 
                onChange={e=>setColor(e.target.value)} 
              />
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              Підтримує HEX (<code className="font-mono text-blue-600 dark:text-blue-400">#6366F1</code>), Tailwind класи (<code className="font-mono text-blue-600 dark:text-blue-400">bg-blue-500</code>) та клік на палітру.
            </p>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="flex gap-2.5 justify-end border-t border-gray-100 dark:border-gray-800 pt-4">
          <button 
            type="button"
            onClick={onClose} 
            className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
          >
            Скасувати
          </button>
          <button 
            type="button"
            disabled={!name.trim()}
            onClick={() => onSave({ name: name.trim(), description: desc.trim(), color: color.trim() || '#2563EB', logoUrl: logoUrl || '' })} 
            className="px-5 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl shadow-md transition-colors"
          >
            Зберегти
          </button>
        </div>
      </div>
    </div>
  );
}

function ModelFormModal({ model, providers, apiModels, onClose, onSave }: any) {
  const [name, setName] = useState(model?.name || '');
  const [desc, setDesc] = useState(model?.description || '');
  const [apiId, setApiId] = useState(model?.apiModelId || (apiModels && apiModels.length > 0 ? apiModels[0].id : ''));
  const [price, setPrice] = useState(model?.priceInfo || '');
  const [shortPrice, setShortPrice] = useState(model?.shortPriceInfo || '');
  const [providerId, setProviderId] = useState(model?.providerId || (providers[0]?.id || ''));
  const [tier, setTier] = useState(model?.tier || 'common');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl w-full max-w-md shadow-2xl border border-gray-200 dark:border-gray-800 max-h-[92vh] overflow-y-auto my-auto space-y-4">
        <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-3">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            {model ? 'Редагувати модель' : 'Додати нову модель'}
          </h3>
          <button 
            onClick={onClose} 
            className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={20}/>
          </button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
            Постачальник *
          </label>
          <select 
            className="w-full p-2.5 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" 
            value={providerId} 
            onChange={e=>setProviderId(e.target.value)}
          >
            {providers.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        
        {apiModels && apiModels.length > 0 ? (
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
              Модель із API *
            </label>
            <select 
              className="w-full p-2.5 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" 
              value={apiId} 
              onChange={e => {
                const val = e.target.value;
                setApiId(val);
                const found = apiModels.find((m: any) => m.id === val);
                if (found && !name) setName(found.name);
              }}
            >
              <option value="" disabled>Оберіть модель зі списку доступних</option>
              {apiModels.map((m: any) => (
                <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
              API ID моделі *
            </label>
            <input 
              className="w-full p-2.5 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" 
              placeholder="API ID (напр. gpt-4o)" 
              value={apiId} 
              onChange={e=>setApiId(e.target.value)} 
            />
          </div>
        )}
        
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
            Назва моделі *
          </label>
          <input 
            className="w-full p-2.5 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" 
            placeholder="Назва (напр. GPT-4o)" 
            value={name} 
            onChange={e=>setName(e.target.value)} 
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
              Коротка ціна
            </label>
            <input 
              className="w-full p-2.5 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" 
              placeholder="напр. $5-$30" 
              value={shortPrice} 
              onChange={e=>setShortPrice(e.target.value)} 
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
              Рівень (RPG Tier)
            </label>
            <select 
              className="w-full p-2.5 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" 
              value={tier} 
              onChange={e=>setTier(e.target.value)}
            >
              <option value="common">Звичайний (Common)</option>
              <option value="uncommon">Незвичайний (Uncommon)</option>
              <option value="rare">Рідкісний (Rare)</option>
              <option value="epic">Епічний (Epic)</option>
              <option value="legendary">Легендарний (Legendary)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
            Повний опис ціни
          </label>
          <input 
            className="w-full p-2.5 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" 
            placeholder="напр. $5 вхід / $30 вихід за 1М токенів" 
            value={price} 
            onChange={e=>setPrice(e.target.value)} 
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
            Опис моделі
          </label>
          <textarea 
            rows={2}
            className="w-full p-2.5 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" 
            placeholder="Опис можливостей моделі..." 
            value={desc} 
            onChange={e=>setDesc(e.target.value)} 
          />
        </div>

        <div className="flex gap-2.5 justify-end border-t border-gray-100 dark:border-gray-800 pt-4">
          <button 
            type="button"
            onClick={onClose} 
            className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
          >
            Скасувати
          </button>
          <button 
            type="button"
            disabled={!name.trim() || !apiId.trim()}
            onClick={() => onSave({ name: name.trim(), description: desc.trim(), apiModelId: apiId.trim(), priceInfo: price.trim(), shortPriceInfo: shortPrice.trim(), providerId, tier })} 
            className="px-5 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl shadow-md transition-colors"
          >
            Зберегти
          </button>
        </div>
      </div>
    </div>
  );
}
