# QuoteCloud website redesigns

Design explorations for [quote.cloud](https://www.quote.cloud/) marketing pages: animated, editorial landing-page variants that share the live site's header and footer.

Built with Vite, TypeScript and plain CSS (no framework).

## Run it

```sh
bun install     # or npm install
bun run dev     # http://localhost:5190, the hub page links every variant
bun run build   # static output in dist/
```

## Layout

- `index.html`: hub linking every variant
- `v1/` to `v10/`: product overview
- `travel/`, `itinerary/`, `telco/`, `esign/`, `quoting/`, `docgen/`, `blocks/`, `canvas/`, `collab/`: one folder per page, each holding `vN/` variants
- `src/partials/`: shared header, footer, SEO head and FAQ partials, pulled in with `<!-- @include name -->`
- `src/shared/`: shared base styles and scripts
- `public/assets/`: images and logos
