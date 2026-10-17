// Repair already-broken import resources in the Vercel package only. Original
// snapshots and audit records remain intact. Failed CSS/font URLs had no effect.
export function repairLegacy(text,file,missing,repairs) {
  const note=(url,action)=>repairs.push({file,url,action});
  const broken=raw=>missing.has(raw?.split(/[?#]/)[0]);
  if(file.endsWith('.html')) {
    text=text.replace(/<link\b[^>]*>/gi,tag=>{
      const url=tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
      if(broken(url)){note(url,'Remove failed stylesheet/preload');return '';}
      return tag;
    }).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>{
      const src=tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
      if(src==='/assets/b78ac8d1f63ceffb7dbb.js' || /googlesitekit|pintrk|tgd_query_params|tagada/i.test(tag)) {
        note(src||'Legacy tracker configuration','Remove obsolete tracking/payment SDK');return '';
      }
      if(broken(src) || src?.startsWith('https://maps.googleapis.com/maps/api/js?key=&') || (!src && /_wpemojiSettings|wp-emoji-settings/.test(tag))) {
        note(src||'WordPress emoji loader','Remove failed/obsolete script');return '';
      }
      return tag;
    }).replace(/<img\b[^>]*>/gi,tag=>{
      const url=tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
      if(url==='/assets/1aecfb2c27bfb666c41c.png' && broken(url)) {
        note(url,'Use approved Seqlyn hero for missing About image');return tag.replace(url,'/assets/seqlyn/hero.png');
      }
      return tag;
    });
    if(text.includes('class="elementor-form"'))text=text.replace('</body>','<script defer src="/deployment-forms.js"></script></body>');
  }
  if(/\.(html|css)$/.test(file))text=text.replace(/url\(\s*(["']?)([^)'"\s]+)\1\s*\)/gi,(whole,quote,url)=>{
    if(!broken(url))return whole;
    note(url,'Remove failed optional font/background URL');return 'none';
  });
  return text;
}
