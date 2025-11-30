// Cloudflare Worker (template) for handling uploads to R2 and metadata in KV
// Bindings needed in Cloudflare dashboard or wrangler.toml:
// R2 bucket: R2_BUCKET
// KV namespace: METADATA_KV (or use D1 in advanced version)

addEventListener('fetch', event => {
  event.respondWith(handle(event.request));
});

async function handle(req){
  const url = new URL(req.url);
  if(req.method === 'GET' && url.pathname === '/list'){
    // list metadata keys from KV (simple prefix)
    const keys = await METADATA_KV.list();
    const out = [];
    for(const key of keys.keys){
      const v = await METADATA_KV.get(key.name);
      if(v) out.push(JSON.parse(v));
    }
    return new Response(JSON.stringify(out), {headers:{'Content-Type':'application/json'}});
  }
  if(req.method === 'GET' && url.pathname === '/meta'){
    const id = url.searchParams.get('id');
    if(!id) return new Response(JSON.stringify({error:'missing id'}),{status:400,headers:{'Content-Type':'application/json'}});
    const v = await METADATA_KV.get(id);
    if(!v) return new Response(JSON.stringify({error:'not found'}),{status:404,headers:{'Content-Type':'application/json'}});
    const meta = JSON.parse(v);
    // generate signed URL example (public R2 needs additional config) - we assume R2 public upload URL stored as public URL
    return new Response(JSON.stringify(meta), {headers:{'Content-Type':'application/json'}});
  }
  if(req.method === 'POST' && url.pathname === '/upload'){
    // handle multipart form upload
    const form = await req.formData();
    const file = form.get('file');
    const team = form.get('team') || 'unknown';
    if(!file) return new Response(JSON.stringify({ok:false,error:'no file'}),{headers:{'Content-Type':'application/json'}});
    const id = crypto.randomUUID();
    const filename = id + '_' + file.name;
    // write to R2
    await R2_BUCKET.put(filename, file.stream(), { httpMetadata: { contentType: file.type } });
    const publicUrl = `https://YOUR_R2_PUBLIC_DOMAIN/${filename}`; // replace after deploy
    const meta = { id, name: file.name, team, uploaded: Date.now(), url: publicUrl, highlights: [], score: '' };
    await METADATA_KV.put(id, JSON.stringify(meta));
    return new Response(JSON.stringify({ok:true, id}), {headers:{'Content-Type':'application/json'}});
  }
  if(req.method === 'POST' && url.pathname === '/add_highlight'){
    const body = await req.json();
    const id = body.id;
    const time = Number(body.time);
    const v = await METADATA_KV.get(id);
    if(!v) return new Response(JSON.stringify({ok:false,error:'not found'}),{headers:{'Content-Type':'application/json'}});
    const meta = JSON.parse(v);
    meta.highlights = meta.highlights || [];
    meta.highlights.push(time);
    await METADATA_KV.put(id, JSON.stringify(meta));
    return new Response(JSON.stringify({ok:true,highlights:meta.highlights}),{headers:{'Content-Type':'application/json'}});
  }
  if(req.method === 'POST' && url.pathname === '/save_score'){
    const body = await req.json();
    const id = body.id;
    const score = body.score || '';
    const v = await METADATA_KV.get(id);
    if(!v) return new Response(JSON.stringify({ok:false,error:'not found'}),{headers:{'Content-Type':'application/json'}});
    const meta = JSON.parse(v);
    meta.score = score;
    await METADATA_KV.put(id, JSON.stringify(meta));
    return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json'}});
  }

  // fallback: serve static assets (index.html, css, js...)
  const path = url.pathname === '/' ? '/index.html' : url.pathname;
  try{
    return await getAssetFromKV(path);
  }catch(e){
    return new Response('Not found', {status:404});
  }
}

/*
Notes:
- Replace `YOUR_R2_PUBLIC_DOMAIN` after setting up R2 public access, or implement signed URLs.
- METADATA_KV is a KV namespace binding in Cloudflare. You can also use D1/sqlite for richer queries.
- This Worker is a template. Deploy with wrangler or Cloudflare dashboard, and bind R2 and KV in settings.
*/
