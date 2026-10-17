import assetManifest from './brand-assets.json' with {type:'json'};
export const brand = Object.freeze({name:'Seqlyn Labs', publicOrigin:'', contactPath:'/contact/', logo:'/assets/seqlyn/logo-light.png', darkLogo:'/assets/seqlyn/logo-dark.png', icon:'/assets/seqlyn/favicon.png'});
export function rebrandText(value) {return String(value).replace(/\bPH\s*BIO\s*LABS\b(?!\.[a-z])/gi, brand.name);}
export function presentProduct(product) {
  return {...product,name:rebrandText(product.name),image:assetManifest[product.image]||product.image,
    ...(product.description!==undefined?{description:rebrandText(product.description)}:{}),
    ...(product.variants?{variants:product.variants.map(presentProduct)}:{})};
}
