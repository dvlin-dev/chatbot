// Define your models here.

export interface Model {
  id: string;
  label: string;
  apiIdentifier: string;
  description: string;
}

export const models: Array<Model> = [
  {
    id: 'grok-3-fast-latest',
    label: 'grok-3-fast-latest',
    apiIdentifier: 'grok/grok-3-fast-latest',
    description: 'For chat',
  },
  // {
  //   id: 'gpt-4o',
  //   label: 'gpt-4o',
  //   apiIdentifier: 'openai/gpt-4o-2024-11-20',
  //   description: 'For chat',
  // },

] as const;

export const DEFAULT_MODEL_NAME: string = 'grok-3-fast-latest';
