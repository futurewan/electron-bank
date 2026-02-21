import axios from 'axios';
import { aiConfig, AIKeyManager } from '../config/aiStore';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CompletionResponse {
  content: string;
  usage?: {
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
  };
}

const DEFAULT_DEEPSEEK_ENDPOINT = 'https://api.deepseek.com';

export class AIError extends Error {
  constructor(message: string, public type: string = 'UNKNOWN_ERROR') {
    super(message);
    this.name = 'AIError';
  }
}

// ... existing code ...

export class AIService {
  private static instance: AIService;

  private constructor() { }

  static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  resetClient() {
    // Reset client or configuration if needed
    console.log('[AI] Client reset');
  }

  async validateApiKey(provider: string): Promise<{ valid: boolean; error?: string }> {
    // TODO: Implement actual validation against provider API
    const apiKey = AIKeyManager.getApiKey(provider);
    if (!apiKey) return { valid: false, error: 'No API Key found' };
    return { valid: true };
  }

  async analyze(data: any, prompt: string): Promise<{ result: string, tokens: number, model: string }> {
    const response = await this.callDeepSeek(
      [{ role: 'user', content: `${prompt}\n\nData Context:\n${JSON.stringify(data, null, 2)}` }],
      0.7
    );
    return {
      result: response.content,
      tokens: response.usage?.total_tokens || 0,
      model: aiConfig.get().model || 'deepseek-chat'
    };
  }

  /**
   * Call DeepSeek API with retry logic for rate limits
   */
  async callDeepSeek(
    messages: ChatMessage[],
    temperature: number = 0.7,
    model?: string
  ): Promise<CompletionResponse> {
    const config = aiConfig.get();

    // Validate Provider
    if (config.provider !== 'deepseek' && config.provider !== 'custom') {
      // Fallback or error? For this task we focus on DeepSeek
      // But if user selected 'custom' they might point to DeepSeek compatible
      // Let's assume we proceed if provider is deepseek
    }

    const apiKey = AIKeyManager.getApiKey('deepseek');
    if (!apiKey && config.provider === 'deepseek') {
      throw new Error('DeepSeek API Key is not configured.');
    }

    const endpoint = config.customEndpoint || DEFAULT_DEEPSEEK_ENDPOINT;
    const targetModel = model || config.model || 'deepseek-chat';

    const client = axios.create({
      baseURL: endpoint,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000, // 60s timeout
    });

    let retries = 3;
    let delay = 1000;

    // 记录请求日志
    console.log('[AI] --- DeepSeek Request ---');
    console.log(`[AI] Model: ${targetModel}`);
    console.log(`[AI] Messages: ${JSON.stringify(messages, null, 2)}`);
    console.log(`[AI] Temperature: ${temperature}`);

    while (retries > 0) {
      try {
        const response = await client.post('/chat/completions', {
          model: targetModel,
          messages,
          temperature,
          max_tokens: config.maxTokens || 4000,
          response_format: { type: 'json_object' } // DeepSeek supports this for strict JSON
        });

        // 记录响应日志
        console.log('[AI] --- DeepSeek Response ---');
        console.log(`[AI] Response: ${JSON.stringify(response.data, null, 2)}`);

        const choice = response.data.choices[0];
        const content = choice.message.content;
        const usage = response.data.usage;

        // Update stats
        if (usage?.total_tokens) {
          aiConfig.addTokensUsed(usage.total_tokens);
        }

        return {
          content,
          usage
        };

      } catch (error: any) {
        if (error.response?.status === 429) {
          console.warn(`[AI] Rate limit hit, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
          retries--;
        } else {
          // Log specific error message
          const msg = error.response?.data?.error?.message || error.message;
          console.error('[AI] DeepSeek API Error:', msg);
          throw new Error(`AI Service Error: ${msg}`);
        }
      }
    }

    throw new Error('Max retries exceeded for AI Service');
  }

  /**
   * Helper to ensure valid JSON response
   */
  async getJSON<T>(
    systemPrompt: string,
    userPrompt: string,
    temperature: number = 0.1
  ): Promise<T> {
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt + "\nIMPORTANT: Return only valid JSON." },
      { role: 'user', content: userPrompt }
    ];

    const response = await this.callDeepSeek(messages, temperature);
    try {
      // Remove markdown code blocks if present (DeepSeek sometimes adds ```json ... ```)
      const cleanContent = response.content.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleanContent) as T;
    } catch (e) {
      console.error('[AI] Failed to parse JSON:', response.content);
      throw new Error('AI response was not valid JSON');
    }
  }
} // End of class AIService

export const aiService = AIService.getInstance();
