import { PaymentRailAdapter } from '../types';

const adapters = new Map<string, PaymentRailAdapter>();

export function registerAdapter(adapter: PaymentRailAdapter) {
  adapters.set(adapter.providerId, adapter);
}

export function getAdapter(providerId: string): PaymentRailAdapter | undefined {
  return adapters.get(providerId);
}

export function listAdapters(): PaymentRailAdapter[] {
  return Array.from(adapters.values());
}
