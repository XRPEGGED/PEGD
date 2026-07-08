export async function onRequest({ params, env }) {
  const key = 'mobile/' + params.file;
  const obj = await env.ASSETS_R2.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('cache-control', 'public, max-age=3600');
  if (params.file.endsWith('.apk')) {
    headers.set('content-type', 'application/vnd.android.package-archive');
    headers.set('content-disposition', 'attachment; filename="' + params.file + '"');
  }

  return new Response(obj.body, { headers });
}
