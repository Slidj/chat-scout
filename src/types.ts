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
}
