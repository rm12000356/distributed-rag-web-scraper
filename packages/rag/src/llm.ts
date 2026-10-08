import OpenAI from "openai";

export interface LLMProvider {
  generate(prompt: string): Promise<string>;
  readonly model: string;
}

export function createOpenAILLM(apiKey?: string, model?: string): LLMProvider {
  const key = apiKey ?? process.env["OPENAI_API_KEY"] ?? "";
  const baseURL = process.env["OPENAI_BASE_URL"] ?? "https://api.openai.com/v1";
  const modelName = model ?? process.env["OPENAI_LLM_MODEL"] ?? "gpt-4o-mini";

  const client = new OpenAI({ apiKey: key, baseURL });

  async function generateWithRetry(prompt: string, attempt = 1): Promise<string> {
    try {
      const response = await client.chat.completions.create({
        model: modelName,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      });
      return response.choices[0]?.message?.content ?? "";
    } catch (err: unknown) {
      const httpErr = err as { status?: number };
      if ((httpErr.status === 429 || (httpErr.status && httpErr.status >= 500)) && attempt < 4) {
        const delay = Math.min(1000 * 2 ** (attempt - 1) + Math.random() * 1000, 16000);
        await new Promise((r) => setTimeout(r, delay));
        return generateWithRetry(prompt, attempt + 1);
      }
      throw err;
    }
  }

  return {
    model: modelName,

    async generate(prompt: string): Promise<string> {
      return generateWithRetry(prompt);
    },
  };
}
