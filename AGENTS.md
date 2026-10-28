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

- Database is an external Supabase project: browser client in `src/lib/supabase.ts` (publishable key), service-role client in `src/lib/supabase-admin.server.ts` (env `SUPABASE_SERVICE_ROLE_KEY`) loaded only inside server functions; schema lives in `supabase/bella-salgadinhos.sql` because migrations can't be applied from here.
- Admin panel writes go through `src/lib/menu.functions.ts`, each checking env `ADMIN_PASSWORD` — simple shared-password gate requested by the owner.
