# Embedding in Freshdesk (verified)

- Freshdesk KB articles have a **code view** that accepts an `<iframe>` tag.
- The iframe only supports pages that **do not require login** → host the tutorial publicly.
- Freshdesk appends `sandbox="allow-scripts allow-forms allow-same-origin allow-presentation"`
  to embedded iframes. `allow-scripts` is present, so the tutorial's JavaScript executes.
- Pasting the tutorial HTML directly as the article body does **not** work — inline scripts are stripped.

## Recipe
1. Build → host `embed.html` on GitHub Pages (public).
2. In the article, open code view (`</>`) and insert:
   `<iframe src="https://<you>.github.io/tutorials/efl/invite-users/embed.html"
            width="100%" height="720" style="border:0" loading="lazy"></iframe>`
3. Deep-link a specific step for support replies: append `#step-4` to the src.
