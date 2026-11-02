# puranjaykumar.com

My personal site. It's a portfolio with a small idle game built into it: you press for cheese, hire rats to make more, and earning cheese unlocks each section of the page. Recruiters can skip straight to the content with one click.

The full game lives at [puranjaykumar.com/cheese](https://puranjaykumar.com/cheese/), with a career ladder of eleven kinds of staff, markets to trade, consultants to gamble on, and a leaderboard.

The site is designed by me with assistance from best bud Claude.

## How it's put together

It's a static site on GitHub Pages, with no build step and no framework.

| Path | What it is |
|---|---|
| `index.html` | The portfolio and the light version of the game |
| `cheese/index.html` | The full game |
| `js/cheese-core.js` | The shared game engine: saving, the economy and every feature below |
| `js/reginald.js` | Sir Reginald, the site's host: the tutorial, board decisions, takeover offers and the occasional fact |
| `js/leaderboard.js` | Talks to the leaderboard server |
| `worker/` | The leaderboard server, which runs on Cloudflare (it isn't served from here) |
| `puranjaykumarcv.pdf` | My CV |

## What's in the full game

- **Staff:** eleven tiers from Intern to Central Banker, each with four upgrades, milestone bonuses, and promotions that turn ten of one rank into one of the next.
- **Selling the company:** a sale is priced on the company's value (cheese in hand plus what its staff cost), paid in shares that boost output for good and buy permanent perks. The last three tiers only unlock after selling.
- **Going public:** a second layer above selling, trading shares for stock.
- **Markets:** bull, flat and bear phases that move output, and a cheese futures desk for going long or short.
- **Risk and timing:** consultants with published odds, timed contracts, treasury bonds, golden cheese, board decisions and hostile takeover offers.
- **Achievements and stats:** 41 achievements, each worth a little extra output, and a stats panel.

## Things worth a look

**One save across both pages.** Progress is stored in the browser with a version number, so older saves upgrade (or reset) cleanly when the game changes. If both pages are open in different tabs, only the one you're looking at plays; the other pauses and picks up from the save when you switch back, so nothing is lost or counted twice. An old cached copy of a page that notices a newer version has run stops saving and asks to be refreshed.

**A modelled economy.** Prices, output and every feature were tuned by simulating players through the game rather than by guesswork, then checked again on the real code. A few examples of what that caught: a first version of futures that won 99% of the time, bonds that compounded far too fast, and an endgame where shares, output and higher tiers fed each other until the game ran away. Shares now have diminishing returns, and after going public they're priced relative to your stock.

**Rules that can't be gamed.** A company's value is always backed by cheese actually earned, so promotions, takeover premiums, bonuses and free starting staff can never inflate a sale. Edited saves are cleaned on load: numbers are capped at what's possible, and anything a player couldn't have earned is removed.

**A leaderboard that's safe to show recruiters.** Players appear under generated cheese names, and any name they type only appears after I approve it. The server never trusts the browser: scores can only go up, there's a limit on how often they can be sent, and a score that grows faster than the game allows is hidden until I review it. The board reads from a database index and is cached, which keeps it well inside Cloudflare's free limits.

**Tested.** The game was developed against an automated suite of over 500 checks, including simulated players playing the real pages for hours at a time while checking every number on screen.

## Updating

- **CV:** replace `puranjaykumarcv.pdf` with a file of exactly the same name.
- **Code:** after changing anything in `js/`, bump the `?v=` number on the script tags in both pages, and `CODE_VERSION` in `js/cheese-core.js`, so browsers fetch the new files instead of a cached copy.
