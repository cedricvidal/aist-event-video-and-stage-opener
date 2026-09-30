# The prompts

This whole repo came out of **one GitHub Copilot session**. These are the prompts in order (typos lightly fixed), with a note on what each one produced. The agent ran in a repository that already had the event's speaker list (`speakers.yaml`) and access to the event page. Scope's source code was available locally for prompt 3.

For ready-to-use, generalized versions of these prompts (a promo from a Luma event, and a stage opener), see [Making your own, with prompts](README.md#making-your-own-with-prompts).

| # | Prompt | Result |
|---|---|---|
| 1 | *Create a promotion video for the upcoming AI Show and tell event. It should feature the speakers, their profile picture, a quick pitch about their talk, but feel free to be creative. It should be fantastic. I'll publish the video on Linkedin and Twitter* | (`step-1-promo/`) The whole pipeline: HTML/GSAP scenes built from `event.json`, a Playwright + ffmpeg renderer, the synthesized music bed, and 16:9, 1:1 and 9:16 renders with posters and `post-copy.md`. |
| 2 | *open folder with videos* | Opened `out/` for review. |
| 3 | *this is really nice, I love it, great job! for my talk on scope, you were lacking context, look at the project in ~/Documents/Projects/Repos/scope-oss and improve just the part of the video on scope* | Read the Scope repo and rewrote only Cedric's scene around Scope ("one task, every coding agent, same criteria"), with a new product-gap stamp cue. |
| 4 | *create an alternative version of the video (keep the current one) with https://www.linkedin.com/in/pamela-s-fox/ as the host and panel mediator* | Added an optional `host` block and scene, plus the `step-2-host/` variant. It reuses the base assets. |
| 5 | *what's the best video format for X, Linkedin and Insta?* | Advice only: 1:1 fits most feeds, 9:16 is for Stories and Reels, and 4:5 takes up the most feed space. |
| 6 | *do a 4:5 version for Linkedin* | Opt-in `--formats 4x5` (1080×1350), which reuses the 1:1 layout with `html[data-aspect="4x5"]` tweaks. |
| 7 | *open the folder containing the videos with Pamela* | Opened the variant's `out/`. |
| 8 | *I need a variation of the 16:9 format video but this time to show at the beginning of the event on stage. I need the space is limited beat removed. I need to present the hosts, Cedric and Pamela presented first then the speakers (Cedric is both host and speaker) and I need at the end the sponsors presented. First Global AI Comunity but also Github who owns the venue and Microsoft. Keep previous versions, this is a new one. This one only needs 16:9. make a plan* | A plan: a joint `hosts` scene, a `sponsors` wall that replaces the CTA, one music hit per logo, and no RSVP. |
| 9 | *go* | Built the `step-3-stage/` variant and checked that the other videos still render exactly as before. |
| 10 | *status* | A progress report while the render ran. |
| 11 | *in addition to the video, can we make it a static file I can open in a browser and I can hit the space bar and right and left arrow to move between beats? the music would have to stay on uninterrupted for the whole duration.* | `live.mjs`: a single-file presenter that steps through beats on a keypress over a gapless groove loop, with clicker keys, fullscreen, mute, volume and a black screen. |
| 12 | *is the HTML file self sufficient?* | Confirmed by running it offline in headless Chrome with all network access blocked: no requests, and fonts, audio and beats all worked. |
| 13 | *this is great, I also in addition a light mode version* | (See 14.) |
| 14 | *of the stage live html only* | `--theme light` builds a light-mode presenter. |
| 15 | *create a 3rd version, based on the dark mode with a way to adjust the constrast* | `--adjust` adds live contrast and brightness keys (`]` `[` `'` `;` `0`), remembered across reloads. |
| 16 | *nice. On the sponsor beat, add the QR Code to global AI community website https://globalai.community/* | An optional `sponsors.qr` with an image and caption. The QR was checked by decoding it from a 1920×1080 frame. |
| 17 | *only the contrast one is required* | Scope clarification: the adjustable-contrast presenter is the one used on stage. |

## Tips from the session

- **Give it context:** the Scope scene only got good once the agent read the actual project (prompt 3).
- **Ask for a plan before big changes** (prompt 8), then say "go".
- **Keep variants additive:** every new feature is an optional `event.json` block, so earlier videos keep rendering exactly the same.
- **Ask it to verify:** stills, loudness, offline checks and QR decoding caught issues before the event.
