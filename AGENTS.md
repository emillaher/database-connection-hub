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

- The StudyTrack UI is the original vanilla JS app: markup in `src/legacy/body.html` (rendered once on `/`), logic in `public/legacy/app.js`. Why: preserves the uploaded, nearly finished app unchanged; app.js syncs to Lovable Cloud tables `courses`/`sessions` (text ids, PK user_id+id) when signed in, localStorage in guest mode.
