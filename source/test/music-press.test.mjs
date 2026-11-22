import assert from 'node:assert/strict';
import {test} from 'node:test';
import sources from '../editorial/music-press.json' with {type:'json'};
import {musicPressLinks,musicPressMentions,matchMusicPress,collectMusicPress} from '../scripts/music-press.mjs';
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
  assert.ok(sources.find(row=>row.id==='npr').mode==='manual');
  assert.deepEqual(sources.filter(x=>x.mode==='automatic').map(x=>x.id),['nova','stereogum','pitchfork']);
});

test('explicit album-curation articles and the last 30 days are required',()=>{
 for(const [source,url,headings,published] of articles){
  const listing='<a href="'+url+'">Choix des disques</a><a href="https://example.org/other">Other</a>';
  assert.deepEqual(musicPressLinks(listing,source),[url]);
  const content='<script type="application/ld+json">{"datePublished":"'+published+'T10:00:00Z"}</script>'+headings;
  const found=musicPressMentions(content,source,url,'2026-11-22');
  assert.ok(found.length>=1,source.id);
  assert.equal(found[0].editorialPublishedAt,published);
  assert.deepEqual(musicPressMentions(content,source,url,'2027-01-01'),[]);
 }
 assert.deepEqual(musicPressLinks('<a href="https://evil.example/99/album-of-the-week-a/reviews/album-of-the-week">bad</a>',stereogum),[]);
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
