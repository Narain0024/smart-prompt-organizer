import { z } from 'zod';

export const PROVIDER_IDS = ['anthropic', 'openai', 'gemini', 'ollama'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

const text = (max: number) => z.string().trim().max(max);

export const PromptInput = z.object({
  title: text(200).min(1),
  content: z.string().min(1).max(200_000),
  description: text(1000).nullish(),
  category: text(100).nullish(),
  platform: text(100).nullish(),
  notes: z.string().max(20_000).nullish(),
  projectId: z.string().nullish(),
  tags: z.array(text(50).min(1)).max(50).default([]),
  isFavorite: z.boolean().default(false),
  isPinned: z.boolean().default(false),
});
export type PromptInput = z.infer<typeof PromptInput>;

export const PromptUpdate = PromptInput.partial().extend({
  archived: z.boolean().optional(),
  changeReason: text(500).optional(),
});
export type PromptUpdate = z.infer<typeof PromptUpdate>;

export const SecretInput = z.object({ apiKey: z.string().min(1).max(500) });

export interface Prompt {
  id: string; title: string; content: string;
  description: string | null; category: string | null; platform: string | null;
  notes: string | null; projectId: string | null; tags: string[];
  isFavorite: boolean; isPinned: boolean; archived: boolean;
  version: number; createdAt: string; updatedAt: string;
}
export interface PromptVersion {
  version: number; title: string; content: string;
  changeReason: string | null; createdAt: string;
}
