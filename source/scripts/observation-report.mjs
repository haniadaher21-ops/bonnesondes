// Only public recommendation metadata and aggregate diagnostics may leave the private runner.
// Never serialize the taste profile, raw reactions, followed playlist URLs or candidate cache.
export function observationReport(report, diagnostics) {
  return {
    generatedAt:report.generatedAt,startsOn:report.draft.startsOn,complete:report.complete,
    personalized:report.personalized,profileRevision:diagnostics.profileRevision,
    profileUpdatedAt:diagnostics.profileUpdatedAt,profileSignalCounts:diagnostics.profileSignalCounts,
    comparisonToNeutral:diagnostics.comparison,
    tracklistComparison:diagnostics.tracklistComparison,
    gaps:report.gaps,errors:report.errors,incremental:diagnostics.incremental,
    selected:Object.fromEntries(Object.entries(report.selected).map(([section,rows])=>[section,rows.map(row=>({
      id:row.item.id,title:row.item.title,creator:row.item.creator,source:row.item.source,provider:row.item.provider,
      artwork:row.item.artwork,
      genre:row.item.genre,tags:row.item.tags ?? [],sourceId:row.item.sourceId,mixKind:row.item.mixKind,
      embed:row.item.embed,audienceVerified:row.item.audienceVerified,novaMixVerified:row.item.novaMixVerified,
      viewCount:row.item.viewCount,subscriberCount:row.item.subscriberCount,
      mixStyle:row.item.mixStyle,mixStyleVerified:row.item.mixStyleVerified,
      url:row.item.url,sourceUrl:row.item.sourceUrl,releaseDate:row.item.releaseDate,
      editorialSource:row.item.editorialSource,editorialUrl:row.item.editorialUrl,
      editorialKind:row.item.editorialKind,editorialClaim:row.item.editorialClaim,
      releaseProofUrl:row.item.releaseProofUrl,listeningProofUrl:row.item.listeningProofUrl,listeningMappingUrl:row.item.listeningMappingUrl,
      date:row.item.date,minutes:row.item.minutes,score:row.score,
      affinityApplied:row.signals.length>0,publicReason:row.publicReason,
    }))])),
    albumEvidence:diagnostics.albumEvidence.map(row=>({title:row.title,creator:row.creator,sourceUrl:row.sourceUrl,
      verifiedReleaseDate:row.verifiedReleaseDate,eligible:!!row.candidate,reason:row.reason})),
    albumCatalogues:diagnostics.catalogues,youtubeMixes:diagnostics.youtubeMixes,
    sourceCoverage:diagnostics.sources.filter(row=>!row.sourceId.startsWith('spotify-follow-')),
    liveStatus:diagnostics.liveStatus,build:diagnostics.build ?? 'not-run',publicationEnabled:false,
  };
}
export function renderObservation(report) {
  const safe=value=>String(value??'').replace(/[\r\n|<>`]/g,' ').trim();
  return ['# Observation musicale — '+report.startsOn,
    'Généré : '+report.generatedAt+'. Publication automatique désactivée.',
    'Profil synchronisé : révision '+report.profileRevision+' ; personnalisé : '+report.personalized+'.',
    'Quotas : '+(report.complete?'complets':'incomplets')+'. Build : '+report.build+'.',
    'Incrémental : '+JSON.stringify(report.incremental),
    ...Object.entries(report.selected).flatMap(([section,rows])=>['## '+section,...rows.map(row=>
      '- **'+safe(row.title)+'**'+(row.creator?' — '+safe(row.creator):'')+' · '+safe(row.source)+' · score '+row.score
      +' · '+safe(row.publicReason)+'\n  Écoute : <'+row.url+'> · Source : <'+row.sourceUrl+'>'
      +(row.releaseProofUrl?' · Date : <'+row.releaseProofUrl+'>':'')
      +(row.listeningProofUrl?' · Lien d’écoute : <'+row.listeningProofUrl+'>':'')),...(!rows.length?['Aucun candidat admissible.']:[])]),
    '## Influence du profil (mêmes candidats, profil neutre comparé)',JSON.stringify(report.comparisonToNeutral),
    ...(report.tracklistComparison?['## Effet des tracklists (même profil)',JSON.stringify(report.tracklistComparison)]:[]),
    '## Places manquantes',JSON.stringify(report.gaps),
    '## Preuves albums',...report.albumEvidence.map(row=>'- '+safe(row.creator)+' — '+safe(row.title)+' · '
      +(row.eligible?'vérifié':safe(row.reason))+' · '+safe(row.verifiedReleaseDate)+' · <'+row.sourceUrl+'>'),
    '## Couverture des sources',...report.sourceCoverage.map(row=>'- '+safe(row.name)+' : '+row.status+' · '+row.count+' candidats · '+row.errors.map(safe).join('; ')),
    '## Catalogues primaires',...report.albumCatalogues.map(row=>'- '+safe(row.source)+': '+row.status+' · '+row.eligibleVerified+' dates dans la fenêtre'),
    '## Limites',safe(report.liveStatus),...report.errors.map(safe),
  ].join('\n\n')+'\n';
}
