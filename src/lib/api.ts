const BASE_URLS = [
  'https://scout-ai.pp.ua/v1',
  'https://ionic-5r01.onrender.com/v1'
];

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
}

export interface Model {
  id: string;
  name: string;
}

async function fetchWithFallback(path: string, options: RequestInit) {
  let lastError = null;
  for (const baseUrl of BASE_URLS) {
    try {
      const response = await fetch(`${baseUrl}${path}`, options);
      if (response.status === 401) {
        throw new Error("Невірний API ключ (помилка 401). Перевірте налаштування.");
      }
      if (response.status === 402) {
        throw new Error("Недостатньо коштів на балансі (помилка 402). Поповніть рахунок.");
      }
      if (!response.ok) {
        throw new Error(`HTTP помилка ${response.status} від ${baseUrl}`);
      }
      return await response.json();
    } catch (error: any) {
      console.warn(`Запит не вдався для ${baseUrl}, пробуємо наступний...`, error);
      lastError = error;
      if (error.message && (error.message.includes("401") || error.message.includes("402"))) {
        throw error;
      }
    }
  }
  throw lastError || new Error("Всі сервери недоступні");
}

export async function fetchModels(apiKey: string): Promise<Model[]> {
  try {
    const data = await fetchWithFallback('/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (data && data.data) {
      return data.data.map((m: any) => ({
        id: m.id,
        name: m.id
      }));
    }
    return [];
  } catch (error) {
    console.error("Помилка завантаження моделей:", error);
    throw error;
  }
}

export async function generateChatResponse(
  apiKey: string,
  modelId: string,
  prompt: string,
  history: Message[]
): Promise<string> {
  const messages = history.map(msg => ({
    role: msg.role === 'model' ? 'assistant' : 'user',
    content: msg.text
  }));
  messages.push({ role: 'user', content: prompt });

  const data = await fetchWithFallback('/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelId,
      messages: messages,
    })
  });

  if (data && data.choices && data.choices.length > 0) {
    return data.choices[0].message.content;
  }
  throw new Error("Некоректна відповідь від API");
}
