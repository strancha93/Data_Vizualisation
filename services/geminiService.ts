import { GoogleGenAI } from "@google/genai";
import { SignalData } from "../types";

const parseApiKey = (): string | undefined => {
  try {
    return process.env.API_KEY;
  } catch (e) {
    return undefined;
  }
};

export const analyzeSignal = async (signal: SignalData): Promise<string> => {
  const apiKey = parseApiKey();
  if (!apiKey) {
    return "API Key not found. Please ensure the environment variable API_KEY is set.";
  }

  const ai = new GoogleGenAI({ apiKey });

  // Downsample for token efficiency if data is too large
  const maxPoints = 150;
  const step = Math.ceil(signal.data.length / maxPoints);
  const sampledData = signal.data.filter((_, i) => i % step === 0);
  
  const stats = signal.stats || {
    min: Math.min(...signal.data),
    max: Math.max(...signal.data),
    mean: signal.data.reduce((a, b) => a + b, 0) / signal.data.length,
  };

  const prompt = `
    Analyze the following time-series signal data from a Matlab simulation.
    
    Signal Name: ${signal.name}
    Path: ${signal.path.join('/')}
    Statistics:
    - Min: ${stats.min.toFixed(4)}
    - Max: ${stats.max.toFixed(4)}
    - Mean: ${stats.mean.toFixed(4)}
    
    Sampled Data Points (first ${sampledData.length} representative points):
    ${JSON.stringify(sampledData)}

    Please provide a concise technical analysis covering:
    1. Trend analysis (increasing, decreasing, stable, oscillatory).
    2. Identification of any obvious anomalies, spikes, or noise.
    3. Physical interpretation if the name suggests a physical quantity.
    
    Format the response in Markdown. Keep it brief and professional.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "No analysis generated.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Failed to generate analysis. Please try again.";
  }
};
