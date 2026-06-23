import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { pdfBase64, bookingId, guestIndex } = await req.json();

    if (!pdfBase64 || !bookingId) {
      return new Response(
        JSON.stringify({ error: 'pdfBase64 and bookingId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl    = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const bucket         = 'waiver-pdfs';

    const filename = `${bookingId}_g${guestIndex ?? 0}_${Date.now()}.pdf`;
    const path     = `${bookingId}/${filename}`;

    // Convert base64 → binary
    const pdfBytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));

    // 1. Upload using service role key (bypasses RLS entirely)
    const uploadRes = await fetch(
      `${supabaseUrl}/storage/v1/object/${bucket}/${path}`,
      {
        method:  'POST',
        headers: {
          'apikey':        serviceRoleKey!,
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type':  'application/pdf',
          'Cache-Control': '3600',
          'x-upsert':      'true',
        },
        body: pdfBytes,
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return new Response(
        JSON.stringify({ error: 'Upload failed', status: uploadRes.status, details: errText }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Generate signed URL valid for 2 years
    const signRes = await fetch(
      `${supabaseUrl}/storage/v1/object/sign/${bucket}/${path}`,
      {
        method:  'POST',
        headers: {
          'apikey':        serviceRoleKey!,
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ expiresIn: 63072000 }), // 2 years
      }
    );

    const signData = await signRes.json();

    if (!signRes.ok || !signData.signedURL) {
      return new Response(
        JSON.stringify({ error: 'Signed URL failed', details: signData }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        signedUrl: `${supabaseUrl}${signData.signedURL}`,
        path,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
