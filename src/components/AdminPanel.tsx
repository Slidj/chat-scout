import { useState, useEffect } from 'react';
import { getProviders, getModels, saveProvider, updateProvider, deleteProvider, saveModel, updateModel, deleteModel } from '../lib/db';
import { fetchModels } from '../lib/api';
import { Provider, AiModel } from '../types';
import { Plus, Edit2, Trash2, X } from 'lucide-react';

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

  // Very simple rendering for brevity
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
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Постачальники</h3>
            <button onClick={() => setIsAddingProvider(true)} className="flex items-center gap-1 text-sm bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg"><Plus size={16}/> Додати</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {providers.map(p => (
              <div key={p.id} className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-bold text-gray-900 dark:text-white">{p.name}</h4>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingProvider(p)} className="text-gray-500 hover:text-blue-600"><Edit2 size={16}/></button>
                    <button onClick={async () => { await deleteProvider(p.id); loadData(); }} className="text-gray-500 hover:text-red-600"><Trash2 size={16}/></button>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{p.description}</p>
                <div className={`mt-2 w-full h-2 rounded-full ${p.color}`}></div>
              </div>
            ))}
          </div>
        </section>

        {/* Models Section */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Моделі</h3>
            <button onClick={() => setIsAddingModel(true)} className="flex items-center gap-1 text-sm bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg"><Plus size={16}/> Додати</button>
          </div>
          <div className="space-y-3">
            {models.map(m => (
              <div key={m.id} className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 flex justify-between items-center">
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white">{m.name} <span className="text-xs font-normal text-gray-500 ml-2">({providers.find(p=>p.id === m.providerId)?.name})</span></h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{m.apiModelId} • {m.priceInfo}</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setEditingModel(m)} className="text-gray-500 hover:text-blue-600"><Edit2 size={18}/></button>
                  <button onClick={async () => { await deleteModel(m.id); loadData(); }} className="text-gray-500 hover:text-red-600"><Trash2 size={18}/></button>
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
          onSave={async (p) => {
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
          onSave={async (m) => {
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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl w-full max-w-md">
        <h3 className="text-lg font-bold mb-4">{provider ? 'Редагувати' : 'Додати'} Постачальника</h3>
        <input className="w-full mb-3 p-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 rounded" placeholder="Назва" value={name} onChange={e=>setName(e.target.value)} />
        <textarea className="w-full mb-3 p-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 rounded" placeholder="Опис" value={desc} onChange={e=>setDesc(e.target.value)} />
        <input className="w-full mb-4 p-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 rounded" placeholder="Колір (напр. bg-blue-600)" value={color} onChange={e=>setColor(e.target.value)} />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-gray-600">Скасувати</button>
          <button onClick={() => onSave({ name, description: desc, color })} className="px-4 py-2 bg-blue-600 text-white rounded">Зберегти</button>
        </div>
      </div>
    </div>
  )
}

function ModelFormModal({ model, providers, apiModels, onClose, onSave }: any) {
  const [name, setName] = useState(model?.name || '');
  const [desc, setDesc] = useState(model?.description || '');
  const [apiId, setApiId] = useState(model?.apiModelId || (apiModels && apiModels.length > 0 ? apiModels[0].id : ''));
  const [price, setPrice] = useState(model?.priceInfo || '');
  const [providerId, setProviderId] = useState(model?.providerId || (providers[0]?.id || ''));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl w-full max-w-md">
        <h3 className="text-lg font-bold mb-4">{model ? 'Редагувати' : 'Додати'} Модель</h3>
        <select className="w-full mb-3 p-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded" value={providerId} onChange={e=>setProviderId(e.target.value)}>
          {providers.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        
        {apiModels && apiModels.length > 0 ? (
          <select 
            className="w-full mb-3 p-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded" 
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
        ) : (
          <input className="w-full mb-3 p-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 rounded" placeholder="API ID (напр. gpt-4o)" value={apiId} onChange={e=>setApiId(e.target.value)} />
        )}
        
        <input className="w-full mb-3 p-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 rounded" placeholder="Назва (напр. GPT-4o)" value={name} onChange={e=>setName(e.target.value)} />
        <input className="w-full mb-3 p-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 rounded" placeholder="Ціна (напр. $5 / 1M)" value={price} onChange={e=>setPrice(e.target.value)} />
        <textarea className="w-full mb-4 p-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 rounded" placeholder="Опис" value={desc} onChange={e=>setDesc(e.target.value)} />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-gray-600">Скасувати</button>
          <button onClick={() => onSave({ name, description: desc, apiModelId: apiId, priceInfo: price, providerId })} className="px-4 py-2 bg-blue-600 text-white rounded">Зберегти</button>
        </div>
      </div>
    </div>
  )
}
