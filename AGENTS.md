<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Excel import rules live as pure functions in src/lib/import-rules.ts with tests; why: price/stock rules must stay verifiable.
- Product photos sit in a private bucket and are served through /api/public/foto/$; why: workspace blocks public buckets.
- The first account to sign up becomes admin (trigger on auth.users); why: no seeded credentials.
- Customer-facing category and supplier payment rules live in pure catalog-rules functions; why: navigation must not mutate imported product data.
- WhatsApp checkout validates and associates customer data with the generated order in sessionStorage, not database orders; why: preserve the existing send mechanism without adding a second ordering flow.
