import { config } from '../config';

type VerificationKind = 'pan' | 'gst' | 'bank';

interface VerificationResponse {
  valid: boolean;
  reference?: string;
  reason?: string;
  raw?: unknown;
}

export async function verifyWithProvider(kind: VerificationKind, payload: Record<string, unknown>): Promise<VerificationResponse | null> {
  if (!config.verificationApiBaseUrl) return null;

  const response = await fetch(`${config.verificationApiBaseUrl.replace(/\/$/, '')}/verify/${kind}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.verificationApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`${kind.toUpperCase()} verification provider returned ${response.status}`);
  }

  const body = await response.json() as Record<string, unknown>;
  return {
    valid: body.valid === true,
    reference: typeof body.reference === 'string' ? body.reference : undefined,
    reason: typeof body.reason === 'string' ? body.reason : undefined,
    raw: body,
  };
}
