const urls = {
  'kalx-spinitron': 'https://programming.kalx.berkeley.edu/KALX/',
  'wrbb-spinitron': 'https://spinitron.com/WRBB/',
  'kzsc-spinitron': 'https://spinitron.com/KZSC/',
  'kcrw-eclectic': 'https://www.kcrw.com/shows/eclectic24/latest',
  'campus-paris': 'https://www.radiocampusparis.org/c-etait-quoi-ce-titre',
  'wfmu-current': 'https://www.wfmu.org/',
  'wxyc-current': 'https://www.wxyc.org/',
  'worldwide-now': 'https://api.radiocult.fm/api/station/worldwide-fm/schedule/live',
  'worldwide-stream': 'https://worldwide-fm.radiocult.fm/status-json.xsl',
  'wnur-current': 'https://www.wnur.org/',
};
for (const [name, url] of Object.entries(urls)) {
  for (const proxy of [false,true]) {
    const target=proxy?'https://r.jina.ai/'+url:url;
    try {
      const response=await fetch(target,{headers:{Accept:'text/plain'},signal:AbortSignal.timeout(11000)});
      const text=(await response.text()).replace(/\s+/g,' ').slice(0,600);
      console.log(JSON.stringify({name,proxy,code:response.status,cors:response.headers.get('access-control-allow-origin'),type:response.headers.get('content-type'),sample:text}));
    } catch(error){console.log(JSON.stringify({name,proxy,error:String(error.message??error).slice(0,100)}));}
  }
}
