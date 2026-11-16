---
kind: thread
id:
version: 0
note: "Why my blyg showed up twice, and the fix"
stub_of: {"origin": "https://venkateshrao.com/blyg/", "id": "2rhh5jd4qkhppd9gpyb61ftxm6", "version": 1}
---
![[2rhh5jd4qkhppd9gpyb61ftxm6]]
> Patrick’s blyg I think is listed twice in the directory. Once as domain, once as cloudflare worker page. I thought I fixed it but it’s back.

Thank you for flagging this, Venkat, and thank you to [Aneesh](https://blyg.aneeshsathe.com/) for the reply that surfaced it. The short version is that my blyg had two identities, and it was entirely my own doing. A blyg names itself by the address its pages are served from, and mine was being served from two addresses at once: the domain, blyg.pioneeringspirit.xyz, and the Cloudflare workers.dev address it lived at before the domain was ready. I had never told the studio which of the two was the real one, so every post existed under both origins with the same ids. The directory dutifully found both, which is why your fix kept coming undone, and Aneesh, who had subscribed at the older address, had no way to tell which of my two identical posts he was answering.

The fix is now live. The workers.dev address no longer serves the blyg's public pages and instead sends every request to the same page on blyg.pioneeringspirit.xyz with a permanent redirect, and the studio now names the domain as the blyg's one address in its feed and in every item it publishes. Nothing anyone subscribed to has gone away, since your readers follow the redirect and keep receiving new posts, but a subscription remembers the address it was made at.

So I have one small favor to ask. If you subscribed to me at the workers.dev address, please unsubscribe and subscribe again at https://blyg.pioneeringspirit.xyz/, which is the address I mean to keep for good. If the directory still shows the old entry after its next crawl, I would be grateful if whoever tends it could remove that one by hand.

It is a fitting lesson for a project about stewardship. An address is a promise, and the moment someone else builds on it, it stops being yours alone to change. I should have chosen one before inviting anyone in, and I am glad the two of you were here to point out where the canal was leaking.
