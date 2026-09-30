---
kind: thread
id:
version: 0
note: devlog 1, hello blygverse
stub_of: https://github.com/aneeshsathe/blygger-desktop
---

# Hello blygverse! Here is my devlog

Hello, blygverse. This is the first post on the new Pioneering Spirit, and it is fitting that the first thing a blyg says is a note about how the blyg came to be. I plan to keep this devlog running as a single living thread, editing it as the build goes on, so if you are reading a later version, the bones of this one are still underneath. This is version one, and it covers everything it has taken to get set up so far.

For a few years I wrote Pioneering Spirit on Paragraph, and my first instinct was to keep doing that and simply mirror the posts into a blyg every night. I changed my mind. A mirror would have made the blyg a shadow of the old site, when the whole point of the medium is to write in a new way. So I started a fresh fork instead. Everything I wrote before, along with *A New California Dream* and the Stag Hunt salons, is meant to live in a private corpus beside the blyg, where it can serve less as an archive than as a sparring partner. Passages will come into the blyg one quotation at a time, whenever I find myself in conversation with them again, and the old posts will stay online at their original addresses, because breaking links seems like a poor way to begin a project about stewardship.

## What a blyg is, briefly

Blygger is a protocol for writing in public on your own domain, and it grew out of the work of Venkatesh Rao and the Protocol Institute. A blyg is a directory of static files and an RSS feed, so any feed reader can follow it and any file host can serve it. On top of that sit a few ideas I find genuinely exciting. Short **fragments** hold single ideas. Long **threads** are essays built partly out of fragments, and every edit publishes a new version rather than freezing the old one. **Transclusion** lets a thread quote another post, mine or someone else's, as a snapshot with its provenance intact, which is the closest thing I have seen to Ted Nelson's old dream of intertwingled writing. A **stub** is a post that says, in effect, "I am responding to that," and politely lets the other author know. This post is a stub, and the paragraphs below explain whom it is responding to.

## How the build went

The setup took a few long evenings with Claude as a collaborator. We started from the reference implementation of Blygger, a Cloudflare Worker that ships with a private studio for writing, subscriptions for reading other blygs, and an AI helper that fills in marked gaps and discloses that it did so. We kept that code untouched, pinned to a specific upstream commit so that upgrading is a clean overwrite, and wrapped it with the things specific to me. Those are a configuration for my domain and my database, a folder for the corpus, a small command-line tool so that I can draft in plain text files and publish from wherever I happen to be writing, and a script that will serve my old Paragraph posts as static pages at their original addresses.

Deployment was the usual comedy of errors, each one instructive. The first build failed because the configuration still held placeholder text where my Cloudflare account number belonged. The second got the code uploaded and the database connected, then stopped because my domain did not yet live on Cloudflare. I also started out with a GitHub Actions workflow for deploys and then dropped it in favor of Cloudflare Workers Builds, which watches the repository and redeploys on every push to the main branch. For now the blyg runs at a temporary workers.dev address while the domain moves over, which feels right for a project whose motto might as well be "building in public, including the scaffolding."

A quieter decision sits underneath all of that, which is that I drafted the rules for working in this repository into a file that Claude reads at the start of every session. It says never to edit the upstream copy, never to pin a version unless I ask, and never to publish without my saying so in the current conversation, because publishing is public and permanent in spirit. Writing those rules down felt a lot like writing the operating agreement for a shared canal, and I suspect I will keep refining them as I learn where the friction is.

## The part I am most excited about: conversation

What draws me to this medium is not the publishing. It is the promise that reading and writing can become one continuous conversation again. Most of the web has pulled those two acts apart. We read in one place, react with a like or a quick reply in another, and do our real writing somewhere else entirely, if we do it at all. A blyg stitches them back together. You subscribe to other people's blygs and feeds, sort what arrives into private hoppers, and when something moves you, you answer by writing. A quote carries the other person's words into your own post with their provenance intact, and a stub tells them you have responded. Nobody counts followers, and there are no likes to chase. There is only the slower, older pleasure of people thinking out loud in each other's company.

Ivan Illich called tools like that convivial, meaning tools that widen what people can do together rather than doing it for them, and that word has stuck with me all week. I spend my working life thinking about shared infrastructure, the pipes and canals and institutions that let a region live together, and this feels like the same instinct applied to ideas. A good conversation is a commons. It only works when everyone brings something and leaves something behind.

The best version of that experience I have found so far is Blygger Desktop, a native app by Aneesh Sathe, which he describes as

> A native macOS studio for Blygger blogs ("blygs"), built to be as fast as Notational Velocity.

It keeps your reading list and your drafts in one window, so the distance between reading something good and writing back to it is a single keystroke. That short distance is the whole point.

## A Windows port of Blygger Desktop

I spend most of my days on Windows, so I set out to bring that same read-and-write experience to Windows by building on Aneesh's work rather than beside it. His app is written in Rust with a mostly platform-neutral core, so the port turned out to be careful plumbing more than reinvention. I imported the app verbatim into a `desktop/` folder, and every change I made is gated to Windows, so the macOS build stays exactly as he wrote it. The changes are listed in a single file so that they can be offered back upstream as a contribution, which is itself a small act of the conviviality I keep going on about.

In practice the port meant a WebView2 surface for the preview and the editor, `Ctrl` in place of `⌘` for every shortcut, a Menu button because Windows has no global menu bar, the right folders for configuration and media, and the Windows Credential Manager for the owner token. The repository now builds and tests the app on both Windows and macOS on every change, and it published a first Windows release, `desktop-v0.3.0-win1`, as a zip on GitHub. I should be honest about where that stands. The build is unsigned, so Windows SmartScreen will ask you to click through once, there is no installer or auto-update yet, and although it compiles and passes its tests, it has not yet seen much use on real Windows machines. If you try it and something looks wrong, I would love to hear about it.

To make the desktop app and my blyg talk to each other, I also added a thin layer in front of the reference Worker that gives the app an owner-only API, with bearer-token sign-in, JSON reads of items and subscriptions and the reading list, read-state that syncs between devices, and a way to record which spans were written by AI. It wraps the upstream code without touching it. Aneesh's own end-to-end suite passes 21 of its 22 tests against it. The one failure traces to a small bug in the reference Worker, where generated text containing certain dollar-sign patterns gets misread as a replacement instruction, and the fix is a one-line change that belongs upstream rather than here.

## What comes next

The next steps are to move the domain, export the Paragraph archive, bring in the book, and start quoting old passages into fragments so that new threads can argue with them. Then comes the reading side in earnest: subscribing to the blygs and feeds I want to be in conversation with, publishing a blogroll so others can find them too, and getting the Windows app into daily use so that the rough edges show themselves. I will log each of these here as they happen, and I expect some of them to go as smoothly as the first deploy did, which is to say educationally.

If you run a blyg, I would love to read it, and I would love even more to write back. If you are reading this in a plain RSS reader, welcome. That works too, which is exactly the point, and I hope you will consider starting a blyg of your own so that the conversation can run in both directions.
