import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, adminId, interviewId } = req.body;

    // 관리자 권한 확인
    if (!adminId || !adminId.toUpperCase().startsWith('ADMIN')) {
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    }

    // 전체 지원자 현황 조회
    if (action === 'getAll') {
      // 환경변수에서 지원자 명단 가져오기
      const candidatesJson = process.env.CANDIDATES_JSON;
      
      if (!candidatesJson) {
        return res.status(500).json({ error: '지원자 명단이 설정되지 않았습니다.' });
      }

      let candidateList;
      try {
        candidateList = JSON.parse(candidatesJson);
      } catch (e) {
        return res.status(500).json({ error: '지원자 명단 형식이 올바르지 않습니다.' });
      }

      // 각 지원자의 연습 현황 조회
      const candidates = [];
      
      for (const c of candidateList) {
        // 관리자는 목록에서 제외
        if (c.id.toUpperCase().startsWith('ADMIN')) continue;

        const practices = await kv.get(`practices:${c.id}`) || [];
        
        candidates.push({
          interviewId: c.id,
          count: practices.length,
          lastPractice: practices.length > 0 
            ? practices[practices.length - 1].timestamp 
            : null
        });
      }

      return res.status(200).json({ candidates });
    }

    // 특정 지원자 상세 조회
    if (action === 'getDetail' && interviewId) {
      const practices = await kv.get(`practices:${interviewId}`) || [];
      
      return res.status(200).json({
        interviewId,
        practices
      });
    }

    // 특정 지원자 연습 기록 초기화
    if (action === 'reset' && interviewId) {
      await kv.del(`practices:${interviewId}`);
      
      return res.status(200).json({ 
        success: true,
        message: `${interviewId}의 연습 기록이 초기화되었습니다.`
      });
    }

    // 전체 초기화 (주의!)
    if (action === 'resetAll') {
      const candidatesJson = process.env.CANDIDATES_JSON;
      
      if (candidatesJson) {
        const candidateList = JSON.parse(candidatesJson);
        
        for (const c of candidateList) {
          if (!c.id.toUpperCase().startsWith('ADMIN')) {
            await kv.del(`practices:${c.id}`);
          }
        }
      }

      return res.status(200).json({ 
        success: true,
        message: '전체 연습 기록이 초기화되었습니다.'
      });
    }

    return res.status(400).json({ error: '잘못된 요청입니다.' });

  } catch (error) {
    console.error('Admin API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
