# Add a homepage photo through GitHub

The home page uses `homePhotos` in `src/lib/photos.ts`. It reads metadata from `src/data/photos/*.json`, resolves each referenced asset, and selects records with a positive `featuredOrder`. Uploading an image alone does not publish a new gallery entry.

1. Upload the image under `src/assets/home/` (JPG, JPEG, PNG or WebP; filename may contain letters, digits and hyphens).
2. Create a matching metadata record under `src/data/photos/`, with a lowercase ID and matching JSON filename.
3. Set `image` to the exact path, including uppercase/lowercase spelling. Set `album` to `family`, `scenery` or `moments`.
4. Set `featuredOrder` to a positive number to show it on Home. Omit this field for gallery-only photos.
5. Commit both files and wait for a successful Pages deployment.

Example: `src/data/photos/bill-va-boi.json` references `src/assets/home/Bill-va-Boi.jpg` with `featuredOrder: 4`. The photo appears in Home and the Family album, with the existing full-size image dialog.

The website's Photos → Add photo form creates the asset and metadata together for gallery uploads; homepage placement is controlled by `featuredOrder` in the metadata.

## Responsive homepage layout

Featured photos now form the cover banner above Hien’s circular profile photo and introduction. The banner uses four columns when its own available width exceeds 35rem, and two below that (including phones and narrower sidebar layouts). Thumbnail frames crop with `object-fit: cover`; clicking still opens the original full-size image and description. Adding more featured records adds rows, so keep four for the current cover design.

The owner avatar uses the existing `public/resume/SuDuyHien_Profile.png` asset and links to About. It is the fixed owner profile, not the signed-in visitor’s account avatar. Homepage search is a magnifier at the upper right of the cover; it opens a native disclosure containing a VI/EN search form. Escape or a click outside closes it when JavaScript is available. Native disclosure/form navigation works without JavaScript; actual search results still require the existing search client. Interior pages retain the topbar search.

Photo metadata, order, albums, original-size dialog, and responsive WebP generation are unchanged. The Home thumbnail `sizes` hints remain separate from gallery defaults.
