import assert from 'node:assert/strict';
import {test} from 'node:test';
import sources from '../editorial/music-press.json' with {type:'json'};
import {musicPressLinks,musicPressMentions,nprMusicFridayMentions,musicPressAlbumReferences,matchMusicPress,collectMusicPress} from '../scripts/music-press.mjs';
import {editorialEndorsement} from '../scripts/recommendation-policy.mjs';

const nova=sources.find(x=>x.id==='nova');
const pitchfork=sources.find(x=>x.id==='pitchfork');
const stereogum=sources.find(x=>x.id==='stereogum');
const articles=[
  [nova,'https://www.nova.fr/news/andeol-ladaniva-h-jeunecrack-les-albums-immanquables-de-la-semaine-469377-18-11-2026/',
    '<h2>Andéol – Les rats, les pigeons</h2><h2>LADANIVA – Yasaman</h2>','2026-11-18'],
  [stereogum,'https://stereogum.com/2517187/album-of-the-week-krill-secret-language/reviews/album-of-the-week',
    '<h1>Album Of The Week: Krill Secret Language</h1>','2026-11-10'],
  [pitchfork,'https://pitchfork.com/story/9-new-albums-you-should-listen-to-now-2hollis-armand-hammer-and-more/',
    '<h2>Aesop Rock and Blockhead: Trouble Mountain [Rhymesayers]</h2>','2026-11-13'],
];

test('all five requested editorial media are tracked, but unsupported sites never invent candidates',()=>{
  for(const name of ['Radio Nova','Stereogum','Pitchfork','Les Inrockuptibles','NPR Music'])
    assert.ok(sources.some(row=>row.name===name));
  assert.ok(sources.find(row=>row.id==='inrocks').mode==='manual');
  assert.ok(sources.find(row=>row.id==='npr').mode==='automatic');
  assert.deepEqual(sources.filter(x=>x.mode==='automatic').map(x=>x.id),['nova','stereogum','pitchfork','npr','bandcamp-essential']);
});

test('explicit album-curation articles and the last 30 days are required',()=>{
 for(const [source,url,headings,published] of articles){
  const listing='<a href="'+url+'">Choix des disques</a><a href="https://example.org/other">Other</a>';
  assert.deepEqual(musicPressLinks(listing,source),[url]);
  const content='<script type="application/ld+json">{"datePublished":"'+published+'T10:00:00Z"}</script>'+(source.id==='nova' ? headings.replace(' – ',' &#8211; ') : headings);
  const found=musicPressMentions(content,source,url,'2026-11-22');
  assert.ok(found.length>=1,source.id);
  assert.equal(found[0].editorialPublishedAt,published);
  assert.deepEqual(musicPressMentions(content,source,url,'2027-01-01'),[]);
 }
 assert.deepEqual(musicPressLinks('<a href="https://evil.example/99/album-of-the-week-a/reviews/album-of-the-week">bad</a>',stereogum),[]);
});

test('NPR Music New Music Friday podcast names exact album picks without guessing',()=>{
 const rss=`<rss><channel><item><title>New Music Friday: The best albums out Nov. 13</title>
 <link>https://www.npr.org/2026/11/13/nx-s1-1234/new-music-friday-best-albums</link>
 <pubDate>Fri, 13 Nov 2026 05:01:00 +0000</pubDate><description>
 The Starting 5 (00:03) - Krill, 'Secret Language' - Aesop Rock and Blockhead, 'Trouble Mountain'
 The Lightning Round - Another artist, 'Unrelated'</description></item></channel></rss>`;
 const picks=nprMusicFridayMentions(rss,sources.find(x=>x.id==='npr'),'2026-11-22');
 assert.deepEqual(picks.map(x=>[x.creator,x.title]),[['Krill','Secret Language'],['Aesop Rock and Blockhead','Trouble Mountain']]);
 assert.ok(editorialEndorsement({...picks[0],format:'Album'}));
 assert.deepEqual(nprMusicFridayMentions(rss,sources.find(x=>x.id==='npr'),'2027-01-01'),[]);
});

test('article title and release identity must match to qualify as an editorial pick',()=>{
 const [source,url,headings,published]=articles[1];
 const [citation]=musicPressMentions('{"datePublished":"'+published+'"}'+headings,source,url,'2026-11-22');
 assert.equal(matchMusicPress({title:'Secret Language',creator:'Krill'},[citation]),citation);
 assert.equal(matchMusicPress({title:'Different album',creator:'Krill'},[citation]),undefined);
 assert.ok(editorialEndorsement({...citation,format:'Album',title:'Secret Language'}));
 assert.equal(editorialEndorsement({...citation,editorialUrl:'https://evil.example/review',format:'Album'}),undefined);
 const [pitch]=musicPressMentions('{"datePublished":"2026-11-13"}'+articles[2][2],pitchfork,articles[2][1],'2026-11-22');
 assert.equal(matchMusicPress({title:'Trouble Mountain',creator:'Aesop Rock & Blockhead'},[pitch]),pitch);
});

test('curated press articles can discover new primary album links without guessing identities',()=>{
 const url=articles[2][1];
 const mention=musicPressMentions('{"datePublished":"2026-11-13"}<h2>Aesop Rock and Blockhead: Trouble Mountain [Rhymesayers]</h2>',pitchfork,url,'2026-11-22')[0];
 const html='<h2>Aesop Rock and Blockhead: Trouble Mountain [Rhymesayers]</h2>'
   +'<p><a href="https://aesoprock.bandcamp.com/album/trouble-mountain">Primary release</a>'
   +'<a href="https://open.spotify.com/album/0Fta5KudJiX6HpDWApUu8y">Spotify</a></p>'
   +'<h2>Unrelated bandcamp album</h2>'
   +'<a href="https://somebody.bandcamp.com/album/unrelated">Other</a>';
 const records=musicPressAlbumReferences(html,url,[mention]);
 assert.equal(records.length,1);
 assert.deepEqual(records.map(x=>[x.title,x.creator,x.sourceUrl,x.url]),[
   ['Trouble Mountain','Aesop Rock and Blockhead',
    'https://aesoprock.bandcamp.com/album/trouble-mountain',
    'https://open.spotify.com/album/0Fta5KudJiX6HpDWApUu8y'],
 ]);
 assert.equal(records[0].editorialSource,'Pitchfork');
 assert.ok(editorialEndorsement({...records[0],format:'Album'}));
 const ambiguous=html.replace('</p>','<a href="https://other.bandcamp.com/album/also">another</a></p>');
 assert.deepEqual(musicPressAlbumReferences(ambiguous,url,[mention]),[]);
});

test('automatic collectors work with independently retrieved articles, while unavailable media stay explicit',async()=>{
 const pages=new Map();
 for(const [source,url,headings,published] of articles) {
  pages.set(source.listingUrl,'<a href="'+url+'">Read</a>');
  pages.set(url,'<script type="application/ld+json">{"datePublished":"'+published+'T11:00:00Z"}</script>'+headings);
 }
 const fetcher=async url=>pages.has(url)?new Response(pages.get(url)):new Response('Unavailable',{status:404});
 const report=await collectMusicPress(sources,{fetcher,today:'2026-11-22'});
 assert.equal(report.mentions.length,4);
 assert.deepEqual(report.status.filter(row=>row.status==='ok').map(row=>row.source),['Radio Nova','Stereogum','Pitchfork']);
 assert.ok(report.status.filter(row=>row.status==='manual-review').length>=2);
 assert.ok(report.mentions.every(x=>x.editorialPublishedAt>='2026-10-23'));
});
