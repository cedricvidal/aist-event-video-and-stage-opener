# Example assets and credits

The example video folders include real event assets so they render out of the box. **These assets are not covered by this repository's MIT license.** They belong to their respective owners, and they're included only to demonstrate the tool for the AI Show & Tell event of Sept 28, 2026. Don't reuse them for other purposes. Replace them with your own event's assets.

| File | Owner / notes |
|---|---|
| `step-1-promo/assets/cedric-vidal.jpeg` | Headshot of Cedric Vidal, used with permission |
| `step-1-promo/assets/satya-devarakonda.png` | Headshot of Satya Devarakonda (Scalekit), event speaker |
| `step-1-promo/assets/isaac-miller.png` | Headshot of Isaac Miller (DSPy / cmpnd), event speaker |
| `step-1-promo/assets/mathis-joffre.jpeg` | Headshot of Mathis Joffre (Blaxel), event speaker |
| `step-2-host/assets/pamela-fox.jpg` | Headshot of Pamela Fox, event host |
| `step-1-promo/assets/cover.webp` | AI Show & Tell event cover art |
| `step-1-promo/assets/global-ai-logo.png` | Global AI Community logo, a trademark of Global AI Community |
| `step-3-stage/assets/github-logo.svg` | GitHub logo, a trademark of GitHub, Inc. |
| `step-3-stage/assets/microsoft-logo.svg` | Microsoft logo, a trademark of Microsoft Corporation |
| `step-3-stage/assets/globalai-qr.svg` | QR code pointing to https://globalai.community/ |

Trademarks and logos are shown to credit event sponsors and the venue. Showing them doesn't imply endorsement of this project.

If you're pictured here and want your image removed, open an issue.

## Third-party software and fonts

- **Space Grotesk** and **JetBrains Mono**, from [Fontsource](https://fontsource.org), are licensed under the SIL Open Font License 1.1. See `fonts/OFL-*.txt`.
- **GSAP** is installed from npm and is subject to the [GSAP standard license](https://gsap.com/standard-license). `live.mjs` inlines it into the generated presenter HTML.
- **Playwright** (Apache-2.0) and **ffmpeg** are used at render time only.
- **Music and SFX** are synthesized from scratch by `music/synth.py` and are covered by the MIT license with the rest of the code.
