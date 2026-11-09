#!/usr/bin/env node
/**
 * Records the demo movie (docs/images/demo.gif and an MP4) from a FRESH demo whose plugin talks to
 * stand-in.mjs, like screenshots.mjs (no translations of the sample articles yet, API key saved).
 * The editor opens the English article "Swiss chocolate, shipped worldwide", translates it with
 * Supertext into German and French and opens the German article. See "Demo movie" in docs/DEVELOPER.md.
 *
 *   BASE_URL=http://127.0.0.1:8092 DEMO_EDITOR_EMAIL=… DEMO_EDITOR_PASSWORD=… node movie.mjs
 *
 * Voice: Piper (pip install piper-tts), voice "alba" downloaded once into movie/voice-cache/
 * (git-ignored); MOVIE_VOICE=0 makes a silent movie. MOVIE_OUT: where the MP4 goes (default
 * tests/docs/movie/out/Joomla-Supertext-Translation.mp4, git-ignored; the MP4 is not committed).
 * Needs ffmpeg.
 */
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MovieKit } from './movie/movie-kit.mjs'

const B = (process.env.BASE_URL || 'http://127.0.0.1:8092').replace(/\/$/, '')
const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const out = process.env.MOVIE_OUT ?? here('movie/out/Joomla-Supertext-Translation.mp4')
const gif = here('../../docs/images/demo.gif')
const need = (name) => process.env[name] ?? (() => { throw new Error(`Set ${name}`) })()

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'en-US' })
// At 1280 px Joomla's header buttons cover the page title: hide the two that have nothing to do with
// the plugin (guided tours, post-installation messages).
await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.header-item').forEach((el) => { if (/Take a Tour|Post Installation Messages/.test(el.textContent)) el.style.display = 'none' })
}))

// Sign in as the demo editor (a Manager: Joomla's Editor group has no back end) — not recorded.
await page.goto(`${B}/administrator/index.php`)
await page.fill('#mod-login-username', need('DEMO_EDITOR_EMAIL'))
await page.fill('#mod-login-password', need('DEMO_EDITOR_PASSWORD'))
await Promise.all([page.waitForNavigation(), page.click('#btn-login-submit')])
await page.waitForLoadState('networkidle')
await page.goto(`${B}/administrator/index.php?option=com_content&view=articles&filter[search]=&filter[language]=&list[fullordering]=a.id ASC`)
await page.waitForLoadState('networkidle')
const editUrl = await page.locator('tr', { hasText: 'Swiss chocolate' }).locator('a[href*="task=article.edit"]').first().evaluate((a) => a.href)

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'joomla-movie-'))
await page.goto(editUrl)
await page.waitForLoadState('networkidle')
await page.waitForTimeout(1500) // TinyMCE
const kit = await MovieKit.start(page, { workDir, assets: here('movie/assets'), voiceCache: here('movie/voice-cache') })
const ripple = () => page.evaluate(([x, y]) => window.__stk?.ripple(x, y), [kit.cursor.x, kit.cursor.y])

// 1. The English article in the editor.
await kit.say("Here's an article in English, in the Joomla administrator.", { caption: 'An article in English' })

// 2. Supertext → Translate with Supertext.
const dialog = page.locator('.supertext-dialog')
await kit.say('Click Supertext in the toolbar.', {
  caption: 'Click <b>Supertext</b> in the toolbar',
  during: async () => {
    await kit.click(page.locator('.supertext-open').first())
    await dialog.locator('fieldset').waitFor()
    await kit.hold(300)
  },
})
await kit.say('Keep German and French, and untick Italian. Then click Translate.', {
  caption: '<b>Translate with Supertext</b>: <b>German</b> and <b>French</b>, then <b>Translate</b>',
  during: async () => {
    await kit.hold(500)
    await kit.click(dialog.locator('label[for="st-it-IT"]'))
    await kit.hold(300)
    await kit.moveTo(dialog.locator('[data-go]'))
  },
  after: 0,
})

// The stand-in answers at once: send the request only after the progress state has been seen.
let release
const released = new Promise((resolve) => (release = resolve))
await page.route(/option=com_ajax/, async (route) => {
  if (route.request().method() === 'POST') await released
  await route.continue()
})
await ripple()
await kit.say('Supertext translates the content.', {
  caption: 'Supertext translates the content…',
  during: async () => {
    await dialog.locator('[data-go]').click()
    await kit.hold(1300)
    release()
  },
})
kit.pause()
await dialog.locator('.supertext-results').waitFor({ timeout: 300_000 })
await page.unroute(/option=com_ajax/)
kit.resume()
await kit.sync()

// 3. The result: open the German article.
await kit.say('A few seconds later, the German and French articles are there, linked to the English one and unpublished.', {
  caption: 'Done: German and French articles, saved unpublished',
  during: () => kit.moveTo(dialog.locator('.supertext-results li').first()),
})
await kit.say("Let's open the German article.", {
  caption: 'Click <b>Open</b> next to the German article',
  during: async () => {
    const open = dialog.locator('.supertext-results li', { hasText: 'German' }).locator('a').first()
    await kit.moveTo(open)
    await ripple()
    await kit.hold(250)
    kit.pause() // loading the editor is cut
    await Promise.all([page.waitForNavigation(), open.click()])
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500) // TinyMCE
    await kit.sync()
    kit.resume()
  },
})
await kit.say('The German version is ready. Review it, and publish it as usual.', {
  caption: 'The German version is ready – review it and publish',
  during: async () => { await kit.hold(400); await kit.moveTo(page.locator('#jform_title')) },
})
await kit.caption('')

fs.mkdirSync(path.dirname(out), { recursive: true })
await kit.finish(out, { system: 'Joomla', repo: 'Joomla-Supertext-Translation', gif })
await browser.close()
fs.rmSync(workDir, { recursive: true, force: true })
console.log(`Saved ${out} and ${gif} (${(fs.statSync(gif).size / 1e6).toFixed(2)} MB)`)
