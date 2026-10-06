import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePricePage,cents} from '../scripts/price-parser.mjs';
const usd='<meta property="product:price:currency" content="USD">';
test('sale price excludes the crossed out regular price',()=>assert.equal(parsePricePage(usd+'<p class="price"><del><bdi>$99.99</bdi></del><ins><bdi><span>$</span>79.99</bdi></ins></p>',false).price,7999));
test('each visible size uses its current public price',()=>{const data=[{variation_id:123,display_price:49.99,display_regular_price:59.99,attributes:{attribute_size:'5mg'}},{variation_id:124,display_price:69.99,attributes:{attribute_size:'10mg'}}];const result=parsePricePage(usd+'<form data-product_variations="'+JSON.stringify(data).replaceAll('"','&quot;')+'">',true);assert.equal(result.price,4999);assert.deepEqual(result.variants.map(v=>v.price),[4999,6999]);});
test('ambiguous prices and non USD pages fail without guessing',()=>{assert.throws(()=>parsePricePage(usd+'<p class="price"><bdi>$10.00</bdi><bdi>$20.00</bdi></p>',false));assert.throws(()=>parsePricePage(usd.replace('USD','EUR')+'<p class="price"><bdi>$10.00</bdi></p>',false));assert.throws(()=>cents('12.345'));});
