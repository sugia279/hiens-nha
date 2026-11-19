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

The owner avatar uses the existing `public/resume/SuDuyHien_Profile.png` asset and links to About. The cover is inside the Home content column again (PR52's full-width header layout was reverted). The topbar search stays visible on all routes, including Home. The header logo is a scalable circular HN monogram with a shared vertical stroke; branding remains Hiên Nhà.

Below the introduction, the avatar/thought textarea opens the existing owner editor on focus. Typed text synchronizes with the draft body; title/format/tags and publishing still use the existing validated editor/API. Guests and members see a disabled textarea plus an account/help note; they cannot open this owner composer. Logging out clears the thought text and collapses it. No drafts or credentials are stored in browser storage by this strip.

Photo metadata, order, albums, original-size dialog, and responsive WebP generation are unchanged. The Home thumbnail `sizes` hints remain separate from gallery defaults.

## Owner dialog

[Sửa ảnh và lời dẫn](project/home-profile.md) now saves the selected 1–4 images, avatar, introduction and one of three frame styles as public API settings. Defaults in Git remain the fallback before the first save. Choosing from existing gallery assets or using HTTPS URLs is supported; uploading a new local image file is a separate feature.
