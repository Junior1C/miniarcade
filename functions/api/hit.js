// Cloudflare Pages Function: POST /api/hit (приёмник аналитики).
// Работает на зеркале miniarcade.pages.dev и принимает beacon
// со всех хостингов (CORS *). D1-биндинг STATS_DB настраивается
// один раз в dashboard Pages-проекта (см. README § «Аналитика»).
import { handleHit } from '../../stats/hit.mjs';

export async function onRequest(context) {
  return handleHit(context.request, context.env);
}
