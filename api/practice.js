import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // GET 요청 처리
    if (req.method === 'GET') {
      const { action, interviewId } = req.query;

      // 질문 목록 조회
      if (action === 'getQuestions') {
        const questions = await kv.get('questions');
        return res.status(200).json({
          questions: questions || [
            { id: 1, text: '우리 기관에 지원한 동기를 소개해주세요.' }
          ]
        });
      }

      // 개인 연습 기록 조회
      if (action === 'getPractices' && interviewId) {
        const practices = await kv.get(`practices:${interviewId}`);
        return res.status(200).json({
          practices: practices || []
        });
      }

      // 연습 횟수 조회
      if (action === 'getAttemptCount' && interviewId) {
        const practices = await kv.get(`practices:${interviewId}`);
        return res.status(200).json({
          count: practices ? practices.length : 0
        });
      }

      return res.status(400).json({ error: '잘못된 요청입니다.' });
    }

    // POST 요청 처리
    if (req.method === 'POST') {
      const { action, interviewId, practice, questions } = req.body;

      // 질문 저장 (관리자)
      if (action === 'saveQuestions' && questions) {
        await kv.set('questions', questions);
        return res.status(200).json({ success: true });
      }

      // 연습 결과 저장
      if (action === 'savePractice' && interviewId && practice) {
        // 기존 연습 기록 조회
        let practices = await kv.get(`practices:${interviewId}`) || [];
        
        // 3회 제한 확인
        if (practices.length >= 3) {
          return res.status(403).json({ 
            error: '연습 기회 3회를 모두 사용하셨습니다.' 
          });
        }

        // 새 연습 추가
        practice.attempt = practices.length + 1;
        practices.push(practice);

        // 저장
        await kv.set(`practices:${interviewId}`, practices);

        return res.status(200).json({ 
          success: true,
          attempt: practice.attempt
        });
      }

      return res.status(400).json({ error: '잘못된 요청입니다.' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Practice API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
