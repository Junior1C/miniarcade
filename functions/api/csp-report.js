// Cloudflare Pages Function: POST /api/csp-report (приём CSP-нарушений).
// Report-only телеметрия: DNT уважаем, тело не храним (ограничиваем 4КБ),
// отвечаем 204 всегда, чтобы отчёты не спамили консоль. Хранение/алерты —
// следующий шаг, когда будет видно объём (см. README § «Безопасность»).
export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  if (request.headers.get('dnt') === '1') {
    return new Response(null, { status: 204 });
  }
  try {
    await request.text();
  } catch {
    // Тело отчёта не критично.
  }
  return new Response(null, { status: 204 });
}
