#!/usr/bin/env node
/**
 * Records the install and configuration movie (MP4 only, no GIF) like movie.mjs: an administrator
 * builds the package (terminal: ./build.sh), uploads it under System → Install → Extensions, sees the
 * site's content languages, enables the plugin, enters a made-up API key (saving checks it),
 * looks at the Languages tab (French → fr-CH) and sees where editors find the Supertext button.
 * See "Demo movie" in docs/DEVELOPER.md.
 *
 * Needs a fresh demo WITHOUT this plugin (languages, accounts and sample articles from
 * supertext:demo-setup, but plg_system_supertext not installed), served with
 * SUPERTEXT_API_ENDPOINT and SUPERTEXT_REPORT_URL pointing at the stand-in and no SUPERTEXT_API_KEY,
 * and the package built with ./build.sh:
 *
 *   BASE_URL=http://127.0.0.1:8092 DEMO_ADMIN_EMAIL=… DEMO_ADMIN_PASSWORD=… node movie-install.mjs
 *
 * The key typed in is st-demo-0000-0000-0000 (the stand-in accepts any key). The ping address on the
 * settings page shows PUBLIC_URL instead of BASE_URL. MOVIE_VOICE=0 makes a silent movie. MOVIE_OUT:
 * where the MP4 goes (default tests/docs/movie/out/Joomla-Supertext-Translation-install.mp4,
 * git-ignored). Needs ffmpeg; the voice needs Piper (pip install piper-tts).
 */
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MovieKit } from './movie/movie-kit.mjs'

const B = (process.env.BASE_URL || 'http://127.0.0.1:8092').replace(/\/$/, '')
const PUBLIC = process.env.PUBLIC_URL || 'https://joomla-production-096c.up.railway.app'
const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const out = process.env.MOVIE_OUT ?? here('movie/out/Joomla-Supertext-Translation-install.mp4')
const need = (name) => process.env[name] ?? (() => { throw new Error(`Set ${name}`) })()
const FAKE_KEY = 'st-demo-0000-0000-0000'
const version = fs.readFileSync(here('../../plugin/supertext.xml'), 'utf8').match(/<version>([^<]+)<\/version>/)[1]
const zip = here(`../../dist/plg_system_supertext-${version}.zip`)
if (!fs.existsSync(zip)) throw new Error(`Run ./build.sh first (${zip} is missing)`)

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'en-US' })
// At 1280 px Joomla's header buttons cover the page title: hide the two that have nothing to do with
// the plugin (guided tours, post-installation messages). Show the public demo's address in the ping URL.
await page.addInitScript(([local, pub]) => document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.header-item').forEach((el) => { if (/Take a Tour|Post Installation Messages/.test(el.textContent)) el.style.display = 'none' })
  document.querySelectorAll('.supertext-reporting code').forEach((c) => { c.textContent = c.textContent.replace(local, pub) })
}), [B, PUBLIC])

// Sign in as the demo administrator (not recorded): installing and configuring is an administrator's task.
await page.goto(`${B}/administrator/index.php`)
await page.fill('#mod-login-username', need('DEMO_ADMIN_EMAIL'))
await page.fill('#mod-login-password', need('DEMO_ADMIN_PASSWORD'))
await Promise.all([page.waitForNavigation(), page.click('#btn-login-submit')])
await page.waitForLoadState('networkidle')

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'joomla-movie-install-'))
await page.goto('about:blank')
const kit = await MovieKit.start(page, { workDir, assets: here('movie/assets'), voiceCache: here('movie/voice-cache') })

