// Define your models here.

export interface Model {
  id: string;
  label: string;
  apiIdentifier: string;
  description: string;
}

export const models: Array<Model> = [
  {
    id: 'claude-3.5-sonnet',
    label: 'claude-3.5-sonnet',
    apiIdentifier: 'anthropic/claude-3.5-sonnet',
    description: 'For code',
  },
  // {
  //   id: 'gpt-4o',
  //   label: 'gpt-4o',
  //   apiIdentifier: 'openai/gpt-4o-2024-11-20',
  //   description: 'For chat',
  // },

] as const;

export const DEFAULT_MODEL_NAME: string = 'claude-3.5-sonnet';
