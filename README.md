# puranjaykumar.com

My personal site. It's a portfolio with a small idle game built into it: you press for cheese, hire rats to make more, and earning cheese unlocks each section of the page. Recruiters can skip straight to the content with one click.

The full version of the game, with a leaderboard, lives at [puranjaykumar.com/cheese](https://puranjaykumar.com/cheese/).

The site is designed by me. Most of the code was written with Claude, Anthropic's AI model, working from my decisions on the design, the economy and how each feature should behave.

## How it's put together

It's a static site on GitHub Pages, with no build step and no framework.

| Path | What it is |
|---|---|
| `index.html` | The portfolio and the light version of the game |
| `cheese/index.html` | The full game |
| `js/cheese-core.js` | The shared game engine: saving, the economy, upgrades and rebirth |
| `js/reginald.js` | Sir Reginald, the site's host, who runs the tutorial and the occasional fact |
| `js/leaderboard.js` | Talks to the leaderboard server |
| `worker/` | The leaderboard server, which runs on Cloudflare (it isn't served from here) |
| `puranjaykumarcv.pdf` | My CV |

## Things worth a look

**One save across both pages.** Progress is stored in the browser with a version number, so older saves upgrade cleanly when the game changes. If both pages are open in different tabs, only the one you're looking at plays; the other pauses and picks up from the save when you switch back, so nothing is lost or counted twice. An old cached copy of a page that notices a newer version has run stops saving and asks to be refreshed.

**A modelled economy.** Prices, output, milestones and upgrades were tuned by simulating players through the game rather than by guesswork. Each new tier of staff pays for itself about twice as fast as the best older option at the moment you reach it, and selling the company for shares (rebirth) was balanced so each run gets back to the last one's total noticeably faster.

**A leaderboard that's safe to show recruiters.** Players appear under generated cheese names, and any name they type only appears after I approve it. The server never trusts the browser: scores can only go up, there's a limit on how often they can be sent, and a score that grows faster than the game allows is hidden until I review it. The board reads from a database index and is cached, which keeps it well inside Cloudflare's free limits.

## Updating

- **CV:** replace `puranjaykumarcv.pdf` with a file of exactly the same name.
- **Code:** after changing anything in `js/`, bump the `?v=` number on the script tags in both pages, so browsers fetch the new files instead of a cached copy.
