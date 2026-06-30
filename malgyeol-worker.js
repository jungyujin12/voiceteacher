/**
 * 말결 (Malgyeol) - Gemini API 프록시 Worker
 * 
 * 이 Worker는 Gemini API 키를 안전하게 숨기고,
 * 학생들의 브라우저에서 오는 요청을 대신 Gemini API로 전달합니다.
 * 
 * 설정 방법:
 * 1. Cloudflare 대시보드 → Workers & Pages → Create Worker
 * 2. 이 코드를 그대로 붙여넣기
 * 3. Settings → Variables → Add Secret
 *    - Name: GEMINI_API_KEY
 *    - Value: 본인의 실제 Gemini API 키
 * 4. Deploy 클릭
 * 5. 생성된 Worker 주소(예: https://malgyeol-proxy.본인계정.workers.dev)를 
 *    말결 HTML의 WORKER_URL 변수에 입력
 */

export default {
  async fetch(request, env) {
    // CORS 허용 (GitHub Pages에서 호출 가능하도록)
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // 프리플라이트 요청 처리
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST 요청만 허용됩니다." }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    try {
      const body = await request.json();
      const { userPrompt, systemInstruction } = body;

      if (!userPrompt) {
        return new Response(JSON.stringify({ error: "userPrompt가 필요합니다." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // 환경변수(Secret)에서 API 키 가져오기 - 절대 클라이언트에 노출되지 않음
      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "서버에 API 키가 설정되지 않았습니다." }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: systemInstruction || "당신은 친절한 발표 코치입니다." }],
            },
            contents: [{ parts: [{ text: userPrompt }] }],
          }),
        }
      );

      if (!geminiResponse.ok) {
        const errorData = await geminiResponse.json().catch(() => ({}));
        return new Response(JSON.stringify({ error: "Gemini API 호출 실패", detail: errorData }), {
          status: geminiResponse.status,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const data = await geminiResponse.json();
      const feedbackText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!feedbackText) {
        return new Response(JSON.stringify({ error: "Gemini로부터 빈 응답을 받았습니다." }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      return new Response(JSON.stringify({ feedbackText }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "서버 오류가 발생했습니다.", detail: String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  },
};
