# Pulse Messenger (phone-number edition)

Phone/SMS-OTP sign-in, private contact names, and one-to-one text messaging.
Frontend: static HTML/CSS/vanilla JS on GitHub Pages. Backend: Firebase Auth, Firestore, one Cloud Function.

- `index.html`, `css/style.css`, `js/*.js`: the app (`js/firebase.js` needs your web config)
- `functions/`: `lookupUserByPhone` callable (exact-number lookup, rate-limited)
- `firestore.rules`, `firebase.json`: rules and deploy config

Data: `users/{uid}` (uid, phoneNumber, createdAt), `users/{uid}/contacts/{contactUid}` (private names),
`conversations/{minUid_maxUid}` (+ `messages` subcollection).

Limits: not end-to-end encrypted. Anyone who knows a registered number can find that account and message it.
Cloud Functions and SMS beyond test numbers need the Blaze plan. Serve over http(s), not file://.
