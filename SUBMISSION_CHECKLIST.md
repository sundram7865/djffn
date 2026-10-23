# Submission checklist

## Repository
- [ ] Repo is **public** on GitHub with an anonymous random-string name (`djffn`).
- [ ] No personal names or emails in the code or docs (`git grep -i "<your name>"` returns nothing).
      Commits are authored under your own GitHub identity; only the repository name needs to be anonymous.
- [ ] Opens in an **incognito** window without signing in.
- [ ] README contains:
  - [x] directory and file listing with a one-line description each
  - [x] how to start the app (Docker and without Docker)
  - [x] how to run the tests
  - [ ] **link to the deployed Vercel app** (replace `<VERCEL_URL>`)
  - [x] key assumptions (cutoff, time zone, scope)
  - [x] design decisions, trade-offs, limitations, next steps
  - [x] explicit AI-tool disclosure
- [ ] CI is green on the latest commit (Actions tab).

## Deployment
- [ ] Vercel project imported from the GitHub repo, deployed from `main`.
- [ ] In incognito: `/` loads, both views render, the cutoff presets switch, a custom cutoff works.
- [ ] `/api/health` returns `{"status":"ok",…}`; `/api/docs` opens.
- [ ] Deployment Protection is **off** for production (Vercel → Project → Settings → Deployment Protection),
      otherwise reviewers get a Vercel login wall.

## Video
- [ ] Two parts: customer pitch (≤ 5 min) + tech lead walkthrough (≤ 5 min); **total < 10 min**.
- [ ] Uploaded to YouTube as **Unlisted** (not Private).
- [ ] Link opens in incognito and plays.

## Form
- [ ] "Full Stack SWE challenge submission v4" form filled with: GitHub repo URL, deployed app URL,
      YouTube video URL, and any other requested fields.
- [ ] Every submitted URL re-opened in incognito right before pressing Submit.
