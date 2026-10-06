export function decodeHtml(value) {
  return value.replace(/&(?:quot|amp|apos|lt|gt|nbsp);/g, e => ({'&quot;':'"','&amp;':'&','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '}[e]))
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, value) => String.fromCodePoint(value[0].toLowerCase()==='x'?parseInt(value.slice(1),16):Number(value)));
}
export function cents(value) {
  const text=String(value).replace(/,/g,'').trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw Error('Invalid public price');
  const [dollars,decimal='']=text.split('.');
  const amount=Number(dollars)*100+Number(decimal.padEnd(2,'0'));
  if(!Number.isSafeInteger(amount)||amount<0||amount>10000000)throw Error('Invalid public price');
  return amount;
}
export function parsePricePage(html,variable) {
  const currencies=[...html.matchAll(/<meta[^>]*property="product:price:currency"[^>]*content="([^"]+)"/gi)].map(m=>m[1]);
  if(!currencies.length||currencies.some(c=>c!=='USD'))throw Error('Public USD currency could not be confirmed');
  if(variable){
    const encoded=html.match(/data-product_variations="([\s\S]*?)"/);
    if(!encoded)throw Error('Public size prices are unavailable');
    const values=JSON.parse(decodeHtml(encoded[1]));
    if(!Array.isArray(values)||!values.length)throw Error('Public size prices are unavailable');
    const variants=values.filter(v=>v.variation_is_visible!==false&&v.variation_is_active!==false).map(v=>{
      if(!v.variation_id||typeof v.display_price!=='number'||!Number.isFinite(v.display_price))throw Error('Invalid size price');
      return {sourceId:String(v.variation_id),price:cents(v.display_price.toFixed(2)),regularPrice:cents(Number(v.display_regular_price??v.display_price).toFixed(2)),attributes:v.attributes};
    });
    if(!variants.length)throw Error('No public size prices');
    return {price:Math.min(...variants.map(v=>v.price)),variants};
  }
  const block=html.match(/<p\s+class="price"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  if(!block)throw Error('Public product price is unavailable');
  const current=block.replace(/<del\b[^>]*>[\s\S]*?<\/del>/gi,'');
  const amounts=[...current.matchAll(/<bdi[^>]*>([\s\S]*?)<\/bdi>/gi)].map(m=>decodeHtml(m[1].replace(/<[^>]*>/g,'')).trim());
  if(amounts.length!==1||!/^\$\s*[\d,]+(?:\.\d{1,2})?$/.test(amounts[0]))throw Error('Public price is ambiguous');
  return {price:cents(amounts[0].replace(/^\$\s*/,'')),variants:[]};
}
