import { Client } from '@neondatabase/serverless';

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

    if (url.pathname === '/api/login' && request.method === 'POST') {
      try {
        const { username, password } = await request.json();
        const client = new Client(env.DATABASE_URL);
        await client.connect();

        // 1. Cek Login Guru / Petugas / Admin
        const userQuery = await client.query(
          'SELECT id, username, nama, role FROM users WHERE username = $1 AND password = $2',
          [username, password]
        );

        if (userQuery.rows.length > 0) {
          await client.end();
          return new Response(
            JSON.stringify({ success: true, type: 'guru', user: userQuery.rows[0] }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 2. Cek Login Siswa
        const siswaQuery = await client.query(
          'SELECT nisn, nama, kelas FROM siswa WHERE nisn = $1 AND password = $2',
          [username, password]
        );

        if (siswaQuery.rows.length > 0) {
          await client.end();
          return new Response(
            JSON.stringify({ success: true, type: 'siswa', user: siswaQuery.rows[0] }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.end();
        return new Response(
          JSON.stringify({ success: false, message: 'NIP/NISN atau Password Salah!' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (err) {
        return new Response(
          JSON.stringify({ success: false, message: 'Server Error: ' + err.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response('SMADA API Gateway Online', { headers: corsHeaders });
  }
};
