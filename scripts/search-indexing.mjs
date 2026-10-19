const privatePages=new Set(['admin','cart','checkout','my-account','order-tracking','wishlist','product']);
export function isIndexablePage(file) {
  if(!/(^|\/)index\.html$/.test(file))return false;
  const route=file.replace(/\/?index\.html$/,'');
  return !privatePages.has(route) && !route.split('/').includes('feed');
}
export function searchFiles(origin,htmlFiles) {
  const base=new URL(origin);
  if(base.protocol!=='https:' || base.origin!==origin)throw Error('Search indexing requires an HTTPS origin');
  const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
  const urls=[...new Set(htmlFiles.filter(isIndexablePage).map(file=>origin+'/'+file.replace(/index\.html$/,'')))].sort();
  return {
    urls,
    sitemap:'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(url=>'  <url><loc>'+escape(url)+'</loc></url>').join('\n')+'\n</urlset>\n',
    robots:'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /auth/\nDisallow: /health\n\nSitemap: '+origin+'/sitemap.xml\n'
  };
}
