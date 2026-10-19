import test from 'node:test';
import assert from 'node:assert/strict';
import {searchFiles} from '../scripts/search-indexing.mjs';

test('sitemap publishes canonical public pages and excludes account, checkout, feeds and assets',()=>{
  const search=searchFiles('https://www.seqlynlabs.com',['index.html','shop/index.html','buy/bpc-157-10mg/index.html','admin/index.html','cart/index.html','checkout/index.html','my-account/index.html','order-tracking/index.html','wishlist/index.html','product/index.html','buy/example/feed/index.html','assets/image.png','shop/index.html']);
  assert.deepEqual(search.urls,['https://www.seqlynlabs.com/','https://www.seqlynlabs.com/buy/bpc-157-10mg/','https://www.seqlynlabs.com/shop/']);
  assert.match(search.sitemap,/<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  assert.match(search.robots,/Allow: \/\n/);
  assert.match(search.robots,/Sitemap: https:\/\/www.seqlynlabs.com\/sitemap.xml\n/);
  assert.throws(()=>searchFiles('http://www.seqlynlabs.com',[]),/HTTPS/);
  assert.throws(()=>searchFiles('https://www.seqlynlabs.com/path',[]),/HTTPS/);
});