const ripple = () => page.evaluate(([x, y]) => window.__stk?.ripple(x, y), [kit.cursor.x, kit.cursor.y])
/** Clicks a link or button that loads a new page, keeping the cursor and caption (the loading is cut). */
async function go(locator) {
  await kit.moveTo(locator)
  await ripple()
  await kit.hold(250)
  kit.pause()
  await Promise.all([page.waitForNavigation(), locator.click()])
  await page.waitForLoadState('networkidle')
  await kit.sync()
  kit.resume()
}
const sidebar = (label) => page.locator('#sidebarmenu a, .main-nav a').filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) }).first()
const card = (heading, link) => page.locator('.card, .module-wrapper, section').filter({ has: page.getByRole('heading', { name: heading }) }).getByRole('link', { name: link, exact: true }).first()
/** More commands in the terminal kit.terminal() opened (same look; kit.terminal() would start a new one). */
async function typeMore(lines) {
  await page.evaluate(() => document.querySelector('#x > .p.c:last-child')?.remove())
  for (const l of lines) {
    if (l.cmd !== undefined) {
      await page.evaluate(() => { const x = document.getElementById('x')
        const p = document.createElement('span'); p.className = 'p'; p.textContent = '$ '; x.appendChild(p)
        const c = document.createElement('span'); c.className = 'c'; x.appendChild(c) })
      for (const ch of l.cmd) { await page.evaluate((ch) => { document.querySelector('#x .c').textContent += ch }, ch); await page.waitForTimeout(38) }
      await page.waitForTimeout(450)
      await page.evaluate(() => { document.querySelector('#x .c').classList.remove('c'); document.getElementById('x').append('\n') })
    } else {
      await page.evaluate((o) => { const s = document.createElement('span'); s.className = 'o'; s.textContent = o + '\n'; document.getElementById('x').appendChild(s) }, l.out ?? '')
      await page.waitForTimeout(l.wait ?? 180)
    }
  }
  await page.evaluate(() => { const c = document.createElement('span'); c.className = 'p c'; c.textContent = '$ '; document.getElementById('x').appendChild(c) })
}
const toolbar = (label) => page.locator('joomla-toolbar-button button, #toolbar button').filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) }).first()

// 1. Terminal: build the package (docs/INSTALLATION.md → 1. Install the plugin).
await kit.say('First, get the plugin from GitHub with git clone.', {
  caption: 'Get the plugin from <b>GitHub</b>',
  during: () => kit.terminal({ title: 'Joomla-Supertext-Translation', lines: [
    { cmd: 'git clone https://github.com/Supertext/Joomla-Supertext-Translation.git' },
    { out: "Cloning into 'Joomla-Supertext-Translation'..." },
  ] }),
})
await kit.say('Build the package with build dot S H. Or download the zip from the Releases page.', {
  caption: 'Build the zip: <b>./build.sh</b> (or download it from <b>Releases</b>)',
  during: () => typeMore([
    { cmd: 'cd Joomla-Supertext-Translation && ./build.sh' },
    { out: `dist/plg_system_supertext-${version}.zip` },
  ]),
})

// 2. Upload it: System → Install → Extensions (loading time cut).
kit.pause()
await page.goto(`${B}/administrator/index.php`)
await page.waitForLoadState('networkidle')
await kit.sync()
kit.resume()
await kit.say('In the Joomla administrator, open System, and under Install, click Extensions.', {
  caption: '<b>System → Install → Extensions</b>',
  during: async () => {
    await go(sidebar('System'))
    await kit.hold(300)
    await go(card('Install', 'Extensions'))
  },
})
const browse = page.getByText('Or browse for file').first()
await kit.say('Upload the zip under Upload Package File, and the plugin is installed.', {
  caption: '<b>Upload Package File</b>: the zip',
  during: async () => {
    await kit.moveTo(browse)
    await ripple()
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), browse.click()])
    await kit.hold(400)
    kit.pause() // uploading and installing is cut
    await Promise.all([page.waitForNavigation({ timeout: 120_000 }), chooser.setFiles(zip)])
    await page.waitForLoadState('networkidle')
    await kit.sync()
    kit.resume()
    await kit.caption('<b>Installation of the plugin was successful.</b>')
    await kit.moveTo(page.getByText('Installation of the plugin was successful').first())
  },
})

// 3. The site's own language setup (already done in the demo).
await kit.say('Supertext translates into your content languages: here English, German, French and Italian.', {
  caption: 'Your content languages: <b>System → Content Languages</b>',
  during: async () => {
    await go(sidebar('System'))
    await kit.hold(200)
    await go(card('Manage', 'Content Languages'))
    await kit.moveTo(page.locator('table.table tbody tr').first())
  },
})

