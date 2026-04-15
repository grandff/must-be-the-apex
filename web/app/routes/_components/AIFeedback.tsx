/**
 * AI 피드백 팝업 컴포넌트 (클레이모피즘 스타일)
 */

import { useState, useEffect } from 'react';
import type { AnalyzeResult } from '~/lib/llmClient';

interface AIFeedbackProps {
  feedback: AnalyzeResult | null;
  lapNumber: number;
  lapTime: string;
  onClose: () => void;
}

export function AIFeedback({ feedback, lapNumber, lapTime, onClose }: AIFeedbackProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (feedback) {
      setVisible(true);
    }
  }, [feedback]);

  if (!visible || !feedback) return null;

  return (
    <div className="ai-feedback-overlay" onClick={onClose}>
      <div className="ai-feedback-popup" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="ai-feedback-header">
          <div className="ai-header-left">
            <span className="ai-icon">🤖</span>
            <span className="ai-title">AI Race Engineer</span>
          </div>
          <button className="ai-close" onClick={onClose}>×</button>
        </div>

        {/* 랩 정보 */}
        <div className="ai-lap-info">
          <span className="ai-lap-badge">Lap {lapNumber}</span>
          <span className="ai-lap-time">{lapTime}</span>
        </div>

        {/* 전체 요약 */}
        <div className="ai-summary">
          {feedback.summary}
        </div>

        {/* 델타 */}
        {feedback.overallDelta && (
          <div className="ai-delta">
            {feedback.overallDelta}
          </div>
        )}

        {/* 강점 */}
        {feedback.strengths.length > 0 && (
          <div className="ai-section ai-strengths">
            <div className="ai-section-title">💪 강점</div>
            <ul>
              {feedback.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 개선점 */}
        {feedback.weaknesses.length > 0 && (
          <div className="ai-section ai-weaknesses">
            <div className="ai-section-title">⚠️ 개선점</div>
            <ul>
              {feedback.weaknesses.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 팁 */}
        {feedback.tips.length > 0 && (
          <div className="ai-section ai-tips">
            <div className="ai-section-title">💡 팁</div>
            <ul>
              {feedback.tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
