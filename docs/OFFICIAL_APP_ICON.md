# Official PicGift app icon

The owner selected `169bbf63-35c0-47e2-9a71-d24f7d7f40af.png` on 10 October 2026.
Its original bytes are preserved in `assets/brand/picgift-app-icon-source.png`.
The checksum and centered crop are stored in `assets/brand/app-icon.json`.
This is the permanent app icon. Seasonal campaigns must not replace it.
Changing its artwork requires an explicit new instruction from the owner.

`node scripts/app-icons.cjs` creates six sizes/targets from that source using
Sharp 0.35.5. `node scripts/app-icons.cjs --check` validates the original checksum
and decoded pixels of every target. The official-icon workflow runs this check,
instead of rewriting icons from the older website wordmark and pushing to main.

The existing website wordmark is a separate brand asset. Launcher, PWA, favicon
and Play listing icon use the owner's app artwork. No generative reinterpretation
is used in these production files: only a centered crop and size conversion.

Android's 108dp foreground canvas contains a 72dp tile. The complete decorative
tile fills the mask; circle/squircle launchers may clip decorative corners. The
central camera remains inside the safe region. Shrinking every orange decoration
into a 66dp circle would reintroduce a small icon and black margins.

The new native icon requires installing 1.8.5-beta (code 14). A web update alone
cannot replace the installed Android launcher icon. Code 13 remains a separate
previously submitted bundle.
