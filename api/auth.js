// 지원자 명단은 환경변수 CANDIDATES_JSON에 JSON 형태로 저장
// 예: [{"id":"A001","pw":"1234"},{"id":"A002","pw":"5678"},{"id":"ADMIN","pw":"0000"}]

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
    const { interviewId, password } = req.body;

    if (!interviewId || !password) {
      return res.status(400).json({ error: '면접번호와 비밀번호를 입력해주세요.' });
    }

    // 환경변수에서 지원자 명단 가져오기
    const candidatesJson = process.env.CANDIDATES_JSON;
    
    if (!candidatesJson) {
      return res.status(500).json({ error: '지원자 명단이 설정되지 않았습니다.' });
    }

    let candidates;
    try {
      candidates = JSON.parse(candidatesJson);
    } catch (e) {
      return res.status(500).json({ error: '지원자 명단 형식이 올바르지 않습니다.' });
    }

    // 지원자 찾기
    const candidate = candidates.find(
      c => c.id === interviewId && c.pw === password
    );

    if (!candidate) {
      return res.status(401).json({ error: '면접번호 또는 비밀번호가 일치하지 않습니다.' });
    }

    // 관리자 여부 확인 (ADMIN으로 시작하거나 isAdmin 플래그가 있는 경우)
    const isAdmin = interviewId.toUpperCase().startsWith('ADMIN') || candidate.isAdmin === true;

    return res.status(200).json({
      success: true,
      interviewId: interviewId,
      isAdmin: isAdmin
    });

  } catch (error) {
    console.error('Auth Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
