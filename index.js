export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // ==========================================
    // ENDPOINT: LOGIN (PBKDF2 + SALT)
    // ==========================================
    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      try {
        const { nisn, password } = await request.json();
        
        // 1. Ambil data user dari Turso
        const dbRes = await fetch(`${env.TURSO_DB_URL}/v2/pipeline`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${env.TURSO_AUTH_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              type: "execute",
              stmt: {
                sql: "SELECT id, nisn, nama, kelas, password, password_hash, password_salt, must_change_password FROM siswa WHERE TRIM(nisn) = TRIM(?) LIMIT 1",
                args: [{ type: "text", value: nisn }]
              }
            }]
          })
        });

        const dbData = await dbRes.json();
        const result = dbData.results[0].response.result;
        if (!result.rows || result.rows.length === 0) {
          return new Response(JSON.stringify({ error: 'NISN tidak ditemukan' }), { status: 401, headers: corsHeaders });
        }

        // Konversi baris Turso ke Object
        const cols = result.cols.map(c => c.name);
        const row = {};
        result.rows[0].forEach((val, i) => { row[cols[i]] = val.value; });

        let isValid = false;
        let needsMigration = false;

        // 2. Verifikasi Password
        if (row.password_hash && row.password_salt) {
          // JIKA SUDAH PAKAI PBKDF2
          const computedHash = await hashPBKDF2(password, row.password_salt, 150000);
          isValid = (computedHash === row.password_hash);
        } else if (row.password) {
          // JIKA MASIH PLAIN TEXT (Masa Transisi)
          if (row.password === password) {
            isValid = true;
            needsMigration = true;
          }
        }

        if (!isValid) {
          return new Response(JSON.stringify({ error: 'Password salah' }), { status: 401, headers: corsHeaders });
        }

        // 3. Migrasi otomatis ke PBKDF2 jika masih plain text
        if (needsMigration) {
          const newSalt = generateSalt();
          const newHash = await hashPBKDF2(password, newSalt, 150000);
          
          await fetch(`${env.TURSO_DB_URL}/v2/pipeline`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${env.TURSO_AUTH_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requests: [{
                type: "execute",
                stmt: {
                  sql: "UPDATE siswa SET password_hash = ?, password_salt = ?, must_change_password = 0 WHERE id = ?",
                  args: [
                    { type: "text", value: newHash },
                    { type: "text", value: newSalt },
                    { type: "text", value: row.id }
                  ]
                }
              }]
            })
          });
        }

        // 4. Return data sukses (TANPA password/hash)
        return new Response(JSON.stringify({ 
          success: true, 
          user: { 
            id: row.id, nisn: row.nisn, nama: row.nama, kelas: row.kelas, 
            must_change_password: row.must_change_password 
          } 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      } catch (err) {
        return new Response(JSON.stringify({ error: 'Server Error: ' + err.message }), { status: 500, headers: corsHeaders });
      }
    }

    return new Response('SMADA API Gateway Online', { headers: corsHeaders });
  }
};

// ==========================================
// FUNGSI KRIPTOGRAFI (PBKDF2)
// ==========================================
function generateSalt() {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...salt));
}

async function hashPBKDF2(password, saltB64, iterations) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
