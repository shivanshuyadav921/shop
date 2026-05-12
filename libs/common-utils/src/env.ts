import dotenv from 'dotenv';
import path from 'path';

export const loadEnv = () => {
  const envPath = path.resolve(process.cwd(), '.env');
  dotenv.config({ path: envPath });
};

export const getEnv = (key: string, fallback?: string) => {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const requireProductionSecret = (key: string, value: string, disallowedValues: string[] = []) => {
  if (process.env.NODE_ENV !== 'production') return value;
  if (!value || disallowedValues.includes(value) || value.length < 32) {
    throw new Error(`Production environment variable ${key} must be set to a strong non-default value.`);
  }
  return value;
};
