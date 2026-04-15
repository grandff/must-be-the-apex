/**
 * LLM API 클라이언트 (OpenAI Compatible)
 * 로컬 Ollama, OpenAI, Anthropic 등 지원
 */

import type { CornerDelta } from '~/lib/lapAnalyzer';

// ============= 설정 =============

export interface LlmConfig {
  provider: 'openai' | 'anthropic' | 'ollama' | 'lmstudio';
  apiKey?: string;
  baseUrl: string;  // e.g., http://localhost:11434/v1
  model: string;   // e.g., llama3, gpt-4o, claude-3-5-sonnet
}

const DEFAULT_CONFIG: LlmConfig = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434/v1',
  model: 'llama3'
};

// ============= API Call =============

export interface AnalyzeResult {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  tips: string[];
  overallDelta: string; // 전체 델타 (예: "+0.5s faster")
}

/**
 * AI에게 랩 분석 요청
 */
export async function analyzeLapWithAI(
  trackName: string,
  lapNumber: number,
  lapTimeMs: number,
  cornerDeltas: CornerDelta[],
  config: LlmConfig = DEFAULT_CONFIG
): Promise<AnalyzeResult> {
  const prompt = buildPrompt(trackName, lapNumber, lapTimeMs, cornerDeltas);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: `You are an expert F1 race engineer analyzing telemetry data. 
Provide concise, actionable feedback for improving lap times.
Format your response as JSON with: summary, strengths[], weaknesses[], tips[], overallDelta`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response content');
    }

    return parseAIResponse(content);
  } catch (error) {
    console.error('[LlmClient] API call failed:', error);
    // 폴백 응답
    return generateFallbackAnalysis(trackName, lapNumber, lapTimeMs, cornerDeltas);
  }
}

/**
 * 프롬프트 생성
 */
function buildPrompt(
  trackName: string,
  lapNumber: number,
  lapTimeMs: number,
  cornerDeltas: CornerDelta[]
): string {
  const lapTimeFormatted = formatLapTime(lapTimeMs);
  
  // 코너 델타 포맷
  const deltaDetails = cornerDeltas.map(d => {
    const speedIcon = d.entrySpeedDiff > 0 ? '🔼' : d.entrySpeedDiff < 0 ? '🔽' : '➡️';
    return `Turn ${d.turn}: ${speedIcon} ${d.entrySpeedDiff > 0 ? '+' : ''}${d.entrySpeedDiff.toFixed(1)} km/h`;
  }).join('\n');

  return `Track: ${trackName}
Lap: ${lapNumber}
Lap Time: ${lapTimeFormatted}

Corner Analysis:
${deltaDetails || 'No corner delta data available'}

Provide feedback on how to improve this lap time. Focus on the corners where time can be gained.`;
}

/**
 * AI 응답 파싱
 */
function parseAIResponse(content: string): AnalyzeResult {
  try {
    // JSON 파싱 시도
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: parsed.summary || '분석을 완료했습니다.',
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
        tips: Array.isArray(parsed.tips) ? parsed.tips : [],
        overallDelta: parsed.overallDelta || ''
      };
    }
  } catch {
    // 파싱 실패, 텍스트로 처리
  }

  // 폴백: 텍스트 응답을 구조화
  return {
    summary: content.substring(0, 200),
    strengths: [],
    weaknesses: [],
    tips: [],
    overallDelta: ''
  };
}

/**
 * 폴백 분석 (API 실패 시)
 */
function generateFallbackAnalysis(
  trackName: string,
  lapNumber: number,
  lapTimeMs: number,
  cornerDeltas: CornerDelta[]
): AnalyzeResult {
  const lapTimeFormatted = formatLapTime(lapTimeMs);
  
  // 가장 큰 델타 찾기
  const biggestGain = cornerDeltas
    .filter(d => d.entrySpeedDiff > 0)
    .sort((a, b) => b.entrySpeedDiff - a.entrySpeedDiff)[0];

  const biggestLoss = cornerDeltas
    .filter(d => d.entrySpeedDiff < 0)
    .sort((a, b) => a.entrySpeedDiff - b.entrySpeedDiff)[0];

  const summary = biggestGain 
    ? `Turn ${biggestGain.turn}에서 가장 큰 발전이 있었습니다.`
    : biggestLoss
    ? `Turn ${biggestLoss.turn}에서 시간을 잃었습니다.`
    : ` جيد한 랩이었습니다!`;

  const tips = [];
  if (biggestGain) {
    tips.push(`Turn ${biggestGain.turn}의 진입 속도를 유지하세요.`);
  }
  if (biggestLoss) {
    tips.push(`Turn ${biggestLoss.turn}의 브레이킹 포인트를 개선하세요.`);
  }

  return {
    summary,
    strengths: biggestGain ? [`Turn ${biggestGain.turn}에서 +${biggestGain.entrySpeedDiff.toFixed(1)} km/h`] : [],
    weaknesses: biggestLoss ? [`Turn ${biggestLoss.turn}에서 ${biggestLoss.entrySpeedDiff.toFixed(1)} km/h 손실`] : [],
    tips,
    overallDelta: ''
  };
}

// ============= Helper =============

function formatLapTime(ms: number): string {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const mil = ms % 1000;
  return `${min}:${sec.toString().padStart(2, '0')}.${mil.toString().padStart(3, '0')}`;
}

/**
 * LLM 연결 테스트
 */
export async function testConnection(config: LlmConfig): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${config.baseUrl}/models`, {
      method: 'GET',
      headers: {
        ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {})
      }
    });

    if (response.ok) {
      return { success: true };
    }

    // Ollama는 다른 엔드포인트
    const ollamaResponse = await fetch(`${config.baseUrl.replace('/v1', '')}/api/tags`);
    if (ollamaResponse.ok) {
      return { success: true };
    }

    return { success: false, error: `Status: ${response.status}` };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
