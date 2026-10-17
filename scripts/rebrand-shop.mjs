import fs from 'node:fs/promises';
import {load} from 'cheerio';
import {brand,rebrandText} from '../src/brand.js';
import manifest from '../src/brand-assets.json' with {type:'json'};
import catalog from '../src/catalog.js';

export function asset(value) {
  if(manifest[value])return manifest[value];
  value=value.replace(/https?:\/\/phbiolabs\.com\/[^\s"'<>]+/g,url=>{
    const normalized=url.replace(/-\d+x\d+(?=\.[^.?#]+(?:[?#]|$))/,'').split('?')[0];
    return manifest[url]||manifest[normalized]||url;
  });
  for(const [before,after] of Object.entries(manifest)){
    value=value.split(before).join(after);
    if(!before.startsWith('data:'))value=value.split(before.replaceAll('/','\\/')).join(after.replaceAll('/','\\/'));
  }
  return value;
}
export function rebrandHtml(html) {
  const $=load(rebrandText(asset(html)));
  const product=catalog.find(p=>p.id===$('body').attr('data-clone-product'));
  if(product)$('meta[property="og:image"],meta[property="og:image:secure_url"],meta[name="twitter:image"]').attr('content',product.image);
  $('link[rel="canonical"],meta[property="og:url"]').remove();
  $('link[rel="shortlink"],link[rel="https://api.w.org/"],link[type="application/json+oembed"],link[type="text/xml+oembed"]').remove();
  $('meta[name="twitter:site"],meta[name="twitter:creator"],meta[property="article:publisher"]').filter((_,el)=>/ph.?bio|seqlyn/i.test($(el).attr('content')||'')).remove();
  $('meta[property="og:image"],meta[name="twitter:image"]').each((_,el)=>{
    const value=$(el).attr('content')||'';
    $(el).attr('content',value.replace(/^https?:\/\/phbiolabsshop\.com/i,''));
  });
  $('a[href]').each((_,el)=>{
    const link=$(el),href=link.attr('href');
    if(/^(?:mailto:.*@phbiolabs\.com|tel:\+?18887898729)/i.test(href))link.attr('href',brand.contactPath).text('Contact our team');
    else if(/^https?:\/\/(?:www\.)?phbiolabs(?:shop)?\.com(?:\/|$)/i.test(href)){
      const url=new URL(href);link.attr('href',url.pathname+url.search+url.hash);
    }else if(/^https?:\/\/(?:www\.)?(?:facebook|instagram|tiktok|pinterest|x|twitter)\.com\/.*(?:ph.?bio|seqlyn(?:%20|\s)*labs)/i.test(href))link.attr('href',brand.contactPath).attr('aria-label','Contact Seqlyn Labs').removeAttr('target');
  });
  function textNodes(node){for(const child of node.children||[]){
    if(child.type==='text')child.data=child.data
      .replace(/30\s*N\s*Gould\s*St\s*Ste\.?\s*N,?\s*Sheridan,?\s*WY\s*82801/gi,'Contact our team')
      .replace(/(?:\+?1[ .-]?)?\(?888\)?[ .-]?789[ .-]?8729/g,'Contact our team')
      .replace(/\b[\w.+-]+@phbiolabs\.com\b/gi,'Contact our team')
      .replace(/\b(?:www\.)?phbiolabs(?:shop)?\.com\b/gi,'Seqlyn Labs');
    else if(!['script','style'].includes(child.tagName))textNodes(child);
  }}
  textNodes($.root()[0]);
  $('.phbio-watermark').text('SEQLYN');
  $('footer span').filter((_,el)=>$(el).children().length===0&&$(el).text().trim()==='Contact our team')
    .empty().append($('<a>').attr('href',brand.contactPath).text('Contact our team'));
  $('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]').attr({href:brand.icon,type:'image/png'}).removeAttr('sizes');
  if(!$('link[rel="icon"]').length)$('head').append(`<link rel="icon" type="image/png" href="${brand.icon}">`);
  $('script[type="application/ld+json"]').remove();
  return $.html();
}
export async function rebrandDirectory(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  const file=dir+'/'+entry.name;
  if(entry.isDirectory())await rebrandDirectory(file);
  else if(entry.name.endsWith('.html'))await fs.writeFile(file,rebrandHtml(await fs.readFile(file,'utf8')));
  else if(entry.name.endsWith('.css'))await fs.writeFile(file,asset(await fs.readFile(file,'utf8')));
}}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/rebrand-shop.mjs')){
  await rebrandDirectory('src/product-pages');await rebrandDirectory('dist/client');
  console.log('Applied Seqlyn Labs branding to source snapshots and static pages.');
}
