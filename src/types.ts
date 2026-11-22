export type ModelMediaType = 'text' | 'image' | 'video';

export interface MediaAttachment {
  id: string;
  type: 'image' | 'video';
  url: string;
  localRef?: string;
  mimeType?: string;
  prompt?: string;
}

export interface Provider {
  id: string;
  name: string;
  description: string;
  color: string;
  logoUrl?: string;
}

export interface AiModel {
  id: string; // The ID used in the UI
  providerId: string;
  name: string;
  description: string;
  priceInfo: string;
  shortPriceInfo?: string;
  apiModelId: string; // The actual ID to send to the Scout AI API
  tier?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  modelType?: ModelMediaType;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  modelId: string;
  webSearchEnabled: boolean;
  webReaderEnabled?: boolean;
  searchUrl: string;
  color?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}