// 4. The plugin's settings: System → Manage → Plugins.
await kit.say('Now the plugin settings: System, Manage, Plugins.', {
  caption: '<b>System → Manage → Plugins</b>',
  during: async () => {
    await go(sidebar('System'))
    await kit.hold(200)
    await go(card('Manage', 'Plugins'))
  },
})
await kit.say('Search for Supertext, and open System, Supertext Translation.', {
  caption: 'Search <b>Supertext</b>, open <b>System - Supertext Translation</b>',
  during: async () => {
    await kit.type(page.locator('#filter_search'), 'Supertext Translation')
    await Promise.all([page.waitForNavigation(), page.locator('#filter_search').press('Enter')])
    await page.waitForLoadState('networkidle')
    await kit.sync()
    await go(page.locator('a', { hasText: 'System - Supertext Translation' }).first())
  },
})
const status = page.locator('#jform_enabled')
await kit.say('Set the status to Enabled, and save.', {
  caption: '<b>Status</b>: <b>Enabled</b>, then <b>Save</b>',
  during: async () => {
    await kit.moveTo(status)
    await ripple()
    await status.selectOption('1')
    await kit.sync()
    await kit.hold(500)
    await go(toolbar('Save'))
  },
})

// 5. The API key.
await kit.say('Generate your API key at supertext.com, under Integrations, A P I. No account yet? Create one at supertext.com.', {
  caption: 'API key: <b>supertext.com → Integrations → API</b> (Admin role)<br>No account yet? Create one at <b>supertext.com</b>',
  during: async () => { await kit.hold(500); await kit.moveTo(page.locator('#jform_params_api_key')) },
})
const check = page.locator('joomla-alert, .alert', { hasText: 'API key checked' }).first()
await kit.say('Click Modify, paste your key, and save. Saving checks the key with Supertext: the connection works.', {
  caption: 'Click <b>Modify</b>, paste the key, <b>Save</b>: <b>the connection to Supertext works</b>',
  during: async () => {
    await kit.click(page.locator('#jform_params_api_key_lock'))
    await page.locator('#jform_params_api_key').pressSequentially(FAKE_KEY, { delay: 45 })
    await kit.hold(300)
    await go(toolbar('Save'))
    await check.waitFor()
    await kit.moveTo(check)
  },
})

// 6. The language mapping.
const tab = page.getByRole('tab', { name: 'Languages' })
const code = (tag) => page.locator(`select[name="jform[params][languages][${tag}][code]"]`)
await kit.say('On the Languages tab, every content language has its Supertext language, already preselected.', {
  caption: '<b>Languages</b> tab: a <b>Supertext language</b> per content language',
  during: async () => {
    await kit.click(tab)
    await page.locator('table.supertext-mapping').waitFor()
    await kit.hold(400)
    await kit.moveTo(code('de-CH'))
  },
})
await kit.say('Pick another variant where you need one. Here, French goes to Swiss French.', {
  caption: 'French: <b>French (Switzerland) (fr-CH)</b>',
  during: async () => {
    await kit.moveTo(code('fr-FR'))
    await ripple()
    await code('fr-FR').selectOption('fr-CH')
    await kit.sync()
  },
})
const review = page.locator('table.supertext-mapping tr', { hasText: 'de-CH' }).locator('input[type=checkbox], .switcher, label').last()
await kit.say('Translation review can be switched on per language. We leave it off. Then save.', {
  caption: '<b>Translation review</b>: optional, per language (left off) – click <b>Save</b>',
  during: async () => {
    await kit.moveTo(review)
    await kit.hold(1200)
    await go(toolbar('Save'))
  },
})

// 7. Where editors find it.
await kit.say("That's it. Editors now find the Supertext button in Content, Articles, and in the article editor.", {
  caption: 'Done: editors find <b>Supertext</b> in <b>Content → Articles</b>',
  during: async () => {
    kit.pause() // closing the settings and loading the articles is cut
    await toolbar('Close').click()
    await page.waitForLoadState('networkidle')
    await page.goto(`${B}/administrator/index.php?option=com_content&view=articles`)
    await page.waitForLoadState('networkidle')
    await kit.sync()
    kit.resume()
    await kit.moveTo(page.locator('.supertext-open').first())
  },
  after: 600,
})
await kit.caption('')

fs.mkdirSync(path.dirname(out), { recursive: true })
await kit.finish(out, { system: 'Joomla', repo: 'Joomla-Supertext-Translation', kind: 'install' })
await browser.close()
fs.rmSync(workDir, { recursive: true, force: true })
console.log(`Saved ${out}`)
