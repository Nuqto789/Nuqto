// Worker Nuqto — melayani aset statis + upload & hapus foto ke R2
const R2_PUBLIC_URL = "https://pub-ba64decb48ad4940bbb5c68f90bd597e.r2.dev";
const SUPA_URL = "https://xiszpsqmroynihbfijwa.supabase.co";
const SUPA_ANON = "eyJhbGci••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••";

const PHOTO_TABLES = ["info_posts", "maqom_pins", "blacklist_pins", "razia_reports"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/upload") {
      if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
      if (request.method === "POST") return handleUpload(request, env);
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    if (url.pathname === "/api/delete-photo") {
      if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
      if (request.method === "POST") return handleDeletePhoto(request, env);
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleUpload(request, env) {
  try {
    const formData = await request.formData();
    const file = formData.get("photo");
    if (!file || typeof file === "string") return json({ error: "Tidak ada file foto" }, 400);
    if (!file.type || !file.type.startsWith("image/")) return json({ error: "File harus berupa gambar" }, 400);
    if (file.size > 8 * 1024 * 1024) return json({ error: "Ukuran foto maksimal 8MB" }, 400);

    const extMatch = /\.([a-zA-Z0-9]+)$/.exec(file.name || "");
    const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
    const key = `pins/${crypto.randomUUID()}.${ext}`;
    await env.PHOTOS.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    return json({ url: `${R2_PUBLIC_URL}/${key}` }, 200);
  } catch (err) {
    return json({ error: err.message || "Upload gagal" }, 500);
  }
}

async function handleDeletePhoto(request, env) {
  try {
    // Jalur pembersihan terjadwal (pg_cron): dipercaya lewat secret, lewati cek login.
    const purgeSecret = request.headers.get("X-Purge-Secret");
    const isPurge = purgeSecret && env.PURGE_SECRET && purgeSecret === env.PURGE_SECRET;

    if (!isPurge) {
      // Jalur normal (dari app) — wajib login, verifikasi JWT ke Supabase
      const auth = request.headers.get("Authorization") || "";
      const jwt = auth.replace(/^Bearer\s+/i, "").trim();
      if (!jwt) return json({ error: "Tidak berwenang" }, 401);
      const ures = await fetch(`${SUPA_URL}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${jwt}`, apikey: SUPA_ANON }
      });
      if (!ures.ok) return json({ error: "Sesi tidak valid" }, 401);
    }

    // Ambil & validasi URL foto → jadikan key R2
    const body = await request.json().catch(() => ({}));
    const photoUrl = ((body && body.url) || "").trim();
    if (!photoUrl.startsWith(R2_PUBLIC_URL + "/")) return json({ error: "URL tidak valid" }, 400);
    const key = decodeURIComponent(photoUrl.slice(R2_PUBLIC_URL.length + 1));
    if (!key.startsWith("pins/") || key.includes("..")) return json({ error: "Key tidak valid" }, 400);

    // Pastikan foto sudah yatim — tak ada baris yang masih memakainya
    for (const t of PHOTO_TABLES) {
      const q = `${SUPA_URL}/rest/v1/${t}?select=id&photo_url=eq.${encodeURIComponent(photoUrl)}&limit=1`;
      const r = await fetch(q, { headers: { apikey: SUPA_ANON, Authorization: `Bearer ${SUPA_ANON}` } });
      if (r.ok) {
        const rows = await r.json();
        if (Array.isArray(rows) && rows.length) return json({ error: "Foto masih dipakai", skipped: true }, 409);
      }
    }

    // Hapus objek dari R2
    await env.PHOTOS.delete(key);
    return json({ ok: true }, 200);
  } catch (err) {
    return json({ error: err.message || "Gagal hapus foto" }, 500);
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders() });
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}
