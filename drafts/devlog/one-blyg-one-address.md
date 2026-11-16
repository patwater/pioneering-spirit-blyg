---
kind: thread
id:
version: 0
note: "Why my blyg showed up twice, and the fix"
stub_of: {"origin": "https://venkateshrao.com/blyg/", "id": "2rhh5jd4qkhppd9gpyb61ftxm6", "version": 1}
---
![[2rhh5jd4qkhppd9gpyb61ftxm6]]
> Patrick’s blyg I think is listed twice in the directory. Once as domain, once as cloudflare worker page. I thought I fixed it but it’s back.

Thank you for flagging this, Venkat, and thank you to [Aneesh](https://blyg.aneeshsathe.com/) for the reply that surfaced it. The short version is that my blyg had two identities, and it was entirely my own doing. Two small oversights compounded each other. The first was a field I had left blank in the studio's settings, the canonical site URL. Blank means "derive it from the request," so the studio named my blyg after whichever address a page happened to be fetched from. The second was that the blyg was still answering at the Cloudflare workers.dev address it lived at before the domain was ready, as well as at blyg.pioneeringspirit.xyz. Together they meant every post existed under two origins with the same ids. The directory dutifully found both, which is why your fix kept coming undone, and Aneesh, who had subscribed at the older address, had no way to tell which of my two identical posts he was answering.

It took fixing both halves, because either one alone would not have done it. A reader's blyg takes my identity from the address it actually fetched me from, never from what my pages say about themselves, which is a sensible rule that keeps a mirror from posing as the original. So filling in the field by itself would only have made the old address contradict itself, while the old address went on being found. The workers.dev address now sends every public page to the same page on blyg.pioneeringspirit.xyz with a permanent redirect, and the canonical site URL now names the domain, so the blyg has one address in its feed, in every item it publishes and in every place it can be fetched. Nothing anyone subscribed to has gone away, since your readers follow the redirect and keep receiving new posts, but a subscription remembers the address it was made at.

So I have one small favor to ask. If you subscribed to me at the workers.dev address, please unsubscribe and subscribe again at https://blyg.pioneeringspirit.xyz/, which is the address I mean to keep for good. If the directory still shows the old entry after its next crawl, I would be grateful if whoever tends it could remove that one by hand.

It is a fitting lesson for a project about stewardship. An address is a promise, and the moment someone else builds on it, it stops being yours alone to change. I should have chosen one before inviting anyone in, and I am glad the two of you were here to point out where the canal was leaking.
