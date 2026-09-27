---
kind: thread
id:
version: 0
note: hello, world
stub_of: https://github.com/aneeshsathe/blygger-desktop
---

# patwater blyg devlog 0: hello, world

Hello, world. This is the first post on the new Pioneering Spirit, and it is fitting that the first thing a blyg says is a note about how the blyg came to be. I plan to keep this devlog running as a single living thread, editing it as the build goes on, so if you are reading a later version, the bones of this one are still underneath.

For a few years I wrote Pioneering Spirit on Paragraph, and my first instinct was to keep doing that and simply mirror the posts into a blyg every night. I changed my mind. A mirror would have made the blyg a shadow of the old site, when the whole point of the medium is to write in a new way. So I started a fresh fork instead. Everything I wrote before, along with *A New California Dream* and the Stag Hunt salons, now lives in a private corpus beside the blyg. It is less an archive than a sparring partner, and passages from it will come into the blyg one quotation at a time, whenever I find myself in conversation with them again. The old posts also stay online at their original addresses, because breaking links seems like a poor way to begin a project about stewardship.

## What a blyg is, briefly

Blygger is a protocol for writing in public on your own domain, and it grew out of the work of Venkatesh Rao and the Protocol Institute. A blyg is just a directory of static files and an RSS feed, so any feed reader can follow it and any file host can serve it. On top of that sit a few ideas I find genuinely exciting. Short **fragments** hold single ideas. Long **threads** are essays built partly out of fragments, and every edit publishes a new version rather than freezing the old one. **Transclusion** lets a thread quote another post, mine or someone else's, as a snapshot with its provenance intact, which is the closest thing I have seen to Ted Nelson's old dream of intertwingled writing. A **stub** is a post that says, in effect, "I am responding to that," and politely lets the other author know. This post is a stub, and the paragraphs below explain whom it is responding to.

## How the build went

The setup took one long evening with Claude as a collaborator. We started from the reference implementation of Blygger, a Cloudflare Worker that ships with a private studio for writing, subscriptions for reading other blygs, and an AI helper that fills in marked gaps and discloses that it did so. We kept that code untouched and wrapped it with the things specific to me: a configuration for my domain, a folder for the corpus, a small command-line tool so I can draft in plain text files and publish from wherever I happen to be writing, and a script that serves my old Paragraph posts as static pages.

Deployment was the usual comedy of errors, each one instructive. The first build failed because the configuration still held the placeholder text where my Cloudflare account number belonged. The second got the code uploaded and the database connected, then stopped because my domain did not yet live on Cloudflare. So for now this blyg runs at a temporary workers.dev address while the domain moves over, which feels right for a project whose motto might as well be "building in public, including the scaffolding."

## The ambition: one place to read and write

The part I am most excited about is the reading. A blyg is meant to be both a publication and a reader, since you subscribe to other blygs, sort what arrives into private collections called hoppers, and respond by writing rather than by liking. The best version of that experience I have found is Blygger Desktop, a native app by Aneesh Sathe, which he describes as

> A native macOS studio for Blygger blogs ("blygs"), built to be as fast as Notational Velocity.

It holds your reading list and your drafts in one window, so the distance between reading something good and writing back to it is a keystroke. I spend most of my days on Windows, though, and so the ambition I am setting down here is to help bring that same read-and-write experience to Windows by building on Aneesh's work rather than beside it. His app is written in Rust with a mostly platform-neutral core, so the port looks like careful plumbing more than reinvention, and the right way to do it is as a contribution back to his project.

TODO: once subscribed to Aneesh's blyg in the studio, replace this line with ![[his-post-id]] on its own line, so his own words about Blygger Desktop are transcluded here.

## What comes next

The next steps are to move the domain, export the Paragraph archive, bring in the book, and start quoting old passages into fragments so that new threads can argue with them. After that comes the Windows work. I will log each of these here as they happen, and I expect some of them to go as smoothly as the first deploy did, which is to say educationally.

If you run a blyg, I would love to read it. And if you are reading this in a plain RSS reader, welcome. That works too, which is exactly the point.
