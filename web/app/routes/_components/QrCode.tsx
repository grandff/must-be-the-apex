/**
 * QR 코드 생성 컴포넌트
 * 현재设备的 IP 주소로 QR 코드 생성
 */

import { useEffect, useState } from 'react';

interface QrCodeProps {
  port?: number;
}

export function QrCode({ port = 3000 }: QrCodeProps) {
  const [url, setUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 클라이언트에서만 실행
    if (typeof window === 'undefined') return;

    // 로컬 IP 가져오기
    const getLocalIp = async () => {
      try {
        // WebRTC를 사용해서 로컬 IP 획득 (STUN 서버 이용)
        const pc = new RTCPeerConnection({ iceServers: [] });
        pc.createDataChannel('');
        
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        // candidates에서 IP 추출
        return new Promise<string>((resolve) => {
          let localIp = 'localhost';
          
          pc.addEventListener('icecandidate', (e) => {
            if (!e.candidate) return;
            const candidate = e.candidate.candidate;
            const ipMatch = candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);
            if (ipMatch && !ipMatch[0].startsWith('127.')) {
              localIp = ipMatch[0];
            }
          });
          
          setTimeout(() => {
            pc.close();
            resolve(localIp);
          }, 1000);
        });
      } catch {
        return 'localhost';
      }
    };

    const init = async () => {
      const ip = await getLocalIp();
      setUrl(`http://${ip}:${port}`);
      setLoading(false);
    };

    init();
  }, [port]);

  // QR 코드 API 사용
  const qrCodeUrl = url
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`
    : '';

  if (loading) {
    return (
      <div className="qr-code-container">
        <div className="qr-loading">IP 확인 중...</div>
      </div>
    );
  }

  return (
    <div className="qr-code-container">
      <div className="qr-code-header">
        <span className="qr-label">모바일 대시보드 접속</span>
      </div>
      <img
        src={qrCodeUrl}
        alt="QR Code"
        className="qr-code-image"
        width={200}
        height={200}
      />
      <div className="qr-url">{url}</div>
      <div className="qr-hint">
        QR 코드를 스캔하거나 브라우저에서 직접 입력하세요
      </div>
    </div>
  );
}
