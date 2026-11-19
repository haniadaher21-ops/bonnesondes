# Real observations: proposed edition of 23 November 2026

## Verified with the synchronized owner profile

[Actions run 44580161622](https://github.com/haniadaher21-ops/bonnesondes/actions/runs/44580161622), source commit `ddf0149f22ac14dd05f41642486d3e08d97999f2`, passed 54 tests, TypeScript, one collection and three complete observations using the actual Supabase profile (revision 1). Each observation checked the selected links and built a temporary draft export. Exports were discarded; no edition was approved, merged or deployed. Both automation flags were checked disabled. The final corrections strengthen article assertions, Spotify proof provenance and Retry-After handling; their current check is linked in the PR description.

The album window is **9 November through the observation date, 19 November**. Future releases do not fill quotas. The edition starts Monday 23 November at 00:00 Europe/Paris if publication is later approved.

| Format | Exact recommendation | Date | Primary source | Listen |
| --- | --- | --- | --- | --- |
| albums | Wonky Logic - Mek Do & Mend | 2026-11-11 | [Brownswood Recordings](https://brownswoodrecordings.com/news/wonky-logic-mek-do-mend/) | [Open](https://open.spotify.com/album/6H6497odidXH5VRnynYQnV) |
| albums | Aesop Rock & Blockhead - Trouble Mountain | 2026-11-13 | [Rhymesayers Entertainment](https://rhymesayers.com/products/aesop-rock-x-blockhead-trouble-mountain-cd) | [Open](https://open.spotify.com/album/0Fta5KudJiX6HpDWApUu8y) |
| albums | Stephan Micus - Traces in the Sand | 2026-11-13 | [ECM](https://ecmrecords.com/product/traces-in-the-sand-stephan-micus/) | [Open](https://open.spotify.com/album/1eG7wpa0IAoDx3LhLR1xwR) |
| nts | Don't Trip w/ Margarita | 2026-11-13 | [NTS Radio](https://www.nts.live/api/v2/shows/dont-trip/episodes) | [Open](https://www.nts.live/shows/dont-trip/episodes/dont-trip-13th-november-2026) |
| otherRadio | Club Jazzafip du mercredi 18 novembre 2026 | 2026-11-18 | [FIP · Club Jazzafip](https://radiofrance-podcast.net/podcast09/podcast_13d4ef2f-2aca-4331-949b-bc8da638d670.xml) | [Open](https://www.radiofrance.fr/fip/podcasts/club-jazzafip/club-jazzafip-du-mercredi-18-novembre-2026-2933932) |
| playlists | KEXP - New This Week | not published | [Spotify](https://kexp.org/about/submission-guidelines/) | [Open](https://open.spotify.com/playlist/60VayqPuLXaftoj2Wrqpti) |
| live | Rachel Chinouriri - Pretty Girls in the Radio 1 Live Lounge | 2026-11-18 | [BBC Radio 1 · Live Lounge](https://www.youtube.com/feeds/videos.xml?channel_id=UC-FQUIVQ-bZiefzBiQAa8Fw) | [Open](https://www.youtube.com/watch?v=sWJbOWJMJQ0) |

The [JSON snapshot](recommendations-2026-11-23.json) preserves these public recommendations, scores and neutral comparison. It contains no raw profile, detailed reactions or followed private-playlist URLs. Current Spotify oEmbed responses prove listening destinations; independently established mapping URLs are tracked separately.

## Measured preference influence

Personalized ranking puts **Mek Do & Mend** first (58.4), ahead of Trouble Mountain (45) and Traces in the Sand (45). With exactly the same pool and a neutral profile, Mek Do & Mend is third. FIP and NTS also receive preference boosts, but their choices do not change in this pool. The playlist and live performance have no matching personal signal here. No private Spotify listening history or ML model is used.

## Observed persistence

- Initial real collection: 0 -> 66 discoveries, then 66 -> 67.
- Successful collection: 67 -> 67, followed by three observations retaining all 67 discoveries.
- All three observations use the catalogue cache. A separate Supabase read confirms every state save. Album pages, listening links and YouTube metadata are rechecked.
- The runner does not change the owner profile, favorites, reactions, editions or Pages files. It writes only its public-metadata index and private execution history.

## Remaining coverage and reliability gaps

- **No missing quota in the three complete observations**, but only one week has been measured. This does not guarantee three eligible albums every future week.
- Bandcamp Notes returned HTTP 403. Direct label catalogues are independent. A Bandcamp 429 stops the shared provider queue and persists a cooldown without proxies or IP changes.
- Rhythm Section catalogue addresses tested returned 404 and are removed from active configuration pending a verified official address. The registry now has 13 Bandcamp catalogues plus a primary release-day news adapter, alongside Ninja Tune, Sub Pop and ECM.
- Full FIP programming and individual La Belle Aventure replays still lack confirmed connectors. Basique is manual; COLORS had no eligible session in this observation.
- Spotify curator-profile URLs alone do not enumerate every curator playlist without a verified public entry point. KEXP is discovered from its publisher page and verified on Spotify; no playlist creation date is invented.
- The conservative five-track Bandcamp rule rejects the double singles encountered but can exclude legitimate shorter albums.
- Real scheduled execution awaits a separately approved merge and activation. Consecutive observations prove persistence and current operation, not multiweek availability.

## Earlier failures remain visible

Earlier public neutral/FIP/Nova observations found only one album and no verified live before external setup. [Integration run 44543206446](https://github.com/haniadaher21-ops/bonnesondes/actions/runs/44543206446) subsequently passed after the owner completed real magic-link sign-in and a consented save.

[First personalized run](https://github.com/haniadaher21-ops/bonnesondes/actions/runs/44558177409) confirmed persistence but missed quotas. [The next run](https://github.com/haniadaher21-ops/bonnesondes/actions/runs/44563505518) still missed one album during Bandcamp rate limits. Neither counts as a complete observation. The release-proof merge now preserves specialized adapters and confirmed listening links. Brownswood explicitly confirms its album release on the article date, providing primary evidence independent of Bandcamp. An ordinary article publication date or announcement does not qualify.

Successful artifact `bonnes-ondes-observations` (14558433813) SHA-256: `5984e4678ffb5c006dfad204be564511d63bd61c6cd424d639d526e2546e6759`. Artifacts expire after seven days; the public snapshot remains in this PR for musical review.

**AUTO_PUBLISH_ENABLED and COLLECTION_ENABLED remain disabled. Nothing was merged or deployed in this phase.**
