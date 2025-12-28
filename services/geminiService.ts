
import { GoogleGenAI, Type } from "@google/genai";
import { SafetyScore } from "../types";

export const getSafetyAnalysis = async (neighborhoodName: string, quadrantId: string): Promise<SafetyScore> => {
  // Always use named parameter for apiKey and obtain it exclusively from process.env.API_KEY
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Use Gemini 3 Pro with thinking for complex safety analysis
  const prompt = `Analyze current safety data and recent news for the neighborhood "${neighborhoodName}" (Quadrant ID: ${quadrantId}) in Bogotá, Colombia. 
  Provide a detailed safety report including:
  1. A safety score from 0 to 10 (where 10 is safest).
  2. Theft risk level (Low, Moderate, High).
  3. Violent crime risk level (Low, Moderate, High).
  4. A summary of recent safety concerns or improvements using search grounding.
  
  Return the analysis in a structured JSON format.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 32768 },
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            theftRisk: { type: Type.STRING },
            violentCrime: { type: Type.STRING },
            insights: { type: Type.STRING },
          },
          required: ["score", "theftRisk", "violentCrime", "insights"]
        }
      },
    });

    // Access .text property directly (not a method). 
    // If search grounding is used, the response.text might contain citations that break JSON.
    const text = response.text || '{}';
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // Fallback: Attempt to extract JSON block if search citations interfere with parsing
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      data = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    }

    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
      title: chunk.web?.title || 'Fuente',
      uri: chunk.web?.uri || '#'
    })) || [];

    return {
      score: typeof data.score === 'number' ? data.score : 5.0,
      theftRisk: data.theftRisk || 'Moderate',
      violentCrime: data.violentCrime || 'Moderate',
      insights: data.insights || 'No hay datos recientes disponibles.',
      sources: sources
    };
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    return {
      score: 0,
      theftRisk: 'Moderate',
      violentCrime: 'Moderate',
      insights: 'Error al obtener análisis de IA. Por favor, intente de nuevo.',
      sources: []
    };
  }
};
