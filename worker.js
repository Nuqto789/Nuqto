const R2_PUBLIC_URL = 'https://pub-ba64decb48ad4940bbb5c68f90bd597e.r2.dev';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/upload') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders() });
      }
      if (request.method === 'POST') {
        return handleUpload(request, env);
      }
      return new Response('Method not allowed', { status: 405, headers: corsHeaders() });
    }

    // semua route lain -> serve static file (index.html, dst)
    return env.ASSETS.fetch(request);
  }
};

async function handleUpload(request, env) {
  try {
    const formData = await request.formData();
    const file = formData.get('photo');

    if (!file || typeof file === 'string') {
      return json({ error: 'Tidak ada file foto' }, 400);
    }

    if (!file.type || !file.type.startsWith('image/')) {
      return json({ error: 'File harus berupa gambar' }, 400);
    }

    // batas 8MB
    if (file.size > 8 * 1024 * 1024) {
      return json({ error: 'Ukuran foto maksimal 8MB' }, 400);
    }

    const extMatch = /\.([a-zA-Z0-9]+)$/.exec(file.name || '');
    const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
    const key = `pins/${crypto.randomUUID()}.${ext}`;

    await env.PHOTOS.put(key, file.stream(), {
      httpMetadata: { contentType: file.type }
    });

    return json({ url: `${R2_PUBLIC_URL}/${key}` }, 200);
  } catch (err) {
    return json({ error: err.message || 'Upload gagal' }, 500);
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders() });
}

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
