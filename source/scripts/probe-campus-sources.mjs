const urls=[
 ['spinitron-script','https://spinitron.com/static/js/widget.js'],
 ['widget-kalx','https://widgets.spinitron.com/widget/now-playing-v2?station=KALX&num=1&cover=1'],
 ['widget-wrbb','https://widgets.spinitron.com/widget/now-playing-v2?station=WRBB&num=1&cover=1'],
 ['widget-kzsc','https://widgets.spinitron.com/widget/now-playing-v2?station=KZSC&num=1&cover=1'],
 ['spinitron-page','https://spinitron.com/KALX/'],
];
await Promise.all(urls.map(async([name,url])=>{
try{
const r=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{Accept:'text/html,application/javascript,*/*'}});
const s=await r.text();
const snippets=name==='spinitron-script'?
 [...s.matchAll(/.{0,150}(?:fetch\(|jsonp|ajax|widget\/|http|spinitron|createElement|callback|xhr|XMLHttpRequest|jQuery).{0,170}/ig)].slice(0,25).map(m=>m[0]):
 [...s.matchAll(/.{0,100}(?:data-spin|spin-title|spin-artist|track|artist|album|image|spinitron).{0,210}/ig)].slice(0,17).map(m=>m[0]);
console.log('SPINITRON_WIDGET '+JSON.stringify({name,status:r.status,type:r.headers.get('content-type'),cors:r.headers.get('access-control-allow-origin'),len:s.length,start:s.slice(0,1200),snippets}).slice(0,9000));
}catch(e){console.log('SPINITRON_WIDGET '+JSON.stringify({name,error:String(e)}))}
}));
