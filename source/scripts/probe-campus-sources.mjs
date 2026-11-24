const stations=['KALX','WRBB','KZSC'];
await Promise.all(stations.map(async station=>{
 const url='https://widgets.spinitron.com/widget/now-playing-v2?station='+station+'&num=1&cover=1&player=0&sharing=0&merch=0&callback=bonnesOndesProbe';
 try{
 const r=await fetch(url,{signal:AbortSignal.timeout(10000)});
 const s=await r.text();
 console.log('SPINITRON_JSONP '+JSON.stringify({station,status:r.status,type:r.headers.get('content-type'),cors:r.headers.get('access-control-allow-origin'),sample:s.slice(0,1100),last:s.slice(-200)}));
 }catch(e){console.log('SPINITRON_JSONP '+JSON.stringify({station,error:String(e)}))}
}));
