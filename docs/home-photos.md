# Add a homepage photo through GitHub

The home page uses `homePhotos` in `src/lib/photos.ts`. It reads metadata from `src/data/photos/*.json`, resolves each referenced asset, and selects up to four records with a positive `featuredOrder`, sorted by that order (then ID for ties). Uploading an image alone does not publish a new gallery entry.

1. Upload the image under `src/assets/home/` (JPG, JPEG, PNG or WebP; filename may contain letters, digits and hyphens).
2. Create a matching metadata record under `src/data/photos/`, with a lowercase ID and matching JSON filename.
3. Set `image` to the exact path, including uppercase/lowercase spelling. Set `album` to `family`, `scenery` or `moments`.
4. Set `featuredOrder` to a positive number to select it for Home. The first four selected records appear in the cover; additional records remain available in their albums. Omit this field for gallery-only photos.
5. Commit both files and wait for a successful Pages deployment.

Example: `src/data/photos/bill-va-boi.json` references `src/assets/home/Bill-va-Boi.jpg` with `featuredOrder: 4`. The photo appears in Home and the Family album, with the existing full-size image dialog.

The website's Photos → Add photo form creates the asset and metadata together for gallery uploads; homepage placement is controlled by `featuredOrder` in the metadata.

## Responsive homepage layout

Choose **one to four** photos for the cover above Hien’s circular profile photo and introduction. One photo fills the cover; two share the width; three or four use matching columns on wide layouts. At 35rem available width or narrower, three form a tall-left/two-right collage and four form a 2×2 grid. No empty slots are reserved. The cover keeps a bounded height rather than adding rows beyond four. If none are selected, a neutral background preserves the avatar/search layout. Thumbnail frames crop with `object-fit: cover`; clicking still opens the original full-size image and description. This stage selects photos through metadata, not a new owner-facing banner editor.

The owner avatar uses the existing `public/resume/SuDuyHien_Profile.png` asset and links to About. It is the fixed owner profile, not the signed-in visitor’s account avatar. Homepage search is a magnifier at the upper right of the cover; it opens a native disclosure containing a VI/EN search form. Escape or a click outside closes it when JavaScript is available. Native disclosure/form navigation works without JavaScript; actual search results still require the existing search client. Interior pages retain the topbar search.

Photo metadata, order, albums, original-size dialog, and responsive WebP generation are unchanged. The Home thumbnail `sizes` hints remain separate from gallery defaults.

## Header placement (2026-11-19)

On Home (VI/EN), the cover and overlapping owner avatar now belong to the full-width site header, outside the main content column. Menu, Hiên Nhà identity and language controls overlay the top of the cover. Search opens below these controls. The sidebar and page content start below this header; interior pages retain the compact header for reading. The repeated large Home title is visually removed, with a screen-reader heading retained. Branding and SEO use Hiên Nhà; repository/base URLs and historical discussion identities are preserved.
