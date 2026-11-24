const cases=[
 ['without-callback','https://widgets.spinitron.com/widget/now-playing-v2?station=KALX&num=1&cover=1',{}],
 ['callback-und-pref','https://widgets.spinitron.com/widget/now-playing-v2?callback=_spinitron987654321&station=KALX&num=1&cover=1',{}],
 ['callback-referer','https://widgets.spinitron.com/widget/now-playing-v2?callback=_spinitron987654321&station=KALX&num=1&cover=1',{Referer:'https://haniadaher21-ops.github.io/bonnesondes/'}],
 ['callback-origin','https://widgets.spinitron.com/widget/now-playing-v2?callback=_spinitron987654321&station=KALX&num=1&cover=1',{Origin:'https://haniadaher21-ops.github.io',Referer:'https://haniadaher21-ops.github.io/bonnesondes/'}],
];
await Promise.all(cases.map(async ([name,url,headers])=>{
try{
const r=await fetch(url,{signal:AbortSignal.timeout(11000),headers});const s=await r.text();
console.log('SPINITRON_VALIDATION '+JSON.stringify({name,status:r.status,type:r.headers.get('content-type'),length:s.length,head:s.slice(0,220)}));
}catch(e){console.log('SPINITRON_VALIDATION '+JSON.stringify({name,error:String(e)}))}
}));
